import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DevShellClient } from './dev-shell-client';

export const metadata: Metadata = { title: 'SGO · Shell (dev)' };

/** Harness do shell/navegação (Onda 1) sem banco nem login. Dev-only: 404 em produção. */
export default function DevShellPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevShellClient />;
}
