/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1a1410',
        parchment: '#f5f0e8',
        cream: '#faf7f2',
        wine: '#7b2d3e',
        'wine-light': '#a84458',
        gold: '#b8924a',
        'gold-light': '#d4a85c',
        muted: '#8a7f72',
        'warm-border': '#ddd5c4',
        'sidebar-bg': '#1e1812',
      },
      fontFamily: {
        cormorant: ['Georgia', 'serif'],
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
