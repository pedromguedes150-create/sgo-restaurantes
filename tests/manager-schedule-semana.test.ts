import { describe, expect, it } from 'vitest';
import { diasDaSemana, lerSemana, montarSemana, segundaDe, semanaAnterior, semanaSeguinte } from '@/lib/manager-schedule-semana';
import type { GerenteHoje } from '@/lib/manager-schedule-regras';

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const g = (id: string, over: Partial<GerenteHoje> = {}): GerenteHoje => ({
  userId: id, name: `Gerente ${id}`, weekdays: TODOS, startTime: '08:00', endTime: '17:00', ausencias: [], ...over,
});
const folga = (dia: string, fim = dia, kind: 'FOLGA' | 'FERIAS' = 'FOLGA') => ({ kind, startDate: dia, endDate: fim, note: null, lancadoPor: 'o próprio gerente' });

/* 23/11/2026 é uma segunda-feira. */
const SEG = '2026-11-23';

describe('semana seg→dom', () => {
  it('qualquer dia da semana cai na mesma segunda, inclusive o domingo', () => {
    expect(segundaDe('2026-11-23')).toBe(SEG);
    expect(segundaDe('2026-11-26')).toBe(SEG);
    expect(segundaDe('2026-11-29')).toBe(SEG);
    expect(segundaDe('2026-11-30')).toBe('2026-11-30');
  });
  it('sete dias, atravessando o mês', () => {
    expect(diasDaSemana('2026-11-30')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(semanaAnterior(SEG)).toBe('2026-11-16');
    expect(semanaSeguinte(SEG)).toBe('2026-11-30');
  });
  it('a URL inválida cai na semana de hoje', () => {
    expect(lerSemana('2026-11-25', '2026-01-01')).toBe(SEG);
    expect(lerSemana('lixo', '2026-11-26')).toBe(SEG);
    expect(lerSemana(undefined, '2026-11-26')).toBe(SEG);
    expect(lerSemana('2026-13-45', '2026-11-26')).toBe(SEG);
  });
});

describe('montarSemana', () => {
  it('conta folgas, férias e quem ficou sem folga — pessoa de duas unidades conta uma vez', () => {
    const ana = g('ana', { ausencias: [folga('2026-11-24')] });
    const bia = g('bia', { ausencias: [folga('2026-11-20', '2026-11-25', 'FERIAS')] });
    const caio = g('caio');
    const s = montarSemana([
      { unitId: 'u1', unitName: 'Unidade 1', gerentes: [ana, bia] },
      { unitId: 'u2', unitName: 'Unidade 2', gerentes: [ana, caio] },
    ], SEG);

    expect(s.de).toBe(SEG);
    expect(s.ate).toBe('2026-11-29');
    expect(s.resumo).toMatchObject({ unidades: 2, gerentes: 3, comFolga: 1, diasDeFolga: 1, emFerias: 1, semFolga: 1 });
    expect(s.semFolga).toEqual([{ name: 'Gerente caio', unidades: ['Unidade 2'] }]);
    /* seg: bia; ter: ana + bia; qua: bia; depois ninguém. */
    expect(s.foraPorDia).toEqual([1, 2, 1, 0, 0, 0, 0]);
    expect(s.unidades[0].linhas[1].dias.slice(0, 4)).toEqual(['FERIAS', 'FERIAS', 'FERIAS', 'TRABALHA']);
    /* A folga da Ana aparece na lista das duas unidades dela. */
    expect(s.folgas.filter((f) => f.name === 'Gerente ana').map((f) => f.unitName)).toEqual(['Unidade 1', 'Unidade 2']);
  });

  it('dia sem gerente só existe quando alguém tem horário; quem não tem horário não cobre', () => {
    const soSemana = g('a', { weekdays: [1, 2, 3, 4, 5] });
    const semHorario = g('b', { weekdays: [] });
    const s = montarSemana([
      { unitId: 'u1', unitName: 'Com horário', gerentes: [soSemana, semHorario] },
      { unitId: 'u2', unitName: 'Sem horário nenhum', gerentes: [g('c', { weekdays: [] })] },
      { unitId: 'u3', unitName: 'Vazia', gerentes: [] },
    ], SEG);

    expect(s.unidades[0].diasSemGerente).toEqual(['2026-11-28', '2026-11-29']);
    expect(s.unidades[0].cobertura).toEqual([1, 1, 1, 1, 1, 0, 0]);
    expect(s.unidades[1].diasSemGerente).toEqual([]);
    expect(s.unidades[1].semHorario).toBe(true);
    expect(s.unidades[2].semHorario).toBe(false);
    expect(s.resumo).toMatchObject({ unidadesComDiaDescoberto: 1, diasDescobertos: 2, semHorario: 2 });
    expect(s.descobertasPorDia).toEqual([0, 0, 0, 0, 0, 1, 1]);
    expect(s.descobertos).toEqual([{ unitName: 'Com horário', dias: ['2026-11-28', '2026-11-29'] }]);
  });

  it('a folga lançada tira a cobertura do dia e a leitura diz isso', () => {
    const s = montarSemana([{ unitId: 'u1', unitName: 'U', gerentes: [g('a', { ausencias: [folga('2026-11-26')] })] }], SEG);
    expect(s.unidades[0].diasSemGerente).toEqual(['2026-11-26']);
    expect(s.leituras.join(' ')).toContain('1 gerente tem folga lançada na semana (1 dia no total), de 1 na rede.');
    expect(s.leituras.join(' ')).toContain('Todos os gerentes têm folga ou férias lançada nesta semana.');
    expect(s.leituras.join(' ')).toContain('quinta-feira (1)');
    expect(s.leituras.join(' ')).toContain('1 unidade fica sem gerente em algum dia (1 dia descoberto).');
  });

  it('rede sem gerente não inventa número', () => {
    const s = montarSemana([{ unitId: 'u1', unitName: 'U', gerentes: [] }], SEG);
    expect(s.resumo.gerentes).toBe(0);
    expect(s.leituras).toEqual(['Nenhum gerente vinculado às unidades do relatório.']);
  });
});

describe('relatório executivo (v1.229.0)', () => {
  it('CD e Produtos ficam fora: pelo tipo do cadastro ou, na falta dele, pelo nome', async () => {
    const { unidadeDeApoio } = await import('@/lib/manager-schedule-semana');
    expect(unidadeDeApoio({ name: 'Qualquer', operationType: 'CD' })).toBe(true);
    expect(unidadeDeApoio({ name: 'Qualquer', operationType: 'FABRICA' })).toBe(true);
    expect(unidadeDeApoio({ name: 'COMERCIAL LINS & GUEDES LTDA (CENTRO DE DISTRIBUIÇÃO)', operationType: 'RESTAURANTE' })).toBe(true);
    expect(unidadeDeApoio({ name: 'COMERCIAL LINS & GUEDES LTDA (PRODUTOS)', operationType: 'RESTAURANTE' })).toBe(true);
    expect(unidadeDeApoio({ name: 'COMERCIAL LINS & GUEDES LTDA (NOVA UNIÃO)', operationType: 'RESTAURANTE' })).toBe(false);
    expect(unidadeDeApoio({ name: 'COMERCIAL LINS E GUEDES LTDA ME' })).toBe(false);
  });

  it('os dias viram texto: um dia, dois, intervalo e a semana toda', async () => {
    const { textoDosDias, diasDaSemana } = await import('@/lib/manager-schedule-semana');
    expect(textoDosDias([])).toBe('');
    expect(textoDosDias(['2026-11-26'])).toBe('qui 26/11');
    expect(textoDosDias(['2026-11-28', '2026-11-29'])).toBe('sáb 28/11 e dom 29/11');
    expect(textoDosDias(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-28'])).toBe('seg 23/11 a qua 25/11, sáb 28/11');
    expect(textoDosDias(diasDaSemana(SEG))).toBe('a semana toda');
  });

  it('uma linha por loja, em texto, sem quem lançou', async () => {
    const { quadroExecutivo } = await import('@/lib/manager-schedule-semana');
    const s = montarSemana([{ unitId: 'u1', unitName: 'Loja', gerentes: [
      g('a', { ausencias: [folga('2026-11-26')] }),
      g('b', { ausencias: [folga('2026-11-20', '2026-11-24', 'FERIAS')] }),
      g('c', { weekdays: [1, 2, 3, 4, 5] }),
    ] }], SEG);
    const [l] = quadroExecutivo(s);
    expect(l).toEqual({
      unitId: 'u1', unitName: 'Loja', gerentes: 3,
      folgas: [{ name: 'Gerente a', quando: 'qui 26/11' }],
      ferias: [{ name: 'Gerente b', quando: 'seg 23/11 e ter 24/11' }],
      semFolga: ['Gerente c'],
      semGerente: '',
    });
    expect(JSON.stringify(l)).not.toContain('próprio gerente');
  });
});
