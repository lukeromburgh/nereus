"""Geometry preprocessing: STL conversion and orientation."""
import glob
import logging
import math
import os
import shutil

logger = logging.getLogger(__name__)

# Supported input formats for conversion
SUPPORTED_INPUT_FORMATS = {".glb", ".gltf", ".obj", ".stl"}


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
    candidates = [p for p in candidates if os.path.basename(p) != 'foil.stl']

    if not candidates:
        raise FileNotFoundError(f"No foil geometry found in {tri_dir}")

    src_path = candidates[0]
    _, ext = os.path.splitext(src_path)
    ext = (ext or "").lower()

    if ext == ".stl":
        shutil.copy2(src_path, stl_path)
        return stl_path

    if ext not in SUPPORTED_INPUT_FORMATS:
        raise ValueError(f"Unsupported geometry format for simulation: {ext} (source: {src_path})")

    return _convert_to_stl(src_path, stl_path)


def _convert_to_stl(src_path: str, stl_path: str) -> str:
    """Convert GLB/GLTF/OBJ to STL using trimesh."""
    import trimesh

    try:
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


def normalise_stl_orientation(stl_path, run) -> dict:
    """Apply user-supplied pitch/roll/yaw orientation to the STL.

    The rotation convention matches the frontend preview exactly:
    Ry(yaw) → Rx(pitch) → Rz(roll)  (static Y-X-Z / intrinsic Z-X-Y).

    Also auto-detects the chord/span/thickness axes from the bounding box
    and stores the mapping for diagnostics.

    Returns diagnostic info to be stored on the SimulationRun.
    """
    import numpy as np
    import trimesh
    import trimesh.transformations as tf

    pitch_deg = float(getattr(run, 'pitch', 0) or 0)
    roll_deg = float(getattr(run, 'roll', 0) or 0)
    yaw_deg = float(getattr(run, 'yaw', 0) or 0)

    mesh = trimesh.load(stl_path, force='mesh')

    if abs(roll_deg) > 1e-9 or abs(pitch_deg) > 1e-9 or abs(yaw_deg) > 1e-9:
        euler_mat = tf.euler_matrix(
            math.radians(yaw_deg),
            math.radians(pitch_deg),
            math.radians(roll_deg),
            axes='syxz',
        )
        mesh.apply_transform(euler_mat)
        logger.info(f"Applied user orientation: pitch={pitch_deg}° roll={roll_deg}° yaw={yaw_deg}°")

    # Centre the mesh at the origin
    mesh.apply_translation(-mesh.centroid)

    # Export corrected STL back to the same path
    mesh.export(stl_path)

    # Auto-detect chord/span/thickness axes from bounding box extents.
    # Convention: chord = longest extent, span = middle, thickness = shortest.
    # This maps each geometric dimension to its corresponding axis label.
    bounds = mesh.bounding_box.extents  # [x_extent, y_extent, z_extent]
    axis_labels = ['X', 'Y', 'Z']
    extent_order = list(np.argsort(bounds))  # indices sorted by extent ascending
    # extent_order[0] = shortest (thickness), [1] = middle (span), [2] = longest (chord)
    detected_chord_axis = axis_labels[extent_order[2]]
    detected_span_axis = axis_labels[extent_order[1]]
    detected_up_axis = axis_labels[extent_order[0]]

    axes_info = {
        'detected_chord_axis': detected_chord_axis,
        'detected_span_axis': detected_span_axis,
        'detected_up_axis': detected_up_axis,
    }
    logger.info(
        f"Axis detection: chord={detected_chord_axis} "
        f"(ext={float(bounds[extent_order[2]]):.4f}m), "
        f"span={detected_span_axis} "
        f"(ext={float(bounds[extent_order[1]]):.4f}m), "
        f"thickness={detected_up_axis} "
        f"(ext={float(bounds[extent_order[0]]):.4f}m)"
    )

    # Compute geometry dimensions
    chord = float(bounds[extent_order[2]])
    span = float(bounds[extent_order[1]])
    thickness = float(bounds[extent_order[0]])
    dims_info = {
        'chord_m': chord,
        'span_m': span,
        'thickness_m': thickness,
    }

    return {
        'axes': axes_info,
        'dimensions': dims_info,
        'applied_orientation': {
            'pitch': pitch_deg,
            'roll': roll_deg,
            'yaw': yaw_deg,
        },
    }


__all__ = [
    '_ensure_foil_stl',
    '_convert_to_stl',
    'normalise_stl_orientation',
    'SUPPORTED_INPUT_FORMATS',
]
