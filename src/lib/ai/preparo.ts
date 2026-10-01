import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { rascunhoDaResposta, type RascunhoDaFicha } from '@/lib/preparo/tipos';

/**
 * Leitura de uma FICHA DE PADRONIZAÇÃO DE PREPARO por IA (Claude, visão e PDF).
 *
 * A IA EXTRAI E SUGERE; quem decide é o Administrador na pré-visualização.
 * Por isso a resposta nunca é gravada aqui — vira um rascunho com os campos
 * de baixa confiança listados, e a tela os marca "Revisar informação".
 *
 * Mesmo desenho de `atestado.ts`: modelo pelo env (regra nº 6), inerte sem
 * chave, JSON estrito. Diferença: aceita PDF via bloco `document` (o SDK
 * suporta; é o primeiro fluxo do SGO a mandar PDF para a IA).
 */
export interface LeituraDaFicha {
  configured: boolean;
  ok: boolean;
  rascunho?: RascunhoDaFicha;
  error?: string;
}

type Block = Anthropic.Messages.ContentBlockParam;

const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImagemAceita = (typeof IMAGENS)[number];
export const MIDIAS_ACEITAS: readonly string[] = [...IMAGENS, 'application/pdf'];

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const INSTRUCOES =
  'Você lê FICHAS DE PADRONIZAÇÃO DE PREPARO de produtos de uma rede de restaurantes brasileira (lanches, salgados, pratos). ' +
  'Extraia do documento, interpretando o CONTEÚDO e não a posição (o layout varia entre fichas): ' +
  '"name" = nome do produto; "code" = código do produto (sequência numérica, ex.: 910000000501); "category" = categoria/grupo do produto quando escrita (ex.: "Pão Francês", "Lanches"); ' +
  '"items" = a lista de ingredientes/componentes na ordem do documento, cada um com "ingredientName", "quantity" (número; "1", "2", "0,5"), "unit" (texto como vem: "Unid", "fatias", "folha", "g", "ml"), ' +
  '"weightGrams" (peso em GRAMAS, número; se a ficha não traz peso para aquele item, use null) e "notes" (observação do item, se houver); ' +
  '"preparationMethod" = o modo de preparo/montagem em texto corrido, se existir; "generalNotes" = observações gerais, se existirem. ' +
  'REGRA ABSOLUTA: NÃO INVENTE. Se um valor não estiver claramente legível ou não existir no documento, use null E inclua o caminho do campo em "lowConfidence" ' +
  '(ex.: "code", "items.1.weightGrams", "items.3.quantity"). Peso ausente na ficha é null SEM entrar em lowConfidence; peso ilegível é null COM lowConfidence. ' +
  '"photoBox": se há uma FOTOGRAFIA do produto pronto no documento, informe a caixa dela em porcentagem da largura/altura da página: {"x":número,"y":número,"w":número,"h":número} (canto superior esquerdo + tamanho); senão null. ' +
  'Responda APENAS em JSON, sem texto fora do JSON, no formato exato: ' +
  '{"name":string|null,"code":string|null,"category":string|null,"items":[{"ingredientName":string,"quantity":number|null,"unit":string|null,"weightGrams":number|null,"notes":string|null}],' +
  '"preparationMethod":string|null,"generalNotes":string|null,"photoBox":{"x":number,"y":number,"w":number,"h":number}|null,"lowConfidence":string[]}';

export async function lerFichaDePreparo(input: { base64: string; mediaType: string }): Promise<LeituraDaFicha> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };
  if (!MIDIAS_ACEITAS.includes(input.mediaType)) {
    return { configured: true, ok: false, error: 'Formato não suportado pela leitura automática (use foto JPG/PNG/WEBP ou PDF).' };
  }

  const documento: Block = input.mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: input.mediaType as ImagemAceita, data: input.base64 } };

  const content: Block[] = [
    { type: 'text', text: 'FICHA DE PADRONIZAÇÃO DE PREPARO (extrair os dados):' },
    documento,
    { type: 'text', text: INSTRUCOES },
  ];

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extractJson(text);
    if (!parsed) return { configured: true, ok: false, error: 'Não foi possível interpretar a resposta da IA.' };
    return { configured: true, ok: true, rascunho: rascunhoDaResposta(parsed) };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : 'Falha na leitura por IA' };
  }
}
