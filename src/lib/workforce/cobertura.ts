import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import {
  necessidadeNoMinuto, statusDaCobertura, segmentosDoDia, conflitoDeFaixa, faixaValida,
  rotuloDaFaixa, emHHMM, faixaCobre,
  type FaixaDeNecessidade, type StatusDeCobertura,
} from '@/lib/workforce/necessidade';
import type { SessionUser } from '@/lib/auth/session';

/**
 * COBERTURA DO MAPA — quem está no setor agora, contra o que o setor precisa.
 *
 * A regra, na ordem do pedido: unidade + setor + data/hora → faixa de
 * necessidade daquele horário → quem está trabalhando naquele momento → quem
 * desses está alocado naquele setor → compara.
 *
 * O turno **não** cria exigência. Ele responde uma pergunta só: *essa pessoa
 * está trabalhando neste horário?* Era isso que estava invertido — a exigência
 * saía de `minHeadcount × turnos cadastrados`.
 */

export interface PessoaNoSetor {
  id: string;
  name: string;
  kind: 'STAFF' | 'FREELANCER';
  /** Janela do turno dela, para a tela explicar por que ela conta agora. */
  horario: string | null;
}

export interface CoberturaDoSetor {
  sectorId: string;
  sectorName: string;
  necessario: number;
  presentes: number;
  status: StatusDeCobertura;
  /** Quantos acima do mínimo. 0 quando não há excedente. */
  excedente: number;
  /** A faixa que vale neste horário, para o card dizer de onde veio o número. */
  faixaAtual: string | null;
  pessoas: PessoaNoSetor[];
}

export interface CoberturaDaUnidade {
  unitId: string;
  unitName: string;
  dateISO: string;
  minuto: number;
  horaLabel: string;
  setores: CoberturaDoSetor[];
  /** Setores abaixo do mínimo agora. */
  abaixoDoMinimo: CoberturaDoSetor[];
  /** Setores com gente sobrando — a outra metade da sugestão de realocação. */
  comExcedente: CoberturaDoSetor[];
}

/** As faixas de cada setor da unidade, na ordem de cadastro. */
async function faixasPorSetor(unitId: string): Promise<Map<string, FaixaDeNecessidade[]>> {
  const reqs = await prisma.sectorRequirement.findMany({
    where: { sector: { unitId } },
    orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    select: { sectorId: true, startTime: true, endTime: true, minPeople: true },
  });
  const out = new Map<string, FaixaDeNecessidade[]>();
  for (const r of reqs) {
    const lista = out.get(r.sectorId) ?? [];
    lista.push({ startTime: r.startTime, endTime: r.endTime, minPeople: r.minPeople });
    out.set(r.sectorId, lista);
  }
  return out;
}

/**
 * A cobertura da unidade num instante.
 *
 * Reusa `getUnitDayMap` de propósito: é ele que já sabe quem tem escala de
 * trabalho no dia, quem está dentro da janela do turno e como o freelancer
 * alocado entra na conta. Duplicar essa regra aqui criaria duas definições de
 * "está trabalhando agora", e uma delas ficaria para trás.
 */
export async function getCoberturaDaUnidade(
  user: SessionUser,
  unitId: string,
  dateISO: string,
  minuto: number,
): Promise<CoberturaDaUnidade | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true } });
  if (!unit) return null;

  const { getUnitDayMap } = await import('@/lib/workforce');
  const [mapa, faixas] = await Promise.all([
    getUnitDayMap(unitId, dateISO, minuto),
    faixasPorSetor(unitId),
  ]);

  const setores: CoberturaDoSetor[] = mapa.sectors.map((s) => {
    const doSetor = faixas.get(s.id) ?? [];
    const necessario = necessidadeNoMinuto(doSetor, minuto);

    /* O mapa devolve as pessoas por COLUNA de turno; aqui elas se juntam, porque
       a pergunta deixou de ser "quem está no turno da manhã" e passou a ser
       "quem está no setor às 10:30". */
    const pessoas: PessoaNoSetor[] = [];
    const vistos = new Set<string>();
    for (const col of mapa.shifts) {
      for (const p of mapa.cells[s.id]?.[col.label] ?? []) {
        if (vistos.has(p.id)) continue;
        vistos.add(p.id);
        pessoas.push({ id: p.id, name: p.name, kind: p.kind ?? 'STAFF', horario: p.horario ?? col.label });
      }
    }

    /* A faixa que cobre este minuto — a pergunta é literalmente essa, e
       `faixaCobre` já a responde. É o que permite o card dizer "faixa atual:
       14:00–22:00, necessidade 2" em vez de só mostrar um número solto. */
    const faixaAtual = doSetor.find((f) => faixaCobre(f, minuto)) ?? null;

    return {
      sectorId: s.id,
      sectorName: s.name,
      necessario,
      presentes: pessoas.length,
      status: statusDaCobertura(necessario, pessoas.length),
      excedente: necessario > 0 ? Math.max(0, pessoas.length - necessario) : 0,
      faixaAtual: faixaAtual ? rotuloDaFaixa(faixaAtual) : null,
      pessoas,
    };
  });

  return {
    unitId: unit.id,
    unitName: unit.name,
    dateISO,
    minuto,
    horaLabel: emHHMM(minuto),
    setores,
    abaixoDoMinimo: setores.filter((s) => s.status === 'PARCIAL' || s.status === 'SEM_COBERTURA'),
    comExcedente: setores.filter((s) => s.excedente > 0),
  };
}

