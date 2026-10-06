/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        'brand-orange': '#FF6600',
        'brand-brown': '#331A00',
        'brand-offwhite': '#F9FAF9',
      },
    },
  },
  plugins: [],
};
