import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * O SYNC do RH — e a pergunta que importa: o que ele faz quando a resposta do
 * RH não é a esperada?
 *
 * O defeito que originou este arquivo (14/09): o sync inativava quem não viesse
 * na lista usando `externalId: { notIn: matriculas }`. Com a lista VAZIA, o
 * Prisma descarta a condição e o `updateMany` casa com TODOS — medido: 3 de 3
 * ativos com a lista vazia, 0 com uma matrícula inexistente.
 *
 * Ou seja: um `200 { data: [] }` — "Nome no RH" com um espaço a mais, uma
 * resposta vazia momentânea — desligava o quadro inteiro da unidade, calado,
 * num job que roda sozinho 1×/dia. Nada disso tinha teste: `lib/rh` não era
 * tocado por nenhum arquivo de `tests/`.
 */

/* A resposta do RH é trocada a cada caso. O mock devolve o que estiver aqui —
   inclusive lançando, para simular a falha de transporte. */
let respostaDoRh: unknown = { data: [] };
let lancarNoTransporte: Error | null = null;

vi.mock('@/lib/rh/client', () => ({
  rhConfigured: () => true,
  RhApiError: class RhApiError extends Error {},
  rh: {
    colaboradoresDaUnidade: async () => {
      if (lancarNoTransporte) throw lancarNoTransporte;
      return respostaDoRh;
    },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { syncCollaboratorsForUnit } from '@/lib/rh/sync';
import type { SessionUser } from '@/lib/auth/session';

const RH_NAME = 'CHURRASCARIA TESTE SYNC LTDA';
const sfx = Date.now().toString(36);
let unitId: string;
let admin: SessionUser;

/** Colaborador vindo do RH, ativo e vinculado à unidade do teste. */
function colaboradorRh(matricula: string, nome: string) {
  return {
    matricula, nome, cpf: null, status: 'Ativo',
    unidade: RH_NAME, cargo: 'Atendente', admissao: null,
  };
}

async function ativosNaUnidade(): Promise<string[]> {
  const cs = await prisma.collaborator.findMany({
    where: { source: 'RH', active: true, units: { some: { unitId } } },
    orderBy: { name: 'asc' }, select: { name: true },
  });
  return cs.map((c) => c.name);
}

async function limparColaboradores() {
  const ids = (await prisma.collaborator.findMany({
    where: { externalId: { startsWith: `T${sfx}-` } }, select: { id: true },
  })).map((c) => c.id);
  if (ids.length > 0) {
    await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
    await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  const u = await prisma.unit.create({
    data: { code: `RH-${sfx}`, name: 'U Sync RH', timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: RH_NAME },
  });
  unitId = u.id;

  /* Usuário DE VERDADE no banco, não um id inventado: o `audit()` engole
     qualquer erro de propósito (auditoria nunca pode derrubar a operação), e
     com um id sem User a gravação morria na chave estrangeira sem barulho — o
     teste da auditoria passaria a medir o vazio em vez do que foi gravado. */
  const dbUser = await prisma.user.create({
    data: {
      name: 'Admin do Teste RH', email: `admin-rh-${sfx}@teste.local`,
      passwordHash: 'x', role: 'ADMIN', active: true,
    },
  });
  admin = { id: dbUser.id, name: dbUser.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
});

beforeEach(async () => {
  lancarNoTransporte = null;
  await limparColaboradores();
  /* O estado de partida de todo caso: dois colaboradores do RH, ativos. */
  respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), colaboradorRh(`T${sfx}-2`, 'BRUNO')] };
  await syncCollaboratorsForUnit(admin, unitId);
});

afterAll(async () => {
  await limparColaboradores();
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('O caminho normal continua igual', () => {
  it('a unidade começa com os dois que o RH mandou', async () => {
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('quem SAI da lista NÃO é inativado (v1.132.2) — ausência não é desligamento; a auditoria conta os não retornados', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA')] };
    const r = await syncCollaboratorsForUnit(admin, unitId);
    expect(r.ok).toBe(true);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
    const log = await prisma.auditLog.findFirst({ where: { unitId, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' } });
    const meta = log?.metadata as Record<string, unknown>;
    expect(meta.deactivated).toBe(0);
    expect(meta.naoRetornados).toBe(1);
  });

  it('só inativa quem o RH devolve, pela matrícula, com status de desligamento — e quem volta ativo é reativado', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Demitido' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA']);
    const log = await prisma.auditLog.findFirst({ where: { unitId, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' } });
    expect((log?.metadata as Record<string, unknown>).deactivated).toBe(1);
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), colaboradorRh(`T${sfx}-2`, 'BRUNO')] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('período de EXPERIÊNCIA não desliga ninguém — foi o defeito de 14/09', async () => {
    /* O RH devolve "1ª Experiência"/"2ª Experiência" para quem está no período
       de experiência. A regra antiga (`startsWith('ativ')`) tirava essas
       pessoas do SGO, e elas sumiam de Pessoas, da Escala e do Mapa. */
    respostaDoRh = { data: [
      { ...colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), status: '1ª Experiência' },
      { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: '2ª Experiência' },
    ] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('status desconhecido também mantém a pessoa no SGO', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Afastado' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('status não-ativo no RH inativa a pessoa', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Demitido' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA']);
  });
});

describe('Lista VAZIA não desliga a unidade', () => {
  it('ninguém é inativado quando o RH devolve zero', async () => {
    respostaDoRh = { data: [] };
    const r = await syncCollaboratorsForUnit(admin, unitId);
    expect(r.ok).toBe(true);
    /* ANTES desta correção o resultado aqui era `[]` — os dois desligados. */
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('e a auditoria registra a lista vazia, com os dois como não retornados', async () => {
    respostaDoRh = { data: [] };
    await syncCollaboratorsForUnit(admin, unitId);
    const log = await prisma.auditLog.findFirst({
      where: { unitId, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' },
    });
    const meta = log?.metadata as Record<string, unknown> | null;
    expect(meta?.deactivated).toBe(0);
    expect(meta?.naoRetornados).toBe(2);
    expect(String(meta?.motivo)).toContain('vazia');
  });

  it('mas numa unidade que JÁ está vazia, lista vazia é rotina — sem alarme', async () => {
    /* Esvazia pelo caminho legítimo (o RH diz que os dois foram demitidos)… */
    respostaDoRh = { data: [{ ...colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), status: 'Demitido' }, { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Demitido' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual([]);

    // …e agora a lista vazia não tem nada para proteger: é só uma unidade sem gente.
    respostaDoRh = { data: [] };
    await syncCollaboratorsForUnit(admin, unitId);
    const log = await prisma.auditLog.findFirst({
      where: { unitId, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' },
    });
    expect((log?.metadata as Record<string, unknown>)?.motivo).toBeUndefined();
  });
});

describe('FÉRIAS do RH vira FE na Escala (30/09/2026)', () => {
  /* O RH só manda um status, sem data de início/fim — por isso só o dia
     OPERACIONAL de hoje da unidade é marcado, nunca um período inteiro. */
  async function feDeHoje(collaboratorId: string) {
    return prisma.scheduleActual.findFirst({
      where: { collaboratorId, status: 'FERIAS' },
      orderBy: { date: 'desc' },
    });
  }

  it('ao sincronizar, quem está de férias no RH ganha FE no dia de hoje', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Férias' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    const bruno = await prisma.collaborator.findFirst({ where: { externalId: `T${sfx}-2` } });
    const fe = await feDeHoje(bruno!.id);
    expect(fe).not.toBeNull();
    expect(fe?.reason).toContain('férias');
    /* Quem NÃO está de férias não ganha marcação nenhuma. */
    const ale = await prisma.collaborator.findFirst({ where: { externalId: `T${sfx}-1` } });
    expect(await feDeHoje(ale!.id)).toBeNull();
  });

  it('continua ATIVO no SGO — férias não é desligamento', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), { ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Férias' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('fica na Auditoria como SCHEDULE_ABSENCE, com a origem RH_SYNC', async () => {
    respostaDoRh = { data: [{ ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Férias' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    const bruno = await prisma.collaborator.findFirst({ where: { externalId: `T${sfx}-2` } });
    const log = await prisma.auditLog.findFirst({
      where: { action: 'SCHEDULE_ABSENCE', entityId: bruno!.id }, orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    expect((log?.metadata as Record<string, unknown>)?.origem).toBe('RH_SYNC');
    expect((log?.metadata as Record<string, unknown>)?.status).toBe('FERIAS');
  });

  it('sincronizar duas vezes no mesmo dia não duplica — upsert pela chave do dia', async () => {
    respostaDoRh = { data: [{ ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Férias' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    await syncCollaboratorsForUnit(admin, unitId);
    const bruno = await prisma.collaborator.findFirst({ where: { externalId: `T${sfx}-2` } });
    const todas = await prisma.scheduleActual.findMany({ where: { collaboratorId: bruno!.id, status: 'FERIAS' } });
    expect(todas).toHaveLength(1);
  });

  it('quando o RH volta a dizer "Ativo", a Escala simplesmente para de ganhar FE novo — o dia já marcado fica (histórico)', async () => {
    respostaDoRh = { data: [{ ...colaboradorRh(`T${sfx}-2`, 'BRUNO'), status: 'Férias' }] };
    await syncCollaboratorsForUnit(admin, unitId);
    const bruno = await prisma.collaborator.findFirst({ where: { externalId: `T${sfx}-2` } });
    const feAntes = await feDeHoje(bruno!.id);
    expect(feAntes).not.toBeNull();

    respostaDoRh = { data: [colaboradorRh(`T${sfx}-2`, 'BRUNO')] }; // volta a "Ativo"
    await syncCollaboratorsForUnit(admin, unitId);
    const total = await prisma.scheduleActual.count({ where: { collaboratorId: bruno!.id, status: 'FERIAS' } });
    expect(total).toBe(1); // o registro de hoje não é apagado nem duplicado
  });
});

describe('Formato inesperado é ERRO, não lista vazia', () => {
  it('envelope trocado aborta a unidade sem tocar em ninguém', async () => {
    /* Se o RH renomear o campo, o sync tem de parar — não concluir que a
       unidade ficou sem ninguém. */
    respostaDoRh = { colaboradores: [{ matricula: `T${sfx}-1`, nome: 'ALESSANDRA' }] };
    const r = await syncCollaboratorsForUnit(admin, unitId);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('RH_ERROR');
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('resposta nula idem', async () => {
    respostaDoRh = null;
    const r = await syncCollaboratorsForUnit(admin, unitId);
    expect(r.ok).toBe(false);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });

  it('falha de transporte (timeout, rede) também não inativa nada', async () => {
    lancarNoTransporte = new Error('RH não respondeu em 20s');
    const r = await syncCollaboratorsForUnit(admin, unitId);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('20s');
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA', 'BRUNO']);
  });
});
