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
