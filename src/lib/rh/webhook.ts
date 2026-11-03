import { prisma } from '@/lib/db/prisma';
import { rhSaidaToken } from '@/lib/rh/saida/config';

/**
 * Webhook de férias SGO→RH (v1.16.0): sempre que férias são planejadas/
 * solicitadas ou canceladas no SGO, avisamos o RH no endereço da doc
 * (RH_WEBHOOK_FERIAS_URL). Melhor esforço (não bloqueia o fluxo).
 * Todo disparo fica registrado em RhInboundEvent com event 'webhook_ferias_out'.
 *
 * v1.183.1 — o TOKEN é o MESMO da fila de Envios ao RH (`rhSaidaToken()`:
 * `.env RH_WEBHOOK_TOKEN` ?? o colado na tela de Envios ao RH). O RH aceita
 * esse token também em /api/integracoes/sgo/ferias (conferido em 03/11/2026),
 * enquanto o `SGO_WEBHOOK_TOKEN` próprio do `.env` vinha sendo recusado com
 * 401 desde 25/09 — todo aviso de férias saía como erro. `SGO_WEBHOOK_TOKEN`
 * fica só como reserva, quando não há token da fila em lugar nenhum.
 */
const URL = process.env.RH_WEBHOOK_FERIAS_URL ?? 'https://gbf-rh.replit.app/api/integracoes/sgo/ferias';

export interface FeriasWebhookPayload {
  acao: 'criar' | 'cancelar';
  movimento: 'PLANEJAMENTO' | 'GOZO' | 'DIAS_VENDIDOS';
  colaborador: { nome: string; cpf?: string | null; matricula?: string | null };
  inicio: string; // YYYY-MM-DD
  fim: string;
  dias: number;
  observacao?: string | null;
  origem: 'SGO';
}

export type OrigemDoTokenDeFerias = 'fila' | 'SGO_WEBHOOK_TOKEN' | 'nenhum';

/** O token que vai no aviso de férias e de onde ele veio (nunca o valor para a tela). */
export async function tokenDoWebhookDeFerias(): Promise<{ token: string; origem: OrigemDoTokenDeFerias }> {
  const daFila = await rhSaidaToken();
  if (daFila) return { token: daFila, origem: 'fila' };
  const legado = process.env.SGO_WEBHOOK_TOKEN?.trim() ?? '';
  if (legado) return { token: legado, origem: 'SGO_WEBHOOK_TOKEN' };
  return { token: '', origem: 'nenhum' };
}

export async function feriasWebhookConfigured(): Promise<boolean> {
  return Boolean((await tokenDoWebhookDeFerias()).token);
}

/** Dispara o webhook (melhor esforço) e registra o resultado. */
export async function sendFeriasWebhook(payload: FeriasWebhookPayload): Promise<void> {
  const { token } = await tokenDoWebhookDeFerias();
  if (!token) return; // inerte até existir um token (fila ou .env)
  let message = '';
  let ok = false;
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text().catch(() => '');
    ok = res.ok;
    message = `HTTP ${res.status} — ${body.slice(0, 300)}`;
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  await prisma.rhInboundEvent.create({
    data: { event: 'webhook_ferias_out', payload: payload as object, status: ok ? 'PROCESSED' : 'ERROR', message },
  }).catch(() => {});
}
