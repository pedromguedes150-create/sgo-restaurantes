import { describe, it, expect } from 'vitest';
import {
  DESTINOS, ROTULO_STATUS, agruparPorDestino, blocoEditavel, destinoSugeridoPeloNome, destinosDoPedido, linhasDoTexto, montarBlocos, normalizarDestino, pedidoEditavel, podeAtender, podeEnviar,
  proximoStatusDaSecao, rotuloDosDestinos, statusDoPedido, textoDoPedido, MAX_LINHAS_POR_SETOR, MAX_CHARS_POR_LINHA, type SetorParaPedido,
} from '@/lib/pedidos/regras';
import { MODULES, MODULOS_INATIVOS } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';

/** PEDIDOS POR SETOR (v1.185.0 · v1.187.0) — as regras, sem banco. */
const setores: SetorParaPedido[] = [
  { id: 'a', name: 'Câmaras Frias', destination: 'FABRICA' },
  { id: 'b', name: 'Salgados', destination: 'FABRICA' },
  { id: 'c', name: 'Bebidas', destination: 'CD' },
  { id: 'd', name: 'Almoxarifado', destination: 'ALMOXARIFADO' },
];

describe('o texto vira linhas e blocos', () => {
  it('uma linha por item: vazias fora, espaços aparados, teto de linhas e de caracteres', () => {
    expect(linhasDoTexto('  2 cxs   alcatra \n\n1 cx maminha\r\n   \n6 cupim')).toEqual(['2 cxs alcatra', '1 cx maminha', '6 cupim']);
    expect(linhasDoTexto(undefined)).toEqual([]);
    expect(linhasDoTexto(Array.from({ length: 100 }, (_, i) => `item ${i}`).join('\n'))).toHaveLength(MAX_LINHAS_POR_SETOR);
    expect(linhasDoTexto('x'.repeat(500))[0]).toHaveLength(MAX_CHARS_POR_LINHA);
  });
  it('só os setores com linha vão, na ordem do cadastro, cada um com o destino do setor; setor desconhecido é ignorado', () => {
    const blocos = montarBlocos(setores, { c: '10 cxs pão de queijo', a: '2 requeijão\n5 presunto', b: '   ', zzz: 'nada' });
    expect(blocos).toEqual([
      { sectorId: 'a', sectorName: 'Câmaras Frias', destination: 'FABRICA', lines: ['2 requeijão', '5 presunto'] },
      { sectorId: 'c', sectorName: 'Bebidas', destination: 'CD', lines: ['10 cxs pão de queijo'] },
    ]);
    expect(montarBlocos(setores, {})).toEqual([]);
  });
});

describe('destino por setor (v1.187.0)', () => {
  it('três destinos, na ordem Fábrica · CD · Almoxarifado', () => {
    expect(DESTINOS.map((d) => d.key)).toEqual(['FABRICA', 'CD', 'ALMOXARIFADO']);
    expect(normalizarDestino('ALMOXARIFADO')).toBe('ALMOXARIFADO');
    expect(normalizarDestino('fabrica')).toBeNull();
  });
  it('o nome do setor sugere o destino — a tabela do Pedro', () => {
    const esperado: Record<string, string> = {
      'CÂMARAS FRIAS': 'FABRICA', SALGADOS: 'FABRICA', CONFEITARIA: 'FABRICA', CARNES: 'FABRICA', 'Carnes Churrasco': 'FABRICA',
      DESCARTÁVEIS: 'CD', BEBIDAS: 'CD', SECOS: 'CD', BOMBONIERE: 'CD', 'Bomboniere Diversos': 'CD', Refrigerados: 'CD',
      ALMOXERIFADO: 'ALMOXARIFADO', Almoxarifado: 'ALMOXARIFADO',
    };
    for (const [nome, destino] of Object.entries(esperado)) expect(destinoSugeridoPeloNome(nome), nome).toBe(destino);
  });
  it('agrupa por destino na ordem fixa e só com grupo cheio; os destinos de um pedido saem sem repetir', () => {
    expect(agruparPorDestino(setores).map((g) => [g.destino, g.setores.map((s) => s.id)])).toEqual([['FABRICA', ['a', 'b']], ['CD', ['c']], ['ALMOXARIFADO', ['d']]]);
    expect(agruparPorDestino([setores[2]]).map((g) => g.destino)).toEqual(['CD']);
    expect(destinosDoPedido([{ destination: 'CD' }, { destination: 'FABRICA' }, { destination: 'CD' }])).toEqual(['FABRICA', 'CD']);
    expect(rotuloDosDestinos([{ destination: 'ALMOXARIFADO' }, { destination: 'CD' }])).toBe('CD · Almoxarifado');
    expect(rotuloDosDestinos([])).toBe('');
  });
});

