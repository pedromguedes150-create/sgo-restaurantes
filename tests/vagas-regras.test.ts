import { describe, it, expect } from 'vitest';
import {
  acoesDaVaga, codigoDaVaga, contemCpf, dataMinimaDaEdicao, diferencasDaEdicao, inicioMaisCedo, normalizarVaga, numeroDaVaga, numeroDoCurriculo,
  resumoDeTexto, resumoDosCargos, sgoCurriculoId, sgoVagaId, tipoDoArquivo, tipoDoEventoDeCurriculo, TIPOS_DE_EVENTO, TIPO_MAX, validarVaga,
  type PessoaDaVaga, type StatusDaVaga,
} from '@/lib/vagas/regras';
import { SITUACOES_DO_RH, situacaoDoRh, seloDoCurriculo, resumoDosCurriculos, desfechoDoFluxo } from '@/lib/vagas/curriculo-situacao';
import { classificarResposta, corpoAtualizar, corpoCancelar, corpoCriar, corpoCurriculo, ehRetornoDeVaga, esperaAteAProxima, itensDoLote, validarRetornoDaVaga, validarRetornoDoCurriculo, type VagaParaEnviar } from '@/lib/vagas/contrato-rh';
import type { CurriculoDTO } from '@/lib/vagas/tipos';

const HOJE = '2026-11-27';
const pessoa = (over: Partial<PessoaDaVaga> = {}): PessoaDaVaga => ({ cargo: 'Garçom', motivo: 'AUMENTO_QUADRO', escala: '6x1', horario: '11:00 às 19:20', inicioDesejado: '2026-12-01', ...over });
const vaga = (pessoas: PessoaDaVaga[], over: Record<string, unknown> = {}) => normalizarVaga({ unitId: 'u1', prioridade: 'NORMAL', pessoas, ...over });

describe('formulário — validação', () => {
  it('formulário completo passa; requisitos e observação são opcionais; não existe salário', () => {
    const d = vaga([pessoa()]);
    expect(validarVaga(d, { dataMinima: HOJE })).toEqual([]);
    expect(Object.keys(d.pessoas[0])).not.toContain('salario');
  });

  it('cada campo que falta dá UMA mensagem', () => {
    const erros = validarVaga(vaga([pessoa({ cargo: '', motivo: '', escala: '', horario: '', inicioDesejado: '' })]), { dataMinima: HOJE });
    expect(erros.map((e) => e.campo).sort()).toEqual(['cargo', 'escala', 'horario', 'inicioDesejado', 'motivo']);
    expect(erros.every((e) => !e.mensagem.startsWith('Pessoa'))).toBe(true);
  });

  it('substituição exige dizer quem sai; com várias pessoas a mensagem diz qual', () => {
    const erros = validarVaga(vaga([pessoa(), pessoa({ motivo: 'SUBSTITUICAO' })]), { dataMinima: HOJE });
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatchObject({ pessoa: 2, campo: 'substitui' });
    expect(erros[0].mensagem).toMatch(/^Pessoa 2: /);
    expect(validarVaga(vaga([pessoa({ motivo: 'SUBSTITUICAO', substituiNome: 'Fulano de Tal' })]), { dataMinima: HOJE })).toEqual([]);
  });

  it('início antes de hoje não passa; unidade e quantidade (1 a 20) são conferidas', () => {
    expect(validarVaga(vaga([pessoa({ inicioDesejado: '2026-11-26' })]), { dataMinima: HOJE })[0].campo).toBe('inicioDesejado');
    expect(validarVaga(vaga([pessoa({ inicioDesejado: '2026-02-31' })]), { dataMinima: HOJE })[0].campo).toBe('inicioDesejado');
    expect(validarVaga(vaga([pessoa()], { unitId: '' }), { dataMinima: HOJE })[0].campo).toBe('unitId');
    expect(validarVaga(vaga([]), { dataMinima: HOJE })[0].campo).toBe('pessoas');
    expect(validarVaga(vaga(Array.from({ length: 21 }, () => pessoa())), { dataMinima: HOJE }).some((e) => e.campo === 'pessoas')).toBe(true);
  });

  it('na edição, o início que a vaga JÁ tinha no passado não trava a correção', () => {
    expect(dataMinimaDaEdicao(HOJE, '2026-11-20')).toBe('2026-11-20');
    expect(dataMinimaDaEdicao(HOJE, '2026-12-05')).toBe(HOJE);
    expect(validarVaga(vaga([pessoa({ inicioDesejado: '2026-11-20' })]), { dataMinima: '2026-11-20' })).toEqual([]);
  });

  it('resumo: cargos contados, o início mais cedo e o texto por pessoa', () => {
    const ps = [pessoa({ requisitos: 'Experiência' }), pessoa({ requisitos: 'Experiência', inicioDesejado: '2026-11-30' }), pessoa({ cargo: 'Cozinheiro', requisitos: 'Curso de cozinha' })];
    expect(resumoDosCargos(ps)).toBe('2× Garçom · 1× Cozinheiro');
    expect(inicioMaisCedo(ps)).toBe('2026-11-30');
    expect(resumoDeTexto(ps, 'requisitos')).toBe('Pessoa 1 (Garçom): Experiência\nPessoa 2 (Garçom): Experiência\nPessoa 3 (Cozinheiro): Curso de cozinha');
    expect(resumoDeTexto([pessoa({ requisitos: 'Igual' }), pessoa({ requisitos: 'Igual' })], 'requisitos')).toBe('Igual');
    expect(resumoDeTexto([pessoa()], 'observacao')).toBeNull();
  });
});

