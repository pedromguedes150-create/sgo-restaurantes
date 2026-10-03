import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/hora-extra',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/ds/stat-card';
import { Table } from '@/components/ui/ds/table';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { StatusBadge as StatusBadgeLegado } from '@/components/ui/status-badge';
import { FilterBar, FilterSelect } from '@/components/ui/filter-bar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertasDaRede, IndicadoresDaRede, UnidadesHoje } from '@/components/dashboard/central-da-rede';
import { HoraExtraClient, type HoraExtraClientProps } from '@/components/hora-extra/hora-extra-client';
import { evolucaoMensal, porMotivo, porStatus, resumirHE, type HoraExtra } from '@/lib/hora-extra/calculo';

/**
 * FASE 4 DO KIT DE LAYOUT — as telas.
 *
 * Duas coisas se travam aqui. (1) Os PRIMITIVOS compartilhados (StatCard,
 * Table, StatusBadge, FilterBar, Card) passaram a emitir as classes do kit
 * sem mudar de API — é por eles que as ~90 telas não migradas uma a uma já
 * saem no padrão; se alguém "voltar" um deles ao Tailwind solto, metade do
 * sistema troca de cara sem ninguém mandar. (2) As duas telas do lote 1
 * (Dashboard e Hora extra) saem na hierarquia do kit: cabeçalho com abas,
 * KPIs, painéis com linhas, tabela densa — e dizem o MESMO que antes.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('primitivos compartilhados emitem o kit', () => {
  it('StatCard é o .sgo-kpi: cápsula no tom do estado, valor tabular, "–" quando não há dado', () => {
    const h = semSeparadores(renderToString(<StatCard label="Total" value="R$ 10,00" hint="apoio" tone="success" icon={Wallet} delta={12} />));
    expect(h).toContain('class="sgo-kpi min-w-0"');
    expect(h).toContain('sgo-kpi__ic sgo-kpi__ic--green');
    expect(h).toContain('<div class="sgo-kpi__label">Total</div>');
    expect(h).toContain('sgo-kpi__meta--up');
    const vazio = semSeparadores(renderToString(<StatCard label="X" value={null} />));
    expect(vazio).toContain('–');
    expect(vazio).not.toContain('sgo-kpi__ic');
  });

  it('Table é o painel + .sgo-tbl: numérica à direita (.r), rodapé de total, vazio com texto', () => {
    const h = semSeparadores(renderToString(
      <Table rows={[{ id: '1', n: 'a', v: 2 }]} getRowKey={(r) => r.id} footer={{ v: '2' }} columns={[
        { key: 'n', header: 'Nome', cell: (r) => r.n },
        { key: 'v', header: 'Valor', numeric: true, cell: (r) => r.v },
      ]} />,
    ));
    expect(h).toContain('class="sgo-panel max-h-[70vh] overflow-auto"');
    expect(h).toContain('<table class="sgo-tbl">');
    expect(h).toMatch(/<th scope="col" class="r">Valor<\/th>/);
    expect(h).toContain('<tfoot');
    const vazio = semSeparadores(renderToString(<Table rows={[]} getRowKey={() => ''} empty="Nada aqui." columns={[]} />));
    expect(vazio).toContain('class="sgo-panel"');
    expect(vazio).toContain('Nada aqui.');
  });

  it('StatusBadge (os dois) é o .sgo-tag no tom do kit — info é sky, brand é o accent (bordô)', () => {
    expect(renderToString(<StatusBadge tone="danger">Crítico</StatusBadge>)).toContain('class="sgo-tag sgo-tag--red"');
    expect(renderToString(<StatusBadge tone="info">Aprovada</StatusBadge>)).toContain('sgo-tag--sky');
    expect(renderToString(<StatusBadge tone="brand">Fila</StatusBadge>)).toContain('sgo-tag--blue');
    expect(renderToString(<StatusBadgeLegado tone="medium">Média</StatusBadgeLegado>)).toContain('sgo-tag sgo-tag--amber');
    expect(renderToString(<StatusBadgeLegado tone="black">Gravíssima</StatusBadgeLegado>)).toContain('bg-ink-900');
  });

  it('FilterBar é a linha .sgo-filtros (sem cartão), com contador e Limpar', () => {
    const h = semSeparadores(renderToString(
      <FilterBar active={1} onClear={() => {}} result={<>3 itens</>}>
        <FilterSelect label="Período" value="mes" onValueChange={() => {}} options={[{ value: 'mes', label: 'Mês' }]} />
      </FilterBar>,
    ));
    expect(h).toContain('class="sgo-filtros -mx-4 items-end"');
    expect(h).toContain('<span class="sgo-count">1</span>');
    expect(h).toContain('Limpar');
    expect(h).toContain('3 itens');
    expect(h).not.toContain('rounded-card');
  });

  it('Card (ui/card) é o .sgo-panel e o título é .sgo-panel__title', () => {
    const h = semSeparadores(renderToString(<Card><CardHeader><CardTitle>T</CardTitle></CardHeader><CardContent>c</CardContent></Card>));
    expect(h).toContain('class="sgo-panel text-ink-900"');
    expect(h).toContain('class="sgo-panel__title"');
  });
});

describe('Dashboard no kit', () => {
  it('indicadores viram KPIs-link no tom da gravidade; a cápsula padrão é a marca', () => {
    const h = semSeparadores(renderToString(<IndicadoresDaRede indicadores={[
      { id: 'tarefas', titulo: 'Tarefas', valor: '82%', detalhe: '6 atrasadas', href: '/tarefas?filter=atrasadas', tom: 'critico', icone: 'tarefas' },
      { id: 'oleo', titulo: 'Óleo', valor: '120 L', detalhe: 'no mês', href: '/modulos/oleo', tom: 'ok', icone: 'oleo' },
    ]} />));
    expect(h).toContain('class="sgo-kpis grid-cols-2 md:grid-cols-4"');
    expect(h).toMatch(/<a class="sgo-kpi[^"]*"[^>]*href="\/tarefas\?filter=atrasadas"/);
    expect(h).toContain('sgo-kpi__ic sgo-kpi__ic--red');
    expect(h).toContain('sgo-kpi__ic sgo-kpi__ic--blue');
    expect(h).toContain('sgo-kpi__meta sgo-kpi__meta--down');
    expect(h).not.toMatch(/\b(bg|text|border|ring)-info\b/);
  });

  it('alertas: painel com contador vermelho e linhas .sgo-row com selo; vazio diz "Tudo em dia"', () => {
    const h = semSeparadores(renderToString(<AlertasDaRede alertas={[
      { id: 'a', gravidade: 'critico', rotulo: 'Ocorrência', unidade: 'Beija Flor Centro', problema: '2 críticas abertas', quando: 'há 3 dias', acao: 'Encerrar', href: '/modulos/ocorrencias' },
      { id: 'b', gravidade: 'ok', rotulo: 'Pagamento', unidade: null, problema: '1 a aprovar', quando: null, acao: 'Aprovar', href: '/modulos/pagamentos' },
    ]} />));
    expect(h).toContain('Precisa da sua atenção');
    expect(h).toContain('class="sgo-count sgo-count--red">2<');
    expect(h).toContain('class="sgo-row group');
    expect(h).toContain('sgo-ric sgo-ric--red');
    expect(h).toContain('sgo-ric sgo-ric--blue');
    expect(h).toContain('sgo-tag sgo-tag--red');
    expect(h).toContain('há 3 dias');
    expect(semSeparadores(renderToString(<AlertasDaRede alertas={[]} />))).toContain('Tudo em dia');
  });

  it('unidades hoje: painel com uma linha por unidade e o rótulo em palavra', () => {
    const h = semSeparadores(renderToString(<UnidadesHoje unidades={[
      { unitId: 'u1', nome: 'Beija Flor Centro', tarefasPct: 40, atrasadas: 3, ocorrenciasAbertas: 0, pendencias: 2, tom: 'critico' },
    ]} />));
    expect(h).toContain('Unidades hoje');
    expect(h).toContain('href="/tarefas?unidade=u1"');
    expect(h).toContain('Tarefas 40% · 3 atrasada(s) · 2 pendente(s)');
    expect(h).toContain('>Crítico<');
  });
});

const he = (over: Partial<HoraExtra> = {}): HoraExtra => ({
  id: 'h1', unitId: 'u1', unidade: 'Beija Flor Centro', collaboratorId: 'c1', colaborador: 'Vera Lúcia', matricula: '1234', cpf: '09494305604',
  dia: '2026-09-15', inicio: '18:00', fim: '21:00', horas: 3, valorHora: 15, vt: 0, valor: 45, motivoId: 'm1', motivo: 'Escala incompleta', detalhe: null,
  status: 'PAID', solicitante: 'Ger', aprovador: 'Sup', motivoReprovacao: null, criadoEm: '2026-09-16T10:00:00.000Z', ...over,
});
const hes = [he(), he({ id: 'h2', status: 'PENDING', valor: 30 })];
const props = (over: Partial<HoraExtraClientProps> = {}): HoraExtraClientProps => ({
  filtro: { aba: 'dashboard', periodo: 'mes', status: 'TODOS', motivo: '', q: '' },
  periodo: { de: '2026-09-01', ate: '2026-09-30', rotulo: 'setembro de 2026' },
  hes, resumo: resumirHE(hes), motivos: porMotivo(hes), status: porStatus(hes), evolucao: evolucaoMensal(hes, ['2026-09']),
  unidades: [{ id: 'u1', name: 'Beija Flor Centro' }], motivosCatalogo: [{ id: 'm1', name: 'Escala incompleta' }], semVinculo: [],
  form: { units: [], collaboratorsByUnit: {}, overtimeRatesByUnit: {} },
  podeLancar: true, podeFechar: true, podeVincular: true, isAdmin: true, ...over,
});

describe('Hora extra no kit', () => {
  it('cabeçalho do kit com as três abas (a ativa pelo ?aba=, com selo de pendentes) e as ações como .sgo-btn', () => {
    const h = semSeparadores(renderToString(<HoraExtraClient {...props()} />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Hora extra</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-dashboard"/);
    expect(h).toMatch(/class="sgo-phdr__tab" [^>]*data-testid="aba-solicitacoes"/);
    expect(h).toContain('<span class="sgo-navbadge">1</span>');
    expect(h).toContain('class="sgo-btn sgo-btn--primary"');
    expect(h).toContain('Exportar xlsx');
    /* As abas trocam só o ?aba= — o filtro vai junto. */
    expect(h).toContain('href="/modulos/hora-extra?aba=solicitacoes"');
  });

  it('dashboard: KPIs do kit, filtros na linha do kit, painéis com cabeçalho e barras', () => {
    const h = semSeparadores(renderToString(<HoraExtraClient {...props()} />));
    expect(h).toContain('class="sgo-kpis grid-cols-2 md:grid-cols-3 lg:grid-cols-6"');
    expect(h).toContain('<div class="sgo-kpi__label">Total pago</div>');
    expect(h).toContain('class="sgo-filtros');
    expect(h).toContain('<div class="sgo-panel__title">Comparativo por motivo</div>');
    expect(h).toContain('role="progressbar"');
    expect(h).toContain('Status das solicitações');
  });

  it('solicitações: tabela densa do kit, selo por status e NENHUM aprovar/reprovar', () => {
    const h = semSeparadores(renderToString(<HoraExtraClient {...props({ filtro: { aba: 'solicitacoes', periodo: 'mes', status: 'TODOS', motivo: '', q: '' } })} />));
    expect(h).toContain('<table class="sgo-tbl">');
    expect(h).toContain('sgo-tag sgo-tag--green">Paga<');
    expect(h).toContain('sgo-tag sgo-tag--amber">Pendente<');
    expect(h).not.toMatch(/>\s*Aprovar\s*</);
    expect(h).not.toMatch(/>\s*Reprovar\s*</);
    /* Modal de criar e painel de detalhe nascem fechados (portal só no cliente). */
    expect(h).not.toContain('sgo-modal__hdr');
    expect(h).not.toContain('sgo-drawer__plume');
  });
});
