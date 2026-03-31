/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Aerospace-grade palette
        surface: {
          DEFAULT: "rgba(8, 12, 21, 0.85)",
          solid: "#080c15",
          raised: "rgba(15, 23, 42, 0.70)",
          overlay: "rgba(15, 23, 42, 0.55)",
        },
        accent: {
          DEFAULT: "#3b82f6",
          glow: "#60a5fa",
          cyan: "#22d3ee",
          emerald: "#34d399",
          amber: "#fbbf24",
          rose: "#fb7185",
        },
        hud: {
          border: "rgba(148, 163, 184, 0.12)",
          "border-active": "rgba(59, 130, 246, 0.35)",
        },
      },
      backdropBlur: {
        xs: "2px",
        hud: "16px",
      },
      boxShadow: {
        glass:
          "0 0 0 1px rgba(148, 163, 184, 0.08), 0 4px 24px rgba(0, 0, 0, 0.4)",
        "glass-raised":
          "0 0 0 1px rgba(148, 163, 184, 0.1), 0 8px 32px rgba(0, 0, 0, 0.5)",
        "glow-blue": "0 0 20px rgba(59, 130, 246, 0.15)",
        "glow-cyan": "0 0 20px rgba(34, 211, 238, 0.12)",
        "inner-highlight": "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
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
          "0%": { boxShadow: "0 0 5px rgba(59, 130, 246, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(59, 130, 246, 0.4)" },
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
    function ({ addUtilities }) {
      addUtilities({
        ".scrollbar-dark": {
          "scrollbar-width": "thin",
          "scrollbar-color": "rgba(100, 116, 139, 0.8) rgba(15, 23, 42, 0.8)",
        },
        ".scrollbar-dark::-webkit-scrollbar": {
          width: "8px",
          height: "8px",
        },
        ".scrollbar-dark::-webkit-scrollbar-track": {
          background: "#0f172a",
        },
        ".scrollbar-dark::-webkit-scrollbar-thumb": {
          background: "#64748b",
          "border-radius": "9999px",
          border: "2px solid #0f172a",
        },
      });
    },
  ],
};
