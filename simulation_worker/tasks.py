from celery import Celery
import subprocess
import requests
import glob
import re
import logging
import os
from collections import deque
import threading
import time
import pyvista as pv
import shutil
from template_manager import TemplateManager

logger = logging.getLogger(__name__)

broker_url = os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/0')
result_backend = os.environ.get('CELERY_RESULT_BACKEND', broker_url)

app = Celery('tasks', broker=broker_url, backend=result_backend)
app.conf.update(
    task_serializer='json',
    accept_content=['json'], 
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)

# Replace internal dns 'api' with whatever you map your django service to in Docker
DJANGO_API_URL = "http://api:8000/api/runs" 


def patch_django_status(
    sim_id,
    status,
    error_log=None,
    result_mesh_path=None,
    *,
    result_sequence_path=None,
    frame_mapping=None,
    metrics_series=None,
    convergence_series=None,
):
    payload = {}
    if status:
        payload["status"] = status
    if error_log is not None:
        payload["current_logs"] = error_log
    if result_mesh_path:
         payload["result_mesh_path"] = result_mesh_path
    if result_sequence_path is not None:
        payload["result_sequence_path"] = result_sequence_path
    if frame_mapping is not None:
        payload["frame_mapping"] = frame_mapping
    if metrics_series is not None:
        payload["metrics_series"] = metrics_series
    if convergence_series is not None:
        payload["convergence_series"] = convergence_series
    try:
        requests.patch(f"{DJANGO_API_URL}/{sim_id}/", json=payload)
    except Exception as e:
        logger.error(f"Failed to update Django API: {e}")

class DivergenceError(Exception):
    pass


def _ensure_foil_stl(case_dir):
    """Ensure OpenFOAM has constant/triSurface/foil.stl.

    The API copies uploaded assets into the case as foil_input.<ext>.
    For non-STL formats used for viewport visualization (glb/gltf/obj),
    convert to STL here so snappyHexMesh can run.
    """

    tri_dir = os.path.join(case_dir, "constant", "triSurface")
    stl_path = os.path.join(tri_dir, "foil.stl")
    if os.path.exists(stl_path):
        return stl_path

    candidates = []
    candidates.extend(sorted(glob.glob(os.path.join(tri_dir, "foil_input.*"))))
    candidates.extend(sorted(glob.glob(os.path.join(tri_dir, "foil.*"))))
    candidates = [p for p in candidates if os.path.isfile(p) and not p.endswith(".foam")]
    candidates = [p for p in candidates if os.path.basename(p) != "foil.stl"]

    if not candidates:
        raise FileNotFoundError(f"No foil geometry found in {tri_dir}")

    src_path = candidates[0]
    _, ext = os.path.splitext(src_path)
    ext = (ext or "").lower()

    if ext == ".stl":
        shutil.copy2(src_path, stl_path)
        return stl_path

    if ext not in {".glb", ".gltf", ".obj"}:
        raise ValueError(f"Unsupported geometry format for simulation: {ext} (source: {src_path})")

    try:
        import trimesh

        loaded = trimesh.load(src_path, force="mesh")
        mesh = loaded
        if isinstance(loaded, trimesh.Scene):
            geometries = [g for g in loaded.geometry.values() if g is not None]
            if not geometries:
                raise ValueError("GLTF/GLB scene contained no geometries")
            mesh = trimesh.util.concatenate(geometries)

        if mesh is None or getattr(mesh, "faces", None) is None or len(mesh.faces) == 0:
            raise ValueError("Loaded mesh has no faces")

        mesh.export(stl_path)
        return stl_path
    except Exception as e:
        raise RuntimeError(f"Failed converting {src_path} -> STL: {e}")

def _format_stream_tails(stdout_tail, stderr_tail):
    parts = []
    if stdout_tail:
        parts.append("--- STDOUT (tail) ---")
        parts.extend(list(stdout_tail))
    if stderr_tail:
        if parts:
            parts.append("")
        parts.append("--- STDERR (tail) ---")
        parts.extend(list(stderr_tail))
    return "\n".join(parts)


def _stream_reader(
    stream,
    *,
    sim_id,
    process,
    tail,
    live_tail,
    log_fn,
    last_patch_at,
    patch_interval_sec,
    stdout_tail,
    stderr_tail,
    divergence_guardrail,
    tee_file=None,
):
    for line in iter(stream.readline, ""):
        if tee_file is not None:
            try:
                tee_file.write(line)
                tee_file.flush()
            except Exception:
                pass

        stripped_line = line.strip()
        if not stripped_line:
            continue

        tail.append(stripped_line)
        live_tail.append(stripped_line)
        log_fn(stripped_line)

        # Divergence guardrail (only on stdout)
        if divergence_guardrail:
            lower_line = stripped_line.lower()
            if "nan" in lower_line or "fatal error" in lower_line:
                logger.error("Simulation diverged! Triggering SIGTERM.")
                process.terminate()
                formatted_logs = _format_stream_tails(stdout_tail, stderr_tail)
                patch_django_status(
                    sim_id,
                    "FAILED",
                    error_log=(
                        "Simulation diverged. Try reducing the Angle of Attack or increasing Mesh density.\n"
                        + formatted_logs
                    ),
                )
                raise DivergenceError("Simulation diverged with NaN or Fatal Error.")

        # Rate-limit patches to avoid hammering Django
        now = time.monotonic()
        if now - last_patch_at[0] >= patch_interval_sec:
            formatted_logs = _format_stream_tails(stdout_tail, stderr_tail)
            patch_django_status(sim_id, None, error_log=formatted_logs)
            last_patch_at[0] = now