export interface TrechoDoDia {
  rotulo: string;
  inicio: number;
  necessario: number;
  presentes: number;
  status: StatusDeCobertura;
}

export interface VisaoDoDiaDoSetor {
  sectorId: string;
  sectorName: string;
  trechos: TrechoDoDia[];
  /** Intervalos em que o setor fica ABAIXO do mínimo — o alerta do pedido. */
  buracos: { rotulo: string; necessario: number; presentes: number }[];
}

/**
 * Como a cobertura varia ao longo do dia.
 *
 * O dia é partido nos trechos em que a NECESSIDADE não muda, e cada trecho é
 * medido pelo seu minuto inicial. É uma aproximação consciente: se alguém
 * entrar no meio de um trecho, o número mostrado é o do começo dele. A
 * alternativa — 1440 consultas ao mapa — seria exata e inutilizável.
 */
export async function getVisaoDoDia(
  user: SessionUser,
  unitId: string,
  dateISO: string,
): Promise<VisaoDoDiaDoSetor[]> {
  if (!canAccessUnit(user, unitId)) return [];
  const faixas = await faixasPorSetor(unitId);

  const { getUnitDayMap } = await import('@/lib/workforce');
  const setoresBase = (await getUnitDayMap(unitId, dateISO, null)).sectors;

  /* Os cortes do dia: a união dos inícios de trecho de TODOS os setores, para
     todos serem medidos nos mesmos instantes e a tela poder comparar linhas. */
  const cortes = new Set<number>([0]);
  for (const s of setoresBase) {
    for (const seg of segmentosDoDia(faixas.get(s.id) ?? [])) cortes.add(seg.inicio);
  }
  const instantes = [...cortes].sort((a, b) => a - b);

  const mapas = new Map<number, Awaited<ReturnType<typeof getUnitDayMap>>>();
  for (const m of instantes) mapas.set(m, await getUnitDayMap(unitId, dateISO, m));

  return setoresBase.map((s) => {
    const doSetor = faixas.get(s.id) ?? [];
    const segs = segmentosDoDia(doSetor);
    const trechos: TrechoDoDia[] = segs.map((seg) => {
      const mapa = mapas.get(seg.inicio);
      const vistos = new Set<string>();
      let presentes = 0;
      for (const col of mapa?.shifts ?? []) {
        for (const p of mapa?.cells[s.id]?.[col.label] ?? []) {
          if (vistos.has(p.id)) continue;
          vistos.add(p.id);
          presentes++;
        }
      }
      return {
        rotulo: seg.rotulo, inicio: seg.inicio,
        necessario: seg.necessario, presentes,
        status: statusDaCobertura(seg.necessario, presentes),
      };
    });

    return {
      sectorId: s.id,
      sectorName: s.name,
      trechos,
      buracos: trechos
        .filter((t) => t.status === 'PARCIAL' || t.status === 'SEM_COBERTURA')
        .map((t) => ({ rotulo: t.rotulo, necessario: t.necessario, presentes: t.presentes })),
    };
  });
}

/* ───────────────────────── Cadastro das faixas ───────────────────────── */

