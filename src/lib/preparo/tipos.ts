/**
 * PADRONIZAÇÃO DE PREPARO — o núcleo PURO.
 *
 * Tudo que é regra de dado da ficha mora aqui, sem banco e sem React: o que é
 * uma ficha válida, como um rascunho da IA vira dado (sem inventar nada), como
 * duas versões se comparam (o histórico campo a campo) e como a busca acha um
 * produto pelo ingrediente. A tela, a rota e os testes leem o MESMO arquivo.
 */

import { normalizar } from '@/lib/products/busca';

export interface ItemDaFicha {
  ingredientName: string;
  /** Nulo = a ficha não informa (não é zero). */
  quantity: number | null;
  unit: string | null;
  weightGrams: number | null;
  notes: string | null;
}

/**
 * As duas ABAS (v1.172.0). LANCHONETE = ficha de UM produto (código, ingredientes,
 * pesos). RESTAURANTE = guia de um GRUPO de preparos: o arquivo enviado é o
 * conteúdo; função do forno, temperatura, tempo e a lista de preparações
 * (gravada em `items`, só o nome) servem à busca e aos cartões; sem código.
 */
export type Segmento = 'LANCHONETE' | 'RESTAURANTE';
export const SEGMENTOS: { value: Segmento; label: string; aba: string }[] = [
  { value: 'LANCHONETE', label: 'Lanchonete', aba: 'lanchonete' },
  { value: 'RESTAURANTE', label: 'Restaurante', aba: 'restaurante' },
];
export function segmentoDaAba(aba: string | null | undefined): Segmento {
  return aba === 'restaurante' ? 'RESTAURANTE' : 'LANCHONETE';
}
export function abaDoSegmento(s: Segmento): string {
  return s === 'RESTAURANTE' ? 'restaurante' : 'lanchonete';
}
export function normalizarSegmento(v: unknown): Segmento {
  return v === 'RESTAURANTE' ? 'RESTAURANTE' : 'LANCHONETE';
}

export interface DadosDaFicha {
  name: string;
  code: string;
  category: string;
  preparationMethod: string | null;
  generalNotes: string | null;
  items: ItemDaFicha[];
  /** Ausente nos dados antigos = LANCHONETE. */
  segment?: Segmento;
  /** Só RESTAURANTE: "Ar Seco", "200°C", "15 Min" — texto como está no guia. */
  ovenMode?: string | null;
  temperature?: string | null;
  cookTime?: string | null;
}

/** O arquivo-fonte do guia é PDF? (decide iframe × imagem e o ícone do cartão) */
export function ehPdf(path: string | null | undefined): boolean {
  return !!path && /\.pdf$/i.test(path);
}

/**
 * A imagem do cartão/da capa: a foto própria; sem ela, o arquivo-fonte quando
 * é imagem (o guia do restaurante costuma ser uma foto). PDF não é capa.
 */
export function capaDaFicha(f: { imagePath: string | null; sourceFilePath?: string | null }): string | null {
  if (f.imagePath) return f.imagePath;
  if (f.sourceFilePath && !ehPdf(f.sourceFilePath)) return f.sourceFilePath;
  return null;
}

/** "Ar Seco · 200°C · 15 min" — a leitura rápida do cartão e do topo do guia. */
export function textoRapido(d: Pick<DadosDaFicha, 'ovenMode' | 'temperature' | 'cookTime'>): string {
  return [d.ovenMode, d.temperature, d.cookTime].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ');
}

export const LIMITES = {
  nome: 120, codigo: 40, categoria: 60, unidade: 30, ingrediente: 120, observacao: 300, texto: 5000, itens: 80, rapido: 40,
} as const;

export const CATEGORIA_PADRAO = 'Geral';

export type MotivoInvalido =
  | 'SEM_NOME' | 'SEM_CODIGO' | 'INGREDIENTE_SEM_NOME' | 'QUANTIDADE' | 'PESO' | 'MUITO_LONGO' | 'ITENS_DEMAIS' | 'FORMATO';

export const MENSAGEM_INVALIDO: Record<MotivoInvalido, string> = {
  SEM_NOME: 'Informe o nome do produto.',
  SEM_CODIGO: 'Informe o código do produto.',
  INGREDIENTE_SEM_NOME: 'Todo ingrediente precisa de nome.',
  QUANTIDADE: 'Quantidade inválida: use número (ex.: 1, 2, 0,5).',
  PESO: 'Peso inválido: use número em gramas (ex.: 65).',
  MUITO_LONGO: 'Um dos campos passou do tamanho permitido.',
  ITENS_DEMAIS: `No máximo ${LIMITES.itens} ingredientes por ficha.`,
  FORMATO: 'Dados da ficha em formato inválido.',
};

