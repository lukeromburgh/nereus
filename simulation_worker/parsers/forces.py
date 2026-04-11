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

    def parse(self) -> dict:
        """Parse forces.dat and return dictionary keyed by time."""
        if not self.forces_file or not os.path.exists(self.forces_file):
            logger.warning(f"forces.dat not found in {self.forces_dir}")
            return {}

        forces_by_time = {}
        current_time = None
        current_data = {}
        header_pattern = re.compile(r'^#\s*Time\s*=\s*([\d.eE+]+)')

        try:
            with open(self.forces_file, 'r') as f:
                for line in f:
                    time_match = header_pattern.match(line)
                    if time_match:
                        if current_time is not None and current_data:
                            forces_by_time[current_time] = current_data
                        current_time = float(time_match.group(1))
                        current_data = {}
                        continue
                    if current_time is None:
                        continue
                    if line.strip().startswith('forces'):
                        parts = line.split()
                        if len(parts) >= 5:
                            try:
                                fx = float(parts[2])
                                fy = float(parts[3])
                                fz = float(parts[4])
                                current_data.update({'Fx': fx, 'Fy': fy, 'Fz': fz})
                            except (ValueError, IndexError):
                                pass
                        continue
                    if line.strip().startswith('Moments'):
                        parts = line.split()
                        if len(parts) >= 5:
                            try:
                                mx = float(parts[2])
                                my = float(parts[3])
                                mz = float(parts[4])
                                current_data.update({'Mx': mx, 'My': my, 'Mz': mz})
                            except (ValueError, IndexError):
                                pass
                        continue
            if current_time is not None and current_data:
                forces_by_time[current_time] = current_data
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
