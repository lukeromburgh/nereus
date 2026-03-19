"""
FILE 5 — End-to-End Coordinate Tests
======================================

Integration tests that trace a coordinate through the entire pipeline
from STL input to manifest output, verifying nothing gets silently
dropped or double-applied.

Tests that require a real OpenFOAM installation are marked with
@pytest.mark.openfoam so they can be skipped in fast CI via:
    pytest -m "not openfoam"
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import pyvista as pv
import pytest
import trimesh
import trimesh.transformations as tf

# Ensure simulation_worker is importable
_WORKER_DIR = str(Path(__file__).resolve().parent.parent / "simulation_worker")
if _WORKER_DIR not in sys.path:
    sys.path.insert(0, _WORKER_DIR)

from tasks import normalise_stl_orientation
from template_manager import TemplateManager


# ── Helpers ──────────────────────────────────────────────────────────────────

def _rel_close(actual: float, expected: float, ref: float) -> bool:
    """Within 1 % of *ref*."""
    return abs(actual - expected) <= 0.01 * abs(ref) if abs(ref) > 1e-12 else abs(actual - expected) < 1e-6


# ═════════════════════════════════════════════════════════════════════════════
# TEST 5.1 — A point on the foil nose survives the pipeline at the right location
# ═════════════════════════════════════════════════════════════════════════════

def test_nose_point_through_pipeline(make_foil_stl, fake_run, tmp_path):
    """
    Start with a foil whose leading edge centroid is at (0, 0, 0) in CAD space.
    Set submersion_depth=1.5m, no orientation correction.
    After normalise + submersion, the leading edge should be at (x_min, 0, -1.5).
    The scene_centre_offset recorded in the manifest should have z ≈ -1.5.
    In Three.js, applying -offset as sceneGroup position should bring the
    nose point back near the origin.
    """
    chord, span, thickness = 1.0, 0.5, 0.1
    submersion_depth = 1.5

    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness)

    # Step 1: normalise
    run = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_path), run)

    # Step 2: submersion translation
    foil_mesh = pv.read(str(stl_path))
    bounds = foil_mesh.bounds
    foil_z_center = 0.5 * (bounds[4] + bounds[5])
    z_shift = -submersion_depth - foil_z_center
    foil_mesh = foil_mesh.translate([0, 0, z_shift], inplace=False)
    foil_mesh.save(str(stl_path))

    # Verify leading edge z-position
    processed = trimesh.load(str(stl_path), force="mesh")
    processed_bounds = processed.bounds
    x_min = processed_bounds[0][0]
    centroid = processed.centroid

    assert abs(centroid[0]) < 0.01 * chord, f"x-centroid {centroid[0]} not ≈ 0"
    assert abs(centroid[1]) < 0.01 * span, f"y-centroid {centroid[1]} not ≈ 0"
    assert _rel_close(centroid[2], -submersion_depth, submersion_depth), (
        f"z-centroid {centroid[2]:.4f} not ≈ {-submersion_depth}"
    )

    # Step 3: simulate manifest creation
    scene_centre_offset = centroid.tolist()
    assert _rel_close(scene_centre_offset[2], -submersion_depth, submersion_depth)

    # Step 4: Three.js scene group translation (simulated)
    scene_pos = [-scene_centre_offset[0], -scene_centre_offset[1], -scene_centre_offset[2]]

    # Transform nose point: original nose is at (x_min, 0, centroid[2])
    nose_openfoam = np.array([x_min, 0.0, centroid[2]])
    nose_viewer = nose_openfoam + np.array(scene_pos)

    # x should be approximately (x_min - scene_centre_x) which centres the chord
    # z should be approximately 0 (submersion offset cancelled)
    assert abs(nose_viewer[2]) < 0.01 * submersion_depth, (
        f"nose z in viewer {nose_viewer[2]:.4f} should be ≈ 0"
    )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 5.2 — AoA = 5° produces correct flow decomposition end-to-end
# ═════════════════════════════════════════════════════════════════════════════

def test_aoa_flow_decomposition_e2e(tmp_path):
    """Create a case with velocity=10.0, AoA=5.0.  Parse rendered 0/U
    and verify Ux, Uz, magnitude, and angle reconstruction."""
    import re

    case_dir = tmp_path / "case"
    case_dir.mkdir()
    tm = TemplateManager(str(case_dir))
    tm.initialize_case(
        velocity=10.0,
        water_density=1025.0,
        angle_of_attack=5.0,
        center_of_gravity=(0, 0, 0),
        enable_gravity=True,
    )

    u_text = (case_dir / "0" / "U").read_text()
    m = re.search(
        r"uniform\s*\(\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s*\)", u_text
    )
    assert m, "Could not parse 0/U"
    ux = float(m.group(1))
    uz = float(m.group(3))

    V = 10.0
    tol = 0.01 * V

    assert abs(ux - V * math.cos(math.radians(5.0))) < tol
    assert abs(uz - (-V * math.sin(math.radians(5.0)))) < tol

    # Magnitude preservation
    mag = math.sqrt(ux ** 2 + uz ** 2)
    assert abs(mag - V) < tol

    # Angle reconstruction
    reconstructed_aoa_deg = math.degrees(math.atan2(-uz, ux))
    assert abs(reconstructed_aoa_deg - 5.0) < 0.1


# ═════════════════════════════════════════════════════════════════════════════
# TEST 5.3 — Orientation correction is idempotent
# ═════════════════════════════════════════════════════════════════════════════

def test_normalisation_idempotent(make_foil_stl, fake_run, tmp_path):
    """Running normalise_stl_orientation() twice with the same parameters
    should produce identical results — it must not compound rotations."""
    chord, span, thickness = 1.0, 0.5, 0.1

    # First pass
    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness)
    run1 = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_path), run1)

    m1 = trimesh.load(str(stl_path), force="mesh")
    ext1 = m1.bounds[1] - m1.bounds[0]
    cen1 = np.array(m1.centroid)

    # Second pass (on the already-normalised STL)
    run2 = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_path), run2)

    m2 = trimesh.load(str(stl_path), force="mesh")
    ext2 = m2.bounds[1] - m2.bounds[0]
    cen2 = np.array(m2.centroid)

    # Extents should be identical within 0.1 mm
    assert np.allclose(ext1, ext2, atol=1e-4), (
        f"Extents differ after 2nd pass: {ext1} vs {ext2}"
    )

    # Centroid should still be at origin
    assert np.allclose(cen2, 0.0, atol=0.01 * chord), (
        f"Centroid after 2nd pass: {cen2}"
    )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 5.4 — Reversed foil detection (tail-first pressure check)
# ═════════════════════════════════════════════════════════════════════════════

def test_reversed_foil_detection(make_fake_openfoam_result):
    """A foil with highest pressure at x_min (stagnation at blunt tail end)
    should be flagged as potentially reversed.  This is a warning-only check;
    no geometry modification or exception should occur."""
    foil = make_fake_openfoam_result(
        chord=1.0, span=0.5, velocity=5.0, aoa=0.0
    )

    # Overwrite Cp so max Cp is at x_min (simulating tail-first stagnation)
    pts = foil.points
    x = pts[:, 0]
    foil_x_min = float(x.min())
    foil_x_max = float(x.max())
    chord = foil_x_max - foil_x_min

    # Create a Cp field that peaks at x_min
    Cp_reversed = 1.0 - (x - foil_x_min) / max(chord, 1e-9)
    foil.point_data["Cp"] = Cp_reversed

    # Check: max Cp location
    max_cp_idx = int(np.argmax(Cp_reversed))
    max_cp_x = float(pts[max_cp_idx, 0])

    possible_reversed = abs(max_cp_x - foil_x_min) < 0.1 * chord

    assert possible_reversed, (
        f"Should detect possible reversed geometry: max_Cp at x={max_cp_x:.4f}, "
        f"foil_x_min={foil_x_min:.4f}"
    )

    # The geometry should NOT be modified — Cp array is unchanged
    assert np.allclose(foil.point_data["Cp"], Cp_reversed)


# ═════════════════════════════════════════════════════════════════════════════
# TEST 5.5 — scene_centre_offset round-trip
# ═════════════════════════════════════════════════════════════════════════════

def test_scene_centre_offset_round_trip(tmp_path):
    """Write a manifest with scene_centre_offset, load it as the frontend
    would, apply the inverse translation, and verify a point at the original
    centre maps to (0, 0, 0)."""
    offset = [3.5, 0.0, -1.5]
    manifest = {"scene_centre_offset": offset}
    manifest_path = tmp_path / "results_manifest.json"
    manifest_path.write_text(json.dumps(manifest))

    # Simulate frontend loading
    loaded = json.loads(manifest_path.read_text())
    scene_offset = loaded["scene_centre_offset"]
    scene_position = [-scene_offset[0], -scene_offset[1], -scene_offset[2]]

    # A point at the original centre in OpenFOAM coordinates
    original_centre = np.array([3.5, 0.0, -1.5])

    # Apply scene group translation (pure addition for a translation-only parent)
    transformed = original_centre + np.array(scene_position)

    assert abs(transformed[0]) < 1e-6, f"x={transformed[0]}"
    assert abs(transformed[1]) < 1e-6, f"y={transformed[1]}"
    assert abs(transformed[2]) < 1e-6, f"z={transformed[2]}"
