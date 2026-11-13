/**
 * Saúde do servidor — regras PURAS (v1.206.0).
 *
 * A ideia é AVISAR ANTES de quebrar: disco enchendo, banco ficando lento,
 * memória no limite, conexões do banco perto do teto. Cada limite tem dois
 * degraus — ATENÇÃO (dá tempo de agir) e CRÍTICO (vai falhar se ninguém agir).
 * Banco lento e servidor travando só alertam quando se REPETEM (uma amostra
 * ruim isolada é ruído, e alerta que dispara à toa ensina a ignorar o alerta).
 */

export interface AmostraDeSaude {
  em: string;
  /** Tempo de um SELECT 1, em ms; `null` = o banco não respondeu. */
  dbMs: number | null;
  /** Atraso do laço de eventos do Node, em ms (servidor "engasgando"). */
  loopMs: number;
  /** Memória usada da máquina, em % (nulo se não deu para medir). */
  memoriaPct: number | null;
  /** Memória do processo do SGO, em MB. */
  processoMb: number;
  /** Disco usado, em % (nulo se não deu para medir). */
  discoPct: number | null;
  /** Espaço livre em disco, em GB. */
  discoLivreGb: number | null;
  /** Conexões do banco em uso ÷ máximo, em % (nulo se não deu para medir). */
  conexoesPct: number | null;
}

export type NivelDoAlerta = 'ATENCAO' | 'CRITICO';

export interface AlertaDeSaude {
  chave: 'BANCO_FORA' | 'BANCO_LENTO' | 'SERVIDOR_LENTO' | 'DISCO' | 'MEMORIA' | 'CONEXOES';
  nivel: NivelDoAlerta;
  titulo: string;
  texto: string;
}

export const LIMITES = {
  discoAtencao: 80, discoCritico: 90,
  memoriaAtencao: 85, memoriaCritico: 93,
  conexoesAtencao: 70, conexoesCritico: 85,
  dbLentoMs: 400, dbMuitoLentoMs: 1500,
  loopLentoMs: 300, loopMuitoLentoMs: 1000,
  /** Quantas amostras SEGUIDAS ruins para alertar lentidão. */
  repeticoes: 3,
} as const;

/** Quanto esperar para repetir o MESMO alerta (um por hora no crítico, um a cada 6h na atenção). */
export const INTERVALO_DO_ALERTA_MS: Record<NivelDoAlerta, number> = { CRITICO: 60 * 60_000, ATENCAO: 6 * 60 * 60_000 };

const pct = (n: number) => `${Math.round(n)}%`;

/** As últimas `n` amostras (a atual incluída) passam todas no teste? */
function seguidas(historico: AmostraDeSaude[], atual: AmostraDeSaude, n: number, teste: (a: AmostraDeSaude) => boolean): boolean {
  const ultimas = [...historico.slice(-(n - 1)), atual];
  return ultimas.length >= n && ultimas.every(teste);
}

