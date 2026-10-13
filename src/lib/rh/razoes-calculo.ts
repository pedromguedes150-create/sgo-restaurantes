/**
 * Razões sociais do RH × unidades do SGO — regras PURAS (v1.166.0).
 *
 * Caso que originou (13/10/2026): a Nova União tem gente cadastrada no RH em
 * DUAS empresas — "COMERCIAL LINS & GUEDES LTDA (NOVA UNIÃO)" (32 pessoas, a
 * que o SGO lia) e "COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA" (3 pessoas admitidas
 * em agosto, que nunca entraram). Cada unidade passou a poder ler MAIS de uma
 * razão social — mas só com um critério OBRIGATÓRIO, pedido do Pedro:
 *
 *  - NOME: o nome informado existe IDÊNTICO na lista do RH (só espaços nas
 *    pontas são tolerados; acento, caixa ou pontuação diferente NÃO casam).
 *  - CNPJ: o CNPJ informado (14 dígitos) pertence a UMA razão social do RH.
 *    Se pertencer a mais de uma, é recusado e a tela pede o nome exato.
 *
 * Nunca há casamento aproximado: foi aproximação ("parecido") que ligou dado
 * à unidade errada em outras partes do sistema. O nome GRAVADO é sempre o do
 * RH, byte a byte — "CENTRO DE SERVIÇOS BEIJA FLOR LTDA " tem espaço no fim, e
 * sem ele a consulta ao RH volta vazia.
 */

export const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function formatarCnpj(d: string | null | undefined): string {
  const s = soDigitos(d);
  return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (d ?? '');
}

export interface RazaoDoRh { nome: string; pessoas: number; cnpjs: string[] }

