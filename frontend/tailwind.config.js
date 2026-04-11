/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Nereus dark instrument palette ──────────────────────────────────
        'nereus-base': '#0a0b0d',
        'nereus-panel': '#111318',
        'nereus-surface': '#181c23',
        'nereus-accent': '#00d4ff',
        'nereus-orange': '#ff6b35',

        background: {
          DEFAULT: "#0a0b0d",
          solid: "#0a0b0d",
          elevated: "#111318",
          muted: "#181c23",
        },
        foreground: {
          DEFAULT: "rgba(255,255,255,0.9)",
          muted: "rgba(255,255,255,0.55)",
          subtle: "rgba(255,255,255,0.35)",
          disabled: "rgba(255,255,255,0.2)",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.07)",
          hover: "rgba(255,255,255,0.12)",
          active: "rgba(255,255,255,0.2)",
        },
        input: {
          DEFAULT: "rgba(255,255,255,0.04)",
          hover: "rgba(255,255,255,0.08)",
        },
        ring: {
          DEFAULT: "#00d4ff",
        },
        surface: {
          DEFAULT: "#111318",
          base: "#0a0b0d",
          solid: "#0a0b0d",
          raised: "#181c23",
          overlay: "rgba(24,28,35,0.8)",
          container: "rgba(255,255,255,0.03)",
        },
        accent: {
          DEFAULT: "#00d4ff",
          foreground: "#0a0b0d",
          glow: "#00d4ff",
          muted: "rgba(0,212,255,0.15)",
          cyan: "#00d4ff",
          emerald: "#22c55e",
          rose: "#ff6b35",
          amber: "#f59e0b",
        },
        status: {
          success: "#22c55e",
          "success-muted": "#166534",
          warning: "#f59e0b",
          "warning-muted": "#92400e",
          destructive: "#ff6b35",
          "destructive-muted": "#9f1239",
          info: "#00d4ff",
          "info-muted": "#0e3a47",
        },
        hud: {
          border: "rgba(255,255,255,0.06)",
          "border-active": "rgba(0,212,255,0.3)",
        },
        chart: {
          grid: "rgba(255,255,255,0.05)",
          axis: "rgba(255,255,255,0.35)",
          line1: "#00d4ff",
          line2: "#ff6b35",
          line3: "#22c55e",
          line4: "#f59e0b",
          line5: "#a855f7",
        },
      },
      borderRadius: {
        none: "0px",
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
        full: "9999px",
      },
      backdropBlur: {
        xs: "2px",
        hud: "16px",
      },
      boxShadow: {
        "2xs": "none",
        xs: "none",
        sm: "none",
        DEFAULT: "none",
        md: "none",
        lg: "none",
        xl: "none",
        inner: "inset 0 1px 2px 0 rgba(0, 0, 0, 0.3)",
        glass: "none",
        "glass-raised": "none",
        focus: "none",
        "focus-inset": "none",
        "glow-blue": "none",
      },
      fontFamily: {
        mono: [
          '"JetBrains Mono"',
          '"Fira Code"',
          "ui-monospace",
          "monospace",
        ],
        sans: [
          '"Inter"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      width: {
        "1/10": "10%",
        "2/5": "40%",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        glow: "glow 2s ease-in-out infinite alternate",
        "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slide-up 0.3s ease-out",
        wave: "wave 2s linear infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(0, 212, 255, 0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(0, 212, 255, 0.5)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "slide-up": {
          from: { transform: "translateY(10px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        wave: {
          "0%": { transform: "rotate(0deg)" },
          "10%": { transform: "rotate(14deg)" },
          "20%": { transform: "rotate(-8deg)" },
          "30%": { transform: "rotate(14deg)" },
          "40%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(10deg)" },
          "60%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
      },
    },
  },
  plugins: [
    function ({ addBase, addComponents, addUtilities }) {
      addBase({
        ":root": {
          "--radius": "2px",
        },
      });
      addUtilities({
        ".scrollbar-dark": {
          "scrollbar-width": "thin",
          "scrollbar-color": "rgba(255,255,255,0.12) #0a0b0d",
        },
        ".scrollbar-dark::-webkit-scrollbar": {
          width: "6px",
          height: "6px",
        },
        ".scrollbar-dark::-webkit-scrollbar-track": {
          background: "transparent",
        },
        ".scrollbar-dark::-webkit-scrollbar-thumb": {
          background: "rgba(255,255,255,0.1)",
          "border-radius": "0",
        },
      });
      addComponents({
        ".glass-panel": {
          background: "#111318",
          border: "1px solid rgba(255,255,255,0.07)",
          "border-radius": "2px",
        },
        ".glass-panel-raised": {
          background: "#181c23",
          border: "1px solid rgba(255,255,255,0.1)",
          "border-radius": "2px",
        },
        ".glass-panel-refined": {
          background: "#111318",
          border: "1px solid rgba(255,255,255,0.06)",
          "border-radius": "2px",
        },
        ".btn-primary": {
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          "border-radius": "2px",
          padding: "0 0.75rem",
          height: "32px",
          "font-size": "12px",
          "font-weight": "500",
          "letter-spacing": "0.05em",
          "text-transform": "uppercase",
          color: "#0a0b0d",
          background: "#00d4ff",
          border: "none",
          transition: "background 150ms",
          "&:hover": {
            background: "#00bfe8",
          },
          "&:focus-visible": {
            outline: "none",
            "border-color": "#00d4ff",
          },
          "&:disabled": {
            opacity: "0.5",
            cursor: "not-allowed",
          },
        },
        ".btn-secondary": {
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          "border-radius": "2px",
          padding: "0 0.75rem",
          height: "32px",
          "font-size": "12px",
          "font-weight": "500",
          color: "rgba(255,255,255,0.6)",
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.15)",
          transition: "all 150ms",
          "&:hover": {
            "border-color": "rgba(255,255,255,0.3)",
            color: "#ffffff",
          },
        },
        ".input-base": {
          display: "block",
          width: "100%",
          "border-radius": "2px",
          padding: "0 8px",
          height: "28px",
          "font-size": "12px",
          color: "rgba(255,255,255,0.9)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          transition: "border-color 150ms",
          "&::placeholder": {
            color: "rgba(255,255,255,0.25)",
          },
          "&:hover": {
            "border-color": "rgba(255,255,255,0.15)",
          },
          "&:focus": {
            outline: "none",
            "border-color": "#00d4ff",
          },
          "&:disabled": {
            opacity: "0.4",
            cursor: "not-allowed",
          },
        },
        ".input": {
          display: "block",
          width: "100%",
          "border-radius": "2px",
          padding: "0 8px",
          height: "28px",
          "font-size": "12px",
          color: "rgba(255,255,255,0.9)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          transition: "border-color 150ms",
          "&::placeholder": {
            color: "rgba(255,255,255,0.25)",
          },
          "&:hover": {
            "border-color": "rgba(255,255,255,0.15)",
          },
          "&:focus": {
            outline: "none",
            "border-color": "#00d4ff",
          },
          "&:disabled": {
            opacity: "0.4",
            cursor: "not-allowed",
          },
        },
        ".select": {
          display: "block",
          width: "100%",
          "border-radius": "2px",
          padding: "0 8px",
          height: "28px",
          "font-size": "12px",
          color: "rgba(255,255,255,0.9)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          transition: "border-color 150ms",
          appearance: "none",
          "background-image": "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.35)' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")",
          "background-repeat": "no-repeat",
          "background-position": "right 0.5rem center",
          "padding-right": "2rem",
          "&:hover": {
            "border-color": "rgba(255,255,255,0.15)",
          },
          "&:focus": {
            outline: "none",
            "border-color": "#00d4ff",
          },
          "&:disabled": {
            opacity: "0.4",
            cursor: "not-allowed",
          },
        },
        ".hud-label": {
          "font-size": "10px",
          "font-weight": "400",
          "text-transform": "uppercase",
          "letter-spacing": "0.1em",
          color: "rgba(255,255,255,0.35)",
        },
        ".hud-value": {
          "font-size": "13px",
          "font-weight": "500",
          "font-family": '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
          "font-variant-numeric": "tabular-nums",
          color: "rgba(255,255,255,0.9)",
        },
        ".hud-value-lg": {
          "font-size": "14px",
          "font-weight": "500",
          "font-family": '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
          "font-variant-numeric": "tabular-nums",
          color: "#00d4ff",
          "line-height": "1",
        },
        ".hud-unit": {
          "font-size": "10px",
          color: "rgba(255,255,255,0.35)",
          "margin-left": "0.125rem",
        },
      });
    },
  ],
};
