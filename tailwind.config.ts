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
         * segue intacta.
         *
         * O prefixo `sgo-` existe só onde o nome colide com o legado
         * (brand/surface/success) e SAI NA ONDA 7 — ver docs/redesign-onda-7.md.
         * Atenção: tirar o prefixo não é renomear. Os valores diferem
         * (brand #6E1423 fixo × var(--sgo-brand) #7c1a2b claro / #f0a7b1
         * escuro), então trocar o nome troca a cor renderizada E torna a tela
         * sensível ao tema. É a migração que destrava o modo escuro, não uma
         * limpeza — por isso ganhou onda própria, com auditoria de contraste.
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
        // Colididos com o legado → prefixo sgo- (removido por onda, 3-5).
        'sgo-brand': {
          DEFAULT: 'rgb(var(--sgo-brand-rgb) / <alpha-value>)',
          hover: 'rgb(var(--sgo-brand-hover-rgb) / <alpha-value>)',
          tint: 'rgb(var(--sgo-brand-tint-rgb) / <alpha-value>)',
          'tint-2': 'rgb(var(--sgo-brand-tint-2-rgb) / <alpha-value>)',
        },
        'sgo-surface': 'rgb(var(--sgo-surface-rgb) / <alpha-value>)',
        'sgo-success': {
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
