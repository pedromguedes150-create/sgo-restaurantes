import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/minha-area',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { CommunicationsClient } from '@/components/communications/communications-client';
import { ManagerAreaClient } from '@/components/manager-area/manager-area-client';
import { TerminationsClient } from '@/components/terminations/terminations-client';

/**
 * FASE 4 DO KIT — lote 6: Comunicação, Minha área e Desligamentos ganharam
 * o cabeçalho do kit com as abas de ESTADO. O que se trava: o título do kit,
 * a aba ativa, o crachá de pendentes (Comunicação) e que aba fechada na
 * matriz continua fora.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const ver = { canView: true, canEdit: true };
const nao = { canView: false, canEdit: false };

describe('Central de Comunicação no kit', () => {
  it('Recebidos (com o nº de pendentes) / Novo comunicado / Painel & Histórico no cabeçalho', () => {
    const inbox = [{ id: 'i1', title: 'Aviso', body: '', priority: 'NORMAL', pinned: false, requiresReply: false, status: 'PENDING', dueAt: null, sentAt: '2026-10-01T10:00:00.000Z', authorName: 'Ana', attachments: [], links: [] }] as never;
    const h = semSeparadores(renderToString(<CommunicationsClient canAuthor isAdmin weight={1} units={[]} people={[]} inbox={inbox} authored={[]} abas={{ recebidos: ver, novo: ver, painel: ver } as never} subtitulo="x" />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Central de Comunicação</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-recebidos"/);
    expect(h).toContain('<span class="sgo-navbadge">1</span>');
    expect(h).toContain('data-testid="aba-novo"');
    expect(h).toContain('data-testid="aba-painel"');
  });
});

describe('Minha área no kit', () => {
  it('só as abas que o perfil pode ver; a primeira visível é a ativa', () => {
    const abas = { tarefas: nao, notas: ver, folgas: ver } as never;
    const h = semSeparadores(renderToString(<ManagerAreaClient tasks={[]} notes={[]} leaves={[]} abas={abas} subtitulo="x" />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Minha área</h1>');
    expect(h).not.toContain('data-testid="aba-tarefas"');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-notas"/);
    expect(h).toContain('data-testid="aba-folgas"');
  });
});

describe('Desligamentos no kit', () => {
  it('Solicitar / Solicitações no cabeçalho; sem canRequest a aba Solicitar não existe', () => {
    const base = { canDecide: true, units: [{ id: 'u1', name: 'Centro' }], collaboratorsByUnit: {}, rows: [], subtitulo: 'x', abas: { solicitar: ver, lista: ver } as never };
    const h = semSeparadores(renderToString(<TerminationsClient {...base} canRequest />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Desligamentos</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-solicitar"/);
    const sem = semSeparadores(renderToString(<TerminationsClient {...base} canRequest={false} />));
    expect(sem).not.toContain('data-testid="aba-solicitar"');
    expect(sem).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-lista"/);
  });
});
