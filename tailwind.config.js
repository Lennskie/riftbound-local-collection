const token = name => `var(--${name})`;
const color = name => `rgb(var(--color-${name}-rgb) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          100: color('text-on-dark'),
          200: color('text-on-dark-soft'),
          300: color('line-on-dark'),
          400: color('line-on-dark-soft'),
          500: color('text-subtle'),
          600: color('line-on-dark-strong'),
          700: color('muted'),
          800: color('surface-raised'),
          900: color('surface'),
          950: color('surface')
        },
        indigo: {
          300: color('accent'),
          400: color('accent'),
          500: color('accent'),
          600: color('accent')
        },
        amber: {
          100: color('warning-text-muted'),
          200: color('warning-text'),
          300: color('warning-accent'),
          500: color('warning-accent-muted'),
          700: color('warning-fill'),
          800: color('warning-border-strong'),
          900: color('warning-border'),
          950: color('warning-surface')
        },
        emerald: {
          100: color('success-text'),
          200: color('success-text-muted'),
          300: color('success-accent'),
          400: color('success-accent-strong'),
          700: color('success-fill'),
          900: color('success-border'),
          950: color('success-surface')
        },
        red: {
          200: color('danger-text'),
          300: color('danger-text-strong'),
          700: color('danger-border-strong'),
          900: color('danger-border'),
          950: color('danger-surface')
        },
        scanner: {
          DEFAULT: color('scanner'),
          bar: color('scanner-bar'),
          panel: color('scanner-panel')
        },
        white: color('surface'),
        black: color('void')
      },
      fontFamily: {
        sans: token('font-family-sans'),
        mono: token('font-family-mono')
      },
      fontSize: {
        xs: [token('text-xs'), { lineHeight: token('text-xs-leading') }],
        sm: [token('text-sm'), { lineHeight: token('text-sm-leading') }],
        xl: [token('text-xl'), { lineHeight: token('text-xl-leading') }],
        '2xl': [token('text-2xl'), { lineHeight: token('text-2xl-leading') }],
        '3xl': [token('text-3xl'), { lineHeight: token('text-3xl-leading') }]
      },
      fontWeight: {
        normal: token('weight-regular'),
        medium: token('weight-medium'),
        semibold: token('weight-semibold'),
        bold: token('weight-bold')
      },
      letterSpacing: {
        wide: token('tracking-wide')
      },
      spacing: {
        1: token('space-2xs'),
        1.5: token('space-xs'),
        2: token('space-sm'),
        2.5: token('space-chip'),
        3: token('space-md'),
        4: token('space-lg'),
        5: token('space-xl'),
        6: token('space-2xl')
      },
      borderRadius: {
        none: token('radius-none'),
        DEFAULT: token('radius-thumb'),
        lg: token('radius-control'),
        xl: token('radius-card'),
        '2xl': token('radius-panel'),
        full: token('radius-pill')
      },
      borderWidth: {
        DEFAULT: token('border-width-hairline'),
        2: token('border-width-thick')
      },
      boxShadow: {
        card: token('shadow-elevation-card'),
        vignette: token('shadow-camera-vignette')
      },
      maxWidth: {
        md: token('layout-dialog-max'),
        xl: token('layout-panel-max'),
        '5xl': token('layout-section-max'),
        '6xl': token('layout-page-max'),
        '7xl': token('layout-content-max')
      },
      minWidth: {
        11: token('size-control-min-height'),
        12: token('size-touch-min'),
        52: token('size-field-min-width')
      },
      minHeight: {
        11: token('size-control-min-height'),
        12: token('size-control-tall-height'),
        14: token('size-header-min-height'),
        64: token('size-viewport-min-height')
      },
      height: {
        px: token('border-width-hairline'),
        3: token('size-dot'),
        5: token('size-icon'),
        6: token('size-icon-lg'),
        10: token('size-icon-button'),
        11: token('size-control-min-height'),
        16: token('size-thumb-sm-height'),
        20: token('size-thumb-md-height'),
        24: token('size-thumb-lg-height')
      },
      width: {
        px: token('border-width-hairline'),
        3: token('size-dot'),
        5: token('size-icon'),
        6: token('size-icon-lg'),
        10: token('size-icon-button'),
        12: token('size-thumb-sm-width'),
        14: token('size-thumb-md-width'),
        16: token('size-thumb-lg-width'),
        24: token('size-input-width'),
        36: token('size-field-width')
      },
      maxHeight: {
        artwork: token('height-artwork-max'),
        28: token('height-stack-max'),
        96: token('height-scroll-max')
      },
      aspectRatio: {
        artwork: token('artwork-aspect-ratio')
      },
      opacity: {
        40: token('opacity-subtle'),
        50: token('opacity-disabled'),
        97: token('opacity-panel')
      }
    }
  },
  plugins: []
};
