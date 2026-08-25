import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#f7f9ff',
        'bg-slate-mist': '#f7f9ff',
        'bg-industrial-slate': '#0B0F17',
        surface: '#f7f9ff',
        'surface-bright': '#f7f9ff',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f1f4fa',
        'surface-container': '#ebeef4',
        'surface-container-high': '#e5e8ee',
        'surface-container-highest': '#dfe3e8',
        'surface-variant': '#dfe3e8',
        'surface-dim': '#d7dae0',
        'surface-tint': '#006398',

        // Dark surface mappings
        'surface-dark': '#131b26',
        'surface-dark-low': '#0e1620',
        'surface-dark-high': '#1a2433',
        'border-dark': '#243247',

        primary: '#006194',
        'primary-container': '#007bb9',
        'primary-fixed': '#cce5ff',
        'primary-fixed-dim': '#93ccff',
        'on-primary': '#ffffff',
        'on-primary-container': '#fdfcff',
        'on-primary-fixed': '#001d31',
        'on-primary-fixed-variant': '#004b73',

        secondary: '#505f76',
        'secondary-container': '#d0e1fb',
        'secondary-fixed': '#d3e4fe',
        'secondary-fixed-dim': '#b7c8e1',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#54647a',
        'on-secondary-fixed': '#0b1c30',
        'on-secondary-fixed-variant': '#38485d',

        tertiary: '#894d00',
        'tertiary-container': '#ac6200',
        'tertiary-fixed': '#ffdcc0',
        'tertiary-fixed-dim': '#ffb875',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#fffbff',
        'on-tertiary-fixed': '#2d1600',
        'on-tertiary-fixed-variant': '#6b3b00',

        'on-surface': '#181c20',
        'on-surface-variant': '#3f4850',
        'on-background': '#181c20',
        outline: '#707881',
        'outline-variant': '#bfc7d2',

        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        'inverse-surface': '#2d3135',
        'inverse-on-surface': '#eef1f7',
        'inverse-primary': '#93ccff',

        // 工业状态色语义 Tokens
        'status-pass-bg': '#ECFDF5',
        'status-pass-text': '#047857',
        'status-fail-bg': '#FEF2F2',
        'status-fail-text': '#B91C1C',
        'status-missing-bg': '#FFFBEB',
        'status-missing-text': '#B45309',
        'status-hitl-bg': '#F5F3FF',
        'status-hitl-text': '#6D28D9',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      fontFamily: {
        'body-md': ['Inter', 'sans-serif'],
        caption: ['Inter', 'sans-serif'],
        'data-mono': ['JetBrains Mono', 'monospace'],
        'section-title': ['Inter', 'sans-serif'],
        'decision-hero': ['Inter', 'sans-serif'],
        'headline-lg': ['Inter', 'sans-serif'],
        headline: ['Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'body-md': ['13px', { lineHeight: '1.4', fontWeight: '400' }],
        caption: ['11px', { lineHeight: '1.4', fontWeight: '400' }],
        'data-mono': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'section-title': ['16px', { lineHeight: '1.5', fontWeight: '500' }],
        'decision-hero': ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        'headline-lg': ['24px', { lineHeight: '1.5', fontWeight: '600' }],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        sheet: '0 4px 20px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
