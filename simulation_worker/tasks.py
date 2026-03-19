from celery import Celery
import subprocess
import requests
import glob
import re
import json
import logging
import math
import os
import sys
from collections import deque
import threading
import time
import pyvista as pv
import shutil
from template_manager import TemplateManager, SHM_TEMPLATE

# Django ORM bootstrap — add backend to path and configure settings.
# The actual model import is deferred to inside task functions so that
# django.setup() has fully completed before any ORM access.
_BACKEND_DIR = os.environ.get('DJANGO_BACKEND_DIR', '/backend')
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nereus_core.settings')

import django
django.setup()

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

def normalise_stl_orientation(stl_path, run):
    """Align an STL so that chord→+X, span→+Y, thickness→+Z.

    Uses the oriented bounding box (OBB) to detect the principal axes of the
    geometry, then permutes them so the longest extent (chord) maps to X, the
    second-longest (span) maps to Y, and the shortest (thickness) maps to Z.

    User-supplied pitch/roll/yaw (degrees) from *run* are composed on top of
    the OBB alignment.  The mesh is then centred at the origin.

    On success the corrected STL is written back to *stl_path* and diagnostic
    axis-mapping information is stored on the Django ``SimulationRun`` instance.
    """
    import numpy as np
    import trimesh
    import trimesh.transformations as tf

    pitch_deg = float(getattr(run, 'pitch', 0) or 0)
    roll_deg = float(getattr(run, 'roll', 0) or 0)
    yaw_deg = float(getattr(run, 'yaw', 0) or 0)

    mesh = trimesh.load(stl_path, force='mesh')

    axis_labels = ['X', 'Y', 'Z']
    obb_applied = False

    try:
        obb = mesh.bounding_box_oriented
        # The OBB transform encodes the rotation that takes the OBB-local frame
        # to the world frame.  The upper-left 3×3 gives the three principal axes
        # as columns.
        obb_rotation = np.array(obb.primitive.transform[:3, :3])
        extents = np.array(obb.primitive.extents)  # lengths along each OBB axis

        # Sort extents descending: longest → chord(X), mid → span(Y), shortest → thickness(Z)
        sorted_indices = np.argsort(-extents)  # descending

        detected_chord_axis = axis_labels[sorted_indices[0]]
        detected_span_axis = axis_labels[sorted_indices[1]]
        detected_up_axis = axis_labels[sorted_indices[2]]

        # Build the permuted rotation: reorder columns so that the OBB axis that
        # is longest maps to world-X, second to world-Y, third to world-Z.
        # We want R_align such that R_align @ obb_axis_i = world_target_i.
        # The OBB rotation's columns are the OBB axes in world coords.
        # R_desired = I (target frame) composed from the permuted OBB columns.
        permuted = obb_rotation[:, sorted_indices]

        # Ensure right-handedness: if the determinant is negative, flip the Z column.
        if np.linalg.det(permuted) < 0:
            permuted[:, 2] = -permuted[:, 2]

        # The alignment rotation goes from world → OBB-aligned, so we need the
        # inverse (transpose) of the permuted matrix.
        align_rotation = permuted.T

        # Build a 4×4 transform
        align_4x4 = np.eye(4)
        align_4x4[:3, :3] = align_rotation

        mesh.apply_transform(align_4x4)
        obb_applied = True

        logger.info(
            "OBB orientation normalisation applied — "
            f"chord axis was {detected_chord_axis}, "
            f"span axis was {detected_span_axis}, "
            f"up axis was {detected_up_axis}"
        )
    except Exception as e:
        logger.warning(f"OBB computation failed (degenerate geometry?): {e} — skipping OBB alignment")
        detected_chord_axis = 'X'
        detected_span_axis = 'Y'
        detected_up_axis = 'Z'

    # Apply user-supplied pitch/roll/yaw on top of the (possibly OBB-aligned) mesh
    if abs(roll_deg) > 1e-9 or abs(pitch_deg) > 1e-9 or abs(yaw_deg) > 1e-9:
        euler_mat = tf.euler_matrix(
            math.radians(roll_deg),
            math.radians(pitch_deg),
            math.radians(yaw_deg),
            axes='sxyz',
        )
        mesh.apply_transform(euler_mat)
        logger.info(f"Applied user orientation: pitch={pitch_deg}° roll={roll_deg}° yaw={yaw_deg}°")

    # Centre the mesh at the origin
    mesh.apply_translation(-mesh.centroid)

    # Export corrected STL back to the same path
    mesh.export(stl_path)

    # Store diagnostic info on the Django run instance
    axes_info = {
        'detected_chord_axis': detected_chord_axis,
        'detected_span_axis': detected_span_axis,
        'detected_up_axis': detected_up_axis,
        'obb_applied': obb_applied,
    }
    try:
        run.geometry_axes_detected = axes_info
        run.save(update_fields=['geometry_axes_detected'])
    except Exception as e:
        logger.warning(f"Could not persist geometry_axes_detected on run: {e}")

    logger.info(f"STL orientation normalisation complete: {axes_info}")


