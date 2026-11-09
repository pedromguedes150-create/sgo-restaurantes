import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { REGRAS_LEGAIS, regraVigente, duracaoDaRegra, fimPelaRegra, LIMITE_EMPRESA_DIAS, JANELA_INTERCALADOS_DIAS } from '@/lib/certificates/regras-legais';
import { alertasDoDocumento, alertasPorDocumento, gravidadeMaxima, ROTULO_DO_ALERTA, type DocParaAlerta } from '@/lib/certificates/alertas';
import { interpretarResposta } from '@/lib/ai/atestado';
import { NOMENCLATURAS } from '@/lib/certificates/catalogo';

/**
 * ETAPA C (v1.198.0): regras legais com vigência e a inteligência de afastamentos
 * (só sinaliza — nunca soma, concede ou abona por conta própria).
 */
const doc = (o: Partial<DocParaAlerta> & { id: string }): DocParaAlerta => ({
  documentGroup: 'ATESTADO', nomenclature: 'Atestado médico', type: 'FULL_DAY', startDate: '2026-11-03', endDate: '2026-11-05', days: 3, status: 'ENVIADO_RH', ...o,
});

describe('regras legais com vigência', () => {
  it('licença-paternidade: 5 dias até 2026, 10 em 2027, 15 em 2028, 20 em 2029 — pela DATA DO EVENTO', () => {
    expect(regraVigente('Licença-paternidade', '2026-11-09')).toMatchObject({ dias: 5, versao: 1 });
    expect(regraVigente('Licença-paternidade', '2027-01-01')).toMatchObject({ dias: 10, versao: 2, desde: '2027-01-01', base: 'Lei 15.371/2026' });
    expect(regraVigente('Licença-paternidade', '2028-06-01')?.dias).toBe(15);
    expect(regraVigente('Licença-paternidade', '2029-01-01')?.dias).toBe(20);
    expect(regraVigente('Licença-paternidade', null)?.dias).toBe(5); // sem data vale a primeira
    expect(fimPelaRegra('Licença-paternidade', '2026-12-30')).toBe('2027-01-03'); // evento em 2026 → 5 dias, mesmo virando o ano
    expect(fimPelaRegra('Licença-paternidade', '2027-01-04')).toBe('2027-01-13'); // 10 dias
  });

  it('a sobreposição do Admin vence a tabela; sem regra (atestado, horas) devolve null', () => {
    expect(duracaoDaRegra('Licença-casamento', '2026-11-09')).toBe(3);
    expect(duracaoDaRegra('Licença-casamento', '2026-11-09', 5)).toBe(5); // convenção coletiva
    expect(duracaoDaRegra('Licença-casamento', '2026-11-09', 0)).toBe(3); // 0 não é sobreposição
    expect(duracaoDaRegra('Atestado médico', '2026-11-09')).toBeNull();
    expect(fimPelaRegra('Atestado médico', '2026-11-09')).toBeNull();
    expect(regraVigente('Consulta médica', '2026-11-09')).toBeNull();
  });

  it('toda regra aponta para uma nomenclatura do catálogo e as versões estão em ordem de vigência', () => {
    const nomes = new Set(NOMENCLATURAS.map((n) => n.nome));
    for (const [nome, versoes] of Object.entries(REGRAS_LEGAIS)) {
      expect(nomes.has(nome)).toBe(true);
      for (let i = 1; i < versoes.length; i++) expect(versoes[i].desde > versoes[i - 1].desde).toBe(true);
    }
    expect(LIMITE_EMPRESA_DIAS).toBe(15);
    expect(JANELA_INTERCALADOS_DIAS).toBe(60);
  });

  it('a leitura da IA usa a regra com vigência: certidão de nascimento em 2027 sugere 10 dias (e a sobreposição do Admin, se houver)', () => {
    const r27 = interpretarResposta({ nomenclatura: 'Licença-paternidade', eventDate: '2027-02-01' });
    expect(r27.fields?.endDate).toBe('2027-02-10');
    expect(r27.fields?.days).toBe(10);
    const cct = interpretarResposta({ nomenclatura: 'Licença-paternidade', eventDate: '2026-11-03' }, { diasDaRegra: () => 7 });
    expect(cct.fields?.days).toBe(7);
    expect(cct.fields?.endDate).toBe('2026-11-09');
  });

  it('nomenclatura DESATIVADA pelo Admin não classifica: fica pendente mesmo se a IA a devolver', () => {
    const ativas = NOMENCLATURAS.filter((n) => n.nome !== 'Vestibular');
    const r = interpretarResposta({ nomenclatura: 'Vestibular', startDate: '2026-11-20' }, { ativas });
    expect(r.nomenclatura).toBeNull();
    expect(r.grupo).toBeNull();
    expect(r.naturezaLida).toBe('Vestibular'); // o RH ainda vê o que a IA achou
  });
});

