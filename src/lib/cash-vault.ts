import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifySupervisory, notifyUsers, notifyUnitRole } from '@/lib/notifications';
import { isSupervisory } from '@/lib/roles';
import { getDenominations, denomLabel, type DenomConfig, type DenomKind } from '@/lib/cash-denominations';
import type { SessionUser } from '@/lib/auth/session';
import type { CashMovementType, ChangeRequestStatus, Prisma } from '@prisma/client';

/**
 * Gestão de Troco v2 — COFRE (16/07, modelo confirmado pelo Pedro + foto):
 * 1 cofre por unidade com saldo POR DENOMINAÇÃO (valor em R$ de cada uma,
 * como a folha do gerente). Baldes por caixa físico com valor-alvo do
 * supervisor. Rotina: repor baldes com miúdos do cofre (voltam notas grandes),
 * trocar notas grandes com o escritório por moedas. Retirada p/ pagamento é
 * PROIBIDA: registra, marca em vermelho e avisa supervisão na hora.
 */

/**
 * Denominações do Real (a folha do gerente) + linha "outros".
 * Fonte da verdade agora é a config por unidade (`getDenominations`). Estas
 * constantes permanecem como o formato do padrão de fábrica e ainda são
 * consumidas pelo frontend (cópia própria) até o PR 3.
 */
export const DENOMINATIONS = ['200', '100', '50', '20', '10', '5', '2', '1', '0.50', '0.25', '0.10', '0.05'] as const;
export const DENOM_KEYS = [...DENOMINATIONS, 'outros'] as const;
export type DenomKey = (typeof DENOM_KEYS)[number];
export type Balances = Record<string, number>;

type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detail?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function emptyBalances(): Balances {
  return Object.fromEntries(DENOM_KEYS.map((k) => [k, 0]));
}
/** Soma TODAS as chaves presentes — inclusive chaves legado (fora da config atual). */
export function sumBalances(b: Balances): number {
  return r2(Object.values(b).reduce((t: number, v) => t + (Number(v) || 0), 0));
}

/**
 * Validação de ENTRADA (restritiva): só aceita as chaves ATIVAS da unidade;
 * o resto é ignorado. Usada quando o usuário digita valores.
 */
function sanitizeInput(config: DenomConfig, input: Record<string, unknown>): Balances {
  const out: Balances = {};
  for (const k of config.keys) {
    const v = Number(input?.[k]);
    out[k] = Number.isFinite(v) ? r2(v) : 0;
  }
  return out;
}

/**
 * Leitura de HISTÓRICO/SALDO (tolerante): devolve TUDO que está gravado no
 * JSON, inclusive chaves que já não existem mais na config (aparecem como
 * "legado" na tela). Nunca descarta valor gravado — totais antigos não mudam.
 */
function readBalances(input: Record<string, unknown> | null | undefined): Balances {
  const out: Balances = {};
  if (input && typeof input === 'object') {
    for (const [k, raw] of Object.entries(input)) {
      const v = Number(raw);
      if (Number.isFinite(v)) out[k] = r2(v);
    }
  }
  return out;
}

/** Valor deve ser múltiplo da denominação (ex.: 0,10 → 50,00 ✓; 50,05 ✗). Tolerância 1 centavo. */
export function invalidMultiples(config: DenomConfig, b: Balances): string[] {
  const bad: string[] = [];
  for (const d of config.denominations) {
    if (d.value == null) continue; // "outros" não tem valor de nota
    const v = Number(b[d.key]) || 0;
    if (v > 0 && Math.abs(Math.round(v / d.value) * d.value - v) > 0.011) bad.push(d.key);
  }
  return bad;
}

function canOperate(user: SessionUser): boolean {
  return user.role !== 'FINANCE' && user.role !== 'CEO';
}
function canManageBuckets(user: SessionUser): boolean {
  return isSupervisory(user.role); // SUPERVISOR + COORDINATOR + ADMIN
}

async function getOrCreateVault(unitId: string) {
  return prisma.cashVault.upsert({
    where: { unitId },
    create: { unitId, balances: emptyBalances() as unknown as Prisma.InputJsonValue },
    update: {},
  });
}

async function applyMovement(
  user: SessionUser,
  unitId: string,
  type: CashMovementType,
  deltas: Balances,
  opts: { bucketId?: string | null; bucketName?: string | null; note?: string | null; replaceBalances?: Balances },
  ctx: Ctx,
): Promise<void> {
  const vault = await getOrCreateVault(unitId);
  const current = readBalances(vault.balances as Record<string, unknown>);
  let next: Balances;
  if (opts.replaceBalances) {
    next = opts.replaceBalances;
  } else {
    next = { ...current };
    for (const [k, dv] of Object.entries(deltas)) next[k] = r2((next[k] || 0) + (dv || 0));
  }
  const deltaVals = Object.values(deltas);
  const totalIn = r2(deltaVals.reduce((t: number, v) => t + Math.max(0, v || 0), 0));
  const totalOut = r2(deltaVals.reduce((t: number, v) => t + Math.max(0, -(v || 0)), 0));

  await prisma.$transaction([
    prisma.cashVault.update({ where: { id: vault.id }, data: { balances: next as unknown as Prisma.InputJsonValue } }),
    prisma.cashVaultMovement.create({
      data: {
        unitId, type, bucketId: opts.bucketId ?? null, bucketName: opts.bucketName ?? null,
        deltas: deltas as unknown as Prisma.InputJsonValue, totalIn, totalOut,
        note: opts.note ?? null, createdById: user.id, createdByName: user.name,
      },
    }),
  ]);
  await audit({ userId: user.id, unitId, action: `CASH_VAULT_${type}`, module: 'CASH', entity: 'cash_vault', entityId: vault.id, metadata: { totalIn, totalOut, bucket: opts.bucketName }, ...ctx });
}

