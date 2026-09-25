import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

export interface PopBlock {
  type: 'text' | 'image' | 'video' | 'checklist';
  text?: string;
  url?: string;
  items?: string[];
}

// --- Rich text: sanitização do HTML dos blocos de texto -----------------------
// Apenas Admin cria/edita POPs, mas ainda assim limpamos o HTML para uma
// allowlist segura (negrito/itálico/listas/H2/H3/link/parágrafo).
const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'p', 'br', 'a', 'span', 'div']);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Limpa o HTML de um bloco de texto para uma allowlist segura. */
export function sanitizePopHtml(html: string): string {
  if (!html) return '';
  // Texto puro (legado ou digitado sem formatação): escapa e preserva quebras.
  if (!/<[a-z][\s\S]*>/i.test(html)) return escapeHtml(html).replace(/\r?\n/g, '<br>');
  // Remove blocos perigosos inteiros.
  let s = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Tags de abertura: mantém só as permitidas, descartando atributos (exceto href em <a>).
  s = s.replace(/<([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_m, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (tag === 'a') {
      const m = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = m ? (m[2] ?? m[3] ?? '') : '';
      if (/^\s*(https?:|mailto:)/i.test(url)) return `<a href="${url.replace(/["<>]/g, '')}" target="_blank" rel="noopener noreferrer">`;
      return '<a>';
    }
    return `<${tag}>`;
  });
  // Tags de fechamento.
  s = s.replace(/<\/([a-zA-Z0-9]+)\s*>/g, (_m, rawTag: string) => (ALLOWED_TAGS.has(rawTag.toLowerCase()) ? `</${rawTag.toLowerCase()}>` : ''));
  return s.trim();
}

/** Normaliza e sanitiza os blocos recebidos do editor. */
export function sanitizePopBlocks(raw: unknown): PopBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PopBlock[] = [];
  for (const b of raw as PopBlock[]) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text') {
      const text = sanitizePopHtml(String(b.text ?? ''));
      if (text.replace(/<[^>]*>/g, '').trim() || /<(img|br)/i.test(text)) out.push({ type: 'text', text });
    } else if (b.type === 'checklist') {
      const items = (Array.isArray(b.items) ? b.items : []).map((i) => String(i).trim()).filter(Boolean);
      if (items.length) out.push({ type: 'checklist', items });
    } else if (b.type === 'image') {
      const url = String(b.url ?? '').trim();
      if (/^(https?:|\/)/i.test(url)) out.push({ type: 'image', url });
    } else if (b.type === 'video') {
      const url = String(b.url ?? '').trim();
      if (url) out.push({ type: 'video', url });
    }
  }
  return out;
}

