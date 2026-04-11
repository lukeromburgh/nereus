"""Parser for OpenFOAM log files and residuals."""
import glob
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ResidualEntry:
    """Single iteration residual entry."""
    iteration: int
    time: Optional[float]
    residuals: dict


class ResidualsParser:
    """Parser for OpenFOAM solver log output containing residuals."""

    def __init__(self, log_file: Optional[str] = None):
        self.log_file = log_file

    def parse_file(self, log_file: str) -> dict:
        """Parse a log file and extract residuals."""
        if not os.path.exists(log_file):
            logger.warning(f"Log file not found: {log_file}")
            return {}

        residuals_by_time = {}
        current_time = None
        current_iteration = None
        current_residuals = {}

        time_pattern = re.compile(r"^Time\s*=\s*([\d.eE+]+)")
        iter_pattern = re.compile(r"^\s*Iteration\s+(\d+)")
        residual_pattern = re.compile(r"^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\d.eE+-]+)")

        try:
            with open(log_file, 'r') as f:
                for line in f:
                    time_match = time_pattern.match(line)
                    if time_match:
                        if current_time is not None and current_residuals:
                            residuals_by_time[current_time] = current_residuals.copy()
                        current_time = float(time_match.group(1))
                        current_residuals = {}
                        continue

                    iter_match = iter_pattern.match(line)
                    if iter_match:
                        current_iteration = int(iter_match.group(1))
                        continue

                    residual_match = residual_pattern.match(line)
                    if residual_match and current_iteration is not None:
                        field = residual_match.group(1)
                        value = float(residual_match.group(2))
                        current_residuals[field] = value

            if current_time is not None and current_residuals:
                residuals_by_time[current_time] = current_residuals

        except Exception as e:
            logger.error(f"Error parsing residuals: {e}")

        return residuals_by_time


def parse_residuals(log_file: str) -> dict:
    """Convenience function to parse residuals from a log file."""
    parser = ResidualsParser(log_file)
    return parser.parse_file(log_file)


def build_convergence_series(residuals_by_time: dict) -> list:
    """Build convergence series from residuals data."""
    if not residuals_by_time:
        return []

    series = []
    for idx, (time_val, residuals) in enumerate(sorted(residuals_by_time.items())):
        max_residual = max(residuals.values()) if residuals else 0.0
        series.append({
            "iteration": idx,
            "time": time_val,
            "residual": max_residual,
        })

    return series


__all__ = [
    'ResidualEntry',
    'ResidualsParser',
    'parse_residuals',
    'build_convergence_series',
]