/** Conferência/posição completa (como a folha): SUBSTITUI o saldo do cofre. */
export async function countVault(user: SessionUser, unitId: string, balancesInput: Record<string, unknown>, note: string | undefined, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const config = await getDenominations(unitId);
  const counted = sanitizeInput(config, balancesInput);
  const vault = await getOrCreateVault(unitId);
  const current = readBalances(vault.balances as Record<string, unknown>);
  // Delta sobre a UNIÃO das chaves: se havia chave legado no cofre, o movimento
  // registra a diferença honestamente (a conferência é a nova fotografia).
  const deltas: Balances = {};
  for (const k of new Set([...Object.keys(current), ...config.keys])) {
    deltas[k] = r2((counted[k] || 0) - (current[k] || 0));
  }
  await applyMovement(user, unitId, 'COUNT', deltas, { note: note?.trim() || null, replaceBalances: counted }, ctx);
  return { ok: true };
}

/** Reposição de balde: SAEM miúdos do cofre, ENTRAM notas grandes do balde (troca 1:1). */
export async function refillBucket(
  user: SessionUser, unitId: string, bucketId: string,
  outSmall: Record<string, unknown>, inBig: Record<string, unknown>, note: string | undefined, ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const bucket = await prisma.cashBucket.findUnique({ where: { id: bucketId }, select: { unitId: true, name: true } });
  if (!bucket || bucket.unitId !== unitId) return { ok: false, reason: 'NOT_FOUND' };
  const config = await getDenominations(unitId);
  const outB = sanitizeInput(config, outSmall);
  const inB = sanitizeInput(config, inBig);
  const outTotal = sumBalances(outB);
  const inTotal = sumBalances(inB);
  if (outTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o que saiu do cofre para o balde.' };
  if (Math.abs(outTotal - inTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: saiu ${outTotal.toFixed(2)} e entrou ${inTotal.toFixed(2)} — os valores devem ser iguais (troca 1:1).` };
  }
  const deltas: Balances = {};
  for (const k of config.keys) deltas[k] = r2((inB[k] || 0) - (outB[k] || 0));
  await applyMovement(user, unitId, 'REFILL', deltas, { bucketId, bucketName: bucket.name, note: note?.trim() || null }, ctx);
  return { ok: true };
}

/** Troca com o escritório: SAEM notas grandes, ENTRAM moedas/miúdos (mesmo valor). */
export async function officeSwap(
  user: SessionUser, unitId: string,
  outBig: Record<string, unknown>, inSmall: Record<string, unknown>, note: string | undefined, ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const config = await getDenominations(unitId);
  const outB = sanitizeInput(config, outBig);
  const inB = sanitizeInput(config, inSmall);
  const outTotal = sumBalances(outB);
  const inTotal = sumBalances(inB);
  if (outTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe as notas enviadas ao escritório.' };
  if (Math.abs(outTotal - inTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: enviou ${outTotal.toFixed(2)} e recebeu ${inTotal.toFixed(2)} — os valores devem ser iguais.` };
  }
  const deltas: Balances = {};
  for (const k of config.keys) deltas[k] = r2((inB[k] || 0) - (outB[k] || 0));
  await applyMovement(user, unitId, 'OFFICE_SWAP', deltas, { note: note?.trim() || null }, ctx);
  return { ok: true };
}

/** Retirada p/ pagamento — PROIBIDA: registra em vermelho e avisa supervisão na hora. */
export async function vaultWithdrawal(user: SessionUser, unitId: string, amounts: Record<string, unknown>, reason: string, ctx: Ctx = {}): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const config = await getDenominations(unitId);
  const outB = sanitizeInput(config, amounts);
  const total = sumBalances(outB);
  if (total <= 0) return { ok: false, reason: 'INVALID' };
  if (!reason?.trim()) return { ok: false, reason: 'INVALID', detail: 'Informe o motivo da retirada.' };
  const deltas: Balances = {};
  for (const k of config.keys) deltas[k] = -(outB[k] || 0);
  await applyMovement(user, unitId, 'WITHDRAWAL', deltas, { note: reason.trim() }, ctx);

  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
  const brl = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const payload = {
    title: '🚨 Retirada do troco para pagamento (PROIBIDA)',
    body: `${user.name} retirou ${brl} do cofre de ${unit?.name ?? 'unidade'} para pagamento — motivo: ${reason.trim()}. A reposição precisa ser cobrada.`,
    link: '/modulos/troco', module: 'CASH', critical: true,
  };
  await notifySupervisory(payload, unitId).catch(() => {});
  return { ok: true };
}

/**
 * Troca de dinheiro DIRETO no caixa (unidades sem baldes, ex.: Nova União).
 * Igual à reposição, mas sem balde: sai um conjunto do cofre e entra outro de
 * valor igual (o caixa troca notas por moedas/miúdos ali mesmo). Fica no histórico.
 */