@app.task(name='tasks.preview_stl_orientation', bind=True)
def preview_stl_orientation(self, run_id):
    """Lightweight read-only orientation preview.

    Performs the same OBB detection and pitch/roll/yaw rotation as
    ``normalise_stl_orientation`` but *never* overwrites the original STL.
    Exports a convex-hull GLB (<50 KB) and bounding-box dimensions so the
    frontend can show the user what the final orientation will look like.
    """
    import numpy as np
    import trimesh
    import trimesh.transformations as tf
    from api.models import SimulationRun

    try:
        run = SimulationRun.objects.get(pk=run_id)
    except SimulationRun.DoesNotExist:
        logger.error(f"preview_stl_orientation: run {run_id} not found")
        return

    # Locate the STL — mirrors the same logic as the full simulation pre-flight.
    case_dir = f"/data/simulations/{run_id}"
    tri_dir = os.path.join(case_dir, "constant", "triSurface")
    stl_path = os.path.join(tri_dir, "foil.stl")

    if not os.path.exists(stl_path):
        # Try to resolve via _ensure_foil_stl (converts glb/obj → stl)
        try:
            stl_path = _ensure_foil_stl(case_dir)
        except Exception as e:
            logger.warning(f"preview_stl_orientation: could not locate STL: {e}")
            return

    try:
        mesh = trimesh.load(stl_path, force='mesh')
    except Exception as e:
        logger.warning(f"preview_stl_orientation: failed to load STL: {e}")
        return

    axis_labels = ['X', 'Y', 'Z']
    detected_chord_axis = 'X'
    detected_span_axis = 'Y'
    detected_up_axis = 'Z'

    # ── OBB detection (read-only — same logic as normalise_stl_orientation) ──
    try:
        obb = mesh.bounding_box_oriented
        obb_rotation = np.array(obb.primitive.transform[:3, :3])
        extents = np.array(obb.primitive.extents)
        sorted_indices = np.argsort(-extents)

        detected_chord_axis = axis_labels[sorted_indices[0]]
        detected_span_axis = axis_labels[sorted_indices[1]]
        detected_up_axis = axis_labels[sorted_indices[2]]

        permuted = obb_rotation[:, sorted_indices]
        if np.linalg.det(permuted) < 0:
            permuted[:, 2] = -permuted[:, 2]

        align_4x4 = np.eye(4)
        align_4x4[:3, :3] = permuted.T
        mesh.apply_transform(align_4x4)
    except Exception as e:
        logger.warning(f"preview_stl_orientation: OBB failed: {e}")

    # ── User pitch/roll/yaw ──
    pitch_deg = float(run.pitch or 0)
    roll_deg = float(run.roll or 0)
    yaw_deg = float(run.yaw or 0)

    if abs(roll_deg) > 1e-9 or abs(pitch_deg) > 1e-9 or abs(yaw_deg) > 1e-9:
        euler_mat = tf.euler_matrix(
            math.radians(roll_deg),
            math.radians(pitch_deg),
            math.radians(yaw_deg),
            axes='sxyz',
        )
        mesh.apply_transform(euler_mat)

    # Centre at origin
    mesh.apply_translation(-mesh.centroid)

    # ── Bounding-box dimensions (axis-aligned after correction) ──
    bb_min = mesh.bounds[0]
    bb_max = mesh.bounds[1]
    chord_m = float(bb_max[0] - bb_min[0])
    span_m = float(bb_max[1] - bb_min[1])
    thickness_m = float(bb_max[2] - bb_min[2])

    # ── Convex-hull GLB preview ──
    media_root = os.environ.get("DJANGO_MEDIA_ROOT", "/data/media")
    out_dir = os.path.join(media_root, "simulations", str(run_id))
    os.makedirs(out_dir, exist_ok=True)

    preview_path = os.path.join(out_dir, "orientation_preview.glb")
    hull = mesh.convex_hull
    hull.export(preview_path, file_type='glb')

    preview_url = f"/media/simulations/{run_id}/orientation_preview.glb"

    # ── Persist to Django ──
    axes_info = {
        'detected_chord_axis': detected_chord_axis,
        'detected_span_axis': detected_span_axis,
        'detected_up_axis': detected_up_axis,
    }
    dims_info = {
        'chord_m': round(chord_m, 6),
        'span_m': round(span_m, 6),
        'thickness_m': round(thickness_m, 6),
    }

    SimulationRun.objects.filter(pk=run_id).update(
        orientation_preview_url=preview_url,
        geometry_dimensions=dims_info,
        geometry_axes_detected=axes_info,
    )

    logger.info(
        f"preview_stl_orientation complete for run {run_id}: "
        f"dims={dims_info}, axes={axes_info}, preview={preview_url}"
    )

    return {
        'preview_glb_url': preview_url,
        'chord_m': dims_info['chord_m'],
        'span_m': dims_info['span_m'],
        'thickness_m': dims_info['thickness_m'],
        'detected_chord_axis': detected_chord_axis,
        'detected_span_axis': detected_span_axis,
        'detected_up_axis': detected_up_axis,
    }


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