/** Avalia a amostra atual contra os limites. `historico` = amostras anteriores, da mais antiga para a mais nova. */
export function avaliarSaude(atual: AmostraDeSaude, historico: AmostraDeSaude[] = []): AlertaDeSaude[] {
  const out: AlertaDeSaude[] = [];
  const L = LIMITES;

  if (atual.dbMs === null) {
    out.push({ chave: 'BANCO_FORA', nivel: 'CRITICO', titulo: 'SGO: o banco de dados não respondeu', texto: 'O servidor não conseguiu consultar o banco. Se repetir, o sistema para de gravar — verifique o servidor agora.' });
  } else if (seguidas(historico, atual, L.repeticoes, (a) => a.dbMs !== null && a.dbMs >= L.dbMuitoLentoMs)) {
    out.push({ chave: 'BANCO_LENTO', nivel: 'CRITICO', titulo: 'SGO: banco de dados muito lento', texto: `As últimas ${L.repeticoes} medições passaram de ${L.dbMuitoLentoMs} ms (agora ${atual.dbMs} ms). As telas devem estar travando.` });
  } else if (seguidas(historico, atual, L.repeticoes, (a) => a.dbMs !== null && a.dbMs >= L.dbLentoMs)) {
    out.push({ chave: 'BANCO_LENTO', nivel: 'ATENCAO', titulo: 'SGO: banco de dados ficando lento', texto: `As últimas ${L.repeticoes} medições passaram de ${L.dbLentoMs} ms (agora ${atual.dbMs} ms). Ainda funciona, mas está acima do normal.` });
  }

  if (seguidas(historico, atual, L.repeticoes, (a) => a.loopMs >= L.loopMuitoLentoMs)) {
    out.push({ chave: 'SERVIDOR_LENTO', nivel: 'CRITICO', titulo: 'SGO: servidor sobrecarregado', texto: `O servidor está demorando mais de ${L.loopMuitoLentoMs} ms para atender (agora ${atual.loopMs} ms), ${L.repeticoes} medições seguidas.` });
  } else if (seguidas(historico, atual, L.repeticoes, (a) => a.loopMs >= L.loopLentoMs)) {
    out.push({ chave: 'SERVIDOR_LENTO', nivel: 'ATENCAO', titulo: 'SGO: servidor com carga alta', texto: `Atraso de ${atual.loopMs} ms para atender, ${L.repeticoes} medições seguidas acima de ${L.loopLentoMs} ms.` });
  }

  if (atual.discoPct !== null) {
    const livre = atual.discoLivreGb !== null ? ` Restam ${atual.discoLivreGb.toFixed(1).replace('.', ',')} GB.` : '';
    if (atual.discoPct >= L.discoCritico) out.push({ chave: 'DISCO', nivel: 'CRITICO', titulo: 'SGO: disco quase cheio', texto: `O disco do servidor está em ${pct(atual.discoPct)}.${livre} Com o disco cheio o banco para — libere espaço agora.` });
    else if (atual.discoPct >= L.discoAtencao) out.push({ chave: 'DISCO', nivel: 'ATENCAO', titulo: 'SGO: disco enchendo', texto: `O disco do servidor está em ${pct(atual.discoPct)}.${livre} Programe uma limpeza antes de chegar a ${L.discoCritico}%.` });
  }

  if (atual.memoriaPct !== null) {
    if (atual.memoriaPct >= L.memoriaCritico) out.push({ chave: 'MEMORIA', nivel: 'CRITICO', titulo: 'SGO: memória no limite', texto: `A memória do servidor está em ${pct(atual.memoriaPct)} (o SGO usa ${Math.round(atual.processoMb)} MB). O sistema pode travar ou reiniciar.` });
    else if (atual.memoriaPct >= L.memoriaAtencao) out.push({ chave: 'MEMORIA', nivel: 'ATENCAO', titulo: 'SGO: memória alta', texto: `A memória do servidor está em ${pct(atual.memoriaPct)} (o SGO usa ${Math.round(atual.processoMb)} MB).` });
  }

  if (atual.conexoesPct !== null) {
    if (atual.conexoesPct >= L.conexoesCritico) out.push({ chave: 'CONEXOES', nivel: 'CRITICO', titulo: 'SGO: conexões do banco no limite', texto: `${pct(atual.conexoesPct)} das conexões do banco estão em uso. Acima disso, novas telas deixam de abrir.` });
    else if (atual.conexoesPct >= L.conexoesAtencao) out.push({ chave: 'CONEXOES', nivel: 'ATENCAO', titulo: 'SGO: muitas conexões no banco', texto: `${pct(atual.conexoesPct)} das conexões do banco estão em uso — sinal de muitos acessos ao mesmo tempo.` });
  }

  return out;
}

/** Já passou tempo suficiente desde o último aviso desta chave/nível? Subir de ATENÇÃO para CRÍTICO avisa na hora. */
export function deveAvisar(alerta: AlertaDeSaude, ultimo: { nivel: NivelDoAlerta; em: number } | undefined, agora: number): boolean {
  if (!ultimo) return true;
  if (alerta.nivel === 'CRITICO' && ultimo.nivel === 'ATENCAO') return true;
  return agora - ultimo.em >= INTERVALO_DO_ALERTA_MS[alerta.nivel];
}

/** Semáforo geral para a tela: o pior nível entre os alertas. */
export function situacaoGeral(alertas: AlertaDeSaude[]): 'OK' | NivelDoAlerta {
  if (alertas.some((a) => a.nivel === 'CRITICO')) return 'CRITICO';
  return alertas.length ? 'ATENCAO' : 'OK';
}
