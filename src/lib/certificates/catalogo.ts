import type { CertificateType } from '@prisma/client';
import { semelhancaDeNomes } from '@/lib/comissao/calculo';

/**
 * CATÁLOGO DE DOCUMENTOS DA CENTRAL DE ATESTADOS E AFINS — PURO (v1.196.0).
 *
 * A fonte é a planilha do Pedro (09/11/2026, "SGO_Tipos_Atestados_Afastamentos_
 * Comparecimentos_Licencas.xlsx"). REGRA FUNDAMENTAL: a classificação é SÓ
 * por NOMENCLATURA ("Atestado médico", "Licença-paternidade"…), nunca por
 * código (os AT-01/CO-03 da planilha foram ignorados de propósito — o RH
 * identifica o documento pelo nome).
 *
 * Nem toda linha da planilha é um documento: "até 15 dias", "acima de 15
 * dias" e "sem CID" são a MESMA nomenclatura (Atestado médico) com regras de
 * duração; "afastamento prolongado" e "intercalados" são ALERTAS; a
 * aposentadoria é situação do RH e não se lança. O que sobra são as
 * nomenclaturas abaixo, agrupadas nos quatro grupos.
 *
 * Cada nomenclatura declara:
 *  - `tipo`: o valor do contrato do RH (FULL_DAY | HOURS | COMPANION), que
 *    segue sendo o que vai no `tipoDetalhe` do envio (nada foi inventado no
 *    contrato);
 *  - `escala`: o que marca na Escala (ATESTADO · AFASTADO · LICENCA ·
 *    FALTA_JUST · null = não afasta o dia, caso das declarações de horas);
 *  - `diasSugeridos`: só nas licenças — a REGRA GERAL da planilha. É sugestão
 *    para a tela pré-preencher o fim; o RH confirma (nunca é imposta).
 */
export type GrupoDoDocumento = 'ATESTADO' | 'AFASTAMENTO' | 'COMPARECIMENTO' | 'LICENCA';
export type EfeitoNaEscala = 'ATESTADO' | 'AFASTADO' | 'LICENCA' | 'FALTA_JUST' | null;

export const GRUPOS: Record<GrupoDoDocumento, { rotulo: string; plural: string; descricao: string }> = {
  ATESTADO: { rotulo: 'Atestado', plural: 'Atestados', descricao: 'Documento clínico com recomendação ou registro de saúde; não se confunde com concessão do INSS.' },
  AFASTAMENTO: { rotulo: 'Afastamento', plural: 'Afastamentos', descricao: 'Situação previdenciária ou ocupacional (INSS, acidente de trabalho).' },
  COMPARECIMENTO: { rotulo: 'Comparecimento', plural: 'Comparecimentos', descricao: 'Comprova presença em consulta, exame ou obrigação legal; o abono depende do caso.' },
  LICENCA: { rotulo: 'Licença', plural: 'Licenças', descricao: 'Ausências previstas em lei ou acordadas: maternidade, paternidade, casamento, luto.' },
};
export const ORDEM_DOS_GRUPOS: GrupoDoDocumento[] = ['ATESTADO', 'AFASTAMENTO', 'COMPARECIMENTO', 'LICENCA'];

export interface Nomenclatura {
  nome: string;
  grupo: GrupoDoDocumento;
  tipo: CertificateType;
  escala: EfeitoNaEscala;
  /** Licenças: duração da regra geral (planilha). Só SUGESTÃO para o fim do período. */
  diasSugeridos?: number;
  /** Comprovação usual — vai ao prompt da IA para ela reconhecer o documento. */
  comprovacao: string;
  /** Regra resumida (base operacional; o RH decide). */
  regra: string;
  /** Outros nomes pelos quais o documento costuma aparecer (ajudam a casar a resposta da IA). */
  sinonimos?: string[];
}

