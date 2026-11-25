/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0E0F12',
        paper: '#F2F3F5',
        line: '#E3E5E9',
        muted: '#5B606B',
        volt: '#D4FF3A',
        signal: '#C9252D',
        plate: '#F2C94C',
        night: {
          DEFAULT: '#0E0F12',
          card: '#1A1C21',
          line: '#2A2D33',
          edge: '#3A3E46',
          muted: '#9CA1AB',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans Devanagari"', '"Noto Sans Bengali"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', '"Noto Sans Devanagari"', '"Noto Sans Bengali"', 'sans-serif'],
      },
      borderRadius: {
        sheet: '28px',
      },
      boxShadow: {
        sheet: '0 -8px 30px rgba(14,15,18,0.10)',
        float: '0 4px 16px rgba(14,15,18,0.12)',
      },
      keyframes: {
        'ride-load': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'ride-load': 'ride-load 2s linear infinite',
      },
    },
  },
  plugins: [],
}
