/**
 * SOLICITAÇÃO DE VAGAS — regras PURAS (v1.227.0).
 *
 * O padrão do Grupo Beija-Flor, igual ao do SGO dos postos: mesmo fluxo, mesmas
 * regras e o MESMO contrato com o RH (gbf-rh). Sem banco e sem tela — servidor e
 * tela leem estas funções, e toda decisão é refeita no servidor.
 *
 * Os identificadores levam prefixo próprio para não colidir com o SGO dos
 * postos, que fala com o mesmo RH: `rest-vaga-<n>`, `rest-cv-<n>`, `VAGR-0012`.
 */

export const SISTEMA = 'SGO Restaurante';

export type StatusDaVaga = 'PENDENTE_APROVACAO' | 'DEVOLVIDA' | 'APROVADA' | 'CONCLUIDA' | 'CANCELADA';
export const STATUS_DA_VAGA: StatusDaVaga[] = ['PENDENTE_APROVACAO', 'DEVOLVIDA', 'APROVADA', 'CONCLUIDA', 'CANCELADA'];
export const ROTULO_DO_STATUS: Record<StatusDaVaga, string> = {
  PENDENTE_APROVACAO: 'Aguardando o supervisor',
  DEVOLVIDA: 'Devolvida para ajuste',
  APROVADA: 'Aprovada — no RH',
  CONCLUIDA: 'Contratação concluída',
  CANCELADA: 'Cancelada',
};

export type Motivo = 'SUBSTITUICAO' | 'AUMENTO_QUADRO' | 'NOVA_FUNCAO';
export const MOTIVOS: { value: Motivo; label: string }[] = [
  { value: 'SUBSTITUICAO', label: 'Substituição' },
  { value: 'AUMENTO_QUADRO', label: 'Aumento de quadro' },
  { value: 'NOVA_FUNCAO', label: 'Nova função' },
];
export const ROTULO_DO_MOTIVO: Record<Motivo, string> = { SUBSTITUICAO: 'Substituição', AUMENTO_QUADRO: 'Aumento de quadro', NOVA_FUNCAO: 'Nova função' };

export const ESCALAS = ['6x1', '5x2', '12x36', '4x2'];
export type Prioridade = 'NORMAL' | 'URGENTE';
export const PESSOAS_MAX = 20;
export const MOTIVO_MIN = 10;

/* ───────────────────────── identificadores ───────────────────────── */

export const codigoDaVaga = (n: number) => `VAGR-${String(n).padStart(4, '0')}`;
export const sgoVagaId = (n: number) => `rest-vaga-${n}`;
export const sgoCurriculoId = (n: number) => `rest-cv-${n}`;

/** Só o prefixo DESTE sistema: `vaga-12` (o dos postos) devolve null — vira 404. */
export function numeroDaVaga(id: unknown): number | null {
  const m = /^rest-vaga-(\d{1,9})$/.exec(String(id ?? '').trim());
  return m ? Number(m[1]) : null;
}
export function numeroDoCurriculo(id: unknown): number | null {
  const m = /^rest-cv-(\d{1,9})$/.exec(String(id ?? '').trim());
  return m ? Number(m[1]) : null;
}

/* ───────────────────────── o formulário ───────────────────────── */

export interface PessoaDaVaga {
  cargo: string;
  motivo: string;
  substituiNome?: string | null;
  substituiColaboradorId?: string | null;
  escala: string;
  horario: string;
  inicioDesejado: string;
  requisitos?: string | null;
  observacao?: string | null;
}

