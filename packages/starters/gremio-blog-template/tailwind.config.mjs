/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,ts,tsx,vue}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        gremius: {
          bg: "#0A0A0F",
          surface: "#12121A",
          border: "#1E1E2E",
          muted: "#6B7280",
          text: "#E5E7EB",
          heading: "#F9FAFB",
          cyan: "#00E5FF",
          pink: "#FF2A6D",
          green: "#76FF03",
          yellow: "#FFD600",
          purple: "#E040FB",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      backgroundImage: {
        "gradient-gremius": "linear-gradient(135deg, #00E5FF 0%, #FF2A6D 100%)",
        "gradient-dark": "linear-gradient(180deg, #0A0A0F 0%, #12121A 100%)",
      },
      boxShadow: {
        neon: "0 0 20px rgba(0, 229, 255, 0.3), 0 0 40px rgba(0, 229, 255, 0.1)",
        "neon-pink": "0 0 20px rgba(255, 42, 109, 0.3), 0 0 40px rgba(255, 42, 109, 0.1)",
      },
      animation: {
        "pulse-neon": "pulse-neon 2s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "enter": "enter 0.5s ease-out both",
      },
      keyframes: {
        "pulse-neon": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(0, 229, 255, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(0, 229, 255, 0.6)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        "enter": {
          "0%": { transform: "translateY(8px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
