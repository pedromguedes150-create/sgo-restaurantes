import { describe, it, expect } from 'vitest';
import {
  DESTINOS, linhasDoTexto, montarBlocos, normalizarDestino, podeAtender, podeEnviar, proximoStatusDaSecao, statusDoPedido, textoDoPedido,
  MAX_LINHAS_POR_SETOR, MAX_CHARS_POR_LINHA,
} from '@/lib/pedidos/regras';
import { MODULES, MODULOS_INATIVOS } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';

/** PEDIDOS POR SETOR (v1.185.0) — as regras, sem banco. */
const setores = [{ id: 'a', name: 'Câmaras Frias' }, { id: 'b', name: 'Salgados' }, { id: 'c', name: 'Bebidas' }];

describe('o texto vira linhas e blocos', () => {
  it('uma linha por item: vazias fora, espaços aparados, teto de linhas e de caracteres', () => {
    expect(linhasDoTexto('  2 cxs   alcatra \n\n1 cx maminha\r\n   \n6 cupim')).toEqual(['2 cxs alcatra', '1 cx maminha', '6 cupim']);
    expect(linhasDoTexto(undefined)).toEqual([]);
    expect(linhasDoTexto(Array.from({ length: 100 }, (_, i) => `item ${i}`).join('\n'))).toHaveLength(MAX_LINHAS_POR_SETOR);
    expect(linhasDoTexto('x'.repeat(500))[0]).toHaveLength(MAX_CHARS_POR_LINHA);
  });
  it('só os setores com linha vão, na ordem do cadastro; setor desconhecido é ignorado', () => {
    const blocos = montarBlocos(setores, { c: '10 cxs pão de queijo', a: '2 requeijão\n5 presunto', b: '   ', zzz: 'nada' });
    expect(blocos).toEqual([
      { sectorId: 'a', sectorName: 'Câmaras Frias', lines: ['2 requeijão', '5 presunto'] },
      { sectorId: 'c', sectorName: 'Bebidas', lines: ['10 cxs pão de queijo'] },
    ]);
    expect(montarBlocos(setores, {})).toEqual([]);
  });
  it('destinos: CD e Fábrica, e nada além', () => {
    expect(DESTINOS.map((d) => d.key)).toEqual(['CD', 'FABRICA']);
    expect(normalizarDestino('CD')).toBe('CD');
    expect(normalizarDestino('fabrica')).toBeNull();
  });
});

describe('situação do pedido e dos blocos', () => {
  it('todos atendidos = Atendido; algum mexido = Recebido; senão Enviado', () => {
    expect(statusDoPedido(['ENVIADO', 'ENVIADO'])).toBe('ENVIADO');
    expect(statusDoPedido(['RECEBIDO', 'ENVIADO'])).toBe('RECEBIDO');
    expect(statusDoPedido(['ATENDIDO', 'ENVIADO'])).toBe('RECEBIDO');
    expect(statusDoPedido(['ATENDIDO', 'ATENDIDO'])).toBe('ATENDIDO');
    expect(statusDoPedido([])).toBe('ENVIADO');
  });
  it('receber só o que está Enviado; atender o que não está Atendido', () => {
    expect(proximoStatusDaSecao('ENVIADO', 'receber')).toBe('RECEBIDO');
    expect(proximoStatusDaSecao('RECEBIDO', 'receber')).toBeNull();
    expect(proximoStatusDaSecao('ENVIADO', 'atender')).toBe('ATENDIDO');
    expect(proximoStatusDaSecao('RECEBIDO', 'atender')).toBe('ATENDIDO');
    expect(proximoStatusDaSecao('ATENDIDO', 'atender')).toBeNull();
  });
  it('quem envia e quem atende', () => {
    expect(['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO'].every(podeEnviar)).toBe(true);
    expect(podeEnviar('SEPARATOR')).toBe(false);
    expect(podeEnviar('CASHIER')).toBe(false);
    expect(['SEPARATOR', 'ADMIN', 'CEO'].every(podeAtender)).toBe(true);
    expect(podeAtender('MANAGER')).toBe(false);
    expect(podeAtender('SUPERVISOR')).toBe(false); // decisão do Pedro: só separador/admin marcam
  });
  it('o texto do pedido, como vai para o WhatsApp', () => {
    const t = textoDoPedido({ number: 12, unitName: 'Beija Flor Centro', destino: 'CD', sentAt: '2026-11-04T13:00:00Z', createdByName: 'Ana', note: 'entregar até sexta', blocos: [{ sectorName: 'Carnes', lines: ['2 cxs alcatra', '1 cx maminha'] }, { sectorName: 'Salgados', lines: ['1 cx coxinha camarão'] }] });
    expect(t).toContain('PEDIDO Nº 12 — Beija Flor Centro → CD');
    expect(t).toContain('CARNES\n2 cxs alcatra\n1 cx maminha');
    expect(t).toContain('SALGADOS\n1 cx coxinha camarão');
    expect(t).toContain('OBSERVAÇÃO\nentregar até sexta');
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
