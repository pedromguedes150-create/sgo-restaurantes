import { describe, it, expect } from 'vitest';
import {
  CRITERIOS_GERAIS, MODELOS_INICIAIS, PESO_ESPECIFICOS, PESO_GERAIS, assinaturaDosCriterios, calcularNota, classificar, lerCriterios, lerRespostas,
  modeloDoCargo, montarCriterios, normalizarCargo, notaDaAvaliacao, pesosEfetivos, quemPodeAvaliar, validarRespostas,
} from '@/lib/people/avaliacao-calculo';

/**
 * Avaliação por FUNÇÃO (v1.161.0) — as regras puras da especificação do Pedro
 * (08/10/2026): 4 gerais 40% + 4 específicos 60%, média ponderada, N/A com
 * redistribuição proporcional, justificativa em 1 e 2, classificação por faixa,
 * cargo do RH normalizado → modelo, quem avalia quem.
 */
const modelo = montarCriterios([{ label: 'Qualidade do preparo', weight: 20 }, { label: 'Produtividade', weight: 15 }, { label: 'Cumprimento de POPs', weight: 15 }, { label: 'Controle de desperdícios', weight: 10 }]);
const criterios = modelo.ok ? modelo.criterios : [];
const todos = (n: number) => criterios.map((c) => ({ key: c.key, score: n }));

