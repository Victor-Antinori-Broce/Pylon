/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{svelte,js,ts,jsx,tsx}", "./src/**/*.svelte"],
  theme: {
    extend: {
      colors: {
        gremius: {
          bg: "rgb(var(--gremius-bg) / <alpha-value>)",
          card: "rgb(var(--gremius-card) / <alpha-value>)",
          border: "rgb(var(--gremius-border) / <alpha-value>)",
          muted: "rgb(var(--gremius-muted) / <alpha-value>)",
          subtle: "rgb(var(--gremius-subtle) / <alpha-value>)",
          text: "rgb(var(--gremius-text) / <alpha-value>)",
          "text-dim": "rgb(var(--gremius-text-dim) / <alpha-value>)",
          cyan: "rgb(var(--gremius-cyan) / <alpha-value>)",
          "cyan-dim": "rgb(var(--gremius-cyan-dim) / <alpha-value>)",
          pink: "rgb(var(--gremius-pink) / <alpha-value>)",
          "pink-dim": "rgb(var(--gremius-pink-dim) / <alpha-value>)",
          green: "rgb(var(--gremius-green) / <alpha-value>)",
          amber: "rgb(var(--gremius-amber) / <alpha-value>)",
          purple: "rgb(var(--gremius-purple) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--gremius-font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--gremius-font-mono)", "JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "slide-in": "slide-in 0.2s ease-out",
        "fade-in": "fade-in 0.15s ease-out",
      },
      keyframes: {
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 5px rgba(0, 229, 255, 0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(0, 229, 255, 0.6)" },
        },
        "slide-in": {
          from: { transform: "translateX(-8px)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

// Trigger HMR 1