export interface DadosDaVaga {
  unitId: string;
  prioridade: string;
  pessoas: PessoaDaVaga[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const limpo = (v: unknown, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const longo = (v: unknown, max = 1000) => String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const dataValida = (v: string) => ISO.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;

/** Deixa o corpo do jeito que o servidor grava. Nada de salário: o RH define pelo cargo. */
export function normalizarVaga(bruto: unknown): DadosDaVaga {
  const b = (bruto ?? {}) as Record<string, unknown>;
  const pessoas = Array.isArray(b.pessoas) ? b.pessoas : [];
  return {
    unitId: limpo(b.unitId, 60),
    prioridade: b.prioridade === 'URGENTE' ? 'URGENTE' : 'NORMAL',
    pessoas: pessoas.slice(0, PESSOAS_MAX + 1).map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return {
        cargo: limpo(x.cargo, 80),
        motivo: limpo(x.motivo, 30),
        substituiNome: limpo(x.substituiNome, 120) || null,
        substituiColaboradorId: limpo(x.substituiColaboradorId, 60) || null,
        escala: limpo(x.escala, 40),
        horario: limpo(x.horario, 80),
        inicioDesejado: limpo(x.inicioDesejado, 10),
        requisitos: longo(x.requisitos) || null,
        observacao: longo(x.observacao) || null,
      };
    }),
  };
}

export interface ErroDeCampo { pessoa: number | null; campo: string; mensagem: string }

/**
 * Valida a solicitação. Uma mensagem por campo, prefixada "Pessoa N:" quando há
 * mais de uma. `dataMinima` é hoje — ou, na EDIÇÃO, a mais antiga entre hoje e a
 * data que a vaga já tinha (o início que já estava no passado não trava a correção).
 */
export function validarVaga(d: DadosDaVaga, opts: { dataMinima: string }): ErroDeCampo[] {
  const erros: ErroDeCampo[] = [];
  if (!d.unitId) erros.push({ pessoa: null, campo: 'unitId', mensagem: 'Escolha a unidade.' });
  if (d.pessoas.length < 1) erros.push({ pessoa: null, campo: 'pessoas', mensagem: 'Informe pelo menos uma pessoa.' });
  if (d.pessoas.length > PESSOAS_MAX) erros.push({ pessoa: null, campo: 'pessoas', mensagem: `No máximo ${PESSOAS_MAX} pessoas por solicitação.` });
  const varias = d.pessoas.length > 1;
  d.pessoas.slice(0, PESSOAS_MAX).forEach((p, i) => {
    const pre = varias ? `Pessoa ${i + 1}: ` : '';
    const e = (campo: string, mensagem: string) => erros.push({ pessoa: i + 1, campo, mensagem: pre + mensagem });
    if (p.cargo.length < 2) e('cargo', 'informe o cargo.');
    if (!MOTIVOS.some((m) => m.value === p.motivo)) e('motivo', 'escolha o motivo.');
    if (p.motivo === 'SUBSTITUICAO' && !(p.substituiNome && p.substituiNome.length >= 2)) e('substitui', 'diga quem está sendo substituído.');
    if (p.escala.length < 2) e('escala', 'informe a escala.');
    if (p.horario.length < 3) e('horario', 'informe o horário.');
    if (!dataValida(p.inicioDesejado)) e('inicioDesejado', 'informe o início desejado.');
    else if (p.inicioDesejado < opts.dataMinima) e('inicioDesejado', 'o início desejado não pode ser antes de hoje.');
  });
  return erros.map((x) => ({ ...x, mensagem: x.mensagem.charAt(0).toUpperCase() + x.mensagem.slice(1) }));
}

/** "2× Garçom · 1× Cozinheiro", na ordem em que os cargos aparecem. */
export function resumoDosCargos(pessoas: { cargo: string }[]): string {
  const m = new Map<string, number>();
  for (const p of pessoas) m.set(p.cargo, (m.get(p.cargo) ?? 0) + 1);
  return [...m.entries()].map(([cargo, n]) => `${n}× ${cargo}`).join(' · ');
}

/** Resumo de um texto por pessoa: igual para todas = o texto; diferente = "Pessoa N (cargo): …". */
export function resumoDeTexto(pessoas: PessoaDaVaga[], campo: 'requisitos' | 'observacao'): string | null {
  const com = pessoas.map((p, i) => ({ i, cargo: p.cargo, t: (p[campo] ?? '').trim() })).filter((x) => x.t);
  if (com.length === 0) return null;
  if (com.length === pessoas.length && com.every((x) => x.t === com[0].t)) return com[0].t;
  return com.map((x) => `Pessoa ${x.i + 1} (${x.cargo}): ${x.t}`).join('\n');
}

export function inicioMaisCedo(pessoas: { inicioDesejado: string }[]): string {
  return pessoas.map((p) => p.inicioDesejado).filter((d) => ISO.test(d)).sort()[0] ?? '';
}

/** A data mínima da edição: a mais antiga entre hoje e a que a vaga já tinha. */
export function dataMinimaDaEdicao(hoje: string, inicioAtual: string | null | undefined): string {
  return inicioAtual && ISO.test(inicioAtual) && inicioAtual < hoje ? inicioAtual : hoje;
}

/* ───────────────────────── quem faz o quê ───────────────────────── */

export type Acao = 'aprovar' | 'devolver' | 'cancelar' | 'editar' | 'excluir' | 'corrigir' | 'anexar' | 'avaliarCurriculo';
export interface Papel { dono: boolean; aprovador: boolean }

/**
 * A tabela de ações por situação e papel — a MESMA para a tela (mostrar botão)
 * e para o servidor (recusar com 409). O aprovador que também pode pedir soma os dois.
 */
export function acoesDaVaga(status: StatusDaVaga, papel: Papel): Acao[] {
  const out = new Set<Acao>();
  if (papel.dono) {
    if (status === 'PENDENTE_APROVACAO') { out.add('anexar'); out.add('cancelar'); }
    if (status === 'DEVOLVIDA') { out.add('corrigir'); out.add('anexar'); out.add('cancelar'); }
    if (status === 'APROVADA') out.add('anexar');
  }
  if (papel.aprovador) {
    if (status === 'PENDENTE_APROVACAO') for (const a of ['aprovar', 'devolver', 'cancelar', 'editar', 'excluir'] as Acao[]) out.add(a);
    if (status === 'DEVOLVIDA') for (const a of ['cancelar', 'editar', 'excluir'] as Acao[]) out.add(a);
    if (status === 'APROVADA') for (const a of ['anexar', 'avaliarCurriculo', 'cancelar', 'editar', 'excluir'] as Acao[]) out.add(a);
    if (status === 'CONCLUIDA' || status === 'CANCELADA') out.add('excluir');
  }
  return [...out];
}

export const podeFazer = (status: StatusDaVaga, papel: Papel, acao: Acao) => acoesDaVaga(status, papel).includes(acao);

/* ───────────────────────── o que mudou na edição ───────────────────────── */

const CAMPOS: { k: keyof PessoaDaVaga; rotulo: string }[] = [
  { k: 'cargo', rotulo: 'cargo' }, { k: 'motivo', rotulo: 'motivo' }, { k: 'substituiNome', rotulo: 'substitui' },
  { k: 'escala', rotulo: 'escala' }, { k: 'horario', rotulo: 'horário' }, { k: 'inicioDesejado', rotulo: 'início' },
  { k: 'requisitos', rotulo: 'o que é obrigatório' }, { k: 'observacao', rotulo: 'observação' },
];
const emBR = (iso: string) => (ISO.test(iso) ? iso.split('-').reverse().join('/') : iso);
const mostra = (k: keyof PessoaDaVaga, v: unknown) => {
  const s = String(v ?? '').trim();
  if (!s) return '(vazio)';
  if (k === 'motivo') return ROTULO_DO_MOTIVO[s as Motivo] ?? s;
  if (k === 'inicioDesejado') return emBR(s);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

/** "Pessoa 2: horário 07:00 → 07:00 às 15:20" — uma linha por diferença. Vazio = nada mudou. */
export function diferencasDaEdicao(antes: { prioridade: string; pessoas: PessoaDaVaga[] }, depois: { prioridade: string; pessoas: PessoaDaVaga[] }): string[] {
  const out: string[] = [];
  if (antes.prioridade !== depois.prioridade) out.push(`Prioridade: ${antes.prioridade === 'URGENTE' ? 'Urgente' : 'Normal'} → ${depois.prioridade === 'URGENTE' ? 'Urgente' : 'Normal'}`);
  if (antes.pessoas.length !== depois.pessoas.length) out.push(`Pessoas: ${antes.pessoas.length} → ${depois.pessoas.length}`);
  const n = Math.max(antes.pessoas.length, depois.pessoas.length);
  for (let i = 0; i < n; i++) {
    const a = antes.pessoas[i], d = depois.pessoas[i];
    if (a && !d) { out.push(`Pessoa ${i + 1} (${a.cargo}): removida`); continue; }
    if (!a && d) { out.push(`Pessoa ${i + 1} (${d.cargo}): incluída`); continue; }
    for (const c of CAMPOS) {
      const x = String(a[c.k] ?? '').trim(), y = String(d[c.k] ?? '').trim();
      if (x !== y) out.push(`Pessoa ${i + 1}: ${c.rotulo} ${mostra(c.k, x)} → ${mostra(c.k, y)}`);
    }
  }
  return out;
}

/* ───────────────────────── currículos (arquivo) ───────────────────────── */

export const CURRICULOS_POR_ENVIO = 10;
export const CURRICULOS_POR_VAGA = 40;
export const CURRICULO_MAX_BYTES = 10 * 1024 * 1024;
export type TipoDeArquivo = 'pdf' | 'jpg' | 'png' | 'doc' | 'docx';
export const MIME_DO_ARQUIVO: Record<TipoDeArquivo, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * O tipo pelo CONTEÚDO (primeiros bytes), não pela extensão que o navegador
 * declara. DOCX é um zip ("PK"); a extensão só desempata zip de DOCX.
 */
export function tipoDoArquivo(b: Uint8Array, nome: string): TipoDeArquivo | null {
  const ext = (nome.split('.').pop() ?? '').toLowerCase();
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return ext === 'doc' ? 'doc' : null;
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return ext === 'docx' ? 'docx' : null;
  return null;
}

/* ───────────────────────── documento do candidato não sai do RH ───────────────────────── */

/** Há um CPF no texto? (11 dígitos, com ou sem pontuação.) Retorno do RH com CPF é recusado. */
export function contemCpf(texto: unknown): boolean {
  const s = String(texto ?? '');
  return /(?<!\d)\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}(?!\d)/.test(s);
}

/* ───────────────────────── tipos de evento (cabem em 30) ───────────────────────── */

export const TIPO_MAX = 30;
export const TIPOS_DE_EVENTO = [
  'CRIADA', 'REENVIADA', 'APROVADA', 'DEVOLVIDA', 'CANCELADA', 'EXCLUIDA', 'EDITADA', 'LEMBRETE',
  'CURRICULO_ANEXADO', 'CURRICULO_REMOVIDO', 'CURRICULO_ENVIADO', 'CURRICULO_RECUSADO',
  'RH_ENTREGUE', 'RH_ERRO', 'RH_REENVIO',
  'RH_RECEBIDA', 'RH_VAGA_NUMERADA', 'RH_EM_SELECAO', 'RH_CONSULTA_CADASTRAL', 'RH_ENTREVISTA_AGENDADA',
  'RH_CANDIDATO_APROVADO', 'RH_CANDIDATO_REPROVADO', 'RH_EM_ADMISSAO', 'RH_CONCLUIDA', 'RH_CANCELADA',
] as const;
/** O tipo do evento de situação de currículo: prefixo curto de propósito (cabe em 30). */
export const tipoDoEventoDeCurriculo = (situacao: string) => `RH_CV_${situacao.toUpperCase()}`.slice(0, TIPO_MAX);