describe('montarCriterios', () => {
  it('8 critérios: 4 gerais fixos (40%) + 4 específicos (60%) = 100%', () => {
    expect(modelo.ok).toBe(true);
    expect(criterios).toHaveLength(8);
    expect(criterios.filter((c) => c.group === 'GERAL').reduce((s, c) => s + c.weight, 0)).toBe(PESO_GERAIS);
    expect(criterios.filter((c) => c.group === 'ESPECIFICO').reduce((s, c) => s + c.weight, 0)).toBe(PESO_ESPECIFICOS);
    expect(criterios.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(criterios.map((c) => c.key)).toContain('qualidade-do-preparo');
  });
  it('recusa pesos que não somam 60, menos de 4 critérios e rótulo vazio', () => {
    expect(montarCriterios([{ label: 'a', weight: 20 }, { label: 'b', weight: 20 }, { label: 'c', weight: 20 }, { label: 'd', weight: 20 }])).toMatchObject({ ok: false, erro: expect.stringContaining('somam 80%') });
    expect(montarCriterios([{ label: 'a', weight: 60 }])).toMatchObject({ ok: false });
    expect(montarCriterios([{ label: ' ', weight: 20 }, { label: 'b', weight: 15 }, { label: 'c', weight: 15 }, { label: 'd', weight: 10 }])).toMatchObject({ ok: false });
  });
  it('rótulos iguais ganham chaves diferentes; chave igual a um geral também', () => {
    const m = montarCriterios([{ label: 'Produtividade', weight: 20 }, { label: 'Produtividade', weight: 15 }, { label: 'Trabalho em equipe', weight: 15 }, { label: 'x', weight: 10 }]);
    expect(m.ok && new Set(m.criterios.map((c) => c.key)).size).toBe(8);
  });
  it('assinatura canônica muda só quando critério ou peso muda', () => {
    const a = montarCriterios([{ label: 'A', weight: 20 }, { label: 'B', weight: 15 }, { label: 'C', weight: 15 }, { label: 'D', weight: 10 }]);
    const b = montarCriterios([{ label: 'A', weight: 20 }, { label: 'B', weight: 15 }, { label: 'C', weight: 15 }, { label: 'D', weight: 10 }]);
    const c = montarCriterios([{ label: 'A', weight: 25 }, { label: 'B', weight: 15 }, { label: 'C', weight: 10 }, { label: 'D', weight: 10 }]);
    expect(a.ok && b.ok && assinaturaDosCriterios(a.criterios)).toBe(b.ok && assinaturaDosCriterios(b.criterios));
    expect(a.ok && c.ok && assinaturaDosCriterios(a.criterios)).not.toBe(c.ok && assinaturaDosCriterios(c.criterios));
    expect(lerCriterios(JSON.parse(JSON.stringify(criterios)))).toEqual(criterios);
  });
});

describe('calcularNota', () => {
  it('é a média PONDERADA: 5 nos específicos pesa mais que 5 nos gerais', () => {
    const gerais5 = criterios.map((c) => ({ key: c.key, score: c.group === 'GERAL' ? 5 : 3 }));
    const esp5 = criterios.map((c) => ({ key: c.key, score: c.group === 'ESPECIFICO' ? 5 : 3 }));
    expect(calcularNota(criterios, gerais5).nota).toBe(3.8); // 3 + 2×0,40
    expect(calcularNota(criterios, esp5).nota).toBe(4.2); // 3 + 2×0,60
    expect(calcularNota(criterios, todos(4))).toEqual({ nota: 4, pesoAplicado: 100, classificacao: 'BOM' });
  });
  it('N/A sai do denominador (redistribuição proporcional) e tudo N/A não tem nota', () => {
    // "Controle de desperdícios" (10%) N/A: nota = Σ(5×90)/90 = 5 quando os demais são 5
    const r = criterios.map((c) => ({ key: c.key, score: c.key === 'controle-de-desperdicios' ? null : 5, justification: 'x' }));
    expect(calcularNota(criterios, r)).toEqual({ nota: 5, pesoAplicado: 90, classificacao: 'EXCELENTE' });
    // os 4 gerais em 3 e os específicos em 5, com 1 específico (20%) N/A: (3×40 + 5×40)/80 = 4
    const r2 = criterios.map((c) => ({ key: c.key, score: c.key === 'qualidade-do-preparo' ? null : c.group === 'GERAL' ? 3 : 5 }));
    expect(calcularNota(criterios, r2).nota).toBe(4);
    const pesos = pesosEfetivos(criterios, r2);
    expect(pesos['qualidade-do-preparo']).toBe(0);
    expect(pesos['produtividade']).toBe(18.8); // 15/80
    expect(calcularNota(criterios, criterios.map((c) => ({ key: c.key, score: null }))).nota).toBeNull();
  });
  it('classificação por faixa: 4,50 Excelente · 3,50 Bom · 2,50 Regular · abaixo Necessita melhorar', () => {
    expect(classificar(5)).toBe('EXCELENTE');
    expect(classificar(4.5)).toBe('EXCELENTE');
    expect(classificar(4.49)).toBe('BOM');
    expect(classificar(3.5)).toBe('BOM');
    expect(classificar(3.49)).toBe('REGULAR');
    expect(classificar(2.5)).toBe('REGULAR');
    expect(classificar(2.49)).toBe('MELHORAR');
    expect(classificar(1)).toBe('MELHORAR');
  });
});

describe('validarRespostas', () => {
  it('exige resposta em todo critério, justificativa em 1 e 2 e no N/A', () => {
    const r = validarRespostas(criterios, todos(4));
    expect(r.ok).toBe(true);
    const faltando = validarRespostas(criterios, todos(4).slice(0, 7));
    expect(faltando.ok).toBe(false);
    expect(!faltando.ok && faltando.erros[0]).toContain('dê uma nota');
    const baixa = validarRespostas(criterios, criterios.map((c) => ({ key: c.key, score: c.key === 'pontualidade' ? 2 : 4 })));
    expect(!baixa.ok && baixa.erros).toEqual(['"Pontualidade e assiduidade": nota 2 exige justificativa.']);
    const baixaOk = validarRespostas(criterios, criterios.map((c) => ({ key: c.key, score: c.key === 'pontualidade' ? 2 : 4, justification: c.key === 'pontualidade' ? 'faltou 3x' : '' })));
    expect(baixaOk.ok).toBe(true);
    const na = validarRespostas(criterios, criterios.map((c) => ({ key: c.key, score: c.key === 'equipe' ? null : 4 })));
    expect(!na.ok && na.erros).toEqual(['"Trabalho em equipe": N/A exige justificativa.']);
    const tudoNa = validarRespostas(criterios, criterios.map((c) => ({ key: c.key, score: null, justification: 'n' })));
    expect(!tudoNa.ok && tudoNa.erros[0]).toContain('Todos os critérios estão N/A');
    const fora = validarRespostas(criterios, criterios.map((c) => ({ key: c.key, score: 6 })));
    expect(fora.ok).toBe(false);
  });
  it('o que grava é o retrato: critério + nota + justificativa, e lerRespostas lê de volta', () => {
    const r = validarRespostas(criterios, criterios.map((c) => ({ key: c.key, score: 3, justification: '  ' })));
    expect(r.ok && r.gravar[0]).toEqual({ key: 'pontualidade', label: 'Pontualidade e assiduidade', group: 'GERAL', weight: 10, score: 3, justification: null });
    expect(r.ok && lerRespostas(JSON.parse(JSON.stringify(r.gravar)))).toEqual(r.ok && r.gravar);
  });
});

describe('notaDaAvaliacao — os dois formatos', () => {
  it('ponderada quando há finalScore; média dos 4 na avaliação antiga', () => {
    expect(notaDaAvaliacao({ finalScore: 4.37, punctuality: 1, performance: 1, teamwork: 1, presentation: 1 })).toBe(4.37);
    expect(notaDaAvaliacao({ finalScore: null, punctuality: 4, performance: 5, teamwork: 4, presentation: 5 })).toBe(4.5);
    expect(notaDaAvaliacao({ finalScore: null, punctuality: null })).toBeNull();
  });
});

describe('cargo do RH → modelo', () => {
  it('casa normalizado (caixa, acento, espaços)', () => {
    const v = [{ jobTitleKey: normalizarCargo('Auxiliar de Cozinha'), modelId: 'm1' }];
    expect(modeloDoCargo('AUXILIAR DE COZINHA', v)).toBe('m1');
    expect(modeloDoCargo('  auxiliar   de cozinha ', v)).toBe('m1');
    expect(modeloDoCargo('Cozinheiro', v)).toBeNull();
    expect(modeloDoCargo(null, v)).toBeNull();
  });
  it('os 10 modelos iniciais: pesos 20/15/15/10, apelidos sem repetição entre modelos, Gerente/Encarregado num só', () => {
    expect(MODELOS_INICIAIS).toHaveLength(10);
    const chaves = new Map<string, string>();
    for (const m of MODELOS_INICIAIS) {
      expect(m.especificos.map((e) => e.weight)).toEqual([20, 15, 15, 10]);
      expect(montarCriterios(m.especificos).ok).toBe(true);
      for (const c of m.cargos) {
        const k = normalizarCargo(c);
        expect(chaves.get(k), `${c} está em ${chaves.get(k)} e ${m.seedKey}`).toBeUndefined();
        chaves.set(k, m.seedKey);
      }
    }
    const gerenciais = MODELOS_INICIAIS.filter((m) => m.managerial);
    expect(gerenciais).toHaveLength(1);
    expect(gerenciais[0].cargos.map(normalizarCargo)).toEqual(expect.arrayContaining(['gerente', 'encarregado', 'encarregado de restaurante']));
    expect(CRITERIOS_GERAIS).toHaveLength(4);
  });
});

describe('quemPodeAvaliar', () => {
  const base = { managerial: false, semModelo: false, cpfUsuario: '123.456.789-01', cpfColaborador: '98765432100' };
  it('gerente/coordenador avaliam a equipe; função gerencial só Supervisor/Admin; ninguém a si próprio; sem modelo ninguém', () => {
    expect(quemPodeAvaliar({ ...base, role: 'MANAGER' })).toEqual({ pode: true, motivo: null });
    expect(quemPodeAvaliar({ ...base, role: 'COORDINATOR' })).toEqual({ pode: true, motivo: null });
    expect(quemPodeAvaliar({ ...base, role: 'MANAGER', managerial: true })).toEqual({ pode: false, motivo: 'GERENCIAL' });
    expect(quemPodeAvaliar({ ...base, role: 'SUPERVISOR', managerial: true })).toEqual({ pode: true, motivo: null });
    expect(quemPodeAvaliar({ ...base, role: 'ADMIN', managerial: true })).toEqual({ pode: true, motivo: null });
    expect(quemPodeAvaliar({ ...base, role: 'SUPERVISOR', cpfColaborador: '12345678901' })).toEqual({ pode: false, motivo: 'PROPRIO' });
    expect(quemPodeAvaliar({ ...base, role: 'MANAGER', semModelo: true })).toEqual({ pode: false, motivo: 'SEM_MODELO' });
    expect(quemPodeAvaliar({ ...base, role: 'FINANCE' })).toEqual({ pode: false, motivo: 'PERFIL' });
    expect(quemPodeAvaliar({ ...base, role: 'CEO' })).toEqual({ pode: false, motivo: 'PERFIL' });
    // sem CPF cadastrado não há como saber que é a própria pessoa: deixa avaliar (a tela pede o CPF)
    expect(quemPodeAvaliar({ ...base, role: 'MANAGER', cpfUsuario: null })).toEqual({ pode: true, motivo: null });
  });
});
