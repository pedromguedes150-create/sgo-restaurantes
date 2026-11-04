/**
 * PEDIDOS POR SETOR (v1.185.0) — as regras, sem banco.
 *
 * O pedido é uma LISTA ESCRITA, como um e-mail: o gerente escolhe o destino
 * (CD ou Fábrica) e escreve, por setor, uma linha por item — "2 cxs alcatra".
 * Sem catálogo, sem código de barras, sem conversão de embalagem: é texto. O
 * que o SGO acrescenta é o caminho (cada bloco chega ao separador do setor),
 * a situação (Enviado · Recebido · Atendido, por setor e pelo pedido inteiro)
 * e o histórico. Os "Pedidos Internos" por produto continuam existindo, só
 * saem do caminho do gerente (MODULOS_INATIVOS).
 */

export type Destino = 'CD' | 'FABRICA';
export const DESTINOS: { key: Destino; rotulo: string; curto: string }[] = [
  { key: 'CD', rotulo: 'Centro de Distribuição (CD)', curto: 'CD' },
  { key: 'FABRICA', rotulo: 'Fábrica', curto: 'Fábrica' },
];
export const normalizarDestino = (v: unknown): Destino | null => (v === 'CD' || v === 'FABRICA' ? v : null);
export const rotuloDoDestino = (d: Destino) => DESTINOS.find((x) => x.key === d)?.curto ?? d;

export type StatusDoPedido = 'ENVIADO' | 'RECEBIDO' | 'ATENDIDO';
export const ROTULO_STATUS: Record<StatusDoPedido, string> = { ENVIADO: 'Enviado', RECEBIDO: 'Recebido', ATENDIDO: 'Atendido' };
export const TOM_STATUS: Record<StatusDoPedido, 'info' | 'warning' | 'success'> = { ENVIADO: 'info', RECEBIDO: 'warning', ATENDIDO: 'success' };

/** Quem envia: a operação da unidade (o separador e o caixa não pedem). */
export const PODE_ENVIAR = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO'] as const;
export const podeEnviar = (role: string) => (PODE_ENVIAR as readonly string[]).includes(role);
/** Quem marca Recebido/Atendido: o separador do setor e o Admin/CEO (decisão do Pedro, 04/11/2026). */
export const PODE_ATENDER = ['SEPARATOR', 'ADMIN', 'CEO'] as const;
export const podeAtender = (role: string) => (PODE_ATENDER as readonly string[]).includes(role);
export const veTudo = (role: string) => role === 'ADMIN' || role === 'CEO';

export const MAX_LINHAS_POR_SETOR = 80;
export const MAX_CHARS_POR_LINHA = 200;
export const MAX_OBSERVACAO = 500;

/** O texto de um setor vira linhas: uma por item, sem vazias, aparadas, com teto. */
export function linhasDoTexto(texto: unknown): string[] {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .map((l) => l.slice(0, MAX_CHARS_POR_LINHA))
    .slice(0, MAX_LINHAS_POR_SETOR);
}

export interface SetorParaPedido { id: string; name: string }
export interface BlocoDoPedido { sectorId: string; sectorName: string; lines: string[] }

/** Os blocos que vão no pedido: só os setores com alguma linha, na ordem do cadastro; setor desconhecido é ignorado. */
export function montarBlocos(setores: SetorParaPedido[], textos: Record<string, unknown>): BlocoDoPedido[] {
  const out: BlocoDoPedido[] = [];
  for (const s of setores) {
    const lines = linhasDoTexto(textos?.[s.id]);
    if (lines.length > 0) out.push({ sectorId: s.id, sectorName: s.name, lines });
  }
  return out;
}

/** A situação do pedido deriva dos setores: todos atendidos = Atendido; algum mexido = Recebido; senão Enviado. */
export function statusDoPedido(secoes: StatusDoPedido[]): StatusDoPedido {
  if (secoes.length > 0 && secoes.every((s) => s === 'ATENDIDO')) return 'ATENDIDO';
  if (secoes.some((s) => s !== 'ENVIADO')) return 'RECEBIDO';
  return 'ENVIADO';
}

export type AcaoNaSecao = 'receber' | 'atender';
/** Receber só o que está Enviado; atender o que está Enviado ou Recebido. Nulo = nada a fazer. */
export function proximoStatusDaSecao(atual: StatusDoPedido, acao: AcaoNaSecao): StatusDoPedido | null {
  if (acao === 'receber') return atual === 'ENVIADO' ? 'RECEBIDO' : null;
  if (acao === 'atender') return atual === 'ATENDIDO' ? null : 'ATENDIDO';
  return null;
}

export interface PedidoParaTexto { number: number; unitName: string; destino: Destino; sentAt: Date | string; createdByName: string; note?: string | null; blocos: { sectorName: string; lines: string[] }[] }
/** O pedido como texto corrido — o que se copia para o WhatsApp ou se imprime. */
export function textoDoPedido(p: PedidoParaTexto): string {
  const quando = new Date(p.sentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cab = [`PEDIDO Nº ${p.number} — ${p.unitName} → ${rotuloDoDestino(p.destino)}`, `${quando} · ${p.createdByName}`];
  const blocos = p.blocos.map((b) => [b.sectorName.toUpperCase(), ...b.lines].join('\n'));
  const obs = p.note?.trim() ? [`OBSERVAÇÃO\n${p.note.trim()}`] : [];
  return [...cab, '', ...blocos.flatMap((b) => [b, '']), ...obs].join('\n').trim();
}

export const dataBR = (d: Date | string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
