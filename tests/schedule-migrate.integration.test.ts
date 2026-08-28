import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { migrarEscalasLegadas, contarEscalasLegadas } from '@/lib/schedule/migrate';
import { historicoDeEscala } from '@/lib/schedule/employee';
import { vigenciaNaData } from '@/lib/schedule/vigencia';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Migração das escalas antigas (parte 3).
 *
 * O compromisso: **o passado não muda**. A escala legada é fechada na véspera do
 * corte e o formato novo vale a partir dali. Para 6x1/5x2 nada muda nem no
 * futuro; para o 12x36 a mudança é o objetivo.
 */

const sfx = `mg${process.pid.toString(36)}`;
let unitId: string;
let admId: string;
let seisUm = '';
let dozeTrintaSeis = '';
let custom = '';

const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const ger = (): SessionUser => ({ id: admId, name: 'G', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const CORTE = '2026-09-01';

async function criarColab(nome: string) {
  const c = await prisma.collaborator.create({ data: { name: `${nome} ${sfx}`, active: true } });
  await prisma.collaboratorUnit.create({ data: { collaboratorId: c.id, unitId } }).catch(() => {});
  return c.id;
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `MG-${sfx}`, name: 'U Mig', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  admId = (await prisma.user.create({ data: { name: 'A', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;

  seisUm = await criarColab('Seis Um');
  dozeTrintaSeis = await criarColab('Doze');
  custom = await criarColab('Custom');

  /* Escalas no formato ANTIGO: sem templateId, com startDate (backfill da
     parte 2) igual à âncora. */
  await prisma.employeeSchedule.create({
    data: { collaboratorId: seisUm, unitId, scheduleType: 'SIX_ONE', anchorDate: d('2026-05-04'), startDate: d('2026-05-04') },
  });
  await prisma.employeeSchedule.create({
    data: { collaboratorId: dozeTrintaSeis, unitId, scheduleType: 'TWELVE36_ODD', anchorDate: d('2026-05-04'), startDate: d('2026-05-04') },
  });
  await prisma.employeeSchedule.create({
    data: { collaboratorId: custom, unitId, scheduleType: 'CUSTOM', customMask: 'TFTFTFF', anchorDate: d('2026-05-04'), startDate: d('2026-05-04') },
  });
});

afterAll(async () => {
  const ids = [seisUm, dozeTrintaSeis, custom].filter(Boolean);
  await prisma.employeeSchedule.deleteMany({ where: { collaboratorId: { in: ids } } }).catch(() => {});
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: ids } } }).catch(() => {});
  await prisma.collaborator.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.employeeSchedule.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.user.delete({ where: { id: admId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Antes de migrar', () => {
  it('a tela consegue contar quantas ainda estão no formato antigo', async () => {
    expect(await contarEscalasLegadas(unitId)).toBe(3);
  });

  it('gerente não migra escala', async () => {
    /* É uma mudança em massa de dado de escala: só o Admin. */
    const r = await migrarEscalasLegadas(ger(), { unitId, aPartirDe: CORTE });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('sem data de corte, não roda', async () => {
    const r = await migrarEscalasLegadas(adm(), { unitId, aPartirDe: '' });
    expect(r.ok).toBe(false);
  });
});

describe('A migração', () => {
  it('migra o que dá e diz o que não deu', async () => {
    const r = await migrarEscalasLegadas(adm(), { unitId, aPartirDe: CORTE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.resultado.migradas).toBe(2); // 6x1 e 12x36
    expect(r.resultado.corrigidas).toBe(1); // só o 12x36 muda de resultado
    expect(r.resultado.puladas).toHaveLength(1);
    expect(r.resultado.puladas[0].motivo).toContain('trabalha X, folga Y');
  });

  it('O PASSADO NÃO MUDA: a escala antiga fica fechada na véspera', async () => {
    const hist = await historicoDeEscala(seisUm, unitId);
    expect(hist).toHaveLength(2);

    const antiga = hist.find((v) => v.templateId === null)!;
    expect(antiga.endDate?.toISOString().slice(0, 10)).toBe('2026-08-31');

    /* Agosto continua na versão antiga; setembro já na nova. */
    expect(vigenciaNaData(hist, d('2026-08-15'))?.templateId).toBeNull();
    expect(vigenciaNaData(hist, d('2026-09-15'))?.templateId).not.toBeNull();
  });

  it('6x1: o dia da folga é deduzido da âncora que a escala já usava', async () => {
    /* Âncora 04/05/2026 é segunda-feira; no 6x1 antigo a folga cai em
       âncora + 6 = domingo. A tradução tem de dizer domingo (0). */
    const hist = await historicoDeEscala(seisUm, unitId);
    const nova = hist.find((v) => v.templateId !== null)!;
    expect(nova.weeklyOffDay).toBe(0);
    expect(nova.offMode).toBe('FIXED_WEEKLY');
  });

  it('12x36 vira ciclo 1x1, sem dia fixo', async () => {
    const hist = await historicoDeEscala(dozeTrintaSeis, unitId);
    const nova = hist.find((v) => v.templateId !== null)!;
    expect(nova.weeklyOffDay).toBeNull();
    expect(nova.offMode).toBe('CYCLE_ONLY');
    expect(nova.template?.workDays).toBe(1);
    expect(nova.template?.offDays).toBe(1);
  });

  it('a personalizada alternada fica INTACTA — não se inventa tradução', async () => {
    const hist = await historicoDeEscala(custom, unitId);
    expect(hist).toHaveLength(1);
    expect(hist[0].templateId).toBeNull();
    expect(hist[0].endDate).toBeNull();
  });

  it('rodar de novo não duplica nada', async () => {
    /* O botão pode ser clicado duas vezes; a segunda não pode criar uma
       terceira vigência para quem já foi migrado. */
    const antes = (await historicoDeEscala(seisUm, unitId)).length;
    const r = await migrarEscalasLegadas(adm(), { unitId, aPartirDe: CORTE });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resultado.migradas).toBe(0);

    expect((await historicoDeEscala(seisUm, unitId)).length).toBe(antes);
  });

  it('sobra só a personalizada no formato antigo', async () => {
    expect(await contarEscalasLegadas(unitId)).toBe(1);
  });
});
