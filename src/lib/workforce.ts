import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type WfResult = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detail?: string };

export type Coverage = 'ok' | 'partial' | 'none';

/** Setores de referência (padrão) p/ acelerar a criação em cada unidade. Ordem alfabética. */
export const STANDARD_SECTORS = [
  'Açougue', 'Atendimento', 'Bar', 'Caixa', 'Churrasqueira', 'Copa', 'Cozinha',
  'Estoque', 'Forno', 'Garçom', 'Limpeza', 'Recepção', 'Salão', 'Sobremesas',
];

/** Rótulo de exibição de um turno (nome + faixa de horário, se houver). */
export function shiftLabel(s: { name: string; startTime?: string | null; endTime?: string | null }): string {
  if (s.startTime && s.endTime) return `${s.name} ${s.startTime}-${s.endTime}`;
  return s.name;
}

/**
 * Uma pessoa dentro de um setor no mapa do dia.
 *
 * Freelancer entra AQUI, e nao numa lista paralela: a planta da unidade conta
 * o que esta nas celulas, entao um freelancer alocado em Pratos aparecia como
 * "Pratos 0/1 · vazio" — a alocacao existia e a tela dizia o contrario.
 */
export interface PessoaNaCelula {
  id: string;
  name: string;
  source: string;
  kind?: 'STAFF' | 'FREELANCER';
  /** Freelancer cujo pagamento ainda nao foi aprovado — aloca do mesmo jeito. */
  pendente?: boolean;
  horario?: string | null;
}

export interface WorkforceGrid {
  sectors: { id: string; name: string; minHeadcount: number }[];
  shifts: { id: string | null; label: string }[];
  /** cells[sectorId][label] = quem está naquele setor/turno — efetivo E freelancer */
  cells: Record<string, Record<string, PessoaNaCelula[]>>;
  coverage: Record<string, Record<string, Coverage>>;
}

/**
 * Em que coluna (turno) o freelancer entra: a que contém o horário dele.
 *
 * Sem horário, ou sem coluna que sirva, ele vai para a primeira — melhor
 * aparecer na coluna aproximada do que sumir do mapa, que era o problema.
 */
function colunaDoFreelancer(f: { startTime: string | null }, cols: { label: string; start: number | null; end: number | null }[]): string | null {
  if (cols.length === 0) return null;
  const ini = parseHM(f.startTime);
  if (ini == null) return cols[0].label;
  return (cols.find((c) => inWindow(ini, c.start, c.end)) ?? cols[0]).label;
}

