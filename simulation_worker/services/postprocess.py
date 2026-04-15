"""Post-processing pipeline for OpenFOAM results."""
import logging
import os
import numpy as np
import pyvista as pv
from pathlib import Path

from config import DJANGO_MEDIA_ROOT
from parsers.yplus import _parse_yplus

logger = logging.getLogger(__name__)


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
            Q_arr = np.asarray(vol.point_data["Q_criterion"], dtype=np.float64)
            Q_pos = Q_arr[Q_arr > 0]

            iso = None

            if Q_pos.size > 0:
                # Start with the physics-based threshold
                Q_threshold = 10.0 * (V / chord_length) ** 2

                # Progressively lower the threshold if isosurface is empty
                for attempt in range(5):
                    iso = vol.contour(isosurfaces=[Q_threshold], scalars="Q_criterion")
                    if iso is not None and iso.n_points > 0:
                        break
                    Q_threshold *= 0.25
                    logger.info(f"Q iso attempt {attempt+1}: lowering threshold to {Q_threshold:.4g}")

                # If still empty, fall back to a percentile of the positive Q values
                if iso is None or iso.n_points == 0:
                    Q_threshold = float(np.percentile(Q_pos, 95))
                    iso = vol.contour(isosurfaces=[Q_threshold], scalars="Q_criterion")
                    logger.info(f"Q iso percentile fallback: threshold={Q_threshold:.4g}, pts={iso.n_points if iso else 0}")

                # If too dense, raise threshold to reduce point count
                if iso is not None and iso.n_points > 50000:
                    Q_threshold *= 3.0
                    iso = vol.contour(isosurfaces=[Q_threshold], scalars="Q_criterion")
                if iso is not None and iso.n_points > 50000:
                    Q_threshold = float(np.percentile(Q_pos, 99))
                    iso = vol.contour(isosurfaces=[Q_threshold], scalars="Q_criterion")
            else:
                logger.warning("No positive Q-criterion values — skipping isosurface")

            if iso is not None and iso.n_points > 0:
                # Sample volume fields onto isosurface for coloring
                if "vorticity_mag" in vol.array_names or "vorticity_x" in vol.array_names:
                    iso = iso.sample(vol)

                # Clip to foil + near-wake region to remove far-field noise
                if foil_bbox is not None:
                    chord = foil_bbox["x_max"] - foil_bbox["x_min"]
                    # Include the full foil extent plus wake downstream
                    iso = iso.clip_box(
                        bounds=[
                            foil_bbox["x_min"] - chord, foil_bbox["x_max"] + 5 * chord,  # x: foil + wake
                            foil_bbox["y_min"] - chord, foil_bbox["y_max"] + chord,  # y: spanwise
                            foil_bbox["z_min"] - 2 * chord, foil_bbox["z_max"] + 2 * chord,  # z: depth
                        ],
                        invert=False,
                    )
                    logger.info(f"Clipped isosurface to foil+wake region ({iso.n_points} pts remaining)")

                if iso is not None and iso.n_points > 0:
                    # clip_box may return UnstructuredGrid; convert for .vtp
                    if not isinstance(iso, pv.PolyData):
                        iso = iso.extract_surface()
                    iso_path = out_dir / "q_criterion_isosurface.vtp"
                    iso.save(str(iso_path))
                    file_manifest["q_criterion_isosurface"] = (
                        f"/media/simulations/{sim_id}/q_criterion_isosurface.vtp"
                    )
                    results["Q_threshold"] = Q_threshold
                    logger.info(f"Exported q_criterion_isosurface.vtp (Q={Q_threshold:.4g}, {iso.n_points} pts)")
                else:
                    logger.warning("Q-criterion isosurface empty after wake clipping")
            else:
                logger.warning("Q-criterion iso-surface empty after threshold adjustment")
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

# ── Helper functions ────────────────────────────────────────────────────────────


def _find_block(dataset, name):
    """Extract named block from MultiBlock dataset."""
    if not isinstance(dataset, pv.MultiBlock):
        return None
    try:
        blk = dataset.get(name)
        if blk is not None:
            return blk
    except Exception:
        pass

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
    """Extract first block whose name contains substring."""
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
            if isinstance(nm, str) and nm is not None and substring in nm and block is not None:
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


