import { prisma } from '@/lib/db/prisma';

/**
 * Webhook de férias SGO→RH (v1.16.0): sempre que férias são planejadas/
 * solicitadas ou canceladas no SGO, avisamos o RH no endereço da doc
 * (RH_WEBHOOK_FERIAS_URL) com Authorization: Bearer <SGO_WEBHOOK_TOKEN>.
 * Inerte sem token (não quebra nada); melhor esforço (não bloqueia o fluxo).
 * Todo disparo fica registrado em RhInboundEvent com event 'webhook_ferias_out'.
 */
const URL = process.env.RH_WEBHOOK_FERIAS_URL ?? 'https://gbf-rh.replit.app/api/integracoes/sgo/ferias';
const TOKEN = process.env.SGO_WEBHOOK_TOKEN ?? '';

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

export function feriasWebhookConfigured(): boolean {
  return Boolean(TOKEN);
}

/** Dispara o webhook (melhor esforço) e registra o resultado. */
export async function sendFeriasWebhook(payload: FeriasWebhookPayload): Promise<void> {
  if (!TOKEN) return; // inerte até o token ser combinado no painel do RH
  let message = '';
  let ok = false;
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
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
