import { describe, it, expect } from 'vitest';
import {
  MAX_TENTATIVAS, ENDPOINTS, caminhoDaSituacao, esperaDaTentativaMin, proximaTentativa, classificarResposta, motivoDaResposta,
  extrairRhId, extrairPrazo, mascararCpf, mascararCpfsNoTexto, mascararCpfNoObjeto, anexoAceito, nomeDoAnexo,
  motivoDoAtestado, payloadAtestado, payloadDesligamento, payloadDemanda, validarDesligamento, tipoSemAviso, rotuloDaSituacao,
} from '@/lib/rh/saida/regras';

/**
 * As REGRAS do envio SGO → GBF-RH (v1.168.0), sem banco e sem rede.
 *
 * O contrato do RH é fechado: cada campo abaixo está no documento de 14/10 e
 * nenhum outro pode aparecer. Os testes travam a forma dos três corpos, a
 * leitura das respostas (regra 3) e a máscara de CPF do log (regra 4).
 */

describe('Espera crescente', () => {
  it('dobra a cada falha e para em 8 horas: 1, 2, 4, …, 480 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(esperaDaTentativaMin)).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 480]);
    expect(esperaDaTentativaMin(11)).toBe(480);
    expect(esperaDaTentativaMin(0)).toBe(1);
  });
  it('a próxima tentativa é agora + a espera da tentativa feita', () => {
    const agora = new Date('2026-10-14T12:00:00Z');
    expect(proximaTentativa(agora, 1).toISOString()).toBe('2026-10-14T12:01:00.000Z');
    expect(proximaTentativa(agora, 3).toISOString()).toBe('2026-10-14T12:04:00.000Z');
  });
  it('são 10 tentativas', () => { expect(MAX_TENTATIVAS).toBe(10); });
});

describe('Classificação da resposta (regra 3 do contrato)', () => {
  it('2xx = enviado; corpo "duplicado" = enviado mesmo fora do 2xx', () => {
    expect(classificarResposta(201, { status: 'processado', rhAtestadoId: 'x' })).toEqual({ resultado: 'ENVIADO', duplicado: false });
    expect(classificarResposta(200, { status: 'duplicado' })).toEqual({ resultado: 'ENVIADO', duplicado: true });
    expect(classificarResposta(409, { status: 'duplicado' })).toEqual({ resultado: 'ENVIADO', duplicado: true });
  });
  it('400/422/409 = erro de dados, com o resultado do RH no motivo', () => {
    for (const st of [400, 422, 409, 403]) expect(classificarResposta(st, { resultado: 'CPF não encontrado' }).resultado).toBe('ERRO');
    const c = classificarResposta(422, { resultado: 'período sobreposto' });
    expect(c.resultado === 'ERRO' && c.motivo).toBe('HTTP 422 — período sobreposto');
  });
  it('401 = token; 404/408/429/5xx = adiar', () => {
    expect(classificarResposta(401, { error: 'unauthorized' }).resultado).toBe('TOKEN');
    for (const st of [404, 408, 429, 500, 502, 503]) expect(classificarResposta(st, 'x').resultado).toBe('ADIAR');
  });
  it('o motivo nunca carrega CPF completo', () => {
    expect(motivoDaResposta({ error: 'CPF 12345678901 já cadastrado' }, 422)).toBe('HTTP 422 — CPF 123.***.***-01 já cadastrado');
  });
  it('extrai o id devolvido conforme o tipo, e o prazo', () => {
    expect(extrairRhId('ATESTADO', { rhAtestadoId: 'A1' })).toBe('A1');
    expect(extrairRhId('DESLIGAMENTO', { processo: 'P-9', prazoLegal: '2026-11-01' })).toBe('P-9');
    expect(extrairPrazo('DESLIGAMENTO', { processo: 'P-9', prazoLegal: '2026-11-01' })).toBe('2026-11-01');
    expect(extrairRhId('DEMANDA', { numero: 77, prazoAlvo: '2026-10-20' })).toBe('77');
    expect(extrairPrazo('DEMANDA', { numero: 77, prazoAlvo: '2026-10-20' })).toBe('2026-10-20');
    expect(extrairRhId('ATESTADO', 'texto')).toBeNull();
  });
  it('caminho da situação só para desligamento e demanda', () => {
    expect(caminhoDaSituacao('DESLIGAMENTO', 'abc')).toBe(`${ENDPOINTS.DESLIGAMENTO}/abc`);
    expect(caminhoDaSituacao('DEMANDA', 'abc')).toBe(`${ENDPOINTS.DEMANDA}/abc`);
    expect(caminhoDaSituacao('ATESTADO', 'abc')).toBeNull();
  });
});