describe('quem faz o quê — a tabela exata', () => {
  const T: [StatusDaVaga, string[], string[]][] = [
    ['PENDENTE_APROVACAO', ['anexar', 'cancelar'], ['aprovar', 'devolver', 'cancelar', 'editar', 'excluir']],
    ['DEVOLVIDA', ['corrigir', 'anexar', 'cancelar'], ['cancelar', 'editar', 'excluir']],
    ['APROVADA', ['anexar'], ['anexar', 'avaliarCurriculo', 'cancelar', 'editar', 'excluir']],
    ['CONCLUIDA', [], ['excluir']],
    ['CANCELADA', [], ['excluir']],
  ];
  it.each(T)('%s', (status, dono, aprovador) => {
    expect(acoesDaVaga(status, { dono: true, aprovador: false }).sort()).toEqual([...dono].sort());
    expect(acoesDaVaga(status, { dono: false, aprovador: true }).sort()).toEqual([...aprovador].sort());
    expect(acoesDaVaga(status, { dono: false, aprovador: false })).toEqual([]);
  });
  it('o gerente nunca aprova, edita nem exclui', () => {
    for (const [s] of T) for (const a of ['aprovar', 'devolver', 'editar', 'excluir', 'avaliarCurriculo']) expect(acoesDaVaga(s, { dono: true, aprovador: false })).not.toContain(a);
  });
});

describe('edição do supervisor — o que mudou', () => {
  it('uma linha por diferença; nada mudou = vazio', () => {
    const a = { prioridade: 'NORMAL', pessoas: [pessoa(), pessoa({ horario: '07:00' })] };
    expect(diferencasDaEdicao(a, a)).toEqual([]);
    const d = { prioridade: 'URGENTE', pessoas: [pessoa(), pessoa({ horario: '07:00 às 15:20' })] };
    expect(diferencasDaEdicao(a, d)).toEqual(['Prioridade: Normal → Urgente', 'Pessoa 2: horário 07:00 → 07:00 às 15:20']);
  });
  it('pessoa incluída e removida aparecem', () => {
    const a = { prioridade: 'NORMAL', pessoas: [pessoa()] };
    expect(diferencasDaEdicao(a, { prioridade: 'NORMAL', pessoas: [pessoa(), pessoa({ cargo: 'Caixa' })] })).toEqual(['Pessoas: 1 → 2', 'Pessoa 2 (Caixa): incluída']);
    expect(diferencasDaEdicao({ prioridade: 'NORMAL', pessoas: [pessoa(), pessoa({ cargo: 'Caixa' })] }, a)).toContain('Pessoa 2 (Caixa): removida');
  });
});