/** Junta a lista de unidades do RH com os colaboradores (que trazem o CNPJ). */
export function catalogoDasRazoes(nomesDoRh: string[], colaboradores: { unidade?: string | null; unidade_cnpj?: string | null }[]): RazaoDoRh[] {
  const m = new Map<string, { pessoas: number; cnpjs: Set<string> }>();
  for (const n of nomesDoRh) if (n) m.set(n, m.get(n) ?? { pessoas: 0, cnpjs: new Set() });
  for (const c of colaboradores) {
    const n = c.unidade ?? '';
    if (!n) continue;
    const e = m.get(n) ?? { pessoas: 0, cnpjs: new Set<string>() };
    e.pessoas++;
    const d = soDigitos(c.unidade_cnpj);
    if (d.length === 14) e.cnpjs.add(d);
    m.set(n, e);
  }
  return [...m.entries()].map(([nome, e]) => ({ nome, pessoas: e.pessoas, cnpjs: [...e.cnpjs].sort() })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export type Criterio = 'NOME' | 'CNPJ';
export type Resolucao =
  | { ok: true; rhName: string; cnpj: string | null; criterio: Criterio }
  | { ok: false; reason: 'NOME_NAO_IDENTICO' | 'CNPJ_INVALIDO' | 'CNPJ_NAO_ENCONTRADO' | 'CNPJ_AMBIGUO' | 'VAZIO'; candidatos?: string[] };

/** Aplica o critério obrigatório. Devolve o nome EXATO do RH ou o motivo da recusa. */
export function resolverVinculo(criterio: Criterio, valor: string, catalogo: RazaoDoRh[]): Resolucao {
  const v = (valor ?? '').trim();
  if (!v) return { ok: false, reason: 'VAZIO' };
  if (criterio === 'NOME') {
    const r = catalogo.find((x) => x.nome === v || x.nome.trim() === v);
    if (!r) return { ok: false, reason: 'NOME_NAO_IDENTICO' };
    return { ok: true, rhName: r.nome, cnpj: r.cnpjs.length === 1 ? r.cnpjs[0] : null, criterio };
  }
  const d = soDigitos(v);
  if (d.length !== 14) return { ok: false, reason: 'CNPJ_INVALIDO' };
  const achadas = catalogo.filter((x) => x.cnpjs.includes(d));
  if (achadas.length === 0) return { ok: false, reason: 'CNPJ_NAO_ENCONTRADO' };
  if (achadas.length > 1) return { ok: false, reason: 'CNPJ_AMBIGUO', candidatos: achadas.map((x) => x.nome) };
  return { ok: true, rhName: achadas[0].nome, cnpj: d, criterio };
}

export const MENSAGEM_DA_RECUSA: Record<Exclude<Resolucao, { ok: true }>['reason'], string> = {
  VAZIO: 'Informe o CNPJ ou o nome exato da razão social.',
  NOME_NAO_IDENTICO: 'Esse nome não existe IDÊNTICO na lista do RH (acento, espaço e pontuação contam). Confira a grafia no RH ou use o CNPJ.',
  CNPJ_INVALIDO: 'O CNPJ precisa ter 14 dígitos.',
  CNPJ_NAO_ENCONTRADO: 'Nenhuma razão social do RH tem esse CNPJ.',
  CNPJ_AMBIGUO: 'Esse CNPJ aparece em mais de uma razão social do RH — use o nome exato.',
};

/**
 * CONFERÊNCIA POR UNIDADE DO SGO (pedido do Pedro, 13/10/2026: "não quero que
 * vincule as 41 razões — o grupo é amplo e tem outros segmentos; mantenha a
 * lógica com CNPJ e nomes já existentes no sistema"). A conferência parte das
 * UNIDADES do SGO, nunca da lista inteira do RH (postos, transportadora e
 * consultoria nem aparecem), e só usa o que já está cadastrado em cada uma:
 *  - o "Nome no RH" (principal e adicionais) existe idêntico no RH?
 *  - o CNPJ cadastrado na unidade aponta para alguma razão social do RH que a
 *    unidade ainda NÃO lê? Essa é a única sugestão que a tela faz.
 */
export interface UnidadeParaConferir { id: string; name: string; rhUnitName: string | null; cnpj: string | null; adicionais: string[] }

export interface NomeConferido { nome: string; existe: boolean; pessoas: number }

export interface LinhaDaUnidade {
  unitId: string;
  unitName: string;
  cnpj: string | null;
  principal: NomeConferido | null;
  adicionais: NomeConferido[];
  /** Pessoas que a sincronização desta unidade traz hoje (soma das razões que existem). */
  pessoasLidas: number;
  /** Razões do RH com o MESMO CNPJ cadastrado na unidade, que nenhuma unidade lê ainda. */
  sugeridasPeloCnpj: { nome: string; pessoas: number }[];
  situacao: 'OK' | 'SEM_NOME' | 'NOME_NAO_EXISTE' | 'CNPJ_APONTA_OUTRA';
}

export interface Conferencia {
  unidades: LinhaDaUnidade[];
  totais: { unidades: number; ok: number; comAlerta: number };
}

const PESO: Record<LinhaDaUnidade['situacao'], number> = { NOME_NAO_EXISTE: 0, CNPJ_APONTA_OUTRA: 1, SEM_NOME: 2, OK: 3 };

export function conferir(catalogo: RazaoDoRh[], unidades: UnidadeParaConferir[]): Conferencia {
  const porNome = new Map(catalogo.map((r) => [r.nome, r]));
  const lidasPorAlguem = new Set(unidades.flatMap((u) => [u.rhUnitName, ...u.adicionais].filter((n): n is string => Boolean(n))));
  const conferirNome = (nome: string): NomeConferido => {
    const r = porNome.get(nome);
    return { nome, existe: Boolean(r), pessoas: r?.pessoas ?? 0 };
  };
  const linhas: LinhaDaUnidade[] = unidades.map((u) => {
    const principal = u.rhUnitName ? conferirNome(u.rhUnitName) : null;
    const adicionais = u.adicionais.map(conferirNome);
    const cnpj = soDigitos(u.cnpj);
    const sugeridasPeloCnpj = cnpj.length === 14
      ? catalogo.filter((r) => r.cnpjs.includes(cnpj) && !lidasPorAlguem.has(r.nome)).map((r) => ({ nome: r.nome, pessoas: r.pessoas }))
      : [];
    const todos = [principal, ...adicionais].filter((n): n is NomeConferido => Boolean(n));
    const situacao: LinhaDaUnidade['situacao'] = !principal ? 'SEM_NOME'
      : todos.some((n) => !n.existe) ? 'NOME_NAO_EXISTE'
      : sugeridasPeloCnpj.length > 0 ? 'CNPJ_APONTA_OUTRA'
      : 'OK';
    return { unitId: u.id, unitName: u.name, cnpj: cnpj || null, principal, adicionais, pessoasLidas: todos.reduce((s, n) => s + n.pessoas, 0), sugeridasPeloCnpj, situacao };
  });
  linhas.sort((a, b) => PESO[a.situacao] - PESO[b.situacao] || a.unitName.localeCompare(b.unitName, 'pt-BR'));
  const ok = linhas.filter((l) => l.situacao === 'OK').length;
  return { unidades: linhas, totais: { unidades: linhas.length, ok, comAlerta: linhas.length - ok } };
}