def _parse_moments(case_dir):
    """Parse moment.dat from postProcessing/forces and return the mean of the last
    20 % of time steps as (Mx, My, Mz).  Returns (None, None, None) on failure."""
    base = os.path.join(case_dir, "postProcessing", "forces")
    if not os.path.isdir(base):
        return None, None, None

    time_dirs = sorted(
        (e for e in os.listdir(base) if os.path.isdir(os.path.join(base, e))),
        key=lambda s: float(s) if s.replace(".", "", 1).isdigit() else 0.0,
        reverse=True,
    )

    for time_dir in time_dirs:
        candidate = os.path.join(base, time_dir, "moment.dat")
        if not os.path.exists(candidate):
            continue
        try:
            rows = []  # list of (Mx, My, Mz)
            with open(candidate, "r", encoding="utf-8", errors="ignore") as f:
                for raw in f:
                    line = raw.strip()
                    if not line or line.startswith("#"):
                        continue
                    # Extract all parenthesised triplets
                    vectors = []
                    buf = ""
                    depth = 0
                    for ch in line:
                        if ch == "(":
                            depth += 1
                            buf = ""
                        elif ch == ")":
                            if depth > 0:
                                depth -= 1
                                vals = buf.strip().split()
                                if len(vals) == 3:
                                    try:
                                        vectors.append([float(v) for v in vals])
                                    except Exception:
                                        pass
                        else:
                            if depth > 0:
                                buf += ch
                    # moment.dat: (pressureMoment) (viscousMoment) [optional (porousMoment)]
                    if len(vectors) >= 2:
                        mx = vectors[0][0] + vectors[1][0]
                        my = vectors[0][1] + vectors[1][1]
                        mz = vectors[0][2] + vectors[1][2]
                        rows.append((mx, my, mz))

            if not rows:
                continue

            # Average over the last 20 % of rows (minimum 1)
            tail_n = max(1, len(rows) // 5)
            tail = rows[-tail_n:]
            mx_mean = sum(r[0] for r in tail) / len(tail)
            my_mean = sum(r[1] for r in tail) / len(tail)
            mz_mean = sum(r[2] for r in tail) / len(tail)
            return mx_mean, my_mean, mz_mean
        except Exception as e:
            logger.warning(f"Failed parsing moment.dat: {e}")

    return None, None, None


def _parse_yplus(case_dir):
    """Extract max and mean y+ from postProcessing/yPlus output.

    OpenFOAM writes a summary line to log.simpleFoam such as:
        Patch foil y+ : min/max/average = 0.12 / 45.3 / 2.3
    and also writes a field file under postProcessing/yPlus/<time>/yPlus.dat.
    We prefer the field file; fall back to scanning the solver log.
    """
    # -- Try postProcessing/yPlus/<time>/yPlus.dat (field-average output) --
    base = os.path.join(case_dir, "postProcessing", "yPlus")
    if os.path.isdir(base):
        time_dirs = sorted(
            (e for e in os.listdir(base) if os.path.isdir(os.path.join(base, e))),
            key=lambda s: float(s) if s.replace(".", "", 1).isdigit() else 0.0,
            reverse=True,
        )
        for td in time_dirs:
            dat = os.path.join(base, td, "yPlus.dat")
            if not os.path.exists(dat):
                continue
            try:
                yplus_vals = []
                with open(dat, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        parts = line.split()
                        if len(parts) >= 2:
                            try:
                                yplus_vals.append(float(parts[-1]))
                            except Exception:
                                pass
                if yplus_vals:
                    return max(yplus_vals), sum(yplus_vals) / len(yplus_vals)
            except Exception as e:
                logger.warning(f"Failed reading yPlus.dat: {e}")

    # -- Fallback: scan the solver log for the summary line --
    for log_name in ("log.simpleFoam", "log.pimpleFoam", "log.interFoam"):
        log_path = os.path.join(case_dir, log_name)
        if not os.path.exists(log_path):
            continue
        try:
            yplus_max = None
            yplus_mean = None
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    # e.g. "    patch foil y+ : min = 0.12, max = 45.3, average = 2.3"
                    lower = line.lower()
                    if "y+" in lower and ("max" in lower or "average" in lower):
                        m_max = re.search(r"max\s*=?\s*([0-9.eE+\-]+)", line, re.IGNORECASE)
                        m_avg = re.search(r"ave(?:rage)?\s*=?\s*([0-9.eE+\-]+)", line, re.IGNORECASE)
                        if m_max:
                            try:
                                yplus_max = float(m_max.group(1))
                            except Exception:
                                pass
                        if m_avg:
                            try:
                                yplus_mean = float(m_avg.group(1))
                            except Exception:
                                pass
            if yplus_max is not None:
                return yplus_max, yplus_mean
        except Exception as e:
            logger.warning(f"Failed scanning {log_name} for y+: {e}")

    return None, None


def compute_skin_friction_lines(foil_surface_mesh, case_dir, run):
    """Generate surface streamlines (skin friction lines) on the foil boundary.

    Parameters
    ----------
    foil_surface_mesh : pv.PolyData
        Foil boundary surface already extracted from OpenFOAM.
    case_dir : str | Path
        Path to the OpenFOAM case directory (used only for logging context).
    run : dict
        Must contain keys: 'sim_id', 'out_dir' (Path), 'velocity', 'rho'.

    Returns
    -------
    str or None
        Relative media path of the exported skin_friction_lines.vtp, or None on failure.
    """
    import numpy as np
    from pathlib import Path

    sim_id = run["sim_id"]
    out_dir = Path(run["out_dir"])
    V = float(run["velocity"])
    rho = float(run["rho"])
    q_inf = 0.5 * rho * V * V

    try:
        mesh = foil_surface_mesh.copy()

        # --- 1. Obtain wall shear stress vector ---
        point_arrays = list(getattr(mesh, "point_data", {}).keys())
        if "wallShearStress" in point_arrays:
            tau = np.asarray(mesh.point_data["wallShearStress"], dtype=np.float64)
        else:
            # Approximate: tau_w ≈ rho * nut_wall * (U / y)  (visualisation quality)
            logger.info("wallShearStress not found on mesh; approximating from U and nut")
            U_field = None
            nut_field = None
            for name in ("U", "UMean"):
                if name in point_arrays:
                    U_field = np.asarray(mesh.point_data[name], dtype=np.float64)
                    break
            for name in ("nut",):
                if name in point_arrays:
                    nut_field = np.asarray(mesh.point_data[name], dtype=np.float64)
                    break
            if U_field is None:
                logger.warning("Cannot compute skin friction lines: no velocity field on foil surface")
                return None
            U_mag = np.linalg.norm(U_field, axis=1, keepdims=True)
            U_mag = np.where(U_mag < 1e-30, 1e-30, U_mag)
            U_dir = U_field / U_mag
            if nut_field is not None:
                # Use nut as a proxy for the wall-normal gradient magnitude
                nut_col = nut_field.reshape(-1, 1) if nut_field.ndim == 1 else nut_field
                tau = rho * nut_col * U_dir  # direction from U, magnitude scaled by nut
            else:
                # Last resort: use velocity direction with unit magnitude
                tau = U_dir

        # --- 2. Project shear stress onto surface tangent plane ---
        mesh = mesh.compute_normals(point_normals=True, cell_normals=False,
                                    auto_orient_normals=True)
        normals = np.asarray(mesh.point_data["Normals"], dtype=np.float64)
        # tau_tangent = tau - (tau . n) * n
        dot = np.sum(tau * normals, axis=1, keepdims=True)
        tau_tangent = tau - dot * normals
        tau_tangent_mag = np.linalg.norm(tau_tangent, axis=1)
        # Avoid zero vectors for streamline integration
        zero_mask = tau_tangent_mag < 1e-30
        tau_tangent_mag[zero_mask] = 1e-30

        mesh.point_data["tau_tangent"] = tau_tangent
        mesh.set_active_vectors("tau_tangent")

        # --- 3. Seed points & surface streamlines ---
        bounds = mesh.bounds  # (xmin, xmax, ymin, ymax, zmin, zmax)
        n_side = int(np.ceil(300 ** 0.5))  # ~17x18 grid
        xs = np.linspace(bounds[0], bounds[1], n_side)
        ys = np.linspace(bounds[2], bounds[3], n_side)
        xx, yy = np.meshgrid(xs, ys)
        zz = np.full_like(xx, 0.5 * (bounds[4] + bounds[5]))
        seed_points = np.column_stack([xx.ravel(), yy.ravel(), zz.ravel()])

        # Project each seed point to the closest point on the foil surface
        closest_ids = np.array([mesh.find_closest_point(pt) for pt in seed_points])
        # Deduplicate
        unique_ids = np.unique(closest_ids)
        seed_cloud = pv.PolyData(mesh.points[unique_ids])

        streamlines = mesh.streamlines_from_source(
            seed_cloud,
            vectors="tau_tangent",
            max_steps=2000,
            integration_direction="both",
        )

        if streamlines is None or streamlines.n_points == 0:
            logger.warning("Skin friction streamlines produced no geometry")
            return None

        # --- 4. Colour by Cf = |tau| / (0.5 * rho * V^2) ---
        if "tau_tangent" in streamlines.array_names:
            sl_tau = np.asarray(streamlines["tau_tangent"], dtype=np.float64)
            sl_mag = np.linalg.norm(sl_tau, axis=1)
        else:
            sl_mag = np.zeros(streamlines.n_points)
        Cf = sl_mag / q_inf if q_inf > 0 else sl_mag
        streamlines.point_data["Cf"] = Cf

        # --- 5. Export ---
        vtp_path = out_dir / "skin_friction_lines.vtp"
        streamlines.save(str(vtp_path))
        logger.info(f"Exported skin_friction_lines.vtp ({streamlines.n_points} points)")
        return f"/media/simulations/{sim_id}/skin_friction_lines.vtp"

    except Exception as e:
        logger.warning(f"compute_skin_friction_lines failed: {e}")
        return None


def analyse_tip_vortex(volume_mesh, foil_surface_mesh, foil_bbox, run):
    """Analyse tip vortex decay, cavitation risk, and vortex trajectory.

    Parameters
    ----------
    volume_mesh : pv.DataSet
        Internal volume mesh with 'vorticity_mag', 'vorticity_x', 'Q_criterion'.
    foil_surface_mesh : pv.PolyData
        Foil boundary surface with 'p' and 'Cp' point arrays.
    foil_bbox : dict
        Bounding box with keys x_min, x_max, y_min, y_max, z_min, z_max.
    run : dict
        Must contain: 'out_dir' (Path), 'sim_id', 'velocity', 'rho', 'p_ref',
        and optionally 'p_vapour'.

    Returns
    -------
    dict
        Flat dict of scalar results; empty dict on failure.
    """
    import json
    import numpy as np
    from pathlib import Path

    try:
        out_dir = Path(run["out_dir"])
        sim_id = run["sim_id"]
        V = float(run["velocity"])
        rho = float(run["rho"])
        p_ref = float(run["p_ref"])
        p_vapour = float(run.get("p_vapour") or 2337.0)

        chord = foil_bbox["x_max"] - foil_bbox["x_min"]
        te_x = foil_bbox["x_max"]

        # ── 1. TIP VORTEX SAMPLING ─────────────────────────────────────────
        multipliers = [0.5, 1.0, 2.0, 4.0]
        tip_vortex_samples = []

        for mult in multipliers:
            try:
                x_offset = chord * mult
                x_plane_pos = te_x + x_offset
                plane = volume_mesh.slice(
                    normal=[1, 0, 0],
                    origin=[x_plane_pos, 0, 0],
                )
                if plane is None or plane.n_points == 0:
                    logger.warning(f"Tip vortex: empty slice at {mult}c downstream")
                    continue

                plane_arrays = list(getattr(plane, "point_data", {}).keys())
                if "vorticity_mag" not in plane_arrays:
                    logger.warning("Tip vortex: vorticity_mag missing on slice")
                    continue

                vort_mag = np.asarray(plane.point_data["vorticity_mag"], dtype=np.float64)
                peak_idx = int(np.argmax(vort_mag))
                peak_pt = plane.points[peak_idx]
                peak_y, peak_z = float(peak_pt[1]), float(peak_pt[2])
                peak_vort = float(vort_mag[peak_idx])

                # Find minimum pressure within sphere of radius 0.1*chord
                search_radius = 0.1 * chord
                pts = np.asarray(plane.points, dtype=np.float64)
                dists = np.sqrt(
                    (pts[:, 1] - peak_y) ** 2 + (pts[:, 2] - peak_z) ** 2
                )
                mask = dists <= search_radius

                p_min_val = None
                if "p" in plane_arrays and np.any(mask):
                    p_arr = np.asarray(plane.point_data["p"], dtype=np.float64)
                    p_min_val = float(np.min(p_arr[mask]))

                tip_vortex_samples.append({
                    "x_over_c": float(mult),
                    "y": peak_y,
                    "z": peak_z,
                    "vorticity_mag": peak_vort,
                    "p_min": p_min_val,
                })
            except Exception as e:
                logger.warning(f"Tip vortex sample at {mult}c failed: {e}")

        # ── 2. CAVITATION RISK ──────────────────────────────────────────────
        sigma = None
        cavitation_risk = False
        cavitation_onset_x_over_c = None
        cavitating_surface_fraction = 0.0

        denom = 0.5 * rho * V * V
        if denom > 0:
            sigma = (p_ref - p_vapour) / denom

        # Check each sample plane for p_min < p_vapour
        for sample in tip_vortex_samples:
            if sample["p_min"] is not None and sample["p_min"] < p_vapour:
                cavitation_risk = True
                cavitation_onset_x_over_c = sample["x_over_c"]
                break

        # Cavitating surface fraction (area-weighted)
        try:
            foil_with_sizes = foil_surface_mesh.compute_cell_sizes(
                length=False, area=True, volume=False
            )
            foil_p_arrays = list(getattr(foil_surface_mesh, "point_data", {}).keys())
            if "p" in foil_p_arrays:
                # Convert point data to cell data for area-weighted fraction
                cell_mesh = foil_surface_mesh.point_data_to_cell_data()
                p_cells = np.asarray(cell_mesh["p"], dtype=np.float64)
                areas = np.asarray(foil_with_sizes.cell_data["Area"], dtype=np.float64)
                total_area = np.sum(areas)
                if total_area > 0:
                    cavitating_mask = p_cells < p_vapour
                    cavitating_surface_fraction = float(
                        np.sum(areas[cavitating_mask]) / total_area
                    )
        except Exception as e:
            logger.warning(f"Tip vortex cavitating surface fraction failed: {e}")

        # ── 3. VORTEX DECAY FIT ────────────────────────────────────────────
        omega_0 = None
        vortex_decay_rate = None
        x_over_c_10pct_decay = None

        if len(tip_vortex_samples) >= 3:
            try:
                from scipy.optimize import curve_fit

                x_vals = np.array([s["x_over_c"] for s in tip_vortex_samples])
                omega_vals = np.array([s["vorticity_mag"] for s in tip_vortex_samples])

                def _decay_model(x, omega0, k):
                    return omega0 * np.exp(-k * x)

                popt, _ = curve_fit(
                    _decay_model, x_vals, omega_vals,
                    p0=[omega_vals[0], 0.5],
                    maxfev=5000,
                )
                omega_0 = float(popt[0])
                vortex_decay_rate = float(popt[1])
                if vortex_decay_rate > 0:
                    x_over_c_10pct_decay = float(np.log(10.0) / vortex_decay_rate)
                else:
                    x_over_c_10pct_decay = None
            except Exception as e:
                logger.warning(f"Vortex decay curve_fit failed: {e}")
                omega_0 = None
                vortex_decay_rate = None
                x_over_c_10pct_decay = None
        else:
            logger.warning(
                f"Only {len(tip_vortex_samples)} tip vortex samples — "
                "skipping decay fit (need >= 3)"
            )

        # ── 4. OUTPUT ──────────────────────────────────────────────────────
        output = {
            "tip_vortex_samples": tip_vortex_samples,
            "cavitation_risk": cavitation_risk,
            "cavitation_onset_x_over_c": cavitation_onset_x_over_c,
            "cavitating_surface_fraction": cavitating_surface_fraction,
            "sigma": sigma,
            "omega_0": omega_0,
            "vortex_decay_rate": vortex_decay_rate,
            "x_over_c_10pct_decay": x_over_c_10pct_decay,
        }

        json_path = out_dir / "tip_vortex_analysis.json"
        with open(json_path, "w", encoding="utf-8") as jf:
            json.dump(output, jf, indent=2)
        logger.info(f"Exported tip_vortex_analysis.json")

        # Return flat scalar dict (exclude the list; keep only scalars)
        scalar_results = {
            "cavitation_risk": cavitation_risk,
            "cavitation_onset_x_over_c": cavitation_onset_x_over_c,
            "cavitating_surface_fraction": cavitating_surface_fraction,
            "sigma": sigma,
            "omega_0": omega_0,
            "vortex_decay_rate": vortex_decay_rate,
            "x_over_c_10pct_decay": x_over_c_10pct_decay,
        }
        return scalar_results

    except Exception as e:
        logger.warning(f"analyse_tip_vortex failed: {e}")
        return {}


def post_process(case_dir, sim_id, *, velocity, rho=1025.0, p_vapour=None):
    """Full PyVista-based post-processing pipeline for a completed OpenFOAM case.

    Parameters
    ----------
    case_dir : str
        Absolute path to the OpenFOAM case directory.
    sim_id : int | str
        Simulation run identifier.
    velocity : float
        Freestream (inlet) velocity magnitude [m/s].
    rho : float
        Fluid density [kg/m³] (default 1025 for seawater).
    p_vapour : float | None
        Vapour pressure [Pa] for cavitation analysis. Defaults to 2337.0.

    Returns
    -------
    dict
        ``results`` – scalar metrics (forces, moments, coefficients, y+ stats)
        ``file_manifest`` – mapping of output names to relative media paths.
    """
    import json
    import numpy as np
    from pathlib import Path

    logger.info(f"Starting full PyVista post-processing for sim {sim_id}")

    case_path = Path(case_dir)
    media_root = Path(os.environ.get("DJANGO_MEDIA_ROOT", "/data/media"))
    out_dir = media_root / "simulations" / str(sim_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    results: dict = {}
    file_manifest: dict = {}

    V = float(velocity)
    q_inf = 0.5 * rho * V * V  # dynamic pressure

    # ── helper: extract named block from MultiBlock ─────────────────────────
    def _find_block(dataset, name):
        if not isinstance(dataset, pv.MultiBlock):
            return None
        try:
            blk = dataset.get(name)
            if blk is not None:
                return blk
        except Exception:
            pass
        # Recursive walk
        def walk(mb):
            if not isinstance(mb, pv.MultiBlock):
                return None
            try:
                keys = list(mb.keys())
            except Exception:
                keys = []
            for i in range(len(mb)):
                nm = keys[i] if i < len(keys) else None
                block = mb[i]
                if isinstance(nm, str) and nm == name and block is not None:
                    return block
                found = walk(block)
                if found is not None:
                    return found
            return None
        return walk(dataset)

    def _find_block_containing(dataset, substring):
        if not isinstance(dataset, pv.MultiBlock):
            return None
        def walk(mb):
            if not isinstance(mb, pv.MultiBlock):
                return None
            try:
                keys = list(mb.keys())
            except Exception:
                keys = []
            for i in range(len(mb)):
                nm = keys[i] if i < len(keys) else None
                block = mb[i]
                if isinstance(nm, str) and substring.lower() in nm.lower() and block is not None:
                    return block
                found = walk(block)
                if found is not None:
                    return found
            return None
        return walk(dataset)

    def _ensure_point_data(mesh_obj):
        """Convert cell data to point data if point arrays are missing."""
        pkeys = list(getattr(mesh_obj, "point_data", {}).keys())
        ckeys = list(getattr(mesh_obj, "cell_data", {}).keys())
        if not pkeys and ckeys:
            return mesh_obj.cell_data_to_point_data()
        return mesh_obj

    # ── 1. OPEN CASE ────────────────────────────────────────────────────────
    foam_file = case_path / "case.foam"
    foam_file.touch()

    reader = pv.OpenFOAMReader(str(foam_file))
    for method_name in ("enable_all_cell_arrays", "enable_all_point_arrays", "enable_all_arrays"):
        try:
            fn = getattr(reader, method_name, None)
            if callable(fn):
                fn()
        except Exception:
            pass

    time_values = list(getattr(reader, "time_values", []) or [])
    if not time_values:
        raise ValueError("No time steps found in OpenFOAM case.")

    # Determine whether time-averaged fields exist (pimpleFoam fieldAverage output)
    reader.set_active_time_value(time_values[-1])
    mesh_full = reader.read()

    internal_mesh = _find_block(mesh_full, "internalMesh")
    if internal_mesh is None:
        internal_mesh = _find_block_containing(mesh_full, "internal")

    use_mean_fields = False
    if internal_mesh is not None:
        all_arrays = list(getattr(internal_mesh, "point_data", {}).keys()) + \
                     list(getattr(internal_mesh, "cell_data", {}).keys())
        if "UMean" in all_arrays and "pMean" in all_arrays:
            use_mean_fields = True
            logger.info("Detected fieldAverage output — using UMean/pMean")

    # Alias field names for downstream use
    U_name = "UMean" if use_mean_fields else "U"
    p_name = "pMean" if use_mean_fields else "p"

    # Ensure internal mesh has point data
    if internal_mesh is not None:
        internal_mesh = _ensure_point_data(internal_mesh)

    # Extract foil boundary surface
    boundary_block = _find_block(mesh_full, "boundary")
    foil_surface = None
    if boundary_block is not None:
        foil_surface = _find_block(boundary_block, "foil")
        if foil_surface is None:
            foil_surface = _find_block_containing(boundary_block, "foil")
    if foil_surface is None:
        foil_surface = _find_block_containing(mesh_full, "foil")

    if foil_surface is not None:
        foil_surface = _ensure_point_data(foil_surface)

    # Extract outlet boundary for p_ref
    outlet_surface = None
    if boundary_block is not None:
        outlet_surface = _find_block(boundary_block, "outlet")
        if outlet_surface is None:
            outlet_surface = _find_block_containing(boundary_block, "outlet")

    # Foil bounding box geometry
    foil_bbox = None
    chord_length = 1.0
    span_length = 1.0
    if foil_surface is not None:
        fb = foil_surface.bounds
        chord_length = max(float(fb[1]) - float(fb[0]), 1e-9)
        span_length = max(float(fb[3]) - float(fb[2]), 1e-9)
        foil_bbox = {
            "x_min": float(fb[0]), "x_max": float(fb[1]),
            "y_min": float(fb[2]), "y_max": float(fb[3]),
            "z_min": float(fb[4]), "z_max": float(fb[5]),
        }
    results["chord_length"] = chord_length
    results["span_length"] = span_length

    # Reference pressure (computed in section 2, used in section 3)
    p_ref = 0.0

    # ── 2. PRESSURE – Cp on foil, export foil_surface.vtp ──────────────────
    try:
        if foil_surface is not None:
            # Determine p_ref from mean outlet pressure
            p_ref = 0.0
            if outlet_surface is not None:
                outlet_surface = _ensure_point_data(outlet_surface)
                outlet_arrays = list(getattr(outlet_surface, "point_data", {}).keys())
                if p_name in outlet_arrays:
                    p_ref = float(np.nanmean(outlet_surface.point_data[p_name]))
                elif "p" in outlet_arrays:
                    p_ref = float(np.nanmean(outlet_surface.point_data["p"]))

            foil_arrays = list(getattr(foil_surface, "point_data", {}).keys())
            p_field_name = p_name if p_name in foil_arrays else ("p" if "p" in foil_arrays else None)

            if p_field_name is not None and q_inf > 0:
                p_arr = np.asarray(foil_surface.point_data[p_field_name], dtype=np.float64)
                # OpenFOAM stores kinematic pressure p/rho; convert to Cp
                Cp = (p_arr - p_ref) / (q_inf / rho)
                foil_surface.point_data["Cp"] = Cp

            vtp_path = out_dir / "foil_surface.vtp"
            foil_surface.save(str(vtp_path))
            file_manifest["foil_surface"] = f"/media/simulations/{sim_id}/foil_surface.vtp"
            logger.info("Exported foil_surface.vtp")

            # Also export STL for fast frontend rendering (Three.js STLLoader).
            stl_path = out_dir / "foil_surface.stl"
            foil_surface.save(str(stl_path))
            file_manifest["foil_surface_stl"] = f"/media/simulations/{sim_id}/foil_surface.stl"
            logger.info("Exported foil_surface.stl")
    except Exception as e:
        logger.warning(f"Section 2 (Pressure/Cp) failed: {e}")

    # ── 2b. SKIN FRICTION LINES ────────────────────────────────────────────
    try:
        if foil_surface is not None:
            sf_path = compute_skin_friction_lines(
                foil_surface,
                case_dir,
                run={
                    "sim_id": sim_id,
                    "out_dir": out_dir,
                    "velocity": V,
                    "rho": rho,
                },
            )
            if sf_path:
                file_manifest["skin_friction_lines"] = sf_path
    except Exception as e:
        logger.warning(f"Section 2b (Skin friction lines) failed: {e}")

    # ── 3. SPANWISE SECTIONS ───────────────────────────────────────────────
    try:
        if foil_surface is not None and foil_bbox is not None:
            span_stations = [10, 25, 50, 75, 90]
            y_min = foil_bbox["y_min"]
            y_extent = span_length

            for pct in span_stations:
                try:
                    y_loc = y_min + (pct / 100.0) * y_extent
                    section = foil_surface.slice(normal="y", origin=(0, y_loc, 0))
                    if section is None or section.n_points == 0:
                        logger.warning(f"Empty slice at span {pct}%")
                        continue

                    section = _ensure_point_data(section)
                    sec_arrays = list(getattr(section, "point_data", {}).keys())

                    # Compute Cp for the section if not already present
                    p_sec = p_name if p_name in sec_arrays else ("p" if "p" in sec_arrays else None)
                    if p_sec is not None and "Cp" not in sec_arrays and q_inf > 0:
                        p_arr = np.asarray(section.point_data[p_sec], dtype=np.float64)
                        section.point_data["Cp"] = (p_arr - p_ref) / (q_inf / rho)

                    # Store chordwise x-coordinate as explicit array
                    section.point_data["x_chord"] = np.asarray(
                        section.points[:, 0], dtype=np.float64
                    )

                    fname = f"section_span_{pct}.vtp"
                    section.save(str(out_dir / fname))
                    file_manifest[f"section_span_{pct}"] = f"/media/simulations/{sim_id}/{fname}"
                except Exception as e:
                    logger.warning(f"Spanwise section {pct}% failed: {e}")

            logger.info("Exported spanwise section VTPs")
    except Exception as e:
        logger.warning(f"Section 3 (Spanwise Sections) failed: {e}")

    # ── 4. VORTICITY & Q-CRITERION on volume mesh ──────────────────────────
    vol = None
    try:
        if internal_mesh is not None:
            vol = _ensure_point_data(internal_mesh)
            vol_arrays = list(getattr(vol, "point_data", {}).keys())

            u_field = U_name if U_name in vol_arrays else ("U" if "U" in vol_arrays else None)

            if u_field is not None:
                # Vorticity via compute_derivative
                vol = vol.compute_derivative(scalars=u_field, vorticity=True)
                if "vorticity" in vol.array_names:
                    vort = np.asarray(vol["vorticity"], dtype=np.float64)
                    vol.point_data["vorticity"] = vort
                    vol.point_data["vorticity_mag"] = np.linalg.norm(vort, axis=1)
                    vol.point_data["vorticity_x"] = vort[:, 0]

                # Q-criterion from velocity gradient tensor
                grad = vol.compute_derivative(scalars=u_field, gradient=True)
                grad_arr_name = f"gradient" if "gradient" in grad.array_names else f"{u_field}_gradient"
                if grad_arr_name not in grad.array_names:
                    # Try to find the gradient array
                    grad_candidates = [n for n in grad.array_names if "gradient" in n.lower()]
                    grad_arr_name = grad_candidates[0] if grad_candidates else None

                if grad_arr_name is not None:
                    grad_tensor = np.asarray(grad[grad_arr_name], dtype=np.float64)
                    # grad_tensor shape: (N, 9) → reshape to (N, 3, 3)
                    N = grad_tensor.shape[0]
                    G = grad_tensor.reshape(N, 3, 3)
                    # Omega (antisymmetric) and S (symmetric)
                    Omega = 0.5 * (G - np.transpose(G, (0, 2, 1)))
                    S = 0.5 * (G + np.transpose(G, (0, 2, 1)))
                    # Frobenius norms squared
                    Omega_sq = np.sum(Omega * Omega, axis=(1, 2))
                    S_sq = np.sum(S * S, axis=(1, 2))
                    Q = 0.5 * (Omega_sq - S_sq)
                    vol.point_data["Q_criterion"] = Q

                # Cp on volume
                p_vol = p_name if p_name in vol_arrays else ("p" if "p" in vol_arrays else None)
                if p_vol is not None and q_inf > 0:
                    p_arr = np.asarray(vol.point_data[p_vol], dtype=np.float64)
                    vol.point_data["Cp"] = (p_arr - p_ref) / (q_inf / rho)

                vtu_path = out_dir / "volume_fields.vtu"
                vol.save(str(vtu_path))
                file_manifest["volume_fields"] = f"/media/simulations/{sim_id}/volume_fields.vtu"
                logger.info("Exported volume_fields.vtu")
            else:
                logger.warning("No velocity field found on internal mesh — skipping vorticity/Q")
                vol = None
    except Exception as e:
        logger.warning(f"Section 4 (Vorticity & Q-criterion) failed: {e}")
        vol = None

    # ── 5. Q-CRITERION ISO-SURFACE ─────────────────────────────────────────
    try:
        if vol is not None and "Q_criterion" in vol.array_names:
            Q_threshold = 0.1 * (V / chord_length) ** 2
            iso = vol.contour(isosurfaces=[Q_threshold], scalars="Q_criterion")
            if iso is None or iso.n_points == 0:
                # Halve threshold and retry once
                Q_threshold *= 0.5
                iso = vol.contour(isosurfaces=[Q_threshold], scalars="Q_criterion")

            if iso is not None and iso.n_points > 0:
                if "vorticity_x" in vol.array_names:
                    iso = iso.sample(vol)
                iso_path = out_dir / "q_criterion_isosurface.vtp"
                iso.save(str(iso_path))
                file_manifest["q_criterion_isosurface"] = (
                    f"/media/simulations/{sim_id}/q_criterion_isosurface.vtp"
                )
                results["Q_threshold"] = Q_threshold
                logger.info(f"Exported q_criterion_isosurface.vtp (Q={Q_threshold:.4g})")
            else:
                logger.warning("Q-criterion iso-surface empty after retry")
    except Exception as e:
        logger.warning(f"Section 5 (Q iso-surface) failed: {e}")

    # ── 6. WAKE CROSS-PLANES ──────────────────────────────────────────────
    try:
        if vol is not None and foil_bbox is not None:
            trailing_edge_x = foil_bbox["x_max"]
            multipliers = [1.0, 1.5, 2.0, 3.0]
            for mult in multipliers:
                try:
                    x_plane = trailing_edge_x + mult * chord_length
                    wake_slice = vol.slice(normal="x", origin=(x_plane, 0, 0))
                    if wake_slice is None or wake_slice.n_points == 0:
                        logger.warning(f"Empty wake plane at {mult}c")
                        continue
                    label = f"{mult:.1f}".replace(".", "_")
                    fname = f"wake_plane_{label}c.vtp"
                    wake_slice.save(str(out_dir / fname))
                    file_manifest[f"wake_plane_{mult}c"] = (
                        f"/media/simulations/{sim_id}/{fname}"
                    )
                except Exception as e:
                    logger.warning(f"Wake plane {mult}c failed: {e}")
            logger.info("Exported wake cross-plane VTPs")
    except Exception as e:
        logger.warning(f"Section 6 (Wake planes) failed: {e}")

    # ── 6b. TIP VORTEX ANALYSIS ───────────────────────────────────────────
    try:
        if vol is not None and foil_surface is not None and foil_bbox is not None:
            tip_vortex_results = analyse_tip_vortex(
                vol,
                foil_surface,
                foil_bbox,
                run={
                    "sim_id": sim_id,
                    "out_dir": out_dir,
                    "velocity": V,
                    "rho": rho,
                    "p_ref": p_ref,
                    "p_vapour": p_vapour,
                },
            )
            results.update(tip_vortex_results)
            if tip_vortex_results:
                json_path = out_dir / "tip_vortex_analysis.json"
                file_manifest["tip_vortex_analysis"] = str(json_path)
    except Exception as e:
        logger.warning(f"Section 6b (Tip vortex analysis) failed: {e}")

    # ── 7. FORCES & MOMENTS ───────────────────────────────────────────────
    try:
        forces_path = case_path / "postProcessing" / "forces"
        if forces_path.is_dir():
            # Parse forces.dat
            time_dirs = sorted(
                (d.name for d in forces_path.iterdir() if d.is_dir()),
                key=lambda s: float(s) if s.replace(".", "", 1).isdigit() else 0.0,
                reverse=True,
            )

            forces_rows = []  # list of (Fx, Fy, Fz)
            moment_rows = []  # list of (Mx, My, Mz)

            def _parse_vector_line(line):
                vectors = []
                buf = ""
                depth = 0
                for ch in line:
                    if ch == "(":
                        depth += 1
                        buf = ""
                    elif ch == ")":
                        if depth > 0:
                            depth -= 1
                            vals = buf.strip().split()
                            if len(vals) == 3:
                                try:
                                    vectors.append([float(v) for v in vals])
                                except Exception:
                                    pass
                    else:
                        if depth > 0:
                            buf += ch
                return vectors

            for td in time_dirs:
                forces_file = forces_path / td / "forces.dat"
                if forces_file.exists():
                    with open(forces_file, "r", encoding="utf-8", errors="ignore") as f:
                        for raw in f:
                            line = raw.strip()
                            if not line or line.startswith("#"):
                                continue
                            vecs = _parse_vector_line(line)
                            if len(vecs) >= 2:
                                pf, vf = vecs[0], vecs[1]
                                forces_rows.append((
                                    pf[0] + vf[0],
                                    pf[1] + vf[1],
                                    pf[2] + vf[2],
                                ))
                    break  # use first (newest) time dir that has data

            for td in time_dirs:
                moment_file = forces_path / td / "moment.dat"
                if moment_file.exists():
                    with open(moment_file, "r", encoding="utf-8", errors="ignore") as f:
                        for raw in f:
                            line = raw.strip()
                            if not line or line.startswith("#"):
                                continue
                            vecs = _parse_vector_line(line)
                            if len(vecs) >= 2:
                                pm, vm = vecs[0], vecs[1]
                                moment_rows.append((
                                    pm[0] + vm[0],
                                    pm[1] + vm[1],
                                    pm[2] + vm[2],
                                ))
                    break

            # Average last 20% of forces
            if forces_rows:
                tail_n = max(1, len(forces_rows) // 5)
                tail = forces_rows[-tail_n:]
                Fx = sum(r[0] for r in tail) / len(tail)
                Fy = sum(r[1] for r in tail) / len(tail)
                Fz = sum(r[2] for r in tail) / len(tail)
                results["Fx_drag"] = Fx
                results["Fy_side"] = Fy
                results["Fz_lift"] = Fz
                results["L_D_ratio"] = Fz / Fx if abs(Fx) > 1e-12 else None

                # CL, CD using planform area from STL bounding box
                planform_area = chord_length * span_length
                if planform_area > 0 and q_inf > 0:
                    results["CL"] = Fz / (q_inf * planform_area)
                    results["CD"] = Fx / (q_inf * planform_area)

            if moment_rows:
                tail_n = max(1, len(moment_rows) // 5)
                tail = moment_rows[-tail_n:]
                Mx = sum(r[0] for r in tail) / len(tail)
                My = sum(r[1] for r in tail) / len(tail)
                Mz = sum(r[2] for r in tail) / len(tail)
                results["Mx_roll"] = Mx
                results["My_pitch"] = My
                results["Mz_yaw"] = Mz

            logger.info(f"Forces & moments parsed: {', '.join(f'{k}={v}' for k, v in results.items() if k.startswith(('F','M','L','C')))}")
        else:
            logger.warning("No postProcessing/forces directory found")
    except Exception as e:
        logger.warning(f"Section 7 (Forces & Moments) failed: {e}")

    # ── 8. WALL Y+ ────────────────────────────────────────────────────────
    try:
        if foil_surface is not None:
            foil_arrays = list(getattr(foil_surface, "point_data", {}).keys())
            yplus_field = None
            for candidate_name in ("yPlus", "yplus", "wallYPlus"):
                if candidate_name in foil_arrays:
                    yplus_field = candidate_name
                    break

            if yplus_field is not None:
                yp = np.asarray(foil_surface.point_data[yplus_field], dtype=np.float64)
                yp_valid = yp[np.isfinite(yp)]
                if len(yp_valid) > 0:
                    yplus_stats = {
                        "max": float(np.max(yp_valid)),
                        "mean": float(np.mean(yp_valid)),
                        "min": float(np.min(yp_valid)),
                    }
                    counts, bin_edges = np.histogram(yp_valid, bins=10)
                    yplus_stats["histogram"] = {
                        "counts": counts.tolist(),
                        "bin_edges": bin_edges.tolist(),
                    }
                    results["yplus_max"] = yplus_stats["max"]
                    results["yplus_mean"] = yplus_stats["mean"]

                    json_path = out_dir / "yplus_stats.json"
                    with open(json_path, "w", encoding="utf-8") as jf:
                        json.dump(yplus_stats, jf, indent=2)
                    file_manifest["yplus_stats"] = (
                        f"/media/simulations/{sim_id}/yplus_stats.json"
                    )
                    logger.info(f"y+ stats: max={yplus_stats['max']:.3f}, mean={yplus_stats['mean']:.3f}")
            else:
                # Fallback: parse from solver log (reuses existing helper)
                yp_max, yp_mean = _parse_yplus(case_dir)
                if yp_max is not None:
                    results["yplus_max"] = yp_max
                if yp_mean is not None:
                    results["yplus_mean"] = yp_mean
    except Exception as e:
        logger.warning(f"Section 8 (Wall y+) failed: {e}")

    # ── convergence series (reuse existing parser) ─────────────────────────
    results["convergence_series"] = _parse_simplefoam_residuals(case_dir)

    logger.info(f"Post-processing complete for sim {sim_id}. Files: {list(file_manifest.keys())}")
    return {"results": results, "file_manifest": file_manifest}


def compute_first_layer_thickness(velocity, nu, char_len, y_plus_target=1.0):
    """
    Flat-plate Cf approximation (Prandtl) for first cell-layer height.

    Re_L  = V * L / nu
    Cf    ≈ 0.026 * Re_L^(-1/7)
    tau_w = 0.5 * rho * V^2 * Cf
    u_tau = sqrt(tau_w / rho)
    y1    = y+ * nu / u_tau
    """
    rho = 1025.0
    Re_L = velocity * char_len / nu
    Cf = 0.026 * Re_L ** (-1.0 / 7.0)
    tau_w = 0.5 * rho * velocity ** 2 * Cf
    u_tau = (tau_w / rho) ** 0.5
    y1 = y_plus_target * nu / u_tau
    return y1


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
        enable_layers = run_data.get('enable_layers', True)
        enable_gravity = run_data.get('enable_gravity', True)
        n_surface_layers = run_data.get('n_surface_layers', 5)
        layer_expansion = run_data.get('layer_expansion', 1.2)
        feature_level = run_data.get('feature_level', 4)

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
        characteristic_len = 1.0  # default; overwritten by STL bounds below
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

                # STL orientation normalisation — align chord→+X, span→+Y, thickness→+Z
                # and apply any user-supplied pitch/roll/yaw correction.
                try:
                    from api.models import SimulationRun as _SR
                    _run_obj = _SR.objects.get(pk=sim_id)
                    normalise_stl_orientation(stl_path, _run_obj)
                    # Reload bounds after orientation change
                    foil_mesh = pv.read(stl_path)
                    bounds = foil_mesh.bounds
                    x_len = max(bounds[1] - bounds[0], 1e-9)
                    y_len = max(bounds[3] - bounds[2], 1e-9)
                    z_len = max(bounds[5] - bounds[4], 1e-9)
                    characteristic_len = max(x_len, y_len, z_len)
                except Exception as e:
                    logger.warning(f"STL orientation normalisation skipped: {e}")

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

        # Compute first boundary-layer cell height from flat-plate Cf approximation
        nu = 1.0e-6  # kinematic viscosity of water (m^2/s)
        y_plus_target = run_data.get('y_plus_target', 1.0)
        y1 = compute_first_layer_thickness(
            velocity=velocity,
            nu=nu,
            char_len=characteristic_len,
            y_plus_target=y_plus_target,
        )
        logger.info(f"Computed first-layer thickness y1={y1:.6e} m (y+={y_plus_target})")

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
            max_iterations=500,
            write_interval=25,
            domain=domain,
            mesh_cells=mesh_cells,
            angle_of_attack=angle_of_attack,
            center_of_gravity=center_of_gravity,
            enable_layers=enable_layers,
            n_surface_layers=n_surface_layers,
            layer_expansion=layer_expansion,
            first_layer_thickness=y1,
            feature_level=feature_level,
            enable_gravity=enable_gravity,
        )

        # Phase 2: MESHING — Feature extraction, then blockMesh, then snappyHexMesh
        logger.info(f"Executing surfaceFeatureExtract in {case_dir}")
        ok, logs = run_and_stream_openfoam(
            sim_id=sim_id,
            case_dir=case_dir,
            cmd=["surfaceFeatureExtract"],
            status="MESHING",
            start_message="Extracting surface features (edge refinement)...",
        )
        if not ok:
            logger.error("surfaceFeatureExtract failed")
            patch_django_status(sim_id, "FAILED", error_log=logs)
            return "Feature Extraction Failed"

        # Locate foil.eMesh — OpenFOAM 11 writes it to constant/triSurface/ by
        # default, but some builds place it in extendedFeatureEdgeMesh/.
        # Resolve wherever it landed and ensure it exists at the canonical path
        # before re-rendering snappyHexMeshDict with eMesh_available=True/False.
        expected_emesh = os.path.join(case_dir, "constant", "triSurface", "foil.eMesh")
        if not os.path.exists(expected_emesh):
            alt_paths = [
                os.path.join(case_dir, "constant", "extendedFeatureEdgeMesh", "foil.eMesh"),
                os.path.join(case_dir, "foil.eMesh"),
            ]
            for candidate in alt_paths:
                if os.path.exists(candidate):
                    shutil.copy2(candidate, expected_emesh)
                    logger.info(f"Copied eMesh from {candidate} to {expected_emesh}")
                    break
            else:
                # Broad fallback walk
                for root, _dirs, files in os.walk(case_dir):
                    for fname in files:
                        if fname.endswith(".eMesh"):
                            shutil.copy2(os.path.join(root, fname), expected_emesh)
                            logger.info(f"Copied eMesh from {root}/{fname} to {expected_emesh}")
                            break
                    else:
                        continue
                    break

        eMesh_available = os.path.exists(expected_emesh)
        if not eMesh_available:
            logger.warning(
                "foil.eMesh not found after surfaceFeatureExtract — "
                "snappyHexMesh will run without feature edge refinement"
            )

        # Re-render snappyHexMeshDict now that eMesh_available is known.
        # This overwrites the initial version written by initialize_case.
        template_manager.write_file("system/snappyHexMeshDict", SHM_TEMPLATE, {
            "loc_x": location_in_mesh[0],
            "loc_y": location_in_mesh[1],
            "loc_z": location_in_mesh[2],
            "enable_layers": enable_layers,
            "n_surface_layers": n_surface_layers,
            "layer_expansion": layer_expansion,
            "first_layer_thickness": y1,
            "feature_level": feature_level,
            "eMesh_available": eMesh_available,
        })

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
             
        # 4. Phase 4: Full Post-Processing Pipeline
        patch_django_status(sim_id, None, error_log="Running post-processing pipeline...")

        pp = post_process(
            case_dir, sim_id,
            velocity=velocity,
            rho=density,
            p_vapour=run_data.get("p_vapour"),
        )
        pp_results = pp.get("results", {})
        pp_manifest = pp.get("file_manifest", {})

        # Write results_manifest.json to simulation output directory
        media_root = os.environ.get("DJANGO_MEDIA_ROOT", "/data/media")
        out_dir = os.path.join(media_root, "simulations", str(sim_id))
        os.makedirs(out_dir, exist_ok=True)
        manifest_path = os.path.join(out_dir, "results_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(pp_manifest, f, indent=2)

        # Map post_process result keys to model field names
        KEY_MAP = {
            "CL": "cl", "CD": "cd", "L_D_ratio": "l_d_ratio",
            "My_pitch": "cm_pitch", "Mx_roll": "roll_moment", "Mz_yaw": "yaw_moment",
            "yplus_max": "wall_yplus_max", "yplus_mean": "wall_yplus_mean",
        }
        normalized = {}
        for k, v in pp_results.items():
            normalized[KEY_MAP.get(k, k)] = v

        # Build scalar_fields keeping only keys that match actual model fields
        from api.models import SimulationRun
        model_fields = {f.name for f in SimulationRun._meta.get_fields()}
        scalar_fields = {k: v for k, v in normalized.items() if k in model_fields}
        scalar_fields["file_manifest"] = pp_manifest

        SimulationRun.objects.filter(id=sim_id).update(**scalar_fields)

        # Patch status to COMPLETED via HTTP (keeps existing status-patching pattern)
        completed_payload = {
            "status": "COMPLETED",
            "current_logs": "Simulation Success",
            "convergence_series": pp_results.get("convergence_series", []),
        }
        if "foil_surface_stl" in pp_manifest:
            completed_payload["result_mesh_path"] = pp_manifest["foil_surface_stl"]
        elif "foil_surface" in pp_manifest:
            completed_payload["result_mesh_path"] = pp_manifest["foil_surface"]

        try:
            requests.patch(f"{DJANGO_API_URL}/{sim_id}/", json=completed_payload)
        except Exception as e:
            logger.error(f"Failed to patch completed status: {e}")
        return f"Simulation {sim_id} Finished"

    except DivergenceError:
        # Expected exit during SIGTERM guardrail
        return f"Simulation {sim_id} Halted due to divergence"
    except Exception as e:
        logger.error(f"Error processing Simulation {sim_id}: {e}")
        patch_django_status(sim_id, "FAILED", error_log=str(e))
        raise e