/** POPs publicados visíveis ao usuário + se ele já confirmou a versão atual. */
export async function listPopsForUser(user: SessionUser) {
  const pops = await prisma.pop.findMany({
    where: { status: 'PUBLISHED', units: { some: { ...unitScopeWhere(user, 'unitId') } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    include: { modules: { where: { active: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, allPublic: true, jobTitles: { select: { jobTitle: true } }, _count: { select: { collaborators: true, sectors: true } } } } },
  });
  const reads = await prisma.popRead.findMany({ where: { userId: user.id, popId: { in: pops.map((p) => p.id) } } });
  const readSet = new Set(reads.map((r) => `${r.popId}:${r.version}`));
  return pops.map((p) => ({ ...p, confirmed: readSet.has(`${p.id}:${p.version}`) }));
}

export async function getPop(user: SessionUser, id: string) {
  const pop = await prisma.pop.findUnique({
    where: { id },
    include: {
      units: { select: { unitId: true } },
      modules: {
        where: { active: true }, orderBy: { order: 'asc' },
        include: { jobTitles: { select: { jobTitle: true } }, collaborators: { select: { collaboratorId: true } }, sectors: { select: { sectorName: true } } },
      },
    },
  });
  if (!pop) return null;
  // acesso: seesAll ou interseção de unidades
  if (!user.seesAllUnits && !pop.units.some((u) => user.unitIds.includes(u.unitId))) return null;
  const read = await prisma.popRead.findUnique({ where: { popId_userId_version: { popId: id, userId: user.id, version: pop.version } } }).catch(() => null);
  return { ...pop, confirmed: Boolean(read) };
}

export async function confirmRead(user: SessionUser, popId: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const pop = await prisma.pop.findUnique({ where: { id: popId }, select: { version: true } });
  if (!pop) return { ok: false as const };
  await prisma.popRead.upsert({
    where: { popId_userId_version: { popId, userId: user.id, version: pop.version } },
    create: { popId, userId: user.id, version: pop.version },
    update: {},
  });
  await audit({ userId: user.id, action: 'POP_READ', module: 'POPS', entity: 'pop', entityId: popId, metadata: { version: pop.version }, ...ctx });
  return { ok: true as const };
}

/** Um MÓDULO/ETAPA do POP, com o seu público e o seu conteúdo. */
export interface ModuleInput {
  /** id existente ao editar; ausente = módulo novo. */
  id?: string;
  name: string;
  /** "Todos os colaboradores abrangidos pelo POP" (independe da função). */
  allPublic?: boolean;
  /** Funções (cargos) alvo — distribuição automática principal. */
  jobTitles?: string[];
  /** Colaboradores adicionais — exceção/complemento à função. */
  collaboratorIds?: string[];
  /** Setores do Mapa (regra anterior, opcional). */
  sectorNames?: string[];
  blocks: PopBlock[];
}

interface PopInput {
  title: string;
  category?: string;
  unitIds: string[];
  recurrence?: 'ONCE' | 'MONTHLY';
  /** Pelo menos um. A ordem da lista é a ordem de exibição. */
  modules: ModuleInput[];
}

interface ModuloNormalizado {
  id: string | null;
  name: string;
  allPublic: boolean;
  jobTitles: string[];
  collaboratorIds: string[];
  sectorNames: string[];
  blocks: PopBlock[];
}

/**
 * Normaliza os módulos: nome obrigatório, GERAL limpa o direcionamento (são
 * exclusivos), ids de colaborador conferidos no banco de uma vez.
 */
async function normalizarModulos(entrada: ModuleInput[]): Promise<ModuloNormalizado[] | null> {
  if (!Array.isArray(entrada) || entrada.length === 0) return null;
  const todosIds = [...new Set(entrada.flatMap((m) => m.collaboratorIds ?? []))];
  const existentes = new Set(await colaboradoresExistentes(todosIds));
  const out: ModuloNormalizado[] = [];
  for (const m of entrada) {
    const name = String(m.name ?? '').trim();
    if (!name) return null;
    const geral = Boolean(m.allPublic);
    out.push({
      id: m.id ? String(m.id) : null,
      name: name.slice(0, 120),
      allPublic: geral,
      jobTitles: geral ? [] : dedupeSectors(m.jobTitles),
      collaboratorIds: geral ? [] : [...new Set((m.collaboratorIds ?? []).map(String).filter((i) => existentes.has(i)))],
      sectorNames: geral ? [] : dedupeSectors(m.sectorNames),
      blocks: sanitizePopBlocks(m.blocks),
    });
  }
  return out;
}

function resumoDoPublico(mods: ModuloNormalizado[]) {
  return mods.map((m) => ({ nome: m.name, publico: m.allPublic ? 'GERAL' : (m.jobTitles.length || m.collaboratorIds.length || m.sectorNames.length) ? 'DIRECIONADO' : 'REFERENCIA', funcoes: m.jobTitles, colaboradores: m.collaboratorIds.length, setores: m.sectorNames }));
}

/**
 * Admin cria/publica um POP com os seus MÓDULOS. O POP é título, categoria,
 * unidades e recorrência; público e conteúdo vivem em cada módulo. Os campos
 * legados do POP (content/isInitial/setores/funções) não são mais escritos.
 */
export async function createPop(user: SessionUser, input: PopInput, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  if (!input.title?.trim() || input.unitIds.length === 0) return { ok: false as const, reason: 'INVALID' };
  const mods = await normalizarModulos(input.modules);
  if (!mods) return { ok: false as const, reason: 'INVALID' };

  const pop = await prisma.pop.create({
    data: {
      title: input.title.trim(),
      category: input.category || null,
      status: 'PUBLISHED',
      version: 1,
      isInitial: false,
      recurrence: input.recurrence === 'MONTHLY' ? 'MONTHLY' : 'ONCE',
      content: [] as unknown as Prisma.InputJsonValue,
      units: { create: input.unitIds.map((unitId) => ({ unitId })) },
      modules: {
        create: mods.map((m, i) => ({
          name: m.name, order: i, version: 1, allPublic: m.allPublic,
          content: m.blocks as unknown as Prisma.InputJsonValue,
          jobTitles: { create: m.jobTitles.map((jobTitle) => ({ jobTitle })) },
          collaborators: { create: m.collaboratorIds.map((collaboratorId) => ({ collaboratorId })) },
          sectors: { create: m.sectorNames.map((sectorName) => ({ sectorName })) },
        })),
      },
    },
  });
  await audit({ userId: user.id, action: 'POP_PUBLISH', module: 'POPS', entity: 'pop', entityId: pop.id, metadata: { modulos: resumoDoPublico(mods) }, ...ctx });
  await reconcileForUnits(input.unitIds);
  return { ok: true as const, id: pop.id };
}

/**
 * Admin edita um POP. Versão é POR MÓDULO: só o módulo cujo conteúdo mudou sobe
 * de versão (e re-treina). Módulo que saiu da lista é INATIVADO, não apagado —
 * quem já o concluiu continua com o histórico.
 */
export async function updatePop(user: SessionUser, id: string, input: PopInput & { bumpVersion?: boolean }, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  if (!input.title?.trim() || input.unitIds.length === 0) return { ok: false as const, reason: 'INVALID' };
  const current = await prisma.pop.findUnique({
    where: { id },
    select: { version: true, units: { select: { unitId: true } }, modules: { where: { active: true }, select: { id: true, version: true, content: true } } },
  });
  if (!current) return { ok: false as const, reason: 'INVALID' };
  const mods = await normalizarModulos(input.modules);
  if (!mods) return { ok: false as const, reason: 'INVALID' };

  const atuais = new Map(current.modules.map((m) => [m.id, m]));
  const mantidos = new Set<string>();
  const mudancas: { nome: string; versao: number; conteudoMudou: boolean }[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.popUnit.deleteMany({ where: { popId: id } });
    await tx.pop.update({
      where: { id },
      data: {
        title: input.title.trim(),
        category: input.category || null,
        recurrence: input.recurrence === 'MONTHLY' ? 'MONTHLY' : 'ONCE',
        units: { create: input.unitIds.map((unitId) => ({ unitId })) },
      },
    });

    for (const [i, m] of mods.entries()) {
      const existente = m.id ? atuais.get(m.id) : undefined;
      if (existente) {
        mantidos.add(existente.id);
        const conteudoMudou = canonico(existente.content) !== canonico(m.blocks);
        const version = (input.bumpVersion ?? conteudoMudou) ? existente.version + 1 : existente.version;
        mudancas.push({ nome: m.name, versao: version, conteudoMudou });
        await tx.popModuleJobTitle.deleteMany({ where: { moduleId: existente.id } });
        await tx.popModuleCollaborator.deleteMany({ where: { moduleId: existente.id } });
        await tx.popModuleSector.deleteMany({ where: { moduleId: existente.id } });
        await tx.popModule.update({
          where: { id: existente.id },
          data: {
            name: m.name, order: i, version, allPublic: m.allPublic, active: true,
            content: m.blocks as unknown as Prisma.InputJsonValue,
            jobTitles: { create: m.jobTitles.map((jobTitle) => ({ jobTitle })) },
            collaborators: { create: m.collaboratorIds.map((collaboratorId) => ({ collaboratorId })) },
            sectors: { create: m.sectorNames.map((sectorName) => ({ sectorName })) },
          },
        });
      } else {
        mudancas.push({ nome: m.name, versao: 1, conteudoMudou: true });
        await tx.popModule.create({
          data: {
            popId: id, name: m.name, order: i, version: 1, allPublic: m.allPublic,
            content: m.blocks as unknown as Prisma.InputJsonValue,
            jobTitles: { create: m.jobTitles.map((jobTitle) => ({ jobTitle })) },
            collaborators: { create: m.collaboratorIds.map((collaboratorId) => ({ collaboratorId })) },
            sectors: { create: m.sectorNames.map((sectorName) => ({ sectorName })) },
          },
        });
      }
    }

    // Módulo que saiu da lista: INATIVA (histórico de quem concluiu fica).
    const removidos = current.modules.filter((m) => !mantidos.has(m.id)).map((m) => m.id);
    if (removidos.length) await tx.popModule.updateMany({ where: { id: { in: removidos } }, data: { active: false } });
  });

  await audit({ userId: user.id, action: 'POP_UPDATE', module: 'POPS', entity: 'pop', entityId: id, metadata: { modulos: resumoDoPublico(mods), versoes: mudancas, inativados: current.modules.length - mantidos.size }, ...ctx });
  // reconcilia nas unidades atuais e nas antigas (caso tenha saído de alguma)
  await reconcileForUnits([...new Set([...input.unitIds, ...current.units.map((u) => u.unitId)])]);
  return { ok: true as const, id, version: current.version };
}

export async function deletePop(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' };
  const pop = await prisma.pop.findUnique({ where: { id }, select: { units: { select: { unitId: true } } } });
  if (!pop) return { ok: false as const, reason: 'INVALID' };
  await prisma.pop.delete({ where: { id } }); // units/sectors/reads/trainings em cascade
  await audit({ userId: user.id, action: 'POP_DELETE', module: 'POPS', entity: 'pop', entityId: id, ...ctx });
  return { ok: true as const };
}

/**
 * JSON canônico (chaves ordenadas) para comparar o conteúdo. O JSONB do
 * Postgres devolve as chaves em ordem alfabética ({text, type}) e o editor
 * manda {type, text}: comparar as strings cruas dizia "mudou" em TODA edição —
 * inclusive ao trocar só o público — e subia a versão, mandando a equipe
 * inteira refazer o treinamento.
 */
function canonico(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) : val));
}

