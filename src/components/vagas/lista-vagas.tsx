'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { Andamento } from '@/components/vagas/andamento';
import { shortUnitName } from '@/lib/unit-name';
import { ROTULO_DO_MOTIVO, type Motivo } from '@/lib/vagas/regras';
import { alertasDaVaga, cartoesDaLista, casaComABusca, curriculosParaAvaliar, diasEntre, FILTROS, filtroPadrao, ordenarVagas, passaNoFiltro, posicaoDaVaga, semCurriculo, type Filtro } from '@/lib/vagas/acompanhamento';
import { curriculosDoGerente } from '@/lib/vagas/curriculo-situacao';
import type { VagaDTO } from '@/lib/vagas/tipos';
import { Briefcase } from 'lucide-react';

const emBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * A LISTA de vagas com o acompanhamento. Cartões (que também filtram), filtros,
 * busca e a tabela — que no celular vira cartões com todas as colunas. Tudo é
 * derivado da mesma lista que o servidor já recortou pelo alcance do usuário.
 */
export function ListaDeVagas({ vagas, aprovador, agoraISO, unidades }: { vagas: VagaDTO[]; aprovador: boolean; agoraISO: string; unidades: { id: string; name: string }[] }) {
  const agora = useMemo(() => new Date(agoraISO), [agoraISO]);
  const [filtro, setFiltro] = useState<Filtro>(() => filtroPadrao(vagas, aprovador));
  const [unidade, setUnidade] = useState('');
  const [busca, setBusca] = useState('');

  const daUnidade = useMemo(() => (unidade ? vagas.filter((v) => v.unitId === unidade) : vagas), [vagas, unidade]);
  const cartoes = useMemo(() => cartoesDaLista(daUnidade, agora), [daUnidade, agora]);
  const visiveis = useMemo(() => ordenarVagas(daUnidade.filter((v) => passaNoFiltro(v, filtro, agora) && casaComABusca(v, busca)), agora), [daUnidade, filtro, busca, agora]);
  const cor = (n: number, c: string) => (n > 0 ? c : undefined);

  return (
    <div className="space-y-4" data-testid="lista-de-vagas">
      <SgoKpis>
        <SgoKpi label="Aguardando aprovação" value={cartoes.aguardando} onClick={() => setFiltro('aguardando')} valueColor={cor(cartoes.aguardandoForaDoPrazo, 'var(--sgo-bad)')} meta={cartoes.aguardandoForaDoPrazo ? `${cartoes.aguardandoForaDoPrazo} fora do prazo de 1 dia útil` : 'prazo: 1 dia útil'} testId="cartao-aguardando" />
        <SgoKpi label="Devolvidas ao gerente" value={cartoes.devolvidas} onClick={() => setFiltro('devolvidas')} testId="cartao-devolvidas" />
        <SgoKpi label="No RH" value={cartoes.noRh} onClick={() => setFiltro('no-rh')} meta={[cartoes.semChegar ? `${cartoes.semChegar} sem chegar ao RH` : '', cartoes.curriculosParaAvaliar ? `${cartoes.curriculosParaAvaliar} currículo(s) para avaliar` : ''].filter(Boolean).join(' · ') || undefined} testId="cartao-no-rh" />
        <SgoKpi label="Precisam de atenção" value={cartoes.atencao} onClick={() => setFiltro('atencao')} valueColor={cor(cartoes.atrasadas, 'var(--sgo-bad)') ?? cor(cartoes.atencao, 'var(--sgo-warn)')} meta={cartoes.atrasadas ? `${cartoes.atrasadas} atrasada(s)` : undefined} testId="cartao-atencao" />
        <SgoKpi label="Concluídas" value={cartoes.concluidas} onClick={() => setFiltro('encerradas')} testId="cartao-concluidas" />
      </SgoKpis>

      {cartoes.porEtapa.length > 0 && (
        <p className="text-xs text-ink-700" data-testid="no-rh-por-etapa"><b className="text-ink-900">No RH, por etapa:</b> {cartoes.porEtapa.map((e) => `${e.nome} ${e.n}`).join(' · ')}</p>
      )}

      <div className="sgo-filtros -mx-4 px-4">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <Select label="Mostrar" value={filtro} onValueChange={(v) => setFiltro(v as Filtro)} options={FILTROS} />
          {unidades.length > 1 && <Select label="Unidade" searchable value={unidade} onValueChange={setUnidade} options={[{ value: '', label: 'Todas' }, ...unidades.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]} />}
          <label className="block text-xs text-ink-500">Buscar
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, nº do RH, unidade, cargo, quem pediu, quem sai" className="h-10 pl-9 text-sm" />
            </span>
          </label>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <EmptyState icon={Briefcase} title="Nenhuma vaga neste filtro" description={vagas.length === 0 ? 'Use "Nova vaga" para pedir a primeira.' : 'Mude o filtro ou limpe a busca.'} />
      ) : (
        <>
          {/* Computador: tabela. */}
          <section className="sgo-panel sgo-panel--solid hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="sgo-tbl w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Código</th><th className="text-left">Unidade</th><th className="text-left">Vagas</th><th className="text-left">Motivo</th>
                    <th className="text-left">Solicitado</th><th className="text-left">Início</th><th className="text-left">Andamento</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((v) => <LinhaTabela key={v.id} v={v} agora={agora} />)}
                </tbody>
              </table>
            </div>
          </section>
          {/* Celular: os mesmos dados, em cartões. */}
          <ul className="space-y-3 md:hidden">
            {visiveis.map((v) => <li key={v.id}><CartaoDaVaga v={v} agora={agora} /></li>)}
          </ul>
        </>
      )}
      <p className="text-xs text-ink-500">{visiveis.length} de {daUnidade.length} vaga(s).</p>
    </div>
  );
}

