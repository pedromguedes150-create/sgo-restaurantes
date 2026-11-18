import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';
import {
  indicadores, normalizarNome, normalizarTelefone, OBS_MAX, statusDaFaixa,
  type Faixa, type Indicadores, type StatusDoCurriculo,
} from '@/lib/curriculos/regras';

/**
 * CENTRAL DE CURRÍCULOS — o lado servidor (v1.212.0).
 *
 * Encaminhar e consultar. Não existe função que mude a situação a partir de
 * uma sessão: quem muda é o RH, pelo evento de entrada (`retorno-rh.ts`).
 */
type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quem encaminha: quem opera a unidade. Escopo por unidade SEMPRE no servidor. */
export const PODE_ENCAMINHAR = new Set(['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO']);

export interface NovoCurriculo {
  unitId: string;
  candidateName: string;
  phone: string;
  jobTitleId: string;
  note?: string | null;
  attachmentPath: string;
  attachmentMime: string;
}
export type MotivoDaRecusa = 'FORBIDDEN' | 'NOME' | 'TELEFONE' | 'CARGO' | 'SEM_ARQUIVO' | 'DUPLICADO';
export type ResultadoDoEncaminhamento = { ok: true; id: string } | { ok: false; reason: MotivoDaRecusa };

/** Janela em que o mesmo telefone + cargo na mesma unidade é tratado como reenvio por engano. */
export const JANELA_DE_DUPLICIDADE_DIAS = 7;

export async function encaminharCurriculo(user: SessionUser, input: NovoCurriculo, ctx: Ctx = {}): Promise<ResultadoDoEncaminhamento> {
  if (!PODE_ENCAMINHAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.unitId || !canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { active: true } });
  if (!unit?.active) return { ok: false, reason: 'FORBIDDEN' };

  const nome = normalizarNome(input.candidateName);
  if (!nome) return { ok: false, reason: 'NOME' };
  const fone = normalizarTelefone(input.phone);
  if (!fone) return { ok: false, reason: 'TELEFONE' };
  const cargo = input.jobTitleId ? await prisma.resumeJobTitle.findUnique({ where: { id: input.jobTitleId } }) : null;
  if (!cargo || !cargo.active) return { ok: false, reason: 'CARGO' };
  if (!input.attachmentPath) return { ok: false, reason: 'SEM_ARQUIVO' };

  const desde = new Date(Date.now() - JANELA_DE_DUPLICIDADE_DIAS * 86_400_000);
  const repetido = await prisma.candidateResume.findFirst({ where: { unitId: input.unitId, phone: fone, jobTitleName: cargo.name, createdAt: { gte: desde } }, select: { id: true } });
  if (repetido) return { ok: false, reason: 'DUPLICADO' };

  const note = String(input.note ?? '').trim().slice(0, OBS_MAX) || null;
  const rec = await prisma.candidateResume.create({
    data: {
      unitId: input.unitId, candidateName: nome, phone: fone, jobTitleId: cargo.id, jobTitleName: cargo.name,
      attachmentPath: input.attachmentPath, attachmentMime: input.attachmentMime, note,
      createdById: user.id, createdByName: user.name,
      events: { create: { kind: 'ENCAMINHADO', toStatus: 'RECEBIDO', origem: 'GERENTE', actorName: user.name, note } },
    },
  });
  /* Auditoria SEM o nome e o telefone do candidato: dado pessoal fica só no registro. */
  await audit({ userId: user.id, unitId: input.unitId, action: 'RESUME_FORWARDED', module: 'PEOPLE', entity: 'candidate_resume', entityId: rec.id, metadata: { cargo: cargo.name, tipo: input.attachmentMime }, ...ctx });
  return { ok: true, id: rec.id };
}

export interface FiltroDeCurriculos { unitIds?: string[]; faixa?: Faixa; q?: string; cargo?: string }

function recorte(user: SessionUser, f: FiltroDeCurriculos, comFaixa: boolean): Prisma.CandidateResumeWhereInput {
  const and: Prisma.CandidateResumeWhereInput[] = [unitScopeWhere(user) as Prisma.CandidateResumeWhereInput];
  if (f.unitIds) and.push({ unitId: { in: f.unitIds } });
  if (f.cargo) and.push({ jobTitleName: f.cargo });
  const q = (f.q ?? '').trim();
  if (q) {
    const digitos = q.replace(/\D/g, '');
    and.push({ OR: [{ candidateName: { contains: q, mode: 'insensitive' } }, ...(digitos.length >= 4 ? [{ phone: { contains: digitos } }] : [])] });
  }
  const st = comFaixa && f.faixa ? statusDaFaixa(f.faixa) : null;
  if (st) and.push({ status: { in: [...st] } });
  return { AND: and };
}

export const LIMITE_DA_LISTA = 300;

export async function listarCurriculos(user: SessionUser, f: FiltroDeCurriculos = {}) {
  const [linhas, total] = await Promise.all([
    prisma.candidateResume.findMany({
      where: recorte(user, f, true), orderBy: { createdAt: 'desc' }, take: LIMITE_DA_LISTA,
      select: {
        id: true, unitId: true, candidateName: true, phone: true, jobTitleName: true, attachmentMime: true, note: true,
        status: true, statusNote: true, statusAt: true, interviewAt: true, rhReadAt: true, rhSyncedAt: true,
        createdByName: true, createdAt: true, unit: { select: { name: true } },
      },
    }),
    prisma.candidateResume.count({ where: recorte(user, f, true) }),
  ]);
  return { linhas, total };
}

/** Os números do topo: mesmo recorte da lista, SEM a faixa (senão clicar num cartão zeraria os outros). */
export async function indicadoresDosCurriculos(user: SessionUser, f: FiltroDeCurriculos = {}): Promise<Indicadores> {
  const g = await prisma.candidateResume.groupBy({ by: ['status'], where: recorte(user, f, false), _count: { _all: true } });
  return indicadores(Object.fromEntries(g.map((x) => [x.status, x._count._all])) as Partial<Record<StatusDoCurriculo, number>>);
}

export async function cargosEncaminhados(user: SessionUser, unitIds?: string[]): Promise<string[]> {
  const g = await prisma.candidateResume.findMany({ where: recorte(user, { unitIds }, false), distinct: ['jobTitleName'], select: { jobTitleName: true }, orderBy: { jobTitleName: 'asc' } });
  return g.map((x) => x.jobTitleName);
}

/** O currículo com a linha do tempo — só para quem alcança a unidade. */
export async function getCurriculo(user: SessionUser, id: string) {
  const c = await prisma.candidateResume.findUnique({ where: { id }, include: { unit: { select: { name: true } }, events: { orderBy: { createdAt: 'asc' } } } });
  if (!c || !canAccessUnit(user, c.unitId)) return null;
  return c;
}

/** O RH já falou com o SGO sobre currículos alguma vez? (leitura pela API ou evento de situação). */
export async function rhConectado(): Promise<boolean> {
  const n = await prisma.candidateResume.count({ where: { OR: [{ rhReadAt: { not: null } }, { rhSyncedAt: { not: null } }] }, take: 1 });
  return n > 0;
}
