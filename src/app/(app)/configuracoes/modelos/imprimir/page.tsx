import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listChecklistModels } from '@/lib/checklist-models';
import { PrintButton } from '@/components/ui/print-button';
import { ArrowLeft, Camera } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ModelosImprimirPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  const models = (await listChecklistModels({ activeOnly: true }));

  // agrupa por setor
  const groups = new Map<string, typeof models>();
  for (const m of models) { const k = m.category || 'Outros'; groups.set(k, [...(groups.get(k) ?? []), m]); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/configuracoes/modelos" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Modelos</Link>
        <PrintButton label="Imprimir / Salvar PDF" />
      </div>
      <h1 className="text-xl font-bold text-sgo-brand">Biblioteca de modelos de checklist</h1>

      {[...groups.entries()].map(([cat, list]) => (
        <section key={cat} className="break-inside-avoid">
          <h2 className="mt-3 border-b pb-1 text-base font-bold text-sgo-brand">{cat}</h2>
          {list.map((m) => (
            <div key={m.id} className="mt-2 break-inside-avoid">
              <p className="text-sm font-semibold">{m.moment ?? m.name} <span className="text-xs font-normal text-ink-500">({m.scope === 'MANAGER' ? 'individual' : 'da unidade'}{m.limitTime ? ` · limite ${m.limitTime}` : ''} · peso {m.weight})</span></p>
              <ul className="ml-1 mt-1 space-y-0.5">
                {m.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded border" />
                    <span>{it.text}{it.requiresPhoto && <Camera className="ml-1 inline h-3 w-3 text-ink-500" />}</span>
                  </li>
                ))}
                {m.items.length === 0 && <li className="text-xs text-ink-500">Sem itens.</li>}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
