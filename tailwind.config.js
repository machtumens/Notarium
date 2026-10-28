/**
 * Swiss editorial tokens — one grotesk, an ink ramp, hairline rules, no radius, no shadow.
 * The key names are unchanged from the Organic system on purpose: a page that says
 * `bg-accent-200` keeps saying it, the token simply means a grey now. `accent` is the
 * ink ramp (selected / filled / dark panels), `sage` the quieter paper ramp.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#ffffff',
        surface: '#ffffff',
        ink: '#0b0b0b',
        // Ink ramp. 100–300 read as light surfaces on white AND as text on the 800/900 panels.
        accent: { DEFAULT: '#0b0b0b', 100: '#ffffff', 200: '#f2f2f2', 300: '#d6d6d6', 400: '#a8a8a8', 500: '#6e6e6e', 600: '#333333', 700: '#111111', 800: '#0b0b0b', 900: '#000000' },
        // Paper ramp — one step lighter than accent so a "quiet" card still separates from a loud one.
        sage: { DEFAULT: '#0b0b0b', 100: '#fafafa', 200: '#f5f5f5', 300: '#e4e4e4', 400: '#c4c4c4', 500: '#8a8a8a', 600: '#4a4a4a', 700: '#3d3d3d', 800: '#141414', 900: '#000000' },
        neutral: { 100: '#fafafa', 200: '#f4f4f4', 300: '#e4e4e4', 400: '#c9c9c9', 500: '#9a9a9a', 600: '#6e6e6e', 700: '#4d4d4d', 800: '#1f1f1f', 900: '#0b0b0b' },
      },
      fontFamily: {
        // One family. `heading` is kept as a key so the pages need no edit; it is the same
        // grotesk, used at a heavier weight and tighter tracking (see index.css).
        heading: ['Figtree', 'Helvetica Neue', 'Arial', 'sans-serif'],
        body: ['Figtree', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      // Every named step is square; `extend` merges with Tailwind's defaults, so 2xl/3xl must be listed too.
      borderRadius: { none: '0', sm: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0', full: '9999px' },
      boxShadow: { sm: 'none', md: 'none', lg: 'none' },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'none' } },
        fadein: { from: { opacity: '0' }, to: { opacity: '1' } },
        livepulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        rise: 'rise 0.3s cubic-bezier(0.2,0.8,0.2,1) both',
        fadein: 'fadein 0.25s ease-out both',
        livepulse: 'livepulse 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
