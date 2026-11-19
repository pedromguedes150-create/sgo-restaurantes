import { describe, it, expect } from 'vitest';
import {
  DEFINICAO_DO_TIPO, DESCRICAO_MAX, ROTULO_DO_TIPO, TIPOS_OFERECIDOS, TITULO_MAX,
  dataDoEvento, descricaoParaORh, faixaDaSituacao, filtrar, indicadores, montarPainel, normalizarDetalhes, oQueFalta, ordenar,
  pendencias, prazoVencido, resumoSugerido, ultimaMovimentacao,
  type DadosDaSolicitacao, type LinhaDaSolicitacao,
} from '@/lib/rh/solicitacoes-regras';
import * as saida from '@/lib/rh/saida/regras';

const base: DadosDaSolicitacao = { tipo: 'DUVIDA', titulo: 'Banco de horas', descricao: 'Como fica?', prioridade: 'NORMAL', urgenciaMotivo: '', collaboratorId: null, detalhes: {} };
let n = 0;
const linha = (p: Partial<LinhaDaSolicitacao> = {}): LinhaDaSolicitacao => ({
  id: `s${++n}`, tipo: 'DUVIDA', titulo: 'Dúvida', prioridade: 'NORMAL', unitId: 'u1', unitName: 'Unidade Um', collaboratorName: null,
  createdById: 'g1', createdByName: 'Gabriel', createdAt: '2026-11-10T12:00:00.000Z', rhNumero: null, rhPrazoAlvo: null, rhSituacao: 'solicitado',
  rhSituacaoAt: null, situacaoRotulo: 'Solicitado', envio: 'ENVIADO', anexos: 0, ...p,
});
const agora = new Date('2026-11-19T15:00:00.000Z');
const hoje = '2026-11-19';

describe('solicitações ao RH — tipos e campos', () => {
  it('a tela não oferece Atestado, mas o rótulo segue para as antigas', () => {
    expect(TIPOS_OFERECIDOS).not.toContain('ATESTADO');
    expect(TIPOS_OFERECIDOS).toHaveLength(8);
    expect(ROTULO_DO_TIPO.ATESTADO).toBe('Atestado');
    expect(oQueFalta({ ...base, tipo: 'ATESTADO', collaboratorId: 'c1' })).toContain('Central de Atestados');
  });

  it('os limites são os mesmos do contrato do RH', () => {
    expect(TITULO_MAX).toBe(saida.TITULO_MAX);
    expect(DESCRICAO_MAX).toBe(saida.DESCRICAO_MAX);
  });

  it('colaborador só onde faz sentido', () => {
    expect(DEFINICAO_DO_TIPO.ADMISSAO.colaborador).toBe('nao');
    expect(DEFINICAO_DO_TIPO.FERIAS.colaborador).toBe('sim');
    expect(DEFINICAO_DO_TIPO.DUVIDA.colaborador).toBe('opcional');
    expect(oQueFalta({ ...base, tipo: 'FERIAS', titulo: 'Férias', detalhes: { inicio: '2026-12-01' } })).toBe('Escolha o colaborador.');
  });

  it('só o indispensável é obrigatório, e a falta é dita pelo nome do campo', () => {
    expect(oQueFalta({ ...base, tipo: 'ADMISSAO', titulo: 'Admissão', descricao: '', detalhes: {} })).toBe('Preencha: Cargo.');
    expect(oQueFalta({ ...base, tipo: 'ADMISSAO', titulo: 'Admissão', descricao: '', detalhes: { cargo: 'Cozinheiro', vagas: '0' } })).toContain('Quantidade de vagas');
    expect(oQueFalta({ ...base, tipo: 'ADMISSAO', titulo: 'Admissão', descricao: '', detalhes: { cargo: 'Cozinheiro', vagas: '2' } })).toBeNull();
    expect(oQueFalta({ ...base, tipo: 'FERIAS', collaboratorId: 'c1', titulo: 'Férias', descricao: '', detalhes: { inicio: '2026-12-10', fim: '2026-12-01' } })).toContain('fim');
    expect(oQueFalta({ ...base, descricao: '' })).toBe('Escreva a descrição.');
    expect(oQueFalta({ ...base, titulo: '' })).toBe('Escreva o resumo.');
  });

  it('urgente exige o motivo', () => {
    expect(oQueFalta({ ...base, prioridade: 'URGENTE' })).toContain('urgente');
    expect(oQueFalta({ ...base, prioridade: 'URGENTE', urgenciaMotivo: 'O colaborador começa na segunda' })).toBeNull();
    expect(oQueFalta({ ...base, prioridade: 'ALTA' })).toBeNull();
  });

  it('campo que não é do tipo é descartado', () => {
    expect(normalizarDetalhes('ADMISSAO', { cargo: ' Cozinheiro ', vagas: 2, salario: '9999', horarioAtual: 'x' })).toEqual({ cargo: 'Cozinheiro', vagas: '2' });
    expect(normalizarDetalhes('DUVIDA', { cargo: 'x' })).toEqual({});
    expect(normalizarDetalhes('ADMISSAO', null)).toEqual({});
  });

  it('o resumo é sugerido com o que já foi preenchido', () => {
    expect(resumoSugerido('ADMISSAO', null, { cargo: 'Cozinheiro', vagas: '2' })).toBe('Admissão: 2 vagas de Cozinheiro');
    expect(resumoSugerido('ADMISSAO', null, { cargo: 'Cozinheiro', vagas: '1' })).toBe('Admissão: Cozinheiro');
    expect(resumoSugerido('FERIAS', 'Ana Lima', { inicio: '2026-12-01', fim: '2026-12-20' })).toBe('Férias — Ana Lima · 01/12/2026 a 20/12/2026');
    expect(resumoSugerido('MUDANCA_FUNCAO_SALARIO', 'Ana Lima', { tipoDeAlteracao: 'Função', proposta: 'Cozinheiro' })).toBe('Mudança de função — Ana Lima · Cozinheiro');
    expect(resumoSugerido('DUVIDA', null, {})).toBe('');
  });

  it('a data do evento sai do campo de data do tipo', () => {
    expect(dataDoEvento('FERIAS', { inicio: '2026-12-01', fim: '2026-12-20' })).toBe('2026-12-01');
    expect(dataDoEvento('ADMISSAO', { cargo: 'x' })).toBeNull();
    expect(dataDoEvento('DUVIDA', {})).toBeNull();
  });
});

