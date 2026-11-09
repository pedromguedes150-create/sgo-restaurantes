import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import {
  NOMENCLATURAS, NOMES_DAS_NOMENCLATURAS, GRUPOS, ORDEM_DOS_GRUPOS, nomenclaturaPorNome, nomenclaturasDoGrupo,
  rotuloDoDocumento, grupoDoDocumento, efeitoNaEscala, conferirNome, fimSugerido, situacaoInicial, alertaDeDuracao,
  SITUACOES, SITUACOES_ANTES_DO_RH, normalizarNome,
} from '@/lib/certificates/catalogo';
import { interpretarResposta, listaDeNomenclaturasParaOPrompt, instrucoesDeLeitura } from '@/lib/ai/atestado';

/**
 * CENTRAL DE ATESTADOS E AFINS — o catálogo da planilha do Pedro (09/11/2026)
 * e a interpretação da leitura da IA. Os casos obrigatórios da spec que não
 * dependem de rede estão aqui; o que depende do banco está no .integration.
 */
describe('catálogo: nomenclaturas sem código, em quatro grupos', () => {
  it('são 25 nomenclaturas, todas com nome único, grupo válido e SEM código (AT-01, CO-03…)', () => {
    expect(NOMENCLATURAS.length).toBe(25);
    expect(new Set(NOMES_DAS_NOMENCLATURAS.map(normalizarNome)).size).toBe(25);
    for (const n of NOMENCLATURAS) {
      expect(ORDEM_DOS_GRUPOS).toContain(n.grupo);
      expect(n.nome).not.toMatch(/\b[A-Z]{2}-\d{2}\b/);
      expect(['FULL_DAY', 'HOURS', 'COMPANION']).toContain(n.tipo);
    }
    expect(Object.keys(GRUPOS).sort()).toEqual(['AFASTAMENTO', 'ATESTADO', 'COMPARECIMENTO', 'LICENCA']);
  });

  it('distribuição da planilha: 3 atestados, 2 afastamentos, 13 comparecimentos, 7 licenças (duração e aposentadoria não são documentos)', () => {
    expect(nomenclaturasDoGrupo('ATESTADO').map((n) => n.nome)).toEqual(['Atestado médico', 'Atestado odontológico', 'Declaração de internação']);
    expect(nomenclaturasDoGrupo('AFASTAMENTO').length).toBe(2);
    expect(nomenclaturasDoGrupo('COMPARECIMENTO').length).toBe(13);
    expect(nomenclaturasDoGrupo('LICENCA').length).toBe(7);
    expect(nomenclaturaPorNome('Aposentadoria')).toBeNull();
    expect(nomenclaturaPorNome('Atestado médico — acima de 15 dias')).toBeNull(); // a duração não cria nomenclatura
  });

  it('casa por nome exato ignorando acento e caixa, e por sinônimo exato; nada parecido → null', () => {
    expect(nomenclaturaPorNome('atestado medico')?.nome).toBe('Atestado médico');
    expect(nomenclaturaPorNome('LICENÇA-PATERNIDADE')?.nome).toBe('Licença-paternidade');
    expect(nomenclaturaPorNome('Declaração de comparecimento')?.nome).toBe('Consulta médica');
    expect(nomenclaturaPorNome('certidão de óbito')?.nome).toBe('Licença por falecimento (luto)');
    expect(nomenclaturaPorNome('Boleto de cobrança')).toBeNull(); // caso 18: documento fora da planilha
    expect(nomenclaturaPorNome('')).toBeNull();
    expect(nomenclaturaPorNome(null)).toBeNull();
  });

  it('caso 1 e 2: atestado de 3 dias e de 16 dias são a MESMA nomenclatura; o de 16 dispara o alerta INSS', () => {
    const tres = { documentGroup: 'ATESTADO' as const, nomenclature: 'Atestado médico', type: 'FULL_DAY' as const, days: 3 };
    const dezesseis = { ...tres, days: 16 };
    expect(rotuloDoDocumento(tres)).toBe(rotuloDoDocumento(dezesseis));
    expect(alertaDeDuracao(tres)).toBeNull();
    expect(alertaDeDuracao(dezesseis)).toBe('INSS');
    expect(alertaDeDuracao({ ...tres, days: 15 })).toBeNull(); // exatamente 15 ainda é da empresa
    // licença longa não é caso de INSS
    expect(alertaDeDuracao({ documentGroup: 'LICENCA', nomenclature: 'Licença-maternidade', type: 'FULL_DAY', days: 120 })).toBeNull();
  });

  it('o que cada grupo marca na Escala: atestado → A, INSS → AF, licença → LI, comparecimento de dia → FJ, declaração de horas → nada', () => {
    expect(efeitoNaEscala({ nomenclature: 'Atestado médico', type: 'FULL_DAY' })).toBe('ATESTADO');
    expect(efeitoNaEscala({ nomenclature: 'Afastamento pelo INSS', type: 'FULL_DAY' })).toBe('AFASTADO');
    expect(efeitoNaEscala({ nomenclature: 'Licença-paternidade', type: 'FULL_DAY' })).toBe('LICENCA');
    expect(efeitoNaEscala({ nomenclature: 'Doação voluntária de sangue', type: 'FULL_DAY' })).toBe('FALTA_JUST');
    expect(efeitoNaEscala({ nomenclature: 'Consulta médica', type: 'HOURS' })).toBeNull(); // caso 4: declaração de 2 horas não afasta o dia
    expect(efeitoNaEscala({ nomenclature: 'Alistamento eleitoral', type: 'FULL_DAY' })).toBe('FALTA_JUST'); // caso 7
    expect(efeitoNaEscala({ nomenclature: 'Licença-amamentação', type: 'FULL_DAY' })).toBe('LICENCA'); // caso 8
  });

  it('registro ANTERIOR ao catálogo (nomenclatura nula) segue a regra de sempre: HOURS não afasta, FULL_DAY e COMPANION marcam Atestado', () => {
    expect(efeitoNaEscala({ nomenclature: null, type: 'HOURS' })).toBeNull();
    expect(efeitoNaEscala({ nomenclature: null, type: 'FULL_DAY' })).toBe('ATESTADO');
    expect(efeitoNaEscala({ nomenclature: null, type: 'COMPANION' })).toBe('ATESTADO');
    expect(rotuloDoDocumento({ nomenclature: null, type: 'COMPANION' })).toBe('Acompanhamento de familiar');
    expect(grupoDoDocumento({ documentGroup: null, nomenclature: null, type: 'COMPANION' })).toBe('COMPARECIMENTO');
    expect(grupoDoDocumento({ documentGroup: null, nomenclature: null, type: 'FULL_DAY' })).toBe('ATESTADO');
  });

  it('caso 5: certidão de nascimento → Licença-paternidade com fim SUGERIDO pela regra geral (5 dias em 2026), nunca imposto', () => {
    const n = nomenclaturaPorNome('Licença-paternidade')!;
    expect(n.diasSugeridos).toBe(5);
    expect(fimSugerido(n, '2026-11-03')).toBe('2026-11-07');
    expect(fimSugerido(nomenclaturaPorNome('Licença-casamento'), '2026-11-03')).toBe('2026-11-05'); // 3 dias
    expect(fimSugerido(nomenclaturaPorNome('Licença por falecimento (luto)'), '2026-11-03')).toBe('2026-11-04'); // caso 6: 2 dias
    expect(fimSugerido(nomenclaturaPorNome('Atestado médico'), '2026-11-03')).toBeNull(); // atestado não tem regra de duração
    expect(fimSugerido(n, null)).toBeNull();
  });

  it('caso 11: nome lido diferente do colaborador escolhido é DIVERGÊNCIA (sinaliza, não bloqueia); parecido passa', () => {
    expect(conferirNome('MARIA JOSE DA SILVA', 'Maria José da Silva')?.divergente).toBe(false);
    expect(conferirNome('Maria Jose', 'MARIA JOSE DA SILVA SANTOS')?.divergente).toBe(false);
    const outro = conferirNome('João Pedro Alves', 'Maria José da Silva')!;
    expect(outro.divergente).toBe(true);
    expect(outro.semelhanca).toBeLessThan(70);
    expect(conferirNome(null, 'Maria')).toBeNull();
    expect(conferirNome('   ', 'Maria')).toBeNull();
  });

  it('situação inicial: classificado = Leitura concluída; sem nomenclatura segura = Classificação pendente (caso 12/18)', () => {
    expect(situacaoInicial(nomenclaturaPorNome('Atestado médico'))).toBe('LEITURA_CONCLUIDA');
    expect(situacaoInicial(null)).toBe('CLASSIFICACAO_PENDENTE');
    expect(Object.keys(SITUACOES).length).toBe(10); // os 10 estados da spec
    expect(SITUACOES_ANTES_DO_RH).toEqual(['AGUARDANDO_LEITURA', 'LEITURA_CONCLUIDA', 'CLASSIFICACAO_PENDENTE']);
    for (const s of Object.values(SITUACOES)) expect(s.paraOGerente).not.toMatch(/CID|diagn/i); // nada médico na mensagem ao gerente
  });
});