function dedupeSectors(names?: string[]): string[] {
  if (!names) return [];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}
/** Só ids que existem: a FK recusaria o resto e derrubaria a gravação inteira por um id velho na tela. */
async function colaboradoresExistentes(ids?: string[]): Promise<string[]> {
  const pedidos = [...new Set((ids ?? []).map((i) => String(i).trim()).filter(Boolean))];
  if (pedidos.length === 0) return [];
  const achados = await prisma.collaborator.findMany({ where: { id: { in: pedidos } }, select: { id: true } });
  return achados.map((c) => c.id);
}
async function reconcileForUnits(unitIds: string[]) {
  const { reconcileTrainingForUnit } = await import('@/lib/training');
  for (const u of [...new Set(unitIds)]) await reconcileTrainingForUnit(u).catch(() => {});
}

/** Painel de confirmações (quem leu) para um POP — Admin/Supervisor. */
export async function getPopReadStatus(popId: string) {
  const pop = await prisma.pop.findUnique({ where: { id: popId }, select: { version: true } });
  if (!pop) return null;
  const reads = await prisma.popRead.findMany({ where: { popId, version: pop.version }, include: { user: { select: { name: true } } } });
  return { version: pop.version, reads: reads.map((r) => ({ name: r.user.name, at: r.readAt })) };
}
