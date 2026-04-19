/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        espresso: "#1C1917",
        cream: "#FAF7F2",
        latte: "#E7DFD3",
        caramel: "#B7762F",
        mocha: "#6B4226",
      },
      fontFamily: {
        display: ["System"],
      },
    },
  },
  plugins: [],
};