describe('solicitações ao RH — o que o RH recebe na descrição', () => {
  it('solicitação sem campo nenhum (as antigas) sai como foi escrita', () => {
    expect(descricaoParaORh({ tipo: 'DUVIDA', descricao: 'pedido da própria', detalhes: null, urgenciaMotivo: null, anexos: 0 })).toBe('pedido da própria');
    expect(descricaoParaORh({ tipo: 'DUVIDA', descricao: null, detalhes: null, urgenciaMotivo: null, anexos: 0 })).toBeNull();
  });

  it('os campos do tipo, a urgência e os anexos vão abaixo do texto do gerente', () => {
    const t = descricaoParaORh({ tipo: 'ADMISSAO', descricao: 'Turno da noite', detalhes: { cargo: 'Cozinheiro', vagas: '2', dataDesejada: '2026-12-01' }, urgenciaMotivo: 'Saíram dois na semana', anexos: 2 })!;
    expect(t.startsWith('Turno da noite\n\nDados da solicitação\n')).toBe(true);
    expect(t).toContain('Cargo: Cozinheiro');
    expect(t).toContain('Quantidade de vagas: 2');
    expect(t).toContain('Data desejada: 01/12/2026');
    expect(t).toContain('Motivo da urgência: Saíram dois na semana');
    expect(t).toContain('Anexos: 2 arquivo(s) guardado(s) no SGO');
  });

  it('nunca passa do limite do contrato', () => {
    const t = descricaoParaORh({ tipo: 'ADMISSAO', descricao: 'x'.repeat(DESCRICAO_MAX), detalhes: { cargo: 'Cozinheiro', vagas: '1' }, urgenciaMotivo: null, anexos: 0 })!;
    expect(t.length).toBe(DESCRICAO_MAX);
  });
});

