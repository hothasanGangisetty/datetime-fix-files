/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          900: '#22577A',
          700: '#38A3A5',
          500: '#57CC99',
          300: '#80ED99',
          100: '#C7F9CC',
        },
      },
    },
  },
  plugins: [],
}
