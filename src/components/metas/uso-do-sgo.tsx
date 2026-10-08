import { Activity, Users, ListChecks, MousePointerClick, AlertTriangle, Download, Printer } from 'lucide-react';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { Legenda, Rosca } from '@/components/metas/graficos-metas';
import { COR_FAIXA } from '@/lib/metas/graficos';
import { faixaDeUso, rotuloDoModulo, ROTULO_FAIXA_USO, taxaDeFalha, type UnidadeUso, type UsuarioUso } from '@/lib/metas/uso-calculo';
import type { UsoDoSgo } from '@/lib/metas/uso';
import { shortUnitName } from '@/lib/unit-name';

const br = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

/**
 * Aba "Uso do SGO" (v1.164.0): relatório executivo de quem usa o sistema —
 * rede por unidade e usuário por usuário — para a bonificação dos gerentes.
 * Renderizado no servidor; Excel e PDF usam a mesma leitura (`getUsoDoSgo`).
 */
export function UsoDoSgoView({ dados, mesLabel }: { dados: UsoDoSgo; mesLabel: string }) {
  const r = dados.resumo;
  const exportHref = `/api/metas/uso/export?month=${dados.yearMonth}`;
  const pdfHref = `/modulos/metas/uso/relatorio?month=${dados.yearMonth}&imprimir=1`;
  return (
    <div className="space-y-4" data-testid="uso-do-sgo">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-ink-700">Quem usa o SGO em {mesLabel}: por unidade e por usuário. Base para a bonificação — só leitura, mesmas contas do painel do supervisor, das tarefas e da Auditoria.</p>
        <span className="flex gap-1.5">
          <a className="sgo-btn sgo-btn--sm" href={exportHref}><Download className="h-4 w-4" /> Excel</a>
          <a className="sgo-btn sgo-btn--sm" href={pdfHref} target="_blank" rel="noreferrer"><Printer className="h-4 w-4" /> PDF</a>
        </span>
      </div>

      <SgoKpis>
        <SgoKpi label="Uso médio da rede" value={pct(r.mediaUso)} meta="checklists · desperdício · comandas" icon={Activity} tone={r.mediaUso == null ? 'gray' : r.mediaUso >= 80 ? 'green' : r.mediaUso >= 50 ? 'amber' : 'red'} testId="kpi-uso-medio" />
        <SgoKpi label="Usuários ativos" value={`${r.usuariosAtivos} de ${dados.usuarios.length}`} meta={`${r.usuariosSemUso.length} sem nenhuma ação no mês`} metaTone={r.usuariosSemUso.length ? 'warn' : undefined} icon={Users} tone={r.usuariosSemUso.length ? 'amber' : 'green'} testId="kpi-usuarios" />
        <SgoKpi label="Ações no sistema" value={r.totalAcoes.toLocaleString('pt-BR')} meta={`${r.totalAcessos.toLocaleString('pt-BR')} acesso(s)`} icon={MousePointerClick} tone="blue" testId="kpi-acoes" />
        <SgoKpi label="Tarefas no prazo" value={pct(r.tarefas.pctNoPrazo)} meta={`${r.tarefas.done} no prazo · ${r.tarefas.late} fora · ${r.tarefas.missed} não feitas`} icon={ListChecks} tone={r.tarefas.pctNoPrazo == null ? 'gray' : r.tarefas.pctNoPrazo >= 80 ? 'green' : 'amber'} testId="kpi-tarefas" />
      </SgoKpis>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <PanelHeader title="Unidades por faixa de uso" icon={<span className="sgo-panel__ic sgo-panel__ic--green" aria-hidden><Activity className="h-4 w-4" /></span>} />
          <div className="flex items-center gap-4 p-4" data-testid="rosca-uso">
            <Rosca fatias={r.porFaixa.map((f) => ({ rotulo: ROTULO_FAIXA_USO[f.faixa], valor: f.qtd, cor: COR_FAIXA[f.faixa], detalhe: f.unidades.map(shortUnitName).join(', ') }))} centro={r.unidades} sub="unidades" />
            <Legenda itens={r.porFaixa.map((f) => ({ cor: COR_FAIXA[f.faixa], rotulo: ROTULO_FAIXA_USO[f.faixa], valor: f.qtd }))} />
          </div>
        </Card>
        <Card>
          <PanelHeader title="Destaques do mês" icon={<span className="sgo-panel__ic sgo-panel__ic--amber" aria-hidden><AlertTriangle className="h-4 w-4" /></span>} />
          <ul className="space-y-2 p-4 text-sm" data-testid="destaques">
            <li><b>Unidade que mais usa:</b> {r.unidadeMaisUsa ? `${shortUnitName(r.unidadeMaisUsa.unitName)} (${r.unidadeMaisUsa.usagePct}% de uso · ${r.unidadeMaisUsa.acoes} ações)` : '—'}</li>
            <li><b>Unidade que menos usa:</b> {r.unidadeMenosUsa ? `${shortUnitName(r.unidadeMenosUsa.unitName)} (${r.unidadeMenosUsa.usagePct}% de uso · ${r.unidadeMenosUsa.acoes} ações)` : '—'}</li>
            <li><b>Mais deixa de fazer:</b> {r.unidadeMaisDeixaDeFazer ? `${shortUnitName(r.unidadeMaisDeixaDeFazer.unitName)} (${r.unidadeMaisDeixaDeFazer.missed} tarefa(s) não realizada(s) · ${r.unidadeMaisDeixaDeFazer.taxa}%)` : 'nenhuma tarefa não realizada'}</li>
            <li><b>Mais erra o prazo:</b> {r.unidadeMaisErra ? `${shortUnitName(r.unidadeMaisErra.unitName)} (${r.unidadeMaisErra.taxa}% das tarefas fora do prazo ou não feitas)` : 'nenhuma'}</li>
            <li><b>Usuário que mais usa:</b> {r.maisUsam[0] ? `${r.maisUsam[0].name} (${r.maisUsam[0].acoes} ações · ${r.maisUsam[0].tarefasConcluidas} tarefas)` : '—'}</li>
            <li><b>Sem nenhuma ação no mês:</b> {r.usuariosSemUso.length ? r.usuariosSemUso.map((u) => u.name).join(', ') : 'ninguém'}</li>
          </ul>
        </Card>
      </div>

      <Card>
        <PanelHeader title="Rede, unidade por unidade" count={dados.unidades.length} icon={<span className="sgo-panel__ic sgo-panel__ic--blue" aria-hidden><Activity className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          <TabelaUnidades unidades={dados.unidades} />
        </div>
      </Card>

      <Card>
        <PanelHeader title="Usuário por usuário" count={dados.usuarios.length} icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><Users className="h-4 w-4" /></span>} />
        <div className="overflow-x-auto p-2">
          <TabelaUsuarios usuarios={dados.usuarios} />
        </div>
        <p className="px-4 pb-3 text-xs text-ink-500">Ações = registros na Auditoria no mês (lançamentos, conclusões, aprovações…), sem login. Tarefas = checklists concluídos por esse usuário. Gerentes, coordenadores e supervisores das unidades do seu alcance.</p>
      </Card>
    </div>
  );
}

