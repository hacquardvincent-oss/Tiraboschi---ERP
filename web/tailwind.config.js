/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design system "The Blue Sole" — direction luxe (bleu profond + or champagne)
        ink: '#0C0B0A', // noir encre légèrement chaud
        panel: 'rgba(22, 20, 18, 0.96)',
        azure: '#6FA8C7', // bleu acier adouci (secondaire / liens)
        gold: '#C9A86A', // or champagne (accent maison / CTA)
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      letterSpacing: {
        editorial: '0.15em',
      },
      borderRadius: {
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
};
