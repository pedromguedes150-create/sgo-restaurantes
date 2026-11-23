import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => '/modulos/comandas' }));

import { CommandsClient } from '@/components/commands/commands-client';
import { IniciarConferencia } from '@/components/commands/iniciar-conferencia';
import { MODULES } from '@/lib/permissions';
import { moduleOfPath } from '@/lib/permissions/route-guard';

/**
 * v1.220.0 — UMA conferência de comandas.
 *
 * Relato (23/11): a gerente conferiu nos dias 21 e 22 e a tela seguia mostrando
 * o dia 20. Havia três portas (Iniciar conferência · leitor antigo · grade
 * antiga) e só a primeira criava o registro que o Histórico lê. As outras duas
 * saem da tela; o histórico passa a mostrar também o que elas gravaram.
 */

const html = (el: React.ReactElement) => renderToString(el).split('<!-- -->').join('');

describe('a tela de Comandas tem um caminho só', () => {
  it('a grade antiga, o atalho "Todas presentes" e o "informar ausentes" não aparecem; as divergências continuam', () => {
    const h = html(React.createElement(CommandsClient, {
      unitId: 'u1', canResolve: true, isAdmin: false, hasConfig: true, todayDone: true,
      activeNumbers: [1, 2, 3], openDivergences: [{ id: 'd1', number: 2, status: 'OPEN', observation: null, reporter: null }],
    } as React.ComponentProps<typeof CommandsClient>));
    expect(h).not.toContain('Conferência em grade');
    expect(h).not.toContain('Todas presentes');
    expect(h).not.toContain('Informar ausentes manualmente');
    expect(h).toContain('Divergências em aberto (1)');
    expect(h).toContain('Iniciar nova conferência');
  });

  it('o botão "Conferir com leitor" saiu da tela e o endereço antigo só redireciona', () => {
    const pagina = readFileSync('src/app/(app)/modulos/comandas/page.tsx', 'utf8');
    expect(pagina).not.toContain('Conferir com leitor');
    expect(pagina).not.toContain('/modulos/comandas/conferencia?');
    const antiga = readFileSync('src/app/(app)/modulos/comandas/conferencia/page.tsx', 'utf8');
    expect(antiga).toContain("redirect(");
    expect(antiga).not.toContain('ScanClient');
  });

  it('a tela antiga não tem mais endereço próprio no menu: é do módulo Comandas', () => {
    expect(MODULES.find((m) => m.key === 'COMMANDS_SCAN')?.nav).toBeUndefined();
    expect(moduleOfPath('/modulos/comandas/conferencia')).toBe('COMMANDS');
    expect(readFileSync('src/lib/nav/areas.ts', 'utf8')).not.toContain('COMMANDS_SCAN');
  });
});

describe('conferência que ficou aberta de outro dia', () => {
  const base = { unitId: 'u1', ultima: null, faixaDoDia: [1, 2, 3] };

  it('avisa em que dia o resultado vai cair e oferece cancelar para começar a de hoje', () => {
    const h = html(React.createElement(IniciarConferencia, { ...base, emAndamento: { id: 's1', quando: '20/11/2026 23:10', vistas: 120, total: 300, deOutroDia: '20/11/2026' } }));
    expect(h).toContain('data-testid="aviso-outro-dia"');
    expect(h).toContain('20/11/2026');
    expect(h).toContain('não no de hoje');
    expect(h).toContain('Cancelar e começar a de hoje');
    expect(h).toContain('Continuar conferência');
  });

  it('a de hoje segue como antes: só continuar, sem aviso', () => {
    const h = html(React.createElement(IniciarConferencia, { ...base, emAndamento: { id: 's1', quando: '23/11/2026 01:10', vistas: 5, total: 300, deOutroDia: null } }));
    expect(h).not.toContain('aviso-outro-dia');
    expect(h).not.toContain('Cancelar e começar a de hoje');
    expect(h).toContain('Continuar conferência');
  });
});

describe('fonte: o histórico mostra todos os dias', () => {
  it('lê também as contagens sem conferência e mostra o DIA de cada linha', () => {
    const pagina = readFileSync('src/app/(app)/modulos/comandas/conferencias/page.tsx', 'utf8');
    expect(pagina).toContain('listarContagensDiretas');
    expect(pagina).toContain('linha-contagem-direta');
    expect(pagina).toContain('dia(l.operationalDate)');
    const lib = readFileSync('src/lib/commands/sessao.ts', 'utf8');
    expect(lib).toMatch(/listarContagensDiretas[\s\S]*sessionId: null/);
    expect(lib).toMatch(/listarContagensDiretas[\s\S]*unitScopeWhere\(user, 'unitId'\)/);
  });

  it('o cartão "Última conferência" usa a data da última contagem, venha de onde vier', () => {
    const pagina = readFileSync('src/app/(app)/modulos/comandas/page.tsx', 'utf8');
    expect(pagina).toContain('ultimaContagem?.operationalDate');
  });
});
