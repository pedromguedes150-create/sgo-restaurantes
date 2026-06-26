import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

/**
 * Leitura de atestado médico por IA (Claude visão) — extrai os campos da foto e
 * indica quais ficaram com baixa confiança (para a tela destacar p/ conferência).
 * Regra nº6: modelo vem do env (CLAUDE_MODEL). Degradação graciosa: sem
 * ANTHROPIC_API_KEY retorna { configured:false } e o lançamento segue 100% manual.
 *
 * Privacidade (LGPD): o CID é dado sensível de saúde — é lido para pré-preencher,
 * mas a exibição é restrita a ADMIN/CEO/RH na aplicação (ver telas/queries).
 */
export type CertType = 'FULL_DAY' | 'HOURS' | 'COMPANION';

export interface CertReadResult {
  configured: boolean;
  ok: boolean;
  fields?: {
    collaboratorName?: string | null;
    issueDate?: string | null; // yyyy-mm-dd
    startDate?: string | null; // yyyy-mm-dd
    endDate?: string | null; // yyyy-mm-dd
    days?: number | null;
    hours?: number | null;
    type?: CertType | null;
    doctorName?: string | null;
    doctorCrm?: string | null;
    cid?: string | null;
  };
  /** Nomes dos campos que a IA NÃO conseguiu ler com confiança (para destacar). */
  lowConfidence?: string[];
  error?: string;
}

type Block = Anthropic.Messages.ContentBlockParam;

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function readMedicalCertificate(input: {
  photoBase64: string;
  mediaType: string;
}): Promise<CertReadResult> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };
  const media = ALLOWED_MEDIA.includes(input.mediaType) ? input.mediaType : 'image/jpeg';

  const content: Block[] = [
    { type: 'text', text: 'FOTO DO ATESTADO MÉDICO (extrair os dados):' },
    { type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg', data: input.photoBase64 } },
    {
      type: 'text',
      text:
        'Você lê atestados médicos brasileiros. Extraia os campos abaixo da imagem. ' +
        'Datas SEMPRE no formato yyyy-mm-dd. Se um campo não estiver legível ou ausente, use null ' +
        'e inclua o nome dele em "lowConfidence". ' +
        'Para "type": FULL_DAY = afastamento de um ou mais DIAS; HOURS = atestado de horas/consulta (não afasta o dia todo); ' +
        'COMPANION = acompanhamento de familiar / declaração de comparecimento. ' +
        '"days" = número de dias de afastamento (inteiro). "hours" = horas, só quando type=HOURS. ' +
        '"cid" = código CID se houver (ex.: "J11", "M54.5"). ' +
        'Responda APENAS em JSON, sem texto fora do JSON, no formato exato: ' +
        '{"collaboratorName":string|null,"issueDate":string|null,"startDate":string|null,"endDate":string|null,' +
        '"days":number|null,"hours":number|null,"type":"FULL_DAY"|"HOURS"|"COMPANION"|null,' +
        '"doctorName":string|null,"doctorCrm":string|null,"cid":string|null,"lowConfidence":string[]}.',
    },
  ];

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extractJson(text);
    if (!parsed) return { configured: true, ok: false, error: 'Não foi possível interpretar a resposta da IA.' };

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : null));
    const date = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
    const type = (v: unknown): CertType | null => (['FULL_DAY', 'HOURS', 'COMPANION'].includes(v as string) ? (v as CertType) : null);
    const low = Array.isArray(parsed.lowConfidence) ? (parsed.lowConfidence as unknown[]).map(String) : [];

    return {
      configured: true,
      ok: true,
      fields: {
        collaboratorName: str(parsed.collaboratorName),
        issueDate: date(parsed.issueDate),
        startDate: date(parsed.startDate),
        endDate: date(parsed.endDate),
        days: num(parsed.days),
        hours: num(parsed.hours),
        type: type(parsed.type),
        doctorName: str(parsed.doctorName),
        doctorCrm: str(parsed.doctorCrm),
        cid: str(parsed.cid),
      },
      lowConfidence: low,
    };
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : 'Falha na leitura por IA' };
  }
}
