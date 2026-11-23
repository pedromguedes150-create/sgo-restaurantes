import { describe, it, expect } from 'vitest';
import {
  ITENS_PADRAO, PODE_AUDITAR, PODE_CONTAR, MOTIVO_MIN,
  normalizarQuantidade, nomeValido, faltamParaEnviar, totalDeUtensilios, diferenca, contarDivergencias, proximoStatus, motivoValido, retrato,
  LOCAL_PADRAO, normalizarLocal, locaisDaUnidade, rotuloDaSituacao,
} from '@/lib/utensilios/regras';
import { compararContagens, relacaoPorUnidade, seriesPorLocal, tendencia, type Contagem } from '@/lib/utensilios/evolucao';

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

describe('v1.219.0 — local da contagem e envio sem auditoria', () => {
  it('local vazio é o padrão; grafia diferente cai no que já existe; nome curto demais não serve', () => {
    expect(normalizarLocal('')).toBe(LOCAL_PADRAO);
    expect(normalizarLocal(undefined)).toBe('Restaurante');
    expect(normalizarLocal('  LANCHONETE ')).toBe('Lanchonete');
    expect(normalizarLocal('pizzaria', ['Pizzaria'])).toBe('Pizzaria');
    expect(normalizarLocal('Bar  da  piscina')).toBe('Bar da piscina');
    expect(normalizarLocal('x')).toBeNull();
    expect(normalizarLocal('a'.repeat(41))).toBeNull();
  });
  it('a tela oferece os sugeridos mais os já usados, sem repetir', () => {
    expect(locaisDaUnidade(['lanchonete', 'Pizzaria'])).toEqual(['Restaurante', 'Lanchonete', 'Pizzaria']);
  });
  it('sem auditoria o envio conclui; com auditoria fica pendente; aprovado sem auditor é "Concluído"', () => {
    expect(proximoStatus('RASCUNHO', 'enviar', false)).toBe('APROVADO');
    expect(proximoStatus('RASCUNHO', 'enviar', true)).toBe('PENDENTE');
    expect(proximoStatus('APROVADO', 'enviar', false)).toBeNull();
    expect(rotuloDaSituacao({ status: 'APROVADO', auditorName: null })).toBe('Concluído');
    expect(rotuloDaSituacao({ status: 'APROVADO', auditorName: 'Daniel' })).toBe('Aprovado');
    expect(rotuloDaSituacao({ status: 'PENDENTE' })).toBe('Pendente de auditoria');
  });
});

describe('v1.219.0 — evolução: quebras, sobras e a relação por local', () => {
  const c = (id: string, local: string, dia: string, itens: [string, number | null][], unitId = 'u1'): Contagem => ({
    id, unitId, unidade: 'Jardim', local, quando: new Date(`${dia}T12:00:00Z`), managerName: 'Geovana', itens: itens.map(([name, quantity]) => ({ name, quantity })),
  });
  const out = c('a', 'Restaurante', '2026-10-23', [['Pratos', 100], ['Garfos', 80], ['Cubas', 10]]);
  const nov = c('b', 'Restaurante', '2026-11-20', [['Pratos', 90], ['garfos', 85], ['Jarras', 4]]);

  it('quebra = o que diminuiu, sobra = o que aumentou; item só de um lado não entra na diferença', () => {
    const r = compararContagens(nov, out);
    expect(r.quebras).toBe(10);
    expect(r.sobras).toBe(5);
    expect(r.saldo).toBe(-5);
    expect(r.totalAtual).toBe(179);
    expect(r.totalAnterior).toBe(190);
    expect(r.linhas.find((l) => l.name === 'Jarras')).toMatchObject({ atual: 4, anterior: null, diff: null });
    expect(r.linhas.find((l) => l.name === 'Cubas')).toMatchObject({ atual: null, anterior: 10, diff: null });
  });
  it('primeira contagem não tem quebras nem sobras', () => {
    const r = compararContagens(out, null);
    expect(r).toMatchObject({ quebras: 0, sobras: 0, totalAnterior: null });
    expect(r.linhas.every((l) => l.diff === null)).toBe(true);
  });
  it('uma série por unidade+local, em ordem; a lanchonete não se mistura com o restaurante', () => {
    const dez = c('d', 'Restaurante', '2026-12-20', [['Pratos', 70], ['Garfos', 85]]);
    const lan = c('l', 'lanchonete', '2026-11-20', [['Pratos', 12]]);
    const s = seriesPorLocal([dez, lan, nov, out]);
    expect(s.map((x) => x.local)).toEqual(['lanchonete', 'Restaurante']);
    const rest = s[1];
    expect(rest.pontos.map((p) => p.id)).toEqual(['a', 'b', 'd']);
    expect(rest.pontos.map((p) => p.quebras)).toEqual([null, 10, 20]);
    expect(rest.comparacao.quebras).toBe(20);
    expect(rest.quebrasAntes).toBe(10);
    expect(tendencia(rest.comparacao.quebras, rest.quebrasAntes)).toBe('maior');
    expect(tendencia(5, 5)).toBe('igual');
    expect(tendencia(5, null)).toBeNull();
    expect(s[0].anterior).toBeNull();
  });
  it('a relação do PDF tem uma coluna por local com a contagem mais recente; quem não tem o item fica vazio', () => {
    const lan = c('l', 'Lanchonete', '2026-11-20', [['Pratos', 12], ['Copos', 30]]);
    const [u] = relacaoPorUnidade([out, nov, lan]);
    expect(u.colunas.map((x) => x.local)).toEqual(['Lanchonete', 'Restaurante']);
    expect(u.linhas.find((l) => l.name === 'Pratos')).toMatchObject({ porLocal: [12, 90], total: 102 });
    expect(u.linhas.find((l) => l.name === 'Copos')).toMatchObject({ porLocal: [30, null], total: 30 });
    expect(u.total).toBe(42 + 179);
  });
});
