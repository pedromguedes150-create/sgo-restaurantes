import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { conciliarPeriodo } from '@/lib/certificates/periodo';
import { NOMENCLATURAS, nomenclaturaPorNome, type GrupoDoDocumento, type Nomenclatura } from '@/lib/certificates/catalogo';
import { duracaoDaRegra } from '@/lib/certificates/regras-legais';
import { nomenclaturasAtivas, carregarConfigDasNomenclaturas, diasDaRegraCom } from '@/lib/certificates/config-nomenclaturas';

/**
 * Leitura de DOCUMENTO DE RH por IA (Claude visão + PDF) — v1.196.0, Central de
 * Atestados e Afins. Antes lia só "atestado médico" em foto; agora lê foto OU
 * PDF e, além dos campos, identifica a NOMENCLATURA do catálogo
 * (`src/lib/certificates/catalogo.ts`) e o grupo dela.
 *
 * O que a IA NÃO faz (spec do Pedro, 09/11/2026): não inventa campo, não
 * presume CID, não cria nome de profissional, não transforma declaração de
 * comparecimento em afastamento, não aprova nem rejeita. Sem segurança na
 * nomenclatura devolve null → o lançamento nasce "Classificação pendente de
 * análise do RH". Cada campo vem com CONFIANÇA (alta/media/baixa) e o TRECHO
 * do documento usado como evidência — guardados em `aiExtracted` para o RH.
 *
 * Regra nº6: modelo vem do env (CLAUDE_MODEL). Sem ANTHROPIC_API_KEY devolve
 * { configured:false } e o lançamento segue com os campos à mão.
 */
export type CertType = 'FULL_DAY' | 'HOURS' | 'COMPANION';
export type Confianca = 'alta' | 'media' | 'baixa';

export interface CamposLidos {
  collaboratorName?: string | null;
  issueDate?: string | null; // yyyy-mm-dd
  startDate?: string | null;
  endDate?: string | null; // ÚLTIMO dia afastado (nunca o retorno)
  returnDate?: string | null;
  days?: number | null;
  hours?: number | null;
  /** Janela do atendimento, quando a declaração traz horário ("das 14h às 16h"). */
  hoursStart?: string | null; // HH:MM
  hoursEnd?: string | null;
  /** Data do EVENTO (nascimento, casamento, óbito) — licenças. */
  eventDate?: string | null;
  type?: CertType | null;
  doctorName?: string | null;
  /** CRM/CRO + UF, como está escrito ("CRM 12345 SP"). */
  doctorCrm?: string | null;
  institution?: string | null;
  cid?: string | null;
  cidDescription?: string | null;
}

export interface CertReadResult {
  configured: boolean;
  ok: boolean;
  /** O documento está legível o bastante para ser lido? Falso = pedir nova foto. */
  legivel?: boolean;
  /** Nomenclatura do catálogo (ou null = classificação pendente) e o grupo dela. */
  nomenclatura?: string | null;
  grupo?: GrupoDoDocumento | null;
  /** O que a IA chamou o documento, em texto livre (para o RH ver mesmo quando não casou com o catálogo). */
  naturezaLida?: string | null;
  fields?: CamposLidos;
  /** Confiança por campo (só os presentes). */
  confianca?: Partial<Record<string, Confianca>>;
  /** Trecho do documento que sustenta cada campo (só os presentes). */
  evidencia?: Partial<Record<string, string>>;
  /** Nomes dos campos que a IA NÃO leu com confiança (para destacar). */
  lowConfidence?: string[];
  /** Fim sugerido pela regra geral da licença (o documento não traz período) — o RH confirma. */
  fimSugeridoPelaRegra?: boolean;
  error?: string;
}

type Block = Anthropic.Messages.ContentBlockParam;
type ImagemAceita = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
const IMAGENS: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MIDIAS_ACEITAS: readonly string[] = [...IMAGENS, 'application/pdf'];

function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** A lista FECHADA que a IA recebe: nome + como o documento costuma se apresentar. */
export function listaDeNomenclaturasParaOPrompt(ns: readonly Nomenclatura[] = NOMENCLATURAS): string {
  return ns.map((n) => `- "${n.nome}" (${n.grupo}): ${n.comprovacao}`).join('\n');
}

const CAMPOS = ['collaboratorName', 'issueDate', 'startDate', 'endDate', 'returnDate', 'days', 'hours', 'hoursStart', 'hoursEnd', 'eventDate', 'doctorName', 'doctorCrm', 'institution', 'cid', 'cidDescription'] as const;

/** Opções da interpretação: a lista de nomenclaturas ATIVAS e a regra de duração (com a sobreposição do Admin). */
export interface OpcoesDeLeitura {
  ativas?: readonly Nomenclatura[];
  diasDaRegra?: (nomenclatura: string, inicio: string | null | undefined) => number | null;
}

