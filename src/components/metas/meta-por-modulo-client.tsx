'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { SgoModal, SgoField } from '@/components/sgo/sgo-modal';
import { postAdmin } from '@/lib/admin-client';
import type { GrupoPorModulo, LinhaPorModulo, StatusDoComponente } from '@/lib/metas/por-modulo';
import { MOTIVO_MIN, ROTULO_STATUS, STATUS_DO_COMPONENTE, mesesDeVigencia } from '@/lib/metas/vigencia-regras';

/**
 * Meta POR MÓDULO (v1.170.0): todos os módulos do sistema, um por linha, com o
 * indicador que a meta mede e o campo de peso/desconto onde há indicador.
 * Grava pelas entidades `*Meta` do `/api/admin`. Desde a v1.174.0 é a ÚNICA
 * tela de pesos (a aba Componentes saiu) e os checklists têm um peso só.
 *
 * v1.180.0: cada componente com peso ganhou um STATUS (Em desenvolvimento ·
 * Em homologação · Monitoramento · Ativo), independente do peso — só Ativo
 * conta na nota. Toda gravação (peso, status ou desconto) passa por uma
 * confirmação com VIGÊNCIA (mês a partir do qual vale, nunca um mês
 * encerrado) e MOTIVO obrigatório; vira linha do histórico lá embaixo.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloDoMes = (ym: string) => { const [y, m] = ym.split('-').map(Number); return `${MESES[m - 1]}/${y}`; };

export function selosDaLinha(l: LinhaPorModulo): { tone: 'success' | 'warning' | 'info' | 'neutral'; texto: string } {
  const ind = l.indicador;
  if (!ind) return { tone: 'neutral', texto: 'Sem indicador' };
  const ligado = (l.valor ?? 0) > 0;
  if (ind.tipo === 'DESCONTO') return ligado ? { tone: 'success', texto: 'Conta na meta' } : { tone: 'neutral', texto: 'Desligado (0)' };
  if (l.status === 'DESENVOLVIMENTO') return { tone: 'neutral', texto: 'Em desenvolvimento' };
  if (l.status === 'HOMOLOGACAO') return { tone: 'warning', texto: 'Em homologação — não conta' };
  if (l.status === 'MONITORAMENTO') return { tone: 'info', texto: 'Monitoramento — não conta' };
  return ligado ? { tone: 'success', texto: 'Conta na meta' } : { tone: 'neutral', texto: 'Ativo com peso 0' };
}

type Pendente = { linha: LinhaPorModulo; campo: 'valor' | 'status'; novo: string };

export function MetaPorModuloClient({ grupos, canEdit, mesAtual }: { grupos: GrupoPorModulo[]; canEdit: boolean; mesAtual: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const g of grupos) for (const l of g.linhas) if (l.indicador?.entity) out[l.indicador.entity] = String(l.valor ?? 0).replace('.', ',');
    return out;
  });
  const [status, setStatus] = useState<Record<string, StatusDoComponente>>(() => {
    const out: Record<string, StatusDoComponente> = {};
    for (const g of grupos) for (const l of g.linhas) if (l.status) out[l.key] = l.status;
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [validFrom, setValidFrom] = useState(mesAtual);
  const [motivo, setMotivo] = useState('');

  function pedirConfirmacao(linha: LinhaPorModulo, campo: 'valor' | 'status') {
    const ind = linha.indicador;
    if (!ind?.entity) return;
    const novo = campo === 'status' ? (status[linha.key] ?? 'ATIVO') : (values[ind.entity] ?? '0');
    setPendente({ linha, campo, novo });
    setValidFrom(mesAtual);
    setMotivo('');
    setErro(null);
  }

  async function confirmar() {
    if (!pendente) return;
    const { linha, campo, novo } = pendente;
    const ind = linha.indicador!;
    setBusy(true); setErro(null);
    const base = { reason: motivo.trim(), validFrom };
    const payload = campo === 'status'
      ? { entity: 'metaStatus', action: 'set', key: linha.key, status: novo, ...base }
      : ind.tipo === 'DESCONTO'
        ? { entity: ind.entity, action: 'setPenalty', pct: Number(novo.replace(',', '.')), ...base }
        : { entity: ind.entity, action: 'setWeight', weight: Number(novo.replace(',', '.')), ...base };
    const r = await postAdmin(payload);
    setBusy(false);
    if (r.ok) { setPendente(null); router.refresh(); } else setErro(r.error ?? 'Falha ao gravar.');
  }

  const motivoCurto = motivo.trim().length < MOTIVO_MIN;
  const opcoesDeMes = mesesDeVigencia(mesAtual).map((m) => ({ value: m, label: m === mesAtual ? `${rotuloDoMes(m)} (mês corrente)` : rotuloDoMes(m) }));

  return (
    <div className="space-y-4">
      {erro && !pendente && <p className="text-sm font-medium text-danger">{erro}</p>}
      {grupos.map((g) => (
        <section key={g.area} className="sgo-panel sgo-panel--solid overflow-hidden">
          <p className="sgo-panel__title px-3 pt-3">{g.area}</p>
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Módulo</th>
                  <th className="text-left">Indicador da meta</th>
                  <th className="text-left">Como entra na nota</th>
                  <th className="text-left">Status</th>
                  <th className="text-right">Peso / desconto</th>
                </tr>
              </thead>
              <tbody>
                {g.linhas.map((l) => {
                  const ind = l.indicador;
                  const selo = selosDaLinha(l);
                  return (
                    <tr key={l.key} data-testid={`meta-modulo-${l.key}`}>
                      <td className="whitespace-nowrap font-medium text-ink-900">
                        {l.label}
                        <span className="block">
                          <StatusBadge tone={selo.tone} dot={!!ind}>{selo.texto}</StatusBadge>
                        </span>
                      </td>
                      <td className="min-w-56 max-w-xs whitespace-normal text-ink-900">
                        {ind ? ind.indicador : <span className="text-ink-500">Ainda sem indicador de meta — o SGO não mede este módulo para a bonificação.</span>}
                      </td>
                      <td className="min-w-64 max-w-md whitespace-normal text-xs text-ink-700">
                        {ind?.como ?? '—'}
                        {l.compartilhadoCom.length > 0 && (
                          <span className="block text-ink-500">Mesmo ajuste de: {l.compartilhadoCom.join(', ')}.</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {ind?.tipo === 'PESO' && l.status ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-44">
                              <Select
                                aria-label={`Status de ${l.label}`}
                                size="sm"
                                disabled={!canEdit}
                                value={status[l.key] ?? l.status}
                                onValueChange={(v) => setStatus((s) => ({ ...s, [l.key]: v as StatusDoComponente }))}
                                options={STATUS_DO_COMPONENTE.map((s) => ({ value: s.value, label: s.label, hint: s.descricao }))}
                              />
                            </span>
                            {canEdit && (status[l.key] ?? l.status) !== l.status && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => pedirConfirmacao(l, 'status')} aria-label={`Salvar status de ${l.label}`}>
                                <Save className="h-4 w-4" />
                              </Button>
                            )}
                          </span>
                        ) : ind?.tipo === 'DESCONTO' ? (
                          <span className="text-xs text-ink-500">Desconto direto</span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {ind?.entity ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <Input
                              inputMode="decimal"
                              aria-label={`${ind.tipo === 'DESCONTO' ? 'Desconto' : 'Peso'} de ${l.label}`}
                              value={values[ind.entity] ?? ''}
                              onChange={(e) => setValues((s) => ({ ...s, [ind.entity]: e.target.value }))}
                              disabled={!canEdit}
                              className="h-9 w-20 text-right text-sm tabular-nums"
                            />
                            <span className="w-16 text-left text-xs text-ink-500">{ind.tipo === 'DESCONTO' ? '% cada' : 'peso'}</span>
                            {canEdit && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => pedirConfirmacao(l, 'valor')} aria-label={`Salvar ${l.label}`}>
                                <Save className="h-4 w-4" />
                              </Button>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!canEdit && <p className="text-xs text-ink-500">Visualização — a edição dos pesos e dos status é do Administrador.</p>}

      <SgoModal
        open={!!pendente}
        onClose={() => (busy ? undefined : setPendente(null))}
        title={pendente ? `Alterar ${pendente.campo === 'status' ? 'o status' : pendente.linha.indicador?.tipo === 'DESCONTO' ? 'o desconto' : 'o peso'} — ${pendente.linha.label}` : ''}
        subtitle="A mudança vale a partir do mês escolhido. Meses já encerrados não mudam: a nota deles fica como foi calculada."
        tone="brand"
        size="sm"
        data-testid="modal-vigencia"
        onSubmit={(e) => { e.preventDefault(); if (!motivoCurto && !busy) void confirmar(); }}
        footer={
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setPendente(null)}>Cancelar</Button>
            <Button type="submit" disabled={busy || motivoCurto}>{busy ? 'Gravando…' : 'Confirmar'}</Button>
          </>
        }
      >
        {pendente && (
          <div className="space-y-3">
            <p className="text-sm text-ink-900">
              Novo valor: <b>{pendente.campo === 'status' ? ROTULO_STATUS[pendente.novo as StatusDoComponente] : pendente.novo}</b>
              {pendente.campo === 'valor' && pendente.linha.indicador?.tipo === 'DESCONTO' ? '% por ocorrência' : ''}
            </p>
            {pendente.campo === 'status' && pendente.novo !== 'ATIVO' && (
              <p className="text-xs text-ink-700">Fora de &quot;Ativo&quot;, o componente é medido e mostrado em observação, mas não entra na nota de ninguém — mesmo com peso.</p>
            )}
            {pendente.campo === 'valor' && pendente.linha.status && pendente.linha.status !== 'ATIVO' && (
              <p className="text-xs text-warning">Este componente está em &quot;{ROTULO_STATUS[pendente.linha.status]}&quot;: o peso fica gravado, mas só passa a contar quando o status for Ativo.</p>
            )}
            <SgoField label="Vale a partir de" required>
              <Select aria-label="Vigência" value={validFrom} onValueChange={setValidFrom} options={opcoesDeMes} />
            </SgoField>
            <SgoField label="Motivo da alteração" required hint={`Mínimo ${MOTIVO_MIN} caracteres — fica no histórico e na Auditoria.`}>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: equipe treinada, componente passa a contar" aria-label="Motivo da alteração" />
            </SgoField>
            {erro && <p className="text-sm font-medium text-danger">{erro}</p>}
          </div>
        )}
      </SgoModal>
    </div>
  );
}
