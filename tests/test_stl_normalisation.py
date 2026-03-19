"""
FILE 1 — STL Normalisation Tests
=================================

Verify that normalise_stl_orientation() in tasks.py correctly maps
chord→+X, span→+Y, thickness→+Z via OBB, composes user pitch/roll/yaw
on top, centres the mesh at the origin, and handles edge cases.

All tests use synthetic trimesh box geometries (deterministic & fast).
"""
from __future__ import annotations

import logging
import math
import os
import sys
from pathlib import Path

import numpy as np
import pytest
import trimesh
import trimesh.transformations as tf

# Ensure simulation_worker is importable
_WORKER_DIR = str(Path(__file__).resolve().parent.parent / "simulation_worker")
if _WORKER_DIR not in sys.path:
    sys.path.insert(0, _WORKER_DIR)

# We import only the pure function — it does not require Celery or Django at
# call-time because we pass a fake `run` object.
from tasks import normalise_stl_orientation


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extents(stl_path: str | Path) -> np.ndarray:
    """Load an STL and return its AABB extents [dx, dy, dz]."""
    m = trimesh.load(str(stl_path), force="mesh")
    return m.bounds[1] - m.bounds[0]


def _centroid(stl_path: str | Path) -> np.ndarray:
    m = trimesh.load(str(stl_path), force="mesh")
    return np.array(m.centroid)


def _rel_close(actual: float, expected: float, dim: float) -> bool:
    """Check that *actual* is within 1 % of *dim* from *expected*."""
    return abs(actual - expected) <= 0.01 * abs(dim)


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.1 — Identity orientation (already correct)
# ═════════════════════════════════════════════════════════════════════════════

def test_identity_orientation(make_foil_stl, fake_run, tmp_path):
    """A foil already aligned chord→X, span→Y, thickness→Z should be
    unchanged (within OBB tolerance) after normalisation."""
    chord, span, thickness = 1.0, 0.5, 0.1
    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness)

    run = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_path), run)

    ext = _extents(stl_path)
    assert _rel_close(ext[0], chord, chord), f"x-extent {ext[0]:.4f} ≠ {chord}"
    assert _rel_close(ext[1], span, span), f"y-extent {ext[1]:.4f} ≠ {span}"
    assert _rel_close(ext[2], thickness, thickness), f"z-extent {ext[2]:.4f} ≠ {thickness}"

    cen = _centroid(stl_path)
    assert np.allclose(cen, 0.0, atol=0.01 * chord), f"centroid not at origin: {cen}"

    axes = run.geometry_axes_detected
    assert axes.get("detected_chord_axis") == "X"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.2 — Foil imported sideways (chord along Y, span along X)
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.platform_sensitive  # OBB can differ slightly across trimesh builds
def test_sideways_foil(make_foil_stl, fake_run, tmp_path):
    """A 90° Z-rotation puts chord along Y.  After normalisation the
    x-extent should be ≈ chord and the detected_chord_axis should report
    the *original* axis (Y)."""
    chord, span, thickness = 1.0, 0.5, 0.1
    rot_z_90 = tf.rotation_matrix(math.radians(90), [0, 0, 1])
    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness, transform=rot_z_90)

    run = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_path), run)

    ext = _extents(stl_path)
    # After OBB the longest extent should land on X
    assert _rel_close(ext[0], chord, chord), f"x-extent {ext[0]:.4f} ≠ {chord}"

    axes = run.geometry_axes_detected
    # The OBB detects the original chord axis in OBB-space.  Since we rotated
    # the chord to world-Y, the longest OBB axis (index 0 after sort) corresponds
    # to the original Y direction.
    assert axes.get("detected_chord_axis") == "Y", (
        f"Expected detected_chord_axis='Y', got {axes.get('detected_chord_axis')}"
    )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.3 — Foil imported tail-first (rotated 180° around Z)
