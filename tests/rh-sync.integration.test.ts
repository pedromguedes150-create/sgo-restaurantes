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

  it('quem SAI da lista é inativado — é para isso que a regra existe', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA')] };
    const r = await syncCollaboratorsForUnit(admin, unitId);
    expect(r.ok).toBe(true);
    expect(await ativosNaUnidade()).toEqual(['ALESSANDRA']);
  });

  it('quem volta à lista é reativado', async () => {
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA')] };
    await syncCollaboratorsForUnit(admin, unitId);
    respostaDoRh = { data: [colaboradorRh(`T${sfx}-1`, 'ALESSANDRA'), colaboradorRh(`T${sfx}-2`, 'BRUNO')] };
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

  it('e a auditoria registra que a inativação foi pulada, e por quê', async () => {
    respostaDoRh = { data: [] };
    await syncCollaboratorsForUnit(admin, unitId);
    const log = await prisma.auditLog.findFirst({
      where: { unitId, action: 'RH_SYNC_COLLABORATORS' }, orderBy: { createdAt: 'desc' },
    });
    const meta = log?.metadata as Record<string, unknown> | null;
    expect(meta?.deactivated).toBe(0);
    expect(meta?.inativacaoPulada).toBe(2);
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
    expect((log?.metadata as Record<string, unknown>)?.inativacaoPulada).toBeUndefined();
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
