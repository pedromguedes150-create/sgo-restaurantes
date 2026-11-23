import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** v1.221.2 — relato do Daniel (23/11): publicou um comunicado e ele não aparecia no Painel — estava abaixo de todos os fixados. */
describe('Painel & Histórico dos comunicados', () => {
  it('lista do mais recente para o mais antigo; fixado não passa na frente', () => {
    const fonte = readFileSync('src/lib/communications/query.ts', 'utf8');
    const painel = fonte.slice(fonte.indexOf('export async function getAuthoredCommunications'), fonte.indexOf('export async function getCommunication('));
    expect(painel).toContain("orderBy: [{ createdAt: 'desc' }]");
    expect(painel).not.toContain("pinned: 'desc'");
  });
  it('a caixa de quem recebe continua com os fixados no topo', () => {
    const fonte = readFileSync('src/lib/communications/query.ts', 'utf8');
    const caixa = fonte.slice(fonte.indexOf('export async function getMyInbox'), fonte.indexOf('export async function getInboxPendingCount'));
    expect(caixa).toContain("pinned: 'desc'");
  });
});
