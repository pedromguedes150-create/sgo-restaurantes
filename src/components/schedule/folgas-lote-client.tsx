'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Save, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { DIAS_DA_SEMANA } from '@/lib/schedule/vigencia';
import type { LinhaDeFolga } from '@/lib/schedule/folgas-lote';

export interface TipoSimples { id: string; name: string; workDays: number; offDays: number }

/** Hoje em ISO, no relógio de quem usa a tela. */
function hojeISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface Escolha { templateId: string; offDay: string }

/**
 * Folgas de toda a unidade numa tela só.
 *
 * O botão "Buscar definições de cada colaborador" traz o que cada um JÁ TEM —
 * é o preenchimento automático que faltava. O gerente corrige as linhas erradas
 * e salva tudo de uma vez, em vez de abrir 20 formulários.
 */
export function FolgasLoteClient({
  unitId,
  unitName,
  linhas,
  tipos,
}: {
  unitId: string;
  unitName: string;
  linhas: LinhaDeFolga[];
  tipos: TipoSimples[];
}) {
  const router = useRouter();

  /** O estado nasce das definições atuais — o "buscar" já veio feito ao abrir. */
  const doServidor = useMemo(() => {
    const m: Record<string, Escolha> = {};
    for (const l of linhas) {
      m[l.collaboratorId] = {
        templateId: l.templateId ?? tipos[0]?.id ?? '',
        offDay: l.weeklyOffDay === null ? '' : String(l.weeklyOffDay),
      };
    }
    return m;
  }, [linhas, tipos]);

  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(doServidor);
  const [startDate, setStartDate] = useState(hojeISO);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);

  const tipoDe = (id: string) => tipos.find((t) => t.id === id) ?? null;
  const ehSemanal = (id: string) => {
    const t = tipoDe(id);
    return t ? t.workDays + t.offDays === 7 : false;
  };

  /* Quantos folgam em cada dia, conforme a tela está AGORA. É o número que
     mostra se a segunda-feira ficou sem ninguém. */
  const porDia = useMemo(() => {
    const c = [0, 0, 0, 0, 0, 0, 0];
    for (const l of linhas) {
      const e = escolhas[l.collaboratorId];
      if (!e || !ehSemanal(e.templateId) || e.offDay === '') continue;
      c[Number(e.offDay)]++;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhas, linhas, tipos]);

  const semDia = linhas.filter((l) => {
    const e = escolhas[l.collaboratorId];
    return e && ehSemanal(e.templateId) && e.offDay === '';
  });

  function buscarDefinicoes() {
    setEscolhas(doServidor);
    setMsg({ t: 'ok', m: 'Trouxe o que cada colaborador já tem definido. Ajuste o que estiver errado e salve.' });
  }

  function trocar(id: string, campo: keyof Escolha, valor: string) {
    setEscolhas((s) => ({ ...s, [id]: { ...s[id], [campo]: valor } }));
  }

  async function salvar() {
    setMsg(null);
    const itens = linhas
      .map((l) => ({ l, e: escolhas[l.collaboratorId] }))
      .filter(({ e }) => e && e.templateId && ehSemanal(e.templateId) && e.offDay !== '')
      .map(({ l, e }) => ({ collaboratorId: l.collaboratorId, templateId: e.templateId, weeklyOffDay: Number(e.offDay) }));

    if (itens.length === 0) { setMsg({ t: 'err', m: 'Escolha ao menos um dia de folga.' }); return; }
    if (!startDate) { setMsg({ t: 'err', m: 'Informe a partir de quando estas folgas passam a valer.' }); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveFolgasLote', unitId, startDate, itens }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ t: 'err', m: d.error ?? 'Falha ao salvar' }); return; }

      const partes = [`${d.salvos} folga(s) salva(s)`];
      if (Array.isArray(d.erros) && d.erros.length > 0) {
        partes.push(`${d.erros.length} não salva(s): ${d.erros.map((e: { colaborador: string }) => e.colaborador).join(', ')}`);
      }
      setMsg({ t: d.erros?.length ? 'err' : 'ok', m: partes.join(' · ') });
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-500">
        Uma linha por pessoa. O botão abaixo traz <b>o que cada colaborador já tem definido</b> — corrija o que estiver
        errado e salve tudo de uma vez. Tudo passa a valer <b>a partir da data escolhida</b>; os meses anteriores não mudam.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-52">
          <DatePicker label="Estas folgas valem a partir de" size="sm" value={startDate || null} onValueChange={(v) => setStartDate(v ?? '')} />
        </div>
        <Button size="sm" variant="outline" onClick={buscarDefinicoes} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Buscar definições de cada colaborador
        </Button>
        <Button size="sm" onClick={salvar} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? 'Salvando…' : 'Salvar folgas'}
        </Button>
      </div>

      {/* QUANTOS FOLGAM EM CADA DIA. Sem este número, dá para deixar a
          segunda-feira inteira sem ninguém e só descobrir no dia. */}
      <div className="flex flex-wrap gap-1.5">
        {DIAS_DA_SEMANA.map((dia, i) => (
          <span
            key={dia}
            className={`rounded-pill px-2.5 py-1 text-xs font-semibold ${porDia[i] === 0 ? 'bg-danger/10 text-danger' : 'bg-sunken text-ink-700'}`}
          >
            {dia}: {porDia[i]}
          </span>
        ))}
      </div>

      {semDia.length > 0 && (
        <p className="inline-flex items-center gap-1 rounded-lg bg-warning-bg px-3 py-2 text-xs font-medium text-warning">
          <AlertTriangle className="h-3.5 w-3.5" /> {semDia.length} sem dia de folga escolhido — não serão salvos.
        </p>
      )}

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm font-medium ${msg.t === 'ok' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {msg.m}
        </p>
      )}

      <div className="space-y-1.5">
        <p className="sgo-type-11 font-semibold text-ink-500">{unitName} · {linhas.length} colaborador(es)</p>

        {linhas.map((l) => {
          const e = escolhas[l.collaboratorId];
          const semanal = e ? ehSemanal(e.templateId) : false;
          return (
            <div key={l.collaboratorId} className={`flex flex-wrap items-end gap-2 rounded-lg border p-2.5 ${l.semEscala ? 'border-danger/40 bg-danger/5' : 'bg-surface'}`}>
              <div className="min-w-[12rem] flex-1">
                <p className="truncate text-sm font-semibold text-ink-900">{l.name}</p>
                <p className="text-[11px] text-ink-500">
                  {l.jobTitle ?? 'sem função'}
                  {l.semEscala ? ' · sem escala cadastrada' : l.templateName ? ` · hoje: ${l.templateName}` : ''}
                  {!l.semEscala && l.weeklyOffDay !== null ? ` · folga ${DIAS_DA_SEMANA[l.weeklyOffDay].toLowerCase()}` : ''}
                </p>
              </div>

              <div className="w-40">
                <Select
                  label="Tipo" size="sm" value={e?.templateId ?? ''}
                  onValueChange={(v) => trocar(l.collaboratorId, 'templateId', v)}
                  options={tipos.map((t) => ({ value: t.id, label: t.name, hint: `${t.workDays}x${t.offDays}` }))}
                />
              </div>

              <div className="w-40">
                {semanal ? (
                  <Select
                    label="Dia de folga" size="sm" placeholder="Escolha…" value={e?.offDay ?? ''}
                    onValueChange={(v) => trocar(l.collaboratorId, 'offDay', v)}
                    options={DIAS_DA_SEMANA.map((nome, i) => ({ value: String(i), label: nome }))}
                  />
                ) : (
                  /* Ciclo que não fecha na semana não tem dia fixo — dizer isso
                     aqui evita a pergunta "por que não dá para escolher?". */
                  <p className="text-[11px] text-ink-500">
                    Ciclo não fecha na semana — a folga anda. Configure este na tela da escala.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
