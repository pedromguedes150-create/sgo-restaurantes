import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DevUiClient } from './dev-ui-client';

export const metadata: Metadata = { title: 'SGO · Design System' };

/** Página de referência do design system (Onda 0). Dev-only: 404 em produção. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevUiClient />;
}