export function TabelaUnidades({ unidades }: { unidades: UnidadeUso[] }) {
  return (
    <table className="sgo-tbl w-full text-sm" data-testid="tabela-unidades-uso">
      <thead><tr><th className="text-left">#</th><th className="text-left">Unidade</th><th className="text-right">Uso</th><th className="text-right">Checklists</th><th className="text-right">Desperdício</th><th className="text-right">Comandas</th><th className="text-right">No prazo</th><th className="text-right">Fora</th><th className="text-right">Não feitas</th><th className="text-right">Falhas</th><th className="text-right">Ações</th><th className="text-right">Usuários</th><th className="text-right">Meta</th></tr></thead>
      <tbody>
        {unidades.map((u, i) => (
          <tr key={u.unitId}>
            <td className="tabular-nums text-ink-500">{i + 1}</td>
            <td className="whitespace-nowrap font-medium">{shortUnitName(u.unitName)}</td>
            <td className="text-right font-bold tabular-nums" style={{ color: COR_FAIXA[faixaDeUso(u.usagePct)] }}>{u.usagePct}%</td>
            <td className="text-right tabular-nums">{u.checklistPct}%</td>
            <td className="text-right tabular-nums">{u.wastePct}%</td>
            <td className="text-right tabular-nums">{u.commandsPct}%</td>
            <td className="text-right tabular-nums">{u.done}</td>
            <td className="text-right tabular-nums">{u.late}</td>
            <td className="text-right tabular-nums">{u.missed ? <span className="font-semibold text-danger">{u.missed}</span> : 0}</td>
            <td className="text-right tabular-nums">{pct(taxaDeFalha(u))}</td>
            <td className="text-right tabular-nums">{u.acoes}</td>
            <td className="text-right tabular-nums">{u.usuariosAtivos}/{u.usuariosVinculados}</td>
            <td className="text-right tabular-nums">{u.metaPct}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TabelaUsuarios({ usuarios }: { usuarios: UsuarioUso[] }) {
  return (
    <table className="sgo-tbl w-full text-sm" data-testid="tabela-usuarios-uso">
      <thead><tr><th className="text-left">#</th><th className="text-left">Usuário</th><th className="text-left">Perfil</th><th className="text-left">Unidade(s)</th><th className="text-right">Acessos</th><th className="text-right">Ações</th><th className="text-left">Módulos mais usados</th><th className="text-right">Tarefas</th><th className="text-right">Fora do prazo</th><th className="text-left">Último acesso</th></tr></thead>
      <tbody>
        {usuarios.map((u, i) => (
          <tr key={u.userId} className={u.acoes === 0 ? 'text-ink-500' : undefined}>
            <td className="tabular-nums text-ink-500">{i + 1}</td>
            <td className="whitespace-nowrap font-medium text-ink-900">{u.name}{u.acoes === 0 && <span className="sgo-tag sgo-tag--red ml-2">Sem uso</span>}</td>
            <td className="whitespace-nowrap">{u.roleLabel}</td>
            <td>{u.unidades.map(shortUnitName).join(', ') || '—'}</td>
            <td className="text-right tabular-nums">{u.acessos}</td>
            <td className="text-right font-bold tabular-nums">{u.acoes}</td>
            <td>{u.modulos.slice(0, 3).map(rotuloDoModulo).join(', ') || '—'}</td>
            <td className="text-right tabular-nums">{u.tarefasConcluidas}</td>
            <td className="text-right tabular-nums">{u.foraDoPrazo ? <span className="text-warning">{u.foraDoPrazo}</span> : 0}</td>
            <td className="whitespace-nowrap">{br(u.ultimoAcesso)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