export const NOMENCLATURAS: readonly Nomenclatura[] = [
  /* ── Atestados ── */
  { nome: 'Atestado médico', grupo: 'ATESTADO', tipo: 'FULL_DAY', escala: 'ATESTADO',
    comprovacao: 'Atestado médico legível, com identificação do profissional (CRM) e período recomendado de afastamento.',
    regra: 'A empresa cobre os primeiros 15 dias consecutivos; a partir do 16º dia o RH avalia encaminhamento ao INSS. CID não é exigido.',
    sinonimos: ['atestado', 'atestado medico', 'atestado de saude', 'atestado de afastamento'] },
  { nome: 'Atestado odontológico', grupo: 'ATESTADO', tipo: 'FULL_DAY', escala: 'ATESTADO',
    comprovacao: 'Atestado de cirurgião-dentista com CRO e período indicado.',
    regra: 'Justifica afastamento odontológico pelo período indicado; a duração é analisada como nos demais afastamentos.',
    sinonimos: ['atestado odontologico', 'atestado dentista', 'atestado cro'] },
  { nome: 'Declaração de internação', grupo: 'ATESTADO', tipo: 'FULL_DAY', escala: 'ATESTADO',
    comprovacao: 'Declaração hospitalar de internação (e/ou atestado de afastamento).',
    regra: 'Comprova a internação; não se presume período de repouso além do que está escrito.',
    sinonimos: ['declaracao de internacao', 'internacao hospitalar', 'declaracao hospitalar'] },

  /* ── Afastamentos ── */
  { nome: 'Afastamento pelo INSS', grupo: 'AFASTAMENTO', tipo: 'FULL_DAY', escala: 'AFASTADO',
    comprovacao: 'Comprovante de requerimento ou decisão do INSS (benefício por incapacidade), com datas oficiais.',
    regra: 'Pedido, concessão, indeferimento e retorno são controlados pelo RH; o SGO não concede benefício.',
    sinonimos: ['inss', 'auxilio doenca', 'beneficio por incapacidade', 'requerimento inss', 'comunicacao de decisao'] },
  { nome: 'Acidente de trabalho (CAT)', grupo: 'AFASTAMENTO', tipo: 'FULL_DAY', escala: 'ATESTADO',
    comprovacao: 'Comunicação de Acidente de Trabalho (CAT) e/ou documento médico do acidente.',
    regra: 'A CAT deve ser comunicada até o 1º dia útil seguinte (imediatamente em caso de morte); pode ser devida mesmo sem afastamento.',
    sinonimos: ['cat', 'acidente de trabalho', 'comunicacao de acidente de trabalho'] },

  /* ── Comparecimentos ── */
  { nome: 'Consulta médica', grupo: 'COMPARECIMENTO', tipo: 'HOURS', escala: null,
    comprovacao: 'Declaração de comparecimento a consulta médica, com data e horário (sem período de afastamento).',
    regra: 'Comprova a presença no atendimento; não abona o dia inteiro por si só.',
    sinonimos: ['declaracao de comparecimento', 'declaracao de consulta', 'comparecimento medico', 'atestado de comparecimento'] },
  { nome: 'Consulta odontológica', grupo: 'COMPARECIMENTO', tipo: 'HOURS', escala: null,
    comprovacao: 'Declaração odontológica de comparecimento com data e horário.',
    regra: 'Comprova a presença; diferente do atestado odontológico com afastamento.',
    sinonimos: ['comparecimento odontologico', 'declaracao dentista'] },
  { nome: 'Exames (laboratoriais e outros)', grupo: 'COMPARECIMENTO', tipo: 'HOURS', escala: null,
    comprovacao: 'Declaração do laboratório ou clínica com data e horário do exame.',
    regra: 'Sem afastamento médico não gera abono integral automático.',
    sinonimos: ['exame', 'exames', 'exame laboratorial', 'declaracao de exame', 'comprovante de exame'] },
  { nome: 'Acompanhante de familiar', grupo: 'COMPARECIMENTO', tipo: 'COMPANION', escala: null,
    comprovacao: 'Declaração de acompanhante em consulta/atendimento de familiar, com data, horário e a pessoa acompanhada.',
    regra: 'Não há abono geral automático para todo acompanhante; o RH verifica as hipóteses legais e coletivas.',
    sinonimos: ['acompanhante', 'declaracao de acompanhante', 'acompanhamento de familiar', 'acompanhamento'] },
  { nome: 'Acompanhamento de gestante (consulta ou exame)', grupo: 'COMPARECIMENTO', tipo: 'COMPANION', escala: null,
    comprovacao: 'Declaração de consulta ou exame da esposa/companheira gestante.',
    regra: 'Tempo necessário para até 6 consultas ou exames durante a gestação.',
    sinonimos: ['acompanhamento de gestante', 'acompanhar gestante', 'pre natal da esposa', 'consulta da gestante'] },
  { nome: 'Acompanhamento de filho até 6 anos', grupo: 'COMPARECIMENTO', tipo: 'COMPANION', escala: 'FALTA_JUST', diasSugeridos: 1,
    comprovacao: 'Declaração de consulta médica do filho de até 6 anos, com vínculo/idade.',
    regra: '1 dia por ano para acompanhar filho de até 6 anos em consulta médica.',
    sinonimos: ['acompanhamento de filho', 'consulta do filho', 'pediatra'] },
  { nome: 'Pré-natal da empregada gestante', grupo: 'COMPARECIMENTO', tipo: 'HOURS', escala: null,
    comprovacao: 'Declaração de consulta de pré-natal ou exame da própria colaboradora gestante.',
    regra: 'Dispensa para no mínimo 6 consultas e exames complementares durante a gestação.',
    sinonimos: ['pre natal', 'pre-natal', 'consulta pre natal'] },
  { nome: 'Doação voluntária de sangue', grupo: 'COMPARECIMENTO', tipo: 'FULL_DAY', escala: 'FALTA_JUST', diasSugeridos: 1,
    comprovacao: 'Comprovante de doação de sangue (hemocentro).',
    regra: '1 dia a cada 12 meses de trabalho, mediante comprovação.',
    sinonimos: ['doacao de sangue', 'hemocentro', 'comprovante de doacao'] },
  { nome: 'Exames preventivos de câncer', grupo: 'COMPARECIMENTO', tipo: 'FULL_DAY', escala: 'FALTA_JUST', diasSugeridos: 1,
    comprovacao: 'Comprovante de exame preventivo de câncer (sem resultado clínico).',
    regra: 'Até 3 dias em cada 12 meses para exames preventivos, nos termos da CLT.',
    sinonimos: ['exame preventivo', 'preventivo de cancer', 'mamografia', 'papanicolau', 'hpv'] },
  { nome: 'Alistamento eleitoral', grupo: 'COMPARECIMENTO', tipo: 'FULL_DAY', escala: 'FALTA_JUST', diasSugeridos: 1,
    comprovacao: 'Comprovante eleitoral de alistamento.',
    regra: 'Até 2 dias, consecutivos ou não, para alistamento eleitoral.',
    sinonimos: ['alistamento eleitoral', 'titulo de eleitor', 'cartorio eleitoral'] },
  { nome: 'Trabalho eleitoral (mesário)', grupo: 'COMPARECIMENTO', tipo: 'FULL_DAY', escala: 'FALTA_JUST', diasSugeridos: 1,
    comprovacao: 'Declaração de Trabalhos Eleitorais (DTE) da Justiça Eleitoral.',
    regra: '2 dias de folga por dia de convocação comprovada, inclusive treinamento (TSE).',
    sinonimos: ['mesario', 'trabalho eleitoral', 'dte', 'declaracao de trabalhos eleitorais', 'convocacao eleitoral'] },
  { nome: 'Comparecimento à Justiça', grupo: 'COMPARECIMENTO', tipo: 'HOURS', escala: null,
    comprovacao: 'Intimação e comprovante de comparecimento a juízo.',
    regra: 'Ausência pelo tempo necessário ao comparecimento (art. 473 da CLT).',
    sinonimos: ['comparecimento a justica', 'intimacao', 'audiencia', 'forum', 'declaracao de comparecimento judicial', 'testemunha'] },
  { nome: 'Vestibular', grupo: 'COMPARECIMENTO', tipo: 'FULL_DAY', escala: 'FALTA_JUST', diasSugeridos: 1,
    comprovacao: 'Comprovante de realização de prova de vestibular.',
    regra: 'Dispensa nos dias de prova de vestibular para ingresso no ensino superior.',
    sinonimos: ['vestibular', 'prova de vestibular', 'enem'] },

  /* ── Licenças ── */
  { nome: 'Licença-maternidade', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 120,
    comprovacao: 'Certidão de nascimento (ou natimorto); atestado médico se o início for antes do parto.',
    regra: 'Regra geral de 120 dias; pode haver prorrogação (Programa Empresa Cidadã).',
    sinonimos: ['licenca maternidade', 'maternidade', 'certidao de nascimento (mae)', 'natimorto'] },
  { nome: 'Licença-paternidade', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 5,
    comprovacao: 'Certidão de nascimento do filho ou documento de adoção/guarda.',
    regra: 'Em 2026: 5 dias (Lei 15.371/2026: 10 dias em 2027, 15 em 2028, 20 em 2029). Convenção pode ampliar.',
    sinonimos: ['licenca paternidade', 'paternidade', 'certidao de nascimento', 'nascimento de filho', 'adocao', 'guarda'] },
  { nome: 'Licença-casamento', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 3,
    comprovacao: 'Certidão de casamento.',
    regra: 'Até 3 dias consecutivos (licença-gala), conforme a CLT.',
    sinonimos: ['licenca casamento', 'casamento', 'gala', 'certidao de casamento'] },
  { nome: 'Licença por falecimento (luto)', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 2,
    comprovacao: 'Certidão ou declaração de óbito e identificação do parentesco.',
    regra: 'Até 2 dias consecutivos para familiares previstos na CLT; convenção pode ampliar.',
    sinonimos: ['luto', 'nojo', 'falecimento', 'obito', 'certidao de obito', 'declaracao de obito'] },
  { nome: 'Repouso por aborto não criminoso', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 14,
    comprovacao: 'Atestado médico pertinente (encaminhado de modo reservado).',
    regra: 'Em regra 2 semanas de repouso remunerado, nos termos da CLT; há tratamento previdenciário específico.',
    sinonimos: ['aborto', 'repouso por aborto', 'abortamento'] },
  { nome: 'Prorrogação da licença-maternidade', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 60,
    comprovacao: 'Pedido de prorrogação e confirmação do enquadramento (Programa Empresa Cidadã).',
    regra: 'Em empresa aderente, 60 dias adicionais, com requisitos próprios.',
    sinonimos: ['prorrogacao da maternidade', 'prorrogacao licenca maternidade', 'empresa cidada'] },
  { nome: 'Licença-amamentação', grupo: 'LICENCA', tipo: 'FULL_DAY', escala: 'LICENCA', diasSugeridos: 15,
    comprovacao: 'Documento relacionado à amamentação após a licença-maternidade (convenção/acordo ou autorização da empresa).',
    regra: '15 dias após a licença-maternidade quando previsto em convenção, acordo coletivo ou autorizado pela empresa; não é direito automático da CLT.',
    sinonimos: ['amamentacao', 'licenca amamentacao', 'aleitamento'] },
];

