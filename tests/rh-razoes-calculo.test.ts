import { describe, it, expect } from 'vitest';
import { catalogoDasRazoes, conferir, resolverVinculo, formatarCnpj } from '@/lib/rh/razoes-calculo';

/**
 * Razões sociais do RH (v1.166.0). Os nomes e CNPJs abaixo são os da API real
 * em 13/10/2026 — inclusive o espaço no fim de "CENTRO DE SERVIÇOS…" e o CNPJ
 * que aparece em duas empresas.
 */
const NOMES = [
  'COMERCIAL LINS & GUEDES LTDA (NOVA UNIÃO)',
  'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA',
  'CENTRO DE SERVIÇOS BEIJA FLOR LTDA ',
  'BEIJA FLOR SERVIÇOS LTDA',
  'POSTO AVIEN LTDA',
  'COMERCIAL BF VIVENDAS BARBOSA LTDA',
];
const pessoas = [
  ...Array.from({ length: 3 }, () => ({ unidade: 'COMERCIAL LINS & GUEDES LTDA (NOVA UNIÃO)', unidade_cnpj: '05.336.082/0009-10' })),
  ...Array.from({ length: 2 }, () => ({ unidade: 'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA', unidade_cnpj: '42790781000105' })),
  { unidade: 'CENTRO DE SERVIÇOS BEIJA FLOR LTDA ', unidade_cnpj: '58517201000140' },
  { unidade: 'BEIJA FLOR SERVIÇOS LTDA', unidade_cnpj: '08799288000118' },
  { unidade: 'POSTO AVIEN LTDA', unidade_cnpj: '08799288000118' },
  { unidade: 'COMERCIAL BF VIVENDAS BARBOSA LTDA', unidade_cnpj: '' },
];
const cat = catalogoDasRazoes(NOMES, pessoas);

describe('critério obrigatório: CNPJ ou nome idêntico', () => {
  it('CNPJ com ou sem pontuação acha a razão social e grava o nome EXATO do RH', () => {
    expect(resolverVinculo('CNPJ', '42.790.781/0001-05', cat)).toEqual({ ok: true, rhName: 'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA', cnpj: '42790781000105', criterio: 'CNPJ' });
    expect(resolverVinculo('CNPJ', '42790781000105', cat).ok).toBe(true);
  });
  it('nome idêntico casa; espaço nas pontas é tolerado mas o gravado é o do RH, com o espaço', () => {
    expect(resolverVinculo('NOME', 'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA', cat)).toMatchObject({ ok: true, rhName: 'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA', criterio: 'NOME' });
    expect(resolverVinculo('NOME', 'CENTRO DE SERVIÇOS BEIJA FLOR LTDA', cat)).toMatchObject({ ok: true, rhName: 'CENTRO DE SERVIÇOS BEIJA FLOR LTDA ' });
  });
  it('nada de aproximado: acento, caixa ou pedaço do nome são recusados', () => {
    expect(resolverVinculo('NOME', 'COMERCIAL BEIJA FLOR NOVA UNIAO LTDA', cat)).toEqual({ ok: false, reason: 'NOME_NAO_IDENTICO' });
    expect(resolverVinculo('NOME', 'comercial beija flor nova união ltda', cat).ok).toBe(false);
    expect(resolverVinculo('NOME', 'BEIJA FLOR NOVA UNIÃO', cat).ok).toBe(false);
  });
  it('CNPJ de duas empresas é ambíguo e devolve as candidatas; CNPJ curto ou inexistente é recusado', () => {
    expect(resolverVinculo('CNPJ', '08.799.288/0001-18', cat)).toEqual({ ok: false, reason: 'CNPJ_AMBIGUO', candidatos: ['BEIJA FLOR SERVIÇOS LTDA', 'POSTO AVIEN LTDA'] });
    expect(resolverVinculo('CNPJ', '1234', cat)).toEqual({ ok: false, reason: 'CNPJ_INVALIDO' });
    expect(resolverVinculo('CNPJ', '11.111.111/1111-11', cat)).toEqual({ ok: false, reason: 'CNPJ_NAO_ENCONTRADO' });
    expect(resolverVinculo('NOME', '   ', cat)).toEqual({ ok: false, reason: 'VAZIO' });
  });
  it('razão social sem CNPJ no RH só liga pelo nome', () => {
    expect(resolverVinculo('NOME', 'COMERCIAL BF VIVENDAS BARBOSA LTDA', cat)).toMatchObject({ ok: true, cnpj: null });
  });
  it('formata CNPJ de 14 dígitos', () => {
    expect(formatarCnpj('42790781000105')).toBe('42.790.781/0001-05');
  });
});

describe('conferência POR UNIDADE do SGO (só o que já está cadastrado)', () => {
  const unidades = [
    /* CNPJ da unidade = o da empresa nova: a conferência sugere ligar. */
    { id: 'nu', name: 'Nova União', rhUnitName: 'COMERCIAL LINS & GUEDES LTDA (NOVA UNIÃO)', cnpj: '42.790.781/0001-05', adicionais: [] },
    { id: 'ce', name: 'Centro', rhUnitName: 'NOME QUE NAO EXISTE', cnpj: null, adicionais: [] },
    { id: 'sn', name: 'Sem Nome', rhUnitName: null, cnpj: null, adicionais: [] },
    { id: 'ok', name: 'Centro de Serviços', rhUnitName: 'CENTRO DE SERVIÇOS BEIJA FLOR LTDA ', cnpj: '58517201000140', adicionais: [] },
  ];
  const c = conferir(cat, unidades);

  it('só as unidades do SGO entram — as demais empresas do grupo (posto, serviços) não aparecem', () => {
    expect(c.unidades.map((u) => u.unitName).sort()).toEqual(['Centro', 'Centro de Serviços', 'Nova União', 'Sem Nome']);
    expect(JSON.stringify(c)).not.toContain('POSTO AVIEN');
    expect(c.totais).toEqual({ unidades: 4, ok: 1, comAlerta: 3 });
  });
  it('"Nome no RH" que não existe idêntico vem primeiro; sem nome é apontado', () => {
    expect(c.unidades[0]).toMatchObject({ unitId: 'ce', situacao: 'NOME_NAO_EXISTE', principal: { existe: false } });
    expect(c.unidades.find((u) => u.unitId === 'sn')?.situacao).toBe('SEM_NOME');
  });
  it('o CNPJ CADASTRADO na unidade aponta para a razão social que ela não lê: é a única sugestão', () => {
    expect(c.unidades.find((u) => u.unitId === 'nu')).toMatchObject({
      situacao: 'CNPJ_APONTA_OUTRA', pessoasLidas: 3,
      sugeridasPeloCnpj: [{ nome: 'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA', pessoas: 2 }],
    });
  });
  it('nome do RH com espaço no fim confere; já ligada como adicional não é sugerida de novo e soma as pessoas', () => {
    expect(c.unidades.find((u) => u.unitId === 'ok')).toMatchObject({ situacao: 'OK', pessoasLidas: 1 });
    const ligada = conferir(cat, [{ ...unidades[0], adicionais: ['COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA'] }]);
    expect(ligada.unidades[0]).toMatchObject({ situacao: 'OK', pessoasLidas: 5, sugeridasPeloCnpj: [] });
  });
  it('razão social já lida por OUTRA unidade não é sugerida', () => {
    const r = conferir(cat, [unidades[0], { id: 'x', name: 'Outra', rhUnitName: 'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA', cnpj: null, adicionais: [] }]);
    expect(r.unidades.find((u) => u.unitId === 'nu')?.sugeridasPeloCnpj).toEqual([]);
  });
});
