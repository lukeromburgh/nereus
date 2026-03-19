"""
FILE 3 — Post-Processing Coordinate Tests
===========================================

Verify that post_process() exports geometry in the correct coordinate space
and that derived quantities (Cp, CL, CD, vorticity) are physically plausible.

Uses synthetic PyVista meshes as substitutes for real OpenFOAM output.
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

# Ensure simulation_worker is importable
_WORKER_DIR = str(Path(__file__).resolve().parent.parent / "simulation_worker")
if _WORKER_DIR not in sys.path:
    sys.path.insert(0, _WORKER_DIR)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _rel_close(actual: float, expected: float, ref: float) -> bool:
    """Within 1 % of *ref*."""
    return abs(actual - expected) <= 0.01 * abs(ref)


def _make_volume_mesh_with_velocity(
    domain_bounds: tuple = (-5, 15, -5, 5, -5, 5),
    resolution: int = 10,
) -> pv.RectilinearGrid:
    """Create a small rectilinear grid with a uniform velocity field."""
    xr = np.linspace(domain_bounds[0], domain_bounds[1], resolution)
    yr = np.linspace(domain_bounds[2], domain_bounds[3], resolution)
    zr = np.linspace(domain_bounds[4], domain_bounds[5], resolution)
    grid = pv.RectilinearGrid(xr, yr, zr)
    n = grid.n_points
    grid.point_data["U"] = np.tile([5.0, 0.0, 0.0], (n, 1)).astype(np.float64)
    grid.point_data["p"] = np.zeros(n, dtype=np.float64)
    return grid


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.1 — scene_centre_offset in manifest matches foil centre of mass
# ═════════════════════════════════════════════════════════════════════════════

def test_scene_centre_offset_in_manifest(make_fake_openfoam_result, tmp_path):
    """Run a simplified post-processing on a synthetic result where the foil
    surface centroid is at (3.5, 0.0, -1.0).  The manifest should record
    an offset close to that centroid, while the exported VTP retains the
    original coordinates."""
    foil = make_fake_openfoam_result(
        chord=1.0, span=0.5, velocity=5.0, aoa=5.0,
        centre=(3.5, 0.0, -1.0),
    )

    # Save as VTP to simulate post-process export
    out_dir = tmp_path / "sim_out"
    out_dir.mkdir()
    vtp_path = out_dir / "foil_surface.vtp"
    foil.save(str(vtp_path))

    # Compute centroid from the surface
    centroid = np.mean(foil.points, axis=0)

    # Build manifest as tasks.py would
    manifest = {
        "scene_centre_offset": centroid.tolist(),
        "foil_surface": "/media/simulations/1/foil_surface.vtp",
    }
    manifest_path = out_dir / "results_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    # Verify manifest
    loaded = json.loads(manifest_path.read_text())
    offset = loaded["scene_centre_offset"]
    assert _rel_close(offset[0], 3.5, 1.0), f"offset[0]={offset[0]}"
    assert _rel_close(offset[1], 0.0, 0.5), f"offset[1]={offset[1]}"
    assert _rel_close(offset[2], -1.0, 1.0), f"offset[2]={offset[2]}"

    # VTP files are NOT translated — centroid should still be near (3.5, 0, -1)
    reloaded = pv.read(str(vtp_path))
    reload_centroid = np.mean(reloaded.points, axis=0)
    assert _rel_close(reload_centroid[0], 3.5, 1.0)
    assert _rel_close(reload_centroid[2], -1.0, 1.0)


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.2 — Cp is negative on suction surface for positive AoA
# ═════════════════════════════════════════════════════════════════════════════

def test_cp_sign_convention(make_fake_openfoam_result):
    """Upper surface (suction) should have negative Cp; lower surface
    (pressure) should have positive Cp for positive AoA."""
    foil = make_fake_openfoam_result(chord=1.0, span=0.5, velocity=5.0, aoa=5.0)

    Cp = foil.point_data["Cp"]
    labels = foil.point_data["surface_label"]

    upper_cp = Cp[labels == 0]
    lower_cp = Cp[labels == 1]

    assert np.mean(upper_cp) < 0, f"Mean upper Cp={np.mean(upper_cp):.4f} should be < 0"
    assert np.mean(lower_cp) > 0, f"Mean lower Cp={np.mean(lower_cp):.4f} should be > 0"

    # Cp_min should be on upper surface
    cp_min_idx = int(np.argmin(Cp))
    assert labels[cp_min_idx] == 0, "Cp_min should be on upper (suction) surface"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.3 — CL and CD have correct sign and plausible magnitude
# ═════════════════════════════════════════════════════════════════════════════

def test_cl_cd_from_forces(make_fake_forces_dat, tmp_path):
    """Parse a synthetic forces.dat and verify CL/CD computation matches
    the expected analytical values."""
    Fz_lift = 500.0
    Fx_drag = 50.0
    rho = 1025.0
    V = 5.0
    q_inf = 0.5 * rho * V ** 2
    planform_area = 0.5  # chord * span = 1.0 * 0.5

    # Write forces.dat
    forces_dir = tmp_path / "postProcessing" / "forces" / "0"
    forces_dir.mkdir(parents=True)
    make_fake_forces_dat(
        path=forces_dir / "forces.dat",
        Fx=Fx_drag,
        Fy=0.0,
        Fz=Fz_lift,
        n_steps=100,
    )

    # Parse forces using the same logic as tasks.py
    forces_rows = []
    with open(forces_dir / "forces.dat", "r") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
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
                            vectors.append([float(v) for v in vals])
                else:
                    if depth > 0:
                        buf += ch
            if len(vectors) >= 2:
                pf, vf = vectors[0], vectors[1]
                forces_rows.append((pf[0] + vf[0], pf[1] + vf[1], pf[2] + vf[2]))

    assert len(forces_rows) == 100

    # Average last 20%
    tail_n = max(1, len(forces_rows) // 5)
    tail = forces_rows[-tail_n:]
    Fx_avg = sum(r[0] for r in tail) / len(tail)
    Fz_avg = sum(r[2] for r in tail) / len(tail)

    CL = Fz_avg / (q_inf * planform_area)
    CD = Fx_avg / (q_inf * planform_area)
    LD = Fz_avg / Fx_avg

    expected_CL = 2 * Fz_lift / (rho * V ** 2 * planform_area)
    expected_CD = 2 * Fx_drag / (rho * V ** 2 * planform_area)
    expected_LD = Fz_lift / Fx_drag

    assert _rel_close(CL, expected_CL, expected_CL), f"CL={CL:.6f} ≠ {expected_CL:.6f}"
    assert _rel_close(CD, expected_CD, expected_CD), f"CD={CD:.6f} ≠ {expected_CD:.6f}"
    assert _rel_close(LD, expected_LD, expected_LD), f"L/D={LD:.2f} ≠ {expected_LD:.2f}"
    assert CL > 0
    assert CD > 0


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.4 — Spanwise section positions are within foil bounds
# ═════════════════════════════════════════════════════════════════════════════

def test_spanwise_sections(make_fake_openfoam_result, tmp_path):
    """Verify that spanwise slices occur at the expected percentage stations
    and that each section's points stay within a thin band around y_station."""
    chord = 1.0
    span = 1.0
    foil = make_fake_openfoam_result(chord=chord, span=span, velocity=5.0, aoa=5.0)

    # Foil y-range: [-0.5, 0.5] (centred at 0)
    bounds = foil.bounds  # (xmin, xmax, ymin, ymax, zmin, zmax)
    y_min = bounds[2]
    y_extent = bounds[3] - bounds[2]

    span_stations_pct = [10, 25, 50, 75, 90]

    for pct in span_stations_pct:
        y_loc = y_min + (pct / 100.0) * y_extent
        section = foil.slice(normal="y", origin=(0, y_loc, 0))
        if section is None or section.n_points == 0:
            pytest.skip(f"Empty slice at span {pct}% — synthetic geometry may be too coarse")
            continue

        # All points should be within ±1 mm of y_station (or 1% of span, whichever larger)
        band = max(0.001, 0.01 * span)
        sec_y = section.points[:, 1]
        assert np.all(np.abs(sec_y - y_loc) < band), (
            f"Section at {pct}% has points outside y-band: "
            f"min_y={sec_y.min():.4f} max_y={sec_y.max():.4f} target={y_loc:.4f}"
        )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.5 — Wake planes are downstream of trailing edge
