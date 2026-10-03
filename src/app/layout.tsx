import type { Metadata, Viewport } from 'next';
import { Inter, Roboto_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { THEME_COOKIE, THEME_DEFAULT, isThemeChoice, type ThemeChoice } from '@/lib/theme';
import '@/styles/sgo-design-system.css';
import '@/styles/sgo-kit.css';
import '@/styles/globals.css';

// Inter Variable auto-hospedada e pré-carregada pelo next/font, com fallback de
// métricas ajustadas (adjustFontFallback padrão) → sem FOUT / sem salto de layout.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
/* Números e códigos do kit de layout (v1.143.0): Roboto Mono, como no SGO dos
   Postos — auto-hospedada pelo next/font, igual à Inter. */
const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-roboto-mono',
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
  // (sem flash). Sem cookie vale THEME_DEFAULT — claro; o porquê está lá.
  const cookieTheme = cookies().get(THEME_COOKIE)?.value;
  const theme: ThemeChoice = isThemeChoice(cookieTheme) ? cookieTheme : THEME_DEFAULT;

  return (
    <html
      lang="pt-BR"
      /* A classe `dark` é o contrato do kit de layout (html.dark); o atributo
         data-theme continua sendo o do Restaurante. Os dois saem do MESMO
         cookie: 'dark' já vem com a classe do servidor; 'system' ganha a classe
         no script bloqueante abaixo, antes do 1º paint, lendo o aparelho. */
      className={`${inter.variable} ${robotoMono.variable}${theme === 'dark' ? ' dark' : ''}`}
      suppressHydrationWarning
      data-theme={theme}
    >
      <head>
        {theme === 'system' && (
          <script
            // Sem isto quem segue o aparelho no escuro veria a tela clara por um
            // quadro. É CSS do kit (html.dark), não preferência: a preferência
            // continua no cookie e no ThemeProvider.
            dangerouslySetInnerHTML={{ __html: "try{if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}" }}
          />
        )}
      </head>
      <body>
        <ThemeProvider initial={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
