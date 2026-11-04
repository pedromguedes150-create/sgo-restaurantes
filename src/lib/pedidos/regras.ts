/**
 * PEDIDOS POR SETOR (v1.185.0 · v1.187.0) — as regras, sem banco.
 *
 * O pedido é uma LISTA ESCRITA, como um e-mail: o gerente escreve, por setor,
 * uma linha por item — "2 cxs alcatra". Sem catálogo, sem código de barras,
 * sem conversão de embalagem: é texto. O que o SGO acrescenta é o caminho
 * (cada bloco chega ao separador do setor), a situação (Enviado · Recebido ·
 * Atendido, por setor e pelo pedido inteiro) e o histórico.
 *
 * v1.187.0 (decisão do Pedro, 04/11): o DESTINO não se escolhe — é DO SETOR
 * (Fábrica · CD · Almoxarifado, no cadastro de Setores do CD). O pedido é UM
 * só, e cada bloco vai congelado com o destino do setor no dia. Também saiu a
 * obrigação de ter ao menos um item: o pedido pode ir só com a observação.
 */

export type Destino = 'CD' | 'FABRICA' | 'ALMOXARIFADO';
export const DESTINOS: { key: Destino; rotulo: string; curto: string }[] = [
  { key: 'FABRICA', rotulo: 'Fábrica', curto: 'Fábrica' },
  { key: 'CD', rotulo: 'Centro de Distribuição (CD)', curto: 'CD' },
  { key: 'ALMOXARIFADO', rotulo: 'Almoxarifado', curto: 'Almoxarifado' },
];
export const normalizarDestino = (v: unknown): Destino | null => (v === 'CD' || v === 'FABRICA' || v === 'ALMOXARIFADO' ? v : null);
export const rotuloDoDestino = (d: Destino) => DESTINOS.find((x) => x.key === d)?.curto ?? d;
const ORDEM_DESTINO: Record<Destino, number> = { FABRICA: 0, CD: 1, ALMOXARIFADO: 2 };

/**
 * O destino que o NOME do setor sugere (a tabela do Pedro, 04/11): Câmaras
 * Frias, Salgados, Confeitaria e Carnes → Fábrica; Almoxarifado → Almoxarifado;
 * o resto (Descartáveis, Bebidas, Secos, Bombonière…) → CD. Vale para o setor
 * criado sem destino informado; o Admin corrige no cadastro quando for outro.
 */
export function destinoSugeridoPeloNome(nome: string): Destino {
  const n = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/ALMOX/.test(n)) return 'ALMOXARIFADO';
  if (/CAMARA|SALGAD|CONFEIT|CARNE|CHURRAS/.test(n)) return 'FABRICA';
  return 'CD';
}

/**
 * v1.188.0 (decisão do Pedro): "Recebido" virou EM SEPARAÇÃO — é o momento em que o separador pega a
 * lista, e a partir dele o gerente não altera mais aquele bloco (`blocoEditavel`).
 */
export type StatusDoPedido = 'ENVIADO' | 'EM_SEPARACAO' | 'ATENDIDO';
export const ROTULO_STATUS: Record<StatusDoPedido, string> = { ENVIADO: 'Enviado', EM_SEPARACAO: 'Em separação', ATENDIDO: 'Atendido' };
export const TOM_STATUS: Record<StatusDoPedido, 'info' | 'warning' | 'success'> = { ENVIADO: 'info', EM_SEPARACAO: 'warning', ATENDIDO: 'success' };
/** O gerente só altera o bloco que ainda está Enviado: em separação ou atendido, o separador já está com a lista na mão. */
export const blocoEditavel = (status: StatusDoPedido) => status === 'ENVIADO';
/** O pedido inteiro só fecha para edição quando todos os setores atenderam (ainda dá para acrescentar setor e mudar a observação antes disso). */
export const pedidoEditavel = (status: StatusDoPedido) => status !== 'ATENDIDO';

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

export interface SetorParaPedido { id: string; name: string; destination: Destino }
export interface BlocoDoPedido { sectorId: string; sectorName: string; destination: Destino; lines: string[] }

/** Os blocos que vão no pedido: só os setores com alguma linha, na ordem do cadastro; setor desconhecido é ignorado. */
export function montarBlocos(setores: SetorParaPedido[], textos: Record<string, unknown>): BlocoDoPedido[] {
  const out: BlocoDoPedido[] = [];
  for (const s of setores) {
    const lines = linhasDoTexto(textos?.[s.id]);
    if (lines.length > 0) out.push({ sectorId: s.id, sectorName: s.name, destination: s.destination, lines });
  }
  return out;
}

/** Os setores agrupados por destino, na ordem Fábrica · CD · Almoxarifado — é como a folha de pedido se organiza. Grupo vazio não aparece. */
export function agruparPorDestino<T extends { destination: Destino }>(setores: T[]): { destino: Destino; rotulo: string; setores: T[] }[] {
  return DESTINOS.map((d) => ({ destino: d.key, rotulo: d.curto, setores: setores.filter((s) => s.destination === d.key) })).filter((g) => g.setores.length > 0);
}

/** Os destinos presentes num pedido (sem repetir), na ordem fixa. */
export function destinosDoPedido(secoes: { destination: Destino }[]): Destino[] {
  return [...new Set(secoes.map((s) => s.destination))].sort((a, b) => ORDEM_DESTINO[a] - ORDEM_DESTINO[b]);
}
export const rotuloDosDestinos = (secoes: { destination: Destino }[]) => destinosDoPedido(secoes).map(rotuloDoDestino).join(' · ');

/** A situação do pedido deriva dos setores: todos atendidos = Atendido; algum mexido = Em separação; senão Enviado. */
export function statusDoPedido(secoes: StatusDoPedido[]): StatusDoPedido {
  if (secoes.length > 0 && secoes.every((s) => s === 'ATENDIDO')) return 'ATENDIDO';
  if (secoes.some((s) => s !== 'ENVIADO')) return 'EM_SEPARACAO';
  return 'ENVIADO';
}

export type AcaoNaSecao = 'separar' | 'atender';
/** Separar só o que está Enviado; atender o que está Enviado ou Em separação. Nulo = nada a fazer. */
export function proximoStatusDaSecao(atual: StatusDoPedido, acao: AcaoNaSecao): StatusDoPedido | null {
  if (acao === 'separar') return atual === 'ENVIADO' ? 'EM_SEPARACAO' : null;
  if (acao === 'atender') return atual === 'ATENDIDO' ? null : 'ATENDIDO';
  return null;
}

export interface PedidoParaTexto { number: number; unitName: string; sentAt: Date | string; createdByName: string; note?: string | null; blocos: { sectorName: string; destination: Destino; lines: string[] }[] }
/** O pedido como texto corrido — o que se copia para o WhatsApp ou se imprime: um título por destino, os setores embaixo. */
export function textoDoPedido(p: PedidoParaTexto): string {
  const quando = new Date(p.sentAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cab = [`PEDIDO Nº ${p.number} — ${p.unitName}`, `${quando} · ${p.createdByName}`];
  const grupos = agruparPorDestino(p.blocos).map((g) => [`▶ ${g.rotulo.toUpperCase()}`, ...g.setores.flatMap((b) => [b.sectorName.toUpperCase(), ...b.lines, ''])].join('\n').trimEnd());
  const obs = p.note?.trim() ? [`OBSERVAÇÃO\n${p.note.trim()}`] : [];
  return [...cab, '', ...grupos.flatMap((g) => [g, '']), ...obs].join('\n').trim();
}

export const dataBR = (d: Date | string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