export async function registerChange(
  user: SessionUser, unitId: string, registerName: string,
  outFromVault: Record<string, unknown>, inToVault: Record<string, unknown>, note: string | undefined, ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!registerName?.trim()) return { ok: false, reason: 'INVALID', detail: 'Informe qual caixa.' };
  const config = await getDenominations(unitId);
  const outB = sanitizeInput(config, outFromVault);
  const inB = sanitizeInput(config, inToVault);
  const outTotal = sumBalances(outB);
  const inTotal = sumBalances(inB);
  if (outTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o que saiu do cofre para o caixa.' };
  if (Math.abs(outTotal - inTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: saiu ${outTotal.toFixed(2)} e entrou ${inTotal.toFixed(2)} — os valores devem ser iguais (troca 1:1).` };
  }
  const deltas: Balances = {};
  for (const k of config.keys) deltas[k] = r2((inB[k] || 0) - (outB[k] || 0));
  await applyMovement(user, unitId, 'REGISTER_CHANGE', deltas, { bucketName: registerName.trim(), note: note?.trim() || null }, ctx);
  return { ok: true };
}

/* ───────── Sugestão do pedido de troco ───────── */

export interface ChangeSuggestion {
  need: Balances;
  give: Balances;
  total: number;
  /** Explicação em uma frase do porquê deste valor — a tela mostra ao gerente. */
  motivo: string;
  /** Não há o que sugerir (cofre equilibrado, ou sem notas grandes para trocar). */
  vazia: boolean;
}

const emReais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Composição que a unidade REALMENTE usa nos miúdos, tirada do histórico de
 * reposição de balde.
 *
 * A meta do balde é um valor total (R$ 500) — ela não diz quantas moedas de
 * 0,50. Mas cada reposição registrada guarda os deltas por denominação, ou seja,
 * o que de fato sai do cofre para o caixa. Essa é a melhor fonte que existe
 * aqui: é a prática da própria unidade, não um palpite sobre "mix típico".
 *
 * Sem histórico, cai num padrão conservador — peso igual entre os miúdos
 * configurados, que ao menos respeita quais denominações a unidade usa.
 */
async function smallMix(unitId: string, config: DenomConfig): Promise<Record<string, number>> {
  const smalls = config.denominations.filter((d) => d.isSmall && d.value != null);
  if (smalls.length === 0) return {};

  const refills = await prisma.cashVaultMovement.findMany({
    where: { unitId, type: 'REFILL' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { deltas: true },
  });

  const peso: Record<string, number> = {};
  let soma = 0;
  for (const r of refills) {
    const d = readBalances(r.deltas as Record<string, unknown>);
    for (const s of smalls) {
      // na reposição os miúdos SAEM do cofre: delta negativo
      const v = Math.max(0, -(d[s.key] || 0));
      if (v > 0) { peso[s.key] = (peso[s.key] || 0) + v; soma += v; }
    }
  }
  if (soma <= 0) {
    for (const s of smalls) peso[s.key] = 1 / smalls.length;
    return peso;
  }
  for (const k of Object.keys(peso)) peso[k] = peso[k] / soma;
  return peso;
}

/**
 * Sugere o pedido de troco a partir do que o cofre tem hoje.
 *
 * A conta, em uma frase: o cofre precisa conseguir encher todos os baldes, então
 * o que falta de miúdos para cobrir a soma das metas é o que se pede — e paga-se
 * com as notas grandes que estão sobrando.
 *
 * Os dois lados fecham EXATAMENTE. A entrega é montada com as notas grandes que
 * o cofre tem de verdade (da maior para a menor), e o pedido é ajustado para
 * bater com o total resultante. Sugerir uma troca que o próprio formulário
 * recusaria depois, por diferença de centavos, seria pior do que não sugerir.
 */
export async function suggestChangeRequest(user: SessionUser, unitId: string): Promise<ChangeSuggestion | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const config = await getDenominations(unitId);
  const vault = await getOrCreateVault(unitId);
  const saldo = readBalances(vault.balances as Record<string, unknown>);

  const smalls = config.denominations.filter((d) => d.isSmall && d.value != null);
  const bigs = config.denominations.filter((d) => d.isBig && d.value != null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const vazio = (): Balances => Object.fromEntries(config.keys.map((k) => [k, 0]));

  const buckets = await prisma.cashBucket.findMany({ where: { unitId, active: true }, select: { targetValue: true } });
  const metaBaldes = r2(buckets.reduce((t, b) => t + Number(b.targetValue), 0));
  const miudosNoCofre = r2(smalls.reduce((t, d) => t + (saldo[d.key] || 0), 0));
  const faltaMiudos = r2(Math.max(0, metaBaldes - miudosNoCofre));

  if (metaBaldes <= 0) {
    return { need: vazio(), give: vazio(), total: 0, vazia: true, motivo: 'Nenhum balde com valor-alvo definido — a supervisão fixa as metas antes.' };
  }
  if (faltaMiudos <= 0) {
    return {
      need: vazio(), give: vazio(), total: 0, vazia: true,
      motivo: 'O cofre já tem ' + emReais(miudosNoCofre) + ' em miúdos para uma meta de ' + emReais(metaBaldes) + '. Não falta troco.',
    };
  }

  /* ENTREGA: notas grandes que o cofre tem, da maior para a menor, sem passar do
     que falta. É isso que define o total real da troca. */
  const give = vazio();
  let total = 0;
  for (const d of bigs) {
    const valor = d.value as number;
    const disponivel = Math.floor((saldo[d.key] || 0) / valor);
    const cabem = Math.floor((faltaMiudos - total) / valor);
    const qtd = Math.max(0, Math.min(disponivel, cabem));
    if (qtd > 0) { give[d.key] = r2(qtd * valor); total = r2(total + qtd * valor); }
  }

  if (total <= 0) {
    return {
      need: vazio(), give: vazio(), total: 0, vazia: true,
      motivo: 'Faltam ' + emReais(faltaMiudos) + ' em miúdos, mas o cofre não tem notas grandes suficientes para trocar.',
    };
  }

  /* PEDIDO: distribui o total pela composição que a unidade usa, arredondando
     para múltiplos de cada denominação; a sobra vai para a menor moeda, que
     sempre consegue representá-la. */
  const mix = await smallMix(unitId, config);
  const need = vazio();
  const ordenadas = [...smalls].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  let alocado = 0;
  for (const d of ordenadas) {
    const p = mix[d.key] ?? 0;
    if (p <= 0) continue;
    const valor = d.value as number;
    const qtd = Math.floor((total * p) / valor);
    if (qtd > 0) { need[d.key] = r2(qtd * valor); alocado = r2(alocado + qtd * valor); }
  }
  const menor = ordenadas[ordenadas.length - 1];
  const sobra = r2(total - alocado);
  if (sobra > 0 && menor && menor.value) {
    const qtd = Math.round(sobra / menor.value);
    need[menor.key] = r2((need[menor.key] || 0) + qtd * menor.value);
  }

  return {
    need, give, total: r2(total), vazia: false,
    motivo:
      'Os baldes somam ' + emReais(metaBaldes) + ' e o cofre tem ' + emReais(miudosNoCofre) +
      ' em miúdos: faltam ' + emReais(faltaMiudos) + '. A troca sugerida é de ' + emReais(total) +
      ', paga com as notas grandes disponíveis.',
  };
}

/* ───────── Solicitação de troco (gerente → supervisão) ───────── */

/** Descreve um conjunto por denominação em texto curto: "R$ 50,00 em 0,50 · R$ 20,00 em 1". */
function describeBalances(config: DenomConfig, b: Balances): string {
  const partes: string[] = [];
  for (const d of config.denominations) {
    const v = Number(b[d.key]) || 0;
    if (v > 0) partes.push(`${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em ${denomLabel(d)}`);
  }
  return partes.join(' · ');
}

/**
 * Gerente (ou quem opera) pede troco à supervisão; SUPERVISOR+COORDINATOR+ADMIN
 * são notificados.
 *
 * O pedido é POR DENOMINAÇÃO, nas mesmas chaves da conferência: `need` é o que a
 * unidade precisa receber e `give` o que ela entrega em troca. Antes havia só uma
 * linha de texto livre — o escritório lia prosa, nada era conferido e o que
 * chegava era digitado de novo na conferência do dia.
 *
 * Quando as duas somas batem (troca 1:1, a mesma regra e tolerância da
 * `officeSwap`), atender a solicitação aplica o movimento no cofre sozinho. Um
 * pedido só com `need` continua valendo: nesse caso a supervisão registra a
 * troca à mão, como antes.
 */
export async function requestChange(
  user: SessionUser, unitId: string,
  input: { amount?: number | null; note?: string; need?: Record<string, unknown>; give?: Record<string, unknown> },
  ctx: Ctx = {},
): Promise<Result> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const note = (input.note ?? '').trim();
  const config = await getDenominations(unitId);
  const need = sanitizeInput(config, input.need ?? {});
  const give = sanitizeInput(config, input.give ?? {});
  const needTotal = sumBalances(need);
  const giveTotal = sumBalances(give);

  if (needTotal <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe quanto precisa de cada nota ou moeda.' };
  const bad = [...invalidMultiples(config, need), ...invalidMultiples(config, give)];
  if (bad.length) {
    return { ok: false, reason: 'INVALID', detail: `Valor incompatível com a denominação: ${bad.join(', ')}. Cada valor deve ser múltiplo da nota/moeda.` };
  }
  if (giveTotal > 0 && Math.abs(giveTotal - needTotal) > 0.011) {
    return { ok: false, reason: 'INVALID', detail: `Troca desigual: você entrega ${giveTotal.toFixed(2)} e pede ${needTotal.toFixed(2)} — os totais devem ser iguais.` };
  }
  const amount = r2(needTotal);

  const req = await prisma.cashChangeRequest.create({
    data: {
      unitId, amount, note: note || null,
      needJson: need as unknown as Prisma.InputJsonValue,
      giveJson: giveTotal > 0 ? (give as unknown as Prisma.InputJsonValue) : undefined,
      requestedById: user.id, requestedByName: user.name,
    },
    select: { id: true },
  });
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
  const brlAmount = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  await notifySupervisory(
    {
      title: '💱 Solicitação de troco',
      body: `${user.name} pediu ${brlAmount} de troco em ${unit?.name ?? 'unidade'}: ${describeBalances(config, need)}${note ? ` — ${note}` : ''}`,
      link: '/modulos/troco', module: 'CASH',
    },
    unitId,
  ).catch(() => {});
  await audit({ userId: user.id, unitId, action: 'CASH_CHANGE_REQUEST', module: 'CASH', entity: 'cash_change_request', entityId: req.id, metadata: { amount, note, need, give }, ...ctx });
  return { ok: true };
}

/** Lê os conjuntos de ENVIO e RECEBIMENTO de um pedido. */
function sentAndReceived(row: { sentJson: unknown; receivedJson: unknown; sentByName: string | null; sentAt: Date | null; sentNote: string | null; receivedByName: string | null; receivedAt: Date | null; receivedNote: string | null }) {
  const sent = readBalances(row.sentJson as Record<string, unknown> | null);
  const received = readBalances(row.receivedJson as Record<string, unknown> | null);
  const sentTotal = sumBalances(sent);
  const receivedTotal = sumBalances(received);
  return {
    sent, received, sentTotal, receivedTotal,
    sentByName: row.sentByName, sentAt: row.sentAt?.toISOString() ?? null, sentNote: row.sentNote,
    receivedByName: row.receivedByName, receivedAt: row.receivedAt?.toISOString() ?? null, receivedNote: row.receivedNote,
    /** Chegou diferente do que saiu? */
    divergent: sentTotal > 0 && receivedTotal > 0 && Math.abs(sentTotal - receivedTotal) > 0.011,
  };
}

/* ───────── Envio pelo escritório e confirmação pelo gerente ───────── */

/**
 * O ciclo do troco tem três donos e três momentos:
 *
 *   SOLICITADO  o gerente pede (o que precisa × o que entrega)
 *   ENVIADO     o escritório manda — e registra o que REALMENTE mandou
 *   RECEBIDO    o gerente confirma o que REALMENTE chegou
 *
 * O cofre só é atualizado na CONFIRMAÇÃO. Antes disso o dinheiro está a caminho:
 * aplicar no envio faria o saldo mentir durante o transporte, e o gerente
 * conferiria o cofre contra um número que ainda não existe na gaveta.
 *
 * Guardar os três conjuntos é o que permite responder depois: o escritório
 * mandou o que foi pedido? Chegou o que foi mandado? Sem os três, a diferença
 * aparece só no fim do mês, sem dono.
 */

/** Quem opera o escritório: supervisor para cima (CEO permanece leitura). */
function isOffice(user: SessionUser): boolean {
  return isSupervisory(user.role);
}

/**
 * Escritório registra o ENVIO. O que ele manda pode diferir do pedido — nem
 * sempre há tudo o que se pediu —, por isso o envio tem conjunto próprio.
 */
export async function sendChangeRequest(
  user: SessionUser,
  id: string,
  input: { sent?: Record<string, unknown>; note?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (!isOffice(user)) return { ok: false, reason: 'FORBIDDEN', detail: 'Só a supervisão para cima envia troco.' };
  const req = await prisma.cashChangeRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'OPEN') return { ok: false, reason: 'INVALID', detail: 'Este pedido já saiu da fila de envio.' };

  const config = await getDenominations(req.unitId);
  /* Sem detalhe, envia-se o que foi pedido: o caso comum é o escritório mandar
     exatamente aquilo, e obrigar a redigitar 12 campos só atrapalharia. */
  const enviado = sanitizeInput(config, input.sent ?? readBalances(req.needJson as Record<string, unknown> | null));
  const total = sumBalances(enviado);
  if (total <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o que está sendo enviado.' };
  const bad = invalidMultiples(config, enviado);
  if (bad.length) return { ok: false, reason: 'INVALID', detail: `Valor incompatível com a denominação: ${bad.join(', ')}.` };

  await prisma.cashChangeRequest.update({
    where: { id },
    data: {
      status: 'SENT',
      sentJson: enviado as unknown as Prisma.InputJsonValue,
      sentById: user.id, sentByName: user.name,
      sentNote: input.note?.trim() || null,
      sentAt: new Date(),
    },
  });

  const unit = await prisma.unit.findUnique({ where: { id: req.unitId }, select: { name: true } });
  await notifyUsers([req.requestedById], {
    title: '📦 Troco enviado — confira ao receber',
    body: `${user.name} enviou ${emReais(total)} de troco para ${unit?.name ?? 'sua unidade'}. Confirme na tela de Troco o que chegou de verdade.`,
    link: '/modulos/troco', module: 'CASH',
  }).catch(() => {});
  await notifyUnitRole(req.unitId, 'MANAGER', {
    title: '📦 Troco a caminho',
    body: `${emReais(total)} enviados pelo escritório. Confirme o recebimento por denominação.`,
    link: '/modulos/troco', module: 'CASH',
  }).catch(() => {});

  await audit({
    userId: user.id, unitId: req.unitId, action: 'CASH_CHANGE_SENT', module: 'CASH',
    entity: 'cash_change_request', entityId: id, metadata: { total, enviado }, ...ctx,
  });
  return { ok: true };
}

/**
 * Gerente confirma o RECEBIMENTO. É aqui — e só aqui — que o cofre muda.
 *
 * Se o recebido não bate com o enviado, a diferença é registrada e a supervisão
 * avisada na hora: dinheiro que saiu do escritório e não chegou na unidade é o
 * risco que este fluxo existe para pegar.
 */
export async function confirmChangeReceipt(
  user: SessionUser,
  id: string,
  input: { received?: Record<string, unknown>; note?: string },
  ctx: Ctx = {},
): Promise<Result & { divergence?: number }> {
  if (!canOperate(user)) return { ok: false, reason: 'FORBIDDEN' };
  const req = await prisma.cashChangeRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'SENT') return { ok: false, reason: 'INVALID', detail: 'Este pedido não está aguardando confirmação.' };

  const config = await getDenominations(req.unitId);
  const enviado = sanitizeInput(config, readBalances(req.sentJson as Record<string, unknown> | null));
  /* Sem detalhe, confirma-se o que foi enviado — o caso comum é chegar certo. */
  const recebido = sanitizeInput(config, input.received ?? enviado);
  const totalEnviado = sumBalances(enviado);
  const totalRecebido = sumBalances(recebido);
  if (totalRecebido <= 0) return { ok: false, reason: 'INVALID', detail: 'Informe o que chegou.' };
  const bad = invalidMultiples(config, recebido);
  if (bad.length) return { ok: false, reason: 'INVALID', detail: `Valor incompatível com a denominação: ${bad.join(', ')}.` };

  /* O MOVIMENTO NO COFRE: entra o que chegou, sai o que a unidade entregou em
     troca. Sai o que foi combinado no pedido — é o que o gerente mandou para o
     escritório quando fez a solicitação. */
  const entregue = sanitizeInput(config, readBalances(req.giveJson as Record<string, unknown> | null));
  const deltas: Balances = {};
  for (const k of config.keys) deltas[k] = r2((recebido[k] || 0) - (entregue[k] || 0));
  const diferenca = r2(totalRecebido - totalEnviado);

  await applyMovement(user, req.unitId, 'OFFICE_SWAP', deltas, {
    note: `Troco recebido do escritório${input.note?.trim() ? `: ${input.note.trim()}` : ''}`,
  }, ctx);

  await prisma.cashChangeRequest.update({
    where: { id },
    data: {
      status: 'RECEIVED',
      receivedJson: recebido as unknown as Prisma.InputJsonValue,
      receivedById: user.id, receivedByName: user.name,
      receivedNote: input.note?.trim() || null,
      receivedAt: new Date(),
    },
  });

  const unit = await prisma.unit.findUnique({ where: { id: req.unitId }, select: { name: true } });
  if (Math.abs(diferenca) > 0.011) {
    /* Divergência de transporte: alguém precisa procurar hoje, não no fechamento. */
    await notifySupervisory({
      title: '🚨 Troco recebido DIFERENTE do enviado',
      body:
        `${unit?.name ?? 'Unidade'}: o escritório enviou ${emReais(totalEnviado)} e ${user.name} confirmou ` +
        `${emReais(totalRecebido)} — diferença de ${emReais(Math.abs(diferenca))}. Confira o transporte.`,
      link: '/modulos/troco', module: 'CASH', critical: true,
    }, req.unitId).catch(() => {});
  } else if (req.sentById) {
    await notifyUsers([req.sentById], {
      title: '✅ Troco recebido',
      body: `${unit?.name ?? 'A unidade'} confirmou o recebimento de ${emReais(totalRecebido)}.`,
      link: '/modulos/troco', module: 'CASH',
    }).catch(() => {});
  }

  await audit({
    userId: user.id, unitId: req.unitId, action: 'CASH_CHANGE_RECEIVED', module: 'CASH',
    entity: 'cash_change_request', entityId: id,
    metadata: { totalEnviado, totalRecebido, diferenca, recebido }, ...ctx,
  });
  return { ok: true, divergence: diferenca };
}

/** Fila do escritório: pedidos de TODAS as unidades que ele alcança. */
export async function getOfficeChangeRequests(user: SessionUser): Promise<ChangeRequestUI[]> {
  if (!isOffice(user) && user.role !== 'CEO') return [];
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true },
  });
  const nameById = new Map(units.map((u) => [u.id, u.name]));
  if (nameById.size === 0) return [];

  const rows = await prisma.cashChangeRequest.findMany({
    where: { unitId: { in: [...nameById.keys()] }, status: { in: ['OPEN', 'SENT'] } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, unitName: nameById.get(r.unitId),
    amount: r.amount != null ? Number(r.amount) : null, note: r.note ?? '',
    status: r.status, requestedByName: r.requestedByName, createdAt: r.createdAt.toISOString(),
    resolvedByName: r.resolvedByName, resolvedNote: r.resolvedNote, resolvedAt: r.resolvedAt?.toISOString() ?? null,
    ...requestSides(r),
    ...sentAndReceived(r),
  }));
}

/** Relação de troco ENVIADO — o histórico que o escritório precisa prestar. */
export async function getSentChangeHistory(
  user: SessionUser,
  filtros: { unitId?: string; from?: string; to?: string } = {},
): Promise<ChangeRequestUI[]> {
  if (!isOffice(user) && user.role !== 'CEO') return [];
  const units = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    select: { id: true, name: true },
  });
  const nameById = new Map(units.map((u) => [u.id, u.name]));
  const ids = filtros.unitId && nameById.has(filtros.unitId) ? [filtros.unitId] : [...nameById.keys()];
  if (ids.length === 0) return [];

  const rows = await prisma.cashChangeRequest.findMany({
    where: {
      unitId: { in: ids },
      sentAt: {
        not: null,
        ...(filtros.from ? { gte: new Date(filtros.from + 'T00:00:00.000Z') } : {}),
        ...(filtros.to ? { lt: new Date(new Date(filtros.to + 'T00:00:00.000Z').getTime() + 86400000) } : {}),
      },
    },
    orderBy: { sentAt: 'desc' },
    take: 300,
  });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, unitName: nameById.get(r.unitId),
    amount: r.amount != null ? Number(r.amount) : null, note: r.note ?? '',
    status: r.status, requestedByName: r.requestedByName, createdAt: r.createdAt.toISOString(),
    resolvedByName: r.resolvedByName, resolvedNote: r.resolvedNote, resolvedAt: r.resolvedAt?.toISOString() ?? null,
    ...requestSides(r),
    ...sentAndReceived(r),
  }));
}

/** Supervisão resolve, ou o próprio solicitante cancela, uma solicitação de troco. */
export async function resolveChangeRequest(user: SessionUser, id: string, action: 'resolve' | 'cancel', resolvedNote: string | undefined, ctx: Ctx = {}): Promise<Result> {
  const req = await prisma.cashChangeRequest.findUnique({ where: { id } });
  if (!req) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, req.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (req.status !== 'OPEN') return { ok: false, reason: 'INVALID', detail: 'Esta solicitação já foi encerrada.' };
  if (action === 'resolve' && !isSupervisory(user.role)) return { ok: false, reason: 'FORBIDDEN', detail: 'Só a supervisão pode atender.' };
  if (action === 'cancel' && req.requestedById !== user.id && !isSupervisory(user.role)) return { ok: false, reason: 'FORBIDDEN' };

  /* Atender aplica a troca no cofre quando o pedido tem os dois lados fechando
     1:1. Antes a supervisão atendia aqui e alguém digitava a MESMA troca de novo
     na tela do cofre — dois lançamentos à mão para um só fato. O movimento fica
     no histórico como OFFICE_SWAP, igual a uma troca registrada à mão. */
  let aplicado: number | null = null;
  if (action === 'resolve') {
    const config = await getDenominations(req.unitId);
    const need = sanitizeInput(config, readBalances(req.needJson as Record<string, unknown> | null));
    const give = sanitizeInput(config, readBalances(req.giveJson as Record<string, unknown> | null));
    const needTotal = sumBalances(need);
    const giveTotal = sumBalances(give);
    if (needTotal > 0 && giveTotal > 0 && Math.abs(needTotal - giveTotal) <= 0.011) {
      const deltas: Balances = {};
      for (const k of config.keys) deltas[k] = r2((need[k] || 0) - (give[k] || 0));
      await applyMovement(user, req.unitId, 'OFFICE_SWAP', deltas, {
        note: `Troco atendido — pedido de ${req.requestedByName}${resolvedNote?.trim() ? `: ${resolvedNote.trim()}` : ''}`,
      }, ctx);
      aplicado = r2(needTotal);
    }
  }

  await prisma.cashChangeRequest.update({
    where: { id },
    data: { status: action === 'resolve' ? 'RESOLVED' : 'CANCELED', resolvedById: user.id, resolvedByName: user.name, resolvedNote: resolvedNote?.trim() || null, resolvedAt: new Date() },
  });
  if (action === 'resolve') {
    const cofre = aplicado != null
      ? ` O cofre já foi atualizado (${aplicado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`
      : '';
    await notifyUsers([req.requestedById], {
      title: '✅ Troco atendido',
      body: `${user.name} atendeu seu pedido de troco${resolvedNote?.trim() ? `: ${resolvedNote.trim()}` : '.'}${cofre}`,
      link: '/modulos/troco', module: 'CASH',
    }).catch(() => {});
  }
  await audit({ userId: user.id, unitId: req.unitId, action: action === 'resolve' ? 'CASH_CHANGE_RESOLVE' : 'CASH_CHANGE_CANCEL', module: 'CASH', entity: 'cash_change_request', entityId: id, metadata: { appliedToVault: aplicado }, ...ctx });
  return { ok: true };
}

export interface ChangeRequestUI {
  id: string; unitId: string; unitName?: string; amount: number | null; note: string;
  status: ChangeRequestStatus; requestedByName: string; createdAt: string;
  resolvedByName: string | null; resolvedNote: string | null; resolvedAt: string | null;
  /** Detalhe por denominação (vazio nos pedidos antigos, de texto livre). */
  need: Balances; give: Balances; needTotal: number; giveTotal: number;
  /** Os dois lados fecham 1:1 — atender vai aplicar a troca no cofre. */
  autoApply: boolean;
  /** ENVIO pelo escritório (vazio enquanto não sai). */
  sent: Balances; sentTotal: number; sentByName: string | null; sentAt: string | null; sentNote: string | null;
  /** RECEBIMENTO confirmado pelo gerente (vazio enquanto não chega). */
  received: Balances; receivedTotal: number; receivedByName: string | null; receivedAt: string | null; receivedNote: string | null;
  /** Chegou diferente do que saiu. */
  divergent: boolean;
}

/** Lê os dois lados de um pedido, tolerante com os registros antigos sem detalhe. */
function requestSides(row: { needJson: unknown; giveJson: unknown }) {
  const need = readBalances(row.needJson as Record<string, unknown> | null);
  const give = readBalances(row.giveJson as Record<string, unknown> | null);
  const needTotal = sumBalances(need);
  const giveTotal = sumBalances(give);
  return { need, give, needTotal, giveTotal, autoApply: needTotal > 0 && giveTotal > 0 && Math.abs(needTotal - giveTotal) <= 0.011 };
}

/** Solicitações de troco de uma unidade (abertas primeiro). */
export async function getChangeRequests(user: SessionUser, unitId: string): Promise<ChangeRequestUI[]> {
  if (!canAccessUnit(user, unitId)) return [];
  const rows = await prisma.cashChangeRequest.findMany({ where: { unitId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 50 });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, amount: r.amount != null ? Number(r.amount) : null, note: r.note ?? '', status: r.status,
    requestedByName: r.requestedByName, createdAt: r.createdAt.toISOString(),
    resolvedByName: r.resolvedByName, resolvedNote: r.resolvedNote, resolvedAt: r.resolvedAt?.toISOString() ?? null,
    ...requestSides(r),
    ...sentAndReceived(r),
  }));
}

/**
 * Solicitações de troco ABERTAS nas unidades do usuário (para destaque/badge da
 * supervisão). Retorna as unidades com pendência para a aba de Troco realçar.
 */
export async function getOpenChangeRequests(user: SessionUser): Promise<ChangeRequestUI[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, select: { id: true, name: true } });
  const nameById = new Map(units.map((u) => [u.id, u.name]));
  if (nameById.size === 0) return [];
  const rows = await prisma.cashChangeRequest.findMany({
    where: { status: 'OPEN', unitId: { in: [...nameById.keys()] } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  return rows.map((r) => ({
    id: r.id, unitId: r.unitId, unitName: nameById.get(r.unitId), amount: r.amount != null ? Number(r.amount) : null, note: r.note ?? '',
    status: r.status, requestedByName: r.requestedByName, createdAt: r.createdAt.toISOString(),
    resolvedByName: null, resolvedNote: null, resolvedAt: null,
    ...requestSides(r),
    ...sentAndReceived(r),
  }));
}

/* ───────── Histórico filtrável de movimentações ───────── */

export interface VaultHistoryFilters {
  types?: CashMovementType[];
  userId?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD (inclusive)
  minValue?: number;
  maxValue?: number;
  sort?: 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc';
}
export interface MovementUI {
  id: string; type: CashMovementType; bucketName: string | null; totalIn: number; totalOut: number;
  value: number; note: string | null; createdByName: string; createdById: string; createdAt: string; deltas: Balances;
}
export interface VaultHistoryResult {
  rows: MovementUI[];
  users: { id: string; name: string }[];
  total: number;
}

/** Histórico completo do cofre da unidade, com filtros e ordenação. */
export async function getVaultHistory(user: SessionUser, unitId: string, f: VaultHistoryFilters = {}): Promise<VaultHistoryResult | null> {
  if (!canAccessUnit(user, unitId)) return null;

  const where: Prisma.CashVaultMovementWhereInput = { unitId };
  if (f.types?.length) where.type = { in: f.types };
  if (f.userId) where.createdById = f.userId;
  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = new Date(`${f.from}T00:00:00`);
    if (f.to) where.createdAt.lte = new Date(`${f.to}T23:59:59.999`);
  }

  const [raw, distinctUsers] = await Promise.all([
    prisma.cashVaultMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 800 }),
    prisma.cashVaultMovement.findMany({ where: { unitId }, distinct: ['createdById'], select: { createdById: true, createdByName: true }, orderBy: { createdByName: 'asc' } }),
  ]);

  let rows: MovementUI[] = raw.map((m) => {
    const totalIn = Number(m.totalIn); const totalOut = Number(m.totalOut);
    return {
      id: m.id, type: m.type, bucketName: m.bucketName, totalIn, totalOut,
      value: Math.max(totalIn, totalOut), note: m.note, createdByName: m.createdByName, createdById: m.createdById,
      createdAt: m.createdAt.toISOString(), deltas: readBalances(m.deltas as Record<string, unknown>),
    };
  });

  if (f.minValue != null) rows = rows.filter((r) => r.value >= f.minValue!);
  if (f.maxValue != null) rows = rows.filter((r) => r.value <= f.maxValue!);

  const sort = f.sort ?? 'date_desc';
  rows.sort((a, b) =>
    sort === 'date_asc' ? a.createdAt.localeCompare(b.createdAt)
      : sort === 'value_desc' ? b.value - a.value
      : sort === 'value_asc' ? a.value - b.value
      : b.createdAt.localeCompare(a.createdAt),
  );

  return {
    rows,
    users: distinctUsers.map((u) => ({ id: u.createdById, name: u.createdByName })),
    total: rows.length,
  };
}

/* ───────── Baldes (supervisor fixa o valor) ───────── */
export async function upsertBucket(user: SessionUser, input: { id?: string; unitId: string; name: string; targetValue: number }, ctx: Ctx = {}): Promise<Result> {
  if (!canManageBuckets(user)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!input.name?.trim() || !(input.targetValue > 0)) return { ok: false, reason: 'INVALID' };
  if (input.id) {
    await prisma.cashBucket.update({ where: { id: input.id }, data: { name: input.name.trim(), targetValue: input.targetValue } });
  } else {
    await prisma.cashBucket.create({ data: { unitId: input.unitId, name: input.name.trim(), targetValue: input.targetValue } });
  }
  await audit({ userId: user.id, unitId: input.unitId, action: 'CASH_BUCKET_SET', module: 'CASH', entity: 'cash_bucket', metadata: { name: input.name, target: input.targetValue }, ...ctx });
  return { ok: true };
}

export async function toggleBucket(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<Result> {
  if (!canManageBuckets(user)) return { ok: false, reason: 'FORBIDDEN' };
  const b = await prisma.cashBucket.findUnique({ where: { id }, select: { unitId: true } });
  if (!b) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.cashBucket.update({ where: { id }, data: { active } });
  await audit({ userId: user.id, unitId: b.unitId, action: active ? 'CASH_BUCKET_ON' : 'CASH_BUCKET_OFF', module: 'CASH', entity: 'cash_bucket', entityId: id, ...ctx });
  return { ok: true };
}

/** Exclui o balde por completo (Supervisão/Admin). Os movimentos guardam o nome (snapshot). */
export async function deleteBucket(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Result> {
  if (!canManageBuckets(user)) return { ok: false, reason: 'FORBIDDEN' };
  const b = await prisma.cashBucket.findUnique({ where: { id }, select: { unitId: true, name: true } });
  if (!b) return { ok: false, reason: 'NOT_FOUND' };
  await prisma.cashBucket.delete({ where: { id } });
  await audit({ userId: user.id, unitId: b.unitId, action: 'CASH_BUCKET_DELETE', module: 'CASH', entity: 'cash_bucket', entityId: id, metadata: { name: b.name }, ...ctx });
  return { ok: true };
}

/* ───────── Visões ───────── */
/** Denominação como a tela do cofre precisa (rótulo + blocos), vinda da config da unidade. */
export interface DenominationView {
  key: string; label: string; value: number | null; kind: DenomKind;
  isSmall: boolean; isBig: boolean; countsAsBigIndicator: boolean;
}
export interface VaultOverview {
  balances: Balances;
  total: number;
  denominations: DenominationView[]; // config ativa da unidade (ordenada) — dirige os formulários
  bigNotesTotal: number; // notas grandes (indicador) — p/ pedir troca
  bigNotesPct: number;
  buckets: { id: string; name: string; targetValue: number; active: boolean }[];
  recentMovements: {
    id: string; type: CashMovementType; bucketName: string | null; totalIn: number; totalOut: number;
    note: string | null; createdByName: string; createdAt: string; deltas: Balances;
  }[];
  changeRequests: ChangeRequestUI[]; // solicitações de troco desta unidade (abertas primeiro)
  openChangeCount: number;
  monthWithdrawals: number;
  lastCountAt: string | null;
}

export async function getVaultOverview(user: SessionUser, unitId: string): Promise<VaultOverview | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const config = await getDenominations(unitId);
  const vault = await getOrCreateVault(unitId);
  const balances = readBalances(vault.balances as Record<string, unknown>);
  const total = sumBalances(balances);
  const bigNotesTotal = r2(config.indicatorKeys.reduce((t, k) => t + (balances[k] || 0), 0));
  const ym = new Date().toISOString().slice(0, 7);

  const [buckets, movements, monthWithdrawals, lastCount, changeRequests] = await Promise.all([
    prisma.cashBucket.findMany({ where: { unitId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.cashVaultMovement.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.cashVaultMovement.count({ where: { unitId, type: 'WITHDRAWAL', createdAt: { gte: new Date(`${ym}-01T00:00:00Z`) } } }),
    prisma.cashVaultMovement.findFirst({ where: { unitId, type: 'COUNT' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    getChangeRequests(user, unitId),
  ]);

  return {
    balances, total,
    denominations: config.denominations.map((d) => ({
      key: d.key, label: denomLabel(d), value: d.value, kind: d.kind,
      isSmall: d.isSmall, isBig: d.isBig, countsAsBigIndicator: d.countsAsBigIndicator,
    })),
    bigNotesTotal,
    bigNotesPct: total > 0 ? Math.round((bigNotesTotal / total) * 100) : 0,
    buckets: buckets.map((b) => ({ id: b.id, name: b.name, targetValue: Number(b.targetValue), active: b.active })),
    recentMovements: movements.map((m) => ({
      id: m.id, type: m.type, bucketName: m.bucketName, totalIn: Number(m.totalIn), totalOut: Number(m.totalOut),
      note: m.note, createdByName: m.createdByName, createdAt: m.createdAt.toISOString(),
      deltas: readBalances(m.deltas as Record<string, unknown>),
    })),
    changeRequests,
    openChangeCount: changeRequests.filter((c) => c.status === 'OPEN').length,
    monthWithdrawals,
    lastCountAt: lastCount?.createdAt.toISOString() ?? null,
  };
}

/** Retiradas proibidas do mês por unidade (Supervisão/Admin/CEO + Visão Executiva). */
export async function getVaultAlerts(user: SessionUser, yearMonth: string): Promise<{ unitId: string; unitName: string; withdrawals: number; withdrawnTotal: number; vaultTotal: number }[]> {
  const units = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const start = new Date(`${yearMonth}-01T00:00:00Z`);
  const [y, m] = yearMonth.split('-').map(Number);
  const end = new Date(Date.UTC(y, m, 1));
  const out = [];
  for (const u of units) {
    const [wd, vault] = await Promise.all([
      prisma.cashVaultMovement.aggregate({ where: { unitId: u.id, type: 'WITHDRAWAL', createdAt: { gte: start, lt: end } }, _count: true, _sum: { totalOut: true } }),
      prisma.cashVault.findUnique({ where: { unitId: u.id }, select: { balances: true } }),
    ]);
    out.push({
      unitId: u.id, unitName: u.name,
      withdrawals: wd._count, withdrawnTotal: r2(Number(wd._sum.totalOut ?? 0)),
      vaultTotal: vault ? sumBalances(readBalances(vault.balances as Record<string, unknown>)) : 0,
    });
  }
  return out.sort((a, b) => b.withdrawals - a.withdrawals);
}