function partes(v: VagaDTO, agora: Date) {
  const p = posicaoDaVaga(v);
  const alertas = alertasDaVaga(v, agora);
  const novos = curriculosParaAvaliar(v);
  const motivos = [...new Set(v.posicoes.map((x) => ROTULO_DO_MOTIVO[x.motivo as Motivo] ?? x.motivo).filter(Boolean))].join(' · ') || '—';
  const cvs = curriculosDoGerente(v.curriculos).length;
  const aberta = v.status !== 'CONCLUIDA' && v.status !== 'CANCELADA';
  return { p, alertas, novos, motivos, cvs, aberta, dias: diasEntre(new Date(v.createdAt), agora) };
}

function Codigo({ v }: { v: VagaDTO }) {
  return (
    <>
      <Link href={`/modulos/vagas/${v.id}`} className="font-bold text-brand hover:underline" data-testid="link-da-vaga">{v.codigo}</Link>
      {v.codigoRh && <span className="block text-xs text-ink-500">RH: {v.codigoRh}</span>}
      {v.prioridade === 'URGENTE' && <span className="mt-0.5 inline-block rounded-pill bg-danger-bg px-2 py-0.5 text-xs font-bold text-danger">Urgente</span>}
    </>
  );
}

function Vagas({ v, cvs }: { v: VagaDTO; cvs: number }) {
  return (
    <>
      <span className="font-semibold text-ink-900">{v.cargoResumo}</span>
      <span className="block text-xs text-ink-500">{v.quantidade} pessoa(s) · {cvs} currículo(s)</span>
      {semCurriculo(v) && <span className="mt-0.5 inline-block rounded-pill bg-sunken px-2 py-0.5 text-xs font-semibold text-ink-700" data-testid="selo-sem-curriculo">Sem currículo · CapacitaRH</span>}
    </>
  );
}

function LinhaTabela({ v, agora }: { v: VagaDTO; agora: Date }) {
  const x = partes(v, agora);
  return (
    <tr data-testid="linha-da-vaga">
      <td className="align-top"><Codigo v={v} /></td>
      <td className="align-top whitespace-normal">{shortUnitName(v.unitName)}</td>
      <td className="align-top whitespace-normal"><Vagas v={v} cvs={x.cvs} /></td>
      <td className="align-top whitespace-normal">{x.motivos}</td>
      <td className="align-top whitespace-normal">{v.createdByName}<span className="block text-xs text-ink-500">{emBR(v.createdAt)}{x.aberta ? ` · aberta há ${x.dias} dia(s)` : ''}</span></td>
      <td className="align-top tabular-nums">{emBR(v.inicioDesejado)}</td>
      <td className="align-top whitespace-normal"><Andamento p={x.p} alertas={x.alertas} agora={agora.getTime()} extra={x.novos ? `${x.novos} currículo(s) novo(s) p/ o supervisor` : null} /></td>
    </tr>
  );
}

function CartaoDaVaga({ v, agora }: { v: VagaDTO; agora: Date }) {
  const x = partes(v, agora);
  return (
    <div className="sgo-panel sgo-panel--solid space-y-2 p-3" data-testid="cartao-da-vaga">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><Codigo v={v} /></div>
        <span className="text-xs text-ink-500">{shortUnitName(v.unitName)}</span>
      </div>
      <div><Vagas v={v} cvs={x.cvs} /></div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div><dt className="text-ink-500">Motivo</dt><dd className="text-ink-900">{x.motivos}</dd></div>
        <div><dt className="text-ink-500">Início</dt><dd className="tabular-nums text-ink-900">{emBR(v.inicioDesejado)}</dd></div>
        <div className="col-span-2"><dt className="text-ink-500">Solicitado</dt><dd className="text-ink-900">{v.createdByName} · {emBR(v.createdAt)}{x.aberta ? ` · aberta há ${x.dias} dia(s)` : ''}</dd></div>
      </dl>
      <Andamento p={x.p} alertas={x.alertas} agora={agora.getTime()} extra={x.novos ? `${x.novos} currículo(s) novo(s) p/ o supervisor` : null} />
    </div>
  );
}
