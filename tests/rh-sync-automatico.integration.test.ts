import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';

/**
 * REATIVAÇÃO do sync automático do RH (30/09/2026), pedido direto do Pedro.
 *
 * Histórico: em 29/09/2026, a versão de então inativava quem NÃO voltasse na
 * lista do RH (`externalId: { notIn: matriculas }`); uma resposta vazia ou
 * parcial marcou 49 colaboradores como inativos sem eles terem sido
 * desligados. A correção da v1.132.2 REMOVEU esse trecho do código — não é
 * uma flag que esconde um comportamento perigoso, o comportamento não existe
 * mais. O sync ficou SUSPENSO (v1.132.2) enquanto os 49 eram conferidos;
 * conferidos e com o pedido explícito do Pedro, a suspensão é removida aqui.
 *
 * Este arquivo prova duas coisas que a suspensão escondia (o `if` cortava a
 * função antes de chegar a qualquer uma delas):
 *  1. `runDailyRhSync()` de fato roda (deixou de devolver SUSPENSO na hora).
 *  2. O caminho AUTOMÁTICO (ator nulo, `syncUnitCore(unitId, null)`) tem a
 *     MESMA proteção do caminho manual: uma resposta vazia do RH não
 *     inativa ninguém. A proteção em si — lista vazia, formato inesperado,
 *     falha de transporte, período de experiência, férias — já está coberta
 *     à exaustão em `tests/rh-sync.integration.test.ts` pelo caminho manual;
 *     como é a MESMA função (`syncUnitCore`) para os dois, o que falta
 *     provar aqui é só que o automático realmente a invoca.
 */
let respostaDoRh: unknown = { data: [] };
vi.mock('@/lib/rh/client', () => ({
  rhConfigured: () => true,
  RhApiError: class RhApiError extends Error {},
  rh: { colaboradoresDaUnidade: async () => respostaDoRh },
}));

import { runDailyRhSync, RH_AUTO_SYNC_SUSPENSO, autoSyncFeitaHoje, deveRodarSyncAutomatico, emBrasilia, HORA_MINIMA_SYNC_BRT } from '@/lib/rh/sync';

const sfx = `auto${Date.now().toString(36)}`;
const RH_NAME = `CHURRASCARIA TESTE AUTO ${sfx}`;

function colaboradorRh(matricula: string, nome: string, status = 'Ativo') {
  return { matricula, nome, cpf: null, status, unidade: RH_NAME, cargo: 'Atendente', admissao: null };
}

async function limpar(unitId: string) {
  const ids = (await prisma.collaborator.findMany({ where: { externalId: { startsWith: `A${sfx}-` } }, select: { id: true } })).map((c) => c.id);
  if (ids.length > 0) {
    await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
    await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
}

describe('Sync automático do RH — reativado', () => {
  it('a suspensão foi removida: RH_AUTO_SYNC_SUSPENSO é false', () => {
    expect(RH_AUTO_SYNC_SUSPENSO).toBe(false);
  });

  it('runDailyRhSync roda de verdade (não devolve mais SUSPENSO) e grava RH_SYNC_AUTO', async () => {
    const unit = await prisma.unit.create({
      data: { code: `AUTO-${sfx}`, name: 'U Auto RH', timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: RH_NAME },
    });
    try {
      respostaDoRh = { data: [colaboradorRh(`A${sfx}-1`, 'CARLA ATOR NULO')] };
      const antes = new Date();
      const r = await runDailyRhSync();
      expect(r.ran).toBe(true);
      const log = await prisma.auditLog.findFirst({ where: { unitId: unit.id, action: 'RH_SYNC_AUTO', createdAt: { gte: antes } } });
      expect(log).not.toBeNull();
      expect(log?.userId).toBeNull(); // ator nulo = sistema, não um Admin
    } finally {
      await limpar(unit.id);
    }
  });

  it('pelo caminho AUTOMÁTICO (ator nulo): resposta vazia do RH NÃO inativa ninguém — a mesma proteção da v1.132.2', async () => {
    const unit = await prisma.unit.create({
      data: { code: `AUTO2-${sfx}`, name: 'U Auto RH 2', timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: `${RH_NAME} 2` },
    });
    try {
      // primeiro sync automático: um colaborador ativo chega normalmente
      respostaDoRh = { data: [colaboradorRh(`A${sfx}-2`, 'DIEGO ATOR NULO')] };
      await runDailyRhSync();
      const antes = await prisma.collaborator.findMany({ where: { source: 'RH', active: true, units: { some: { unitId: unit.id } } } });
      expect(antes.map((c) => c.name)).toEqual(['DIEGO ATOR NULO']);

      // segundo sync automático: o RH devolve vazio — o mesmo formato que causou o incidente de 29/09
      respostaDoRh = { data: [] };
      await runDailyRhSync();
      const depois = await prisma.collaborator.findMany({ where: { source: 'RH', active: true, units: { some: { unitId: unit.id } } } });
      expect(depois.map((c) => c.name)).toEqual(['DIEGO ATOR NULO']); // continua ativo
    } finally {
      await limpar(unit.id);
    }
  });
});

describe('Uma vez por DIA de Brasília, a partir das 05h (v1.142.2)', () => {
  it('a conta do dia e da hora é em Brasília, não em UTC', () => {
    /* 01:30 UTC de 03/10 ainda é 22:30 de 02/10 em Brasília. */
    expect(emBrasilia(new Date('2026-10-03T01:30:00Z'))).toEqual({ dia: '2026-10-02', hora: 22 });
    expect(emBrasilia(new Date('2026-10-03T08:10:00Z'))).toEqual({ dia: '2026-10-03', hora: 5 });
  });

  it('antes das 05h não roda (fora do boot); no boot roda se o dia ainda não teve; depois do sync do dia, não repete', async () => {
    expect(HORA_MINIMA_SYNC_BRT).toBe(5);
    /* Um dia distante, sem nenhum RH_SYNC_AUTO gravado. */
    const madrugada = new Date('2030-01-15T06:00:00Z'); // 03:00 BRT
    const manha = new Date('2030-01-15T09:00:00Z'); // 06:00 BRT
    expect(await deveRodarSyncAutomatico(madrugada, false)).toBe(false);
    expect(await deveRodarSyncAutomatico(madrugada, true)).toBe(true);
    expect(await deveRodarSyncAutomatico(manha, false)).toBe(true);
    const log = await prisma.auditLog.create({ data: { action: 'RH_SYNC_AUTO', module: 'PEOPLE', createdAt: new Date('2030-01-15T08:30:00Z') } });
    try {
      expect(await autoSyncFeitaHoje(manha)).toBe(true);
      expect(await deveRodarSyncAutomatico(new Date('2030-01-15T20:00:00Z'), false)).toBe(false);
      /* O dia seguinte em Brasília (03:30 BRT ainda não é hora; 06:00 é). */
      expect(await deveRodarSyncAutomatico(new Date('2030-01-16T06:30:00Z'), false)).toBe(false);
      expect(await deveRodarSyncAutomatico(new Date('2030-01-16T09:00:00Z'), false)).toBe(true);
    } finally {
      await prisma.auditLog.delete({ where: { id: log.id } });
    }
  });
});
