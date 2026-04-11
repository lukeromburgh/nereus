"""OpenFOAM solver utilities."""
import logging

logger = logging.getLogger(__name__)


def compute_first_layer_thickness(velocity, nu, char_len, y_plus_target=1.0):
    """Flat-plate Cf approximation for first cell-layer height.

    Re_L  = V * L / nu
    Cf    ≈ 0.026 * Re_L^(-1/7)
    tau_w = 0.5 * rho * V^2 * Cf
    u_tau = sqrt(tau_w / rho)
    y1    = y+ * nu / u_tau

    Args:
        velocity: Freestream velocity [m/s]
        nu: Kinematic viscosity [m²/s]
        char_len: Characteristic length (chord) [m]
        y_plus_target: Target y+ value (default 1.0)

    Returns:
        First layer thickness [m]
    """
    rho = 1025.0  # seawater density
    Re_L = velocity * char_len / nu
    Cf = 0.026 * Re_L ** (-1.0 / 7.0)
    tau_w = 0.5 * rho * velocity ** 2 * Cf
    u_tau = (tau_w / rho) ** 0.5
    y1 = y_plus_target * nu / u_tau
    return y1


__all__ = ['compute_first_layer_thickness']
