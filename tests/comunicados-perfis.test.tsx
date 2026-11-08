import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/comunicacao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { CommunicationsClient } from '@/components/communications/communications-client';
import { CommunicationEdit } from '@/components/communications/communication-edit';
import { normalizarPerfis, PERFIS_DESTINATARIOS, PERFIS_PADRAO, rotuloDaPessoa, rotuloDosPerfis, OPCOES_DE_PERFIL } from '@/lib/communications/publico';

/**
 * COMUNICADOS POR PERFIL (v1.195.0) — "uma mensagem que mando para o gerente,
 * o separador ver também não é viável" (Pedro, 08/11).
 */
describe('os perfis que recebem', () => {
  it('padrão Gerente (o comportamento de sempre); vazio ou inválido cai no padrão', () => {
    expect(normalizarPerfis(undefined)).toEqual(['MANAGER']);
    expect(normalizarPerfis([])).toEqual(['MANAGER']);
    expect(normalizarPerfis(['ADMIN', 'CEO', 'banana'])).toEqual(['MANAGER']); // Admin/CEO não são alvo por unidade
    expect(PERFIS_PADRAO).toEqual(['MANAGER']);
  });
  it('aceita os perfis da operação, sem repetir e na ordem fixa', () => {
    expect(normalizarPerfis(['SEPARATOR', 'MANAGER', 'MANAGER', 'COORDINATOR'])).toEqual(['MANAGER', 'COORDINATOR', 'SEPARATOR']);
    expect(PERFIS_DESTINATARIOS).not.toContain('ADMIN');
    expect(PERFIS_DESTINATARIOS).not.toContain('CEO');
    expect(OPCOES_DE_PERFIL.find((o) => o.value === 'SEPARATOR')?.label).toBe('Separador CD');
  });
  it('rótulos em português: perfis e pessoa com o perfil ao lado do nome', () => {
    expect(rotuloDosPerfis(['MANAGER', 'COORDINATOR'])).toBe('Gerente · Coordenador');
    expect(rotuloDaPessoa({ name: 'Ana Silva', role: 'SEPARATOR' })).toBe('Ana Silva · Separador CD');
  });
});

describe('as telas', () => {
  const units = [{ id: 'u1', name: 'Centro' }];
  const people = [{ id: 'p1', name: 'João Separa', role: 'SEPARATOR' }, { id: 'p2', name: 'Maria Gerente', role: 'MANAGER' }];
  const semMarcadores = (h: string) => h.split('<!-- -->').join('');

  it('criar: a tela monta e o formulário (recolhido atrás de "+ Novo") pergunta QUEM recebe, com Gerente por padrão e o perfil ao lado de cada pessoa', () => {
    const html = semMarcadores(renderToString(React.createElement(CommunicationsClient, {
      canAuthor: true, isAdmin: true, weight: 0, units, people, inbox: [], authored: [], abas: {} as never,
    })));
    expect(html).toContain('Comunica'); // montou
    const src = readFileSync('src/components/communications/communications-client.tsx', 'utf8');
    expect(src).toContain('data-testid="perfis-destinatarios"');
    expect(src).toContain('Quem recebe nas unidades escolhidas');
    expect(src).toContain('useState<string[]>([...PERFIS_PADRAO])'); // Gerente por padrão
    expect(src).toContain("fd.set('roles', JSON.stringify(roles))");
    expect(src).toContain('label: rotuloDaPessoa(p)'); // "Nome · Perfil"
    expect(src).not.toContain('todos os gerentes confirmam');
    expect(rotuloDaPessoa(people[0])).toBe('João Separa · Separador CD');
  });
  it('editar: comunicado antigo sem perfis gravados abre com Gerente; com perfis, abre com eles; e os perfis vão no corpo', () => {
    const base = { title: 'T', body: 'B', priority: 'NORMAL', requiresResponse: false, pinned: false, dueAt: new Date().toISOString(), links: [], unitIds: ['u1'], extraUserIds: [], confirmedCount: 0, total: 1 };
    const antigo = semMarcadores(renderToString(React.createElement(CommunicationEdit, { id: 'c1', initial: base, units, people })));
    expect(antigo).toContain('Editar'); // montou (o formulário abre só ao tocar)
    const src = readFileSync('src/components/communications/communication-edit.tsx', 'utf8');
    expect(src).toContain('data-testid="perfis-destinatarios"');
    expect(src).toContain("initial.roles?.length ? initial.roles : [...PERFIS_PADRAO]");
    expect(src).toContain('unitIds, roles, extraUserIds: extraIds,');
  });
  it('o servidor filtra pelos perfis gravados em todo caminho (criar, editar e pré-preencher a edição)', () => {
    for (const f of ['create.ts', 'update.ts', 'query.ts']) {
      const src = readFileSync(`src/lib/communications/${f}`, 'utf8');
      expect(src, f).not.toMatch(/role: 'MANAGER'/);
      expect(src, f).toMatch(/role: \{ in: /);
    }
  });
});
