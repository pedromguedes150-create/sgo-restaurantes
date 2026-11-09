import { describe, it, expect } from 'vitest';
import {
  validarRetornoDoRh, ehRepeticao, podeCorrigir, contemDadoMedico, mensagemParaOGerente,
  SITUACOES_DO_RH, MOTIVOS_DE_CORRECAO, SITUACOES_SEM_EFEITO_NA_ESCALA, rotuloDoMotivo,
} from '@/lib/certificates/retorno-rh-regras';

/**
 * RETORNO DO RH (v1.197.0) — o contrato do evento `atestado-situacao`, PURO.
 * Casos 13 (devolvido pelo RH) e 16 (repetição sem duplicar) da spec.
 */
const ok = (p: Record<string, unknown>) => { const v = validarRetornoDoRh(p); if (!v.ok) throw new Error(v.erro); return v.dados; };
const erro = (p: Record<string, unknown>) => { const v = validarRetornoDoRh(p); return v.ok ? null : v.erro; };

describe('validarRetornoDoRh', () => {
  it('as cinco situações do RH mapeiam para as situações do SGO; grafia com hífen e maiúsculas é aceita', () => {
    expect(SITUACOES_DO_RH).toEqual({ em_analise: 'EM_ANALISE_RH', validado: 'VALIDADO_RH', correcao_solicitada: 'CORRECAO_SOLICITADA', nao_aceito: 'NAO_ACEITO', concluido: 'CONCLUIDO' });
    expect(ok({ sgoMovimentoId: 'abc', situacao: 'Validado' }).status).toBe('VALIDADO_RH');
    expect(ok({ sgoMovimentoId: 'abc', situacao: 'em-analise' }).status).toBe('EM_ANALISE_RH');
  });

  it('sgoMovimentoId e situacao são obrigatórios; situação fora da lista é recusada', () => {
    expect(erro({ situacao: 'validado' })).toMatch(/sgoMovimentoId/);
    expect(erro({ sgoMovimentoId: 'abc' })).toMatch(/situacao inválida/);
    expect(erro({ sgoMovimentoId: 'abc', situacao: 'aprovado' })).toMatch(/situacao inválida/);
  });

  it('caso 13: correção solicitada e não aceito EXIGEM motivo (da lista) e observação', () => {
    expect(erro({ sgoMovimentoId: 'abc', situacao: 'correcao_solicitada' })).toMatch(/motivo é obrigatório/);
    expect(erro({ sgoMovimentoId: 'abc', situacao: 'correcao_solicitada', motivo: 'ilegivel' })).toMatch(/observacao é obrigatória/);
    expect(erro({ sgoMovimentoId: 'abc', situacao: 'nao_aceito', motivo: 'qualquer', observacao: 'x' })).toMatch(/motivo desconhecido/);
    const r = ok({ sgoMovimentoId: 'abc', situacao: 'correcao_solicitada', motivo: 'foto-cortada', observacao: 'Envie o documento inteiro.' });
    expect(r.motivo).toBe('foto_cortada');
    expect(r.status).toBe('CORRECAO_SOLICITADA');
    expect(Object.keys(MOTIVOS_DE_CORRECAO)).toEqual(['ilegivel', 'foto_cortada', 'incompleto', 'colaborador_incorreto', 'datas_divergentes', 'documento_complementar', 'classificacao_revisar', 'outro']);
    expect(rotuloDoMotivo('foto_cortada')).toBe('Foto cortada');
    expect(rotuloDoMotivo(null)).toBeNull();
  });

  it('a observação vai para o gerente: CID ou a palavra "CID" são barrados; texto comum passa', () => {
    expect(contemDadoMedico('Atestado de J11 ilegível')).toBe(true);
    expect(contemDadoMedico('M54.5 — lombalgia')).toBe(true);
    expect(contemDadoMedico('Confira o CID do documento')).toBe(true);
    expect(contemDadoMedico('Foto cortada — envie o documento inteiro.')).toBe(false);
    expect(contemDadoMedico('Prazo de 15 dias confirmado')).toBe(false); // número solto não é CID
    expect(contemDadoMedico(null)).toBe(false);
    expect(erro({ sgoMovimentoId: 'abc', situacao: 'correcao_solicitada', motivo: 'outro', observacao: 'Ilegível o J11' })).toMatch(/não pode conter CID/);
    expect(erro({ sgoMovimentoId: 'abc', situacao: 'validado', observacao: 'x'.repeat(501) })).toMatch(/500/);
  });

  it('nomenclaturaRh: nome do catálogo é aplicado; nome fora do catálogo fica registrado e não aplicado', () => {
    const r = ok({ sgoMovimentoId: 'abc', situacao: 'validado', nomenclaturaRh: 'licença-casamento' });
    expect(r.nomenclatura?.nome).toBe('Licença-casamento');
    expect(r.nomenclaturaDesconhecida).toBeNull();
    const d = ok({ sgoMovimentoId: 'abc', situacao: 'validado', nomenclaturaRh: 'Declaração de frequência' });
    expect(d.nomenclatura).toBeNull();
    expect(d.nomenclaturaDesconhecida).toBe('Declaração de frequência');
  });

  it('caso 16: o mesmo evento duas vezes é REPETIÇÃO (mesma situação, motivo e observação); mudar qualquer um não é', () => {
    const novo = ok({ sgoMovimentoId: 'abc', situacao: 'correcao_solicitada', motivo: 'ilegivel', observacao: 'Tire outra foto.' });
    expect(ehRepeticao({ status: 'CORRECAO_SOLICITADA', statusMotivo: 'ilegivel', statusNote: 'Tire outra foto.' }, novo)).toBe(true);
    expect(ehRepeticao({ status: 'CORRECAO_SOLICITADA', statusMotivo: 'ilegivel', statusNote: 'Outro texto.' }, novo)).toBe(false);
    expect(ehRepeticao({ status: 'ENVIADO_RH', statusMotivo: null, statusNote: null }, novo)).toBe(false);
  });

  it('o gerente só corrige em "Correção solicitada"; "Não aceito" tira o efeito da Escala', () => {
    expect(podeCorrigir('CORRECAO_SOLICITADA')).toBe(true);
    expect(podeCorrigir('NAO_ACEITO')).toBe(false);
    expect(podeCorrigir('ENVIADO_RH')).toBe(false);
    expect(SITUACOES_SEM_EFEITO_NA_ESCALA).toEqual(['NAO_ACEITO']);
  });

  it('a mensagem ao gerente nomeia documento, colaborador e motivo; correção e recusa são IMPORTANTES; nada de CID', () => {
    const r = ok({ sgoMovimentoId: 'abc', situacao: 'correcao_solicitada', motivo: 'foto_cortada', observacao: 'Envie o documento inteiro.' });
    const m = mensagemParaOGerente(r, 'João Silva', 'Atestado médico');
    expect(m.title).toMatch(/pediu correção/);
    expect(m.body).toContain('Atestado médico de João Silva');
    expect(m.body).toContain('Foto cortada');
    expect(m.body).toContain('Corrigir e reenviar');
    expect(m.importante).toBe(true);
    const v = mensagemParaOGerente(ok({ sgoMovimentoId: 'abc', situacao: 'validado' }), 'João Silva', 'Licença-paternidade');
    expect(v.importante).toBe(false);
    expect(v.body).toBe('Licença-paternidade de João Silva foi validado pelo RH.');
  });
});
