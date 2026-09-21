import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { salvarFaixa, apagarFaixa, getSetoresComFaixas, definirVinteQuatroHoras } from '@/lib/workforce/cobertura';
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

/**
 * O "NECESSÁRIO 24 HORAS" — e o beco sem saída que ele veio resolver.
 *
 * O defeito relatado com print: toda função aparecia exigindo cobertura 24
 * horas, e cadastrar 06:40–15:00 era recusado por conflito com 00:00–24:00.
 *
 * A causa não era o cálculo (faixas que encostam já eram aceitas) nem um
 * preenchimento automático rodando hoje: foi a migração da v1.84.0, que
 * converteu o antigo `Sector.minHeadcount` numa faixa de dia inteiro para "não
 * mudar nada no dia da subida". O efeito só apareceu em uso — com os 1440
 * minutos ocupados, QUALQUER faixa específica colide, e a tela de adicionar não
 * oferecia saída.
 */
describe('Necessário 24 horas', () => {
  it('reproduz o beco: com a faixa de dia inteiro, 06:40–15:00 é recusada', async () => {
    await criar(cozinha, '00:00', '24:00', 1);
    const r = await criar(cozinha, '06:40', '15:00', 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('CONFLITO');
    /* A mensagem precisa apontar a SAÍDA — "conflito de horário" seco mandava
       procurar uma sobreposição que a pessoa não consegue enxergar. */
    expect(r.erro).toContain('24 horas');
    expect(r.erro).toContain('Desmarque');
  });

  it('desmarcar as 24 horas libera o cadastro das faixas específicas', async () => {
    await criar(cozinha, '00:00', '24:00', 1);
    expect((await definirVinteQuatroHoras(admin(), { sectorId: cozinha, ligado: false })).ok).toBe(true);

    expect((await criar(cozinha, '06:40', '15:00', 1)).ok).toBe(true);
    expect((await criar(cozinha, '15:00', '23:40', 1)).ok).toBe(true);

    const [setor] = (await getSetoresComFaixas(admin(), unitId)).filter((s) => s.id === cozinha);
    expect(setor.faixas.map((f) => f.rotulo).sort()).toEqual(['06:40–15:00', '15:00–23:40']);
    expect(setor.faixas.every((f) => !f.diaInteiro)).toBe(true);
  });

  it('marcar 24 horas SUBSTITUI as faixas específicas', async () => {
    /* Manter as duas seria pedir duas coisas ao mesmo tempo, e a específica
       ficaria inerte: a de dia inteiro cobre o minuto primeiro. */
    await criar(cozinha, '06:40', '15:00', 1);
    await criar(cozinha, '15:00', '23:40', 2);
    expect((await definirVinteQuatroHoras(admin(), { sectorId: cozinha, ligado: true, minPeople: 3 })).ok).toBe(true);

    const [setor] = (await getSetoresComFaixas(admin(), unitId)).filter((s) => s.id === cozinha);
    expect(setor.faixas).toHaveLength(1);
    expect(setor.faixas[0].diaInteiro).toBe(true);
    expect(setor.faixas[0].rotulo).toBe('00:00–24:00');
    expect(setor.faixas[0].minPeople).toBe(3);
  });

  it('desmarcar deixa o setor SEM exigência, e não com um horário inventado', async () => {
    await definirVinteQuatroHoras(admin(), { sectorId: cozinha, ligado: true, minPeople: 2 });
    await definirVinteQuatroHoras(admin(), { sectorId: cozinha, ligado: false });
    const [setor] = (await getSetoresComFaixas(admin(), unitId)).filter((s) => s.id === cozinha);
    expect(setor.faixas).toHaveLength(0);
  });

  it('desmarcar num setor que não era 24 horas não apaga as faixas dele', async () => {
    await criar(cozinha, '10:00', '15:00', 2);
    expect((await definirVinteQuatroHoras(admin(), { sectorId: cozinha, ligado: false })).ok).toBe(true);
    const [setor] = (await getSetoresComFaixas(admin(), unitId)).filter((s) => s.id === cozinha);
    expect(setor.faixas).toHaveLength(1);
  });

  it('respeita o escopo por unidade', async () => {
    const deOutraUnidade: SessionUser = { id: userId, name: 'X', role: 'MANAGER', unitIds: ['outra'], seesAllUnits: false, needsTerms: false };
    const r = await definirVinteQuatroHoras(deOutraUnidade, { sectorId: cozinha, ligado: true, minPeople: 1 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('FORBIDDEN');
  });
});

/**
 * O CENÁRIO DO PEDIDO, inteiro: unidade 24 horas em que cada função tem o seu
 * próprio horário. É o que o módulo precisa conseguir representar.
 */
describe('Unidade 24 horas com funções de horários diferentes', () => {
  it('Caixa 24h, Cozinha em dois turnos, Churrasqueira com buraco no meio', async () => {
    await definirVinteQuatroHoras(admin(), { sectorId: caixa, ligado: true, minPeople: 1 });
    expect((await criar(cozinha, '06:40', '15:00', 1)).ok).toBe(true);
    expect((await criar(cozinha, '15:00', '23:40', 1)).ok).toBe(true);

    const churrasqueira = (await prisma.sector.create({ data: { unitId, name: `Churrasqueira ${sfx}`, minHeadcount: 0 } })).id;
    expect((await criar(churrasqueira, '10:00', '15:00', 2)).ok).toBe(true);
    /* O intervalo 15:00–18:00 fica DE FORA de propósito: não existe
       necessidade ali, e o painel não deve cobrar ninguém. */
    expect((await criar(churrasqueira, '18:00', '23:00', 2)).ok).toBe(true);

    const setores = await getSetoresComFaixas(admin(), unitId);
    const porNome = (n: string) => setores.find((s) => s.name.startsWith(n))!;
    expect(porNome('Caixa').faixas).toHaveLength(1);
    expect(porNome('Caixa').faixas[0].diaInteiro).toBe(true);
    expect(porNome('Cozinha').faixas).toHaveLength(2);
    expect(porNome('Churrasqueira').faixas).toHaveLength(2);

    await prisma.sectorRequirement.deleteMany({ where: { sectorId: churrasqueira } });
    await prisma.sector.delete({ where: { id: churrasqueira } });
  });
});
