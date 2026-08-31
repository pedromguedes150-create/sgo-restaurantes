import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { listarFolgasDaUnidade, salvarFolgasEmLote, resumoPorDia } from '@/lib/schedule/folgas-lote';
import { historicoDeEscala } from '@/lib/schedule/employee';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Folgas de toda a unidade numa tela só.
 *
 * O problema que resolve: o cadastro antigo usava a mesma data de início de
 * ciclo para todo mundo, então **a unidade inteira folgava no mesmo dia**.
 * Corrigir isso um formulário por vez, em 20 pessoas × 15 unidades, não
 * acontece — e a escala fica genérica.
 */

const sfx = `fl${process.pid.toString(36)}`;
let unitId: string;
let outraId: string;
let mgrId: string;
let tipo6x1 = '';
let tipo12x36 = '';
const colabs: string[] = [];

const mgr = (): SessionUser => ({ id: mgrId, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `FL-${sfx}`, name: 'U Folgas', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraId = (await prisma.unit.create({ data: { code: `FL2-${sfx}`, name: 'Outra', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'G', email: `${sfx}@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId } });

  tipo6x1 = (await prisma.scheduleTemplate.create({ data: { name: `6x1 ${sfx}`, workDays: 6, offDays: 1 } })).id;
  tipo12x36 = (await prisma.scheduleTemplate.create({ data: { name: `12x36 ${sfx}`, workDays: 1, offDays: 1 } })).id;

  for (const nome of ['ANA', 'BRUNO', 'CARLA']) {
    const c = await prisma.collaborator.create({ data: { name: `${nome} ${sfx}`, jobTitle: 'Aux.', active: true } });
    colabs.push(c.id);
    await prisma.collaboratorUnit.create({ data: { collaboratorId: c.id, unitId } }).catch(() => {});
  }
});

afterAll(async () => {
  await prisma.employeeSchedule.deleteMany({ where: { collaboratorId: { in: colabs } } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: colabs } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: colabs } } }).catch(() => {});
  await prisma.scheduleTemplate.deleteMany({ where: { name: { contains: sfx } } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraId] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: mgrId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Listar a situação de cada um', () => {
  it('traz TODOS, inclusive quem não tem escala', async () => {
    /* Esconder quem não tem escala repetiria o problema que a tela veio
       resolver: são justamente esses que somem da grade. */
    const r = await listarFolgasDaUnidade(mgr(), unitId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas.every((l) => l.semEscala)).toBe(true);
    expect(r.linhas[0].name).toContain('ANA');
  });

  it('unidade fora do acesso é recusada', async () => {
    const r = await listarFolgasDaUnidade(mgr(), outraId);
    expect(r.ok).toBe(false);
  });
});

describe('Salvar em lote', () => {
  it('grava cada um no seu dia e conta por dia da semana', async () => {
    const r = await salvarFolgasEmLote(mgr(), {
      unitId, startDate: '2026-09-01',
      itens: [
        { collaboratorId: colabs[0], templateId: tipo6x1, weeklyOffDay: 1 }, // segunda
        { collaboratorId: colabs[1], templateId: tipo6x1, weeklyOffDay: 2 }, // terça
        { collaboratorId: colabs[2], templateId: tipo6x1, weeklyOffDay: 1 }, // segunda
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultado.salvos).toBe(3);
    expect(r.resultado.erros).toHaveLength(0);
    /* 2 na segunda, 1 na terça — é este número que mostra se algum dia ficou
       descoberto. */
    expect(r.resultado.porDia[1]).toBe(2);
    expect(r.resultado.porDia[2]).toBe(1);
    expect(r.resultado.porDia[0]).toBe(0);
  });

  it('a listagem passa a mostrar o dia de cada um', async () => {
    const r = await listarFolgasDaUnidade(mgr(), unitId, new Date('2026-09-15T00:00:00.000Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ana = r.linhas.find((l) => l.name.startsWith('ANA'))!;
    expect(ana.semEscala).toBe(false);
    expect(ana.weeklyOffDay).toBe(1);
    expect(ana.semanal).toBe(true);
  });

  it('a vigência é respeitada: cada gravação fecha a anterior', async () => {
    await salvarFolgasEmLote(mgr(), {
      unitId, startDate: '2026-10-01',
      itens: [{ collaboratorId: colabs[0], templateId: tipo6x1, weeklyOffDay: 5 }],
    });
    const hist = await historicoDeEscala(colabs[0], unitId);
    expect(hist).toHaveLength(2);
    const setembro = hist.find((v) => v.weeklyOffDay === 1)!;
    expect(setembro.endDate?.toISOString().slice(0, 10)).toBe('2026-09-30');
  });

  it('um erro NÃO derruba o lote — salva o resto e diz quem faltou', async () => {
    /* Recusar tudo por causa de um obrigaria a começar de novo, e o gerente
       perderia as 19 linhas que estavam certas. */
    const r = await salvarFolgasEmLote(mgr(), {
      unitId, startDate: '2026-11-01',
      itens: [
        { collaboratorId: colabs[1], templateId: tipo6x1, weeklyOffDay: 3 },
        { collaboratorId: colabs[2], templateId: 'tipo-que-nao-existe', weeklyOffDay: 4 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultado.salvos).toBe(1);
    expect(r.resultado.erros).toHaveLength(1);
    expect(r.resultado.erros[0].colaborador).toContain('CARLA');
  });

  it('ciclo que não fecha na semana é recusado com motivo', async () => {
    /* 12x36 não tem dia fixo; a tela nem oferece, mas a regra tem de valer
       também para quem chamar a API direto. */
    const r = await salvarFolgasEmLote(mgr(), {
      unitId, startDate: '2026-11-01',
      itens: [{ collaboratorId: colabs[0], templateId: tipo12x36, weeklyOffDay: 2 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultado.salvos).toBe(0);
    expect(r.resultado.erros[0].motivo).toContain('início do ciclo');
  });

  it('lote vazio e data inválida são recusados', async () => {
    expect((await salvarFolgasEmLote(mgr(), { unitId, startDate: '2026-09-01', itens: [] })).ok).toBe(false);
    expect((await salvarFolgasEmLote(mgr(), { unitId, startDate: 'ontem', itens: [{ collaboratorId: colabs[0], templateId: tipo6x1, weeklyOffDay: 1 }] })).ok).toBe(false);
  });

  it('unidade fora do acesso é recusada', async () => {
    const r = await salvarFolgasEmLote(mgr(), { unitId: outraId, startDate: '2026-09-01', itens: [{ collaboratorId: colabs[0], templateId: tipo6x1, weeklyOffDay: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('resumoPorDia', () => {
  it('só lista os dias com gente', () => {
    expect(resumoPorDia([0, 2, 1, 0, 0, 0, 0])).toBe('2 segunda · 1 terça');
  });

  it('ninguém em dia nenhum devolve texto vazio', () => {
    expect(resumoPorDia([0, 0, 0, 0, 0, 0, 0])).toBe('');
  });
});
