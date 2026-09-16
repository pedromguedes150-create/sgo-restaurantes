import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { salvarFaixa, apagarFaixa, getSetoresComFaixas } from '@/lib/workforce/cobertura';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O CADASTRO das faixas de necessidade.
 *
 * A cobertura em si (quem está no setor às 10:30) depende da escala, do turno e
 * da alocação, e é exercitada pela lógica pura em `mapa-necessidade.test.ts`.
 * Aqui se prova a metade que grava: a recusa de sobreposição — que é o que
 * impede a necessidade de ficar ambígua sem nada aparecer na tela — e o escopo.
 */

const sfx = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let unitId: string;
let userId: string;
let cozinha: string;
let caixa: string;

const admin = (): SessionUser => ({ id: userId, name: 'Admin', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MF-${sfx}`, name: 'Unidade Mapa', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  userId = (await prisma.user.create({ data: { name: 'Admin Mapa', email: `mf-${sfx}@teste.local`, role: 'ADMIN', passwordHash: 'x' } })).id;
  /* minHeadcount 0: estes setores nascem SEM faixa, para os casos começarem
     do zero e não do que a migração converteu. */
  cozinha = (await prisma.sector.create({ data: { unitId, name: 'Cozinha', minHeadcount: 0 } })).id;
  caixa = (await prisma.sector.create({ data: { unitId, name: 'Caixa', minHeadcount: 0 } })).id;
});

beforeEach(async () => {
  await prisma.sectorRequirement.deleteMany({ where: { sectorId: { in: [cozinha, caixa] } } });
});

afterAll(async () => {
  await prisma.sectorRequirement.deleteMany({ where: { sectorId: { in: [cozinha, caixa] } } });
  await prisma.sector.deleteMany({ where: { unitId } });
  await prisma.auditLog.deleteMany({ where: { unitId } });
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

const criar = (sectorId: string, startTime: string, endTime: string, minPeople: number) =>
  salvarFaixa(admin(), { sectorId, startTime, endTime, minPeople });

describe('Cadastrar faixas', () => {
  it('as três do exemplo entram, inclusive a da madrugada', async () => {
    expect((await criar(cozinha, '06:00', '14:00', 3)).ok).toBe(true);
    expect((await criar(cozinha, '14:00', '22:00', 2)).ok).toBe(true);
    expect((await criar(cozinha, '22:00', '06:00', 1)).ok).toBe(true);

    const setores = await getSetoresComFaixas(admin(), unitId);
    const c = setores.find((s) => s.id === cozinha)!;
    expect(c.faixas.map((f) => `${f.rotulo}=${f.minPeople}`)).toEqual([
      '06:00–14:00=3', '14:00–22:00=2', '22:00–06:00=1',
    ]);
  });

  it('a de dia inteiro aparece como 00:00–24:00 — é o formato da migração', async () => {
    await criar(caixa, '00:00', '00:00', 2);
    const s = (await getSetoresComFaixas(admin(), unitId)).find((x) => x.id === caixa)!;
    expect(s.faixas[0].rotulo).toBe('00:00–24:00');
  });
});

describe('Sobreposição é recusada', () => {
  it('o conflito do exemplo: 13:00–18:00 sobre 06:00–14:00', async () => {
    await criar(cozinha, '06:00', '14:00', 3);
    const r = await criar(cozinha, '13:00', '18:00', 2);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('CONFLITO');
    /* A frase cita a faixa conflitante: "entra em conflito" sem dizer com o quê
       obriga a pessoa a adivinhar qual das faixas mexer. */
    expect(r.ok === false && r.erro).toContain('06:00–14:00');
  });

  it('e nada é gravado quando há conflito', async () => {
    await criar(cozinha, '06:00', '14:00', 3);
    await criar(cozinha, '13:00', '18:00', 2);
    expect(await prisma.sectorRequirement.count({ where: { sectorId: cozinha } })).toBe(1);
  });

  it('pega o conflito de quem cruza a meia-noite', async () => {
    await criar(cozinha, '22:00', '06:00', 1);
    expect((await criar(cozinha, '02:00', '04:00', 2)).ok).toBe(false);
    expect((await criar(cozinha, '08:00', '10:00', 2)).ok).toBe(true);
  });

  it('faixa que só encosta é aceita', async () => {
    await criar(cozinha, '06:00', '14:00', 3);
    expect((await criar(cozinha, '14:00', '22:00', 2)).ok).toBe(true);
  });

  it('setores DIFERENTES não conflitam entre si', async () => {
    await criar(cozinha, '06:00', '14:00', 3);
    expect((await criar(caixa, '06:00', '14:00', 3)).ok).toBe(true);
  });
});

describe('Editar e apagar', () => {
  it('ao editar, a faixa não conflita consigo mesma', async () => {
    const r = await criar(cozinha, '06:00', '14:00', 3);
    const id = r.ok ? r.id! : '';
    const editada = await salvarFaixa(admin(), { sectorId: cozinha, id, startTime: '06:00', endTime: '14:00', minPeople: 5 });
    expect(editada.ok).toBe(true);

    const s = (await getSetoresComFaixas(admin(), unitId)).find((x) => x.id === cozinha)!;
    expect(s.faixas[0].minPeople).toBe(5);
  });

  it('mas continua conflitando com as OUTRAS', async () => {
    const r = await criar(cozinha, '06:00', '14:00', 3);
    await criar(cozinha, '14:00', '22:00', 2);
    const id = r.ok ? r.id! : '';
    const invade = await salvarFaixa(admin(), { sectorId: cozinha, id, startTime: '06:00', endTime: '16:00', minPeople: 3 });
    expect(invade.ok).toBe(false);
    expect(invade.ok === false && invade.reason).toBe('CONFLITO');
  });

  it('apagar tira a faixa e libera o horário', async () => {
    const r = await criar(cozinha, '06:00', '14:00', 3);
    expect((await apagarFaixa(admin(), r.ok ? r.id! : '')).ok).toBe(true);
    expect((await criar(cozinha, '06:00', '14:00', 9)).ok).toBe(true);
  });
});

describe('Horário inválido', () => {
  it('recusa hora fora do relógio e quantidade negativa', async () => {
    expect((await criar(cozinha, '25:00', '10:00', 1)).ok).toBe(false);
    expect((await criar(cozinha, '06:00', '10:00', -1)).ok).toBe(false);
  });

  it('mínimo ZERO é válido — é "sem exigência" nesse horário', async () => {
    expect((await criar(cozinha, '06:00', '10:00', 0)).ok).toBe(true);
  });
});

describe('Escopo por unidade', () => {
  it('quem não enxerga a unidade não cadastra nem lê', async () => {
    const forasteiro: SessionUser = { id: 'z', name: 'Outro', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await salvarFaixa(forasteiro, { sectorId: cozinha, startTime: '06:00', endTime: '14:00', minPeople: 3 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
    expect(await getSetoresComFaixas(forasteiro, unitId)).toEqual([]);
  });
});

describe('A auditoria registra o cadastro', () => {
  it('criar deixa rastro com o setor e a faixa', async () => {
    await criar(cozinha, '06:00', '14:00', 3);
    const log = await prisma.auditLog.findFirst({
      where: { unitId, action: 'SECTOR_REQUIREMENT_CREATE' }, orderBy: { createdAt: 'desc' },
    });
    const meta = log?.metadata as Record<string, unknown> | null;
    expect(meta?.setor).toBe('Cozinha');
    expect(meta?.minPeople).toBe(3);
  });
});