describe('inteligência de afastamentos (alertas)', () => {
  const HOJE = '2026-11-09';

  it('caso 1 e 2: 3 dias não alerta INSS; 16 dias alerta "Análise INSS necessária" (alta) — sem conceder nada', () => {
    expect(alertasDoDocumento(doc({ id: 'a', days: 3, endDate: '2026-11-05' }), [], HOJE).some((a) => a.tipo === 'INSS_15')).toBe(false);
    const a16 = alertasDoDocumento(doc({ id: 'b', startDate: '2026-11-10', endDate: '2026-11-25', days: 16 }), [], HOJE);
    const inss = a16.find((a) => a.tipo === 'INSS_15')!;
    expect(inss.gravidade).toBe('alta');
    expect(inss.texto).toMatch(/16º dia/);
    expect(inss.texto).toMatch(/Não significa benefício/);
    expect(ROTULO_DO_ALERTA.INSS_15).toBe('Análise INSS necessária');
  });

  it('caso 3: dois atestados sucessivos (10 + 8 dias em 60 dias) → intercalados, com os ids relacionados; fora da janela, nada', () => {
    const a = doc({ id: 'a', startDate: '2026-10-01', endDate: '2026-10-10', days: 10 });
    const b = doc({ id: 'b', startDate: '2026-11-01', endDate: '2026-11-08', days: 8 });
    const al = alertasDoDocumento(b, [a], HOJE).find((x) => x.tipo === 'INTERCALADOS_60')!;
    expect(al).toBeDefined();
    expect(al.relacionados).toEqual(['a']);
    expect(al.texto).toMatch(/2 atestados em 60 dias somam 18 dias/);
    expect(al.texto).toMatch(/não soma por conta própria/);
    // 10 + 3 = 13 ≤ 15: nada
    expect(alertasDoDocumento(doc({ id: 'c', startDate: '2026-11-01', endDate: '2026-11-03', days: 3 }), [a], HOJE).some((x) => x.tipo === 'INTERCALADOS_60')).toBe(false);
    // mais de 60 dias depois: nada
    const longe = doc({ id: 'd', startDate: '2026-12-20', endDate: '2026-12-27', days: 8 });
    expect(alertasDoDocumento(longe, [a], HOJE).some((x) => x.tipo === 'INTERCALADOS_60')).toBe(false);
    // documento NÃO ACEITO não entra na conta
    expect(alertasDoDocumento(b, [{ ...a, status: 'NAO_ACEITO' }], HOJE).some((x) => x.tipo === 'INTERCALADOS_60')).toBe(false);
    // declaração de horas não é incapacidade
    expect(alertasDoDocumento(b, [doc({ id: 'h', nomenclature: 'Consulta médica', documentGroup: 'COMPARECIMENTO', type: 'HOURS', days: 1 })], HOJE).some((x) => x.tipo === 'INTERCALADOS_60')).toBe(false);
  });

  it('CAT e INSS têm alerta próprio; licença com prazo diferente da regra avisa; retorno futuro é informativo', () => {
    const cat = alertasDoDocumento(doc({ id: 'c', documentGroup: 'AFASTAMENTO', nomenclature: 'Acidente de trabalho (CAT)', days: 2, endDate: '2026-11-04' }), [], HOJE);
    expect(cat.find((a) => a.tipo === 'CAT')?.gravidade).toBe('alta');
    const inss = alertasDoDocumento(doc({ id: 'i', documentGroup: 'AFASTAMENTO', nomenclature: 'Afastamento pelo INSS', startDate: '2026-11-01', endDate: '2026-12-15', days: 45 }), [], HOJE);
    expect(inss.map((a) => a.tipo).sort()).toEqual(['INSS_15', 'INSS_CONTROLE', 'RETORNO']);
    const pat = alertasDoDocumento(doc({ id: 'p', documentGroup: 'LICENCA', nomenclature: 'Licença-paternidade', startDate: '2026-11-03', endDate: '2026-11-09', days: 7 }), [], HOJE);
    const prazo = pat.find((a) => a.tipo === 'PRAZO_DIFERENTE')!;
    expect(prazo.texto).toMatch(/7 dia\(s\) lançado\(s\); a regra geral prevê 5/);
    expect(pat.find((a) => a.tipo === 'RETORNO')?.texto).toBe('Retorno previsto em 10/11/2026.');
    // com a sobreposição do Admin (7 dias), o mesmo documento não destoa
    expect(alertasDoDocumento(doc({ id: 'p', documentGroup: 'LICENCA', nomenclature: 'Licença-paternidade', startDate: '2026-11-03', endDate: '2026-11-09', days: 7 }), [], HOJE, () => 7).some((a) => a.tipo === 'PRAZO_DIFERENTE')).toBe(false);
    // já encerrado: sem retorno a acompanhar
    expect(alertasDoDocumento(doc({ id: 'x', startDate: '2026-10-01', endDate: '2026-10-03' }), [], HOJE).some((a) => a.tipo === 'RETORNO')).toBe(false);
  });

  it('não aceito não alerta nada; a gravidade máxima resume a linha; o agrupador por colaborador isola históricos', () => {
    expect(alertasDoDocumento(doc({ id: 'n', days: 30, status: 'NAO_ACEITO' }), [], HOJE)).toEqual([]);
    expect(gravidadeMaxima([{ tipo: 'RETORNO', gravidade: 'info', texto: '' }, { tipo: 'INSS_15', gravidade: 'alta', texto: '' }])).toBe('alta');
    expect(gravidadeMaxima([])).toBeNull();
    const docs = [
      { ...doc({ id: 'a', startDate: '2026-10-01', endDate: '2026-10-10', days: 10 }), collaboratorId: 'joao' },
      { ...doc({ id: 'b', startDate: '2026-11-01', endDate: '2026-11-08', days: 8 }), collaboratorId: 'joao' },
      { ...doc({ id: 'c', startDate: '2026-11-01', endDate: '2026-11-08', days: 8 }), collaboratorId: 'ana' }, // outra pessoa: não soma com os do João
    ];
    const m = alertasPorDocumento(docs, HOJE);
    expect(m.get('b')?.some((a) => a.tipo === 'INTERCALADOS_60')).toBe(true);
    expect(m.get('c')?.some((a) => a.tipo === 'INTERCALADOS_60')).toBe(false);
  });
});
