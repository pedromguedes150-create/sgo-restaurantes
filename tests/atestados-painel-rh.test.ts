import { describe, it, expect } from 'vitest';
import { montarPendencias, kpisDoGerente, filtrarHistorico, faixaDaSituacao, LIMITES_DO_PAINEL, ORDEM_DAS_PENDENCIAS, type LinhaDoPainel } from '@/lib/certificates/painel-rh-calculo';

/**
 * ETAPA D (v1.199.0): o painel do RH e os filtros do Histórico — PURO.
 */
const HOJE = '2026-11-20';
const linha = (o: Partial<LinhaDoPainel> & { id: string }): LinhaDoPainel => ({
  unitId: 'u1', unitName: 'Centro', collaboratorName: 'ANA', rotulo: 'Atestado médico', grupo: 'ATESTADO', status: 'ENVIADO_RH', statusAt: '2026-11-19T10:00:00.000Z',
  statusMotivoLabel: null, statusNote: null, startDate: '2026-11-18', endDate: '2026-11-19', days: 2, createdAt: '2026-11-18T10:00:00.000Z', by: 'Ger', alertas: [], envioRh: { acao: 'criar', status: 'ENVIADO', erro: null }, ...o,
});

describe('montarPendencias', () => {
  it('correção pedida há mais de 3 dias sem reenvio é pendência; há menos, não; já reenviada, não', () => {
    const velha = linha({ id: 'a', status: 'CORRECAO_SOLICITADA', statusAt: '2026-11-10T10:00:00.000Z', statusMotivoLabel: 'Foto cortada', statusNote: 'Envie inteiro.' });
    const nova = linha({ id: 'b', status: 'CORRECAO_SOLICITADA', statusAt: '2026-11-19T10:00:00.000Z' });
    const reenviada = linha({ id: 'c', status: 'CORRIGIDO_REENVIADO', statusAt: '2026-11-10T10:00:00.000Z' });
    const { pendencias, resumo } = montarPendencias([velha, nova, reenviada], HOJE);
    expect(resumo.CORRECAO_SEM_RESPOSTA).toBe(1);
    expect(pendencias.find((p) => p.tipo === 'CORRECAO_SEM_RESPOSTA')?.detalhe).toBe('Foto cortada há 10 dias — Envie inteiro.');
    // a reenviada há 10 dias sem decisão do RH vira "sem retorno"
    expect(resumo.SEM_RETORNO_DO_RH).toBe(1);
    expect(pendencias.find((p) => p.tipo === 'SEM_RETORNO_DO_RH')?.doc.id).toBe('c');
  });

  it('envio com erro/esgotado/parado é pendência enquanto o documento não estiver concluído; sem fila (anterior à integração) não', () => {
    const erro = linha({ id: 'a', envioRh: { acao: 'criar', status: 'ERRO', erro: 'ANA está sem CPF' } });
    const esgotado = linha({ id: 'b', envioRh: { acao: 'atualizar', status: 'ESGOTADO', erro: null } });
    const concluidoComErro = linha({ id: 'c', status: 'CONCLUIDO', envioRh: { acao: 'criar', status: 'ERRO', erro: 'x' } });
    const antigo = linha({ id: 'd', envioRh: null });
    const { resumo, pendencias } = montarPendencias([erro, esgotado, concluidoComErro, antigo], HOJE);
    expect(resumo.ENVIO_COM_ERRO).toBe(2);
    expect(pendencias.find((p) => p.doc.id === 'a')?.detalhe).toBe('criar erro — ANA está sem CPF');
  });

  it('classificação pendente, alerta alto em documento aberto e retorno nos próximos 7 dias entram; não aceito não tem retorno', () => {
    const pend = linha({ id: 'a', status: 'CLASSIFICACAO_PENDENTE', rotulo: 'Atestado (dias de afastamento)', createdAt: '2026-11-15T10:00:00.000Z' });
    const inss = linha({ id: 'b', status: 'EM_ANALISE_RH', alertas: [{ tipo: 'INSS_15', gravidade: 'alta', texto: '16 dias.' }, { tipo: 'RETORNO', gravidade: 'info', texto: 'Retorno previsto em 26/11/2026.' }], endDate: '2026-11-25' });
    const inssConcluido = linha({ id: 'c', status: 'VALIDADO_RH', alertas: [{ tipo: 'INSS_15', gravidade: 'alta', texto: '16 dias.' }], endDate: '2026-11-10' });
    const longe = linha({ id: 'd', alertas: [{ tipo: 'RETORNO', gravidade: 'info', texto: '' }], endDate: '2026-12-15' });
    const naoAceito = linha({ id: 'e', status: 'NAO_ACEITO', alertas: [{ tipo: 'RETORNO', gravidade: 'info', texto: '' }], endDate: '2026-11-22' });
    const { resumo, pendencias } = montarPendencias([pend, inss, inssConcluido, longe, naoAceito], HOJE);
    expect(resumo.CLASSIFICACAO_PENDENTE).toBe(1);
    expect(pendencias.find((p) => p.tipo === 'CLASSIFICACAO_PENDENTE')?.detalhe).toBe('Lançado por Ger há 5 dias');
    expect(resumo.ALERTA_ALTO).toBe(1); // o validado não conta
    expect(resumo.RETORNO_PROXIMO).toBe(1); // só o b (25/11); d está longe; e não aceito
    expect(pendencias.find((p) => p.tipo === 'RETORNO_PROXIMO')?.detalhe).toBe('Volta em 26/11/2026');
  });

  it('a ordem é por prioridade (correção → erro → classificação → sem retorno → alerta → retorno) e dentro dela por colaborador', () => {
    const rows = [
      linha({ id: 'r', collaboratorName: 'ZÉ', alertas: [{ tipo: 'RETORNO', gravidade: 'info', texto: '' }], endDate: '2026-11-22' }),
      linha({ id: 'c2', collaboratorName: 'BIA', status: 'CORRECAO_SOLICITADA', statusAt: '2026-11-01T10:00:00.000Z' }),
      linha({ id: 'c1', collaboratorName: 'ANA', status: 'CORRECAO_SOLICITADA', statusAt: '2026-11-01T10:00:00.000Z' }),
      linha({ id: 'e', collaboratorName: 'ZÉ', envioRh: { acao: 'criar', status: 'PARADO', erro: null } }),
    ];
    const { pendencias } = montarPendencias(rows, HOJE);
    expect(pendencias.map((p) => `${p.tipo}:${p.doc.id}`)).toEqual(['CORRECAO_SEM_RESPOSTA:c1', 'CORRECAO_SEM_RESPOSTA:c2', 'ENVIO_COM_ERRO:e', 'RETORNO_PROXIMO:r']);
    expect(ORDEM_DAS_PENDENCIAS.length).toBe(6);
    expect(LIMITES_DO_PAINEL).toEqual({ diasCorrecaoSemResposta: 3, diasSemRetornoDoRh: 7, diasRetornoProximo: 7 });
  });
});

