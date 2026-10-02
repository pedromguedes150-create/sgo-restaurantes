import { activeOvertimeReasons } from '@/lib/overtime/reasons';

/**
 * Desde a v1.142.0 a Hora Extra exige um motivo do CATÁLOGO. Os testes pegam
 * o primeiro ativo (o catálogo é semeado na primeira leitura) — o que se prova
 * em cada arquivo não é o motivo, e sim a regra que ele exercita.
 */
let cache: string | null = null;
export async function motivoHE(): Promise<string> {
  if (!cache) cache = (await activeOvertimeReasons())[0].id;
  return cache;
}
