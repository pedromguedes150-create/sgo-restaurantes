import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

/**
 * Confere uma foto (ex.: vitrine de bebidas) contra o CATÁLOGO de produtos-padrão
 * da rede e aponta os produtos que estão FORA do padrão. Regra nº6: modelo via
 * env. Inerte sem ANTHROPIC_API_KEY.
 */
export interface ProductStandardRef { name: string; description?: string | null; photoBase64?: string; mediaType?: string }
export interface ProductStandardResult {
  configured: boolean; ok: boolean;
  verdict?: 'PADRAO' | 'FORA_DO_PADRAO' | 'INCERTO';
  offStandard?: string[]; // produtos identificados fora do padrão
  observations?: string;
  error?: string;
}

type Block = Anthropic.Messages.ContentBlockParam;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
function media(m?: string) { return m && ALLOWED.includes(m) ? m : 'image/jpeg'; }
function extractJson(t: string): Record<string, unknown> | null { const m = t.match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }

export async function analyzeProductStandard(input: { photoBase64: string; mediaType: string; standards: ProductStandardRef[] }): Promise<ProductStandardResult> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };
  const standards = input.standards.slice(0, 6); // limita p/ custo/token

  const content: Block[] = [{ type: 'text', text: 'PRODUTOS-PADRÃO DA REDE (o que PODE estar na vitrine):' }];
  for (const s of standards) {
    content.push({ type: 'text', text: `• ${s.name}${s.description ? ` — ${s.description}` : ''}` });
    if (s.photoBase64) content.push({ type: 'image', source: { type: 'base64', media_type: media(s.mediaType) as 'image/jpeg', data: s.photoBase64 } });
  }
  content.push({ type: 'text', text: 'FOTO ENVIADA PELO GERENTE (a conferir):' });
  content.push({ type: 'image', source: { type: 'base64', media_type: media(input.mediaType) as 'image/jpeg', data: input.photoBase64 } });
  content.push({
    type: 'text',
    text:
      'Você audita o padrão de produtos de uma rede de churrascarias. Compare a FOTO ENVIADA com os PRODUTOS-PADRÃO acima. ' +
      'Liste os produtos visíveis na foto que NÃO fazem parte do padrão da rede (marcas/itens fora do padrão). ' +
      'Responda APENAS em JSON: {"verdict":"PADRAO"|"FORA_DO_PADRAO"|"INCERTO","offStandard":string[],"observations":"1 a 3 frases"}.',
  });

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({ model: env.CLAUDE_MODEL, max_tokens: 700, messages: [{ role: 'user', content }] });
    const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extractJson(text);
    if (!parsed) return { configured: true, ok: true, verdict: 'INCERTO', observations: text.slice(0, 300) };
    const off = Array.isArray(parsed.offStandard) ? (parsed.offStandard as unknown[]).map(String).filter(Boolean) : [];
    const verdict = (['PADRAO', 'FORA_DO_PADRAO', 'INCERTO'].includes(parsed.verdict as string) ? parsed.verdict : (off.length ? 'FORA_DO_PADRAO' : 'PADRAO')) as ProductStandardResult['verdict'];
    return { configured: true, ok: true, verdict, offStandard: off, observations: typeof parsed.observations === 'string' ? parsed.observations : '' };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : 'Falha na IA' };
  }
}