export type ResultadoNormalizacao =
  | { ok: true; dados: DadosDaFicha }
  | { ok: false; motivo: MotivoInvalido; campo?: string };

/* ───────────────────────── leitura tolerante de valores ───────────────────────── */

function texto(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && isFinite(v) ? String(v) : '';
}

function textoLongo(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '';
}

/** "2", "2,5", 2 → número; vazio/nulo → null; lixo → NaN (quem chama decide). */
export function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim().replace(/\s/g, '');
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return isFinite(n) ? n : NaN;
}

export function normalizarCategoria(v: unknown): string {
  const t = texto(v);
  return t || CATEGORIA_PADRAO;
}

/** Só o essencial do código: espaços fora, zeros à esquerda ficam (são do Teknisa). */
export function normalizarCodigo(v: unknown): string {
  return texto(v).replace(/\s+/g, '');
}

/**
 * Transforma o que veio do navegador (ou da IA já revisada) numa ficha válida,
 * ou diz exatamente o que está errado. Nada aqui inventa valor: campo vazio
 * fica nulo; número ilegível é recusado, não arredondado.
 */
export function normalizarDados(input: unknown): ResultadoNormalizacao {
  if (!input || typeof input !== 'object') return { ok: false, motivo: 'FORMATO' };
  const b = input as Record<string, unknown>;

  const name = texto(b.name);
  if (!name) return { ok: false, motivo: 'SEM_NOME' };
  const segment = normalizarSegmento(b.segment);
  const code = normalizarCodigo(b.code);
  /* O guia do Restaurante não tem código (decisão do Pedro, 19/10/2026). */
  if (!code && segment === 'LANCHONETE') return { ok: false, motivo: 'SEM_CODIGO' };
  const category = normalizarCategoria(b.category);
  const ovenMode = segment === 'RESTAURANTE' ? texto(b.ovenMode) || null : null;
  const temperature = segment === 'RESTAURANTE' ? texto(b.temperature) || null : null;
  const cookTime = segment === 'RESTAURANTE' ? texto(b.cookTime) || null : null;
  if ((ovenMode?.length ?? 0) > LIMITES.rapido || (temperature?.length ?? 0) > LIMITES.rapido || (cookTime?.length ?? 0) > LIMITES.rapido) return { ok: false, motivo: 'MUITO_LONGO' };
  const preparationMethod = textoLongo(b.preparationMethod) || null;
  const generalNotes = textoLongo(b.generalNotes) || null;

  if (name.length > LIMITES.nome || code.length > LIMITES.codigo || category.length > LIMITES.categoria) return { ok: false, motivo: 'MUITO_LONGO' };
  if ((preparationMethod?.length ?? 0) > LIMITES.texto || (generalNotes?.length ?? 0) > LIMITES.texto) return { ok: false, motivo: 'MUITO_LONGO' };

  const brutos = Array.isArray(b.items) ? b.items : [];
  if (brutos.length > LIMITES.itens) return { ok: false, motivo: 'ITENS_DEMAIS' };

  const items: ItemDaFicha[] = [];
  for (let i = 0; i < brutos.length; i++) {
    const it = (brutos[i] ?? {}) as Record<string, unknown>;
    const ingredientName = texto(it.ingredientName);
    const quantity = numero(it.quantity);
    const unit = texto(it.unit) || null;
    const weightGrams = numero(it.weightGrams);
    const notes = texto(it.notes) || null;
    /* Linha totalmente vazia (o editor deixa uma sobrando) é ignorada, não recusada. */
    if (!ingredientName && quantity === null && !unit && weightGrams === null && !notes) continue;
    if (!ingredientName) return { ok: false, motivo: 'INGREDIENTE_SEM_NOME', campo: `items.${i}.ingredientName` };
    if (quantity !== null && (Number.isNaN(quantity) || quantity < 0)) return { ok: false, motivo: 'QUANTIDADE', campo: `items.${i}.quantity` };
    if (weightGrams !== null && (Number.isNaN(weightGrams) || weightGrams < 0)) return { ok: false, motivo: 'PESO', campo: `items.${i}.weightGrams` };
    if (ingredientName.length > LIMITES.ingrediente || (unit?.length ?? 0) > LIMITES.unidade || (notes?.length ?? 0) > LIMITES.observacao) return { ok: false, motivo: 'MUITO_LONGO', campo: `items.${i}` };
    items.push({ ingredientName, quantity, unit, weightGrams, notes });
  }

  return { ok: true, dados: { name, code, category, preparationMethod, generalNotes, items, segment, ovenMode, temperature, cookTime } };
}

