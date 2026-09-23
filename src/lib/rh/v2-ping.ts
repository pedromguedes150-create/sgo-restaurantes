import { rhGetV2, rhV2Base, rhV2Configured, RhApiError } from '@/lib/rh/client';

/**
 * Ping de diagnóstico da API v2 do RH — SEGURO PARA PRODUÇÃO.
 *
 * Existe para responder UMA pergunta sem expor dado nenhum: "a v2 aceita a
 * nossa chave a partir deste servidor?". No dia em que a chave chegou, a v2
 * respondia 401 a partir da máquina de desenvolvimento e não havia como testar
 * do droplet (a hipótese de lista de IPs só se confirma de lá). Este ping roda
 * no servidor que o SGO estiver rodando — em produção, no droplet.
 *
 * O que ele devolve da resposta: o STATUS, a mensagem de erro e a FORMA
 * (tipo de topo, nomes de chaves, tamanho de lista, nomes de campos do
 * primeiro item). Nunca valores: a v1 despeja folha e CPF, e não há razão para
 * supor que a v2 seja mais discreta — daí `/api/rh/test` continuar exclusivo
 * de desenvolvimento e este ping poder ficar atrás do botão do Admin.
 */

export interface FormaDaResposta {
  tipo: 'lista' | 'objeto' | 'vazio' | 'outro';
  /** Chaves de topo (objeto) ou do primeiro item (lista de objetos). */
  chaves: string[];
  /** Tamanho da lista, quando for lista (de topo ou em `data`). */
  itens: number | null;
}

/** Descreve a forma de um JSON sem carregar nenhum valor. PURA. */
export function resumirForma(data: unknown): FormaDaResposta {
  if (data === null || data === undefined) return { tipo: 'vazio', chaves: [], itens: null };
  if (Array.isArray(data)) {
    const primeiro = data[0];
    return { tipo: 'lista', chaves: primeiro && typeof primeiro === 'object' ? Object.keys(primeiro) : [], itens: data.length };
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const chaves = Object.keys(obj);
    /* Envelope { data: [...] } (o padrão da v1): descreve a lista de dentro. */
    const lista = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.items) ? obj.items : null;
    if (lista) {
      const primeiro = lista[0];
      return {
        tipo: 'lista',
        chaves: primeiro && typeof primeiro === 'object' ? Object.keys(primeiro as object) : [],
        itens: lista.length,
      };
    }
    return { tipo: 'objeto', chaves, itens: null };
  }
  return { tipo: 'outro', chaves: [], itens: null };
}

export interface ResultadoDoPing {
  configurada: boolean;
  base: string;
  path: string;
  ok: boolean;
  status: number | null;
  erro: string | null;
  forma: FormaDaResposta | null;
  emMs: number;
}

/** Caminhos que o ping aceita — curtos, relativos e sem subir diretório. */
export function pathDePingValido(p: string): boolean {
  /* Sem `..` (subir diretório) e sem `//` (um caminho que começa com duas
     barras vira outra origem em qualquer resolvedor de URL). */
  return /^\/[A-Za-z0-9_\-/.]{0,120}(\?[A-Za-z0-9_\-=&%.]{0,200})?$/.test(p) && !p.includes('..') && !p.includes('//');
}

export async function pingRhV2(path = '/colaboradores'): Promise<ResultadoDoPing> {
  const base = rhV2Base();
  if (!rhV2Configured()) {
    return { configurada: false, base, path, ok: false, status: null, erro: 'RH_API_V2_KEY não configurada neste servidor', forma: null, emMs: 0 };
  }
  const inicio = Date.now();
  try {
    const data = await rhGetV2<unknown>(path, { fresh: true });
    return { configurada: true, base, path, ok: true, status: 200, erro: null, forma: resumirForma(data), emMs: Date.now() - inicio };
  } catch (e) {
    const status = e instanceof RhApiError ? e.status : null;
    return {
      configurada: true, base, path, ok: false, status,
      erro: e instanceof Error ? e.message : String(e),
      forma: null, emMs: Date.now() - inicio,
    };
  }
}
