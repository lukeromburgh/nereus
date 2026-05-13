"""
FILE 2 — OpenFOAM Coordinate Tests
====================================

Verify that the TemplateManager renders physically correct coordinate-
dependent values in 0/U, constant/g, system/snappyHexMeshDict,
system/blockMeshDict, system/controlDict, and 0/p vs 0/p_rgh.
"""
from __future__ import annotations

import math
import os
import re
import sys
from pathlib import Path

import numpy as np
import pytest
import trimesh

# Ensure simulation_worker is importable
_WORKER_DIR = str(Path(__file__).resolve().parent.parent / "simulation_worker")
if _WORKER_DIR not in sys.path:
    sys.path.insert(0, _WORKER_DIR)

from template_manager import TemplateManager
from tasks import (
    MIN_PRESENTATION_FOIL_SURFACE_CELLS,
    _assess_mesh_presentation_quality,
    _build_domain_from_bounds,
    _build_refinement_regions,
    _mesh_quality_is_acceptable,
    _parse_check_mesh_output,
    compute_first_layer_thickness,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _read_case_file(case_dir: Path, relative: str) -> str:
    return (case_dir / relative).read_text(encoding="utf-8")


def _parse_uniform_vector(text: str) -> tuple[float, float, float]:
    """Extract the first `uniform (x y z)` from an OpenFOAM field file."""
    m = re.search(r"uniform\s*\(\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s*\)", text)
    assert m, f"Could not find 'uniform (x y z)' in:\n{text[:500]}"
    return float(m.group(1)), float(m.group(2)), float(m.group(3))


def _init_case(tmp_path: Path, **overrides) -> Path:
    """Initialise an OpenFOAM case with sensible defaults, overriding as needed."""
    case_dir = tmp_path / "case"
    case_dir.mkdir(parents=True, exist_ok=True)

    defaults = dict(
        velocity=5.0,
        water_density=1025.0,
        location_in_mesh=(0.5, 0.5, 0.5),
        max_iterations=500,
        write_interval=25,
        angle_of_attack=0.0,
        center_of_gravity=(0, 0, 0),
        enable_layers=True,
        n_surface_layers=5,
        layer_expansion=1.2,
        first_layer_thickness=1e-4,
        feature_level=4,
        enable_gravity=True,
    )
    defaults.update(overrides)

    tm = TemplateManager(str(case_dir))
    tm.initialize_case(**defaults)
    return case_dir


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.1 — Velocity decomposition matches angle of attack
# ═════════════════════════════════════════════════════════════════════════════

class TestVelocityDecomposition:
    @pytest.mark.parametrize("aoa,expected_uz_sign", [
        (0.0,  0),    # uz ≈ 0
        (5.0,  -1),   # positive AoA → negative Uz
        (-5.0, +1),   # negative AoA → positive Uz
        (15.0, -1),   # larger AoA still negative
    ])
    def test_velocity_components(self, tmp_path, aoa, expected_uz_sign):
        V = 10.0
        case_dir = _init_case(tmp_path, velocity=V, angle_of_attack=aoa)

        u_text = _read_case_file(case_dir, "0/U")
        ux, _, uz = _parse_uniform_vector(u_text)

        aoa_rad = math.radians(aoa)
        expected_ux = V * math.cos(aoa_rad)
        expected_uz = -V * math.sin(aoa_rad)

        tol = 0.01 * V  # 1 % of velocity magnitude
        assert abs(ux - expected_ux) < tol, f"Ux={ux:.6f} expected {expected_ux:.6f}"
        assert abs(uz - expected_uz) < tol, f"Uz={uz:.6f} expected {expected_uz:.6f}"

        # Direction sign check
        if expected_uz_sign != 0:
            assert (uz > 0) == (expected_uz_sign > 0), (
                f"Uz sign wrong: got {uz}, expected sign {expected_uz_sign}"
            )

        # Magnitude preservation
        mag = math.sqrt(ux ** 2 + uz ** 2)
        assert abs(mag - V) < tol, f"|U|={mag:.6f} expected {V}"

        # No NaN
        assert math.isfinite(ux) and math.isfinite(uz)


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.2 — Gravity vector orientation
# ═════════════════════════════════════════════════════════════════════════════

class TestGravity:
    def test_gravity_enabled(self, tmp_path):
        case_dir = _init_case(tmp_path, enable_gravity=True)

        g_text = _read_case_file(case_dir, "constant/g")
        # Parse value (0 0 -9.81)
        m = re.search(r"value\s*\(\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s*\)", g_text)
        assert m, "Could not parse gravity value"
        gx, gy, gz = float(m.group(1)), float(m.group(2)), float(m.group(3))
        assert gx == 0.0 and gy == 0.0 and gz == pytest.approx(-9.81, abs=0.01)

        # Dimensions: [0 1 -2 0 0 0 0]
        assert "[0 1 -2 0 0 0 0]" in g_text

    def test_gravity_disabled(self, tmp_path):
        case_dir = _init_case(tmp_path, enable_gravity=False)
        # constant/g should NOT be written
        assert not (case_dir / "constant" / "g").exists()


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.3 — locationInMesh is inside the domain and outside the foil
# ═════════════════════════════════════════════════════════════════════════════

def test_location_in_mesh_outside_foil(make_foil_stl, tmp_path):
    """Verify the locationInMesh point is (a) inside the domain bounds,
    (b) outside the foil mesh, and (c) not within 10 % of any wall."""
    chord, span, thickness = 1.0, 0.5, 0.1
    stl_path = tmp_path / "foil.stl"
    make_foil_stl(path=stl_path, chord=chord, span=span, thickness=thickness)

    foil_trimesh = trimesh.load(str(stl_path), force="mesh")
    bounds = foil_trimesh.bounds  # [[xmin,ymin,zmin],[xmax,ymax,zmax]]
    char_len = max(bounds[1] - bounds[0])

    domain, loc = _build_domain_from_bounds(
        (
            bounds[0][0], bounds[1][0],
            bounds[0][1], bounds[1][1],
            bounds[0][2], bounds[1][2],
        )
    )
    lx = domain["x_max"] - domain["x_min"]
    ly = domain["y_max"] - domain["y_min"]
    lz = domain["z_max"] - domain["z_min"]
    loc = np.array(loc)

    # (a) Inside domain
    assert domain["x_min"] < loc[0] < domain["x_max"]
    assert domain["y_min"] < loc[1] < domain["y_max"]
    assert domain["z_min"] < loc[2] < domain["z_max"]

    # (b) Outside the foil.
    # For the current placement logic the point should be safely upstream of the foil,
    # so an axis-aligned bounds check is sufficient and avoids an optional rtree dep.
    assert loc[0] < bounds[0][0], (
        f"locationInMesh should be upstream of the foil: loc_x={loc[0]:.4f}, "
        f"foil_x_min={bounds[0][0]:.4f}"
    )

    # (c) Not within 10 % of any domain wall
    margin_x = 0.1 * lx
    margin_y = 0.1 * ly
    margin_z = 0.1 * lz
    assert loc[0] >= domain["x_min"] + margin_x
    assert loc[0] < domain["x_max"] - margin_x
    assert loc[1] >= domain["y_min"] + margin_y
    assert loc[1] < domain["y_max"] - margin_y
    assert loc[2] >= domain["z_min"] + margin_z
    assert loc[2] < domain["z_max"] - margin_z


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.4 — Domain sizing is proportional and asymmetric correctly
# ═════════════════════════════════════════════════════════════════════════════

class TestDomainSizing:
    @pytest.mark.parametrize("char_len", [1.0, 0.5])
    def test_domain_proportional(self, char_len):
        """Domain: 5× upstream, 10× downstream, 5× lateral each side."""
        # Foil centred at origin with given char_len as x-extent
        foil_x_min = -char_len / 2
        foil_x_max = char_len / 2
        foil_y_centre = 0.0

        upstream = 5.0 * char_len
        downstream = 10.0 * char_len
        lateral = 5.0 * char_len

        tol = 0.01 * char_len

        x_min_expected = foil_x_min - upstream
        x_max_expected = foil_x_max + downstream
        y_min_expected = foil_y_centre - char_len / 2 - lateral
        y_max_expected = foil_y_centre + char_len / 2 + lateral

        bounds = [foil_x_min, foil_x_max, -char_len / 2, char_len / 2, -0.05, 0.05]
        domain, _ = _build_domain_from_bounds(bounds)
        domain_x_min = domain["x_min"]
        domain_x_max = domain["x_max"]
        domain_y_min = domain["y_min"]
        domain_y_max = domain["y_max"]

        assert abs(domain_x_min - x_min_expected) < tol
        assert abs(domain_x_max - x_max_expected) < tol
        assert abs(domain_y_min - y_min_expected) < tol
        assert abs(domain_y_max - y_max_expected) < tol


def test_farfield_walls_use_slip_compatible_boundary_conditions(tmp_path):
    case_dir = _init_case(tmp_path)

    u_text = _read_case_file(case_dir, "0/U")
    k_text = _read_case_file(case_dir, "0/k")
    omega_text = _read_case_file(case_dir, "0/omega")
    nut_text = _read_case_file(case_dir, "0/nut")

    assert re.search(r"walls\s*\{[^}]*type\s+slip;", u_text, re.DOTALL)
    assert re.search(r"walls\s*\{[^}]*type\s+zeroGradient;", k_text, re.DOTALL)
    assert re.search(r"walls\s*\{[^}]*type\s+zeroGradient;", omega_text, re.DOTALL)
    assert re.search(r"walls\s*\{[^}]*type\s+calculated;", nut_text, re.DOTALL)


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.5 — First layer thickness scales with velocity and y+ target
# ═════════════════════════════════════════════════════════════════════════════

class TestFirstLayerThickness:
    def test_plausible_range(self):
        y1 = compute_first_layer_thickness(
            velocity=5.0, nu=1e-6, char_len=1.0, y_plus_target=1.0
        )
        assert 1e-6 < y1 < 1e-4, f"y1={y1:.6e} outside plausible range for water at 5 m/s"

    def test_yplus_scaling(self):
        y1_1 = compute_first_layer_thickness(
            velocity=5.0, nu=1e-6, char_len=1.0, y_plus_target=1.0
        )
        y1_30 = compute_first_layer_thickness(
            velocity=5.0, nu=1e-6, char_len=1.0, y_plus_target=30.0
        )
        ratio = y1_30 / y1_1
        # Should be exactly 30× because y1 is linear in y_plus_target
        assert abs(ratio - 30.0) < 0.01 * 30.0, f"ratio={ratio:.4f} ≠ 30"

    def test_velocity_effect(self):
        y1_low = compute_first_layer_thickness(
            velocity=5.0, nu=1e-6, char_len=1.0, y_plus_target=1.0
        )
        y1_high = compute_first_layer_thickness(
            velocity=20.0, nu=1e-6, char_len=1.0, y_plus_target=1.0
        )
        assert y1_high < y1_low, (
            f"Higher velocity should produce thinner BL: y1(20)={y1_high:.6e} vs y1(5)={y1_low:.6e}"
        )


class TestCheckMeshParsing:
    def test_good_mesh_is_accepted(self):
        output = """
        Mesh non-orthogonality Max: 38.4 average: 6.2
        Max skewness = 1.73 OK.
        Max aspect ratio = 24.8 OK.
        Mesh OK.
        """

        summary = _parse_check_mesh_output(output)
        acceptable, issues = _mesh_quality_is_acceptable(summary)

        assert summary["reported_mesh_ok"] is True
        assert summary["max_non_orthogonality"] == pytest.approx(38.4)
        assert summary["average_non_orthogonality"] == pytest.approx(6.2)
        assert summary["max_skewness"] == pytest.approx(1.73)
        assert summary["max_aspect_ratio"] == pytest.approx(24.8)
        assert summary["failed_checks"] == 0
        assert acceptable is True
        assert issues == []

    def test_bad_mesh_is_rejected(self):
        output = """
        Mesh non-orthogonality Max: 81.4 average: 12.1
        Max skewness = 5.12 OK.
        Max aspect ratio = 220.0 OK.
        Failed 2 mesh checks.
        """

        summary = _parse_check_mesh_output(output)
        acceptable, issues = _mesh_quality_is_acceptable(summary)

        assert acceptable is False
        assert any("mesh checks failed" in issue for issue in issues)
        assert any("non-orthogonality" in issue for issue in issues)
        assert any("skewness" in issue for issue in issues)


def test_snappy_refinement_regions_render(tmp_path):
    case_dir = _init_case(
        tmp_path,
        refinement_regions=[
            {
                "name": "foilInnerShell",
                "min_x": -0.25,
                "min_y": -0.10,
                "min_z": -0.05,
                "max_x": 1.25,
                "max_y": 0.10,
                "max_z": 0.05,
                "level": 5,
            },
            {
                "name": "foilOuterShell",
                "min_x": -0.50,
                "min_y": -0.25,
                "min_z": -0.15,
                "max_x": 1.75,
                "max_y": 0.25,
                "max_z": 0.15,
                "level": 4,
            },
        ],
    )

    shm_text = _read_case_file(case_dir, "system/snappyHexMeshDict")

    assert "type searchableBox;" in shm_text
    assert "foilInnerShell {" in shm_text
    assert "min (-0.25 -0.1 -0.05);" in shm_text
    assert "max (1.25 0.1 0.05);" in shm_text
    assert "foilOuterShell {" in shm_text
    assert "mode inside;" in shm_text
    assert "levels ((1E15 5));" in shm_text
    assert "levels ((1E15 4));" in shm_text


def test_refinement_region_helper_scales_from_chord():
    regions = _build_refinement_regions(
        (0.0, 1.0, -0.2, 0.2, -0.05, 0.05),
        mesh_density=1.0,
        feature_level=4,
    )

    assert [region["name"] for region in regions] == ["foilInnerShell", "foilOuterShell"]

    inner, outer = regions
    assert inner["level"] == 4
    assert outer["level"] == 3

    assert inner["min_x"] == pytest.approx(-0.2)
    assert inner["max_x"] == pytest.approx(1.35)
    assert outer["min_x"] == pytest.approx(-0.6)
    assert outer["max_x"] == pytest.approx(2.0)

    assert outer["min_x"] < inner["min_x"]
    assert outer["max_x"] > inner["max_x"]
    assert outer["min_y"] < inner["min_y"]
    assert outer["max_y"] > inner["max_y"]
    assert outer["min_z"] < inner["min_z"]
    assert outer["max_z"] > inner["max_z"]


def test_presentation_quality_flags_low_resolution_surface():
    summary = _assess_mesh_presentation_quality(
        {
            "surface_features": {"emesh_present": False},
            "snappy": {"features_block_populated": False},
            "foil_surface": {
                "patch_found": True,
                "cell_count": MIN_PRESENTATION_FOIL_SURFACE_CELLS - 1,
                "point_count": 4000,
            },
        }
    )

    assert summary["presentation_ok"] is False
    assert any("feature edge mesh missing" in issue for issue in summary["presentation_issues"])
    assert any("features() block" in issue for issue in summary["presentation_issues"])
    assert any("presentation threshold" in issue for issue in summary["presentation_issues"])


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.6 — p_rgh vs p selection based on enable_gravity
# ═════════════════════════════════════════════════════════════════════════════

class TestPressureSelection:
    def test_gravity_on_uses_p_rgh(self, tmp_path):
        case_dir = _init_case(tmp_path, enable_gravity=True)

        assert (case_dir / "0" / "p_rgh").exists(), "0/p_rgh should exist with gravity on"
        # Both p and p_rgh exist when gravity is on (tasks.py writes both)
        assert (case_dir / "0" / "p").exists(), "0/p should also exist with gravity on"
        assert (case_dir / "constant" / "g").exists(), "constant/g should exist with gravity on"

    def test_gravity_off_uses_p(self, tmp_path):
        case_dir = _init_case(tmp_path, enable_gravity=False)

        assert (case_dir / "0" / "p").exists(), "0/p should exist with gravity off"
        assert not (case_dir / "0" / "p_rgh").exists(), "0/p_rgh should NOT exist with gravity off"
        assert not (case_dir / "constant" / "g").exists(), "constant/g should NOT exist with gravity off"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2.7 — CofR matches CoG from SimulationRun
# ═════════════════════════════════════════════════════════════════════════════

def test_cofr_matches_cog(tmp_path):
    cog = [0.3, 0.0, -0.05]
    case_dir = _init_case(tmp_path, center_of_gravity=cog)

    cd_text = _read_case_file(case_dir, "system/controlDict")

    # Parse CofR from the forces function object
    m = re.search(r"CofR\s*\(\s*([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s*\)", cd_text)
    assert m, f"Could not find CofR in controlDict"
    cofr = (float(m.group(1)), float(m.group(2)), float(m.group(3)))

    assert cofr == pytest.approx(tuple(cog), abs=1e-9), (
        f"CofR={cofr} ≠ CoG={cog}"
    )
