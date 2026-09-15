'use client';

import { useState } from 'react';
import { TriangleAlert, ArrowLeftRight, Users } from 'lucide-react';
import { STATUS_LABEL, STATUS_EMOJI, type StatusDeCobertura } from '@/lib/workforce/necessidade';

export interface SetorNaTela {
  sectorId: string;
  sectorName: string;
  necessario: number;
  presentes: number;
  status: StatusDeCobertura;
  excedente: number;
  faixaAtual: string | null;
  pessoas: { id: string; name: string; kind: string; horario: string | null }[];
}

export interface TrechoNaTela {
  rotulo: string;
  necessario: number;
  presentes: number;
  status: StatusDeCobertura;
}

export interface DiaNaTela {
  sectorId: string;
  sectorName: string;
  trechos: TrechoNaTela[];
  buracos: { rotulo: string; necessario: number; presentes: number }[];
}

/* A cor repete o que a legenda diz — quem olha de longe lê o padrão antes do texto. */
const BORDA: Record<StatusDeCobertura, string> = {
  COBERTO: 'border-success/50',
  PARCIAL: 'border-warning',
  SEM_COBERTURA: 'border-danger',
  SEM_EXIGENCIA: 'border-line',
};

const TEXTO: Record<StatusDeCobertura, string> = {
  COBERTO: 'text-success',
  PARCIAL: 'text-warning',
  SEM_COBERTURA: 'text-danger',
  SEM_EXIGENCIA: 'text-ink-500',
};

/**
 * Cobertura por setor num horário.
 *
 * O número grande é `presentes / necessário`, e embaixo dele a faixa que
 * produziu o "necessário" — sem isso o card diz que o setor está amarelo e não
 * diz por quê, que é justamente a pergunta de quem olha.
 */
export function CoberturaClient({
  horaLabel,
  setores,
  abaixoDoMinimo,
  comExcedente,
  dia,
}: {
  horaLabel: string;
  setores: SetorNaTela[];
  abaixoDoMinimo: SetorNaTela[];
  comExcedente: SetorNaTela[];
  dia: DiaNaTela[];
}) {
  const [verDia, setVerDia] = useState(false);

  /* Realocação só faz sentido quando existem os dois lados ao mesmo tempo. */
  const sugestoes = abaixoDoMinimo.flatMap((falta) =>
    comExcedente.map((sobra) => ({ falta, sobra })),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">Cobertura às {horaLabel}</p>
        <button
          type="button"
          onClick={() => setVerDia((v) => !v)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${verDia ? 'border-brand bg-brand text-on-brand' : 'text-ink-700'}`}
        >
          Visão do dia
        </button>
      </div>

      {/* ── Alertas: o que está descoberto AGORA ── */}
      {abaixoDoMinimo.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-danger">
            <TriangleAlert className="h-4 w-4" /> Abaixo do mínimo agora
          </p>
          <ul className="mt-1 space-y-0.5 text-ink-700">
            {abaixoDoMinimo.map((s) => (
              <li key={s.sectorId}>
                <b>{s.sectorName}</b>: necessário {s.necessario}, escalado {s.presentes}
                {s.faixaAtual ? ` (faixa ${s.faixaAtual})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Sugestão de realocação: mostrar, nunca mover sozinho ── */}
      {sugestoes.length > 0 && (
        <div className="rounded-lg border border-dashed border-brand/50 p-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-brand">
            <ArrowLeftRight className="h-4 w-4" /> Possível realocação
          </p>
          <ul className="mt-1 space-y-0.5 text-ink-700">
            {sugestoes.map(({ falta, sobra }) => (
              <li key={`${sobra.sectorId}-${falta.sectorId}`}>
                <b>{sobra.sectorName}</b> tem {sobra.excedente} acima do mínimo e{' '}
                <b>{falta.sectorName}</b> está {falta.necessario - falta.presentes} abaixo.
              </li>
            ))}
          </ul>
          {/* A decisão continua sendo do gestor — o sistema não move ninguém. */}
          <p className="mt-1 text-xs text-ink-500">Sugestão apenas. Nada é movido automaticamente.</p>
        </div>
      )}

      {/* ── Visão do dia ── */}
      {verDia && (
        <div className="space-y-2">
          {dia.map((s) => (
            <div key={s.sectorId} className="rounded-lg border p-2.5">
              <p className="text-sm font-semibold text-ink-900">{s.sectorName}</p>
              <div className="mt-1 space-y-0.5">
                {s.trechos.map((t) => (
                  <div key={t.rotulo} className="flex items-center justify-between gap-2 text-xs">
                    <span className="tabular-nums text-ink-700">{t.rotulo}</span>
                    <span className={`font-semibold tabular-nums ${TEXTO[t.status]}`}>
                      {STATUS_EMOJI[t.status]}{' '}
                      {t.status === 'SEM_EXIGENCIA' ? 'Sem exigência' : `${t.presentes}/${t.necessario}`}
                    </span>
                  </div>
                ))}
              </div>
              {s.buracos.length > 0 && (
                <p className="mt-1.5 rounded-md bg-warning-bg p-1.5 text-xs text-warning">
                  ⚠️ {s.sectorName} fica abaixo do mínimo em: {s.buracos.map((b) => `${b.rotulo} (${b.presentes}/${b.necessario})`).join(', ')}.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Os cards ── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {setores.map((s) => (
          <div key={s.sectorId} className={`rounded-lg border-2 bg-surface p-3 ${BORDA[s.status]}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-ink-900">{s.sectorName}</p>
              <span className={`sgo-type-11 font-semibold ${TEXTO[s.status]}`}>
                {STATUS_EMOJI[s.status]} {STATUS_LABEL[s.status]}
              </span>
            </div>

            <p className="mt-1 text-2xl font-bold tabular-nums text-ink-900">
              {s.status === 'SEM_EXIGENCIA' ? `${s.presentes}` : `${s.presentes} / ${s.necessario}`}
              <span className="ml-1 text-xs font-normal text-ink-500">
                {s.status === 'SEM_EXIGENCIA' ? 'pessoa(s)' : 'pessoas'}
              </span>
            </p>
            {s.excedente > 0 && (
              <p className="text-xs font-semibold text-success">+{s.excedente} acima do mínimo</p>
            )}

            {s.pessoas.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-xs text-ink-700">
                {s.pessoas.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    <Users className="h-3 w-3 shrink-0 text-ink-400" />
                    {p.name}
                    {p.kind === 'FREELANCER' && <span className="text-[10px] text-ink-500">(freelancer)</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-ink-500">Ninguém alocado neste horário.</p>
            )}

            {/* De onde veio o número — o card explica a própria cor. */}
            <p className="mt-2 border-t border-line pt-1.5 text-[11px] text-ink-500">
              {s.faixaAtual
                ? <>Faixa atual: <b>{s.faixaAtual}</b> · necessidade: <b>{s.necessario}</b></>
                : <>Sem faixa de necessidade cadastrada para este horário.</>}
            </p>
          </div>
        ))}
        {setores.length === 0 && <p className="text-sm text-ink-500">Nenhum setor cadastrado nesta unidade.</p>}
      </div>
    </div>
  );
}