export function instrucoesDeLeitura(ativas: readonly Nomenclatura[] = NOMENCLATURAS): string {
  return (
    'Você lê documentos de RH brasileiros entregues por funcionários de restaurantes: atestados, declarações de comparecimento, ' +
    'documentos do INSS/CAT, certidões (nascimento, casamento, óbito), comprovantes eleitorais e afins. ' +
    'PRIMEIRO diga se o documento está LEGÍVEL ("legivel": true/false — false quando a imagem está cortada, borrada ou ilegível a ponto de não dar para ler as datas e o nome). ' +
    'DEPOIS identifique a natureza do documento em texto livre ("naturezaLida") e escolha UMA nomenclatura da LISTA FECHADA abaixo em "nomenclatura" — copie o nome EXATAMENTE como está na lista. ' +
    'Se o documento não corresponder com segurança a nenhuma, use null (NUNCA chute: uma classificação errada é pior que nenhuma). ' +
    'Uma declaração de comparecimento/consulta NUNCA vira atestado de afastamento, a não ser que o documento traga expressamente um período de afastamento. ' +
    'Uma certidão de nascimento pode ser "Licença-paternidade" (pai) ou "Licença-maternidade" (mãe): se o documento não deixar claro o vínculo da pessoa, use null.\n' +
    'LISTA FECHADA DE NOMENCLATURAS:\n' + listaDeNomenclaturasParaOPrompt(ativas) + '\n' +
    'Extraia SOMENTE o que está escrito no documento. Datas SEMPRE em yyyy-mm-dd; horários em HH:MM. Campo ausente ou ilegível = null (não presuma, não complete por suposição). ' +
    'DATAS DE AFASTAMENTO: "startDate" = primeiro dia afastado ("Início"); "endDate" = ÚLTIMO dia afastado. Muitos atestados trazem "Retorno" — é o dia em que a pessoa VOLTA ao trabalho, NÃO o fim: ' +
    'devolva-o em "returnDate" e NUNCA o copie em "endDate". Com "N dia(s)" e início, o fim é início + N − 1. ' +
    '"days" = número de dias de afastamento escrito (inteiro). "hours" = horas de dispensa, só em declarações de horas; "hoursStart"/"hoursEnd" = a janela do atendimento, se houver. ' +
    '"eventDate" = data do evento em certidões (nascimento, casamento, óbito). ' +
    '"doctorName" = nome do profissional que assina; "doctorCrm" = registro profissional como escrito (CRM/CRO + número + UF); "institution" = clínica/hospital/órgão emissor. ' +
    '"cid" = código CID SOMENTE se estiver escrito no documento (ex.: "J11", "M54.5"); jamais deduza um CID. "cidDescription" = a descrição padrão da CID-10 desse código, em português, só quando houver código; senão null. ' +
    '"type": FULL_DAY = afasta um ou mais DIAS inteiros; HOURS = horas/comparecimento (não afasta o dia todo); COMPANION = acompanhamento de familiar. ' +
    'Para CADA campo preenchido informe a confiança em "confianca" ("alta" | "media" | "baixa") e, em "evidencia", o trecho curto do documento de onde o valor saiu. ' +
    'Em "lowConfidence" liste os nomes dos campos ausentes ou lidos com confiança baixa. ' +
    'Responda APENAS em JSON, sem texto fora do JSON, no formato exato: ' +
    '{"legivel":boolean,"naturezaLida":string|null,"nomenclatura":string|null,' +
    '"collaboratorName":string|null,"issueDate":string|null,"startDate":string|null,"endDate":string|null,"returnDate":string|null,' +
    '"days":number|null,"hours":number|null,"hoursStart":string|null,"hoursEnd":string|null,"eventDate":string|null,"type":"FULL_DAY"|"HOURS"|"COMPANION"|null,' +
    '"doctorName":string|null,"doctorCrm":string|null,"institution":string|null,"cid":string|null,"cidDescription":string|null,' +
    '"confianca":{"<campo>":"alta"|"media"|"baixa"},"evidencia":{"<campo>":string},"lowConfidence":string[]}.'
  );
}

/**
 * Transforma a resposta crua da IA no resultado conferido — PURO, exportado
 * para os testes (a chamada à rede fica em `lerDocumentoRh`).
 */
