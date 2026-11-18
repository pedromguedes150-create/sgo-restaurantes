import { describe, it, expect } from 'vitest';
import { interpretarLeitura, INSTRUCOES_DE_LEITURA } from '@/lib/curriculos/leitura';
import { APELIDOS_DO_RH, SITUACAO_NO_RH, STATUS_LABEL, indicadores, mensagemParaOGerente, validarRetornoDoRh } from '@/lib/curriculos/regras';
import { readFileSync } from 'node:fs';

/** v1.216.0 — a IA lê nome e telefone do currículo; etapas renomeadas e a nova "Admissional". */
describe('leitura do currículo por IA', () => {
  it('nome e telefone passam pelas mesmas regras do formulário', () => {
    expect(interpretarLeitura({ legivel: true, nome: 'Maria  das Graças Silva', telefone: '(31) 99999-8888' })).toEqual({ nome: 'Maria das Graças Silva', telefone: '31999998888', legivel: true });
    expect(interpretarLeitura({ nome: 'JOÃO PEDRO DA SILVA', telefone: 5531988887777 })).toMatchObject({ nome: 'João Pedro da Silva', telefone: '31988887777' });
  });
  it('o que não passa volta VAZIO para o gerente completar — nada é inventado', () => {
    expect(interpretarLeitura({ nome: 'Maria', telefone: '99999-8888' })).toMatchObject({ nome: null, telefone: null });
    expect(interpretarLeitura({ nome: null, telefone: null, legivel: false })).toEqual({ nome: null, telefone: null, legivel: false });
    expect(interpretarLeitura(null)).toEqual({ nome: null, telefone: null, legivel: false });
    expect(interpretarLeitura({ nome: { x: 1 }, telefone: ['31999998888'] })).toMatchObject({ nome: null, telefone: null });
  });
  it('o pedido à IA proíbe inventar', () => {
    expect(INSTRUCOES_DE_LEITURA).toContain('NUNCA invente');
  });
  it('a leitura não grava o arquivo e a rota tem guarda', () => {
    const rota = readFileSync('src/app/api/curriculos/ler/route.ts', 'utf8');
    expect(rota).toContain('guardaDaRota');
    expect(rota).not.toContain('guardarCurriculo');
    expect(readFileSync('src/lib/permissions/guarda-rota-api.ts', 'utf8')).toContain("'/api/curriculos/ler': { modulo: 'RESUMES', exigir: 'editar' }");
  });
  it('o formulário só preenche campo vazio e segue à mão quando a leitura falha', () => {
    const tela = readFileSync('src/components/curriculos/curriculos-client.tsx', 'utf8');
    expect(tela).toContain('setNome((v) => v || String(d.nome))');
    expect(tela).toContain("setLeitura('sem-ia')");
    expect(tela.indexOf('data-testid="input-camera"')).toBeLessThan(tela.indexOf('label="Nome do candidato"'));
  });
});

describe('etapas renomeadas e Admissional', () => {
  it('nomes novos, mesmas chaves e mesma grafia devolvida ao RH', () => {
    expect(STATUS_LABEL.PRIMEIRA_ETAPA).toBe('Recrutamento/Seleção');
    expect(STATUS_LABEL.ENTREVISTA_AGENDADA).toBe('Entrevista técnica');
    expect(STATUS_LABEL.ADMISSIONAL).toBe('Admissional');
    expect(SITUACAO_NO_RH.PRIMEIRA_ETAPA).toBe('primeira_etapa_concluida');
    expect(SITUACAO_NO_RH.ENTREVISTA_AGENDADA).toBe('entrevista_agendada');
    expect(SITUACAO_NO_RH.ADMISSIONAL).toBe('admissional');
  });
  it('o RH pode mandar a grafia antiga, a nova ou admissional', () => {
    const st = (situacao: string) => { const v = validarRetornoDoRh({ sgoCurriculoId: 'a', situacao }); return v.ok ? v.dados.status : null; };
    expect(st('primeira_etapa_concluida')).toBe('PRIMEIRA_ETAPA');
    expect(st('recrutamento_selecao')).toBe('PRIMEIRA_ETAPA');
    expect(st('entrevista_tecnica')).toBe('ENTREVISTA_AGENDADA');
    expect(st('admissional')).toBe('ADMISSIONAL');
    expect(st('qualquer_coisa')).toBeNull();
    expect(Object.keys(APELIDOS_DO_RH)).toHaveLength(2);
  });
  it('Admissional conta nos Aprovados e avisa o gerente como importante', () => {
    expect(indicadores({ APROVADO: 1, ADMISSIONAL: 2 })).toMatchObject({ recebidos: 3, aprovado: 3 });
    const v = validarRetornoDoRh({ sgoCurriculoId: 'a', situacao: 'admissional' });
    expect(v.ok && mensagemParaOGerente('Ana Lima', v.dados)).toMatchObject({ title: 'Currículo — Admissional', importante: true });
  });
});
