import { describe, it, expect } from 'vitest';
import {
  aderencia, contagemDirecionadas, direcionadaExigeTexto, itemSeAplica, montarAlertas, ROTULO_DIRECIONADA, montarRoteiro, pctBR, principaisDesvios, reincidencias, respostaDerivada, situacaoDaAcao,
  type DadosPreVisita, type ItemDoCatalogo, type RespostaParaConta,
} from '@/lib/supervisor/operacional-calculo';
import { ROTEIRO_PADRAO } from '@/lib/supervisor/operacional-catalogo';

/**
 * Acompanhamento operacional (v1.155.0) — regras puras. O que se trava:
 * alerta só com dado real (null = não se aplica, nunca vira alerta nem "ok"),
 * ausência não é zero, aderência sem N/A e com amostragem por unidade,
 * temperatura só julgada com faixa configurada, roteiro por tipo de unidade.
 */
const vazio: DadosPreVisita = { desperdicio: null, checklists: null, ocorrencias: null, validade: null, comandas: null, treinamentos: null, cofre: null, equipe: null, acoesAnteriores: null };

describe('resumo pré-visita', () => {
  it('sem dado nenhum = sem alerta (não inventa)', () => {
    expect(montarAlertas(vazio)).toEqual([]);
  });
  it('desperdício não lançado é alerta; lançado todos os dias é "ok"', () => {
    const a = montarAlertas({ ...vazio, desperdicio: { diasSemLancamento: 2, janela: 7, ultimoLancamento: '2026-10-03' } });
    expect(a[0]).toMatchObject({ chave: 'desperdicio-sem-lancamento', nivel: 'critico', fonte: 'Desperdícios' });
    const ok = montarAlertas({ ...vazio, desperdicio: { diasSemLancamento: 0, janela: 7, ultimoLancamento: '2026-10-04' } });
    expect(ok[0].nivel).toBe('ok');
  });
  it('ordena do mais grave ao ok e cada alerta tem fonte', () => {
    const a = montarAlertas({
      ...vazio,
      checklists: { naoRealizados: 1, atrasados: 0, realizados: 10, janela: 7, itensComFalha: [] },
      ocorrencias: { abertasHaMaisDe3Dias: 0, criticasAbertas: 1, revisaoVencida: 0 },
      equipe: { ativos: 5, semEscala: 0, atestadosHoje: 0, feriasHoje: 0 },
    });
    expect(a.map((x) => x.nivel)).toEqual(['critico', 'alto', 'ok']);
    expect(a.every((x) => x.fonte)).toBe(true);
  });
  it('ações anteriores vencidas e a validar entram no resumo', () => {
    const a = montarAlertas({ ...vazio, acoesAnteriores: { vencidas: 1, abertas: 3, aguardandoValidacao: 2 } });
    expect(a.map((x) => x.chave)).toEqual(['acoes-vencidas', 'acoes-validar']);
  });
});

describe('roteiro por tipo de unidade', () => {
  const cat: ItemDoCatalogo[] = ROTEIRO_PADRAO.map((i, n) => ({
    id: i.key, section: i.secao, text: i.texto, order: n, level: i.nivel, mode: i.modo ?? 'SIMPLES', unitTypes: i.tipos ?? [], requiresPizzeria: Boolean(i.pizzaria),
    active: true, photoOnNc: Boolean(i.fotoNc), noteOnNc: Boolean(i.obsNc), tempMin: null, tempMax: null,
  }));
  it('CD não recebe buffet nem salão; recebe separação', () => {
    const r = montarRoteiro(cat, { operationType: 'CD', hasPizzeria: false }, []);
    const textos = r.map((x) => x.itemKey);
    expect(textos).toContain('cd-separacao');
    expect(textos).not.toContain('temp-quentes');
    expect(textos).not.toContain('salao');
    expect(textos).not.toContain('pizza-massas');
  });
  it('restaurante com pizzaria recebe massas; sem pizzaria, não', () => {
    expect(montarRoteiro(cat, { operationType: 'RESTAURANTE', hasPizzeria: true }, []).some((x) => x.itemKey === 'pizza-massas')).toBe(true);
    expect(montarRoteiro(cat, { operationType: 'RESTAURANTE', hasPizzeria: false }, []).some((x) => x.itemKey === 'pizza-massas')).toBe(false);
  });
  it('alertas não-ok viram itens DIRECIONADOS no topo; "ok" não', () => {
    const alertas = montarAlertas({ ...vazio, desperdicio: { diasSemLancamento: 3, janela: 7, ultimoLancamento: null }, equipe: { ativos: 4, semEscala: 0, atestadosHoje: 0, feriasHoje: 0 } });
    const r = montarRoteiro(cat, { operationType: 'RESTAURANTE', hasPizzeria: false }, alertas);
    expect(r[0]).toMatchObject({ level: 'DIRECIONADA', itemKey: 'dir:desperdicio-sem-lancamento' });
    expect(r.filter((x) => x.level === 'DIRECIONADA')).toHaveLength(1);
  });
  it('item inativo ou sem tipos marcados', () => {
    expect(itemSeAplica({ active: false, unitTypes: [], requiresPizzeria: false }, { operationType: 'CD', hasPizzeria: false })).toBe(false);
    expect(itemSeAplica({ active: true, unitTypes: [], requiresPizzeria: false }, { operationType: 'FABRICA', hasPizzeria: false })).toBe(true);
  });
});