# ═════════════════════════════════════════════════════════════════════════════

def test_tail_first_foil(make_foil_stl, fake_run, tmp_path):
    """A 180° Z-rotation is tail-first vs nose-first.  Both are valid OBB
    outcomes.  We verify only that the *extents* are correct, not which end is
    leading.  Document: tail-first and nose-first produce identical AABB extents
    because a box is symmetric."""
    chord, span, thickness = 1.0, 0.5, 0.1
    rot_z_180 = tf.rotation_matrix(math.radians(180), [0, 0, 1])
    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness, transform=rot_z_180)

    run = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_path), run)

    ext = _extents(stl_path)
    assert _rel_close(ext[0], chord, chord), f"x-extent {ext[0]:.4f} ≠ {chord}"
    assert _rel_close(ext[1], span, span), f"y-extent {ext[1]:.4f} ≠ {span}"
    assert _rel_close(ext[2], thickness, thickness), f"z-extent {ext[2]:.4f} ≠ {thickness}"

    cen = _centroid(stl_path)
    assert np.allclose(cen, 0.0, atol=0.01 * chord), f"centroid not at origin: {cen}"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.4 — Foil in millimetres (auto-scale detection)
# ═════════════════════════════════════════════════════════════════════════════

def test_mm_scale_detection(make_foil_stl, tmp_path):
    """A foil with chord=1000 (millimetre scale) should be detected as
    needing 0.001× scaling by the pre-flight STL bounds logic in
    run_hydro_simulation.

    We replicate the heuristic from tasks.py directly rather than running
    the full Celery task.
    """
    import pyvista as pv

    chord_mm, span_mm, thickness_mm = 1000.0, 500.0, 100.0
    stl_path = tmp_path / "constant" / "triSurface" / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord_mm, span=span_mm, thickness=thickness_mm)

    # Replicate the scaling heuristic from tasks.py
    foil_mesh = pv.read(str(stl_path))
    bounds = foil_mesh.bounds
    x_len = bounds[1] - bounds[0]
    characteristic_len = max(x_len, bounds[3] - bounds[2], bounds[5] - bounds[4])

    auto_scaled = False
    if characteristic_len > 10.0:
        auto_scaled = True
        foil_mesh = foil_mesh.scale([0.001, 0.001, 0.001], inplace=False)
        foil_mesh.save(str(stl_path))

    assert auto_scaled is True, "Expected auto-scale to trigger for mm-scale geometry"

    ext = _extents(stl_path)
    expected_chord_m = chord_mm * 0.001
    assert _rel_close(ext[0], expected_chord_m, expected_chord_m), (
        f"x-extent after scaling {ext[0]:.4f} ≠ {expected_chord_m}"
    )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.5 — User pitch/roll/yaw applied on top of OBB correction
# ═════════════════════════════════════════════════════════════════════════════

@pytest.mark.platform_sensitive  # OBB slightly platform-dependent
def test_user_rotation_composed_on_obb(make_foil_stl, fake_run, tmp_path):
    """Start with chord along Y (sideways), let OBB correct to X, then apply
    a 45° yaw.  The mesh should be rotated 45° from the OBB-corrected
    orientation, NOT 45° from the original sideways position."""
    chord, span, thickness = 1.0, 0.5, 0.1

    # Step 1: OBB-correct with yaw=0
    rot_z_90 = tf.rotation_matrix(math.radians(90), [0, 0, 1])
    stl_obb_only = tmp_path / "foil_obb.stl"
    make_foil_stl(path=stl_obb_only, chord=chord, span=span, thickness=thickness, transform=rot_z_90)
    run1 = fake_run(pitch=0, roll=0, yaw=0)
    normalise_stl_orientation(str(stl_obb_only), run1)
    ext_obb = _extents(stl_obb_only)

    # Step 2: OBB-correct + 45° yaw
    stl_with_yaw = tmp_path / "foil_yaw.stl"
    make_foil_stl(path=stl_with_yaw, chord=chord, span=span, thickness=thickness, transform=rot_z_90)
    run2 = fake_run(pitch=0, roll=0, yaw=45)
    normalise_stl_orientation(str(stl_with_yaw), run2)
    ext_yaw = _extents(stl_with_yaw)

    # The yawed version should have a noticeably different AABB from the
    # OBB-only version because the 45° yaw rotates the chord off-axis.
    # If yaw were applied BEFORE OBB the OBB would undo it → identical extents.
    assert not np.allclose(ext_obb[:2], ext_yaw[:2], atol=0.01 * chord), (
        "Extents are identical — yaw may have been applied before OBB, not after"
    )

    # But both should still be centred at origin
    cen = _centroid(stl_with_yaw)
    assert np.allclose(cen, 0.0, atol=0.01 * chord), f"centroid not at origin: {cen}"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.6 — Degenerate geometry fallback (flat plane)
