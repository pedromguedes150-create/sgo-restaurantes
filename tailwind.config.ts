import type { Config } from 'tailwindcss';

/**
 * Design System SGO Beija Flor (churrascarias).
 * Os VALORES não moram aqui — só os nomes. A fonte de verdade é
 * src/styles/sgo-design-system.css, que define cada token por tema.
 * Identidade: bordô (brand) + grafite (ink-700), semáforos em success/warning/
 * danger e o informativo em info.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        /* ---------------------------------------------------------------
         * ÚNICA paleta do sistema. Toda cor vem de var(--sgo-*-rgb), definido
         * em src/styles/sgo-design-system.css. A paleta legada (bordô fixo,
         * gold, semáforos do Tailwind, vars HSL do shadcn) saiu na Onda 7,
         * junto com o prefixo `sgo-` que existia só para não colidir com ela.
         *
         * O valor vem em CANAL (r g b), não em hex, porque é o que permite o
         * <alpha-value>: sem isso, `bg-brand/15` computa transparente.
         * ------------------------------------------------------------- */
        ink: {
          900: 'rgb(var(--sgo-ink-900-rgb) / <alpha-value>)',
          700: 'rgb(var(--sgo-ink-700-rgb) / <alpha-value>)',
          500: 'rgb(var(--sgo-ink-500-rgb) / <alpha-value>)',
          400: 'rgb(var(--sgo-ink-400-rgb) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--sgo-line-rgb) / <alpha-value>)',
          strong: 'rgb(var(--sgo-line-strong-rgb) / <alpha-value>)',
        },
        canvas: 'rgb(var(--sgo-canvas-rgb) / <alpha-value>)',
        sunken: 'rgb(var(--sgo-sunken-rgb) / <alpha-value>)',
        // Sobe acima de `sunken` nos DOIS temas — `surface` não faz isso no
        // escuro. Usado pela pílula eleita do segmented control.
        raised: 'rgb(var(--sgo-raised-rgb) / <alpha-value>)',
        // glass ja NASCE translucido (rgba fixo); nao vira canal nem aceita alfa.
        glass: 'var(--sgo-glass)',
        'on-brand': 'rgb(var(--sgo-on-brand-rgb) / <alpha-value>)',
        danger: {
          DEFAULT: 'rgb(var(--sgo-danger-rgb) / <alpha-value>)',
          bg: 'rgb(var(--sgo-danger-bg-rgb) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--sgo-warning-rgb) / <alpha-value>)',
          bg: 'rgb(var(--sgo-warning-bg-rgb) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--sgo-info-rgb) / <alpha-value>)',
          bg: 'rgb(var(--sgo-info-bg-rgb) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--sgo-brand-rgb) / <alpha-value>)',
          hover: 'rgb(var(--sgo-brand-hover-rgb) / <alpha-value>)',
          active: 'rgb(var(--sgo-brand-active-rgb) / <alpha-value>)',
          tint: 'rgb(var(--sgo-brand-tint-rgb) / <alpha-value>)',
          'tint-2': 'rgb(var(--sgo-brand-tint-2-rgb) / <alpha-value>)',
        },
        surface: 'rgb(var(--sgo-surface-rgb) / <alpha-value>)',
        success: {
          DEFAULT: 'rgb(var(--sgo-success-rgb) / <alpha-value>)',
          bg: 'rgb(var(--sgo-success-bg-rgb) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Design system (Onda 0+)
        control: 'var(--sgo-radius-control)',
        card: 'var(--sgo-radius-card)',
        sheet: 'var(--sgo-radius-sheet)',
        pill: 'var(--sgo-radius-pill)',
      },
      boxShadow: {
        // Anel de foco duplo (2px surface + 2px brand)
        'sgo-focus': 'var(--sgo-focus-ring)',
        // Elevação da pílula eleita. No claro ela se separa do trilho por
        // sombra, não por cor (branco sobre cinza claro dá ~1,2:1) — é assim
        // no iOS. Some na impressão.
        'sgo-raised': 'var(--sgo-shadow-raised)',
      },
      transitionTimingFunction: {
        'sgo-std': 'var(--sgo-ease-std)',
        'sgo-nav': 'var(--sgo-ease-nav)',
        'sgo-spring': 'var(--sgo-ease-spring)',
      },
      transitionDuration: {
        'sgo-1': '120ms',
        'sgo-2': '200ms',
        'sgo-3': '340ms',
        'sgo-4': '400ms',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
