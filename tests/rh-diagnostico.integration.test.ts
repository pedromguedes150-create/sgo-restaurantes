import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

/**
 * O DIAGNÓSTICO do RH.
 *
 * O valor da tela inteira depende de uma coisa: ela tem de dizer **a mesma
 * coisa que o sync faz**. Um diagnóstico que diverge do comportamento real é
 * pior do que não existir — manda investigar o lugar errado.
 *
 * Por isso os casos abaixo rodam o sync DE VERDADE contra a mesma resposta do
 * RH e comparam o resultado com o que o diagnóstico afirmou.
 */

let respostaDoRh: unknown = { data: [] };
let unidadesDoRh: unknown = { data: [] };

vi.mock('@/lib/rh/client', async () => {
  const real = await vi.importActual<typeof import('@/lib/rh/client')>('@/lib/rh/client');
  return {
    ...real,
    rhConfigured: () => true,
    rh: {
      colaboradoresDaUnidade: async () => respostaDoRh,
      unidades: async () => unidadesDoRh,
    },
  };
});

import { prisma } from '@/lib/db/prisma';
import { syncCollaboratorsForUnit } from '@/lib/rh/sync';
import { diagnosticarUnidade } from '@/lib/rh/diagnostico';
import type { SessionUser } from '@/lib/auth/session';

const RH_NAME = 'CHURRASCARIA DIAGNOSTICO LTDA';
const sfx = Date.now().toString(36);
let unitId: string;
let admin: SessionUser;

function pessoa(matricula: string | null, nome: string, status = 'Ativo') {
  return { matricula, nome, cpf: null, status, unidade: RH_NAME, cargo: 'Atendente', admissao: null };
}

async function limpar() {
  const ids = (await prisma.collaborator.findMany({
    where: { OR: [{ externalId: { startsWith: `D${sfx}-` } }, { name: { startsWith: `ZZ${sfx}` } }] }, select: { id: true },
  })).map((c) => c.id);
  if (ids.length > 0) {
    await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } });
    await prisma.collaborator.deleteMany({ where: { id: { in: ids } } });
  }
}

beforeAll(async () => {
  const u = await prisma.unit.create({
    data: { code: `DG-${sfx}`, name: 'U Diagnóstico', timezone: 'America/Sao_Paulo', cutoffHour: 4, rhUnitName: RH_NAME },
  });
  unitId = u.id;
  const dbUser = await prisma.user.create({
    data: { name: 'Admin Diag', email: `admin-diag-${sfx}@teste.local`, passwordHash: 'x', role: 'ADMIN', active: true },
  });
  admin = { id: dbUser.id, name: dbUser.name, role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false };
});

beforeEach(async () => {
  await limpar();
  unidadesDoRh = { data: [RH_NAME] };
  respostaDoRh = { data: [] };
});

afterAll(async () => {
  await limpar();
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  await prisma.$disconnect();
});