/** Monta a grade Setor × Turno × Colaboradores + cobertura (Módulo 9.3). */
export async function getWorkforceGrid(unitId: string): Promise<WorkforceGrid> {
  const [sectors, turnos, allocations] = await Promise.all([
    prisma.sector.findMany({ where: { unitId, active: true }, orderBy: { name: 'asc' } }),
    prisma.shift.findMany({ where: { unitId, active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    prisma.workforceAllocation.findMany({ where: { unitId }, include: { collaborator: { select: { name: true } }, shiftRef: true } }),
  ]);

  // Colunas: turnos cadastrados + rótulos legados presentes em alocações sem turno
  const cols: { id: string | null; label: string }[] = turnos.map((t) => ({ id: t.id, label: shiftLabel(t) }));
  const colByLabel = new Map(cols.map((c) => [c.label, c]));
  const allocLabel = (a: (typeof allocations)[number]) => (a.shiftRef ? shiftLabel(a.shiftRef) : a.shift);
  for (const a of allocations) {
    const label = allocLabel(a);
    if (!colByLabel.has(label)) {
      const c = { id: a.shiftRef?.id ?? null, label };
      colByLabel.set(label, c);
      cols.push(c);
    }
  }

  const cells: WorkforceGrid['cells'] = {};
  const coverage: WorkforceGrid['coverage'] = {};
  for (const s of sectors) {
    cells[s.id] = {};
    coverage[s.id] = {};
    for (const col of cols) {
      const people = allocations
        .filter((a) => a.sectorId === s.id && allocLabel(a) === col.label)
        .map((a) => ({ id: a.id, name: a.collaborator?.name ?? a.collaboratorName ?? '—', source: a.source }));
      cells[s.id][col.label] = people;
      coverage[s.id][col.label] = people.length === 0 ? 'none' : people.length < s.minHeadcount ? 'partial' : 'ok';
    }
  }

  return { sectors: sectors.map((s) => ({ id: s.id, name: s.name, minHeadcount: s.minHeadcount })), shifts: cols, cells, coverage };
}

/** Quadro padrão em duas listas: quem ainda falta alocar × quem já está alocado. */
export interface AllocationBoard {
  toAllocate: { id: string; name: string }[];
  allocated: { allocationId: string; collaboratorId: string; name: string; jobTitle: string | null; sectorId: string; sectorName: string; shiftId: string | null; shiftLabel: string }[];
}
export async function getAllocationBoard(unitId: string): Promise<AllocationBoard> {
  const [collabs, allocations] = await Promise.all([
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unitId } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.workforceAllocation.findMany({ where: { unitId }, include: { collaborator: { select: { name: true, jobTitle: true } }, sector: { select: { name: true } }, shiftRef: true } }),
  ]);
  const allocatedIds = new Set(allocations.map((a) => a.collaboratorId).filter(Boolean) as string[]);
  const toAllocate = collabs.filter((c) => !allocatedIds.has(c.id));
  const allocated = allocations
    .map((a) => ({
      allocationId: a.id,
      collaboratorId: a.collaboratorId ?? '',
      name: a.collaborator?.name ?? a.collaboratorName ?? '—',
      jobTitle: a.collaborator?.jobTitle ?? null,
      sectorId: a.sectorId,
      sectorName: a.sector?.name ?? '—',
      shiftId: a.shiftRef?.id ?? a.shiftId ?? null,
      shiftLabel: a.shiftRef ? shiftLabel(a.shiftRef) : a.shift,
    }))
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
  return { toAllocate, allocated };
}

/** Edita o setor/turno de uma alocação existente (mover de lugar no quadro). */
export async function updateAllocation(user: SessionUser, id: string, input: { sectorId: string; shiftId: string }, ctx: Ctx = {}): Promise<WfResult> {
  const a = await prisma.workforceAllocation.findUnique({
    where: { id },
    select: { unitId: true, sectorId: true, collaboratorId: true, collaboratorName: true, sector: { select: { name: true } }, collaborator: { select: { name: true } } },
  });
  if (!a) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, a.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.sectorId || !input.shiftId) return { ok: false, reason: 'INVALID', detail: 'Selecione setor e turno.' };
  const [sector, turno] = await Promise.all([
    prisma.sector.findUnique({ where: { id: input.sectorId }, select: { unitId: true, name: true } }),
    prisma.shift.findUnique({ where: { id: input.shiftId }, select: { unitId: true, name: true, startTime: true, endTime: true } }),
  ]);
  if (!sector || sector.unitId !== a.unitId) return { ok: false, reason: 'INVALID', detail: 'Setor não pertence a esta unidade.' };
  if (!turno || turno.unitId !== a.unitId) return { ok: false, reason: 'INVALID', detail: 'Turno não pertence a esta unidade.' };
  await prisma.workforceAllocation.update({ where: { id }, data: { sectorId: input.sectorId, shiftId: input.shiftId, shift: shiftLabel(turno) } });
  await audit({ userId: user.id, unitId: a.unitId, action: 'ALLOCATE_UPDATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: id, ...ctx });
  // Mudou de setor → registro consolidado p/ o RH (item 12) + aviso aos Admins
  if (a.sectorId !== input.sectorId && a.collaboratorId) {
    const { recordSectorChange } = await import('@/lib/people/role-change');
    await recordSectorChange(user, {
      collaboratorId: a.collaboratorId,
      collaboratorName: a.collaborator?.name ?? a.collaboratorName ?? '—',
      unitId: a.unitId,
      from: a.sector?.name ?? null,
      to: sector.name,
    }).catch(() => {});
  }
  await reconcileTraining(a.unitId);
  return { ok: true };
}

/* ───────── Mapa do dia (derivado da Escala) ───────── */
function parseHM(s?: string | null): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
/** true se o "agora" (min) cai na janela do turno. Sem horário = dia todo. Vira a meia-noite OK. */
function inWindow(now: number, start: number | null, end: number | null): boolean {
  if (start == null || end == null || start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}
/** Colaboradores com status WORK (realizado ou planejado) na data. */
async function workingSetForDate(unitId: string, dateISO: string): Promise<Set<string>> {
  const set = new Set<string>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return set;
  const { getScheduleGrid } = await import('@/lib/schedule');
  const [y, m, d] = dateISO.split('-').map(Number);
  const grid = await getScheduleGrid(unitId, y, m);
  for (const row of grid.rows) {
    const cell = row.days[d - 1];
    const st = cell ? (cell.actual ?? cell.planned) : null;
    if (st === 'WORK' || st === 'ATRASO') set.add(row.collaboratorId); // atraso = presente (chegou tarde)
  }
  return set;
}

/**
 * Mapa da unidade para um DIA, derivado da Escala (quem realmente trabalha).
 * - nowMinutes != null → filtra também pela janela do turno ("na unidade agora").
 * - nowMinutes == null → mostra todos os escalados do dia (visão histórica).
 * Folga/falta/atestado/férias não entram (não têm status WORK).
 */
export async function getUnitDayMap(unitId: string, dateISO: string, nowMinutes: number | null): Promise<WorkforceGrid> {
  const [sectors, turnos, allocations, working, freelas] = await Promise.all([
    prisma.sector.findMany({ where: { unitId, active: true }, orderBy: { name: 'asc' } }),
    prisma.shift.findMany({ where: { unitId, active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }] }),
    prisma.workforceAllocation.findMany({ where: { unitId }, include: { collaborator: { select: { name: true } }, shiftRef: true } }),
    workingSetForDate(unitId, dateISO),
    /* Freelancer alocado entra na grade como qualquer outro. A aprovacao do
       PAGAMENTO nao tem nada a ver com estar no setor: quem trabalhou hoje
       aparece hoje. */
    getDayFreelancers(unitId, dateISO, nowMinutes),
  ]);

  type Col = { id: string | null; label: string; start: number | null; end: number | null };
  const cols: Col[] = turnos.map((t) => ({ id: t.id, label: shiftLabel(t), start: parseHM(t.startTime), end: parseHM(t.endTime) }));
  const colByLabel = new Map(cols.map((c) => [c.label, c]));
  const allocLabel = (a: (typeof allocations)[number]) => (a.shiftRef ? shiftLabel(a.shiftRef) : a.shift);
  for (const a of allocations) {
    const label = allocLabel(a);
    if (!colByLabel.has(label)) {
      const c: Col = { id: a.shiftRef?.id ?? null, label, start: parseHM(a.shiftRef?.startTime), end: parseHM(a.shiftRef?.endTime) };
      colByLabel.set(label, c); cols.push(c);
    }
  }

  const visible = allocations.filter((a) => {
    if (!a.collaboratorId || !working.has(a.collaboratorId)) return false;
    if (nowMinutes == null) return true;
    const col = colByLabel.get(allocLabel(a));
    return inWindow(nowMinutes, col?.start ?? null, col?.end ?? null);
  });

  const cells: WorkforceGrid['cells'] = {};
  const coverage: WorkforceGrid['coverage'] = {};
  for (const s of sectors) {
    cells[s.id] = {}; coverage[s.id] = {};
    for (const col of cols) {
      const people: PessoaNaCelula[] = visible
        .filter((a) => a.sectorId === s.id && allocLabel(a) === col.label)
        .map((a) => ({ id: a.id, name: a.collaborator?.name ?? a.collaboratorName ?? '—', source: a.source, kind: 'STAFF' as const }));
      for (const f of freelas) {
        if (f.sectorId !== s.id || colunaDoFreelancer(f, cols) !== col.label) continue;
        people.push({
          id: `freela-${f.requestId}`, name: f.name, source: 'FREELANCER', kind: 'FREELANCER',
          pendente: f.status === 'PENDING',
          horario: f.startTime && f.endTime ? `${f.startTime}-${f.endTime}` : null,
        });
      }
      cells[s.id][col.label] = people;
      coverage[s.id][col.label] = people.length === 0 ? 'none' : people.length < s.minHeadcount ? 'partial' : 'ok';
    }
  }

  return { sectors: sectors.map((s) => ({ id: s.id, name: s.name, minHeadcount: s.minHeadcount })), shifts: cols.map((c) => ({ id: c.id, label: c.label })), cells, coverage };
}

/* ───────── Simulação de dia futuro (16/07) ───────── */
export interface SimAssignment { collaboratorId: string; name: string; sectorId: string; sectorName: string }

/** Salva/atualiza a simulação de alocação de um dia futuro (rascunho do gerente). */
export async function saveSimulation(user: SessionUser, unitId: string, date: string, assignments: SimAssignment[], note: string | undefined, ctx: Ctx = {}): Promise<WfResult> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!/^d{4}-d{2}-d{2}$/.test(date)) return { ok: false, reason: 'INVALID' };
  const today = new Date().toISOString().slice(0, 10);
  if (date <= today) return { ok: false, reason: 'INVALID', detail: 'Simulação é só para dias futuros (o passado é histórico congelado).' };
  await prisma.workforceSimulation.upsert({
    where: { unitId_date: { unitId, date } },
    create: { unitId, date, assignments: assignments as object, note: note?.trim() || null, createdById: user.id, createdByName: user.name },
    update: { assignments: assignments as object, note: note?.trim() || null, createdById: user.id, createdByName: user.name },
  });
  await audit({ userId: user.id, unitId, action: 'WORKFORCE_SIMULATION_SAVE', module: 'PEOPLE', entity: 'workforce_simulation', metadata: { date, people: assignments.length }, ...ctx });
  return { ok: true };
}

export async function getSimulation(unitId: string, date: string) {
  return prisma.workforceSimulation.findUnique({ where: { unitId_date: { unitId, date } } });
}

/* ───────── Histórico por dia (snapshot) ───────── */
/** Congela o mapa de um dia (idempotente: não refaz se já existe — preserva o passado). */
export async function snapshotUnitDay(unitId: string, dateISO: string): Promise<{ created: number }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { created: 0 };
  const exists = await prisma.workforceDaySnapshot.count({ where: { unitId, date: dateISO } });
  if (exists > 0) return { created: 0 };

  const [map, freelancers] = await Promise.all([
    getUnitDayMap(unitId, dateISO, null),
    getDayFreelancers(unitId, dateISO, null),
  ]);
  const rows: { unitId: string; date: string; sectorName: string; shiftLabel: string; personName: string; kind: string }[] = [];
  for (const s of map.sectors) {
    for (const col of map.shifts) {
      for (const p of map.cells[s.id]?.[col.label] ?? []) {
        /* O freelancer ja vem DENTRO da celula desde que o mapa passou a
           conta-lo; gravar 'STAFF' aqui e repetir na volta de baixo daria a
           mesma pessoa duas vezes no historico. */
        rows.push({ unitId, date: dateISO, sectorName: s.name, shiftLabel: col.label, personName: p.name, kind: p.kind ?? 'STAFF' });
      }
    }
  }
  /* Freelancer SEM setor nao entra na grade (nao ha onde), mas o dia dele
     existiu — vai para o historico numa linha propria. */
  for (const f of freelancers) {
    if (f.sectorId) continue;
    rows.push({ unitId, date: dateISO, sectorName: 'Sem setor', shiftLabel: f.startTime && f.endTime ? `${f.startTime}-${f.endTime}` : 'Freelancer', personName: f.name, kind: 'FREELANCER' });
  }
  if (rows.length === 0) return { created: 0 };
  await prisma.workforceDaySnapshot.createMany({ data: rows });
  return { created: rows.length };
}

