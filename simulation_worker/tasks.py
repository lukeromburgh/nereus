"""Celery tasks for hydrofoil CFD simulation.

This module is the entry point for Celery workers. It orchestrates the
simulation workflow by delegating to focused service modules:

- config: Celery app and Django bootstrap
- status: Status patching helpers
- geometry: STL conversion and orientation
- parsers: Forces and residuals parsing
- extractors: Temporal frame extraction
- services: Post-processing and OpenFOAM utilities
"""

import logging
import math
import os
import subprocess
import glob
import re


from config import (
    app,
    DJANGO_MEDIA_ROOT,
    broker_url,
    result_backend,
)
from status import patch_django_status, DivergenceError
from geometry import _ensure_foil_stl, normalise_stl_orientation
from parsers.forces import parse_forces, build_metrics_series, compute_lift_drag_ratio
from extractors.temporal import extract_temporal_frames
from services.postprocess import post_process
from services.openfoam import compute_first_layer_thickness

import json
import pyvista

logger = logging.getLogger(__name__)

DOMAIN_UPSTREAM_MULTIPLIER = 5.0
DOMAIN_DOWNSTREAM_MULTIPLIER = 10.0
DOMAIN_LATERAL_MULTIPLIER = 5.0
CHECK_MESH_MAX_NON_ORTHOGONALITY = 70.0
CHECK_MESH_MAX_SKEWNESS = 4.0


