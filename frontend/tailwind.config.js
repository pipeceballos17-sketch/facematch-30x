/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 30X brand palette — dark editorial mode
        lime: {
          DEFAULT: "#ebff6f",   // pastel lime — primary accent (pops on dark)
          dim:     "#babe60",   // olive-lime hover
          muted:   "#ebff6f18", // transparent tint
          border:  "#ebff6f40", // subtle border
        },
        x: {
          bg:      "#0a0a0a",   // near-black page background
          surface: "#1c1c1c",   // card background
          surface2:"#272b2d",   // elevated surface / inputs
          border:  "#2d2d2d",   // default border
          border2: "#404040",   // stronger border
          text:    "#fafafa",   // primary text
          muted:   "#a3a3a3",   // secondary text
          faint:   "#737373",   // very muted / placeholder
          ink:     "#1c1c1c",   // dark ink (text on lime buttons)
        },
        // Editorial accents
        wine:    "#942143",
        navy:    "#172452",
        forest:  "#258053",
        sand:    "#efebe2",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
