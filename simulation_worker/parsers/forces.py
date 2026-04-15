"""Parser for OpenFOAM forces.dat output files."""
import glob
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ForceEntry:
    """Single timestep force entry."""
    time: float
    fx: Optional[float]
    fy: Optional[float]
    fz: Optional[float]
    moment_x: Optional[float]
    moment_y: Optional[float]
    moment_z: Optional[float]


class ForcesParser:
    """Parser for OpenFOAM forces.dat files."""

    def __init__(self, forces_dir: str):
        self.forces_dir = forces_dir
        self.forces_file = None
        self._find_forces_file()

    def _find_forces_file(self):
        """Locate the forces.dat file in the directory."""
        candidates = glob.glob(os.path.join(self.forces_dir, "forces.dat"))
        if candidates:
            self.forces_file = candidates[0]

    # Pre-compiled pattern to extract all floats from a data line.
    # OpenFOAM 11 forces.dat format (one row per time step):
    #   time  ((p_fx p_fy p_fz) (v_fx v_fy v_fz))  ((p_mx p_my p_mz) (v_mx v_my v_mz))
    _FLOAT_RE = re.compile(r'[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?')

    def parse(self) -> dict:
        """Parse forces.dat and return dictionary keyed by time.

        Handles the OpenFOAM 11 columnar format where each data line contains
        13 floats representing: time, pressure force (3), viscous force (3),
        pressure moment (3), viscous moment (3).  Total force/moment for each
        axis is the sum of the pressure and viscous contributions.
        """
        if not self.forces_file or not os.path.exists(self.forces_file):
            logger.warning(f"forces.dat not found in {self.forces_dir}")
            return {}

        forces_by_time = {}

        try:
            with open(self.forces_file, 'r') as f:
                for line in f:
                    # Skip comment / header lines
                    if line.lstrip().startswith('#'):
                        continue
                    nums = self._FLOAT_RE.findall(line)
                    if len(nums) < 13:
                        continue
                    try:
                        vals = [float(n) for n in nums[:13]]
                    except ValueError:
                        continue
                    t = vals[0]
                    # indices 1-3: pressure force; 4-6: viscous force
                    fx = vals[1] + vals[4]
                    fy = vals[2] + vals[5]
                    fz = vals[3] + vals[6]
                    # indices 7-9: pressure moment; 10-12: viscous moment
                    mx = vals[7] + vals[10]
                    my = vals[8] + vals[11]
                    mz = vals[9] + vals[12]
                    forces_by_time[t] = {
                        'Fx': fx, 'Fy': fy, 'Fz': fz,
                        'Mx': mx, 'My': my, 'Mz': mz,
                    }
        except Exception as e:
            logger.error(f"Error parsing forces.dat: {e}")
        return forces_by_time


def parse_forces(case_dir: str) -> dict:
    """Convenience function to parse forces from a case directory."""
    post_dir = os.path.join(case_dir, "postProcessing", "forces")
    if not os.path.exists(post_dir):
        logger.warning(f"postProcessing/forces not found in {case_dir}")
        return {}
    subdirs = sorted(glob.glob(os.path.join(post_dir, "*")))
    if not subdirs:
        return {}
    latest_dir = subdirs[-1]
    parser = ForcesParser(latest_dir)
    return parser.parse()


def compute_lift_drag_ratio(fx: float, fz: float) -> Optional[float]:
    """Compute lift-to-drag ratio from force components."""
    if not fx or abs(fx) < 1e-12:
        return None
    return abs(fz / fx)


def build_metrics_series(forces_by_time: dict) -> list:
    """Build metrics series list from forces data."""
    if not forces_by_time:
        return []
    sorted_times = sorted(forces_by_time.keys())
    metrics_list = []
    for idx, t in enumerate(sorted_times):
        entry = forces_by_time[t]
        fx = entry.get("Fx")
        fy = entry.get("Fy")
        fz = entry.get("Fz")
        ld = compute_lift_drag_ratio(fx, fz)
        metrics_list.append({
            "frame_index": idx,
            "time_value": t,
            "Fx": fx,
            "Fy": fy,
            "Fz": fz,
            "ld_ratio": ld,
        })
    return metrics_list


__all__ = [
    'ForceEntry', 'ForcesParser', 'parse_forces',
    'compute_lift_drag_ratio', 'build_metrics_series',
]