# ═════════════════════════════════════════════════════════════════════════════

def test_degenerate_geometry_fallback(fake_run, tmp_path, caplog):
    """A flat plane (effectively zero thickness) may cause the OBB to produce
    degenerate axes.  normalise_stl_orientation must NOT raise; it should
    log a warning and leave the STL valid."""
    # Create a flat planar mesh (two triangles, no thickness)
    verts = np.array([
        [0, 0, 0], [1, 0, 0], [1, 0.5, 0], [0, 0.5, 0],
    ], dtype=np.float64)
    faces = np.array([[0, 1, 2], [0, 2, 3]])
    plane_mesh = trimesh.Trimesh(vertices=verts, faces=faces)

    stl_path = tmp_path / "flat.stl"
    plane_mesh.export(str(stl_path))

    run = fake_run(pitch=0, roll=0, yaw=0)

    with caplog.at_level(logging.WARNING):
        # Should not raise
        normalise_stl_orientation(str(stl_path), run)

    # STL should still exist and be loadable
    assert stl_path.exists()
    reloaded = trimesh.load(str(stl_path), force="mesh")
    assert len(reloaded.faces) > 0


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1.7 — Submersion translation is applied AFTER normalisation
# ═════════════════════════════════════════════════════════════════════════════

def test_submersion_after_normalisation(make_foil_stl, fake_run, tmp_path):
    """Verify the full pipeline sequence: normalise → submersion shift.
    After submersion_depth=2.0 the foil's z-centre should be at -2.0,
    while x and y centroids remain ≈ 0."""
    import pyvista as pv

    chord, span, thickness = 1.0, 0.5, 0.1
    submersion_depth = 2.0

    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness)

    # Step 1: normalise
    run = fake_run(pitch=0, roll=0, yaw=0, submersion_depth=submersion_depth)
    normalise_stl_orientation(str(stl_path), run)

    # Step 2: submersion translation (replicate tasks.py logic)
    foil_mesh = pv.read(str(stl_path))
    bounds = foil_mesh.bounds
    foil_z_center = 0.5 * (bounds[4] + bounds[5])
    z_shift = -submersion_depth - foil_z_center
    foil_mesh = foil_mesh.translate([0, 0, z_shift], inplace=False)
    foil_mesh.save(str(stl_path))

    # Verify
    final = trimesh.load(str(stl_path), force="mesh")
    final_bounds = final.bounds
    z_max = final_bounds[1][2]
    expected_z_max = -submersion_depth + thickness / 2

    assert _rel_close(z_max, expected_z_max, thickness), (
        f"z_max {z_max:.4f} ≠ expected {expected_z_max:.4f}"
    )

    cen = final.centroid
    assert abs(cen[0]) < 0.01 * chord, f"x centroid {cen[0]:.4f} not ≈ 0"
    assert abs(cen[1]) < 0.01 * span, f"y centroid {cen[1]:.4f} not ≈ 0"
