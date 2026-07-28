/** @type {import('tailwindcss').Config} */

// Verona brand palette.
// Source: burnt-labs/verona-website `docs/verona-design-system.md` + `app/globals.css`.
const verona = {
  sea: '#192550', // Vastness
  sky: '#4cb1df', // Trust - the accent for CTAs and active states
  linen: '#f8f7f3', // Transparency
  seashell: '#e5dccb', // Integrity
  forest: '#131e18', // Depth
  brick: '#421d25', // Reliability
  gold: '#bea64d', // Authenticity
  rosso: '#b56135', // Heritage warmth
  grey: '#2f4842',
  warmDark: '#2c241f',
};

// Elevation tints derived from Forest. Sea remains a branded/navigation colour,
// which keeps dark product surfaces distinct from Ping.pub's blue-grey stack.
// Semantic colours pulled into the brand's hue/saturation band. Upstream's
// #3fb68b (mint, hue 158) and #ff5353 (100% saturation) sit outside a palette
// where nothing exceeds 70%, which is what made them read as foreign.
// yes/no are bar fills carrying white labels, so they stay fixed across themes
// and dark enough to clear 4.5:1 against white.
const semantic = {
  yesFill: '#2f7d57',
  noFill: '#bb392a',
  vetoFill: '#7d2620', // deeper relative of noFill, still in the Brick family
  successLight: '#2f7d57',
  successDark: '#4ebc88',
  warningLight: '#8f6a2c',
  warningDark: '#bea64d', // Gold
  errorLight: '#bb392a', // bento danger
  errorDark: '#e0776c',
};

const forestDeep = '#090f0c'; // page background
const forestSunken = '#101a14';
const forestPanel = '#19271f';
const forestRaised = '#22362b'; // table headers, sunken bands

// Product-surface tokens, lifted from burnt-labs/xion-frontends
// `apps/xion-app/src/styles.css` (the --bento-* set behind app.burnt.com).
// An explorer is a product surface, so these take precedence over the
// marketing site's tighter radius and Sky accent.
const bento = {
  bg: '#f8f7f3', // Linen page
  panel: '#ffffff', // cards
  chip: '#ece6db',
  hover: '#f7f3ec',
  line: '#e7e2d6',
  lineSoft: '#f1ede4',
  ink: '#111827',
  inkSoft: '#374151',
  muted: '#6b7280',
  accent: '#192550', // Sea - the primary CTA on app.burnt.com
  accentSoft: '#e9f4fb',
};

module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ...verona,
        bento,
        yes: semantic.yesFill,
        no: semantic.noFill,
        veto: semantic.vetoFill,
        info: verona.sky,
        main: 'var(--text-main)',
        secondary: 'var(--text-secondary)',
        active: 'var(--bg-active)',
      },
      fontFamily: {
        // EB Garamond is the documented production stand-in for ITC Garamond Std
        // Book Condensed, which is not web-licensed here.
        garamond: ['"EB Garamond"', '"Instrument Serif"', 'Georgia', 'serif'],
        'hedvig-serif': ['"Hedvig Letters Serif"', 'Georgia', 'serif'],
        'hedvig-sans': ['"Hedvig Letters Sans"', 'Inter', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    // Named `light`/`dark` so NavbarThemeSwitcher's existing data-theme toggle
    // picks them up with no change to the switcher.
    themes: [
      {
        dark: {
          primary: verona.gold,
          'primary-content': verona.linen,
          secondary: verona.gold,
          'secondary-content': verona.sea,
          accent: verona.sky,
          'accent-content': verona.sea,
          neutral: verona.grey,
          'neutral-content': verona.linen,
          'base-100': forestPanel,
          'base-200': forestSunken,
          'base-300': forestRaised,
          'base-content': verona.linen,
          info: verona.sky,
          success: semantic.successDark,
          warning: semantic.warningDark,
          error: semantic.errorDark,
          // app.burnt.com radii (--bento-radius / --bento-radius-sm).
          '--rounded-box': '18px',
          '--rounded-btn': '10px',
          '--rounded-badge': '10px',
          '--tab-radius': '10px',
        },
      },
      {
        light: {
          primary: verona.sky,
          'primary-content': verona.linen,
          secondary: verona.gold,
          'secondary-content': verona.sea,
          accent: verona.sea,
          'accent-content': verona.linen,
          neutral: verona.grey,
          'neutral-content': verona.linen,
          'base-100': bento.panel,
          'base-200': bento.bg,
          'base-300': bento.chip,
          'base-content': bento.ink,
          info: verona.sky,
          success: semantic.successLight,
          warning: semantic.warningLight,
          error: semantic.errorLight,
          '--rounded-box': '18px',
          '--rounded-btn': '10px',
          '--rounded-badge': '10px',
          '--tab-radius': '10px',
        },
      },
    ],
  },
};
