/**
 * NÍVEIS DO AVISO AO VIVO (v1.158.0) — PURO, usado pelo servidor (gravação e
 * push), pelo aviso no topo da tela e pelo teste.
 *
 * Pedido do Pedro: notificações "como no WhatsApp" para o gerente.
 *  - NORMAL     → aviso no topo + som curto;
 *  - IMPORTANTE → + vibração curta (onde o aparelho deixa);
 *  - CRITICO    → destaque maior + som mais marcado, NUNCA sirene.
 *
 * Nenhuma regra de módulo mudou: CRITICO é exatamente o `critical` que já
 * existia; IMPORTANTE só é pedido explicitamente por quem notifica (hoje, o
 * comunicado de prioridade Importante). O resto é NORMAL.
 */

export type NivelDoAviso = 'NORMAL' | 'IMPORTANTE' | 'CRITICO';

/** O nível GRAVADO a partir do que quem notifica pediu. `critical` sempre vence. */
export function nivelAoGravar(p: { critical?: boolean; nivel?: 'IMPORTANTE' }): NivelDoAviso {
  if (p.critical) return 'CRITICO';
  return p.nivel === 'IMPORTANTE' ? 'IMPORTANTE' : 'NORMAL';
}

/** O nível LIDO de um aviso já gravado (linhas antigas só têm `critical`). */
export function nivelDoAviso(n: { critical?: boolean | null; level?: string | null }): NivelDoAviso {
  if (n.critical || n.level === 'CRITICO') return 'CRITICO';
  return n.level === 'IMPORTANTE' ? 'IMPORTANTE' : 'NORMAL';
}

/** Quanto tempo o aviso fica no topo da tela antes de sair sozinho. */
export const DURACAO_NA_TELA_MS: Record<NivelDoAviso, number> = { NORMAL: 6000, IMPORTANTE: 9000, CRITICO: 15000 };

/** Vibração no celular (ms), por nível. NORMAL não vibra. */
export const VIBRACAO: Record<NivelDoAviso, number[] | null> = {
  NORMAL: null,
  IMPORTANTE: [120],
  CRITICO: [200, 100, 200],
};

/**
 * SOM — decisão do Pedro (07/10/2026): "só quero higiene com som até o momento".
 * Os demais avisos aparecem no topo da tela SEM som do SGO (a notificação do
 * sistema no celular segue com o som padrão do aparelho, como sempre foi).
 * Quando outro tipo de aviso ganhar som, basta incluí-lo aqui.
 */
export function avisoComSom(a: { link?: string | null; alerta?: string | null }): boolean {
  return a.alerta === 'higiene' || (a.link ?? '').startsWith('/modulos/higiene');
}

/**
 * O som da higiene, em notas (Hz) e tempos (s): "chamativo sem nada alarmante"
 * (pedido do Pedro). Três notas subindo (dó-mi-sol, onda senoidal, ataque suave),
 * tocadas DUAS vezes com uma pausa — sem tom contínuo nem vai-e-vem, que é o que
 * faz um som parecer sirene.
 */
export interface Nota { freq: number; inicio: number; duracao: number }
export function somDoAviso(): { notas: Nota[]; volume: number } {
  const notas: Nota[] = [];
  for (let rep = 0; rep < 2; rep++) [1047, 1319, 1568].forEach((freq, i) => notas.push({ freq, inicio: rep * 0.9 + i * 0.15, duracao: i === 2 ? 0.32 : 0.14 }));
  return { notas, volume: 0.3 };
}

/** Vibração do aviso da higiene com o SGO aberto (a mesma família da do push). */
export const VIBRACAO_HIGIENE = [400, 120, 400, 120, 700];

/**
 * Quais avisos são NOVOS para esta aba: tira o que ela já mostrou (o mesmo aviso
 * pode chegar pelo push e pela checagem) e o que já foi lido. Ordem: mais antigo
 * primeiro, para o mais recente ficar por cima.
 */
export function avisosNovos<T extends { id: string; read?: boolean; createdAt: string }>(chegaram: T[], jaVistos: ReadonlySet<string>): T[] {
  return chegaram
    .filter((a) => !a.read && !jaVistos.has(a.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Esta aba deve tocar e mostrar? Visível: sempre. Escondida (outra aba,
 * minimizado): só se o aparelho NÃO recebe push — com push, quem avisa é a
 * notificação do sistema, e tocar aqui também seria o alerta em dobro.
 */
export function deveAvisarNaAba(visivel: boolean, aparelhoComPush: boolean): boolean {
  return visivel || !aparelhoComPush;
}
