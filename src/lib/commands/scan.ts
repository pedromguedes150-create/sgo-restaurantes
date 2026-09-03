import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { getActiveSequence } from '@/lib/commands/active';
import { absentFromScans } from '@/lib/commands/barcode';
import { submitCount } from '@/lib/commands/count';
import { escopoDoLeitor } from '@/lib/commands/scan-scope';
import type { OpenCmdSuspect } from '@/lib/commands/open-analysis';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Conferência de comandas por LEITOR DE CÓDIGO DE BARRAS (item 3 do antifraude).
 *
 * O caixa bipa cada comanda física presente; o SGO calcula as faltantes
 * (ativas − bipadas) e reaproveita `submitCount` — mesma contagem, mesmas
 * divergências, mesmo alerta ao supervisor da grade manual. Sem lógica paralela.
 */

export interface ScanContext {
  unitId: string;
  unitName: string;
  operationalDate: string;
  /**
   * TODAS as ativas da unidade — é o universo que o leitor aceita.
   *
   * Antes vinha só a faixa da madrugada, e por isso bipar a 350 respondia "não
   * pertence à sequência": a contagem da semana não podia ser feita por leitor.
   */
  activeNumbers: number[];
  /** A faixa do dia. Vazia quando a unidade confere tudo todo dia. */
  nightlyNumbers: number[];
  /** a unidade tem faixa de madrugada: esta conferência é PARCIAL */
  partial: boolean;
  /** total de ativas na unidade — só para a tela dizer quantas ficam de fora */
  totalAtivas: number;
  /** já houve contagem registrada nesta data operacional? */
  alreadyCounted: boolean;
}

export type ScanContextResult = { ok: true; ctx: ScanContext } | { ok: false; reason: 'FORBIDDEN' | 'NO_CONFIG' | 'INVALID' };

export async function getScanContext(user: SessionUser, unitId: string): Promise<ScanContextResult> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true, timezone: true, cutoffHour: true } });
  if (!unit) return { ok: false, reason: 'INVALID' };

  const seq = await getActiveSequence(unit.id);
  if (!seq.config) return { ok: false, reason: 'NO_CONFIG' };

  const operationalDate = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const count = await prisma.commandCount.findUnique({
    where: { unitId_operationalDate: { unitId: unit.id, operationalDate } },
    select: { id: true },
  });

  return {
    ok: true,
    ctx: {
      unitId: unit.id,
      unitName: unit.name,
      operationalDate,
      activeNumbers: [...seq.active].sort((a, b) => a - b),
      nightlyNumbers: seq.hasNightly ? [...seq.nightly].sort((a, b) => a - b) : [],
      partial: seq.hasNightly,
      totalAtivas: seq.active.size,
      alreadyCounted: Boolean(count),
    },
  };
}

/** Comanda faltante que TAMBÉM está aberta com valor no Teknisa — o caso clássico. */
export interface CrossHit {
  number: number;
  value: number;
  openedAt: string | null;
  daysOpen: number;
}

export type SubmitScanResult =
  | {
      ok: true; absent: number[]; scanned: number; newDivergences: number; crossed: CrossHit[]; cutDate: string | null;
      /** Foi registrada como contagem COMPLETA da sequência? */
      completa: boolean;
      /** As bipadas fora da faixa do dia que tornaram a conferência completa. */
      foraDaFaixa: number[];
    }
  | { ok: false; reason: 'FORBIDDEN' | 'NO_CONFIG' | 'INVALID' | 'OBSERVATION_REQUIRED' };

/**
 * Fecha a conferência: faltantes = ativas − bipadas.
 * Depois cruza as faltantes com a ÚLTIMA análise de "Comandas em Aberto" da
 * unidade: faltar fisicamente E estar aberta com valor no sistema é o sinal
 * forte da fraude das "2 comandas" (o item 4 encontra o fiscal, este o físico).
 */
export async function submitScanCount(
  user: SessionUser,
  input: { unitId: string; scannedNumbers: number[]; note?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<SubmitScanResult> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const seq = await getActiveSequence(input.unitId);
  if (!seq.config) return { ok: false, reason: 'NO_CONFIG' };

  const scanned = new Set((input.scannedNumbers ?? []).filter((n) => Number.isInteger(n) && seq.active.has(n)));

  /* QUEM DECIDE O ESCOPO É O QUE FOI BIPADO. Só a faixa do dia? Contagem
     parcial. Apareceu uma comanda de fora? É a contagem da semana, e o escopo
     passa a ser a sequência inteira — porque o caixa está conferindo tudo. */
  const { escopo, completa, foraDaFaixa } = escopoDoLeitor(seq.active, seq.nightly, seq.hasNightly, scanned);
  const absent = absentFromScans(escopo, scanned);

  const note = (input.note ?? '').trim();
  const virouCompleta = seq.hasNightly && completa;
  const observation = [
    `Conferência por leitor${virouCompleta ? ' (COMPLETA — bipou fora da faixa do dia)' : completa ? '' : ' (madrugada, faixa parcial)'}: ${scanned.size} bipada(s) de ${escopo.size} no escopo; ${absent.length} faltante(s).`,
    virouCompleta ? `Fora da faixa: ${foraDaFaixa.slice(0, 10).join(', ')}${foraDaFaixa.length > 10 ? '…' : ''}.` : '',
    note,
  ]
    .filter(Boolean)
    .join(' ');

  const r = await submitCount(
    user,
    {
      unitId: input.unitId,
      allPresent: absent.length === 0,
      absentNumbers: absent,
      /* AS BIPADAS PRECISAM SER GRAVADAS. Sem isto, o leitor mandava só os
         ausentes: `presentNumbers` ficava vazio e a grade do gerente abria com
         "0 ok" no dia seguinte a uma conferência inteira — como se ninguém
         tivesse contado nada. */
      presentNumbers: [...scanned].filter((n) => escopo.has(n)),
      /* Só a PARCIAL guarda escopo. Na completa ele vai ausente de propósito:
         é isso que faz a contagem valer como completa e atualizar o indicador
         "última contagem completa". */
      scopeNumbers: completa ? undefined : [...escopo],
      observation,
    },
    ctx,
  );
  if (!r.ok) return { ok: false, reason: r.reason };

  const crossed = await crossWithOpenCommands(input.unitId, absent);
  return { ok: true, absent, scanned: scanned.size, newDivergences: r.newDivergences, crossed: crossed.hits, cutDate: crossed.cutDate, completa, foraDaFaixa };
}

/** Cruza uma lista de faltantes com as suspeitas da última análise de comandas em aberto. */
export async function crossWithOpenCommands(unitId: string, absent: number[]): Promise<{ hits: CrossHit[]; cutDate: string | null }> {
  if (absent.length === 0) return { hits: [], cutDate: null };
  const last = await prisma.openCommandAnalysis.findFirst({ where: { unitId }, orderBy: { createdAt: 'desc' } });
  if (!last) return { hits: [], cutDate: null };

  const suspects = ((last.suspects as unknown as OpenCmdSuspect[]) ?? []).filter(Boolean);
  const missing = new Set(absent);
  const hits: CrossHit[] = [];
  for (const s of suspects) {
    const n = Number(String(s.number).replace(/\D/g, ''));
    if (!Number.isInteger(n) || !missing.has(n)) continue;
    hits.push({ number: n, value: Number(s.value) || 0, openedAt: s.openedAt ?? null, daysOpen: Number(s.daysOpen) || 0 });
  }
  hits.sort((a, b) => b.value - a.value);
  return { hits, cutDate: last.cutDate };
}