describe('situação do pedido e dos blocos', () => {
  it('todos atendidos = Atendido; algum mexido = Em separação; senão Enviado', () => {
    expect(statusDoPedido(['ENVIADO', 'ENVIADO'])).toBe('ENVIADO');
    expect(statusDoPedido(['EM_SEPARACAO', 'ENVIADO'])).toBe('EM_SEPARACAO');
    expect(statusDoPedido(['ATENDIDO', 'ENVIADO'])).toBe('EM_SEPARACAO');
    expect(statusDoPedido(['ATENDIDO', 'ATENDIDO'])).toBe('ATENDIDO');
    expect(statusDoPedido([])).toBe('ENVIADO');
  });
  it('separar só o que está Enviado; atender o que não está Atendido', () => {
    expect(proximoStatusDaSecao('ENVIADO', 'separar')).toBe('EM_SEPARACAO');
    expect(proximoStatusDaSecao('EM_SEPARACAO', 'separar')).toBeNull();
    expect(proximoStatusDaSecao('ENVIADO', 'atender')).toBe('ATENDIDO');
    expect(proximoStatusDaSecao('EM_SEPARACAO', 'atender')).toBe('ATENDIDO');
    expect(proximoStatusDaSecao('ATENDIDO', 'atender')).toBeNull();
  });
  it('v1.188.0: o gerente edita o bloco só enquanto Enviado; o pedido só fecha quando todos atenderam', () => {
    expect(blocoEditavel('ENVIADO')).toBe(true);
    expect(blocoEditavel('EM_SEPARACAO')).toBe(false);
    expect(blocoEditavel('ATENDIDO')).toBe(false);
    expect(pedidoEditavel('ENVIADO')).toBe(true);
    expect(pedidoEditavel('EM_SEPARACAO')).toBe(true);
    expect(pedidoEditavel('ATENDIDO')).toBe(false);
    expect(ROTULO_STATUS.EM_SEPARACAO).toBe('Em separação');
  });
  it('quem envia e quem atende', () => {
    expect(['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO'].every(podeEnviar)).toBe(true);
    expect(podeEnviar('SEPARATOR')).toBe(false);
    expect(podeEnviar('CASHIER')).toBe(false);
    expect(['SEPARATOR', 'ADMIN', 'CEO'].every(podeAtender)).toBe(true);
    expect(podeAtender('MANAGER')).toBe(false);
    expect(podeAtender('SUPERVISOR')).toBe(false); // decisão do Pedro: só separador/admin marcam
  });
  it('o texto do pedido, como vai para o WhatsApp: um título por destino', () => {
    const t = textoDoPedido({ number: 12, unitName: 'Beija Flor Centro', sentAt: '2026-11-04T13:00:00Z', createdByName: 'Ana', note: 'entregar até sexta', blocos: [
      { sectorName: 'Bebidas', destination: 'CD', lines: ['6 cx coca'] },
      { sectorName: 'Carnes', destination: 'FABRICA', lines: ['2 cxs alcatra', '1 cx maminha'] },
      { sectorName: 'Salgados', destination: 'FABRICA', lines: ['1 cx coxinha camarão'] },
    ] });
    expect(t).toContain('PEDIDO Nº 12 — Beija Flor Centro');
    expect(t).not.toContain('→');
    expect(t.indexOf('▶ FÁBRICA')).toBeLessThan(t.indexOf('▶ CD'));
    expect(t).toContain('▶ FÁBRICA\nCARNES\n2 cxs alcatra\n1 cx maminha\n\nSALGADOS\n1 cx coxinha camarão');
    expect(t).toContain('▶ CD\nBEBIDAS\n6 cx coca');
    expect(t).toContain('OBSERVAÇÃO\nentregar até sexta');
    expect(textoDoPedido({ number: 1, unitName: 'X', sentAt: '2026-11-04T13:00:00Z', createdByName: 'Ana', note: 'só isto', blocos: [] })).toContain('OBSERVAÇÃO\nsó isto');
  });
});

describe('os módulos na matriz e no menu', () => {
  it('ORDERS (quem pede) e ORDERS_INBOX (quem recebe) existem, têm tela e lugar no menu; Pedidos Internos ficou INATIVO', () => {
    expect(MODULES.find((m) => m.key === 'ORDERS')).toMatchObject({ nav: '/modulos/pedidos' });
    expect(MODULES.find((m) => m.key === 'ORDERS_INBOX')).toMatchObject({ nav: '/modulos/pedidos/recebidos' });
    expect(MODULES.find((m) => m.key === 'ORDERS_INBOX')?.parent).toBeUndefined(); // sem pai de propósito: o separador não tem ORDERS
    // os padrões de perfil (quem pede × quem recebe) são conferidos pelo teste de integração via effectivePermissions
    const chavesDoMenu = AREAS.flatMap((a) => a.colunas.flatMap((c) => c.keys));
    expect(chavesDoMenu).toContain('ORDERS');
    expect(chavesDoMenu).toContain('ORDERS_INBOX');
    expect(MODULOS_INATIVOS.has('PRODUCTS')).toBe(true);
    expect(MODULOS_INATIVOS.has('INVENTORY')).toBe(true);
    expect(MODULOS_INATIVOS.has('PRODUCT_SEPARATION')).toBe(false); // a separação dos pedidos antigos segue
  });
});