describe('identificadores — não colidem com o SGO dos postos', () => {
  it('o prefixo é o do Restaurante, na ida e na volta', () => {
    expect([codigoDaVaga(12), sgoVagaId(12), sgoCurriculoId(31)]).toEqual(['VAGR-0012', 'rest-vaga-12', 'rest-cv-31']);
    expect(numeroDaVaga('rest-vaga-12')).toBe(12);
    expect(numeroDoCurriculo('rest-cv-31')).toBe(31);
  });
  it('o identificador de outro sistema não é aceito', () => {
    for (const x of ['vaga-12', 'VAGR-0012', '12', 'rest-vaga-', 'rest-vaga-1; DROP', '']) expect(numeroDaVaga(x)).toBeNull();
    expect(numeroDoCurriculo('cv-31')).toBeNull();
  });
});

describe('arquivo e CPF', () => {
  it('o tipo sai do conteúdo; DOC e DOCX precisam da extensão; o resto é recusado', () => {
    expect(tipoDoArquivo(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'a.txt')).toBe('pdf');
    expect(tipoDoArquivo(new Uint8Array([0xff, 0xd8, 0xff]), 'a')).toBe('jpg');
    expect(tipoDoArquivo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'a')).toBe('png');
    expect(tipoDoArquivo(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'cv.docx')).toBe('docx');
    expect(tipoDoArquivo(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'virus.zip')).toBeNull();
    expect(tipoDoArquivo(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'cv.doc')).toBe('doc');
    expect(tipoDoArquivo(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), 'cv.pdf')).toBeNull();
  });
  it('reconhece CPF com e sem pontuação, e não confunde telefone nem data', () => {
    expect(contemCpf('CPF 123.456.789-09')).toBe(true);
    expect(contemCpf('doc 12345678909 ok')).toBe(true);
    expect(contemCpf('ligar (31) 99999-0000 em 01/12/2026')).toBe(false);
    expect(contemCpf('vaga 1234567890123')).toBe(false);
  });
});

describe('tipos de evento cabem na coluna', () => {
  it('todo tipo tem até 30 caracteres — inclusive os de currículo', () => {
    for (const t of TIPOS_DE_EVENTO) expect(t.length, t).toBeLessThanOrEqual(TIPO_MAX);
    for (const s of SITUACOES_DO_RH) expect(tipoDoEventoDeCurriculo(s.slug).length, s.slug).toBeLessThanOrEqual(TIPO_MAX);
    expect(tipoDoEventoDeCurriculo('entrevista_tecnica')).toBe('RH_CV_ENTREVISTA_TECNICA');
  });
});

describe('situação do currículo', () => {
  it('aceita como está na tela do RH: acento, caixa, barra e sinônimos', () => {
    expect(situacaoDoRh('Recrutamento/Seleção')).toBe('recrutamento_selecao');
    expect(situacaoDoRh('Entrevista técnica')).toBe('entrevista_tecnica');
    expect(situacaoDoRh('EM ANÁLISE')).toBe('em_analise');
    expect(situacaoDoRh('desistiu')).toBe('desistencia');
    expect(situacaoDoRh('Banco de Talentos')).toBe('banco_de_talentos');
    expect(situacaoDoRh('qualquer coisa')).toBeNull();
  });
  it('o desfecho do currículo enviado depois', () => {
    expect(desfechoDoFluxo('contratado')).toBe('APROVADO_RH');
    expect(desfechoDoFluxo('banco_de_talentos')).toBe('REPROVADO_RH');
    expect(desfechoDoFluxo('em_analise')).toBeNull();
  });
  const cv = (over: Partial<CurriculoDTO> = {}): CurriculoDTO => ({ id: 'c', number: 1, nomeArquivo: 'a.pdf', mime: 'application/pdf', tamanho: 1, indicadoPor: null, enviadoPorId: null, enviadoPorNome: 'G', enviadoEm: '2026-11-27T12:00:00.000Z', removido: false, fluxo: null, decididoPorNome: null, decididoEm: null, motivoRecusa: null, rhEnvioSituacao: null, rhEnvioMotivo: null, rhSituacao: null, rhSituacaoEm: null, rhObservacao: null, ...over });
  const v = (over: Record<string, unknown> = {}) => ({ status: 'APROVADA' as StatusDaVaga, rhChegouEm: null, rhEnvioSituacao: 'NA_FILA', rhEnvioAcao: 'criar', ...over });
  it('antes de o RH responder, o selo é o que o SGO sabe', () => {
    expect(seloDoCurriculo(cv(), v({ status: 'PENDENTE_APROVACAO' })).rotulo).toBe('Aguardando a aprovação da vaga');
    expect(seloDoCurriculo(cv(), v()).rotulo).toBe('Indo para o RH');
    expect(seloDoCurriculo(cv(), v({ rhChegouEm: 'x' })).rotulo).toBe('Entregue ao RH');
    expect(seloDoCurriculo(cv(), v({ rhEnvioSituacao: 'ERRO' })).rotulo).toBe('Não chegou ao RH');
    expect(seloDoCurriculo(cv({ fluxo: 'AGUARDANDO_SUPERVISOR' }), v()).rotulo).toBe('Aguardando o supervisor');
    expect(seloDoCurriculo(cv({ fluxo: 'RECUSADO', motivoRecusa: 'arquivo errado' }), v()).rotulo).toBe('Recusado pelo supervisor');
  });
  it('depois, o status do RH; e o resumo em cima da lista', () => {
    expect(seloDoCurriculo(cv({ rhSituacao: 'reprovado', rhObservacao: 'perfil' }), v({ rhChegouEm: 'x' }))).toMatchObject({ rotulo: 'Reprovado', observacao: 'perfil' });
    const r = resumoDosCurriculos([cv({ rhSituacao: 'em_analise' }), cv({ id: 'd', rhSituacao: 'em_analise' }), cv({ id: 'e', rhSituacao: 'reprovado' }), cv({ id: 'f', removido: true })], v({ rhChegouEm: 'x' }));
    expect(r.texto).toBe('Currículos (3): 2 Em análise · 1 Reprovado');
  });
});