@app.task(name='tasks.run_hydro_simulation', bind=True)
def run_hydro_simulation(self, sim_id):
    """Main Celery task for running hydrofoil CFD simulation.

    This task orchestrates the full simulation pipeline:
    1. Case initialization and geometry setup
    2. Domain and mesh configuration
    3. snappyHexMesh execution
    4. simpleFoam solver execution
    5. Post-processing pipeline
    6. Temporal frame extraction
    7. Results persisted to the Django ORM
    """
    logger.info(f"Received Simulation request: {sim_id}")
    case_dir = f"/data/simulations/{sim_id}"
    mesh_quality_summary = None

    try:
        # Phase 1: Initialize Case
        patch_django_status(sim_id, "PENDING", error_log="Initializing Job Configuration...")
        os.makedirs(case_dir, exist_ok=True)

        # Pull parameters from the Django ORM (authoritative source for worker execution).
        from api.models import SimulationRun as _SR
        run_obj_init = _SR.objects.get(id=sim_id)

        def _get(orm_attr, _rest_key, default):
            """Return ORM value if set, else default."""
            orm_val = getattr(run_obj_init, orm_attr, None)
            if orm_val is not None:
                return orm_val
            return default

        velocity = _get('velocity', 'velocity', 10.0)
        density = _get('water_density', 'water_density', 1025.0)
        mesh_density = _get('mesh_density', 'mesh_density', 1.0)
        angle_of_attack = _get('angle_of_attack', 'angle_of_attack', 0.0)
        center_of_gravity = _get('center_of_gravity', 'center_of_gravity', [0, 0, 0])
        submersion_depth = _get('submersion_depth', 'submersion_depth', 0.5)
        enable_layers = _get('enable_layers', 'enable_layers', True)
        enable_gravity = _get('enable_gravity', 'enable_gravity', True)
        n_surface_layers = _get('n_surface_layers', 'n_surface_layers', 5)
        layer_expansion = _get('layer_expansion', 'layer_expansion', 1.2)
        feature_level = _get('feature_level', 'feature_level', 4)

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

        mesh_density = max(0.5, min(2.0, mesh_density))

        if mesh_density >= 1.5 and feature_level < 5:
            feature_level = 5

        # Phase 1.5: Pre-Flight Surface Check & Dynamic Bounding Box
        characteristic_len = 1.0
        stl_path = _ensure_foil_stl(case_dir)
        default_domain = {
            "x_min": -5.0, "x_max": 15.0,
            "y_min": -2.0, "y_max": 2.0,
            "z_min": -2.0, "z_max": 2.0,
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
                sim_id, "FAILED",
                error_log="No hydrofoil STL found. Upload an asset so /data/simulations/<id>/constant/triSurface/foil.stl exists.",
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

            # ── Step A: Unit scaling (before orientation) ─────────────
            foil_mesh = pyvista.read(stl_path)
            bounds = foil_mesh.bounds
            x_len = max(bounds[1] - bounds[0], 1e-9)
            y_len = max(bounds[3] - bounds[2], 1e-9)
            z_len = max(bounds[5] - bounds[4], 1e-9)
            characteristic_len = max(x_len, y_len, z_len)

            if characteristic_len > 10.0:
                logger.warning("STL appears to be in millimeters; scaling by 0.001")
                foil_mesh = foil_mesh.scale([0.001, 0.001, 0.001], inplace=False)
                foil_mesh.save(stl_path)

            # ── Step B: Orientation correction (rotates + re-centers) ─
            # This MUST happen before domain sizing so that the bounding
            # box and locationInMesh reflect the final foil position.
            patch_django_status(sim_id, None, error_log="Applying orientation correction...")
            from api.models import SimulationRun
            try:
                # Refresh from DB to get the latest pitch/roll/yaw values
                run_obj = SimulationRun.objects.get(id=sim_id)
                norm_info = normalise_stl_orientation(stl_path, run_obj)
                run_obj.detected_span_axis = norm_info['axes'].get('detected_span_axis')
                run_obj.detected_up_axis = norm_info['axes'].get('detected_up_axis')
                run_obj.chord_m = norm_info['dimensions'].get('chord_m')
                run_obj.span_m = norm_info['dimensions'].get('span_m')
                run_obj.thickness_m = norm_info['dimensions'].get('thickness_m')
                run_obj.save(update_fields=[
                    'detected_chord_axis', 'detected_span_axis', 'detected_up_axis',
                    'chord_m', 'span_m', 'thickness_m',
                ])
            except SimulationRun.DoesNotExist:
                logger.warning(f"SimulationRun {sim_id} not found for orientation update")
            except Exception as e:
                logger.warning(f"Orientation update failed: {e}")

            # ── Step C: Re-read corrected STL for domain sizing ───────
            # The STL on disk now has the final orientation + centering.
            foil_mesh = pyvista.read(stl_path)
            bounds = foil_mesh.bounds
            x_len = max(bounds[1] - bounds[0], 1e-9)
            y_len = max(bounds[3] - bounds[2], 1e-9)
            z_len = max(bounds[5] - bounds[4], 1e-9)
            characteristic_len = max(x_len, y_len, z_len)

            domain, location_in_mesh = _build_domain_from_bounds(bounds)

            mesh_cells = {
                "nx": max(60, int(40 * mesh_density)),
                "ny": max(30, int(20 * mesh_density)),
                "nz": max(30, int(20 * mesh_density)),
            }

        # Phase 2: Generate OpenFOAM Case
        patch_django_status(sim_id, None, error_log="Generating OpenFOAM Case Files...")
        from template_manager import TemplateManager

        nu = 1.0e-6  # water kinematic viscosity (m²/s)
        y1 = compute_first_layer_thickness(velocity, nu, characteristic_len, y_plus_target=1.0)

        patch_django_status(sim_id, None, error_log=f"First layer thickness: {y1:.4e} m")

        tmpl = TemplateManager(case_dir)
        tmpl.initialize_case(
            velocity=velocity,
            water_density=density,
            location_in_mesh=location_in_mesh,
            max_iterations=1000,
            write_interval=50,
            domain=domain,
            mesh_cells=mesh_cells,
            nu=nu,
            angle_of_attack=angle_of_attack,
            center_of_gravity=center_of_gravity,
            enable_layers=enable_layers,
            n_surface_layers=n_surface_layers,
            layer_expansion=layer_expansion,
            first_layer_thickness=y1,
            feature_level=feature_level,
            enable_gravity=enable_gravity,
            chord_m=characteristic_len,
        )
        patch_django_status(sim_id, "MESHING", error_log="Mesh Generation Started...")

        # Phase 3: Run meshing pipeline
        logs = ""
        patch_django_status(sim_id, "MESHING", error_log="Running blockMesh...")
        mesh_ok = _run_command(
            ["blockMesh"],
            cwd=case_dir,
            sim_id=sim_id,
            status_prefix="MESHING",
        )
        if not mesh_ok:
            patch_django_status(sim_id, "FAILED", error_log="blockMesh Failed")
            return "Mesh Failed"

        patch_django_status(sim_id, "MESHING", error_log="Running surfaceFeatureExtract...")
        _run_command(
            ["surfaceFeatureExtract"],
            cwd=case_dir,
            sim_id=sim_id,
            status_prefix="MESHING",
        )

        patch_django_status(sim_id, "MESHING", error_log="Running snappyHexMesh...")
        mesh_ok = _run_command(
            ["snappyHexMesh", "-overwrite"],
            cwd=case_dir,
            sim_id=sim_id,
            status_prefix="MESHING",
            divergence_guardrail=False,
        )
        if not mesh_ok:
            patch_django_status(sim_id, "FAILED", error_log="snappyHexMesh Failed")
            return "Mesh Failed"

        patch_django_status(sim_id, "MESHING", error_log="Running checkMesh...")
        mesh_quality_summary = _run_check_mesh(case_dir, sim_id)
        if not mesh_quality_summary["mesh_ok"]:
            patch_django_status(
                sim_id,
                "FAILED",
                error_log=_format_mesh_quality_summary(mesh_quality_summary),
            )
            return "Mesh Quality Failed"

        # Phase 4: Run simpleFoam Solver
        patch_django_status(sim_id, "RUNNING", error_log="Starting Solver...")
        ok = _run_command(
            ["simpleFoam"],
            cwd=case_dir,
            sim_id=sim_id,
            status_prefix="RUNNING",
            divergence_guardrail=True,
            log_file=os.path.join(case_dir, "log.simpleFoam"),
        )
        if not ok:
            logger.error("simpleFoam failed")
            patch_django_status(sim_id, "FAILED", error_log=logs)
            return "Solver Failed"

        # Phase 5: Post-Processing Pipeline
        patch_django_status(sim_id, None, error_log="Running post-processing pipeline...")

        pp = post_process(
            case_dir, sim_id,
            velocity=velocity,
            rho=density,
            p_vapour=None,
        )
        pp_results = pp.get("results", {})
        pp_manifest = pp.get("file_manifest", {})
        if mesh_quality_summary is not None:
            pp_manifest["mesh_quality"] = mesh_quality_summary

        # Write results_manifest.json
        out_dir = os.path.join(DJANGO_MEDIA_ROOT, "simulations", str(sim_id))
        os.makedirs(out_dir, exist_ok=True)
        manifest_path = os.path.join(out_dir, "results_manifest.json")
        import json
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

        # Update Django model
        from api.models import SimulationRun
        model_fields = {f.name for f in SimulationRun._meta.get_fields()}
        scalar_fields = {k: v for k, v in normalized.items() if k in model_fields}
        scalar_fields["file_manifest"] = pp_manifest
        SimulationRun.objects.filter(id=sim_id).update(**scalar_fields)

        # Phase 6: Temporal Frame Extraction
        patch_django_status(sim_id, None, error_log="Extracting temporal frames...")
        try:
            temporal = extract_temporal_frames(
                case_dir, sim_id,
                velocity=velocity,
                rho=density,
                max_frames=10,
            )
        except Exception as e:
            logger.warning(f"Temporal frame extraction failed: {e}")
            temporal = {}

        temporal_frame_mapping = temporal.get("frame_mapping", [])
        temporal_seq_path = temporal.get("result_sequence_path")

        # Build completion payload
        completed_payload = {
            "status": "COMPLETED",
            "current_logs": "Simulation Success",
            "convergence_series": pp_results.get("convergence_series", []),
        }

        # Build metrics_series from OpenFOAM forces.dat
        forces_by_time = parse_forces(case_dir)
        if forces_by_time:
            completed_payload["metrics_series"] = build_metrics_series(forces_by_time)

        # Enrich per-frame metrics from forces.dat when Cp integration yielded nulls
        if temporal_frame_mapping and forces_by_time:
            sorted_force_times = sorted(forces_by_time.keys())
            for frame in temporal_frame_mapping:
                fm = frame.get("metrics", {})
                if fm.get("Fx") is not None:
                    continue
                tv = frame.get("time_value")
                if tv is None:
                    continue
                tv = float(tv)
                best_t = min(sorted_force_times, key=lambda ft: abs(ft - tv))
                if abs(best_t - tv) <= max(1.0, tv * 0.1):
                    fe = forces_by_time[best_t]
                    fx = fe.get("Fx")
                    fy = fe.get("Fy")
                    fz = fe.get("Fz")
                    ld = compute_lift_drag_ratio(fx, fz)
                    frame["metrics"] = {"Fx": fx, "Fy": fy, "Fz": fz, "ld_ratio": ld}

        if temporal_frame_mapping:
            completed_payload["frame_mapping"] = temporal_frame_mapping
        if temporal_seq_path:
            completed_payload["result_sequence_path"] = temporal_seq_path

        # Prefer VTP (has scalar data like Cp) over STL (geometry only)
        if "foil_surface" in pp_manifest:
            completed_payload["result_mesh_path"] = pp_manifest["foil_surface"]
        elif "foil_surface_stl" in pp_manifest:
            completed_payload["result_mesh_path"] = pp_manifest["foil_surface_stl"]

        if not patch_django_status(
            sim_id,
            status="COMPLETED",
            error_log=completed_payload.get("current_logs"),
            result_mesh_path=completed_payload.get("result_mesh_path"),
            result_sequence_path=completed_payload.get("result_sequence_path"),
            frame_mapping=completed_payload.get("frame_mapping"),
            metrics_series=completed_payload.get("metrics_series"),
            convergence_series=completed_payload.get("convergence_series"),
        ):
            logger.error(f"Failed to persist completed status for simulation {sim_id}")

        return f"Simulation {sim_id} Finished"

    except DivergenceError:
        return f"Simulation {sim_id} Halted due to divergence"
    except Exception as e:
        logger.error(f"Error processing Simulation {sim_id}: {e}")
        patch_django_status(sim_id, "FAILED", error_log=str(e))
        raise e


# ── Internal helpers ────────────────────────────────────────────────────────────


def _run_command(cmd, cwd, sim_id, status_prefix=None, divergence_guardrail=False, log_file=None):
    """Run an OpenFOAM command and stream logs to Django.

    If *log_file* is given the full stdout is also written to that path so that
    post-processing helpers (e.g. residuals parser) can read it afterwards.
    """
    logs = []
    proc = subprocess.Popen(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    MAX_LINES = 2000
    div_threshold = 1e6

    log_fh = open(log_file, 'w') if log_file else None
    try:
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            logs.append(line.rstrip())
            if log_fh:
                log_fh.write(line)
                log_fh.flush()

            if len(logs) > MAX_LINES:
                logs = logs[-MAX_LINES:]

            if divergence_guardrail:
                import re
                res_match = re.search(r"GLOBALLY\s+(\d+\.\d+)", line)
                if res_match:
                    try:
                        residual = float(res_match.group(1))
                        if residual > div_threshold:
                            logger.error(f"Divergence detected: residual={residual}")
                            proc.terminate()
                            raise DivergenceError(f"Residual exploded to {residual}")
                    except ValueError:
                        pass

            if len(logs) % 20 == 0 and status_prefix:
                patch_django_status(sim_id, status_prefix, error_log=logs[-1])
    finally:
        if log_fh:
            log_fh.close()

    proc.wait()
    if status_prefix:
        patch_django_status(sim_id, status_prefix, error_log=logs[-1] if logs else "Complete")

    return proc.returncode == 0


def _build_domain_from_bounds(bounds):
    """Derive an external-flow domain from foil bounds.

    The far-field envelope follows the product requirement:
    5x chord upstream, 10x downstream, and 5x chord laterally.
    """
    x_min, x_max, y_min, y_max, z_min, z_max = [float(value) for value in bounds]
    chord_approx = max(x_max - x_min, 1e-9)
    upstream = DOMAIN_UPSTREAM_MULTIPLIER * chord_approx
    downstream = DOMAIN_DOWNSTREAM_MULTIPLIER * chord_approx
    lateral = DOMAIN_LATERAL_MULTIPLIER * chord_approx

    domain = {
        "x_min": x_min - upstream,
        "x_max": x_max + downstream,
        "y_min": y_min - lateral,
        "y_max": y_max + lateral,
        "z_min": z_min - lateral,
        "z_max": z_max + lateral,
    }

    location_in_mesh = (
        domain["x_min"] + 0.1 * (domain["x_max"] - domain["x_min"]),
        0.5 * (domain["y_min"] + domain["y_max"]),
        0.5 * (domain["z_min"] + domain["z_max"]),
    )
    return domain, location_in_mesh


def _parse_check_mesh_output(output):
    """Extract a compact quality summary from checkMesh output."""
    non_orth_match = re.search(
        r"Mesh\s+non-orthogonality\s+Max:\s*([\d.eE+\-]+)\s+average:\s*([\d.eE+\-]+)",
        output,
        re.IGNORECASE,
    )
    skew_match = re.search(r"Max\s+skewness\s*=\s*([\d.eE+\-]+)", output, re.IGNORECASE)
    aspect_match = re.search(r"Max\s+aspect\s+ratio\s*=\s*([\d.eE+\-]+)", output, re.IGNORECASE)
    failed_match = re.search(r"Failed\s+(\d+)\s+mesh\s+checks", output, re.IGNORECASE)

    return {
        "max_non_orthogonality": float(non_orth_match.group(1)) if non_orth_match else None,
        "average_non_orthogonality": float(non_orth_match.group(2)) if non_orth_match else None,
        "max_skewness": float(skew_match.group(1)) if skew_match else None,
        "max_aspect_ratio": float(aspect_match.group(1)) if aspect_match else None,
        "failed_checks": int(failed_match.group(1)) if failed_match else 0,
        "reported_mesh_ok": bool(re.search(r"Mesh\s+OK\.", output, re.IGNORECASE)),
    }


def _mesh_quality_is_acceptable(summary):
    """Return whether mesh quality passes the minimum external-flow thresholds."""
    issues = []

    if summary.get("failed_checks", 0) > 0:
        issues.append(f"{summary['failed_checks']} mesh checks failed")

    max_non_orthogonality = summary.get("max_non_orthogonality")
    if max_non_orthogonality is not None and max_non_orthogonality > CHECK_MESH_MAX_NON_ORTHOGONALITY:
        issues.append(
            f"max non-orthogonality {max_non_orthogonality:.1f} exceeds {CHECK_MESH_MAX_NON_ORTHOGONALITY:.1f}"
        )

    max_skewness = summary.get("max_skewness")
    if max_skewness is not None and max_skewness > CHECK_MESH_MAX_SKEWNESS:
        issues.append(f"max skewness {max_skewness:.2f} exceeds {CHECK_MESH_MAX_SKEWNESS:.2f}")

    return len(issues) == 0, issues


def _format_mesh_quality_summary(summary):
    status = "OK" if summary.get("mesh_ok") else "FAILED"
    parts = [f"checkMesh {status}"]

    if summary.get("max_non_orthogonality") is not None:
        avg_non_orthogonality = summary.get("average_non_orthogonality")
        parts.append(
            "non-orth max "
            f"{summary['max_non_orthogonality']:.1f}"
            + (
                f" avg {avg_non_orthogonality:.1f}"
                if avg_non_orthogonality is not None
                else ""
            )
        )

    if summary.get("max_skewness") is not None:
        parts.append(f"skew {summary['max_skewness']:.2f}")

    if summary.get("max_aspect_ratio") is not None:
        parts.append(f"aspect ratio {summary['max_aspect_ratio']:.1f}")

    if summary.get("issues"):
        parts.append("issues: " + "; ".join(summary["issues"]))

    return " | ".join(parts)


def _run_check_mesh(cwd, sim_id):
    """Run checkMesh after snappyHexMesh and return a parsed quality summary."""
    proc = subprocess.run(
        ["checkMesh", "-allGeometry", "-allTopology"],
        cwd=cwd,
        capture_output=True,
        text=True,
    )
    output = "\n".join(part for part in [proc.stdout, proc.stderr] if part).strip()
    log_path = os.path.join(cwd, "log.checkMesh")
    with open(log_path, "w", encoding="utf-8") as handle:
        handle.write(output)

    summary = _parse_check_mesh_output(output)
    summary["returncode"] = proc.returncode
    mesh_ok, issues = _mesh_quality_is_acceptable(summary)
    if proc.returncode != 0:
        issues = [*issues, f"checkMesh exited with code {proc.returncode}"]
        mesh_ok = False

    summary["issues"] = issues
    summary["mesh_ok"] = mesh_ok
    patch_django_status(sim_id, "MESHING", error_log=_format_mesh_quality_summary(summary))
    return summary