describe('Máscara de CPF (regra 4)', () => {
  it('123.***.***-45', () => {
    expect(mascararCpf('12345678945')).toBe('123.***.***-45');
    expect(mascararCpf('123.456.789-45')).toBe('123.***.***-45');
    expect(mascararCpf('')).toBe('');
    expect(mascararCpf('123')).toBe('***');
  });
  it('mascara dentro de texto e dentro de objetos (chave cpf), sem tocar no resto', () => {
    expect(mascararCpfsNoTexto('erro no CPF 123.456.789-45 e 98765432100')).toBe('erro no CPF 123.***.***-45 e 987.***.***-00');
    expect(mascararCpfNoObjeto({ cpf: '12345678945', nome: 'Ana', lista: [{ cpf: '98765432100' }] })).toEqual({ cpf: '123.***.***-45', nome: 'Ana', lista: [{ cpf: '987.***.***-00' }] });
  });
});

describe('Anexo', () => {
  it('aceita PDF/JPG/PNG até 10 MB; recusa o resto com motivo', () => {
    expect(anexoAceito('uploads/u/x.pdf', 1000)).toEqual({ ok: true });
    expect(anexoAceito('uploads/u/x.JPG', 1000)).toEqual({ ok: true });
    expect(anexoAceito('uploads/u/x.webp', 1000).ok).toBe(false);
    expect(anexoAceito('uploads/u/x.png', 11 * 1024 * 1024).ok).toBe(false);
    expect(nomeDoAnexo('uploads/u/foto-123.jpg')).toBe('foto-123.jpg');
  });
});

describe('Payload do atestado (A1)', () => {
  const base = { id: 'cert1', cpf: '12345678945', type: 'FULL_DAY' as const, startDate: '2026-10-01', endDate: '2026-10-03', cid: 'J11', observation: 'repouso' };
  it('motivo pelo tipo: FULL_DAY→DOENCA, COMPANION→ACOMPANHANTE, HOURS→OUTROS', () => {
    expect(motivoDoAtestado('FULL_DAY')).toBe('DOENCA');
    expect(motivoDoAtestado('COMPANION')).toBe('ACOMPANHANTE');
    expect(motivoDoAtestado('HOURS')).toBe('OUTROS');
  });
  it('só os campos do contrato, tipo sempre "A", sgoMovimentoId = id do atestado', () => {
    const p = payloadAtestado(base, 'criar');
    expect(p).toEqual({ sgoMovimentoId: 'cert1', acao: 'criar', cpf: '12345678945', tipo: 'A', tipoDetalhe: 'FULL_DAY', dataInicio: '2026-10-01', dataFim: '2026-10-03', motivo: 'DOENCA', cid: 'J11', observacoes: 'repouso' });
    expect(Object.keys(p)).not.toContain('anexo'); // o anexo entra só na hora de enviar
    expect(Object.keys(p)).not.toContain('sgoEventId'); // a fila põe
  });
  it('cid e observações só quando existem; as quatro ações têm a mesma forma', () => {
    const p = payloadAtestado({ ...base, cid: null, observation: '  ' }, 'cancelar');
    expect(p).not.toHaveProperty('cid');
    expect(p).not.toHaveProperty('observacoes');
    for (const acao of ['criar', 'atualizar', 'cancelar', 'retorno'] as const) expect(payloadAtestado(base, acao).acao).toBe(acao);
  });
});

