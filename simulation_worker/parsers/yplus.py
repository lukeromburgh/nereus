"""Parser for OpenFOAM yPlus results."""
import glob
import logging
import os
import re

logger = logging.getLogger(__name__)


def _parse_yplus(case_dir) -> tuple:
    """Parse yPlus values from OpenFOAM postProcessing directory.

    Returns:
        tuple: (yplus_max, yplus_mean) or (None, None) if not found
    """
    post_dir = os.path.join(case_dir, "postProcessing")
    if not os.path.exists(post_dir):
        return None, None

    yplus_dirs = glob.glob(os.path.join(post_dir, "yPlus*"))
    if not yplus_dirs:
        return None, None

    latest_dir = sorted(yplus_dirs)[-1]
    log_files = glob.glob(os.path.join(latest_dir, "*", "yPlus.log"))
    if not log_files:
        return None, None

    log_file = log_files[0]
    try:
        with open(log_file, 'r') as f:
            content = f.read()

        yplus_values = []
        for line in content.split('\n'):
            parts = line.split()
            if len(parts) >= 2:
                try:
                    val = float(parts[1])
                    yplus_values.append(val)
                except ValueError:
                    continue

        if not yplus_values:
            return None, None

        return max(yplus_values), sum(yplus_values) / len(yplus_values)
    except Exception as e:
        logger.warning(f"Failed to parse yPlus: {e}")
        return None, None


__all__ = ['_parse_yplus']
