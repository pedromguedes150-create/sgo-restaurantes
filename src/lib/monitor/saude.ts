import os from 'node:os';
import path from 'node:path';
import { statfs, readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db/prisma';
import { notifyAdmins } from '@/lib/notifications';
import {
  avaliarSaude, deveAvisar, situacaoGeral,
  type AmostraDeSaude, type AlertaDeSaude, type NivelDoAlerta,
} from '@/lib/monitor/saude-regras';

/**
 * Saúde do servidor (v1.206.0): mede de 2 em 2 minutos e avisa os Administradores
 * ANTES de o sistema falhar (disco, memória, banco lento, conexões).
 *
 * ⚠️ Limite honesto: se o servidor CAIR de vez, ele não consegue avisar ninguém —
 * para isso serve um monitor EXTERNO apontado para /api/health (ex.: UptimeRobot).
 */

const CHAVE_DOS_AVISOS = 'MONITOR_SAUDE_AVISOS';
const MAX_HISTORICO = 30;

const g = globalThis as unknown as { __sgoSaude?: { historico: AmostraDeSaude[]; alertas: AlertaDeSaude[] } };
const estado = (g.__sgoSaude ??= { historico: [], alertas: [] });

async function comLimite<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * Memória usada, em %. No Linux lê MemAvailable de /proc/meminfo: o "livre" puro
 * conta o cache de disco como usado e mostraria 95% numa máquina saudável.
 */
async function memoriaUsadaPct(): Promise<number | null> {
  try {
    const txt = await readFile('/proc/meminfo', 'utf8');
    const kb = (nome: string) => Number((txt.match(new RegExp('^' + nome + ':\\s+(\\d+)', 'm')) ?? [])[1]);
    const total = kb('MemTotal'), disp = kb('MemAvailable');
    if (total > 0 && Number.isFinite(disp)) return Math.round((1 - disp / total) * 1000) / 10;
  } catch { /* não é Linux */ }
  try { return Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10; } catch { return null; }
}

/** Uma medição agora. Nada aqui lança: o que não der para medir vem nulo. */
export async function coletarAmostra(): Promise<AmostraDeSaude> {
  const t0 = Date.now();
  const ok = await comLimite(prisma.$queryRaw`SELECT 1`, 5000);
  const dbMs = ok === null ? null : Date.now() - t0;

  const t1 = Date.now();
  await new Promise((r) => setTimeout(r, 50));
  const loopMs = Math.max(0, Date.now() - t1 - 50);

  let memoriaPct: number | null = null;
  memoriaPct = await memoriaUsadaPct();

  let discoPct: number | null = null;
  let discoLivreGb: number | null = null;
  try {
    const s = await statfs(path.join(process.cwd()));
    const total = Number(s.blocks) * Number(s.bsize);
    const livre = Number(s.bavail) * Number(s.bsize);
    if (total > 0) { discoPct = Math.round((1 - livre / total) * 1000) / 10; discoLivreGb = Math.round((livre / 1024 ** 3) * 10) / 10; }
  } catch { /* plataforma sem statfs */ }

  let conexoesPct: number | null = null;
  if (dbMs !== null) {
    const r = await comLimite(prisma.$queryRaw<{ n: number; max: number }[]>`SELECT count(*)::int AS n, current_setting('max_connections')::int AS max FROM pg_stat_activity`, 5000);
    if (r && r[0] && r[0].max > 0) conexoesPct = Math.round((r[0].n / r[0].max) * 1000) / 10;
  }

  return {
    em: new Date().toISOString(), dbMs, loopMs, memoriaPct,
    processoMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    discoPct, discoLivreGb, conexoesPct,
  };
}

type Avisos = Record<string, { nivel: NivelDoAlerta; em: number }>;

async function lerAvisos(): Promise<Avisos> {
  try {
    const s = await prisma.appSetting.findUnique({ where: { key: CHAVE_DOS_AVISOS } });
    return s ? (JSON.parse(s.value) as Avisos) : {};
  } catch { return {}; }
}

/**
 * Mede, avalia e avisa. Chamada pelo agendador. O mesmo alerta não se repete
 * antes do intervalo (1h crítico, 6h atenção); subir de atenção para crítico
 * avisa na hora. Problema resolvido some da lista (e o próximo volta a avisar).
 */
export async function verificarSaude(opts: { notificar?: boolean } = {}): Promise<{ amostra: AmostraDeSaude; alertas: AlertaDeSaude[]; avisados: string[] }> {
  const amostra = await coletarAmostra();
  const alertas = avaliarSaude(amostra, estado.historico);
  estado.historico.push(amostra);
  if (estado.historico.length > MAX_HISTORICO) estado.historico.shift();
  estado.alertas = alertas;

  const avisados: string[] = [];
  if (opts.notificar === false) return { amostra, alertas, avisados };

  const agora = Date.now();
  const ultimos = await lerAvisos();
  const novos: Avisos = {};
  for (const a of alertas) {
    const ultimo = ultimos[a.chave];
    if (deveAvisar(a, ultimo, agora)) {
      try {
        await notifyAdmins({ title: a.titulo, body: a.texto, link: '/configuracoes/integracoes', module: 'CONFIG', ...(a.nivel === 'CRITICO' ? { critical: true } : { nivel: 'IMPORTANTE' as const }) });
        avisados.push(a.chave);
        novos[a.chave] = { nivel: a.nivel, em: agora };
      } catch (e) {
        console.error('[saude] não consegui avisar os administradores:', a.titulo, e);
        if (ultimo) novos[a.chave] = ultimo;
      }
    } else if (ultimo) novos[a.chave] = ultimo;
    /* fica também no log do servidor, que sobrevive mesmo se o banco estiver fora */
    console.warn(`[saude] ${a.nivel}: ${a.titulo} — ${a.texto}`);
  }
  if (JSON.stringify(novos) !== JSON.stringify(ultimos)) {
    try {
      await prisma.appSetting.upsert({ where: { key: CHAVE_DOS_AVISOS }, create: { key: CHAVE_DOS_AVISOS, value: JSON.stringify(novos) }, update: { value: JSON.stringify(novos) } });
    } catch { /* banco fora: tenta na próxima */ }
  }
  return { amostra, alertas, avisados };
}

/** Para a tela do Admin: a última medição (mede agora se ainda não houver nenhuma). */
export async function saudeAtual() {
  if (estado.historico.length === 0) await verificarSaude({ notificar: false });
  const amostra = estado.historico[estado.historico.length - 1];
  return { amostra, alertas: estado.alertas, situacao: situacaoGeral(estado.alertas), medicoes: estado.historico.length };
}