/* ───────────────────────── rascunho vindo da IA ───────────────────────── */

export interface CaixaDaFoto { x: number; y: number; w: number; h: number }

/** O que a IA sugere. Campos que ela não leu com segurança ficam nulos E listados. */
export interface RascunhoDaFicha {
  dados: DadosDaFicha;
  /** Caminhos de campo: "code", "items.1.weightGrams"… — a tela marca "Revisar informação". */
  lowConfidence: string[];
  /** Onde está a foto do produto no documento, em % da largura/altura; nulo se não há. */
  photoBox: CaixaDaFoto | null;
}

/**
 * Lê a resposta da IA sem confiar nela: aceita o que tem forma, descarta o
 * resto, e NUNCA converte "não sei" em valor. Um número ilegível vira null +
 * lowConfidence, não zero.
 */
export function rascunhoDaResposta(parsed: unknown, segment: Segmento = 'LANCHONETE'): RascunhoDaFicha {
  const b = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const low = new Set<string>(Array.isArray(b.lowConfidence) ? (b.lowConfidence as unknown[]).map(String) : []);

  const brutos = Array.isArray(b.items) ? (b.items as unknown[]).slice(0, LIMITES.itens) : [];
  const items: ItemDaFicha[] = [];
  brutos.forEach((raw, i) => {
    const it = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const ingredientName = texto(it.ingredientName).slice(0, LIMITES.ingrediente);
    if (!ingredientName) return;
    const idx = items.length;
    const q = numero(it.quantity);
    const w = numero(it.weightGrams);
    if (Number.isNaN(q)) low.add(`items.${idx}.quantity`);
    if (Number.isNaN(w)) low.add(`items.${idx}.weightGrams`);
    /* A IA numera pelos itens que devolveu; se pulamos um sem nome, realinha. */
    if (idx !== i) {
      for (const campo of ['quantity', 'weightGrams', 'unit', 'ingredientName', 'notes']) {
        if (low.delete(`items.${i}.${campo}`)) low.add(`items.${idx}.${campo}`);
      }
    }
    items.push({
      ingredientName,
      quantity: Number.isNaN(q) ? null : q,
      unit: texto(it.unit).slice(0, LIMITES.unidade) || null,
      weightGrams: Number.isNaN(w) ? null : w,
      notes: texto(it.notes).slice(0, LIMITES.observacao) || null,
    });
  });

  const name = texto(b.name).slice(0, LIMITES.nome);
  const code = segment === 'RESTAURANTE' ? '' : normalizarCodigo(b.code).slice(0, LIMITES.codigo);
  if (!name) low.add('name');
  if (!code && segment === 'LANCHONETE') low.add('code');
  const rapido = (k: 'ovenMode' | 'temperature' | 'cookTime') => {
    if (segment !== 'RESTAURANTE') return null;
    const v = texto(b[k]).slice(0, LIMITES.rapido);
    if (!v) low.add(k);
    return v || null;
  };
  const ovenMode = rapido('ovenMode');
  const temperature = rapido('temperature');
  const cookTime = rapido('cookTime');

  let photoBox: CaixaDaFoto | null = null;
  const pb = b.photoBox as Record<string, unknown> | null | undefined;
  if (pb && typeof pb === 'object') {
    const n = (k: string) => { const v = numero(pb[k]); return v === null || Number.isNaN(v) ? null : Math.max(0, Math.min(100, v)); };
    const x = n('x'), y = n('y'), w = n('w'), h = n('h');
    if (x !== null && y !== null && w !== null && h !== null && w >= 5 && h >= 5) photoBox = { x, y, w, h };
  }

  return {
    dados: {
      name, code,
      category: texto(b.category).slice(0, LIMITES.categoria) || CATEGORIA_PADRAO,
      preparationMethod: textoLongo(b.preparationMethod).slice(0, LIMITES.texto) || null,
      generalNotes: textoLongo(b.generalNotes).slice(0, LIMITES.texto) || null,
      items,
      segment, ovenMode, temperature, cookTime,
    },
    lowConfidence: [...low],
    photoBox: segment === 'RESTAURANTE' ? null : photoBox,
  };
}

/* ───────────────────────── apresentação ───────────────────────── */