export function interpretarResposta(parsed: Record<string, unknown>, opcoes: OpcoesDeLeitura = {}): CertReadResult {
  const ativas = opcoes.ativas ?? NOMENCLATURAS;
  const diasDaRegra = opcoes.diasDaRegra ?? ((n: string, i: string | null | undefined) => duracaoDaRegra(n, i));
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() && isFinite(Number(v)) ? Number(v) : null));
  const date = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
  const hora = (v: unknown) => { const s = str(v); return s && /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : null; };
  const type = (v: unknown): CertType | null => (['FULL_DAY', 'HOURS', 'COMPANION'].includes(v as string) ? (v as CertType) : null);
  const low = Array.isArray(parsed.lowConfidence) ? (parsed.lowConfidence as unknown[]).map(String) : [];

  const legivel = parsed.legivel !== false;
  const candidata = nomenclaturaPorNome(str(parsed.nomenclatura));
  /* Nomenclatura desativada pelo Admin não classifica (a IA não deveria tê-la visto; se viu, fica pendente). */
  const nomenclatura = candidata && ativas.some((a) => a.nome === candidata.nome) ? candidata : null;

  const periodo = conciliarPeriodo({ startDate: date(parsed.startDate), endDate: date(parsed.endDate), returnDate: date(parsed.returnDate), days: num(parsed.days) });
  if (periodo.fimAjustado && !low.includes('endDate')) low.push('endDate');

  /* Licença sem período no documento (certidão): início = data do evento, fim =
     regra geral do catálogo, marcado como SUGESTÃO. A IA não inventa a duração
     — a tabela da planilha é que a dá, e o RH confirma. */
  let startDate = periodo.startDate;
  let endDate = periodo.endDate;
  let days = periodo.days ?? num(parsed.days);
  let fimSugeridoPelaRegra = false;
  const eventDate = date(parsed.eventDate);
  if (nomenclatura?.grupo === 'LICENCA') {
    if (!startDate && eventDate) startDate = eventDate;
    if (startDate && !endDate) {
      /* A regra tem VIGÊNCIA (paternidade 5 → 10 dias em 2027) e o Admin pode sobrepor: nunca um número fixo. */
      const dias = diasDaRegra(nomenclatura.nome, startDate);
      if (dias) {
        const d = new Date(startDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dias - 1);
        endDate = d.toISOString().slice(0, 10); days = dias; fimSugeridoPelaRegra = true; if (!low.includes('endDate')) low.push('endDate');
      }
    }
  }

  const conf: Partial<Record<string, Confianca>> = {};
  const evid: Partial<Record<string, string>> = {};
  const confIn = (parsed.confianca && typeof parsed.confianca === 'object' ? parsed.confianca : {}) as Record<string, unknown>;
  const evidIn = (parsed.evidencia && typeof parsed.evidencia === 'object' ? parsed.evidencia : {}) as Record<string, unknown>;
  for (const k of [...CAMPOS, 'nomenclatura', 'type']) {
    const c = confIn[k];
    if (c === 'alta' || c === 'media' || c === 'baixa') conf[k] = c;
    const e = str(evidIn[k]);
    if (e) evid[k] = e.slice(0, 200);
  }

  /* Tipo: a nomenclatura do catálogo manda (é o contrato do RH); sem ela vale o que a IA viu. */
  const tipo = nomenclatura?.tipo ?? type(parsed.type);

  return {
    configured: true,
    ok: true,
    legivel,
    nomenclatura: nomenclatura?.nome ?? null,
    grupo: nomenclatura?.grupo ?? null,
    naturezaLida: str(parsed.naturezaLida) ?? str(parsed.nomenclatura),
    fields: {
      collaboratorName: str(parsed.collaboratorName),
      issueDate: date(parsed.issueDate),
      startDate,
      endDate,
      returnDate: date(parsed.returnDate),
      days,
      hours: num(parsed.hours),
      hoursStart: hora(parsed.hoursStart),
      hoursEnd: hora(parsed.hoursEnd),
      eventDate,
      type: tipo,
      doctorName: str(parsed.doctorName),
      doctorCrm: str(parsed.doctorCrm),
      institution: str(parsed.institution),
      cid: str(parsed.cid),
      cidDescription: str(parsed.cid) ? str(parsed.cidDescription) : null,
    },
    confianca: conf,
    evidencia: evid,
    lowConfidence: [...new Set(low)],
    fimSugeridoPelaRegra,
  };
}

/** Lê um documento (foto ou PDF) e devolve campos + classificação. */
export async function lerDocumentoRh(input: { base64: string; mediaType: string }): Promise<CertReadResult> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };
  if (!MIDIAS_ACEITAS.includes(input.mediaType)) {
    return { configured: true, ok: false, error: 'Formato não suportado pela leitura automática (use foto JPG/PNG/WEBP ou PDF).' };
  }
  const documento: Block = input.mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
    : { type: 'image', source: { type: 'base64', media_type: input.mediaType as ImagemAceita, data: input.base64 } };

  /* A lista fechada é a das nomenclaturas ATIVAS (Configurações → Atestados e afins). */
  const [ativas, cfg] = await Promise.all([nomenclaturasAtivas().catch(() => [...NOMENCLATURAS]), carregarConfigDasNomenclaturas().catch(() => new Map())]);
  const content: Block[] = [
    { type: 'text', text: 'DOCUMENTO DE RH ENTREGUE PELO FUNCIONÁRIO (ler, transcrever e classificar):' },
    documento,
    { type: 'text', text: instrucoesDeLeitura(ativas) },
  ];

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content }],
    });
    const text = msg.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extractJson(text);
    if (!parsed) return { configured: true, ok: false, error: 'Não foi possível interpretar a resposta da IA.' };
    return interpretarResposta(parsed, { ativas, diasDaRegra: diasDaRegraCom(cfg) });
  } catch (e) {
    return { configured: true, ok: false, error: e instanceof Error ? e.message : 'Falha na leitura por IA' };
  }
}

/** Nome antigo, mantido para quem ainda o importa: só foto. */
export async function readMedicalCertificate(input: { photoBase64: string; mediaType: string }): Promise<CertReadResult> {
  return lerDocumentoRh({ base64: input.photoBase64, mediaType: input.mediaType });
}