describe('Pedido de desligamento (A2)', () => {
  const d = { terminationKind: 'DISPENSA_SEM_JUSTA_CAUSA' as const, noticeMode: 'TRABALHADO_7DIAS' as const, reasonCode: 'DESEMPENHO' as const, terminationDate: '2026-10-30', reason: 'baixo rendimento', cpf: '12345678945', unitCnpj: '42.790.781/0001-05', solicitanteNome: 'Gabriel', solicitanteEmail: 'g@x.com' };
  it('valores do contrato em minúsculas e CNPJ só dígitos', () => {
    expect(payloadDesligamento(d)).toEqual({ cpf: '12345678945', unitCode: '42790781000105', dataDesligamento: '2026-10-30', tipo: 'dispensa_sem_justa_causa', modalidadeAviso: 'trabalhado_7dias', motivo: 'desempenho', observacao: 'baixo rendimento', solicitanteNome: 'Gabriel', solicitanteEmail: 'g@x.com' });
  });
  it('justa causa e término de experiência NÃO levam modalidade de aviso', () => {
    expect(tipoSemAviso('JUSTA_CAUSA')).toBe(true);
    expect(tipoSemAviso('TERMINO_EXPERIENCIA')).toBe(true);
    expect(tipoSemAviso('PEDIDO_DEMISSAO')).toBe(false);
    expect(payloadDesligamento({ ...d, terminationKind: 'JUSTA_CAUSA' })).not.toHaveProperty('modalidadeAviso');
  });
  it('motivo "outro" manda o texto em justificativa, não em observacao', () => {
    const p = payloadDesligamento({ ...d, reasonCode: 'OUTRO', reason: 'mudança de cidade' });
    expect(p.justificativa).toBe('mudança de cidade');
    expect(p).not.toHaveProperty('observacao');
  });
  it('validação: carta no pedido de demissão, justificativa no "outro", aviso obrigatório fora dos tipos sem aviso', () => {
    expect(validarDesligamento({ ...d, terminationKind: 'PEDIDO_DEMISSAO', letterPath: null }).ok).toBe(false);
    expect(validarDesligamento({ ...d, terminationKind: 'PEDIDO_DEMISSAO', letterPath: 'uploads/u/carta.pdf' }).ok).toBe(true);
    expect(validarDesligamento({ ...d, reasonCode: 'OUTRO', reason: '' }).ok).toBe(false);
    expect(validarDesligamento({ ...d, noticeMode: null }).ok).toBe(false);
    expect(validarDesligamento({ ...d, terminationKind: 'JUSTA_CAUSA', noticeMode: null })).toEqual({ ok: true, noticeMode: null });
    /* modalidade informada num tipo sem aviso é IGNORADA, não recusada */
    expect(validarDesligamento({ ...d, terminationKind: 'TERMINO_EXPERIENCIA' })).toEqual({ ok: true, noticeMode: null });
    expect(validarDesligamento({ ...d, terminationDate: '30/10/2026' }).ok).toBe(false);
  });
});

describe('Demanda (A3)', () => {
  it('obrigatórios sempre; opcionais só com valor; título cortado em 200', () => {
    const p = payloadDemanda({ tipo: 'FERIAS', titulo: 'x'.repeat(250), solicitanteNome: 'Gabriel', prioridade: 'ALTA' });
    expect(p).toEqual({ tipo: 'ferias', titulo: 'x'.repeat(200), solicitanteNome: 'Gabriel', prioridade: 'alta' });
    const q = payloadDemanda({ tipo: 'MUDANCA_FUNCAO_SALARIO', titulo: 't', solicitanteNome: 'G', prioridade: 'NORMAL', descricao: 'd', cpf: '12345678945', unitCnpj: '42.790.781/0001-05', solicitanteEmail: 'g@x', dataEvento: '2026-10-20' });
    expect(q).toEqual({ tipo: 'mudanca_funcao_salario', titulo: 't', solicitanteNome: 'G', prioridade: 'normal', descricao: 'd', cpf: '12345678945', unitCode: '42790781000105', solicitanteEmail: 'g@x', dataEvento: '2026-10-20' });
    expect(payloadDemanda({ tipo: 'DUVIDA', titulo: 't', solicitanteNome: 'G', prioridade: 'URGENTE', dataEvento: 'ontem' })).not.toHaveProperty('dataEvento');
  });
  it('rótulo da situação', () => {
    expect(rotuloDaSituacao(null)).toBe('Aguardando envio ao RH');
    expect(rotuloDaSituacao('em_andamento')).toBe('Em andamento');
    expect(rotuloDaSituacao('outra')).toBe('outra');
  });
});
