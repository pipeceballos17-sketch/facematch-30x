/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 30X brand palette
        lime: {
          DEFAULT: "#CCFF47",   // The X — primary accent
          dim:     "#AEDD2E",   // hover state
          muted:   "#CCFF4720", // transparent tint for backgrounds
          border:  "#CCFF4740", // subtle border
        },
        x: {
          bg:      "#FFFFFF",   // page background
          surface: "#F7F8FA",   // card background
          surface2:"#EDEEF1",   // elevated surface / inputs
          border:  "#E1E4E9",   // default border
          border2: "#C5CAD2",   // stronger border
          text:    "#111827",   // primary text
          muted:   "#6B7280",   // secondary text
          faint:   "#9CA3AF",   // very muted / placeholder
          ink:     "#111827",   // dark ink — always dark (text on lime buttons)
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
