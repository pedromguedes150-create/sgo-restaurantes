import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { INSTRUCOES_DE_LEITURA, interpretarLeitura, type LeituraDoCurriculo } from '@/lib/curriculos/leitura';

/**
 * Leitura do CURRÍCULO por IA (foto ou PDF) — v1.216.0. Só devolve nome e
 * telefone do candidato para pré-preencher o encaminhamento; o gerente confere
 * e completa. Modelo pelo env (regra nº 6). Sem ANTHROPIC_API_KEY devolve
 * `configured:false` e o formulário segue à mão.
 */
export type ResultadoDaLeitura =
  | { configured: false; ok: false }
  | { configured: true; ok: false; error: string }
  | ({ configured: true; ok: true } & LeituraDoCurriculo);

type Block = Anthropic.Messages.ContentBlockParam;
const IMAGENS = ['image/jpeg', 'image/png'] as const;

function extrairJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function lerCurriculo(input: { base64: string; mediaType: string }): Promise<ResultadoDaLeitura> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };
  const ehPdf = input.mediaType === 'application/pdf';
  if (!ehPdf && !(IMAGENS as readonly string[]).includes(input.mediaType)) return { configured: true, ok: false, error: 'Formato não suportado pela leitura automática.' };
  const documento: Block = ehPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: input.mediaType as (typeof IMAGENS)[number], data: input.base64 } };
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: [documento, { type: 'text', text: INSTRUCOES_DE_LEITURA }] }],
    });
    const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extrairJson(text);
    if (!parsed) return { configured: true, ok: false, error: 'Não foi possível interpretar a leitura.' };
    return { configured: true, ok: true, ...interpretarLeitura(parsed) };
  } catch {
    /* A mensagem do provedor não vai para a tela: pode trazer detalhe técnico. */
    return { configured: true, ok: false, error: 'Falha na leitura automática.' };
  }
}