export function textoQuantidade(item: Pick<ItemDaFicha, 'quantity' | 'unit'>): string {
  const q = item.quantity === null ? '' : String(item.quantity).replace('.', ',');
  return [q, item.unit ?? ''].filter(Boolean).join(' ');
}

export function textoPeso(g: number | null): string {
  return g === null ? '' : `${String(g).replace('.', ',')} g`;
}

function resumoDoItem(it: ItemDaFicha): string {
  return [it.ingredientName, textoQuantidade(it), textoPeso(it.weightGrams), it.notes ?? ''].filter(Boolean).join(' · ');
}

/* ───────────────────────── histórico campo a campo ───────────────────────── */

export interface Mudanca { field: string; oldValue: string | null; newValue: string | null }

export const CAMPO_FOTO = 'Foto';
export const CAMPO_SITUACAO = 'Situação';
export const CAMPO_CRIACAO = 'Ficha criada';

/**
 * O que mudou entre duas versões, no vocabulário de quem lê o histórico:
 * "Linguiça · Peso: 120 g → 110 g", "Ingrediente removido: Queijo Minas".
 * Ingrediente é casado pelo nome (sem acento/caixa); homônimos casam na ordem.
 */
export function diferencas(antes: DadosDaFicha, depois: DadosDaFicha): Mudanca[] {
  const out: Mudanca[] = [];
  const campo = (field: string, a: string | null, d: string | null) => { if ((a ?? '') !== (d ?? '')) out.push({ field, oldValue: a || null, newValue: d || null }); };
  campo('Nome', antes.name, depois.name);
  campo('Código', antes.code, depois.code);
  campo('Categoria', antes.category, depois.category);
  campo('Modo de preparo', antes.preparationMethod, depois.preparationMethod);
  campo('Observações', antes.generalNotes, depois.generalNotes);
  campo('Função', antes.ovenMode ?? null, depois.ovenMode ?? null);
  campo('Temperatura', antes.temperature ?? null, depois.temperature ?? null);
  campo('Tempo', antes.cookTime ?? null, depois.cookTime ?? null);

  const sobrando = [...antes.items];
  for (const novo of depois.items) {
    const chave = normalizar(novo.ingredientName);
    const idx = sobrando.findIndex((a) => normalizar(a.ingredientName) === chave);
    if (idx === -1) { out.push({ field: 'Ingrediente adicionado', oldValue: null, newValue: resumoDoItem(novo) }); continue; }
    const [velho] = sobrando.splice(idx, 1);
    if (velho.ingredientName !== novo.ingredientName) campo(`${velho.ingredientName} · Nome`, velho.ingredientName, novo.ingredientName);
    campo(`${novo.ingredientName} · Quantidade`, textoQuantidade(velho), textoQuantidade(novo));
    campo(`${novo.ingredientName} · Peso`, textoPeso(velho.weightGrams), textoPeso(novo.weightGrams));
    campo(`${novo.ingredientName} · Observação`, velho.notes, novo.notes);
  }
  for (const removido of sobrando) out.push({ field: 'Ingrediente removido', oldValue: resumoDoItem(removido), newValue: null });

  /* Só a ORDEM mudou (mesmos nomes, posições diferentes): uma linha, não vinte. */
  const seqA = antes.items.map((i) => i.ingredientName);
  const seqD = depois.items.map((i) => i.ingredientName);
  const mesmoConjunto = seqA.length === seqD.length && [...seqA].sort().join('|') === [...seqD].sort().join('|');
  if (mesmoConjunto && seqA.join('|') !== seqD.join('|')) out.push({ field: 'Ordem dos ingredientes', oldValue: seqA.join(', '), newValue: seqD.join(', ') });

  return out;
}

/* ───────────────────────── busca ───────────────────────── */

export interface FichaBuscavel {
  name: string;
  code: string;
  category: string;
  ingredientes: string[];
}

/**
 * "linguiça" acha "Pão c/ Linguiça Completo" pelo INGREDIENTE; "910000" acha
 * pelo código; tudo sem acento e sem caixa. Ordem da lista é preservada.
 */
export function buscarFichas<T extends FichaBuscavel>(lista: T[], termo: string): T[] {
  const q = normalizar(termo);
  if (!q) return lista;
  const palavras = q.split(' ').filter(Boolean);
  return lista.filter((f) => {
    const alvo = [f.name, f.code, f.category, ...f.ingredientes].map(normalizar).join(' | ');
    return palavras.every((p) => alvo.includes(p));
  });
}

export function campoParaRevisar(lowConfidence: string[], campo: string): boolean {
  return lowConfidence.includes(campo);
}
