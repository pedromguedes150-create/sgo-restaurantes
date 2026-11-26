import { despacharVagas } from '@/lib/vagas/fila';
import { lembrarPrazoDoSupervisor } from '@/lib/vagas/rotina';

/**
 * Agendamento da Solicitação de Vagas (só Node — ver `instrumentation.ts`):
 * a fila de envio ao RH a cada 2 min e o lembrete do prazo de hora em hora.
 * Falha de uma rodada só vai ao log: a próxima tenta de novo.
 */
export function agendarVagas(): void {
  const fila = async () => { try { await despacharVagas(); } catch (e) { console.error('[vagas] falha na fila do RH:', e); } };
  const lembrete = async () => { try { await lembrarPrazoDoSupervisor(); } catch (e) { console.error('[vagas] falha no lembrete:', e); } };
  setTimeout(() => { void fila(); void lembrete(); }, 45_000);
  setInterval(() => { void fila(); }, 2 * 60 * 1000);
  setInterval(() => { void lembrete(); }, 60 * 60 * 1000);
}
