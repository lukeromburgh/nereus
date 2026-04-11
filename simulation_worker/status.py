"""Status patching helpers and custom exceptions."""
import logging
import requests
from config import DJANGO_API_URL

logger = logging.getLogger(__name__)


class StatusPatchError(Exception):
    """Raised when status patch to Django API fails."""
    pass


def patch_django_status(
    sim_id,
    status=None,
    error_log=None,
    result_mesh_path=None,
    *,
    result_sequence_path=None,
    frame_mapping=None,
    metrics_series=None,
    convergence_series=None,
    raise_on_failure=False,
) -> bool:
    """Patch simulation run status to Django API.

    Args:
        sim_id: Simulation run ID
        status: Status string (PENDING, RUNNING, COMPLETED, FAILED, etc.)
        error_log: Log message or partial logs to store
        result_mesh_path: Path to result mesh file
        result_sequence_path: Path to temporal sequence JSON
        frame_mapping: List of per-frame metadata dicts
        metrics_series: List of force/time data points
        convergence_series: List of convergence residual points
        raise_on_failure: If True, raise StatusPatchError on network failure

    Returns:
        True if patch succeeded, False if it failed.
        If raise_on_failure=True, raises StatusPatchError on failure instead.
    """
    payload = {}
    if status:
        payload["status"] = status
    if error_log is not None:
        payload["current_logs"] = error_log
    if result_mesh_path:
        payload["result_mesh_path"] = result_mesh_path
    if result_sequence_path is not None:
        payload["result_sequence_path"] = result_sequence_path
    if frame_mapping is not None:
        payload["frame_mapping"] = frame_mapping
    if metrics_series is not None:
        payload["metrics_series"] = metrics_series
    if convergence_series is not None:
        payload["convergence_series"] = convergence_series

    if not payload:
        return True

    try:
        response = requests.patch(f"{DJANGO_API_URL}/{sim_id}/", json=payload, timeout=10)
        response.raise_for_status()
        return True
    except requests.exceptions.ConnectionError as e:
        logger.error(f"[sim_id={sim_id}] Failed to connect to Django API: {e}")
        if raise_on_failure:
            raise StatusPatchError(f"Connection failed for sim {sim_id}: {e}") from e
        return False
    except requests.exceptions.Timeout as e:
        logger.error(f"[sim_id={sim_id}] Django API request timed out: {e}")
        if raise_on_failure:
            raise StatusPatchError(f"Timeout for sim {sim_id}: {e}") from e
        return False
    except requests.exceptions.HTTPError as e:
        logger.error(f"[sim_id={sim_id}] Django API returned error {e.response.status_code}: {e}")
        if raise_on_failure:
            raise StatusPatchError(f"HTTP error for sim {sim_id}: {e}") from e
        return False
    except Exception as e:
        logger.error(f"[sim_id={sim_id}] Unexpected error updating Django API: {e}")
        if raise_on_failure:
            raise StatusPatchError(f"Unexpected error for sim {sim_id}: {e}") from e
        return False


class DivergenceError(Exception):
    """Raised when simulation diverges (residuals blow up)."""
    pass


__all__ = ['patch_django_status', 'DivergenceError', 'StatusPatchError']
