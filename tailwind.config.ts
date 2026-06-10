import type { Config } from 'tailwindcss';

/**
 * Design System SGO Beija Flor.
 * Cores institucionais (regra inegociável nº 2):
 *  - Primária: verde escuro #1B4332 · Acento: dourado #C9A84C
 *  - Fundo: #FFFFFF · Superfície: #F5F5F5
 *  - Crítico #DC2626 · Médio #F59E0B · Sucesso #16A34A
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
          DEFAULT: '#1B4332',
          light: '#2D6A4F',
          dark: '#102A20',
        },
        gold: {
          DEFAULT: '#C9A84C',
          light: '#DCC178',
          dark: '#A4862F',
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
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