/** Nomes das nomenclaturas, na ordem do catálogo (o que a IA e as telas usam). */
export const NOMES_DAS_NOMENCLATURAS: readonly string[] = NOMENCLATURAS.map((n) => n.nome);

export function nomenclaturasDoGrupo(grupo: GrupoDoDocumento): Nomenclatura[] {
  return NOMENCLATURAS.filter((n) => n.grupo === grupo);
}

/** Sem acento, sem caixa, sem pontuação; espaços colapsados. */
export function normalizarNome(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Casa um texto com UMA nomenclatura do catálogo: nome exato (normalizado)
 * primeiro, depois sinônimo exato. Nada parecido → null (a classificação fica
 * "pendente de análise do RH"; chutar seria pior que não classificar).
 */
export function nomenclaturaPorNome(texto: string | null | undefined): Nomenclatura | null {
  if (!texto) return null;
  const n = normalizarNome(texto);
  if (!n) return null;
  return NOMENCLATURAS.find((x) => normalizarNome(x.nome) === n)
    ?? NOMENCLATURAS.find((x) => (x.sinonimos ?? []).some((s) => normalizarNome(s) === n))
    ?? null;
}

/**
 * Registro ANTERIOR ao catálogo (nomenclatura nula no banco): o rótulo e o
 * efeito vêm do tipo de sempre — nada do histórico muda de significado.
 */
export const NOMENCLATURA_LEGADA: Record<CertificateType, string> = {
  FULL_DAY: 'Atestado (dias de afastamento)',
  HOURS: 'Atestado de horas',
  COMPANION: 'Acompanhamento de familiar',
};

/** O rótulo que a tela mostra: a nomenclatura, ou o tipo antigo para registros de antes. */
export function rotuloDoDocumento(d: { nomenclature: string | null; type: CertificateType }): string {
  return d.nomenclature ?? NOMENCLATURA_LEGADA[d.type];
}

/** O grupo: o gravado, ou o derivado do tipo antigo (acompanhamento = comparecimento; o resto = atestado). */
export function grupoDoDocumento(d: { documentGroup: GrupoDoDocumento | null; nomenclature: string | null; type: CertificateType }): GrupoDoDocumento {
  if (d.documentGroup) return d.documentGroup;
  const n = nomenclaturaPorNome(d.nomenclature);
  if (n) return n.grupo;
  return d.type === 'COMPANION' ? 'COMPARECIMENTO' : 'ATESTADO';
}

/**
 * O que o documento marca na Escala. Com nomenclatura do catálogo vale a
 * tabela; sem ela (registro antigo) vale a regra de sempre: HOURS não afasta,
 * FULL_DAY e COMPANION marcam "Atestado".
 */
export function efeitoNaEscala(d: { nomenclature: string | null; type: CertificateType }): EfeitoNaEscala {
  const n = nomenclaturaPorNome(d.nomenclature);
  if (n) return n.escala;
  return d.type === 'HOURS' ? null : 'ATESTADO';
}

/**
 * Conferência do NOME lido no documento contra o colaborador escolhido —
 * reusa a comparação fonética da Comissão (v1.178.0). Abaixo de
 * `SEMELHANCA_MINIMA` a tela avisa e o registro leva a divergência para o RH;
 * nunca bloqueia (o gerente pode ter razão: apelido, nome de solteira).
 */
export const SEMELHANCA_MINIMA_DO_NOME = 70;
export function conferirNome(nomeLido: string | null | undefined, nomeDoColaborador: string): { semelhanca: number; divergente: boolean } | null {
  if (!nomeLido || !nomeLido.trim()) return null;
  const semelhanca = semelhancaDeNomes(nomeLido, nomeDoColaborador);
  return { semelhanca, divergente: semelhanca < SEMELHANCA_MINIMA_DO_NOME };
}

/**
 * Fim SUGERIDO para licenças quando o documento não traz período (uma
 * certidão de nascimento não diz quantos dias de licença): início + regra
 * geral − 1. É sugestão para a tela, marcada como tal; o RH confirma.
 */
export function fimSugerido(nomenclatura: Nomenclatura | null, inicio: string | null): string | null {
  if (!nomenclatura || !nomenclatura.diasSugeridos || !inicio || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null;
  const d = new Date(inicio + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + nomenclatura.diasSugeridos - 1);
  return d.toISOString().slice(0, 10);
}

/* ───────────────────────── Situação do lançamento ───────────────────────── */
export type SituacaoDoDocumento =
  | 'AGUARDANDO_LEITURA' | 'LEITURA_CONCLUIDA' | 'CLASSIFICACAO_PENDENTE' | 'ENVIADO_RH' | 'EM_ANALISE_RH'
  | 'CORRECAO_SOLICITADA' | 'CORRIGIDO_REENVIADO' | 'VALIDADO_RH' | 'NAO_ACEITO' | 'CONCLUIDO';

export const SITUACOES: Record<SituacaoDoDocumento, { rotulo: string; tom: 'neutral' | 'info' | 'warning' | 'success' | 'danger'; paraOGerente: string }> = {
  AGUARDANDO_LEITURA:     { rotulo: 'Aguardando leitura da IA',      tom: 'neutral', paraOGerente: 'O documento foi recebido e está sendo lido.' },
  LEITURA_CONCLUIDA:      { rotulo: 'Leitura concluída',             tom: 'info',    paraOGerente: 'Lido e classificado; aguardando o envio ao RH.' },
  CLASSIFICACAO_PENDENTE: { rotulo: 'Classificação pendente',        tom: 'warning', paraOGerente: 'A IA não teve segurança para classificar; o RH define o tipo na análise.' },
  ENVIADO_RH:             { rotulo: 'Enviado ao RH',                 tom: 'info',    paraOGerente: 'O RH recebeu o documento.' },
  EM_ANALISE_RH:          { rotulo: 'Em análise pelo RH',            tom: 'info',    paraOGerente: 'O RH está analisando.' },
  CORRECAO_SOLICITADA:    { rotulo: 'Correção solicitada',           tom: 'danger',  paraOGerente: 'O RH pediu correção — veja o motivo e reenvie.' },
  CORRIGIDO_REENVIADO:    { rotulo: 'Corrigido e reenviado',         tom: 'info',    paraOGerente: 'Sua correção foi enviada ao RH.' },
  VALIDADO_RH:            { rotulo: 'Validado pelo RH',              tom: 'success', paraOGerente: 'O RH validou o documento.' },
  NAO_ACEITO:             { rotulo: 'Não aceito',                    tom: 'danger',  paraOGerente: 'O RH não aceitou o documento; veja a justificativa.' },
  CONCLUIDO:              { rotulo: 'Concluído',                     tom: 'success', paraOGerente: 'Tratamento encerrado.' },
};

/** Situação com que o lançamento NASCE: classificado → leitura concluída; sem nomenclatura segura → pendente. */
export function situacaoInicial(nomenclatura: Nomenclatura | null): SituacaoDoDocumento {
  return nomenclatura ? 'LEITURA_CONCLUIDA' : 'CLASSIFICACAO_PENDENTE';
}

/** Situações em que o aceite do RH ("Enviado") ainda muda a situação — depois disso o RH já se manifestou. */
export const SITUACOES_ANTES_DO_RH: readonly SituacaoDoDocumento[] = ['AGUARDANDO_LEITURA', 'LEITURA_CONCLUIDA', 'CLASSIFICACAO_PENDENTE'];

/* ───────────────────────── Alertas (base; a inteligência completa é a 3ª etapa) ───────────────────────── */
export const DIAS_PARA_ALERTA_INSS = 15;

/** Atestado (grupo) com mais de 15 dias → "Análise INSS necessária". Só sinaliza; não concede nada. */
export function alertaDeDuracao(d: { documentGroup: GrupoDoDocumento | null; nomenclature: string | null; type: CertificateType; days: number }): 'INSS' | null {
  const grupo = grupoDoDocumento(d);
  if ((grupo === 'ATESTADO' || grupo === 'AFASTAMENTO') && d.days > DIAS_PARA_ALERTA_INSS) return 'INSS';
  return null;
}
