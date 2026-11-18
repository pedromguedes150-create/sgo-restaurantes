import { describe, it, expect } from 'vitest';
import {
  ehRepeticao, faixaValida, indicadores, mensagemParaOGerente, normalizarNome, normalizarTelefone, SITUACAO_NO_RH, SITUACOES_DO_RH,
  STATUS_DO_CURRICULO, STATUS_LABEL, statusDaFaixa, telefoneFormatado, tipoPeloConteudo, validarRetornoDoRh,
} from '@/lib/curriculos/regras';

/** CENTRAL DE CURRÍCULOS (v1.212.0) — as regras puras. */

describe('situações', () => {
  it('são as dez do pedido, cada uma com rótulo e com a grafia do RH (ida e volta)', () => {
    expect(STATUS_DO_CURRICULO).toHaveLength(10);
    for (const s of STATUS_DO_CURRICULO) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(SITUACOES_DO_RH[SITUACAO_NO_RH[s]]).toBe(s);
    }
    expect(STATUS_LABEL.PRIMEIRA_ETAPA).toBe('1ª etapa concluída');
  });
});

describe('indicadores do topo', () => {
  it('"Recebidos" é tudo; cada situação cai em UMA faixa', () => {
    const i = indicadores({ RECEBIDO: 3, EM_ANALISE: 2, PRIMEIRA_ETAPA: 1, ENTREVISTA_AGENDADA: 4, AVALIACAO_FINAL: 1, APROVADO: 2, REPROVADO: 5, BANCO_DE_TALENTOS: 1, DESISTENCIA: 1, CONTRATADO: 2 });
    expect(i).toEqual({ recebidos: 22, analise: 7, entrevista: 4, aprovado: 2, contratado: 2, encerrado: 7 });
    expect(i.analise + i.entrevista + i.aprovado + i.contratado + i.encerrado).toBe(i.recebidos);
  });
  it('sem nada, tudo zero; faixa desconhecida vira "todos"', () => {
    expect(indicadores({}).recebidos).toBe(0);
    expect(faixaValida('xpto')).toBe('todos');
    expect(statusDaFaixa('todos')).toBeNull();
    expect(statusDaFaixa('entrevista')).toEqual(['ENTREVISTA_AGENDADA']);
  });
});

describe('dados do candidato', () => {
  it('telefone: só dígitos com DDD, 10 ou 11; +55 sai', () => {
    expect(normalizarTelefone('(31) 99999-9999')).toBe('31999999999');
    expect(normalizarTelefone('+55 31 3333-4444')).toBe('3133334444');
    expect(normalizarTelefone('99999-9999')).toBeNull();
    expect(normalizarTelefone('')).toBeNull();
    expect(telefoneFormatado('31999999999')).toBe('(31) 99999-9999');
    expect(telefoneFormatado('3133334444')).toBe('(31) 3333-4444');
  });
  it('nome: pede nome e sobrenome, sem número', () => {
    expect(normalizarNome('  Maria   da Silva ')).toBe('Maria da Silva');
    expect(normalizarNome('Maria')).toBeNull();
    expect(normalizarNome('Maria 123 Silva')).toBeNull();
  });
});

describe('o arquivo é reconhecido pelo conteúdo', () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it('PDF, JPG e PNG entram; o resto não, seja qual for o nome', () => {
    expect(tipoPeloConteudo(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe('pdf');
    expect(tipoPeloConteudo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpg');
    expect(tipoPeloConteudo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(tipoPeloConteudo(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull(); // executável
    expect(tipoPeloConteudo(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip/docx
    expect(tipoPeloConteudo(bytes())).toBeNull();
  });
});

describe('o evento do RH', () => {
  it('aceita a situação da lista com o id do SGO; data da entrevista em ISO', () => {
    const v = validarRetornoDoRh({ sgoCurriculoId: 'abc', situacao: 'Entrevista_Agendada', entrevistaEm: '2026-11-25T14:00:00-03:00', observacao: ' Levar documento ' });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.dados.status).toBe('ENTREVISTA_AGENDADA');
    expect(v.dados.observacao).toBe('Levar documento');
    expect(v.dados.entrevistaEm?.toISOString()).toBe('2026-11-25T17:00:00.000Z');
  });
  it('recusa sem id, situação fora da lista e data torta — nada é adivinhado', () => {
    expect(validarRetornoDoRh({ situacao: 'aprovado' })).toMatchObject({ ok: false });
    expect(validarRetornoDoRh({ sgoCurriculoId: 'abc', situacao: 'quase aprovado' })).toMatchObject({ ok: false });
    expect(validarRetornoDoRh({ sgoCurriculoId: 'abc', situacao: 'aprovado', entrevistaEm: 'amanhã' })).toMatchObject({ ok: false });
    expect(validarRetornoDoRh({ rhCandidatoId: 'rh-9', situacao: 'aprovado' })).toMatchObject({ ok: true });
  });
  it('o mesmo evento de novo é repetição; mudou a observação, não é', () => {
    const v = validarRetornoDoRh({ sgoCurriculoId: 'abc', situacao: 'em_analise', observacao: 'ok' });
    if (!v.ok) throw new Error('inválido');
    expect(ehRepeticao({ status: 'EM_ANALISE', statusNote: 'ok', interviewAt: null }, v.dados)).toBe(true);
    expect(ehRepeticao({ status: 'EM_ANALISE', statusNote: null, interviewAt: null }, v.dados)).toBe(false);
    expect(ehRepeticao({ status: 'RECEBIDO', statusNote: 'ok', interviewAt: null }, v.dados)).toBe(false);
  });
  it('o aviso ao gerente diz a situação e a entrevista; entrevista, aprovado e contratado são importantes', () => {
    const v = validarRetornoDoRh({ sgoCurriculoId: 'abc', situacao: 'entrevista_agendada', entrevistaEm: '2026-11-25T14:00:00-03:00' });
    if (!v.ok) throw new Error('inválido');
    const m = mensagemParaOGerente('Maria da Silva', v.dados);
    expect(m.title).toBe('Currículo — Entrevista agendada');
    expect(m.body).toContain('Maria da Silva');
    expect(m.body).toContain('25/11');
    expect(m.importante).toBe(true);
    const r = validarRetornoDoRh({ sgoCurriculoId: 'abc', situacao: 'em_analise' });
    if (!r.ok) throw new Error('inválido');
    expect(mensagemParaOGerente('Maria', r.dados).importante).toBe(false);
  });
});