def compute_skin_friction_lines(foil_surface, case_dir, run):
    """Compute skin friction coefficient (Cf) lines on foil surface.

    Uses wallShearStress to compute skin friction coefficient.
    Returns path to output VTP file or None on failure.
    """
    try:
        sim_id = run["sim_id"]
        out_dir = Path(DJANGO_MEDIA_ROOT) / "simulations" / str(sim_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        V = run["velocity"]
        rho = run["rho"]
        q_inf = 0.5 * rho * V * V

        foil_arrays = list(getattr(foil_surface, "point_data", {}).keys())
        if "wallShearStress" not in foil_arrays:
            return None

        import vtk
        wss = np.asarray(foil_surface.point_data["wallShearStress"])
        wss_mag = np.linalg.norm(wss, axis=1)
        foil_surface.point_data["Cf"] = wss_mag / q_inf if q_inf > 0 else wss_mag

        sf_fname = "skin_friction.vtp"
        sf_path = out_dir / sf_fname
        foil_surface.copy().save(str(sf_path))
        return f"/media/simulations/{sim_id}/{sf_fname}"
    except Exception as e:
        logger.warning(f"compute_skin_friction_lines failed: {e}")
        return None


def analyse_tip_vortex(vol_mesh, foil_surface, foil_bbox, run):
    """Analyze tip vortex formation at foil trailing edge.

    Returns dict with vortex strength metrics or empty dict on failure.
    """
    try:
        sim_id = run["sim_id"]
        out_dir = Path(DJANGO_MEDIA_ROOT) / "simulations" / str(sim_id)
        out_dir.mkdir(parents=True, exist_ok=True)
        V = run["velocity"]
        rho = run["rho"]
        p_ref = run.get("p_ref", 0.0)
        p_vapour = run.get("p_vapour")

        q_inf = 0.5 * rho * V * V

        # Extract trailing edge region (z_max + small margin)
        z_max = foil_bbox.get("z_max", 1.0)
        threshold = z_max + 0.1

        clipper = vol_mesh.clip("-z", value=threshold)
        if clipper is None or clipper.n_points == 0:
            return {}

        # Find minimum pressure region for vortex strength estimation
        vol_arrays = list(getattr(clipper, "point_data", {}).keys())
        p_name = "pMean" if "pMean" in vol_arrays else ("p" if "p" in vol_arrays else None)

        if p_name is None:
            return {}

        clipper = _ensure_point_data(clipper)
        p_arr = np.asarray(clipper.point_data[p_name])
        p_min = float(np.nanmin(p_arr))

        # Cavitation number estimate
        result = {"p_min": p_min}
        if p_vapour is not None:
            result["cavitation_number"] = (p_ref - p_vapour) / q_inf

        return result
    except Exception as e:
        logger.warning(f"analyse_tip_vortex failed: {e}")
        return {}


def _parse_simplefoam_residuals(case_dir) -> list:
    """Parse simpleFoam (foamRun) solver residuals from log file.

    Handles OpenFOAM 11 log format:
      Time = 1s
      smoothSolver:  Solving for Ux, Initial residual = 0.123, Final residual = ...

    Returns:
        list: Convergence series with iteration, time, and max initial residual.
    """
    import re
    from pathlib import Path

    log_file = Path(case_dir) / "log.simpleFoam"
    if not log_file.exists():
        return []

    series = []
    current_time = None
    current_residuals = {}

    # Matches "Time = 1s" or "Time = 1.5" (unit suffix optional)
    time_pattern = re.compile(r"^Time\s*=\s*([\d.eE+]+)")
    # Matches "Solving for Ux, Initial residual = 0.123, ..."
    residual_pattern = re.compile(
        r"Solving for (\w+),\s*Initial residual\s*=\s*([\d.eE+-]+)"
    )

    try:
        with open(log_file, 'r') as f:
            for line in f:
                time_match = time_pattern.match(line)
                if time_match:
                    if current_time is not None and current_residuals:
                        max_residual = max(current_residuals.values())
                        series.append({
                            "iteration": len(series),
                            "time": current_time,
                            "residual": max_residual,
                        })
                    current_time = float(time_match.group(1))
                    current_residuals = {}
                    continue

                residual_match = residual_pattern.search(line)
                if residual_match and current_time is not None:
                    field = residual_match.group(1)
                    value = float(residual_match.group(2))
                    # Keep the first (i.e. initial) value for each field per step
                    if field not in current_residuals:
                        current_residuals[field] = value

        if current_time is not None and current_residuals:
            series.append({
                "iteration": len(series),
                "time": current_time,
                "residual": max(current_residuals.values()),
            })
    except Exception as e:
        logger.warning(f"_parse_simplefoam_residuals failed: {e}")

    return series