describe('O diagnóstico concorda com o que o sync FAZ', () => {
  it('desligado: o diagnóstico acusa, e o sync realmente desliga', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'ATIVA'), pessoa(`D${sfx}-2`, 'SAIU', 'Demitido')] };
    await syncCollaboratorsForUnit(admin, unitId);

    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.resumo.INATIVO_POR_STATUS).toBe(1);
    expect(d?.pessoas.find((p) => p.nome === 'SAIU')?.decisao).toBe('INATIVO_POR_STATUS');

    /* E o banco confirma: o diagnóstico não está inventando. */
    const noBanco = await prisma.collaborator.findFirst({ where: { externalId: `D${sfx}-2` }, select: { active: true } });
    expect(noBanco?.active).toBe(false);
  });

  it('EXPERIÊNCIA não é desligamento — o caso real de Jardim Teresópolis', async () => {
    /* Foi a tela que revelou isto: 8 pessoas em "1ª/2ª Experiência" estavam
       marcadas como desligadas e tinham sumido do sistema. */
    respostaDoRh = { data: [
      pessoa(`D${sfx}-1`, 'NOVATA', '1ª Experiência'),
      pessoa(`D${sfx}-2`, 'NOVATO', '2ª Experiência'),
    ] };
    await syncCollaboratorsForUnit(admin, unitId);

    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.resumo.INATIVO_POR_STATUS).toBe(0);
    expect(d?.resumo.ATIVO_NO_SGO).toBe(2);
    expect(d?.ativosNoSgo).toBe(2);
  });

  it('status que o SGO não conhece é sinalizado, mas a pessoa FICA', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'ESTRANHA', 'Afastado INSS')] };
    await syncCollaboratorsForUnit(admin, unitId);

    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.resumo.ATIVO_STATUS_DESCONHECIDO).toBe(1);
    expect(d?.ativosNoSgo).toBe(1);
  });

  it('sem matrícula: o diagnóstico acusa, e a pessoa realmente não existe no SGO', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'COM MATRICULA'), pessoa(null, `ZZ${sfx} SEM MATRICULA`)] };
    await syncCollaboratorsForUnit(admin, unitId);

    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.resumo.PULADO_SEM_MATRICULA).toBe(1);

    const noBanco = await prisma.collaborator.findFirst({ where: { name: { startsWith: `ZZ${sfx}` } } });
    expect(noBanco).toBeNull();
  });

  it('quem está bem aparece como ativo — e está mesmo', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'ATIVA')] };
    await syncCollaboratorsForUnit(admin, unitId);
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.resumo.ATIVO_NO_SGO).toBe(1);
    expect(d?.ativosNoSgo).toBe(1);
  });

  it('antes de sincronizar, o RH traz gente que o SGO ainda não tem', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-9`, 'NOVATO')] };
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.resumo.NAO_ENCONTRADO_NO_SGO).toBe(1);
    expect(d?.totalNoRh).toBe(1);
  });
});

describe('O casamento do nome da unidade', () => {
  it('nome que bate é confirmado', async () => {
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.nomeConfere).toBe(true);
  });

  it('nome que NÃO bate é acusado, com os parecidos para comparar', async () => {
    /* A causa mais boba de "não veio ninguém": um acento, um espaço a mais. */
    unidadesDoRh = { data: ['CHURRASCARIA DIAGNÓSTICO LTDA.', 'OUTRA COISA SA'] };
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.nomeConfere).toBe(false);
    expect(d?.parecidas).toContain('CHURRASCARIA DIAGNÓSTICO LTDA.');
    expect(d?.parecidas).not.toContain('OUTRA COISA SA');
  });
});

describe('O outro lado da comparação', () => {
  it('quem está no SGO e o RH não devolve mais é listado', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'FICA'), pessoa(`D${sfx}-2`, 'SAIU')] };
    await syncCollaboratorsForUnit(admin, unitId);

    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'FICA')] };
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.soNoSgo.map((c) => c.externalId)).toContain(`D${sfx}-2`);
  });
});

describe('Quando o RH falha, o diagnóstico explica em vez de mentir', () => {
  it('formato inesperado vira uma frase que diz o que o sync faria', async () => {
    respostaDoRh = { colaboradores: [] };
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.erro).toContain('não sabe ler');
    expect(d?.erro).toContain('não desliga ninguém');
    /* E não afirma que a unidade está vazia — o erro não vira "0 pessoas". */
    expect(d?.totalNoRh).toBe(0);
  });

  it('o que o SGO tem continua sendo mostrado mesmo com o RH fora do ar', async () => {
    respostaDoRh = { data: [pessoa(`D${sfx}-1`, 'ATIVA')] };
    await syncCollaboratorsForUnit(admin, unitId);

    respostaDoRh = null;
    const d = await diagnosticarUnidade(admin, unitId);
    expect(d?.erro).toBeTruthy();
    /* A metade que explica o que a pessoa está vendo na tela não pode sumir
       junto com o RH. */
    expect(d?.ativosNoSgo).toBe(1);
    expect(d?.soNoSgo).toHaveLength(1);
  });
});
