"""
Shared fixtures for the Nereus coordinate-system / orientation test suite.

All fixtures produce deterministic, synthetic data — no database, no Docker,
no real OpenFOAM runs required.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

import numpy as np
import pytest
import trimesh
import trimesh.transformations as tf

# ---------------------------------------------------------------------------
# make_foil_stl — deterministic box-proxy for a hydrofoil
# ---------------------------------------------------------------------------

@pytest.fixture
def make_foil_stl(tmp_path: Path):
    """Return a factory that creates a box STL as a hydrofoil proxy.

    Parameters
    ----------
    path : Path | str
        Where to save the STL.
    chord : float
        X-extent (longest dimension).
    span : float
        Y-extent (second-longest dimension).
    thickness : float
        Z-extent (shortest dimension).
    transform : np.ndarray | None
        Optional 4×4 homogeneous transform applied *before* export.

    Returns the trimesh.Trimesh that was saved.
    """

    def _factory(
        path: Path | str | None = None,
        chord: float = 1.0,
        span: float = 0.5,
        thickness: float = 0.1,
        transform: Optional[np.ndarray] = None,
    ) -> trimesh.Trimesh:
        mesh = trimesh.creation.box(extents=[chord, span, thickness])
        if transform is not None:
            mesh.apply_transform(transform)
        if path is None:
            path = tmp_path / "foil.stl"
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        mesh.export(str(path))
        return mesh

    return _factory


# ---------------------------------------------------------------------------
# make_fake_forces_dat — synthetic OpenFOAM forces.dat
# ---------------------------------------------------------------------------

@pytest.fixture
def make_fake_forces_dat():
    """Return a factory that writes a minimal forces.dat.

    The file follows the OpenFOAM convention:
        time (pressureFx pressureFy pressureFz) (viscousFx viscousFy viscousFz)
    with all viscous forces set to zero and pressure forces set to the
    requested Fx/Fy/Fz.
    """

    def _factory(
        path: Path | str,
        Fx: float,
        Fy: float,
        Fz: float,
        Mx: float = 0.0,
        My: float = 0.0,
        Mz: float = 0.0,
        n_steps: int = 100,
    ) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        lines = ["# Forces\n"]
        for i in range(1, n_steps + 1):
            t = float(i)
            lines.append(
                f"{t}\t({Fx} {Fy} {Fz}) (0 0 0) (0 0 0)\n"
            )

        path.write_text("".join(lines))
        return path

    return _factory


# ---------------------------------------------------------------------------
# make_fake_moment_dat — synthetic moment.dat (same vector format as forces)
# ---------------------------------------------------------------------------

@pytest.fixture
def make_fake_moment_dat():
    """Return a factory that writes a minimal moment.dat."""

    def _factory(
        path: Path | str,
        Mx: float,
        My: float,
        Mz: float,
        n_steps: int = 100,
    ) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        lines = ["# Moments\n"]
        for i in range(1, n_steps + 1):
            t = float(i)
            lines.append(
                f"{t}\t({Mx} {My} {Mz}) (0 0 0) (0 0 0)\n"
            )

        path.write_text("".join(lines))
        return path

    return _factory


# ---------------------------------------------------------------------------
# make_fake_openfoam_result — synthetic PyVista mesh with p, U, k arrays
# ---------------------------------------------------------------------------

@pytest.fixture
def make_fake_openfoam_result():
    """Return a factory that produces a pv.PolyData foil surface with
    analytically populated pressure and velocity fields.

    Uses thin-aerofoil theory Cp ≈ 2α for a flat plate as a first-order
    approximation:
    - Upper surface Cp = -(2 * AoA_rad) at each chordwise station (simplified)
    - Lower surface Cp = +(2 * AoA_rad)
    The actual distribution varies, but this gives a consistent, deterministic
    result whose sign convention matches physics.
    """
    import pyvista as pv

    def _factory(
        chord: float = 1.0,
        span: float = 0.5,
        velocity: float = 5.0,
        aoa: float = 5.0,
        rho: float = 1025.0,
        n_chord: int = 50,
        n_span: int = 10,
        centre: tuple[float, float, float] = (0.0, 0.0, 0.0),
    ) -> pv.PolyData:
        """Create a synthetic foil surface mesh (flat plate).

        Returns pv.PolyData with point arrays: p, U, k, Cp, surface_label.
        """
        aoa_rad = math.radians(aoa)
        q_inf = 0.5 * rho * velocity ** 2

        xs = np.linspace(0.0, chord, n_chord)
        ys = np.linspace(-span / 2, span / 2, n_span)

        # Upper surface (z = +thickness_half)
        thickness_half = chord * 0.05  # 10% t/c
        pts_upper = []
        pts_lower = []
        for y in ys:
            for x in xs:
                pts_upper.append([x + centre[0], y + centre[1], thickness_half + centre[2]])
                pts_lower.append([x + centre[0], y + centre[1], -thickness_half + centre[2]])

        all_pts = np.array(pts_upper + pts_lower, dtype=np.float64)
        n_pts = len(all_pts)
        n_upper = len(pts_upper)

        # Labels: 0 = upper, 1 = lower
        labels = np.zeros(n_pts, dtype=np.int32)
        labels[n_upper:] = 1

        # Cp distribution (simplified thin-aerofoil)
        Cp = np.zeros(n_pts, dtype=np.float64)
        Cp[:n_upper] = -2.0 * aoa_rad   # suction (upper)
        Cp[n_upper:] = +2.0 * aoa_rad   # pressure (lower)

        # Pressure field: p = Cp * q_inf / rho  (OpenFOAM kinematic pressure)
        p = Cp * q_inf / rho

        # Velocity field: uniform freestream at AoA
        Ux = velocity * math.cos(aoa_rad)
        Uz = -velocity * math.sin(aoa_rad)
        U = np.tile([Ux, 0.0, Uz], (n_pts, 1)).astype(np.float64)

        # Turbulent kinetic energy
        ti = 0.05
        k = np.full(n_pts, 1.5 * (ti * velocity) ** 2, dtype=np.float64)

        cloud = pv.PolyData(all_pts)
        cloud.point_data["p"] = p
        cloud.point_data["U"] = U
        cloud.point_data["k"] = k
        cloud.point_data["Cp"] = Cp
        cloud.point_data["surface_label"] = labels

        return cloud

    return _factory


# ---------------------------------------------------------------------------
# fake_run — minimal SimulationRun-like namespace (no Django ORM)
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_run():
    """Return a factory that creates a SimpleNamespace mimicking a Django
    SimulationRun model instance.  Sensible defaults are provided; any
    keyword argument overrides the corresponding field.
    """

    def _factory(**overrides) -> SimpleNamespace:
        defaults = dict(
            id=1,
            pk=1,
            velocity=5.0,
            angle_of_attack=0.0,
            water_density=1025.0,
            mesh_density=1.0,
            submersion_depth=0.5,
            enable_gravity=True,
            enable_layers=True,
            n_surface_layers=5,
            layer_expansion=1.2,
            feature_level=4,
            pitch=0.0,
            roll=0.0,
            yaw=0.0,
            mass=100.0,
            payload_weight=50.0,
            center_of_gravity=[0, 0, 0],
            slice_axis="y",
            geometry_axes_detected={},
            geometry_dimensions={},
            # These will be written by normalise_stl_orientation
            _saved_fields={},
        )
        defaults.update(overrides)

        ns = SimpleNamespace(**defaults)

        # Provide a save() stub that records which fields were "persisted"
        def _save(update_fields=None):
            if update_fields:
                for f in update_fields:
                    ns._saved_fields[f] = getattr(ns, f, None)

        ns.save = _save
        return ns

    return _factory
