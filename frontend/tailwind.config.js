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
          bg:      "#0A0A0A",   // page background
          surface: "#141414",   // card background
          surface2:"#1C1C1C",   // elevated surface
          border:  "#2A2A2A",   // default border
          border2: "#333333",   // brighter border
          text:    "#FFFFFF",   // primary text
          muted:   "#888888",   // secondary text
          faint:   "#444444",   // very muted
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