/** Reconstrói a grade de um dia a partir do snapshot (somente leitura). null se não houver. */
export async function getSnapshotGrid(unitId: string, dateISO: string): Promise<WorkforceGrid | null> {
  const rows = await prisma.workforceDaySnapshot.findMany({ where: { unitId, date: dateISO }, orderBy: [{ sectorName: 'asc' }, { shiftLabel: 'asc' }] });
  if (rows.length === 0) return null;
  const sectorNames = [...new Set(rows.map((r) => r.sectorName))];
  const shiftLabels = [...new Set(rows.map((r) => r.shiftLabel))];
  const cells: WorkforceGrid['cells'] = {};
  const coverage: WorkforceGrid['coverage'] = {};
  for (const sn of sectorNames) {
    cells[sn] = {}; coverage[sn] = {};
    for (const sl of shiftLabels) {
      const people = rows.filter((r) => r.sectorName === sn && r.shiftLabel === sl).map((r, i) => ({ id: `${sn}-${sl}-${i}`, name: r.personName, source: r.kind }));
      cells[sn][sl] = people;
      coverage[sn][sl] = people.length === 0 ? 'none' : 'ok';
    }
  }
  return {
    sectors: sectorNames.map((sn) => ({ id: sn, name: sn, minHeadcount: 0 })),
    shifts: shiftLabels.map((sl) => ({ id: null, label: sl })),
    cells, coverage,
  };
}