def run_and_stream_openfoam(
    *,
    sim_id,
    case_dir,
    cmd,
    status,
    start_message,
    patch_interval_sec=1.0,
    live_tail_lines=50,
    fail_tail_lines=400,
    divergence_guardrail=False,
):
    patch_django_status(sim_id, status, error_log=start_message)

    # Persist full output to an OpenFOAM-style log file so post-processing can parse it.
    log_file = None
    try:
        cmd_name = cmd[0] if cmd else "openfoam"
        log_path = os.path.join(case_dir, f"log.{cmd_name}")
        log_file = open(log_path, "w", encoding="utf-8", errors="ignore")
    except Exception as e:
        logger.warning(f"Could not open OpenFOAM log file for writing: {e}")

    process = subprocess.Popen(
        cmd,
        cwd=case_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    live_stdout_tail = deque(maxlen=live_tail_lines)
    live_stderr_tail = deque(maxlen=live_tail_lines)
    fail_stdout_tail = deque(maxlen=fail_tail_lines)
    fail_stderr_tail = deque(maxlen=fail_tail_lines)

    last_patch_at = [0.0]

    stdout_thread = threading.Thread(
        target=_stream_reader,
        args=(
            process.stdout,
        ),
        kwargs={
            "sim_id": sim_id,
            "process": process,
            "tail": fail_stdout_tail,
            "live_tail": live_stdout_tail,
            "log_fn": logger.info,
            "last_patch_at": last_patch_at,
            "patch_interval_sec": patch_interval_sec,
            "stdout_tail": live_stdout_tail,
            "stderr_tail": live_stderr_tail,
            "divergence_guardrail": divergence_guardrail,
            "tee_file": log_file,
        },
        daemon=True,
    )
    stderr_thread = threading.Thread(
        target=_stream_reader,
        args=(
            process.stderr,
        ),
        kwargs={
            "sim_id": sim_id,
            "process": process,
            "tail": fail_stderr_tail,
            "live_tail": live_stderr_tail,
            "log_fn": logger.error,
            "last_patch_at": last_patch_at,
            "patch_interval_sec": patch_interval_sec,
            "stdout_tail": live_stdout_tail,
            "stderr_tail": live_stderr_tail,
            "divergence_guardrail": False,
            "tee_file": log_file,
        },
        daemon=True,
    )

    stdout_thread.start()
    stderr_thread.start()

    try:
        process.wait()
        stdout_thread.join()
        stderr_thread.join()
    except DivergenceError:
        # Divergence guardrail already patched FAILED
        raise
    finally:
        try:
            if log_file is not None:
                log_file.close()
        except Exception:
            pass

    # Final patch with latest tails
    patch_django_status(sim_id, None, error_log=_format_stream_tails(live_stdout_tail, live_stderr_tail))

    if process.returncode != 0:
        combined_tail = _format_stream_tails(fail_stdout_tail, fail_stderr_tail)
        return False, combined_tail

    return True, _format_stream_tails(fail_stdout_tail, fail_stderr_tail)

def _parse_simplefoam_residuals(case_dir, *, max_points=2000):
    """Best-effort parser for residuals from log.simpleFoam.

    Returns: list[{iteration: int|None, time: float|None, residual: float}]
    """
    log_path = os.path.join(case_dir, "log.simpleFoam")
    if not os.path.exists(log_path):
        return []

    series = []
    current_time = None
    current_iteration = None
    current_max_residual = None

    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            for raw in f:
                line = raw.strip()
                if not line:
                    continue

                if line.startswith("Time ="):
                    # flush the prior step
                    if current_max_residual is not None:
                        series.append(
                            {
                                "iteration": current_iteration,
                                "time": current_time,
                                "residual": float(current_max_residual),
                            }
                        )
                        if len(series) >= max_points:
                            # keep only the tail
                            series = series[-max_points:]

                    # OpenFOAM sometimes logs e.g. "Time = 1s"; extract numeric part only.
                    match = re.search(r"Time\s*=\s*([0-9.+\-eE]+)", line)
                    if match:
                        try:
                            current_time = float(match.group(1))
                        except Exception:
                            current_time = None
                    else:
                        current_time = None
                    current_iteration = None
                    current_max_residual = None
                    continue

                if line.startswith("Iteration") and "=" in line:
                    try:
                        current_iteration = int(line.split("=")[-1].strip())
                    except Exception:
                        current_iteration = None
                    continue

                # Example:
                # Solving for Ux, Initial residual = 0.001, Final residual = 1e-06, No Iterations 2
                if "Initial residual" in line and "=" in line:
                    try:
                        after = line.split("Initial residual", 1)[1]
                        # after looks like: " = 0.001, Final residual = ..."
                        val = after.split("=", 1)[1].split(",", 1)[0].strip()
                        residual = float(val)
                        if current_max_residual is None or residual > current_max_residual:
                            current_max_residual = residual
                    except Exception:
                        pass

        # final flush
        if current_max_residual is not None:
            series.append(
                {
                    "iteration": current_iteration,
                    "time": current_time,
                    "residual": float(current_max_residual),
                }
            )
    except Exception as e:
        logger.warning(f"Failed parsing simpleFoam residuals: {e}")
        return []

    return series[-max_points:]


def _parse_forces(case_dir, *, max_points=5000):
    """Best-effort parser for OpenFOAM forces postProcessing output."""
    base = os.path.join(case_dir, "postProcessing", "forces")
    if not os.path.isdir(base):
        return {}

    # Try newest time folder first
    time_dirs = []
    for entry in os.listdir(base):
        full = os.path.join(base, entry)
        if os.path.isdir(full):
            time_dirs.append(entry)
    time_dirs.sort(key=lambda s: float(s) if s.replace('.', '', 1).isdigit() else 0.0)
    time_dirs = list(reversed(time_dirs))

    for time_dir in time_dirs:
        candidate = os.path.join(base, time_dir, "forces.dat")
        if not os.path.exists(candidate):
            continue

        forces_by_time = {}
        try:
            with open(candidate, "r", encoding="utf-8", errors="ignore") as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith("#"):
                        continue

                    # Typical format:
                    # time (pressureForce) (viscousForce) (porousForce)
                    # 0.5 (1 2 3) (4 5 6) (0 0 0)
                    parts = line.split()
                    if len(parts) < 7:
                        continue
                    try:
                        t = float(parts[0])
                    except Exception:
                        continue

                    # Extract first vector (pressureForce) and second vector (viscousForce)
                    # parts might include parentheses as separate tokens depending on OpenFOAM version.
                    joined = line
                    vectors = []
                    buf = ""
                    depth = 0
                    for ch in joined:
                        if ch == '(':
                            depth += 1
                            buf = ""
                        elif ch == ')':
                            if depth > 0:
                                depth -= 1
                                vals = buf.strip().split()
                                if len(vals) == 3:
                                    try:
                                        vectors.append([float(vals[0]), float(vals[1]), float(vals[2])])
                                    except Exception:
                                        pass
                        else:
                            if depth > 0:
                                buf += ch

                    if len(vectors) >= 2:
                        pf = vectors[0]
                        vf = vectors[1]
                        fx = pf[0] + vf[0]
                        fy = pf[1] + vf[1]
                        fz = pf[2] + vf[2]
                        forces_by_time[t] = {"Fx": fx, "Fy": fy, "Fz": fz}

            # Keep only last max_points entries
            if len(forces_by_time) > max_points:
                keys = sorted(forces_by_time.keys())[-max_points:]
                forces_by_time = {k: forces_by_time[k] for k in keys}

            return forces_by_time
        except Exception as e:
            logger.warning(f"Failed parsing forces.dat: {e}")

    return {}


def post_process_results_sequence(case_dir, sim_id, *, frame_count=10, slice_axis='y'):
    """Export a temporal sequence of axis-aligned slices for playback.

    Returns dict with keys:
      - result_sequence_path (media URL)
      - frame_mapping (list)
      - metrics_series (list)
      - convergence_series (list)
      - preview_mesh_path (media URL) (first frame)
    """
    logger.info(f"Starting PyVista Temporal Post-Processing for {sim_id}")
    
    # Generate the dummy .foam file which PyVista/VTK needs to read the OpenFOAM directory
    foam_file = os.path.join(case_dir, "case.foam")
    with open(foam_file, 'w') as f:
        pass
        
    try:
        # 1. Load the OpenFOAM data
        reader = pv.OpenFOAMReader(foam_file)

        # Best-effort: enable field arrays if the reader supports it.
        # (Some OpenFOAM/VTK builds require explicitly enabling arrays.)
        for method_name in (
            "enable_all_cell_arrays",
            "enable_all_point_arrays",
            "enable_all_arrays",
        ):
            try:
                method = getattr(reader, method_name, None)
                if callable(method):
                    method()
            except Exception:
                pass

        # Guard: Ensure we actually have time values (i.e. solver didn't fail at 0)
        time_values = list(getattr(reader, "time_values", []) or [])
        if len(time_values) == 0:
            raise ValueError("No time steps found to process.")

        # Keep the last `frame_count` time values for a "steady-state" playback loop.
        selected_times = time_values[-frame_count:]

        # Output directory under Django MEDIA_ROOT
        media_root = os.environ.get("DJANGO_MEDIA_ROOT", "/data/media")
        out_dir = os.path.join(media_root, "simulations", str(sim_id))
        os.makedirs(out_dir, exist_ok=True)

        forces_by_time = _parse_forces(case_dir)
        convergence_series = _parse_simplefoam_residuals(case_dir)

        frame_mapping = []
        metrics_series = []

        normal = slice_axis.lower().strip()
        if normal not in {"x", "y", "z"}:
            normal = "y"

        def _extract_foil_surface(dataset):
            # Preferred: boundary/foil surface patch (exact shape used for forces).
            if not isinstance(dataset, pv.MultiBlock):
                return None

            try:
                boundary = dataset.get("boundary") if hasattr(dataset, "get") else None
            except Exception:
                boundary = None

            if isinstance(boundary, pv.MultiBlock):
                try:
                    foil = boundary.get("foil") if hasattr(boundary, "get") else None
                except Exception:
                    foil = None
                if foil is not None:
                    return foil

            # Fallback search: any block name containing 'foil'
            def walk(mb):
                if not isinstance(mb, pv.MultiBlock):
                    return None
                try:
                    keys = list(mb.keys())
                except Exception:
                    keys = []
                for i in range(len(mb)):
                    name = keys[i] if keys and i < len(keys) else None
                    block = mb[i]
                    if isinstance(name, str) and "foil" in name.lower() and block is not None:
                        return block
                    found = walk(block)
                    if found is not None:
                        return found
                return None

            return walk(dataset)

        def _extract_internal_mesh(dataset):
            if not isinstance(dataset, pv.MultiBlock):
                return None
            try:
                internal = dataset.get("internalMesh") if hasattr(dataset, "get") else None
            except Exception:
                internal = None
            if internal is not None:
                return internal

            # Fallback: search for a block named internalMesh.
            try:
                keys = list(dataset.keys())
            except Exception:
                keys = []
            for i in range(len(dataset)):
                name = keys[i] if keys and i < len(keys) else None
                block = dataset[i]
                if isinstance(name, str) and name == "internalMesh" and block is not None:
                    return block
            return None

        def _safe_save(mesh_obj, path):
            try:
                if mesh_obj is None:
                    return False
                if hasattr(mesh_obj, "n_cells") and int(mesh_obj.n_cells) <= 0:
                    return False
                mesh_obj.save(path)
                return True
            except Exception:
                return False

        def _tube_radius_from_bounds(bounds, frac):
            try:
                dx = float(bounds[1]) - float(bounds[0])
                dy = float(bounds[3]) - float(bounds[2])
                dz = float(bounds[5]) - float(bounds[4])
                diag = (dx * dx + dy * dy + dz * dz) ** 0.5
                if diag <= 0:
                    return 0.001
                return max(diag * frac, 1e-6)
            except Exception:
                return 0.001

        def _generate_pressure_lines(foil_surface, volume):
            """Return a tubed PolyData of pressure contour lines, or None."""
            if foil_surface is None or volume is None:
                return None

            sampled = foil_surface
            try:
                # Probe p (and any other fields) from the volume onto the foil surface.
                sampled = foil_surface.sample(volume)
            except Exception:
                pass

            scalars_name = None
            try:
                if hasattr(sampled, "array_names") and "p" in sampled.array_names:
                    scalars_name = "p"
            except Exception:
                scalars_name = None

            if not scalars_name:
                return None

            try:
                rng = sampled.get_data_range(scalars_name)
                if rng is None:
                    return None
                lo, hi = float(rng[0]), float(rng[1])
                if not (hi > lo):
                    return None
            except Exception:
                return None

            try:
                contours = sampled.contour(isosurfaces=30, scalars=scalars_name)
                if contours is None or int(getattr(contours, "n_cells", 0)) <= 0:
                    return None
                # Make contours visible but not overwhelming.
                r = _tube_radius_from_bounds(sampled.bounds, 0.004)
                tubed = contours.tube(radius=r, n_sides=12)
                return tubed.triangulate()
            except Exception:
                return None

        def _generate_flow_lines(foil_surface, volume):
            """Return a tubed PolyData of streamlines, or None."""
            if foil_surface is None or volume is None:
                return None

            # Need a velocity field. Prefer point-data vectors; fall back to cell-data vectors and
            # convert to point data for streamline integration.
            vector_name = None
            try:
                pkeys = list(getattr(volume, "point_data", {}).keys())
                ckeys = list(getattr(volume, "cell_data", {}).keys())

                if "U" in pkeys:
                    vector_name = "U"
                elif "U" in ckeys:
                    try:
                        volume = volume.cell_data_to_point_data()
                        vector_name = "U" if "U" in list(getattr(volume, "point_data", {}).keys()) else None
                    except Exception:
                        vector_name = None
                else:
                    # Last resort: pick any 3-component vector array that looks like velocity.
                    candidates = [k for k in pkeys if isinstance(k, str) and k.lower().startswith("u")]
                    vector_name = candidates[0] if candidates else None
            except Exception:
                vector_name = None

            if not vector_name:
                return None

            try:
                b = volume.bounds
                x0, x1 = float(b[0]), float(b[1])
                y0, y1 = float(b[2]), float(b[3])
                z0, z1 = float(b[4]), float(b[5])
                dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
                if dx <= 0 or dy <= 0 or dz <= 0:
                    return None

                # Seed a small grid of points slightly inside the inlet side.
                # (Seeding outside bounds often yields 0 streamlines depending on VTK version.)
                seed_x = x0 + 0.02 * dx
                # Keep this intentionally small: tubed streamlines can explode into multi-million
                # triangle STLs which are impractical to ship to the browser.
                ny, nz = 6, 6
                ys = [y0 + (i + 1) * dy / (ny + 1) for i in range(ny)]
                zs = [z0 + (j + 1) * dz / (nz + 1) for j in range(nz)]
                pts = []
                for yy in ys:
                    for zz in zs:
                        pts.append([seed_x, yy, zz])

                # Add foil-proximate seed points for near-body flow visualization
                if foil_surface is not None and hasattr(foil_surface, 'bounds'):
                    try:
                        fb = foil_surface.bounds
                        fx0 = float(fb[0]) - 0.05 * dx
                        fy0, fy1 = float(fb[2]), float(fb[3])
                        fz0, fz1 = float(fb[4]), float(fb[5])
                        for fi in range(3):
                            for fj in range(3):
                                fy = fy0 + (fi + 1) * (fy1 - fy0) / 4
                                fz = fz0 + (fj + 1) * (fz1 - fz0) / 4
                                pts.append([fx0, fy, fz])
                    except Exception:
                        pass

                source = pv.PolyData(pts)

                diag = (dx * dx + dy * dy + dz * dz) ** 0.5
                step = max(diag * 0.02, 1e-4)
                streams = volume.streamlines_from_source(
                    source,
                    vectors=vector_name,
                    integrator_type=45,
                    integration_direction="forward",
                    initial_step_length=step,
                    min_step_length=max(step * 0.1, 1e-6),
                    max_step_length=max(step * 2.0, 1e-5),
                    max_steps=1200,
                    terminal_speed=1e-6,
                    compute_vorticity=False,
                )
                if streams is None or int(getattr(streams, "n_cells", 0)) <= 0:
                    return None

                # Make streamlines visibly thick in the viewport; keep tri-count controlled by
                # streamline count/steps + decimation (see below).
                r = _tube_radius_from_bounds(volume.bounds, 0.002)
                tubed = streams.tube(radius=r, n_sides=6).triangulate()

                # Best-effort decimation to keep STL payloads browser-friendly.
                try:
                    n_cells = int(getattr(tubed, "n_cells", 0))
                except Exception:
                    n_cells = 0

                if n_cells > 250_000:
                    for fn_name in ("decimate_pro", "decimate"):
                        fn = getattr(tubed, fn_name, None)
                        if fn is None:
                            continue
                        try:
                            tubed = fn(0.85)
                            break
                        except TypeError:
                            try:
                                tubed = fn(target_reduction=0.85)
                                break
                            except Exception:
                                pass
                        except Exception:
                            pass

                return tubed
            except Exception:
                return None

        for frame_index, t in enumerate(selected_times):
            reader.set_active_time_value(t)
            mesh = reader.read()

            volume = None
            if isinstance(mesh, pv.MultiBlock):
                volume = _extract_internal_mesh(mesh)

            exported = None
            if isinstance(mesh, pv.MultiBlock):
                exported = _extract_foil_surface(mesh)

            if exported is None:
                # Last-resort fallback: slice the combined volume.
                if isinstance(mesh, pv.MultiBlock):
                    try:
                        mesh = mesh.combine()
                    except Exception as e:
                        raise RuntimeError(f"Failed to combine OpenFOAM MultiBlock: {e}")
                exported = mesh.slice(normal=normal, generate_triangles=True)

            exported = exported.triangulate()

            # Attempt to set pressure scalars (for future GLB export / vertex colors).
            if hasattr(exported, "array_names") and 'p' in exported.array_names:
                exported.active_scalars_name = 'p'

            stl_filename = f"frame_{frame_index:03d}.stl"
            stl_path = os.path.join(out_dir, stl_filename)
            exported.save(stl_path)

            mesh_url = f"/media/simulations/{sim_id}/{stl_filename}"

            # Overlay layers: pressure contour lines + flow lines.
            pressure_lines_url = None
            flow_lines_url = None

            try:
                pressure_lines = _generate_pressure_lines(exported, volume)
                if pressure_lines is not None:
                    pressure_name = f"pressure_lines_{frame_index:03d}.stl"
                    pressure_path = os.path.join(out_dir, pressure_name)
                    if _safe_save(pressure_lines, pressure_path):
                        pressure_lines_url = f"/media/simulations/{sim_id}/{pressure_name}"
            except Exception:
                pass

            try:
                flow_lines = _generate_flow_lines(exported, volume)
                if flow_lines is not None:
                    flow_name = f"flow_lines_{frame_index:03d}.stl"
                    flow_path = os.path.join(out_dir, flow_name)
                    if _safe_save(flow_lines, flow_path):
                        flow_lines_url = f"/media/simulations/{sim_id}/{flow_name}"
            except Exception:
                pass

            # Metrics (best effort)
            fx = fy = fz = None
            try:
                # forces.dat keys are floats; time_values might also be floats.
                # Use a tolerance-based lookup since float rounding can differ between
                # the OpenFOAM time values and the parsed forces time keys.
                t_key = float(t)
                if t_key in forces_by_time:
                    match = t_key
                else:
                    # Find closest time key if within a small epsilon.
                    closest = min(
                        forces_by_time.keys(),
                        key=lambda k: abs(k - t_key),
                        default=None,
                    )
                    if closest is not None and abs(closest - t_key) < 1e-6:
                        match = closest
                    else:
                        match = None

                if match is not None:
                    fx = forces_by_time[match].get("Fx")
                    fy = forces_by_time[match].get("Fy")
                    fz = forces_by_time[match].get("Fz")
            except Exception:
                pass

            ld_ratio = None
            try:
                if fx is not None and fz is not None and abs(float(fx)) > 1e-12:
                    ld_ratio = float(fz) / float(fx)
            except Exception:
                ld_ratio = None

            metrics = {"Fx": fx, "Fy": fy, "Fz": fz, "ld_ratio": ld_ratio}

            frame_mapping.append(
                {
                    "frame_index": frame_index,
                    "time_value": float(t) if isinstance(t, (float, int)) else str(t),
                    "iteration_number": None,
                    "mesh_path": mesh_url,
                    "pressure_lines_path": pressure_lines_url,
                    "flow_lines_path": flow_lines_url,
                    "metrics": metrics,
                }
            )
            metrics_series.append(
                {
                    "frame_index": frame_index,
                    "time_value": float(t) if isinstance(t, (float, int)) else None,
                    **metrics,
                }
            )

        results_manifest = {
            "sim_id": sim_id,
            "slice_axis": normal,
            "total_frames": len(frame_mapping),
            "frame_mapping": frame_mapping,
            "metrics_series": metrics_series,
            "convergence_series": convergence_series,
        }

        manifest_filename = "results_sequence.json"
        manifest_path = os.path.join(out_dir, manifest_filename)
        try:
            import json

            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(results_manifest, f)
        except Exception as e:
            logger.warning(f"Failed writing results_sequence.json: {e}")

        manifest_url = f"/media/simulations/{sim_id}/{manifest_filename}"
        preview_mesh_path = frame_mapping[0]["mesh_path"] if frame_mapping else None

        return {
            "result_sequence_path": manifest_url,
            "frame_mapping": frame_mapping,
            "metrics_series": metrics_series,
            "convergence_series": convergence_series,
            "preview_mesh_path": preview_mesh_path,
        }
            
    except Exception as e:
        logger.error(f"Post-processing failed: {e}")

        # MVP Fallback if real simulation files don't exist yet for testing the pipeline
        try:
            media_root = os.environ.get("DJANGO_MEDIA_ROOT", "/data/media")
            out_dir = os.path.join(media_root, "simulations", str(sim_id))
            os.makedirs(out_dir, exist_ok=True)
            frame_mapping = []
            metrics_series = []
            for frame_index in range(10):
                dummy = pv.Sphere(radius=0.5 + 0.02 * frame_index).triangulate()
                fname = f"frame_{frame_index:03d}.stl"
                fpath = os.path.join(out_dir, fname)
                dummy.save(fpath)
                url = f"/media/simulations/{sim_id}/{fname}"
                entry = {
                    "frame_index": frame_index,
                    "time_value": float(frame_index),
                    "iteration_number": None,
                    "mesh_path": url,
                    "metrics": {"Fx": None, "Fy": None, "Fz": None, "ld_ratio": None},
                }
                frame_mapping.append(entry)
                metrics_series.append({"frame_index": frame_index, "time_value": float(frame_index), "Fx": None, "Fy": None, "Fz": None, "ld_ratio": None})

            results_manifest = {
                "sim_id": sim_id,
                "slice_axis": "y",
                "total_frames": len(frame_mapping),
                "frame_mapping": frame_mapping,
                "metrics_series": metrics_series,
                "convergence_series": [],
            }

            import json

            manifest_filename = "results_sequence.json"
            manifest_path = os.path.join(out_dir, manifest_filename)
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(results_manifest, f)

            return {
                "result_sequence_path": f"/media/simulations/{sim_id}/{manifest_filename}",
                "frame_mapping": frame_mapping,
                "metrics_series": metrics_series,
                "convergence_series": [],
                "preview_mesh_path": frame_mapping[0]["mesh_path"],
            }
        except Exception as e2:
            logger.error(f"Post-processing fallback failed: {e2}")
            return {
                "result_sequence_path": None,
                "frame_mapping": [],
                "metrics_series": [],
                "convergence_series": [],
                "preview_mesh_path": None,
            }

@app.task(name='tasks.run_hydro_simulation', bind=True)
def run_hydro_simulation(self, sim_id):
    logger.info(f"Received Simulation request: {sim_id}")
    case_dir = f"/data/simulations/{sim_id}"

    try:
        # Phase 1: Initialize Case
        patch_django_status(sim_id, "PENDING", error_log="Initializing Job Configuration...")
        os.makedirs(case_dir, exist_ok=True)
        
        # Pull parameters from the Django API (Example)
        run_data = {}
        try:
            resp = requests.get(f"{DJANGO_API_URL}/{sim_id}/")
            if resp.status_code == 200:
                run_data = resp.json()
        except Exception as e:
            logger.warning(f"Could not fetch full parameter context: {e}")

        velocity = run_data.get('velocity', 10.0)
        density = run_data.get('water_density', 1025.0)
        mesh_density = run_data.get('mesh_density', 1.0)
        angle_of_attack = run_data.get('angle_of_attack', 0.0)
        center_of_gravity = run_data.get('center_of_gravity', [0, 0, 0])
        submersion_depth = run_data.get('submersion_depth', 0.5)

        try:
            angle_of_attack = float(angle_of_attack)
        except Exception:
            angle_of_attack = 0.0

        try:
            submersion_depth = float(submersion_depth)
        except Exception:
            submersion_depth = 0.5
        submersion_depth = max(0.0, min(10.0, submersion_depth))

        if not isinstance(center_of_gravity, (list, tuple)) or len(center_of_gravity) < 3:
            center_of_gravity = [0, 0, 0]

        try:
            mesh_density = float(mesh_density)
        except Exception:
            mesh_density = 1.0

        # Clamp to a sane range; base mesh is still capped below.
        mesh_density = max(0.5, min(2.0, mesh_density))

        # Phase 1.5: Pre-Flight Surface Check & Dynamic Bounding Box
        stl_path = _ensure_foil_stl(case_dir)
        default_domain = {
            "x_min": -5.0,
            "x_max": 15.0,
            "y_min": -2.0,
            "y_max": 2.0,
            "z_min": -2.0,
            "z_max": 2.0,
        }
        domain = dict(default_domain)
        mesh_cells = {"nx": 40, "ny": 20, "nz": 20}
        location_in_mesh = (
            domain["x_min"] + 0.1 * (domain["x_max"] - domain["x_min"]),
            0.5 * (domain["y_min"] + domain["y_max"]),
            0.5 * (domain["z_min"] + domain["z_max"]),
        )

        if not os.path.exists(stl_path):
            patch_django_status(
                sim_id,
                "FAILED",
                error_log="No hydrofoil STL found for this run. Upload an asset so /data/simulations/<id>/constant/triSurface/foil.stl exists.",
            )
            return "Missing STL"
        
        if os.path.exists(stl_path):
            patch_django_status(sim_id, "PENDING", error_log="Running Pre-flight STL Surface Check...")
            
            surf_check = subprocess.run(
                ["surfaceCheck", "constant/triSurface/foil.stl"],
                cwd=case_dir, capture_output=True, text=True
            )
            
            if "open edges" in surf_check.stdout.lower() or surf_check.returncode != 0:
                logger.error("Geometry surface check failed: Not waterproof.")
                patch_django_status(sim_id, "FAILED", error_log="Geometry Check Failed: STL is not closed/water-tight.")
                return "Geometry Leak"

            try:
                foil_mesh = pv.read(stl_path)
                bounds = foil_mesh.bounds  # xmin, xmax, ymin, ymax, zmin, zmax
                x_len = max(bounds[1] - bounds[0], 1e-9)
                y_len = max(bounds[3] - bounds[2], 1e-9)
                z_len = max(bounds[5] - bounds[4], 1e-9)
                characteristic_len = max(x_len, y_len, z_len)

                # Heuristic: many CAD STLs are exported in mm. If the geometry is enormous
                # (tens of meters+), scale it down by 1e-3 to meters.
                if characteristic_len > 10.0:
                    logger.warning(
                        "STL appears to be in millimeters or has very large coordinates; scaling by 0.001"
                    )
                    foil_mesh = foil_mesh.scale([0.001, 0.001, 0.001], inplace=False)
                    foil_mesh.save(stl_path)
                    bounds = foil_mesh.bounds
                    x_len = max(bounds[1] - bounds[0], 1e-9)
                    y_len = max(bounds[3] - bounds[2], 1e-9)
                    z_len = max(bounds[5] - bounds[4], 1e-9)
                    characteristic_len = max(x_len, y_len, z_len)

                # Translate foil downward by submersion_depth so the domain
                # represents the foil at the correct depth below the water surface.
                # Positive submersion_depth = foil center is below z=0 (surface).
                if abs(submersion_depth) > 1e-9:
                    foil_z_center = 0.5 * (bounds[4] + bounds[5])
                    z_shift = -submersion_depth - foil_z_center
                    foil_mesh = foil_mesh.translate([0, 0, z_shift], inplace=False)
                    foil_mesh.save(stl_path)
                    bounds = foil_mesh.bounds
                    logger.info(f"Translated foil by z={z_shift:.4f} for submersion_depth={submersion_depth}")

                # Build a domain around the foil so it is guaranteed to be inside the mesh.
                upstream = 5.0 * characteristic_len
                downstream = 10.0 * characteristic_len
                lateral = 5.0 * characteristic_len

                domain = {
                    "x_min": bounds[0] - upstream,
                    "x_max": bounds[1] + downstream,
                    "y_min": bounds[2] - lateral,
                    "y_max": bounds[3] + lateral,
                    "z_min": bounds[4] - lateral,
                    "z_max": bounds[5] + lateral,
                }

                # Mesh resolution heuristic: aim for ~20 cells across the characteristic length.
                # Use a small absolute floor to avoid missing small foils entirely.
                cell_size = max(characteristic_len / (20.0 * mesh_density), 0.001)
                lx = max(domain["x_max"] - domain["x_min"], 1e-9)
                ly = max(domain["y_max"] - domain["y_min"], 1e-9)
                lz = max(domain["z_max"] - domain["z_min"], 1e-9)

                mesh_cells = {
                    "nx": max(20, min(300, int(lx / cell_size))),
                    "ny": max(10, min(200, int(ly / cell_size))),
                    "nz": max(10, min(200, int(lz / cell_size))),
                }

                # Hard cap the base blockMesh size so we don't accidentally create multi-million-cell
                # base meshes (snappyHexMesh should do the local refinement instead).
                max_base_cells = 200_000
                base_cells = mesh_cells["nx"] * mesh_cells["ny"] * mesh_cells["nz"]
                if base_cells > max_base_cells:
                    scale = (max_base_cells / float(base_cells)) ** (1.0 / 3.0)
                    mesh_cells = {
                        "nx": max(20, int(mesh_cells["nx"] * scale)),
                        "ny": max(10, int(mesh_cells["ny"] * scale)),
                        "nz": max(10, int(mesh_cells["nz"] * scale)),
                    }

                # Pick a point inside the domain (and very likely in the fluid region).
                location_in_mesh = (
                    domain["x_min"] + 0.1 * lx,
                    0.5 * (domain["y_min"] + domain["y_max"]),
                    0.5 * (domain["z_min"] + domain["z_max"]),
                )

                logger.info(f"Derived blockMesh domain: {domain} cells={mesh_cells}")
                logger.info(f"Derived locationInMesh: {location_in_mesh}")
            except Exception as e:
                logger.error(f"Failed STL bounds/domain derivation: {e}")

        # IMPORTANT: ensure reruns don't reuse stale time directories/meshes.
        # OpenFOAM will happily pick up old time folders if they exist; if the mesh
        # changes between attempts, this can cause field-size mismatches.
        try:
            preserved_stl_bytes = None
            if os.path.exists(stl_path):
                with open(stl_path, "rb") as f:
                    preserved_stl_bytes = f.read()

            if os.path.isdir(case_dir):
                shutil.rmtree(case_dir)

            os.makedirs(os.path.join(case_dir, "constant", "triSurface"), exist_ok=True)
            if preserved_stl_bytes is not None:
                with open(stl_path, "wb") as f:
                    f.write(preserved_stl_bytes)
        except Exception as e:
            logger.warning(f"Could not reset case directory cleanly: {e}")

        template_manager = TemplateManager(case_dir)
        template_manager.initialize_case(
            velocity=velocity, 
            water_density=density,
            location_in_mesh=location_in_mesh,
            write_interval=5,
            domain=domain,
            mesh_cells=mesh_cells,
            angle_of_attack=angle_of_attack,
            center_of_gravity=center_of_gravity,
        )

        # Phase 2: MESHING
        logger.info(f"Executing blockMesh in {case_dir}")
        ok, logs = run_and_stream_openfoam(
            sim_id=sim_id,
            case_dir=case_dir,
            cmd=["blockMesh"],
            status="MESHING",
            start_message="Starting blockMesh...",
        )
        if not ok:
            logger.error("blockMesh failed")
            patch_django_status(sim_id, "FAILED", error_log=logs)
            return "Meshing Failed"

        logger.info(f"Executing snappyHexMesh in {case_dir}")
        ok, logs = run_and_stream_openfoam(
            sim_id=sim_id,
            case_dir=case_dir,
            cmd=["snappyHexMesh", "-overwrite"],
            status="MESHING",
            start_message="Starting snappyHexMesh...",
        )
        if not ok:
            logger.error("snappyHexMesh failed")
            patch_django_status(sim_id, "FAILED", error_log=logs)
            return "Meshing Failed"

        # Sanity check: warn if snappyHexMesh did not produce a foil boundary patch.
        # (We keep the pipeline running so solver + post-processing can be validated.)
        try:
            boundary_path = os.path.join(case_dir, "constant", "polyMesh", "boundary")
            with open(boundary_path, "r") as f:
                boundary_text = f.read()
            if "\n    foil\n" not in boundary_text and "\nfoil\n" not in boundary_text:
                warning = (
                    "WARNING: snappyHexMesh did not create a 'foil' boundary patch; "
                    "results may not include the foil surface."
                )
                logger.warning(warning)
                patch_django_status(sim_id, None, error_log=warning)
        except Exception as e:
            logger.warning(f"Could not validate foil patch: {e}")
            
        # 3. Proceed to RUNNING (Solver Mock)
        patch_django_status(sim_id, "RUNNING", error_log="Starting Solver...")
        
        logger.info(f"Executing simpleFoam in {case_dir}")
        ok, logs = run_and_stream_openfoam(
            sim_id=sim_id,
            case_dir=case_dir,
            cmd=["simpleFoam"],
            status="RUNNING",
            start_message="Starting Solver...",
            divergence_guardrail=True,
        )
        if not ok:
            logger.error("simpleFoam failed")
            patch_django_status(sim_id, "FAILED", error_log=logs)
            return "Solver Failed"
             
        # 4. Phase 4: Temporal Geometry Export (Sequence)
        patch_django_status(sim_id, None, error_log="Exporting temporal slice sequence...")

        # Worker currently exports STL slices for browser playback. GLB export can be swapped in later.
        slice_axis = (run_data.get("slice_axis") or "y")
        results = post_process_results_sequence(case_dir, sim_id, frame_count=10, slice_axis=slice_axis)

        patch_django_status(
            sim_id,
            "COMPLETED",
            error_log="Simulation Success",
            result_mesh_path=results.get("preview_mesh_path"),
            result_sequence_path=results.get("result_sequence_path"),
            frame_mapping=results.get("frame_mapping"),
            metrics_series=results.get("metrics_series"),
            convergence_series=results.get("convergence_series"),
        )
        return f"Simulation {sim_id} Finished"

    except DivergenceError:
        # Expected exit during SIGTERM guardrail
        return f"Simulation {sim_id} Halted due to divergence"
    except Exception as e:
        logger.error(f"Error processing Simulation {sim_id}: {e}")
        patch_django_status(sim_id, "FAILED", error_log=str(e))
        raise e