describe('resposta derivada', () => {
  it('amostragem: tudo conforme = CONFORME; um fora = NÃO CONFORME', () => {
    expect(respostaDerivada({ mode: 'AMOSTRAGEM', answer: null, sampleChecked: 10, sampleOk: 10 })).toBe('CONFORME');
    expect(respostaDerivada({ mode: 'AMOSTRAGEM', answer: null, sampleChecked: 10, sampleOk: 9 })).toBe('NAO_CONFORME');
  });
  it('temperatura só é julgada com faixa configurada (o código não inventa limite)', () => {
    expect(respostaDerivada({ mode: 'TEMPERATURA', answer: null, temperature: 9, tempMin: 0, tempMax: 5 })).toBe('NAO_CONFORME');
    expect(respostaDerivada({ mode: 'TEMPERATURA', answer: null, temperature: 3, tempMin: 0, tempMax: 5 })).toBe('CONFORME');
    expect(respostaDerivada({ mode: 'TEMPERATURA', answer: 'CONFORME', temperature: 9, tempMin: null, tempMax: null })).toBe('CONFORME');
  });
  it('N/A marcado vence sempre', () => {
    expect(respostaDerivada({ mode: 'AMOSTRAGEM', answer: 'NAO_SE_APLICA', sampleChecked: 3, sampleOk: 1 })).toBe('NAO_SE_APLICA');
  });
});

describe('aderência operacional', () => {
  const r = (over: Partial<RespostaParaConta>): RespostaParaConta => ({ itemKey: 'k', itemId: 'i', section: 'S', level: 'PRIMORDIAL', mode: 'SIMPLES', answer: null, gravity: null, sampleChecked: null, sampleOk: null, ...over });
  it('conformes ÷ conferidos; N/A fora; amostragem conta cada unidade', () => {
    const a = aderencia([
      r({ answer: 'CONFORME' }), r({ answer: 'CONFORME' }), r({ answer: 'CONFORME' }),
      r({ answer: 'NAO_CONFORME', gravity: 'CRITICA' }), r({ answer: 'NAO_SE_APLICA' }),
      r({ mode: 'AMOSTRAGEM', answer: 'NAO_CONFORME', sampleChecked: 10, sampleOk: 9 }), r({}),
    ]);
    expect(a).toMatchObject({ total: 7, respondidos: 6, pendentes: 1, conformes: 3, naoConformes: 2, naoAplicaveis: 1, criticos: 1, pontosConferidos: 14, pontosConformes: 12, pct: 85.7 });
  });
  it('nada conferido = null, nunca 0%', () => {
    expect(aderencia([r({ answer: 'NAO_SE_APLICA' })]).pct).toBeNull();
    expect(pctBR(null)).toBe('—');
    expect(pctBR(85.7)).toBe('85,7%');
  });
  it('principais desvios e reincidência', () => {
    const rs = [r({ section: 'Validade', answer: 'NAO_CONFORME', itemId: 'v' }), r({ section: 'Validade', answer: 'NAO_CONFORME', itemId: 'v2' }), r({ section: 'Higiene', answer: 'NAO_CONFORME', itemId: 'h' })];
    expect(principaisDesvios(rs)).toEqual([{ secao: 'Validade', qtd: 2 }, { secao: 'Higiene', qtd: 1 }]);
    expect(reincidencias(rs, new Set(['v', 'x']))).toEqual(['v']);
  });
});

describe('situação da ação', () => {
  it('vencido é derivado; aguardando validação não vence; resolvido é resolvido', () => {
    expect(situacaoDaAcao({ status: 'ABERTO', dueDate: '2026-10-01' }, '2026-10-05')).toBe('VENCIDO');
    expect(situacaoDaAcao({ status: 'AGUARDANDO_VALIDACAO', dueDate: '2026-10-01' }, '2026-10-05')).toBe('AGUARDANDO_VALIDACAO');
    expect(situacaoDaAcao({ status: 'RESOLVIDO', dueDate: '2026-10-01' }, '2026-10-05')).toBe('RESOLVIDO');
    expect(situacaoDaAcao({ status: 'EM_ANDAMENTO', dueDate: null }, '2026-10-05')).toBe('EM_ANDAMENTO');
  });
});

describe('itens direcionados (seção B) — v1.155.1', () => {
  const r = (over: Partial<RespostaParaConta>): RespostaParaConta => ({ itemKey: 'k', itemId: null, section: 'Checklists', level: 'DIRECIONADA', mode: 'SIMPLES', answer: null, gravity: null, sampleChecked: null, sampleOk: null, ...over });
  it('não entram na aderência nem nos desvios; só no progresso', () => {
    const a = aderencia([r({ answer: 'CONFORME' }), r({ answer: 'NAO_CONFORME' }), { ...r({ answer: 'CONFORME' }), level: 'PRIMORDIAL', itemId: 'x' }]);
    expect(a).toMatchObject({ total: 3, respondidos: 3, conformes: 1, naoConformes: 0, pontosConferidos: 1, pct: 100 });
    expect(principaisDesvios([r({ answer: 'NAO_CONFORME' })])).toEqual([]);
  });
  it('rótulos e contagem próprios', () => {
    expect(ROTULO_DIRECIONADA).toEqual({ CONFORME: 'Verificado', NAO_CONFORME: 'Requer ação', NAO_SE_APLICA: 'Não se aplica' });
    expect(contagemDirecionadas([r({ answer: 'CONFORME' }), r({ answer: 'NAO_CONFORME' }), r({ answer: 'NAO_SE_APLICA' }), r({}), { ...r({ answer: 'CONFORME' }), level: 'PRIMORDIAL' }]))
      .toEqual({ total: 4, verificados: 1, requerAcao: 1, naoSeAplica: 1, pendentes: 1 });
  });
  it('Requer ação e Não se aplica exigem texto; Verificado não', () => {
    expect(direcionadaExigeTexto('CONFORME')).toBe(false);
    expect(direcionadaExigeTexto('NAO_CONFORME')).toBe(true);
    expect(direcionadaExigeTexto('NAO_SE_APLICA')).toBe(true);
  });
});
