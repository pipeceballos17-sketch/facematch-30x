/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 30X brand palette — editorial, warm-corporate
        lime: {
          DEFAULT: "#ebff6f",   // soft pastel lime — primary accent
          dim:     "#babe60",   // olive-lime hover
          muted:   "#ebff6f25", // transparent tint
          border:  "#ebff6f50", // subtle border
        },
        x: {
          bg:      "#f7f5f2",   // warm cream — page background
          surface: "#fafafa",   // off-white cards
          surface2:"#efebe2",   // warm elevated surface
          border:  "#e3dfd7",   // warm subtle border
          border2: "#cfc6b3",   // warm stronger border
          text:    "#1c1c1c",   // primary text (soft black)
          muted:   "#525252",   // secondary text
          faint:   "#868073",   // warm-muted tertiary
          ink:     "#1c1c1c",   // dark ink (text on lime buttons)
        },
        // Editorial accents — used sparingly for tags/badges
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