describe('contrato com o RH', () => {
  const dados: VagaParaEnviar = {
    number: 12, unidade: { id: 'u1', nome: 'Unidade', cnpj: '05.336.082/0009-10', razaoSocial: 'RAZÃO LTDA', endereco: null }, quantidade: 1,
    posicoes: [{ ordem: 1, cargo: 'Garçom', motivo: 'SUBSTITUICAO', substituiNome: 'Fulano', substituiCpf: '123.456.789-09', escala: '6x1', horario: '11:00 às 19:20', requisitos: null, observacao: null, inicioDesejado: '2026-12-01' }],
    requisitos: null, inicioDesejado: '2026-12-01', prioridade: 'NORMAL', observacao: null,
    solicitante: { nome: 'Gerente', email: 'g@e.com' }, solicitadoEm: '2026-11-27T12:00:00.000Z', aprovacao: { nome: 'Sup', email: null, aprovadoEm: '2026-11-27T13:00:00.000Z' }, codigoRh: null,
  };
  it('criar: o mesmo corpo do SGO dos postos, com o sistema e os prefixos do Restaurante e salário nulo', () => {
    const c = corpoCriar(dados, [{ number: 5, nomeArquivo: 'a.pdf', contentType: 'application/pdf', indicadoPor: null, conteudoBase64: 'QQ==' }]);
    expect(c).toMatchObject({ sgoVagaId: 'rest-vaga-12', codigoSgo: 'VAGR-0012', acao: 'criar', sistema: 'SGO Restaurante', quantidade: 1, cancelamento: null });
    expect(c.unidade).toMatchObject({ sgoUnidadeId: 'u1', cnpj: '05336082000910' });
    expect(c.posicoes[0]).toMatchObject({ salario: null, substitui: { nome: 'Fulano', cpf: '12345678909' }, inicioDesejado: '2026-12-01' });
    expect(c.curriculos[0]).toMatchObject({ sgoCurriculoId: 'rest-cv-5', conteudoBase64: 'QQ==' });
  });
  it('atualizar e cancelar usam o mesmo identificador e não levam currículo', () => {
    expect(corpoAtualizar(dados)).toMatchObject({ acao: 'atualizar', sgoVagaId: 'rest-vaga-12', curriculos: [] });
    expect(corpoCancelar(dados, { motivo: 'm', por: 'p', canceladoEm: 'x' })).toMatchObject({ acao: 'cancelar', curriculos: [], cancelamento: { motivo: 'm' } });
  });
  it('currículo novo: sem posições nem unidade', () => {
    const c = corpoCurriculo({ number: 12, codigoRh: 'RH-9' }, { number: 31, nomeArquivo: 'b.pdf', contentType: 'application/pdf', indicadoPor: 'Zé', conteudoBase64: 'QQ==' }, { gerente: { nome: 'G', email: null }, anexadoEm: 'x', supervisor: null, aprovadoEm: null, observacao: null });
    expect(c).toMatchObject({ acao: 'curriculo', codigoVaga: 'RH-9', sistema: 'SGO Restaurante' });
    expect(c).not.toHaveProperty('posicoes');
    expect(c).not.toHaveProperty('unidade');
  });
  it('resposta do RH: 2xx e 409 = enviado; 400/413/422/401/403 = erro; o resto = falha', () => {
    expect(classificarResposta(201, { rhVagaId: 'x1', codigoVaga: 'V-7' })).toEqual({ situacao: 'ENVIADO', rhVagaId: 'x1', codigoVaga: 'V-7' });
    expect(classificarResposta(409, { error: 'já existe' }).situacao).toBe('ENVIADO');
    for (const s of [400, 413, 422, 401, 403]) expect(classificarResposta(s, { error: 'x' }).situacao, String(s)).toBe('ERRO');
    for (const s of [404, 408, 429, 500, 502, 503]) expect(classificarResposta(s, 'x').situacao, String(s)).toBe('FALHA');
    expect(classificarResposta(200, '<!DOCTYPE html><html>')).toMatchObject({ situacao: 'FALHA' });
  });
  it('a espera cresce: 5 min, 15 min, 1 h, 3 h e depois 6 h', () => {
    const MIN = 60_000;
    expect([1, 2, 3, 4, 5, 9].map(esperaAteAProxima)).toEqual([5 * MIN, 15 * MIN, 60 * MIN, 180 * MIN, 360 * MIN, 360 * MIN]);
  });
  it('rota 2: situação da lista, CPF recusado, hífen aceito', () => {
    expect(validarRetornoDaVaga({ sgoVagaId: 'rest-vaga-1', situacao: 'Vaga-Numerada', codigoVaga: 'V-1' })).toMatchObject({ ok: true, dados: { situacao: 'vaga_numerada', codigoVaga: 'V-1' } });
    expect(validarRetornoDaVaga({ sgoVagaId: 'rest-vaga-1', situacao: 'inventada' }).ok).toBe(false);
    expect(validarRetornoDaVaga({ situacao: 'recebida' }).ok).toBe(false);
    expect(validarRetornoDaVaga({ sgoVagaId: 'rest-vaga-1', situacao: 'em_selecao', candidato: 'Fulano 123.456.789-09' }).ok).toBe(false);
    expect(validarRetornoDaVaga({ sgoVagaId: 'rest-vaga-1', situacao: 'em_selecao', observacao: 'cpf 12345678909' }).ok).toBe(false);
  });
  it('rota 3: status como na tela do RH; desconhecido lista as opções; CPF recusado', () => {
    expect(validarRetornoDoCurriculo({ sgoCurriculoId: 'rest-cv-3', situacao: 'Recrutamento/Seleção' })).toMatchObject({ ok: true, dados: { situacao: 'recrutamento_selecao' } });
    const ruim = validarRetornoDoCurriculo({ sgoCurriculoId: 'rest-cv-3', situacao: 'xpto' });
    expect(ruim.ok).toBe(false);
    if (!ruim.ok) expect(ruim.erro).toContain('em_analise');
    expect(validarRetornoDoCurriculo({ sgoCurriculoId: 'rest-cv-3', situacao: 'aprovado', observacao: '123.456.789-09' }).ok).toBe(false);
  });
  it('o mesmo endereço serve à Central antiga: só o prefixo deste módulo (ou o lote) cai aqui', () => {
    expect(ehRetornoDeVaga({ sgoCurriculoId: 'rest-cv-3' })).toBe(true);
    expect(ehRetornoDeVaga({ curriculos: [] })).toBe(true);
    expect(ehRetornoDeVaga({ sgoCurriculoId: 'clx9abc123' })).toBe(false);
    expect(itensDoLote({ curriculos: [1, 2] })).toEqual({ lote: true, itens: [1, 2] });
    expect(itensDoLote({ sgoCurriculoId: 'x' }).lote).toBe(false);
  });
});