describe('solicitações ao RH — situação, lista e indicadores', () => {
  it('a situação do RH vira uma das quatro faixas', () => {
    expect(faixaDaSituacao(null)).toBe('ANDAMENTO');
    expect(faixaDaSituacao('solicitado')).toBe('ANDAMENTO');
    expect(faixaDaSituacao('em_andamento')).toBe('ANDAMENTO');
    expect(faixaDaSituacao('aguardando_solicitante')).toBe('AGUARDANDO_RESPOSTA');
    expect(faixaDaSituacao('concluido')).toBe('CONCLUIDA');
    expect(faixaDaSituacao('cancelado')).toBe('CANCELADA');
    expect(faixaDaSituacao('situacao_nova_do_rh')).toBe('ANDAMENTO');
  });

  it('indicadores contam por faixa', () => {
    const xs = [linha(), linha({ rhSituacao: 'em_andamento' }), linha({ rhSituacao: 'aguardando_solicitante' }), linha({ rhSituacao: 'concluido' })];
    expect(indicadores(xs)).toEqual({ ANDAMENTO: 2, AGUARDANDO_RESPOSTA: 1, CONCLUIDA: 1, CANCELADA: 0 });
  });

  it('a lista traz primeiro o que pede resposta, depois a movimentação mais recente', () => {
    const antiga = linha({ titulo: 'antiga', createdAt: '2026-11-01T12:00:00.000Z' });
    const nova = linha({ titulo: 'nova', createdAt: '2026-11-18T12:00:00.000Z' });
    const mexida = linha({ titulo: 'mexida', createdAt: '2026-11-02T12:00:00.000Z', rhSituacaoAt: '2026-11-19T09:00:00.000Z', rhSituacao: 'em_andamento' });
    const espera = linha({ titulo: 'espera', createdAt: '2026-10-01T12:00:00.000Z', rhSituacao: 'aguardando_resposta' });
    expect(ordenar([antiga, nova, mexida, espera]).map((l) => l.titulo)).toEqual(['espera', 'mexida', 'nova', 'antiga']);
    expect(ultimaMovimentacao(mexida)).toBe('2026-11-19T09:00:00.000Z');
  });

  it('busca sem acento por protocolo, resumo e colaborador; filtros de situação, tipo e período', () => {
    const xs = [
      linha({ titulo: 'Férias da Ana', tipo: 'FERIAS', collaboratorName: 'Ana Conceição', rhNumero: 'DM-15' }),
      linha({ titulo: 'Dúvida de ponto', rhSituacao: 'concluido', createdAt: '2026-09-01T12:00:00.000Z' }),
    ];
    const f = { faixa: '' as const, tipo: '' as const, dias: 0, q: '' };
    expect(filtrar(xs, { ...f, q: 'conceicao' }, agora)).toHaveLength(1);
    expect(filtrar(xs, { ...f, q: 'dm-15' }, agora)).toHaveLength(1);
    expect(filtrar(xs, { ...f, faixa: 'CONCLUIDA' }, agora).map((l) => l.titulo)).toEqual(['Dúvida de ponto']);
    expect(filtrar(xs, { ...f, tipo: 'FERIAS' }, agora)).toHaveLength(1);
    expect(filtrar(xs, { ...f, dias: 30 }, agora).map((l) => l.titulo)).toEqual(['Férias da Ana']);
  });

  it('prazo vencido só em solicitação aberta', () => {
    expect(prazoVencido(linha({ rhPrazoAlvo: '2026-11-18' }), hoje)).toBe(true);
    expect(prazoVencido(linha({ rhPrazoAlvo: '2026-11-19' }), hoje)).toBe(false);
    expect(prazoVencido(linha({ rhPrazoAlvo: '2026-11-01', rhSituacao: 'concluido' }), hoje)).toBe(false);
  });
});

describe('solicitações ao RH — painel de gestão', () => {
  it('uma pendência por solicitação, a mais grave; concluída não é pendência', () => {
    const xs = [
      linha({ titulo: 'parada', createdAt: '2026-11-10T12:00:00.000Z' }),
      linha({ titulo: 'recente', createdAt: '2026-11-18T12:00:00.000Z' }),
      linha({ titulo: 'urgente vencida', prioridade: 'URGENTE', rhPrazoAlvo: '2026-11-15' }),
      linha({ titulo: 'falhou', envio: 'COM_PROBLEMA' }),
      linha({ titulo: 'pronta', rhSituacao: 'concluido' }),
    ];
    const p = pendencias(xs, agora, hoje);
    expect(p.map((x) => [x.linha.titulo, x.tipo])).toEqual([
      ['falhou', 'ENVIO_COM_PROBLEMA'], ['urgente vencida', 'PRAZO_VENCIDO'], ['parada', 'SEM_RETORNO'],
    ]);
    expect(p.find((x) => x.linha.titulo === 'parada')!.dias).toBe(9);
  });

  it('números da rede, por unidade, por tipo e por solicitante', () => {
    const xs = [
      linha({ unitId: 'a', unitName: 'A', tipo: 'FERIAS', createdAt: '2026-11-01T12:00:00.000Z', rhSituacao: 'concluido', rhSituacaoAt: '2026-11-03T12:00:00.000Z', rhPrazoAlvo: '2026-11-05' }),
      linha({ unitId: 'a', unitName: 'A', tipo: 'FERIAS', createdAt: '2026-11-01T12:00:00.000Z', rhSituacao: 'concluido', rhSituacaoAt: '2026-11-05T12:00:00.000Z', rhPrazoAlvo: '2026-11-04' }),
      linha({ unitId: 'b', unitName: 'B', createdByName: 'Bia', createdAt: '2026-11-10T12:00:00.000Z' }),
      linha({ unitId: 'b', unitName: 'B', createdByName: 'Bia', rhSituacao: 'cancelado' }),
    ];
    const p = montarPainel(xs, agora, hoje);
    expect(p).toMatchObject({ total: 4, abertas: 1, concluidas: 2, canceladas: 1, tempoMedioDias: 3, noPrazoPct: 50 });
    expect(p.porUnidade.map((u) => [u.unitName, u.total, u.abertas, u.pendencias])).toEqual([['B', 2, 1, 1], ['A', 2, 0, 0]]);
    expect(p.porUnidade.find((u) => u.unitName === 'B')!.tempoMedioDias).toBeNull();
    expect(p.porTipo).toEqual([{ tipo: 'FERIAS', total: 2, abertas: 0 }, { tipo: 'DUVIDA', total: 2, abertas: 1 }]);
    expect(p.porSolicitante[0]).toEqual({ nome: 'Gabriel', total: 2, abertas: 0 });
  });

  it('sem nada concluído, tempo médio e prazo ficam sem número (não zero)', () => {
    const p = montarPainel([linha()], agora, hoje);
    expect(p.tempoMedioDias).toBeNull();
    expect(p.noPrazoPct).toBeNull();
  });
});
