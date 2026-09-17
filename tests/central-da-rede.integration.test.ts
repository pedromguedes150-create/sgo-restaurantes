import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { getCentralDaRede } from '@/lib/dashboard/central';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A Central Operacional é PORTA DE ENTRADA, não painel de leitura.
 *
 * O que estes casos protegem: (1) todo número leva a algum lugar — indicador
 * sem destino obriga a pessoa a procurar de novo o que o painel acabou de
 * contar; (2) o alerta que se repete some, porque lista repetida ensina a
 * ignorar a lista inteira; (3) a ordem é por GRAVIDADE, não por nota, porque a
 * pergunta é "onde eu entro agora".
 */

const sfx = process.pid.toString(36);
let adminId: string;
let unitA: string;
let unitB: string;

const rede = (): SessionUser => ({ id: adminId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  adminId = (await prisma.user.create({ data: { name: `Adm ${sfx}`, email: `central-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  unitA = (await prisma.unit.create({ data: { code: `CTA-${sfx}`, name: 'Central A', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `CTB-${sfx}`, name: 'Central B', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
});

afterAll(async () => {
  await prisma.oilCollection.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: adminId } });
});

describe('todo número tem destino', () => {
  it('cada indicador traz um endereço interno e um tom válido', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    expect(c.indicadores.length).toBeGreaterThan(0);
    for (const i of c.indicadores) {
      expect(i.href, `indicador ${i.id} sem destino`).toMatch(/^\//);
      expect(['critico', 'atencao', 'ok']).toContain(i.tom);
      expect(i.valor.length, `indicador ${i.id} sem valor`).toBeGreaterThan(0);
      expect(i.detalhe.length, `indicador ${i.id} sem linha de apoio`).toBeGreaterThan(0);
    }
  });

  it('cada alerta diz a gravidade, o problema, a ação e para onde ir', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    for (const a of c.alertas) {
      expect(a.href).toMatch(/^\//);
      expect(a.problema.length).toBeGreaterThan(5);
      /* Alerta sem AÇÃO é alerta decorativo: diz que algo está errado e deixa
         a pessoa adivinhar o que fazer. */
      expect(a.acao.length).toBeGreaterThan(5);
      expect(['critico', 'atencao', 'ok']).toContain(a.gravidade);
    }
  });

  it('os ids dos indicadores e dos alertas não se repetem', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    const ind = c.indicadores.map((i) => i.id);
    const ale = c.alertas.map((a) => a.id);
    expect(new Set(ind).size).toBe(ind.length);
    expect(new Set(ale).size).toBe(ale.length);
  });
});

describe('a ordem é por gravidade', () => {
  it('crítico vem antes de atenção, que vem antes do resto', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    const peso = { critico: 0, atencao: 1, ok: 2 } as const;
    const pesos = c.alertas.map((a) => peso[a.gravidade]);
    expect(pesos).toEqual([...pesos].sort((x, y) => x - y));
  });

  it('as unidades saem por gravidade — não é ranking de nota', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    const peso = { critico: 0, atencao: 1, ok: 2 } as const;
    const pesos = c.unidades.map((u) => peso[u.tom]);
    expect(pesos).toEqual([...pesos].sort((x, y) => x - y));
  });
});

describe('o alerta que se repetiria vira um só', () => {
  it('várias unidades sem coleta de óleo dão UM alerta, com a contagem', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    const doOleo = c.alertas.filter((a) => a.id.startsWith('oleo'));
    /* O ponto é exatamente este: uma linha por unidade enchia a lista com a
       mesma frase — quatro unidades, quatro linhas idênticas. */
    expect(doOleo.length).toBeLessThanOrEqual(1);
    if (doOleo.length === 1 && c.totalUnidades > 1) {
      expect(doOleo[0].problema).toMatch(/coleta de óleo/i);
    }
  });
});

describe('o seletor global recorta a central', () => {
  it('escolhida uma unidade, só ela aparece em "Unidades hoje"', async () => {
    const c = await getCentralDaRede(rede(), [unitA]);
    expect(c.unidades.map((u) => u.unitId)).toEqual([unitA]);
    expect(c.totalUnidades).toBe(1);
  });

  it('sem recorte, a central fala pela rede inteira', async () => {
    const c = await getCentralDaRede(rede(), undefined);
    const ids = c.unidades.map((u) => u.unitId);
    expect(ids).toContain(unitA);
    expect(ids).toContain(unitB);
  });
});