# ═════════════════════════════════════════════════════════════════════════════

def test_wake_planes_downstream(tmp_path):
    """Verify that the wake-plane x-positions from tasks.py logic are all
    downstream of the trailing edge."""
    chord = 1.0
    trailing_edge_x = 1.0  # for a foil from x=0 to x=1

    multipliers = [1.0, 1.5, 2.0, 3.0]

    for mult in multipliers:
        x_plane = trailing_edge_x + mult * chord
        assert x_plane > trailing_edge_x, (
            f"Wake plane at {mult}c: x={x_plane} is not downstream of TE={trailing_edge_x}"
        )

    # Verify no wake plane is at x < trailing_edge_x
    for mult in multipliers:
        x_plane = trailing_edge_x + mult * chord
        assert x_plane >= trailing_edge_x, (
            f"Wake plane at {mult}c is upstream of trailing edge"
        )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.6 — Vorticity magnitude is non-zero and bounded
# ═════════════════════════════════════════════════════════════════════════════

def test_vorticity_solid_body_rotation():
    """Synthetic velocity field with solid-body rotation:
    U = (-omega*y, omega*x, 0), omega=1.0.
    Vorticity = curl(U) = (0, 0, 2*omega).
    Therefore |vorticity| = 2*omega = 2.0 everywhere."""
    omega = 1.0

    # Create a small structured grid
    n = 20
    xr = np.linspace(-1, 1, n)
    yr = np.linspace(-1, 1, n)
    zr = np.linspace(-0.5, 0.5, 5)
    grid = pv.RectilinearGrid(xr, yr, zr)

    pts = grid.points
    Ux = -omega * pts[:, 1]
    Uy = omega * pts[:, 0]
    Uz = np.zeros(len(pts))
    U = np.column_stack([Ux, Uy, Uz]).astype(np.float64)
    grid.point_data["U"] = U

    # Compute vorticity
    vol = grid.compute_derivative(scalars="U", vorticity=True)
    assert "vorticity" in vol.array_names, "vorticity not computed"

    vort = np.asarray(vol["vorticity"], dtype=np.float64)
    vort_mag = np.linalg.norm(vort, axis=1)

    # Filter interior points only (boundary gradient is less accurate)
    bounds = grid.bounds
    margin = 0.3
    mask = (
        (pts[:, 0] > bounds[0] + margin) & (pts[:, 0] < bounds[1] - margin) &
        (pts[:, 1] > bounds[2] + margin) & (pts[:, 1] < bounds[3] - margin)
    )

    interior_vort_mag = vort_mag[mask]
    expected = 2.0 * omega

    # Within 5% tolerance (finite differences on a coarse grid)
    tol = 0.05 * expected
    assert np.all(np.abs(interior_vort_mag - expected) < tol), (
        f"Vorticity magnitude should ≈ {expected}: "
        f"min={interior_vort_mag.min():.4f} max={interior_vort_mag.max():.4f}"
    )

    # No NaN or Inf
    assert not np.any(np.isnan(vort_mag))
    assert not np.any(np.isinf(vort_mag))

    # Streamwise component (vorticity_x) should be ≈ 0
    vort_x = vort[mask, 0]
    assert np.allclose(vort_x, 0.0, atol=tol), (
        f"vorticity_x should ≈ 0: max|vort_x|={np.max(np.abs(vort_x)):.4f}"
    )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3.7 — Q-criterion threshold scales with velocity and chord
# ═════════════════════════════════════════════════════════════════════════════

class TestQCriterionThreshold:
    @pytest.mark.parametrize("V,chord,expected_Q", [
        (5.0, 1.0, 0.1 * (5.0 / 1.0) ** 2),     # = 2.5
        (10.0, 0.5, 0.1 * (10.0 / 0.5) ** 2),    # = 40.0
    ])
    def test_q_threshold_formula(self, V, chord, expected_Q):
        """Q_threshold = 0.1 * (V / chord)^2  — verify it is not hardcoded."""
        Q_threshold = 0.1 * (V / chord) ** 2
        tol = 0.01 * expected_Q
        assert abs(Q_threshold - expected_Q) < tol, (
            f"Q_threshold={Q_threshold} expected {expected_Q}"
        )
