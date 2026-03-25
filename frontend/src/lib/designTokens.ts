export interface DesignTokens {
  background: {
    base: string;
    solid: string;
    raised: string;
    overlay: string;
    container: string;
  };
  accent: {
    primary: string;
    glow: string;
    cyan: string;
    emerald: string;
    amber: string;
    rose: string;
    indigo: string;
  };
  border: {
    default: string;
    active: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    disabled: string;
  };
  numeric: {
    a: string;
    lift: string;
    drag: string;
    side: string;
    chartA: string;
    chartB: string;
    grid: string;
    markerStroke: string;
    err: string;
    ok: string;
    residual: {
      p: string;
      Ux: string;
      Uy: string;
      Uz: string;
    };
  };
  special: {
    tooltipBackground: string;
    tooltipBorder: string;
    tooltipText: string;
    chartGridStroke: string;
    chartAxisStroke: string;
    chartAxisTick: string;
    chartSecondary: string;
    chartHighlight: string;
    toggleBorderDefault: string;
    markerGlowAmber: string;
    tooltipBoxShadow: string;
    whiteGlow: string;
  };
  status: {
    danger: {
      bg: string;
      border: string;
      text: string;
    };
    warning: {
      bg: string;
      border: string;
      text: string;
    };
    success: {
      bg: string;
      border: string;
      text: string;
    };
  };
}

const token = (varName: string): string => {
  const key = varName.startsWith("--") ? varName : `--${varName}`;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(key).trim() ||
    ""
  );
};

export const getToken = (name: string): string => token(name);

const buildDesignTokens = (): DesignTokens => ({
  background: {
    base: token("color-surface-base"),
    solid: token("color-surface-solid"),
    raised: token("color-surface-raised"),
    overlay: token("color-surface-overlay"),
    container: token("color-surface-container"),
  },
  accent: {
    primary: token("color-accent-primary"),
    glow: token("color-accent-glow"),
    cyan: token("color-accent-cyan"),
    emerald: token("color-accent-emerald"),
    amber: token("color-accent-amber"),
    rose: token("color-accent-rose"),
    indigo: token("color-accent-indigo"),
  },
  border: {
    default: token("color-border"),
    active: token("color-border-active"),
  },
  text: {
    primary: token("color-text-primary"),
    secondary: token("color-text-secondary"),
    muted: token("color-text-muted"),
    disabled: token("color-text-disabled"),
  },
  numeric: {
    a: token("color-accent-glow") || "#60a5fa",
    lift: token("color-accent-emerald") || "#34d399",
    drag: token("color-accent-rose") || "#fb7185",
    side: token("color-accent-amber") || "#fbbf24",
    chartA: token("color-chart-a") || "#c3f5ff",
    chartB: token("color-chart-b") || "#bef500",
    grid: token("color-chart-grid") || "#3b494c",
    markerStroke: token("color-chart-highlight") || "#10151a",
    err: token("color-error") || "#ff4d4d",
    ok: token("color-success") || "#bef500",
    residual: {
      p: token("color-residual-p") || "#60a5fa",
      Ux: token("color-residual-Ux") || "#94a3b8",
      Uy: token("color-residual-Uy") || "#fbbf24",
      Uz: token("color-residual-Uz") || "#34d399",
    },
  },
  special: {
    tooltipBackground: token("tooltip-background"),
    tooltipBorder: token("tooltip-border"),
    tooltipText: token("tooltip-text"),
    chartGridStroke: token("chart-grid-stroke"),
    chartAxisStroke: token("chart-axis-stroke"),
    chartAxisTick: token("chart-axis-tick"),
    chartSecondary: token("chart-secondary"),
    chartHighlight: token("chart-highlight"),
    toggleBorderDefault: token("toggle-border-default"),
    markerGlowAmber: token("marker-glow-amber"),
    tooltipBoxShadow: token("shadow-tooltip"),
    whiteGlow: token("white-glow"),
  },
  status: {
    danger: {
      bg: token("color-status-danger-bg") || "rgba(251, 113, 133, 0.1)",
      border: token("color-status-danger-border") || "rgba(251, 113, 133, 0.4)",
      text: token("color-status-danger-text") || "#fda4af",
    },
    warning: {
      bg: token("color-status-warning-bg") || "rgba(251, 191, 36, 0.1)",
      border: token("color-status-warning-border") || "rgba(251, 191, 36, 0.4)",
      text: token("color-status-warning-text") || "#fef08a",
    },
    success: {
      bg: token("color-status-success-bg") || "rgba(52, 211, 153, 0.2)",
      border: token("color-status-success-border") || "rgba(52, 211, 153, 0.3)",
      text: token("color-status-success-text") || "#34d399",
    },
  },
});

export let designTokens: DesignTokens = buildDesignTokens();

export const refreshDesignTokens = (): void => {
  designTokens = buildDesignTokens();
};