export type ResultadoDeFaixa =
  | { ok: true; id?: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLITO' | 'NAO_ENCONTRADO'; erro?: string };

async function setorNoEscopo(user: SessionUser, sectorId: string) {
  const s = await prisma.sector.findUnique({ where: { id: sectorId }, select: { id: true, unitId: true, name: true } });
  if (!s || !canAccessUnit(user, s.unitId)) return null;
  return s;
}

/** Cria (ou edita) uma faixa, recusando sobreposição. */
export async function salvarFaixa(
  user: SessionUser,
  input: { sectorId: string; id?: string; startTime: string; endTime: string; minPeople: number },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDeFaixa> {
  const setor = await setorNoEscopo(user, input.sectorId);
  if (!setor) return { ok: false, reason: 'FORBIDDEN' };

  const nova: FaixaDeNecessidade = { startTime: input.startTime, endTime: input.endTime, minPeople: Math.trunc(input.minPeople) };
  const valida = faixaValida(nova);
  if (!valida.ok) return { ok: false, reason: 'INVALID', erro: valida.erro };

  const existentes = await prisma.sectorRequirement.findMany({
    where: { sectorId: setor.id },
    orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
    select: { id: true, startTime: true, endTime: true, minPeople: true },
  });
  const indiceAtual = input.id ? existentes.findIndex((e) => e.id === input.id) : -1;
  if (input.id && indiceAtual < 0) return { ok: false, reason: 'NAO_ENCONTRADO' };

  const conflito = conflitoDeFaixa(existentes, nova, indiceAtual);
  if (conflito) {
    return {
      ok: false, reason: 'CONFLITO',
      erro: `Esta faixa entra em conflito com uma faixa já cadastrada para este setor (${rotuloDaFaixa(conflito.faixa)}).`,
    };
  }

  const dados = { startTime: nova.startTime, endTime: nova.endTime, minPeople: Math.max(0, nova.minPeople) };
  const salva = input.id
    ? await prisma.sectorRequirement.update({ where: { id: input.id }, data: dados, select: { id: true } })
    : await prisma.sectorRequirement.create({
      data: { sectorId: setor.id, ...dados, order: existentes.length },
      select: { id: true },
    });

  await audit({
    userId: user.id, unitId: setor.unitId,
    action: input.id ? 'SECTOR_REQUIREMENT_UPDATE' : 'SECTOR_REQUIREMENT_CREATE',
    module: 'PEOPLE', entity: 'sector_requirement', entityId: salva.id,
    metadata: { setor: setor.name, ...dados }, ...ctx,
  });
  return { ok: true, id: salva.id };
}

export async function apagarFaixa(
  user: SessionUser,
  id: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDeFaixa> {
  const f = await prisma.sectorRequirement.findUnique({
    where: { id },
    select: { id: true, sectorId: true, startTime: true, endTime: true, minPeople: true },
  });
  if (!f) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const setor = await setorNoEscopo(user, f.sectorId);
  if (!setor) return { ok: false, reason: 'FORBIDDEN' };

  await prisma.sectorRequirement.delete({ where: { id } });
  await audit({
    userId: user.id, unitId: setor.unitId, action: 'SECTOR_REQUIREMENT_DELETE',
    module: 'PEOPLE', entity: 'sector_requirement', entityId: id,
    metadata: { setor: setor.name, startTime: f.startTime, endTime: f.endTime, minPeople: f.minPeople }, ...ctx,
  });
  return { ok: true };
}

export interface SetorComFaixas {
  id: string;
  name: string;
  faixas: { id: string; startTime: string; endTime: string; minPeople: number; rotulo: string }[];
}

/** Os setores da unidade com as faixas — para a tela de cadastro. */
export async function getSetoresComFaixas(user: SessionUser, unitId: string): Promise<SetorComFaixas[]> {
  if (!canAccessUnit(user, unitId)) return [];
  const setores = await prisma.sector.findMany({
    where: { unitId, active: true },
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true,
      requirements: { orderBy: [{ order: 'asc' }, { startTime: 'asc' }], select: { id: true, startTime: true, endTime: true, minPeople: true } },
    },
  });
  return setores.map((s) => ({
    id: s.id,
    name: s.name,
    faixas: s.requirements.map((r) => ({ ...r, rotulo: rotuloDaFaixa(r) })),
  }));
}
