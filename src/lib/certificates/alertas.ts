import type { CertificateType, DocumentGroup, DocumentStatus } from '@prisma/client';
import { grupoDoDocumento, nomenclaturaPorNome } from '@/lib/certificates/catalogo';
import { LIMITE_EMPRESA_DIAS, JANELA_INTERCALADOS_DIAS, duracaoDaRegra } from '@/lib/certificates/regras-legais';

/**
 * INTELIGÊNCIA DE AFASTAMENTOS — PURO (v1.198.0, etapa C). O SGO olha o documento
 * e o histórico do colaborador e SINALIZA o que merece análise do RH. Nunca
 * decide: não soma afastamentos por conta própria, não concede INSS, não
 * determina abono. Cada alerta diz o que foi visto e o que o RH precisa olhar.
 */
export type TipoDeAlerta = 'INSS_15' | 'INTERCALADOS_60' | 'CAT' | 'INSS_CONTROLE' | 'PRAZO_DIFERENTE' | 'RETORNO';
export type GravidadeDoAlerta = 'alta' | 'media' | 'info';

export interface Alerta {
  tipo: TipoDeAlerta;
  gravidade: GravidadeDoAlerta;
  /** Texto curto para a tela (sem dado médico). */
  texto: string;
  /** Ids dos outros documentos envolvidos (intercalados). */
  relacionados?: string[];
}

export interface DocParaAlerta {
  id: string;
  documentGroup: DocumentGroup | null;
  nomenclature: string | null;
  type: CertificateType;
  startDate: string;
  endDate: string;
  days: number;
  status: DocumentStatus;
}

export const ROTULO_DO_ALERTA: Record<TipoDeAlerta, string> = {
  INSS_15: 'Análise INSS necessária',
  INTERCALADOS_60: 'Atestados intercalados (60 dias)',
  CAT: 'Acidente de trabalho (CAT)',
  INSS_CONTROLE: 'Benefício controlado pelo RH',
  PRAZO_DIFERENTE: 'Prazo diferente da regra geral',
  RETORNO: 'Retorno a acompanhar',
};

/** Situações em que o documento não vale (nada a alertar). */
const SEM_EFEITO: readonly DocumentStatus[] = ['NAO_ACEITO'];

function somarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmt(iso: string): string { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function ehIncapacidade(d: DocParaAlerta): boolean {
  const g = grupoDoDocumento(d);
  return (g === 'ATESTADO' || g === 'AFASTAMENTO') && d.type !== 'HOURS';
}

/**
 * Os alertas de UM documento. `historico` = os outros documentos do MESMO
 * colaborador (o próprio é ignorado se vier junto). `hoje` em AAAA-MM-DD.
 * `diasDaRegra` permite à configuração do Admin vencer a tabela legal.
 */
export function alertasDoDocumento(
  doc: DocParaAlerta,
  historico: DocParaAlerta[],
  hoje: string,
  diasDaRegra: (nomenclatura: string, inicio: string) => number | null = (n, i) => duracaoDaRegra(n, i),
): Alerta[] {
  if (SEM_EFEITO.includes(doc.status)) return [];
  const out: Alerta[] = [];
  const grupo = grupoDoDocumento(doc);
  const nome = doc.nomenclature;

  /* 1. Acima de 15 dias → avaliar encaminhamento ao INSS (alerta, não benefício). */
  if (ehIncapacidade(doc) && doc.days > LIMITE_EMPRESA_DIAS) {
    out.push({ tipo: 'INSS_15', gravidade: 'alta', texto: `${doc.days} dias de afastamento: a partir do 16º dia o RH avalia o encaminhamento ao INSS. Não significa benefício concedido.` });
  }

  /* 2. Intercalados em 60 dias: outros atestados do mesmo colaborador cuja soma
        com este passa de 15 dias. Só sinaliza — doenças diferentes não se somam
        sem verificação, e quem verifica é o RH. */
  if (ehIncapacidade(doc) && doc.days <= LIMITE_EMPRESA_DIAS) {
    const janelaIni = somarDias(doc.startDate, -JANELA_INTERCALADOS_DIAS);
    const janelaFim = somarDias(doc.endDate, JANELA_INTERCALADOS_DIAS);
    const vizinhos = historico.filter((h) => h.id !== doc.id && !SEM_EFEITO.includes(h.status) && ehIncapacidade(h) && h.endDate >= janelaIni && h.startDate <= janelaFim);
    const soma = doc.days + vizinhos.reduce((s, h) => s + h.days, 0);
    if (vizinhos.length > 0 && soma > LIMITE_EMPRESA_DIAS) {
      out.push({ tipo: 'INTERCALADOS_60', gravidade: 'media', relacionados: vizinhos.map((v) => v.id), texto: `${vizinhos.length + 1} atestados em 60 dias somam ${soma} dias. O RH avalia se decorrem do mesmo motivo (o SGO não soma por conta própria).` });
    }
  }

  /* 3. CAT: prazo legal de comunicação. */
  if (nome === 'Acidente de trabalho (CAT)') {
    out.push({ tipo: 'CAT', gravidade: 'alta', texto: 'Acidente de trabalho: a CAT deve ser comunicada até o 1º dia útil seguinte (imediatamente em caso de morte). Pode ser devida mesmo sem afastamento — RH/SST.' });
  }

  /* 4. INSS: o SGO registra, o RH controla. */
  if (nome === 'Afastamento pelo INSS') {
    out.push({ tipo: 'INSS_CONTROLE', gravidade: 'info', texto: 'Requerimento, concessão, indeferimento e retorno são controlados pelo RH; o SGO só registra o período informado.' });
  }

  /* 5. Licenças e dispensas com duração regulamentada: período diferente da regra. */
  if (nome && (grupo === 'LICENCA' || grupo === 'COMPARECIMENTO') && doc.type !== 'HOURS') {
    const regra = diasDaRegra(nome, doc.startDate);
    if (regra != null && doc.days !== regra) {
      out.push({ tipo: 'PRAZO_DIFERENTE', gravidade: 'media', texto: `${doc.days} dia(s) lançado(s); a regra geral prevê ${regra}. O RH confirma o prazo (convenção coletiva pode ampliar).` });
    }
  }

  /* 6. Retorno a acompanhar: afastamento em curso ou futuro. */
  if (ehIncapacidade(doc) || grupo === 'LICENCA') {
    if (doc.endDate >= hoje) {
      out.push({ tipo: 'RETORNO', gravidade: 'info', texto: `Retorno previsto em ${fmt(somarDias(doc.endDate, 1))}.` });
    }
  }

  return out;
}

/** Alertas de vários documentos de uma vez — agrupa o histórico por colaborador. */
export function alertasPorDocumento<T extends DocParaAlerta & { collaboratorId: string }>(docs: T[], hoje: string, diasDaRegra?: (n: string, i: string) => number | null): Map<string, Alerta[]> {
  const porColab = new Map<string, T[]>();
  for (const d of docs) { const l = porColab.get(d.collaboratorId) ?? []; l.push(d); porColab.set(d.collaboratorId, l); }
  const out = new Map<string, Alerta[]>();
  for (const d of docs) out.set(d.id, alertasDoDocumento(d, porColab.get(d.collaboratorId) ?? [], hoje, diasDaRegra));
  return out;
}

/** Só a gravidade mais alta de uma lista (para o crachá da linha). */
export function gravidadeMaxima(alertas: Alerta[]): GravidadeDoAlerta | null {
  if (alertas.some((a) => a.gravidade === 'alta')) return 'alta';
  if (alertas.some((a) => a.gravidade === 'media')) return 'media';
  return alertas.length ? 'info' : null;
}

/** Conveniência: o nome do catálogo existe? (evita texto solto virar regra) */
export function nomenclaturaConhecida(nome: string | null): boolean {
  return Boolean(nome && nomenclaturaPorNome(nome));
}