describe('kpis do gerente e filtros do Histórico', () => {
  const rows = [
    linha({ id: '1', status: 'ENVIADO_RH' }),
    linha({ id: '2', status: 'LEITURA_CONCLUIDA' }),
    linha({ id: '3', status: 'EM_ANALISE_RH', grupo: 'LICENCA', rotulo: 'Licença-paternidade', collaboratorName: 'JOÃO' }),
    linha({ id: '4', status: 'CORRECAO_SOLICITADA' }),
    linha({ id: '5', status: 'VALIDADO_RH', alertas: [{ tipo: 'INSS_15', gravidade: 'alta', texto: '' }] }),
    linha({ id: '6', status: 'CONCLUIDO', startDate: '2026-10-02' }),
    linha({ id: '7', status: 'NAO_ACEITO' }),
  ];

  it('as cinco faixas: Enviados (antes da decisão) · Em análise · Correções · Concluídos · Não aceitos', () => {
    expect(kpisDoGerente(rows)).toEqual({ ENVIADOS: 2, EM_ANALISE: 1, CORRECOES: 1, CONCLUIDOS: 2, NAO_ACEITOS: 1 });
    expect(faixaDaSituacao('CORRIGIDO_REENVIADO')).toBe('ENVIADOS');
    expect(faixaDaSituacao('CLASSIFICACAO_PENDENTE')).toBe('ENVIADOS');
  });

  it('filtros combinam: faixa, grupo, mês, texto sem acento e "só com alerta"', () => {
    expect(filtrarHistorico(rows, { faixa: 'CONCLUIDOS' }).map((r) => r.id)).toEqual(['5', '6']);
    expect(filtrarHistorico(rows, { grupo: 'LICENCA' }).map((r) => r.id)).toEqual(['3']);
    expect(filtrarHistorico(rows, { mes: '2026-10' }).map((r) => r.id)).toEqual(['6']);
    expect(filtrarHistorico(rows, { texto: 'joao' }).map((r) => r.id)).toEqual(['3']);
    expect(filtrarHistorico(rows, { texto: 'paternidade' }).map((r) => r.id)).toEqual(['3']);
    expect(filtrarHistorico(rows, { soComAlerta: true }).map((r) => r.id)).toEqual(['5']);
    expect(filtrarHistorico(rows, { faixa: 'CONCLUIDOS', soComAlerta: true }).map((r) => r.id)).toEqual(['5']);
    expect(filtrarHistorico(rows, { faixa: 'TODAS', grupo: 'TODOS', texto: '' }).length).toBe(7);
  });
});
