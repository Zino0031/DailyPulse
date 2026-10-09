/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
    './services/**/*.{js,jsx,ts,tsx}',
    './store/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Theme-aware neutrals — flip via prefers-color-scheme in global.css
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-elevated':
          'rgb(var(--color-surface-elevated) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        text: 'rgb(var(--color-text) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted) / <alpha-value>)',
        'text-subtle': 'rgb(var(--color-text-subtle) / <alpha-value>)',

        // Brand & semantic — constant across themes
        primary: {
          DEFAULT: '#5B47FB',
          pressed: '#4A38D4',
          tint: '#EDE9FE',
        },
        success: '#22C58B',
        warning: '#FF9A3C',
        danger: '#FF4D55',
        'accent-mint': '#5DE4C7',

        // Mood accents (map to the four PRD moods)
        mood: {
          energetic: '#FF7A4D',
          professional: '#1E2A4A',
          relaxed: '#22C58B',
          creative: '#E85D9E',
        },
      },

      fontFamily: {
        // Default. iOS still renders Inter as iOS-native; use `font-system` if
        // you want pure SF Pro Display on iOS.
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
        system: ['System'],
      },

      fontSize: {
        // Mobile-tuned type scale — follows iOS HIG metrics while keeping the
        // Fabrx hierarchy. [size, { lineHeight }]
        display: ['34px', { lineHeight: '41px' }],
        'title-1': ['28px', { lineHeight: '34px' }],
        'title-2': ['22px', { lineHeight: '28px' }],
        'title-3': ['20px', { lineHeight: '25px' }],
        headline: ['17px', { lineHeight: '22px' }],
        body: ['17px', { lineHeight: '22px' }],
        callout: ['16px', { lineHeight: '21px' }],
        subhead: ['15px', { lineHeight: '20px' }],
        footnote: ['13px', { lineHeight: '18px' }],
        caption: ['12px', { lineHeight: '16px' }],
      },

      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
      },

      boxShadow: {
        sm: '0 1px 2px rgb(0 0 0 / 0.04)',
        md: '0 4px 16px rgb(0 0 0 / 0.08)',
        lg: '0 12px 32px rgb(0 0 0 / 0.12)',
      },
    },
  },
  plugins: [],
};
