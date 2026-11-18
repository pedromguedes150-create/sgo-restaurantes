import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { CARGO_MAX, CARGOS_PADRAO } from '@/lib/curriculos/regras';

/**
 * Cargos oferecidos no encaminhamento de currículo — lista GLOBAL, editada pelo
 * Admin em Configurações → Currículos. Lista própria (e não os cargos do
 * cadastro do RH) porque o RH grafa o mesmo cargo de vários jeitos. Semeada na
 * primeira leitura; cargo já usado só DESATIVA — o nome vai congelado no
 * currículo, então nada do histórico muda.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDoCargo = { ok: true; id?: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };
const PODE = new Set(['ADMIN', 'CEO']);
const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function ensureCargosPadrao(): Promise<void> {
  if ((await prisma.resumeJobTitle.count()) > 0) return;
  await prisma.resumeJobTitle.createMany({ data: CARGOS_PADRAO.map((name, i) => ({ name, order: i + 1 })), skipDuplicates: true });
}

export async function listarCargos(somenteAtivos = false) {
  await ensureCargosPadrao();
  return prisma.resumeJobTitle.findMany({ where: somenteAtivos ? { active: true } : undefined, orderBy: [{ order: 'asc' }, { name: 'asc' }] });
}

async function nomeLivre(nome: string, ignorarId?: string): Promise<{ ok: true; nome: string } | { ok: false; motivo: string }> {
  const n = String(nome ?? '').replace(/\s+/g, ' ').trim().slice(0, CARGO_MAX);
  if (n.length < 3) return { ok: false, motivo: 'Dê um nome ao cargo (mínimo 3 letras).' };
  const outros = await prisma.resumeJobTitle.findMany({ where: ignorarId ? { id: { not: ignorarId } } : undefined, select: { name: true } });
  if (outros.some((o) => chave(o.name) === chave(n))) return { ok: false, motivo: 'Já existe um cargo com esse nome.' };
  return { ok: true, nome: n };
}

export async function criarCargo(user: SessionUser, nome: string, ctx: Ctx = {}): Promise<ResultadoDoCargo> {
  if (!PODE.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  await ensureCargosPadrao();
  const v = await nomeLivre(nome);
  if (!v.ok) return { ok: false, reason: 'INVALID', message: v.motivo };
  const max = await prisma.resumeJobTitle.aggregate({ _max: { order: true } });
  const c = await prisma.resumeJobTitle.create({ data: { name: v.nome, order: (max._max.order ?? 0) + 1 } });
  await audit({ userId: user.id, action: 'RESUME_JOB_TITLE_ADD', module: 'CONFIG', entity: 'resume_job_title', entityId: c.id, metadata: { nome: v.nome }, ...ctx });
  return { ok: true, id: c.id };
}

export async function renomearCargo(user: SessionUser, id: string, nome: string, ctx: Ctx = {}): Promise<ResultadoDoCargo> {
  if (!PODE.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.resumeJobTitle.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const v = await nomeLivre(nome, id);
  if (!v.ok) return { ok: false, reason: 'INVALID', message: v.motivo };
  await prisma.resumeJobTitle.update({ where: { id }, data: { name: v.nome } });
  await audit({ userId: user.id, action: 'RESUME_JOB_TITLE_RENAME', module: 'CONFIG', entity: 'resume_job_title', entityId: id, metadata: { antes: atual.name, depois: v.nome }, ...ctx });
  return { ok: true };
}

export async function ativarCargo(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<ResultadoDoCargo> {
  if (!PODE.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.resumeJobTitle.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  if (!active && (await prisma.resumeJobTitle.count({ where: { active: true, id: { not: id } } })) === 0) {
    return { ok: false, reason: 'INVALID', message: 'Deixe pelo menos um cargo ativo.' };
  }
  await prisma.resumeJobTitle.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, action: active ? 'RESUME_JOB_TITLE_ACTIVATE' : 'RESUME_JOB_TITLE_DEACTIVATE', module: 'CONFIG', entity: 'resume_job_title', entityId: id, metadata: { nome: atual.name }, ...ctx });
  return { ok: true };
}
