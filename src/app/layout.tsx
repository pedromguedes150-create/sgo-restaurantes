import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { THEME_COOKIE, isThemeChoice, type ThemeChoice } from '@/lib/theme';
import '@/styles/sgo-design-system.css';
import '@/styles/globals.css';

// Inter Variable auto-hospedada e pré-carregada pelo next/font, com fallback de
// métricas ajustadas (adjustFontFallback padrão) → sem FOUT / sem salto de layout.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SGO Beija Flor',
  description: 'Sistema de Gestão Operacional — Rede Beija Flor',
  applicationName: 'SGO Beija Flor',
  // PWA: instalável na tela de início (pré-requisito do push no iPhone)
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'SGO', statusBarStyle: 'black-translucent' },
};

// PWA / mobile-first: viewport adequado e cor de tema da marca
export const viewport: Viewport = {
  // Metadata do navegador (barra do sistema no PWA), lida antes de qualquer
  // CSS: var(--sgo-brand) não é resolvido aqui.
  themeColor: '#6E1423', // ds-allow-hex: metadata de PWA, fora do alcance do CSS
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Tema lido do cookie no servidor e carimbado no <html> antes do 1º paint
  // (sem flash). Sem cookie, o padrão é CLARO — e não "system" — enquanto o
  // conteúdo legado não usa os tokens do DS: escurecer só as superfícies
  // deixaria textos de cor fixa (ex.: bordô) ilegíveis. Ver comentário em
  // sgo-design-system.css; na Onda 3 o padrão volta a ser 'system'.
  const cookieTheme = cookies().get(THEME_COOKIE)?.value;
  const theme: ThemeChoice = isThemeChoice(cookieTheme) ? cookieTheme : 'light';

  return (
    <html
      lang="pt-BR"
      className={inter.variable}
      suppressHydrationWarning
      data-theme={theme}
    >
      <body>
        <ThemeProvider initial={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
