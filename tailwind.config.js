/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // HandyHome Brand Colors (based on logo)
        handy: {
          blue: {
            50: "#f0f9ff",
            100: "#e0f3ff",
            200: "#bae5ff",
            300: "#7dd0ff",
            400: "#38b6ff",
            500: "#1e9eff", // Main blue from logo
            600: "#0c7dc7",
            700: "#0a63a1",
            800: "#0e4d7a",
            900: "#133f65",
          },
          yellow: {
            50: "#fffbeb",
            100: "#fef3c7",
            200: "#fde68a",
            300: "#fcd34d",
            400: "#fbbf24",
            500: "#f59e0b", // Main yellow from logo
            600: "#d97706",
            700: "#b45309",
            800: "#92400e",
            900: "#78350f",
          },
          navy: {
            50: "#f8fafc",
            100: "#f1f5f9",
            200: "#e2e8f0",
            300: "#cbd5e1",
            400: "#94a3b8",
            500: "#64748b",
            600: "#475569",
            700: "#334155",
            800: "#1e293b", // Navy text from logo
            900: "#0f172a",
          },
        },
        // Keep existing primary/secondary for compatibility
        primary: {
          50: "#f0f9ff",
          100: "#e0f3ff",
          200: "#bae5ff",
          300: "#7dd0ff",
          400: "#38b6ff",
          500: "#1e9eff",
          600: "#0c7dc7",
          700: "#0a63a1",
          800: "#0e4d7a",
          900: "#133f65",
        },
        secondary: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
      },
      fontFamily: {
        sans: ["Poppins", "system-ui", "sans-serif"],
        poppins: ["Poppins", "sans-serif"],
      },
      animation: {
        "bounce-slow": "bounce 2s infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false, // Disable Tailwind's reset to avoid conflicts with Ionic
  },
};
