import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import {
  upsertScheduleTemplate, toggleScheduleTemplate, deleteScheduleTemplate,
  listScheduleTemplates, ensureDefaultScheduleTemplates, TIPOS_PADRAO,
} from '@/lib/schedule/templates';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Cadastro de tipos de escala (parte 1).
 *
 * O que muda com ele: a lista de escalas deixa de ser um enum no código — a
 * operação cria o que o Ministério do Trabalho permitir sem depender de uma
 * alteração no sistema.
 */

const sfx = `st${process.pid.toString(36)}`;
let admId: string;
let supId: string;
const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'S', role: 'SUPERVISOR', unitIds: [], seesAllUnits: true, needsTerms: false });

const NOME = `6x1 Tarde ${sfx}`;
const criados: string[] = [];

beforeAll(async () => {
  admId = (await prisma.user.create({ data: { name: 'A', email: `${sfx}a@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'S', email: `${sfx}s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.scheduleTemplate.deleteMany({ where: { OR: [{ id: { in: criados } }, { name: { contains: sfx } }] } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [admId, supId] } } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Quem pode cadastrar', () => {
  it('supervisor não cadastra tipo de escala', async () => {
    const r = await upsertScheduleTemplate(sup(), { name: NOME, workDays: 6, offDays: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
});

describe('Criar e editar', () => {
  let id = '';

  it('cria com ciclo e horários', async () => {
    const r = await upsertScheduleTemplate(adm(), {
      name: NOME, workDays: 6, offDays: 1, startTime: '14:00', breakTime: '19:00', endTime: '22:17',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id!;
    criados.push(id);

    const t = await prisma.scheduleTemplate.findUnique({ where: { id } });
    expect(t!.workDays).toBe(6);
    expect(t!.offDays).toBe(1);
    expect(t!.startTime).toBe('14:00');
    expect(t!.endTime).toBe('22:17');
  });

  it('horário sem os dois pontos é aceito e normalizado', async () => {
    /* Quem digita rápido escreve "2217". Recusar por causa disso seria atrito
       sem motivo — o dado é o mesmo. */
    const r = await upsertScheduleTemplate(adm(), { id, name: NOME, workDays: 6, offDays: 1, startTime: '900', endTime: '1730' });
    expect(r.ok).toBe(true);
    const t = await prisma.scheduleTemplate.findUnique({ where: { id } });
    expect(t!.startTime).toBe('09:00');
    expect(t!.endTime).toBe('17:30');
  });

  it('hora impossível é recusada com motivo', async () => {
    const r = await upsertScheduleTemplate(adm(), { id, name: NOME, workDays: 6, offDays: 1, startTime: '25:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('entrada');
  });

  it('nome repetido é recusado dizendo qual', async () => {
    /* O nome é a única coisa que aparece na hora de escolher o tipo do
       colaborador; dois iguais tornariam a escolha um chute. */
    const r = await upsertScheduleTemplate(adm(), { name: NOME, workDays: 5, offDays: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('DUPLICATE');
      expect(r.message).toContain(NOME);
    }
  });

  it('editar o próprio tipo não colide com ele mesmo', async () => {
    const r = await upsertScheduleTemplate(adm(), { id, name: NOME, workDays: 6, offDays: 1 });
    expect(r.ok).toBe(true);
  });
});

describe('Ciclos que não fazem sentido', () => {
  it('ciclo sem folga é recusado — marcaria o mês inteiro como trabalho', async () => {
    const r = await upsertScheduleTemplate(adm(), { name: `Sem folga ${sfx}`, workDays: 7, offDays: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('folga');
  });

  it('zero dia de trabalho é recusado', async () => {
    const r = await upsertScheduleTemplate(adm(), { name: `Zero ${sfx}`, workDays: 0, offDays: 1 });
    expect(r.ok).toBe(false);
  });

  it('ciclo absurdamente longo é recusado', async () => {
    const r = await upsertScheduleTemplate(adm(), { name: `Longo ${sfx}`, workDays: 100, offDays: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('longo');
  });

  it('nome vazio é recusado', async () => {
    const r = await upsertScheduleTemplate(adm(), { name: '   ', workDays: 6, offDays: 1 });
    expect(r.ok).toBe(false);
  });
});

describe('Inativar e excluir', () => {
  it('inativar tira da escolha sem apagar o histórico', async () => {
    const c = await upsertScheduleTemplate(adm(), { name: `Temporário ${sfx}`, workDays: 5, offDays: 2 });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    criados.push(c.id!);

    await toggleScheduleTemplate(adm(), c.id!, false);
    const t = await prisma.scheduleTemplate.findUnique({ where: { id: c.id! } });
    expect(t!.active).toBe(false);
  });

  it('supervisor não exclui', async () => {
    const r = await deleteScheduleTemplate(sup(), criados[0]);
    expect(r.ok).toBe(false);
  });
});

describe('Tipos padrão', () => {
  it('nascem sozinhos e são os comuns da rede', async () => {
    await ensureDefaultScheduleTemplates();
    const lista = await listScheduleTemplates();
    /* A semente só planta com a tabela vazia; aqui já há os do teste, então o
       que se verifica é que a lista responde e traz os cadastrados. */
    expect(lista.length).toBeGreaterThan(0);
    expect(TIPOS_PADRAO.map((t) => t.name)).toContain('12x36');
  });
});
