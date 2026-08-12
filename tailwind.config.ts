import type { Config } from 'tailwindcss';

/**
 * Design System SGO Beija Flor (churrascarias).
 * Cores institucionais (atualizado 2026-06-11 a pedido do usuário):
 *  - Primária: BORDÔ #6E1423 · Acento/secundária: CINZA ESCURO #3F3F46
 *  - Fundo: #FFFFFF · Superfície: #F5F5F5
 *  - Semáforos (status, não-marca): Crítico #DC2626 · Médio #F59E0B · Sucesso #16A34A
 * Obs.: o token "gold" foi mantido por compatibilidade de classes, mas agora
 * representa o cinza-grafite (acento).
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
        // Tokens da marca (uso direto: bg-brand, text-gold...)
        brand: {
          DEFAULT: '#6E1423', // bordô
          light: '#8C2233',
          dark: '#470B14',
        },
        gold: {
          // grafite (cinza escuro) — nome mantido por compatibilidade
          DEFAULT: '#3F3F46',
          light: '#5B5B64',
          dark: '#27272A',
        },
        surface: '#F5F5F5',
        // Severidades (gravidade de ocorrências / alertas)
        critical: '#DC2626',
        medium: '#F59E0B',
        success: '#16A34A',
        // Tokens semânticos (shadcn/ui via CSS vars)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        /* ---------------------------------------------------------------
         * DESIGN SYSTEM (Onda 0+). Backed por var(--sgo-*) (fonte de verdade
         * em src/styles/sgo-design-system.css). Aditivo: a paleta legada acima
         * segue intacta e será migrada/removida nas Ondas 3-5.
         * Colisões de nome com o legado (brand/surface/success) usam prefixo
         * `sgo-` até a onda que renomeia aquela tela.
         * ------------------------------------------------------------- */
        ink: {
          900: 'var(--sgo-ink-900)',
          700: 'var(--sgo-ink-700)',
          500: 'var(--sgo-ink-500)',
          400: 'var(--sgo-ink-400)',
        },
        line: {
          DEFAULT: 'var(--sgo-line)',
          strong: 'var(--sgo-line-strong)',
        },
        canvas: 'var(--sgo-canvas)',
        sunken: 'var(--sgo-sunken)',
        'on-brand': 'var(--sgo-on-brand)',
        danger: {
          DEFAULT: 'var(--sgo-danger)',
          bg: 'var(--sgo-danger-bg)',
        },
        warning: {
          DEFAULT: 'var(--sgo-warning)',
          bg: 'var(--sgo-warning-bg)',
        },
        info: {
          DEFAULT: 'var(--sgo-info)',
          bg: 'var(--sgo-info-bg)',
        },
        // Colididos com o legado → prefixo sgo- (removido por onda, 3-5).
        'sgo-brand': {
          DEFAULT: 'var(--sgo-brand)',
          hover: 'var(--sgo-brand-hover)',
          tint: 'var(--sgo-brand-tint)',
          'tint-2': 'var(--sgo-brand-tint-2)',
        },
        'sgo-surface': 'var(--sgo-surface)',
        'sgo-success': {
          DEFAULT: 'var(--sgo-success)',
          bg: 'var(--sgo-success-bg)',
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
