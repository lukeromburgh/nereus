"""Temporal VTP frame extraction from OpenFOAM results."""
import logging
import os
import numpy as np
import pyvista as pv

from config import DJANGO_MEDIA_ROOT

logger = logging.getLogger(__name__)


def extract_temporal_frames(case_dir, sim_id, *, velocity, rho=1025.0, max_frames=10):
    """Extract temporal VTP frames with Cp data for convergence visualization.

    Reads the last ``max_frames`` time steps from the OpenFOAM case, extracts the
    foil boundary surface with Cp, and saves VTP + STL per frame.  Also extracts
    flow lines (skin friction lines from wallShearStress or streamLines).

    Returns
    -------
    dict
        ``frame_mapping`` — list of per-frame dicts for the Django model.
        ``result_sequence_path`` — path to the results_sequence.json file.
    """
    import json
    from pathlib import Path

    logger.info(f"Extracting temporal frames for sim {sim_id}")

    case_path = Path(case_dir)
    media_root = Path(os.environ.get("DJANGO_MEDIA_ROOT", "/data/media"))
    out_dir = media_root / "simulations" / str(sim_id)
    out_dir.mkdir(parents=True, exist_ok=True)

    V = float(velocity)
    q_inf = 0.5 * rho * V * V

    # ── Read case ─────────────────────────────────────────────────────────
    foam_file = case_path / "case.foam"
    foam_file.touch()

    reader = pv.OpenFOAMReader(str(foam_file))
    for method_name in ("enable_all_cell_arrays", "enable_all_point_arrays", "enable_all_arrays"):
        fn = getattr(reader, method_name, None)
        if callable(fn):
            try:
                fn()
            except Exception:
                pass

    time_values = list(getattr(reader, "time_values", []) or [])
    if not time_values:
        logger.warning("No time steps found — cannot extract temporal frames")
        return {"frame_mapping": [], "result_sequence_path": None}

    # Select the last N time values (skip time 0 if possible)
    non_zero = [t for t in time_values if t > 0]
    if len(non_zero) > max_frames:
        step = max(1, len(non_zero) // max_frames)
        selected = non_zero[::step][-max_frames:]
    else:
        selected = non_zero if non_zero else time_values[-1:]

    def _find_block(dataset, name):
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
        pkeys = list(getattr(mesh_obj, "point_data", {}).keys())
        ckeys = list(getattr(mesh_obj, "cell_data", {}).keys())
        if not pkeys and ckeys:
            return mesh_obj.cell_data_to_point_data()
        return mesh_obj

    # ── Determine p_ref from outlet at last time step ─────────────────────
    reader.set_active_time_value(time_values[-1])
    mesh_last = reader.read()
    boundary_block = _find_block(mesh_last, "boundary")
    outlet_surface = None
    if boundary_block is not None:
        outlet_surface = _find_block(boundary_block, "outlet")
        if outlet_surface is None:
            outlet_surface = _find_block_containing(boundary_block, "outlet")

    # Detect mean fields
    internal_mesh = _find_block(mesh_last, "internalMesh")
    if internal_mesh is None:
        internal_mesh = _find_block_containing(mesh_last, "internal")
    use_mean_fields = False
    if internal_mesh is not None:
        all_arrays = list(getattr(internal_mesh, "point_data", {}).keys()) + \
                     list(getattr(internal_mesh, "cell_data", {}).keys())
        if "UMean" in all_arrays and "pMean" in all_arrays:
            use_mean_fields = True
    p_name = "pMean" if use_mean_fields else "p"

    p_ref = 0.0
    if outlet_surface is not None:
        outlet_surface = _ensure_point_data(outlet_surface)
        out_arrays = list(getattr(outlet_surface, "point_data", {}).keys())
        if p_name in out_arrays:
            p_ref = float(np.nanmean(outlet_surface.point_data[p_name]))
        elif "p" in out_arrays:
            p_ref = float(np.nanmean(outlet_surface.point_data["p"]))

    # ── Iterate time steps ────────────────────────────────────────────────
    frame_mapping = []
    sequence_data = {"frames": [], "sim_id": sim_id}

    for idx, t_val in enumerate(selected):
        frame_tag = f"{idx:03d}"
        try:
            reader.set_active_time_value(t_val)
            mesh = reader.read()
        except Exception as e:
            logger.warning(f"Frame {idx} (t={t_val}): failed to read — {e}")
            continue

        # ── Extract foil boundary ─────────────────────────────────────
        bnd = _find_block(mesh, "boundary")
        foil = None
        if bnd is not None:
            foil = _find_block(bnd, "foil")
            if foil is None:
                foil = _find_block_containing(bnd, "foil")
        if foil is None:
            foil = _find_block_containing(mesh, "foil")
        if foil is None:
            logger.warning(f"Frame {idx}: no foil boundary found")
            continue

        foil = _ensure_point_data(foil)

        # ── Compute Cp ────────────────────────────────────────────────
        foil_arrays = list(getattr(foil, "point_data", {}).keys())
        p_field = p_name if p_name in foil_arrays else ("p" if "p" in foil_arrays else None)
        if p_field is not None and q_inf > 0:
            p_arr = np.asarray(foil.point_data[p_field], dtype=np.float64)
            Cp = (p_arr - p_ref) / (q_inf / rho)
            foil.point_data["Cp"] = Cp

        # ── Save VTP (with scalars) and STL (geometry only) ───────────
        vtp_fname = f"frame_{frame_tag}.vtp"
        stl_fname = f"frame_{frame_tag}.stl"

        vtp_path = out_dir / vtp_fname
        stl_path = out_dir / stl_fname
        foil.save(str(vtp_path))
        foil.save(str(stl_path))

        mesh_media_path = f"/media/simulations/{sim_id}/{vtp_fname}"
        stl_media_path = f"/media/simulations/{sim_id}/{stl_fname}"

        # ── Flow lines (skin friction / wallShearStress streamlines) ──
        flow_lines_media_path = None
        try:
            wss_arrays = foil_arrays
            if "wallShearStress" in wss_arrays:
                # Generate skin friction lines on the foil surface
                import vtk
                wss = np.asarray(foil.point_data["wallShearStress"])
                wss_mag = np.linalg.norm(wss, axis=1)
                foil.point_data["Cf"] = wss_mag / q_inf if q_inf > 0 else wss_mag

                fl_fname = f"flow_lines_{frame_tag}.vtp"
                fl_path = out_dir / fl_fname
                foil_copy = foil.copy()

                # Generate streamlines on the surface
                bounds = foil_copy.bounds
                n_seeds = 20
                seed_pts = np.zeros((n_seeds, 3))
                x_le = bounds[0]
                y_vals = np.linspace(bounds[2], bounds[3], n_seeds)
                z_mid = (bounds[4] + bounds[5]) / 2.0
                seed_pts[:, 0] = x_le
                seed_pts[:, 1] = y_vals
                seed_pts[:, 2] = z_mid

                seeds = pv.PolyData(seed_pts)
                try:
                    streamlines = foil_copy.streamlines_from_source(
                        seeds,
                        vectors="wallShearStress",
                        max_time=float(bounds[1] - bounds[0]) * 2,
                        max_steps=500,
                        integration_direction="forward",
                    )
                    if streamlines is not None and streamlines.n_points > 0:
                        streamlines.save(str(fl_path))
                        flow_lines_media_path = f"/media/simulations/{sim_id}/{fl_fname}"
                except Exception:
                    # Fall back to saving the foil with Cf as flow representation
                    foil_copy.save(str(fl_path))
                    flow_lines_media_path = f"/media/simulations/{sim_id}/{fl_fname}"
            else:
                # No wallShearStress — output foil geometry as VTP flow lines (legacy fallback)
                fl_fname = f"flow_lines_{frame_tag}.vtp"
                fl_path = out_dir / fl_fname
                foil.save(str(fl_path))
                flow_lines_media_path = f"/media/simulations/{sim_id}/{fl_fname}"
        except Exception as e:
            logger.warning(f"Frame {idx}: flow lines failed — {e}")

        # ── Pressure lines (sample pressure iso-contours) ─────────────
        pressure_lines_media_path = None
        try:
            if "Cp" in foil.point_data:
                cp_range = foil.point_data["Cp"]
                cp_min, cp_max = float(np.nanmin(cp_range)), float(np.nanmax(cp_range))
                n_contours = 15
                contour_vals = np.linspace(cp_min, cp_max, n_contours + 2)[1:-1]
                contours = foil.contour(isosurfaces=contour_vals.tolist(), scalars="Cp")
                if contours is not None and contours.n_points > 0:
                    pl_fname = f"pressure_lines_{frame_tag}.vtp"
                    pl_path = out_dir / pl_fname
                    contours.save(str(pl_path))
                    pressure_lines_media_path = f"/media/simulations/{sim_id}/{pl_fname}"

            # Ensure we always output a VTP for front-end pressure overlay.
            if pressure_lines_media_path is None:
                pl_fname = f"pressure_lines_{frame_tag}.vtp"
                pl_path = out_dir / pl_fname
                foil.save(str(pl_path))
                pressure_lines_media_path = f"/media/simulations/{sim_id}/{pl_fname}"
        except Exception as e:
            logger.warning(f"Frame {idx}: pressure lines failed — {e}")

        # ── Compute forces ────────────────────────────────────────────
        Fx, Fy, Fz, ld = None, None, None, None
        try:
            if "Cp" in foil.point_data and hasattr(foil, "compute_normals"):
                foil_n = foil.compute_normals(cell_normals=False, point_normals=True, inplace=False)
                normals = np.asarray(foil_n.point_data["Normals"])
                cp_vals = np.asarray(foil_n.point_data["Cp"])
                areas = np.asarray(foil_n.compute_cell_sizes()["Area"])
                n_cells = foil_n.n_cells
                cell_normals = np.zeros((n_cells, 3))
                cell_cp = np.zeros(n_cells)
                for ci in range(n_cells):
                    pts_idx = foil_n.cell_point_ids(ci)
                    cell_normals[ci] = normals[pts_idx].mean(axis=0)
                    cell_cp[ci] = cp_vals[pts_idx].mean()
                force_coeff = -cell_cp[:, np.newaxis] * cell_normals * areas[:, np.newaxis]
                Fx = float(np.sum(force_coeff[:, 0]) * q_inf)
                Fy = float(np.sum(force_coeff[:, 1]) * q_inf)
                Fz = float(np.sum(force_coeff[:, 2]) * q_inf)
                if abs(Fx) > 1e-12:
                    ld = Fz / Fx
        except Exception as e:
            logger.warning(f"Frame {idx}: force calculation failed — {e}")

        entry = {
            "frame_index": idx,
            "time_value": float(t_val),
            "iteration_number": int(t_val) if t_val == int(t_val) else None,
            "mesh_path": mesh_media_path,
            "pressure_lines_path": pressure_lines_media_path,
            "flow_lines_path": flow_lines_media_path,
            "metrics": {
                "Fx": Fx,
                "Fy": Fy,
                "Fz": Fz,
                "ld_ratio": ld,
            },
        }
        frame_mapping.append(entry)
        sequence_data["frames"].append(entry)
        logger.info(f"Frame {idx} (t={t_val}): exported VTP with {foil.n_points} pts")

    # ── Save results_sequence.json ────────────────────────────────────────
    seq_path = out_dir / "results_sequence.json"
    with open(str(seq_path), "w", encoding="utf-8") as f:
        json.dump(sequence_data, f, indent=2)

    result_sequence_path = f"/media/simulations/{sim_id}/results_sequence.json"

    logger.info(f"Temporal extraction complete: {len(frame_mapping)} frames")
    return {
        "frame_mapping": frame_mapping,
        "result_sequence_path": result_sequence_path,
    }

