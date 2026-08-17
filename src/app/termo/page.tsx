import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { TERMS_TEXT } from '@/lib/lgpd';
import { AcceptTerms } from '@/components/lgpd/accept-terms';

export const dynamic = 'force-dynamic';

export default async function TermoPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (!user.needsTerms) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-xl font-bold text-ink-900">Termo de Uso e Privacidade</h1>
      <div className="whitespace-pre-wrap rounded-xl border bg-surface p-4 text-sm leading-relaxed">{TERMS_TEXT}</div>
      <AcceptTerms />
    </main>
  );
}