/** Congela "ontem" (no fuso de cada unidade) para todas as unidades ativas. Idempotente. */
export async function snapshotYesterdayAllUnits(): Promise<{ units: number; rows: number }> {
  const units = await prisma.unit.findMany({ where: { active: true }, select: { id: true, timezone: true } });
  let rows = 0; let touched = 0;
  for (const u of units) {
    const tz = u.timezone || 'America/Sao_Paulo';
    const now = new Date();
    const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const [y, m, d] = todayISO.split('-').map(Number);
    const yest = new Date(Date.UTC(y, m - 1, d - 1));
    const yISO = `${yest.getUTCFullYear()}-${String(yest.getUTCMonth() + 1).padStart(2, '0')}-${String(yest.getUTCDate()).padStart(2, '0')}`;
    const r = await snapshotUnitDay(u.id, yISO);
    if (r.created > 0) { touched += 1; rows += r.created; }
  }
  return { units: touched, rows };
}

/** Freelancers com pedido de pagamento para o dia (disponíveis para alocar). */
export interface DayFreelancer {
  requestId: string;
  name: string;
  sectorId: string | null;
  sectorName: string | null;
  startTime: string | null;
  endTime: string | null;
  present: boolean; // dentro da janela agora (ou true se nowMinutes==null / sem horário)
  status: string;
}
export async function getDayFreelancers(unitId: string, dateISO: string, nowMinutes: number | null): Promise<DayFreelancer[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return [];
  const [y, m, d] = dateISO.split('-').map(Number);
  const dayStart = new Date(Date.UTC(y, m - 1, d));
  const dayEnd = new Date(Date.UTC(y, m - 1, d + 1));
  const reqs = await prisma.paymentRequest.findMany({
    where: { unitId, type: 'FREELANCER', status: { not: 'REJECTED' }, workDate: { gte: dayStart, lt: dayEnd } },
    include: { freelancer: { select: { name: true } }, workSector: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return reqs.map((r) => ({
    requestId: r.id,
    name: r.freelancer?.name ?? 'Freelancer',
    sectorId: r.workSectorId,
    sectorName: r.workSector?.name ?? null,
    startTime: r.workStartTime,
    endTime: r.workEndTime,
    present: nowMinutes == null ? true : inWindow(nowMinutes, parseHM(r.workStartTime), parseHM(r.workEndTime)),
    status: r.status,
  }));
}

/** Aloca (ou remove a alocação de) um freelancer num setor para o dia do pedido. */
export async function assignFreelancerSector(user: SessionUser, requestId: string, sectorId: string | null, ctx: Ctx = {}): Promise<WfResult> {
  const r = await prisma.paymentRequest.findUnique({ where: { id: requestId }, select: { unitId: true, type: true } });
  if (!r || r.type !== 'FREELANCER') return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, r.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (sectorId) {
    const sector = await prisma.sector.findUnique({ where: { id: sectorId }, select: { unitId: true } });
    if (!sector || sector.unitId !== r.unitId) return { ok: false, reason: 'INVALID', detail: 'Setor não pertence a esta unidade.' };
  }
  await prisma.paymentRequest.update({ where: { id: requestId }, data: { workSectorId: sectorId } });
  await audit({ userId: user.id, unitId: r.unitId, action: 'FREELANCER_ALLOCATE', module: 'PEOPLE', entity: 'payment_request', entityId: requestId, metadata: { sectorId }, ...ctx });
  return { ok: true };
}

/* ───────── Setores (Admin) ───────── */
export async function createSector(user: SessionUser, input: { unitId: string; name: string; minHeadcount?: number }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const s = await prisma.sector.create({ data: { unitId: input.unitId, name: input.name.trim(), minHeadcount: Math.max(0, Math.trunc(input.minHeadcount ?? 1)) } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SECTOR_CREATE', module: 'PEOPLE', entity: 'sector', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

export async function updateSector(user: SessionUser, id: string, input: { name?: string; minHeadcount?: number }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.sector.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.minHeadcount !== undefined ? { minHeadcount: Math.max(0, Math.trunc(input.minHeadcount)) } : {}),
    },
  });
  await audit({ userId: user.id, action: 'SECTOR_UPDATE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

export async function toggleSector(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.sector.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'SECTOR_ACTIVATE' : 'SECTOR_DEACTIVATE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteSector(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.sector.findUnique({ where: { id }, select: { unitId: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.sector.delete({ where: { id } }); // alocações do setor saem em cascade
  await audit({ userId: user.id, unitId: s.unitId, action: 'SECTOR_DELETE', module: 'PEOPLE', entity: 'sector', entityId: id, ...ctx });
  return { ok: true };
}

/* ───────── Turnos / horários por unidade (Admin) ───────── */
export async function listShifts(unitId: string) {
  return prisma.shift.findMany({ where: { unitId }, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
}

export async function createShift(user: SessionUser, input: { unitId: string; name: string; startTime?: string; endTime?: string }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !input.name?.trim()) return { ok: false, reason: 'INVALID' };
  const count = await prisma.shift.count({ where: { unitId: input.unitId } });
  const s = await prisma.shift.create({
    data: { unitId: input.unitId, name: input.name.trim(), startTime: input.startTime?.trim() || null, endTime: input.endTime?.trim() || null, order: count },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'SHIFT_CREATE', module: 'PEOPLE', entity: 'shift', entityId: s.id, ...ctx });
  return { ok: true, id: s.id };
}

export async function updateShift(user: SessionUser, id: string, input: { name?: string; startTime?: string; endTime?: string; active?: boolean }, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (input.name !== undefined && !input.name.trim()) return { ok: false, reason: 'INVALID' };
  await prisma.shift.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime.trim() || null } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime.trim() || null } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  await audit({ userId: user.id, action: 'SHIFT_UPDATE', module: 'PEOPLE', entity: 'shift', entityId: id, ...ctx });
  return { ok: true };
}

export async function deleteShift(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.shift.findUnique({ where: { id }, select: { unitId: true } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.shift.delete({ where: { id } }); // alocações: shiftId vira NULL (mantém rótulo)
  await audit({ userId: user.id, unitId: s.unitId, action: 'SHIFT_DELETE', module: 'PEOPLE', entity: 'shift', entityId: id, ...ctx });
  return { ok: true };
}

/* ───────── Alocação (gerente/coordenador/supervisor/admin com acesso) ───────── */
export async function allocate(user: SessionUser, input: { unitId: string; sectorId: string; shiftId?: string; shift?: string; collaboratorId: string }, ctx: Ctx = {}): Promise<WfResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.sectorId) return { ok: false, reason: 'INVALID', detail: 'Selecione um setor.' };
  if (!input.collaboratorId) return { ok: false, reason: 'INVALID', detail: 'Selecione um colaborador.' };

  // Resolve o turno: por id (preferido) ou rótulo livre (compat)
  let shiftId: string | null = null;
  let shiftText = input.shift?.trim() || '';
  if (input.shiftId) {
    const turno = await prisma.shift.findUnique({ where: { id: input.shiftId }, select: { unitId: true, name: true, startTime: true, endTime: true } });
    if (!turno || turno.unitId !== input.unitId) return { ok: false, reason: 'INVALID', detail: 'Turno não pertence a esta unidade — recarregue a página e tente de novo.' };
    shiftId = input.shiftId;
    shiftText = shiftLabel(turno);
  }
  if (!shiftText) return { ok: false, reason: 'INVALID', detail: 'Selecione um turno.' };

  const [sector, link] = await Promise.all([
    prisma.sector.findUnique({ where: { id: input.sectorId }, select: { unitId: true } }),
    prisma.collaboratorUnit.findUnique({
      where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } },
      select: { id: true },
    }),
  ]);
  if (!sector || sector.unitId !== input.unitId) return { ok: false, reason: 'INVALID', detail: 'Setor não pertence a esta unidade — recarregue a página e tente de novo.' };
  if (!link) return { ok: false, reason: 'INVALID', detail: 'Este colaborador não está vinculado a esta unidade.' };
  const a = await prisma.workforceAllocation.create({ data: { unitId: input.unitId, sectorId: input.sectorId, shift: shiftText, shiftId, collaboratorId: input.collaboratorId, source: 'MANUAL' } });
  await audit({ userId: user.id, unitId: input.unitId, action: 'ALLOCATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: a.id, ...ctx });
  await notifyWorkforceChange(user, input.unitId, input.sectorId, input.collaboratorId, shiftText, 'alocou', `/modulos/pessoas/mapa?unit=${input.unitId}`);
  await reconcileTraining(input.unitId); // gera os treinamentos do novo setor
  return { ok: true, id: a.id };
}

export async function removeAllocation(user: SessionUser, id: string, ctx: Ctx = {}): Promise<WfResult> {
  const a = await prisma.workforceAllocation.findUnique({
    where: { id },
    include: { sector: { select: { name: true } }, collaborator: { select: { name: true } }, unit: { select: { name: true } } },
  });
  if (!a) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, a.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  await prisma.workforceAllocation.delete({ where: { id } });
  await audit({ userId: user.id, unitId: a.unitId, action: 'DEALLOCATE', module: 'PEOPLE', entity: 'workforce_allocation', entityId: id, ...ctx });
  await reconcileTraining(a.unitId); // remove pendências de treinamento do setor que saiu
  const who = a.collaborator?.name ?? a.collaboratorName ?? 'colaborador';
  await notifyAdmins({
    title: 'Mapa de Funções alterado',
    body: `${user.name} removeu ${who} de ${a.sector?.name ?? 'setor'} / ${a.shift} (${a.unit?.name ?? ''}). Avise o RH.`,
    link: `/modulos/pessoas/mapa?unit=${a.unitId}`,
    module: 'PEOPLE',
  });
  return { ok: true };
}

/** Reconciliação de treinamentos da unidade (import dinâmico evita ciclo). */
async function reconcileTraining(unitId: string) {
  const { reconcileTrainingForUnit } = await import('@/lib/training');
  await reconcileTrainingForUnit(unitId).catch(() => {});
}

/** Notifica os administradores sobre uma alteração de alocação (avisar o RH). */
async function notifyWorkforceChange(user: SessionUser, unitId: string, sectorId: string, collaboratorId: string, shift: string, verbo: string, link: string) {
  const [unit, sector, collab] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } }),
    prisma.sector.findUnique({ where: { id: sectorId }, select: { name: true } }),
    prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true } }),
  ]);
  await notifyAdmins({
    title: 'Mapa de Funções alterado',
    body: `${user.name} ${verbo} ${collab?.name ?? 'colaborador'} em ${sector?.name ?? 'setor'} / ${shift} (${unit?.name ?? ''}). Avise o RH.`,
    link,
    module: 'PEOPLE',
  });
}