describe('leitura da IA: interpretação da resposta (sem rede)', () => {
  it('a lista fechada vai ao prompt com as 25 nomenclaturas e as proibições (não inventar, não presumir CID, comparecimento ≠ afastamento)', () => {
    const lista = listaDeNomenclaturasParaOPrompt();
    for (const nome of NOMES_DAS_NOMENCLATURAS) expect(lista).toContain(`"${nome}"`);
    const i = instrucoesDeLeitura();
    expect(i).toMatch(/jamais deduza um CID/i);
    expect(i).toMatch(/NUNCA vira atestado de afastamento/);
    expect(i).toMatch(/NUNCA chute/);
    expect(i).toMatch(/legivel/);
  });

  it('caso 1: atestado médico de 3 dias com retorno → fim conciliado, grupo e nomenclatura do catálogo, tipo da nomenclatura', () => {
    const r = interpretarResposta({
      legivel: true, naturezaLida: 'Atestado médico', nomenclatura: 'Atestado médico',
      collaboratorName: 'MARIA JOSE DA SILVA', issueDate: '2026-11-03', startDate: '2026-11-03', endDate: '2026-11-06', returnDate: '2026-11-06', days: 3,
      doctorName: 'Dr. Carlos', doctorCrm: 'CRM 12345 MG', institution: 'UPA Centro', type: 'FULL_DAY',
      confianca: { startDate: 'alta', days: 'alta', doctorCrm: 'media' }, evidencia: { days: '3 (três) dias' }, lowConfidence: ['doctorCrm'],
    });
    expect(r.ok).toBe(true);
    expect(r.grupo).toBe('ATESTADO');
    expect(r.nomenclatura).toBe('Atestado médico');
    expect(r.fields?.endDate).toBe('2026-11-05'); // 3 dias a partir de 03/11; "retorno" 06/11 não é o fim
    expect(r.fields?.days).toBe(3);
    expect(r.fields?.type).toBe('FULL_DAY');
    expect(r.lowConfidence).toEqual(expect.arrayContaining(['doctorCrm', 'endDate']));
    expect(r.confianca?.startDate).toBe('alta');
    expect(r.evidencia?.days).toBe('3 (três) dias');
    expect(r.legivel).toBe(true);
  });

  it('caso 4: declaração de consulta de 2 horas → Consulta médica (HOURS), janela de horário preservada, nada de afastamento', () => {
    const r = interpretarResposta({ legivel: true, nomenclatura: 'Declaração de comparecimento', startDate: '2026-11-04', hours: 2, hoursStart: '14:00', hoursEnd: '16:00', type: 'HOURS' });
    expect(r.nomenclatura).toBe('Consulta médica');
    expect(r.grupo).toBe('COMPARECIMENTO');
    expect(r.fields?.type).toBe('HOURS');
    expect(r.fields?.hours).toBe(2);
    expect(r.fields?.hoursStart).toBe('14:00');
    expect(r.fields?.hoursEnd).toBe('16:00');
    expect(r.fimSugeridoPelaRegra).toBe(false);
  });

  it('caso 5: certidão de nascimento como Licença-paternidade → início = data do evento, fim sugerido pela regra (5 dias) e marcado para conferência', () => {
    const r = interpretarResposta({ legivel: true, nomenclatura: 'Licença-paternidade', eventDate: '2026-11-03', collaboratorName: 'JOAO SILVA' });
    expect(r.grupo).toBe('LICENCA');
    expect(r.fields?.startDate).toBe('2026-11-03');
    expect(r.fields?.endDate).toBe('2026-11-07');
    expect(r.fields?.days).toBe(5);
    expect(r.fimSugeridoPelaRegra).toBe(true);
    expect(r.lowConfidence).toContain('endDate');
  });

  it('caso 6: certidão de óbito → luto, 2 dias sugeridos; caso 7: comprovante eleitoral; caso 8: amamentação', () => {
    expect(interpretarResposta({ nomenclatura: 'Licença por falecimento (luto)', eventDate: '2026-11-10' }).fields?.endDate).toBe('2026-11-11');
    const el = interpretarResposta({ nomenclatura: 'Alistamento eleitoral', startDate: '2026-11-10' });
    expect(el.grupo).toBe('COMPARECIMENTO'); expect(el.fields?.type).toBe('FULL_DAY');
    const am = interpretarResposta({ nomenclatura: 'Licença-amamentação', startDate: '2026-11-10' });
    expect(am.grupo).toBe('LICENCA'); expect(am.fields?.endDate).toBe('2026-11-24');
  });

  it('caso 9: documento sem CID fica com CID nulo — e descrição de CID sem código também é descartada (não se presume)', () => {
    const r = interpretarResposta({ nomenclatura: 'Atestado médico', startDate: '2026-11-03', days: 1, cid: null, cidDescription: 'Gripe' });
    expect(r.fields?.cid).toBeNull();
    expect(r.fields?.cidDescription).toBeNull();
    const com = interpretarResposta({ nomenclatura: 'Atestado médico', startDate: '2026-11-03', days: 1, cid: 'J11', cidDescription: 'Influenza' });
    expect(com.fields?.cid).toBe('J11');
    expect(com.fields?.cidDescription).toBe('Influenza');
  });

  it('caso 10: foto ilegível → legivel=false (a tela pede nova foto) e campos nulos', () => {
    const r = interpretarResposta({ legivel: false, nomenclatura: null, lowConfidence: ['startDate', 'collaboratorName'] });
    expect(r.legivel).toBe(false);
    expect(r.nomenclatura).toBeNull();
    expect(r.fields?.startDate).toBeNull();
  });

  it('caso 12/17/18: nomenclatura fora do catálogo ou com grafia diferente da lista → null (classificação pendente), com a natureza lida preservada para o RH', () => {
    const r = interpretarResposta({ legivel: true, naturezaLida: 'Declaração de horas da academia', nomenclatura: 'Declaração de frequência escolar' });
    expect(r.nomenclatura).toBeNull();
    expect(r.grupo).toBeNull();
    expect(r.naturezaLida).toBe('Declaração de horas da academia');
    // grafia diferente mas é a mesma coisa → casa pelo sinônimo
    expect(interpretarResposta({ nomenclatura: 'ATESTADO MEDICO' }).nomenclatura).toBe('Atestado médico');
  });

  it('a nomenclatura manda no tipo (contrato do RH): uma declaração de horas classificada como "Consulta médica" é HOURS mesmo se a IA disser FULL_DAY', () => {
    expect(interpretarResposta({ nomenclatura: 'Consulta médica', type: 'FULL_DAY' }).fields?.type).toBe('HOURS');
    expect(interpretarResposta({ nomenclatura: null, type: 'COMPANION' }).fields?.type).toBe('COMPANION');
    expect(interpretarResposta({ nomenclatura: null, type: 'INVALIDO' }).fields?.type).toBeNull();
  });

  it('datas e horários fora do formato são descartados (não entram como lixo)', () => {
    const r = interpretarResposta({ nomenclatura: 'Atestado médico', startDate: '03/11/2026', issueDate: '2026-13-40', hoursStart: '9h' });
    expect(r.fields?.startDate).toBeNull();
    expect(r.fields?.issueDate).toBe('2026-13-40'); // só a forma é conferida aqui; o servidor valida a data real ao gravar
    expect(r.fields?.hoursStart).toBeNull();
  });
});
