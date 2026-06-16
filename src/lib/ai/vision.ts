import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

/**
 * Análise de foto de checklist por IA (Claude visão) — modo CONSULTIVO.
 * Compara a foto do gerente com o padrão esperado (texto) e, se houver, uma
 * imagem de referência. Regra nº6: o modelo vem do env (CLAUDE_MODEL).
 * Degradação graciosa: sem ANTHROPIC_API_KEY, retorna { configured:false }.
 */
export type Verdict = 'COMPATIVEL' | 'DIVERGENTE' | 'INCERTO';
export interface VisionResult {
  configured: boolean;
  ok: boolean;
  verdict?: Verdict;
  observations?: string;
  error?: string;
}

type Block = Anthropic.Messages.ContentBlockParam;

function extractJson(text: string): { verdict?: Verdict; observations?: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function analyzeChecklistPhoto(input: {
  photoBase64: string;
  mediaType: string;
  standardDescription: string;
  referenceBase64?: string;
  referenceMediaType?: string;
}): Promise<VisionResult> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const media = allowed.includes(input.mediaType) ? input.mediaType : 'image/jpeg';

  const content: Block[] = [];
  if (input.referenceBase64) {
    content.push({ type: 'text', text: 'IMAGEM DE REFERÊNCIA (padrão desejado):' });
    content.push({ type: 'image', source: { type: 'base64', media_type: (input.referenceMediaType as 'image/jpeg') ?? 'image/jpeg', data: input.referenceBase64 } });
  }
  content.push({ type: 'text', text: 'FOTO ENVIADA PELO GERENTE (a avaliar):' });
  content.push({ type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg', data: input.photoBase64 } });
  content.push({
    type: 'text',
    text:
      `Padrão esperado: ${input.standardDescription}\n\n` +
      `Você é um auditor de padrões operacionais de restaurante (churrascaria). ` +
      `Compare a FOTO ENVIADA com o padrão esperado${input.referenceBase64 ? ' e com a imagem de referência' : ''}. ` +
      `Responda APENAS em JSON, em português, no formato: ` +
      `{"verdict":"COMPATIVEL"|"DIVERGENTE"|"INCERTO","observations":"o que está de acordo e o que precisa corrigir, 1 a 3 frases"}.`,
  });

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extractJson(text);
    if (!parsed) return { configured: true, ok: true, verdict: 'INCERTO', observations: text.slice(0, 400) };
    const verdict = (['COMPATIVEL', 'DIVERGENTE', 'INCERTO'].includes(parsed.verdict ?? '') ? parsed.verdict : 'INCERTO') as Verdict;
    return { configured: true, ok: true, verdict, observations: parsed.observations ?? '' };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : 'Falha na análise por IA' };
  }
}
