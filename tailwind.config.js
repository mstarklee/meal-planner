/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Editorial Gourmet — bone/ivory paper, warm ink, a single terracotta accent + quiet olive.
        bone: { DEFAULT: '#f4f0e8', surface: '#faf7f1', deep: '#ebe4d6' },
        ink: { DEFAULT: '#1a1715', soft: '#6b6358', faint: '#a39a8b' },
        terracotta: { DEFAULT: '#b8512e', dark: '#9a3f22', soft: '#f1e2d8' },
        olive: { DEFAULT: '#5e6b3f', dark: '#47532f', soft: '#e8e9dd' },
        // legacy aliases so untouched surfaces still compile cohesively
        brand: { DEFAULT: '#b8512e', dark: '#9a3f22', soft: '#f1e2d8', mint: '#e8e9dd' },
        kid: '#5e6b3f',
        cheat: '#b8512e',
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        eyebrow: '0.18em',
      },
      fontSize: {
        // editorial display scale
        hero: ['2.75rem', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        title: ['2rem', { lineHeight: '1.06', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        // restrained editorial elevation
        soft: '0 1px 2px rgba(26,23,21,0.04), 0 12px 28px -16px rgba(26,23,21,0.20)',
        lift: '0 8px 18px -8px rgba(26,23,21,0.18), 0 28px 60px -28px rgba(26,23,21,0.32)',
        sheet: '0 -10px 40px -16px rgba(26,23,21,0.30)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .6s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
}
