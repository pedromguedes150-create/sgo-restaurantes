import { describe, it, expect } from 'vitest';
import {
  ITENS_PADRAO, PODE_AUDITAR, PODE_CONTAR, MOTIVO_MIN,
  normalizarQuantidade, nomeValido, faltamParaEnviar, totalDeUtensilios, diferenca, contarDivergencias, proximoStatus, motivoValido, retrato,
} from '@/lib/utensilios/regras';

/** INVENTÁRIO DE UTENSÍLIOS (v1.177.0) — as regras puras. */

describe('lista padrão e perfis', () => {
  it('a semente tem os 15 itens do pedido do Pedro, sem repetição', () => {
    expect(ITENS_PADRAO).toHaveLength(15);
    expect(new Set(ITENS_PADRAO).size).toBe(15);
    expect(ITENS_PADRAO).toContain('Pratos — Cliente');
    expect(ITENS_PADRAO).toContain('Jarras — 1/2 litro');
  });
  it('Coordenador e Supervisor auditam igual (decisão do Pedro); o gerente conta mas não audita', () => {
    expect(PODE_AUDITAR.has('SUPERVISOR')).toBe(true);
    expect(PODE_AUDITAR.has('COORDINATOR')).toBe(true);
    expect(PODE_AUDITAR.has('MANAGER')).toBe(false);
    expect(PODE_CONTAR.has('MANAGER')).toBe(true);
    expect(PODE_CONTAR.has('CASHIER')).toBe(false);
  });
});

describe('normalizarQuantidade — zero é zero, vazio é "não conferido"', () => {
  it('vazio/nulo vira nulo (não conferido), nunca zero', () => {
    expect(normalizarQuantidade('')).toEqual({ ok: true, valor: null });
    expect(normalizarQuantidade(null)).toEqual({ ok: true, valor: null });
    expect(normalizarQuantidade(undefined)).toEqual({ ok: true, valor: null });
  });
  it('aceita inteiros de 0 em diante, em número ou texto', () => {
    expect(normalizarQuantidade(0)).toEqual({ ok: true, valor: 0 });
    expect(normalizarQuantidade('0')).toEqual({ ok: true, valor: 0 });
    expect(normalizarQuantidade(' 120 ')).toEqual({ ok: true, valor: 120 });
  });
  it('recusa negativo, fração, texto e acima do teto', () => {
    for (const v of ['-1', '1,5', '1.5', 'abc', 1_000_000, Infinity]) expect(normalizarQuantidade(v).ok, String(v)).toBe(false);
  });
});

describe('nomeValido — item personalizado', () => {
  it('normaliza espaços e recusa repetido sem acento/caixa', () => {
    expect(nomeValido('  Travessas   grandes ', ['Pratos'])).toEqual({ ok: true, nome: 'Travessas grandes' });
    expect(nomeValido('xicaras g', ['Xícaras G']).ok).toBe(false);
    expect(nomeValido('A', []).ok).toBe(false);
  });
});

describe('envio e totais', () => {
  const itens = [
    { name: 'Pratos', quantity: 120, custom: false },
    { name: 'Copos', quantity: 0, custom: false },
    { name: 'Facas', quantity: null, custom: false },
    { name: 'Travessas', quantity: null, custom: true },
  ];
  it('faltamParaEnviar nomeia todo item sem quantidade — zero NÃO falta, personalizado conta', () => {
    expect(faltamParaEnviar(itens)).toEqual(['Facas', 'Travessas']);
    expect(faltamParaEnviar(itens.map((i) => ({ ...i, quantity: i.quantity ?? 0 })))).toEqual([]);
  });
  it('total soma só o informado', () => {
    expect(totalDeUtensilios(itens)).toBe(120);
  });
  it('retrato guarda nome → quantidade, marcando o adicionado', () => {
    expect(retrato(itens)).toEqual({ Pratos: 120, Copos: 0, Facas: null, 'Travessas (adicionado)': null });
  });
});

describe('auditoria — diferença e divergências', () => {
  it('diferença = conferido − informado; nula quando o auditor não contou', () => {
    expect(diferenca(100, 98)).toBe(-2);
    expect(diferenca(100, 103)).toBe(3);
    expect(diferenca(100, null)).toBeNull();
    expect(diferenca(null, 5)).toBeNull();
  });
  it('contarDivergencias só olha os conferidos', () => {
    expect(contarDivergencias([
      { quantity: 10, auditedQuantity: 10 }, { quantity: 10, auditedQuantity: 8 }, { quantity: 10, auditedQuantity: null },
    ])).toEqual({ conferidos: 2, divergentes: 1 });
  });
});

describe('proximoStatus — a única tabela de transições', () => {
  it('enviar sai de Rascunho ou Em correção; devolver e aprovar só de Pendente', () => {
    expect(proximoStatus('RASCUNHO', 'enviar')).toBe('PENDENTE');
    expect(proximoStatus('EM_CORRECAO', 'enviar')).toBe('PENDENTE');
    expect(proximoStatus('PENDENTE', 'enviar')).toBeNull();
    expect(proximoStatus('APROVADO', 'enviar')).toBeNull();
    expect(proximoStatus('PENDENTE', 'devolver')).toBe('EM_CORRECAO');
    expect(proximoStatus('PENDENTE', 'aprovar')).toBe('APROVADO');
    expect(proximoStatus('APROVADO', 'devolver')).toBeNull();
    expect(proximoStatus('RASCUNHO', 'aprovar')).toBeNull();
  });
  it('motivo da devolução precisa de 5 caracteres', () => {
    expect(MOTIVO_MIN).toBe(5);
    expect(motivoValido('  ok ')).toBe(false);
    expect(motivoValido('Faltou contar as cubas')).toBe(true);
    expect(motivoValido(null)).toBe(false);
  });
});
