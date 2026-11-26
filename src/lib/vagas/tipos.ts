import type { StatusDaVaga } from '@/lib/vagas/regras';

/** O que a tela e as regras puras leem de uma vaga (datas em ISO). Sem Prisma. */
export interface PosicaoDTO {
  ordem: number;
  cargo: string;
  motivo: string;
  substituiNome: string | null;
  substituiColaboradorId: string | null;
  escala: string;
  horario: string;
  inicioDesejado: string;
  requisitos: string | null;
  observacao: string | null;
}

export interface CurriculoDTO {
  id: string;
  number: number;
  nomeArquivo: string;
  mime: string;
  tamanho: number;
  indicadoPor: string | null;
  enviadoPorId: string | null;
  enviadoPorNome: string;
  enviadoEm: string;
  removido: boolean;
  /** null = foi junto com a vaga. */
  fluxo: string | null;
  decididoPorNome: string | null;
  decididoEm: string | null;
  motivoRecusa: string | null;
  rhEnvioSituacao: string | null;
  rhEnvioMotivo: string | null;
  rhSituacao: string | null;
  rhSituacaoEm: string | null;
  rhObservacao: string | null;
}

export interface EventoDTO {
  id: string;
  tipo: string;
  origem: string;
  descricao: string;
  usuarioNome: string | null;
  createdAt: string;
}

export interface VagaDTO {
  id: string;
  number: number;
  codigo: string;
  unitId: string;
  unitName: string;
  cargoResumo: string;
  quantidade: number;
  requisitos: string | null;
  observacao: string | null;
  inicioDesejado: string;
  prioridade: string;
  status: StatusDaVaga;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
  enviadoParaAprovacaoEm: string;
  decididoPorNome: string | null;
  decididoEm: string | null;
  motivoDevolucao: string | null;
  canceladoPorNome: string | null;
  canceladoEm: string | null;
  motivoCancelamento: string | null;
  rhEnvioAcao: string | null;
  rhEnvioSituacao: string | null;
  rhEnvioMotivo: string | null;
  rhEnviadoEm: string | null;
  rhChegouEm: string | null;
  codigoRh: string | null;
  rhSituacao: string | null;
  rhSituacaoEm: string | null;
  rhCandidato: string | null;
  rhObservacao: string | null;
  posicoes: PosicaoDTO[];
  curriculos: CurriculoDTO[];
  eventos: EventoDTO[];
}
