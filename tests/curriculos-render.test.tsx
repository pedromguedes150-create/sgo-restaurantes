import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/curriculos',
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { CurriculosClient, type CurriculoUI } from '@/components/curriculos/curriculos-client';
import { CargosAdmin } from '@/components/curriculos/cargos-admin';

/** CENTRAL DE CURRÍCULOS (v1.212.0) — a tela do gerente. */
const sem = (h: string) => h.replace(/<!--[\s\S]*?-->/g, '');
const linha = (over: Partial<CurriculoUI> = {}): CurriculoUI => ({
  id: 'c1', unidade: 'Moreira', candidateName: 'Maria da Silva', phone: '31999990001', jobTitleName: 'Auxiliar de Cozinha', attachmentMime: 'application/pdf',
  note: null, status: 'RECEBIDO', statusNote: null, statusAt: '2026-11-18T12:00:00.000Z', interviewAt: null, rhReadAt: null, createdByName: 'Ana', createdAt: '2026-11-18T12:00:00.000Z', ...over,
});
const base = {
  linhas: [linha(), linha({ id: 'c2', candidateName: 'João Souza', status: 'ENTREVISTA_AGENDADA', interviewAt: '2026-11-25T17:00:00.000Z' })],
  total: 2,
  indicadores: { recebidos: 2, analise: 1, entrevista: 1, aprovado: 0, contratado: 0, encerrado: 0 },
  units: [{ id: 'u1', name: 'Moreira' }], unidadeInicial: 'u1',
  cargos: [{ id: 'k1', name: 'Auxiliar de Cozinha' }], cargosDaLista: ['Auxiliar de Cozinha'],
  filtros: { faixa: 'todos' as const, q: '', cargo: '' },
  podeEncaminhar: true, podeConfigurar: false, visaoRede: false, rhConectado: false, abrirId: null,
};

describe('Central de Currículos', () => {
  it('mostra os cinco indicadores, a lista com a situação em texto e o botão de encaminhar', () => {
    const h = sem(renderToString(<CurriculosClient {...base} />));
    for (const t of ['kpi-recebidos', 'kpi-analise', 'kpi-entrevista', 'kpi-aprovado', 'kpi-contratado']) expect(h).toContain(`data-testid="${t}"`);
    expect(h).toContain('Maria da Silva');
    expect(h).toContain('Recebido');
    expect(h).toContain('Entrevista agendada');
    expect(h).toContain('data-testid="novo-encaminhamento"');
    expect(h).toContain('/modulos/curriculos?faixa=entrevista');
  });
  it('enquanto o RH não conversou com a central, a tela diz isso em vez de simular andamento', () => {
    expect(sem(renderToString(<CurriculosClient {...base} />))).toContain('O RH ainda não está conectado a esta central');
    expect(sem(renderToString(<CurriculosClient {...base} rhConectado />))).not.toContain('O RH ainda não está conectado');
  });
  it('quem só consulta não vê o botão de encaminhar; lista vazia explica o que fazer', () => {
    const h = sem(renderToString(<CurriculosClient {...base} podeEncaminhar={false} linhas={[]} total={0} />));
    expect(h).not.toContain('data-testid="novo-encaminhamento"');
    expect(h).toContain('Nenhum currículo encaminhado ainda');
  });
  it('a tela NÃO tem controle para o gerente mudar a situação, nem chama rota que mude', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/curriculos/curriculos-client.tsx'), 'utf8');
    expect(fonte).not.toMatch(/method:\s*'(PATCH|PUT|DELETE)'/);
    expect(fonte.match(/fetch\(/g)?.length).toBe(2); // encaminhar (POST) e ler a linha do tempo (GET)
    expect(fonte).toContain("fetch('/api/curriculos', { method: 'POST'");
  });
  it('a câmera e o seletor de arquivo são dois caminhos; só PDF, JPG e PNG', () => {
    const fonte = readFileSync(join(process.cwd(), 'src/components/curriculos/curriculos-client.tsx'), 'utf8');
    expect(fonte).toContain('accept="image/jpeg,image/png" capture="environment"');
    expect(fonte).toContain('accept="application/pdf,image/jpeg,image/png"');
  });
});

describe('Cargos do encaminhamento (Configurações)', () => {
  it('lista os cargos com a situação; só quem pode editar vê adicionar/desativar', () => {
    const cargos = [{ id: 'k1', name: 'Cozinheiro', active: true }, { id: 'k2', name: 'Pizzaiolo', active: false }];
    const h = sem(renderToString(<CargosAdmin cargos={cargos} podeEditar />));
    expect(h).toContain('Cozinheiro');
    expect(h).toContain('Inativo');
    expect(h).toContain('Adicionar');
    expect(sem(renderToString(<CargosAdmin cargos={cargos} podeEditar={false} />))).not.toContain('Adicionar');
  });
});

describe('o arquivo do currículo não sai pela rota genérica de uploads', () => {
  it('/uploads recusa a pasta privada', () => {
    const rota = readFileSync(join(process.cwd(), 'src/app/uploads/[...path]/route.ts'), 'utf8');
    expect(rota).toContain("segs[0] === '_privado'");
  });
});
