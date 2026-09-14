'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sheet } from '@/components/ui/ds/sheet';
import { Select } from '@/components/ui/ds/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export interface TipoDeOcorrencia {
  id: string;
  name: string;
  isMaintenance?: boolean;
  isIT?: boolean;
  categories: { id: string; name: string }[];
}

export interface OcorrenciaAberta {
  id: string;
  number: number;
  destinoLabel: string;
  href: string;
  desde: string;
}

/** O que cada gravidade DISPARA — escolher no escuro é como se acordava gente à toa. */
const GRAVIDADE: { value: string; label: string; hint: string }[] = [
  { value: 'LOW', label: '🟢 Baixa', hint: 'Só histórico. Não avisa ninguém.' },
  { value: 'MEDIUM', label: '🟡 Média', hint: 'Só histórico. Não avisa ninguém.' },
  { value: 'HIGH', label: '🔴 Alta', hint: 'Avisa a supervisão na hora.' },
  { value: 'CRITICAL', label: '⚫ Crítica', hint: 'Avisa a supervisão E a diretoria na hora.' },
];

/**
 * Abrir ocorrência a partir de um item do checklist.
 *
 * O item já diz o quê e onde: unidade, texto do item e a observação que o
 * gerente acabou de escrever entram preenchidos. O que falta perguntar é só o
 * que o automático tinha de **inventar** — tipo, categoria, gravidade e anexo —
 * e é justamente por isso que a ocorrência automática era ruim: ela nascia
 * sempre "Checklist / MÉDIA", sem destino nenhum.
 */
export function ChecklistOccurrenceSheet({
  aberta,
  unitId,
  itemId,
  itemText,
  itemNote,
  checklistName,
  types,
  onFechar,
  onAberta,
}: {
  /** Quando já existe uma aberta para este item, a folha só oferece visualizar. */
  aberta: OcorrenciaAberta | null;
  unitId: string;
  itemId: string;
  itemText: string;
  itemNote?: string;
  checklistName: string;
  types: TipoDeOcorrencia[];
  onFechar: () => void;
  onAberta: (o: { id: string; number: number; destinoLabel: string }) => void;
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [gravity, setGravity] = useState('MEDIUM');
  const [description, setDescription] = useState(
    `${itemText}${itemNote ? ` — ${itemNote}` : ''}\n\n(checklist: ${checklistName})`,
  );
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicada, setDuplicada] = useState<{ id: string; number: number } | null>(null);

  const tipo = useMemo(() => types.find((t) => t.id === typeId), [types, typeId]);
  const categorias = tipo?.categories ?? [];
  const destino = !tipo ? null : tipo.isMaintenance ? 'Manutenção' : tipo.isIT ? 'T.I.' : 'Geral';
  /* Alta e Crítica entram TAMBÉM na aba Geral Crítico. "Também" e não "em vez
     de": tirar uma falta de energia da aba Manutenção esconderia dela justamente
     o caso mais grave. */
  const tambemCritica = gravity === 'HIGH' || gravity === 'CRITICAL';

  /* ── Já existe: a folha vira um convite a olhar a que existe ── */
  if (aberta) {
    return (
      <Sheet open onClose={onFechar} title="Já existe uma ocorrência aberta" description={itemText}>
        <div className="space-y-3">
          <p className="rounded-lg border border-warning bg-warning-bg p-2.5 text-sm text-warning">
            Já existe uma ocorrência aberta para este problema (<b>nº {aberta.number}</b>, {aberta.destinoLabel},
            desde {aberta.desde}). Abrir outra duplicaria o aviso à supervisão e a conta de reincidência.
          </p>
          <p className="text-sm text-ink-700">Deseja visualizar a ocorrência existente?</p>
          <div className="flex gap-2">
            <Link href={aberta.href} className="inline-flex items-center rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-on-brand">
              Ver ocorrência nº {aberta.number}
            </Link>
            <Button size="sm" variant="outline" onClick={onFechar}>Voltar ao checklist</Button>
          </div>
        </div>
      </Sheet>
    );
  }

  const faltando = !typeId
    ? 'o tipo'
    : !categoryId && categorias.length > 0
      ? 'a categoria'
      : !description.trim()
        ? 'a descrição'
        : null;

  async function abrir() {
    setErro(null); setDuplicada(null);
    if (faltando) { setErro(`Falta preencher ${faltando}.`); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('typeId', typeId);
      if (categoryId) fd.append('categoryId', categoryId);
      fd.append('gravity', gravity);
      fd.append('description', description);
      /* O que amarra a ocorrência ao item — é isto que faz o checklist mostrar
         "Ocorrência nº N aberta" amanhã, e o servidor recusar a segunda. */
      fd.append('sourceTaskItemId', itemId);
      if (files) for (const f of Array.from(files)) fd.append('attachments', f);

      const res = await fetch('/api/occurrences', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        onAberta({ id: d.id, number: d.number, destinoLabel: destino ?? 'Geral' });
        router.refresh();
        return;
      }
      if (d.reason === 'JA_EXISTE' && d.existente) { setDuplicada(d.existente); return; }
      setErro(d.error ?? 'Não foi possível abrir a ocorrência.');
    } catch {
      setErro('Falha de conexão.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open onClose={onFechar}
      title="Abrir ocorrência"
      description={itemText}
      footer={
        <div className="space-y-2">
          {duplicada && (
            <p className="rounded-md bg-warning-bg p-2 text-sm text-warning">
              Já existe uma ocorrência aberta para este problema (nº {duplicada.number}).{' '}
              <Link href={`/modulos/ocorrencias/${duplicada.id}`} className="font-semibold underline">Visualizar</Link>
            </p>
          )}
          {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          <Button size="sm" disabled={busy} onClick={abrir}>{busy ? 'Abrindo…' : 'Abrir ocorrência'}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Select
          label="Tipo do problema" size="sm" placeholder="Selecione…"
          value={typeId}
          onValueChange={(v) => { setTypeId(v); setCategoryId(''); }}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
        />
        {/* O destino ANTES de gravar: o pedido era "encaminhar para a área
            responsável", e ninguém confia num encaminhamento que não vê. */}
        {destino && (
          <p className="rounded-md bg-sunken p-2 text-xs text-ink-700">
            Esta ocorrência vai para a aba <b>{destino}</b>
            {tambemCritica && <> — e também para <b>Geral Crítico</b>, por causa da criticidade</>}.
          </p>
        )}

        {categorias.length > 0 && (
          <Select
            label="Categoria" size="sm" placeholder="Selecione…"
            value={categoryId} onValueChange={setCategoryId}
            options={categorias.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}

        <div>
          <Select
            label="Criticidade" size="sm" value={gravity} onValueChange={setGravity}
            options={GRAVIDADE.map((g) => ({ value: g.value, label: g.label }))}
          />
          <p className="mt-1 text-[11px] text-ink-500">{GRAVIDADE.find((g) => g.value === gravity)?.hint}</p>
        </div>

        <div>
          <Label className="text-xs">Descrição do problema</Label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            className="mt-1 w-full rounded-md border-2 border-line-strong bg-surface p-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-ink-500">Já vem com o item e a sua observação. Complete com o que a outra área precisa saber.</p>
        </div>

        <div>
          <Label className="text-xs">Foto ou anexo (opcional)</Label>
          <input
            type="file" multiple accept="image/*,video/*,application/pdf" capture="environment"
            onChange={(e) => setFiles(e.target.files)}
            className="mt-1 block w-full text-xs"
          />
        </div>
      </div>
    </Sheet>
  );
}
