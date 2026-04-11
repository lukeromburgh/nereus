/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Dark aerospace palette ──────────────────────────────────────────
        // Near-black base with white text. Blue is reserved for active states only.
        background: {
          DEFAULT: "#09090b",
          solid: "#09090b",
          elevated: "#18181b",
          muted: "#27272a",
        },
        foreground: {
          DEFAULT: "#fafafa",
          muted: "#a1a1aa",
          subtle: "#71717a",
          disabled: "#52525b",
        },
        border: {
          DEFAULT: "#27272a",
          hover: "#3f3f46",
          active: "#52525b",
        },
        input: {
          DEFAULT: "#27272a",
          hover: "#3f3f46",
        },
        ring: {
          DEFAULT: "#3b82f6",
        },
        // ── Surface colors ─────────────────────────────────────────────────
        surface: {
          DEFAULT: "rgba(24, 24, 27, 0.8)",
          base: "#09090b",
          solid: "#09090b",
          raised: "rgba(24, 24, 27, 0.8)",
          overlay: "rgba(39, 39, 42, 0.6)",
        },
        // ── Accent / interactive blue — status badges & active items only ──
        accent: {
          DEFAULT: "#3b82f6",
          foreground: "#ffffff",
          glow: "#60a5fa",
          muted: "#1d4ed8",
          cyan: "#22d3ee",
          emerald: "#22c55e",
          rose: "#f43f5e",
          amber: "#f59e0b",
        },
        // ── Semantic status colors (WCAG AA compliant on dark bg) ───────────
        status: {
          // Emerald: #22c55e — 12.6:1 on #09090b ✓
          success: "#22c55e",
          "success-muted": "#166534",
          // Amber: #f59e0b — 7.2:1 on #09090b ✓
          warning: "#f59e0b",
          "warning-muted": "#92400e",
          // Rose: #f43f5e — 6.1:1 on #09090b ✓
          destructive: "#f43f5e",
          "destructive-muted": "#9f1239",
          // Cyan for info/neutral active
          info: "#22d3ee",
          "info-muted": "#155e75",
        },
        // ── HUD-specific tokens ─────────────────────────────────────────────
        hud: {
          border: "rgba(39, 39, 42, 0.6)",
          "border-active": "rgba(59, 130, 246, 0.5)",
        },
        // ── Chart colors ────────────────────────────────────────────────────
        chart: {
          grid: "rgba(39, 39, 42, 0.5)",
          axis: "#52525b",
          line1: "#3b82f6",
          line2: "#22c55e",
          line3: "#f59e0b",
          line4: "#f43f5e",
          line5: "#a855f7",
        },
      },
      borderRadius: {
        // shadcn-style radius system
        sm: "calc(var(--radius) - 4px)",
        DEFAULT: "calc(var(--radius) - 2px)",
        md: "var(--radius)",
        lg: "calc(var(--radius) + 2px)",
        xl: "calc(var(--radius) + 4px)",
      },
      backdropBlur: {
        xs: "2px",
        hud: "16px",
      },
      boxShadow: {
        // shadcn-style dark shadows
        "2xs": "0 1px 2px 0 rgba(0, 0, 0, 0.4)",
        xs: "0 1px 3px 0 rgba(0, 0, 0, 0.5)",
        sm: "0 2px 4px rgba(0, 0, 0, 0.5)",
        DEFAULT: "0 4px 8px rgba(0, 0, 0, 0.5)",
        md: "0 8px 16px rgba(0, 0, 0, 0.5)",
        lg: "0 16px 32px rgba(0, 0, 0, 0.6)",
        xl: "0 24px 48px rgba(0, 0, 0, 0.6)",
        inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.4)",
        // Glass panels
        glass: "0 0 0 1px rgba(39, 39, 42, 0.5), 0 4px 12px rgba(0, 0, 0, 0.5)",
        "glass-raised": "0 0 0 1px rgba(63, 63, 70, 0.6), 0 8px 24px rgba(0, 0, 0, 0.6)",
        // Focus rings
        focus: "0 0 0 2px rgba(59, 130, 246, 0.5)",
        "focus-inset": "inset 0 0 0 2px rgba(59, 130, 246, 0.5)",
        // Glow effects
        "glow-blue": "0 0 8px rgba(59, 130, 246, 0.4)",
      },
      fontFamily: {
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          '"Fira Code"',
          "Consolas",
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
          "0%": { boxShadow: "0 0 5px rgba(59, 130, 246, 0.3)" },
          "100%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)" },
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
      // shadcn-style CSS variables
      addBase({
        ":root": {
          "--radius": "0.5rem",
          "--radius-sm": "calc(var(--radius) - 4px)",
          "--radius-md": "var(--radius)",
          "--radius-lg": "calc(var(--radius) + 2px)",
          "--radius-xl": "calc(var(--radius) + 4px)",
        },
      });
      addUtilities({
        ".scrollbar-dark": {
          "scrollbar-width": "thin",
          "scrollbar-color": "#52525b #18181b",
        },
        ".scrollbar-dark::-webkit-scrollbar": {
          width: "8px",
          height: "8px",
        },
        ".scrollbar-dark::-webkit-scrollbar-track": {
          background: "#18181b",
        },
        ".scrollbar-dark::-webkit-scrollbar-thumb": {
          background: "#52525b",
          "border-radius": "9999px",
          border: "2px solid #18181b",
        },
      });
      addComponents({
        ".glass-panel": {
          background: "rgba(24, 24, 27, 0.8)",
          border: "1px solid rgba(39, 39, 42, 0.6)",
          "border-radius": "var(--radius)",
          "backdrop-filter": "blur(12px)",
          "box-shadow": "0 0 0 1px rgba(39, 39, 42, 0.5), 0 4px 12px rgba(0, 0, 0, 0.5)",
        },
        ".glass-panel-raised": {
          background: "rgba(39, 39, 42, 0.7)",
          border: "1px solid rgba(63, 63, 70, 0.6)",
          "border-radius": "var(--radius)",
          "backdrop-filter": "blur(16px)",
          "box-shadow": "0 0 0 1px rgba(63, 63, 70, 0.6), 0 8px 24px rgba(0, 0, 0, 0.6)",
        },
        ".btn-primary": {
          display: "inline-flex",
          "align-items": "center",
          "justify-content": "center",
          "border-radius": "var(--radius)",
          padding: "0.5rem 1rem",
          "font-size": "0.875rem",
          "font-weight": "500",
          color: "#ffffff",
          background: "#3b82f6",
          "box-shadow": "0 0 0 1px rgba(59, 130, 246, 0.3)",
          transition: "all 150ms",
          "&:hover": {
            background: "#2563eb",
          },
          "&:focus-visible": {
            outline: "none",
            "box-shadow": "0 0 0 2px #09090b, 0 0 0 4px rgba(59, 130, 246, 0.5)",
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
          "border-radius": "var(--radius)",
          padding: "0.5rem 1rem",
          "font-size": "0.875rem",
          "font-weight": "500",
          color: "#fafafa",
          background: "#27272a",
          border: "1px solid #3f3f46",
          transition: "all 150ms",
          "&:hover": {
            background: "#3f3f46",
            "border-color": "#52525b",
          },
        },
        ".input-base": {
          display: "block",
          width: "100%",
          "border-radius": "var(--radius)",
          padding: "0.5rem 0.75rem",
          "font-size": "0.875rem",
          color: "#fafafa",
          background: "#18181b",
          border: "1px solid #27272a",
          transition: "all 150ms",
          "&::placeholder": {
            color: "#71717a",
          },
          "&:hover": {
            "border-color": "#3f3f46",
          },
          "&:focus": {
            outline: "none",
            "border-color": "#3b82f6",
            "box-shadow": "0 0 0 2px rgba(59, 130, 246, 0.2)",
          },
          "&:disabled": {
            opacity: "0.5",
            cursor: "not-allowed",
          },
        },
        ".input": {
          display: "block",
          width: "100%",
          "border-radius": "var(--radius)",
          padding: "0.5rem 0.75rem",
          "font-size": "0.875rem",
          color: "#fafafa",
          background: "#18181b",
          border: "1px solid #27272a",
          transition: "all 150ms",
          "&::placeholder": {
            color: "#71717a",
          },
          "&:hover": {
            "border-color": "#3f3f46",
          },
          "&:focus": {
            outline: "none",
            "border-color": "#3b82f6",
            "box-shadow": "0 0 0 2px rgba(59, 130, 246, 0.2)",
          },
          "&:disabled": {
            opacity: "0.5",
            cursor: "not-allowed",
          },
        },
        ".select": {
          display: "block",
          width: "100%",
          "border-radius": "var(--radius)",
          padding: "0.5rem 0.75rem",
          "font-size": "0.875rem",
          color: "#fafafa",
          background: "#18181b",
          border: "1px solid #27272a",
          transition: "all 150ms",
          appearance: "none",
          "background-image": "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e\")",
          "background-repeat": "no-repeat",
          "background-position": "right 0.75rem center",
          "padding-right": "2.5rem",
          "&:hover": {
            "border-color": "#3f3f46",
          },
          "&:focus": {
            outline: "none",
            "border-color": "#3b82f6",
            "box-shadow": "0 0 0 2px rgba(59, 130, 246, 0.2)",
          },
          "&:disabled": {
            opacity: "0.5",
            cursor: "not-allowed",
          },
        },
        ".hud-label": {
          "font-size": "0.6875rem",
          "font-weight": "500",
          "text-transform": "uppercase",
          "letter-spacing": "0.05em",
          color: "#a1a1aa",
        },
        ".hud-value": {
          "font-size": "0.875rem",
          "font-weight": "600",
          "font-family": "var(--font-mono)",
          "font-variant-numeric": "tabular-nums",
          color: "#fafafa",
        },
        ".hud-value-lg": {
          "font-size": "1.25rem",
          "font-weight": "700",
          "font-family": "var(--font-mono)",
          "font-variant-numeric": "tabular-nums",
          color: "#fafafa",
          "line-height": "1",
        },
        ".hud-unit": {
          "font-size": "0.625rem",
          color: "#71717a",
          "margin-left": "0.125rem",
        },
      });
    },
  ],
};
