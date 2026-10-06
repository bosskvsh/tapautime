/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/shared-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        thin: '100',
        extralight: '100',
        light: '200',
        normal: '300',
        medium: '400',
        semibold: '500',
        bold: '500',
        extrabold: '600',
        black: '700',
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
