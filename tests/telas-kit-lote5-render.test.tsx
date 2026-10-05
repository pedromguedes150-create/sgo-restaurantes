import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/manutencao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { MaintenanceClient } from '@/components/maintenance/maintenance-client';
import { CertificatesClient } from '@/components/certificates/certificates-client';
import { OilClient } from '@/components/oil/oil-client';
import { SupervisionClient } from '@/components/supervisor/supervision-client';

/**
 * FASE 4 DO KIT — lote 5: os clientes com abas de ESTADO (Manutenção,
 * Atestados, Óleo, Supervisão; Troco e Gás têm testes próprios) ganharam o
 * cabeçalho do kit. O que se trava: título do kit, a aba ativa com
 * aria-current, e as abas que a permissão esconde continuam escondidas.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const ver = { canView: true, canEdit: true };
const nao = { canView: false, canEdit: false };
const reportVazio = { totals: { count: 0, days: 0, collaborators: 0, absenteeismPct: 0, headcount: 0 }, byUnit: [], ranking: [], monthlyTrend: [], byWeekday: [], byType: [] } as never;

describe('Manutenção no kit', () => {
  it('título do kit (o h1 solto saiu) com Chamados / Preventiva; Preventiva some sem permissão', () => {
    const base = { view: 'chamados' as const, isAdmin: true, units: [], equipment: [], suppliers: [], summary: { open: 0, inProgress: 0, late: 0, monthDone: 0, monthCost: 0 } as never, tickets: [], plans: [] };
    const h = semSeparadores(renderToString(<MaintenanceClient {...base} abas={{ chamados: ver, preventiva: ver } as never} />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Manutenção</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-chamados"/);
    expect(h).toContain('data-testid="aba-preventiva"');
    const so = semSeparadores(renderToString(<MaintenanceClient {...base} abas={{ chamados: ver, preventiva: nao } as never} />));
    expect(so).not.toContain('data-testid="aba-preventiva"');
  });
});

describe('Atestados no kit', () => {
  it('Lançar / Histórico / Painel como abas do cabeçalho; sem canLaunch a aba Lançar não existe', () => {
    const base = { isAdmin: true, showCid: true, ym: '2026-10', units: [{ id: 'u1', name: 'Centro' }], collaboratorsByUnit: {}, rows: [], report: reportVazio, subtitulo: 'x' };
    const h = semSeparadores(renderToString(<CertificatesClient {...base} canLaunch abas={{ lancar: ver, historico: ver, painel: ver } as never} />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Central de Atestados</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-lancar"/);
    const sem = semSeparadores(renderToString(<CertificatesClient {...base} canLaunch={false} abas={{ lancar: ver, historico: ver, painel: ver } as never} />));
    expect(sem).not.toContain('data-testid="aba-lancar"');
    expect(sem).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-painel"/);
  });
});

describe('Óleo e Supervisão no kit', () => {
  it('Óleo: Lançar coleta / Dashboard / Histórico no cabeçalho', () => {
    const h = semSeparadores(renderToString(
      <OilClient canLaunch isAdmin meuNome="Ana" dias={30} units={[{ id: 'u1', name: 'Centro' }]} suppliers={[]} dashboard={{ porUnidade: [], porForma: [], mensal: [], totalLitros: 0, totalValor: 0 } as never} rows={[]} abas={{ lancar: ver, painel: ver, historico: ver } as never} subtitulo="x" />,
    ));
    expect(h).toContain('<h1 class="sgo-phdr__title">Coleta de Óleo</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-lancar"/);
    expect(h).toContain('data-testid="aba-historico"');
  });

  it('Supervisão: Painel de uso / Visitas & Feedbacks no cabeçalho, com a ação da página à direita', () => {
    const h = semSeparadores(renderToString(
      <SupervisionClient usage={[]} yearMonth="2026-10" months={['2026-10']} board={{ upcoming: [], history: [], month: { done: 0, planned: 0, overdue: 0 } }} units={[]} checklists={[]} plans={[]} canOperate isAdmin abas={{ PAINEL: ver, VISITAS: ver } as never} subtitulo="x" acoes={<a className="sgo-btn" href="/modulos/painel-unidade">Painel</a>} />,
    ));
    expect(h).toContain('<h1 class="sgo-phdr__title">Rotina do Supervisor</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-painel"/);
    expect(h).toContain('data-testid="aba-visitas"');
    expect(h).toContain('href="/modulos/painel-unidade"');
  });
});
