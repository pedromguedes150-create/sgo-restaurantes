'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postAdmin } from '@/lib/admin-client';

export interface MetaComponentUI {
  key: string; // entity do dispatch admin ('' = não editável aqui)
  name: string;
  kind: 'DIARIO' | 'GESTAO' | 'PENALIDADE' | 'CHECKLISTS';
  weight: number; // ou % no caso da penalidade
  hint: string;
}

/** Central de configuração da Meta (16/07): tudo num lugar, Admin edita. */
export function MetaConfigClient({ components, canEdit }: { components: MetaComponentUI[]; canEdit: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(components.filter((c) => c.key).map((c) => [c.key, String(c.weight).replace('.', ',')])));
  const [busy, setBusy] = useState(false);

  async function save(c: MetaComponentUI) {
    setBusy(true);
    const v = Number((values[c.key] ?? '0').replace(',', '.'));
    const payload = c.kind === 'PENALIDADE'
      ? { entity: c.key, action: 'setPenalty', pct: v }
      : { entity: c.key, action: 'setWeight', weight: v };
    const r = await postAdmin(payload);
    setBusy(false);
    if (r.ok) router.refresh(); else alert(r.error ?? 'Falha');
  }

  const groups: { kind: MetaComponentUI['kind']; title: string; desc: string }[] = [
    { kind: 'CHECKLISTS', title: 'Checklists (rotina diária)', desc: 'Peso definido POR CHECKLIST em Configurações → Checklists ("entra na meta" + peso).' },
    { kind: 'DIARIO', title: 'Atividades diárias (cobertura mensal)', desc: 'Preenchimento obrigatório todos os dias: dias preenchidos ÷ dias decorridos. Sem preenchimento, o % cai. Peso 0 = desligado.' },
    { kind: 'GESTAO', title: 'Atividades de gestão', desc: 'Componentes mensais com peso único. Peso 0 = desligado.' },
    { kind: 'PENALIDADE', title: 'Penalidade — correções da supervisão', desc: 'Módulos de lançamento perdem % da meta por correção/edição feita pela supervisão (data corrigida ou nota lançada por eles).' },
  ];

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const items = components.filter((c) => c.kind === g.kind);
        if (items.length === 0) return null;
        return (
          <div key={g.kind} className="rounded-lg border bg-surface p-3">
            <p className="text-sm font-bold text-brand">{g.title}</p>
            <p className="mb-2 text-xs text-ink-500">{g.desc}</p>
            <div className="space-y-1.5">
              {items.map((c) => (
                <div key={c.name} className="flex items-center justify-between gap-2 rounded-md bg-canvas p-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-ink-500">{c.hint}</p>
                  </div>
                  {c.key ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Input inputMode="decimal" value={values[c.key] ?? ''} onChange={(e) => setValues((s) => ({ ...s, [c.key]: e.target.value }))} disabled={!canEdit} className="h-9 w-20 text-right text-sm tabular-nums" />
                      <span className="text-xs text-ink-500">{c.kind === 'PENALIDADE' ? '%/lanç.' : 'peso'}</span>
                      {canEdit && <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(c)}><Save className="h-4 w-4" /></Button>}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-ink-500">por checklist</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!canEdit && <p className="text-xs text-ink-500">Visualização — a edição dos pesos é do Administrador.</p>}
    </div>
  );
}
