/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2e7d52', dark: '#246343', soft: '#eef4ef', mint: '#dfeee4' },
        kid: '#e6a23c',
        cheat: '#c8783a',
      },
    },
  },
  plugins: [],
}
