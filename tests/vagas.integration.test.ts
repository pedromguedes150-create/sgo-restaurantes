import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';

/* A chave de envio ao RH é controlada pelo teste: vazia = a fila espera. */
let chave = '';
vi.mock('@/lib/rh/saida/config', () => ({ rhSaidaBase: () => 'http://rh.teste', rhSaidaToken: async () => chave }));

import { prisma } from '@/lib/db/prisma';
import { anexarCurriculos, aprovarVaga, avaliarCurriculo, cancelarVaga, corrigirVaga, criarVaga, devolverVaga, editarVaga, excluirVaga } from '@/lib/vagas/acoes';
import { getVaga, listarVagas } from '@/lib/vagas/dados';
import { despacharVagas } from '@/lib/vagas/fila';
import { handleCurriculoDaVaga, handleVagaSituacao } from '@/lib/vagas/retorno';
import { pendenciasDeVagas } from '@/lib/vagas/rotina';
import { sgoCurriculoId, sgoVagaId } from '@/lib/vagas/regras';
import { posicaoDaVaga } from '@/lib/vagas/acompanhamento';
import type { SessionUser } from '@/lib/auth/session';

/**
 * SOLICITAÇÃO DE VAGAS — o fluxo de ponta a ponta contra o banco: pedir,
 * devolver, corrigir, aprovar, a fila do RH, a edição do supervisor, os
 * retornos do RH (rotas 2 e 3) e o currículo enviado depois.
 */
const sfx = `vg${process.pid.toString(36)}`;
let unitId: string; let outraId: string;
let gerId: string; let supId: string; let colabId: string;
const ger = (): SessionUser => ({ id: gerId, name: 'Gerente Vaga', role: 'MANAGER', unitIds: [unitId], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora Vaga', role: 'SUPERVISOR', unitIds: [unitId, outraId], seesAllUnits: false, needsTerms: false });

const amanha = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
const pessoa = (over: Record<string, unknown> = {}) => ({ cargo: 'Garçom', motivo: 'AUMENTO_QUADRO', escala: '6x1', horario: '11:00 às 19:20', inicioDesejado: amanha, ...over });
const corpo = (over: Record<string, unknown> = {}) => ({ unitId, prioridade: 'NORMAL', pessoas: [pessoa()], ...over });
const pdf = (nome = 'cv.pdf') => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])], nome, { type: 'application/pdf' });

async function novaAprovada(over: Record<string, unknown> = {}, arquivos: { file: File; indicadoPor: string | null }[] = []) {
  const r = await criarVaga(ger(), corpo(over), arquivos);
  if (!r.ok) throw new Error(r.error);
  const a = await aprovarVaga(sup(), r.id);
  if (!a.ok) throw new Error(a.error);
  return r.id;
}
/** Marca a vaga como entregue ao RH, sem passar pela rede. */
const entregar = (id: string) => prisma.vagaSolicitacao.update({ where: { id }, data: { rhEnvioSituacao: 'ENVIADO', rhChegouEm: new Date(), rhEnviadoEm: new Date() } });
const numero = async (id: string) => (await prisma.vagaSolicitacao.findUnique({ where: { id }, select: { number: true } }))!.number;

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `VG-${sfx}`, name: 'U Vagas', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  outraId = (await prisma.unit.create({ data: { code: `VG2-${sfx}`, name: 'U Outra Vaga', timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gerId = (await prisma.user.create({ data: { name: 'Gerente Vaga', email: `${sfx}-g@e.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora Vaga', email: `${sfx}-s@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.createMany({ data: [{ userId: gerId, unitId }, { userId: supId, unitId }, { userId: supId, unitId: outraId }] });
  colabId = (await prisma.collaborator.create({ data: { name: 'Fulano Substituído', jobTitle: 'Garçom', units: { create: { unitId } } } })).id;
});

afterAll(async () => {
  await prisma.vagaSolicitacao.deleteMany({ where: { unitId: { in: [unitId, outraId] } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: { in: [gerId, supId] } } }).catch(() => {});
  await prisma.collaborator.delete({ where: { id: colabId } }).catch(() => {});
  await prisma.unitMembership.deleteMany({ where: { userId: { in: [gerId, supId] } } }).catch(() => {});
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, outraId] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: [gerId, supId] } } }).catch(() => {});
  for (const u of [unitId, outraId]) await rm(path.join(process.cwd(), 'uploads', '_privado', 'vagas', u), { recursive: true, force: true }).catch(() => {});
  await prisma.$disconnect();
});

describe('pedir → devolver → corrigir → aprovar', () => {
  let id: string;
  it('o gerente pede (com currículo) e a vaga fica com o supervisor', async () => {
    const r = await criarVaga(ger(), corpo({ pessoas: [pessoa(), pessoa({ cargo: 'Cozinheiro', motivo: 'SUBSTITUICAO', substituiColaboradorId: colabId, substituiNome: 'nome que veio do corpo' })] }), [{ file: pdf(), indicadoPor: 'Zé do Caixa' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id = r.id;
    expect(r.codigo).toMatch(/^VAGR-\d{4}$/);
    const v = await getVaga(ger(), id);
    expect(v).toMatchObject({ status: 'PENDENTE_APROVACAO', cargoResumo: '1× Garçom · 1× Cozinheiro', quantidade: 2 });
    /* O substituído escolhido da lista vale pelo CADASTRO, não pelo nome do corpo. */
    expect(v?.posicoes[1]).toMatchObject({ substituiColaboradorId: colabId, substituiNome: 'Fulano Substituído' });
    expect(v?.curriculos).toHaveLength(1);
    expect(v?.eventos.map((e) => e.tipo)).toEqual(['CRIADA']);
    expect(await pendenciasDeVagas(sup())).toBeGreaterThanOrEqual(1);
  });

  it('quem tem UMA unidade pede só para ela, venha o que vier no corpo', async () => {
    const r = await criarVaga(ger(), corpo({ unitId: outraId }), []);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await prisma.vagaSolicitacao.findUnique({ where: { id: r.id }, select: { unitId: true } }))?.unitId).toBe(unitId);
  });

  it('o gerente não aprova, não devolve e não edita; o supervisor devolve com motivo', async () => {
    expect(await aprovarVaga(ger(), id)).toMatchObject({ ok: false, status: 409 });
    expect(await editarVaga(ger(), id, corpo())).toMatchObject({ ok: false, status: 409 });
    expect(await devolverVaga(sup(), id, 'curto')).toMatchObject({ ok: false, status: 400 });
    expect((await devolverVaga(sup(), id, 'Falta dizer o horário do cozinheiro.')).ok).toBe(true);
    expect(await getVaga(ger(), id)).toMatchObject({ status: 'DEVOLVIDA', motivoDevolucao: 'Falta dizer o horário do cozinheiro.' });
    expect(await pendenciasDeVagas(ger())).toBeGreaterThanOrEqual(1);
  });

  it('o gerente corrige e reenvia; o supervisor aprova e a vaga entra na fila do RH', async () => {
    expect((await corrigirVaga(ger(), id, corpo({ pessoas: [pessoa(), pessoa({ cargo: 'Cozinheiro', horario: '07:00 às 15:20' })] }))).ok).toBe(true);
    expect((await getVaga(ger(), id))?.status).toBe('PENDENTE_APROVACAO');
    expect((await aprovarVaga(sup(), id)).ok).toBe(true);
    expect(await aprovarVaga(sup(), id)).toMatchObject({ ok: false, status: 409 });
    const l = await prisma.vagaSolicitacao.findUnique({ where: { id } });
    expect(l).toMatchObject({ status: 'APROVADA', rhEnvioAcao: 'criar', rhEnvioSituacao: 'NA_FILA', decididoPorNome: 'Supervisora Vaga' });
    expect((await getVaga(ger(), id))?.eventos.map((e) => e.tipo)).toEqual(['CRIADA', 'DEVOLVIDA', 'REENVIADA', 'APROVADA']);
  });

  it('sem a chave do RH, segue na fila com o motivo — e não gasta tentativa', async () => {
    chave = '';
    const r = await despacharVagas();
    expect(r).toMatchObject({ rodou: false, motivo: 'SEM_CHAVE' });
    const l = await prisma.vagaSolicitacao.findUnique({ where: { id } });
    expect(l).toMatchObject({ rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0 });
    expect(l?.rhEnvioMotivo).toMatch(/chave/i);
  });

  it('com a chave, o RH recebe o corpo do contrato e a vaga fica entregue', async () => {
    chave = 'chave-de-teste';
    const enviados: Record<string, unknown>[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      enviados.push(JSON.parse(init?.body ?? '{}'));
      return new Response(JSON.stringify({ rhVagaId: 'rh-1', codigoVaga: 'V-0099' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      await despacharVagas();
    } finally {
      globalThis.fetch = original;
      chave = '';
    }
    const meu = enviados.find((b) => String(b.codigoSgo ?? '').startsWith('VAGR-') && (b.posicoes as unknown[])?.length === 2);
    expect(meu).toMatchObject({ acao: 'criar', sistema: 'SGO Restaurante', quantidade: 2 });
    expect(String(meu?.sgoVagaId)).toMatch(/^rest-vaga-\d+$/);
    expect((meu?.curriculos as { sgoCurriculoId: string; conteudoBase64: string }[])[0].sgoCurriculoId).toMatch(/^rest-cv-\d+$/);
    expect(((meu?.posicoes as { salario: unknown }[])[0]).salario).toBeNull();
    const l = await prisma.vagaSolicitacao.findUnique({ where: { id } });
    expect(l).toMatchObject({ rhEnvioSituacao: 'ENVIADO', rhVagaId: 'rh-1', codigoRh: 'V-0099' });
    expect(l?.rhChegouEm).not.toBeNull();
  });

  it('o supervisor edita a vaga que já está no RH: "atualizar" na fila e a situação não muda', async () => {
    const r = await editarVaga(sup(), id, corpo({ prioridade: 'URGENTE', pessoas: [pessoa(), pessoa({ cargo: 'Cozinheiro', horario: '07:00 às 15:20' })] }));
    expect(r).toMatchObject({ ok: true, mudou: true });
    const l = await prisma.vagaSolicitacao.findUnique({ where: { id } });
    expect(l).toMatchObject({ status: 'APROVADA', prioridade: 'URGENTE', rhEnvioAcao: 'atualizar', rhEnvioSituacao: 'NA_FILA' });
    const ultimo = (await getVaga(sup(), id))!.eventos.at(-1)!;
    expect(ultimo.tipo).toBe('EDITADA');
    expect(ultimo.descricao).toContain('Prioridade: Normal → Urgente');
    /* Salvar sem mudar nada não vira evento nem reenvio. */
    await prisma.vagaSolicitacao.update({ where: { id }, data: { rhEnvioSituacao: 'ENVIADO' } });
    expect(await editarVaga(sup(), id, corpo({ prioridade: 'URGENTE', pessoas: [pessoa(), pessoa({ cargo: 'Cozinheiro', horario: '07:00 às 15:20' })] }))).toMatchObject({ ok: true, mudou: false });
    expect((await prisma.vagaSolicitacao.findUnique({ where: { id } }))?.rhEnvioSituacao).toBe('ENVIADO');
  });
});

describe('o retorno do RH — cada passo da vaga (rota 2)', () => {
  let id: string; let n: number;
  beforeAll(async () => { id = await novaAprovada(); await entregar(id); n = await numero(id); });

  it('cada situação muda a etapa; a numerada guarda o número do RH', async () => {
    const passos: [string, number][] = [['recebida', 5], ['vaga_numerada', 6], ['em_selecao', 6], ['consulta_cadastral', 7], ['entrevista_agendada', 8], ['candidato_reprovado', 6], ['candidato_aprovado', 10], ['em_admissao', 10]];
    for (const [situacao, etapa] of passos) {
      const r = await handleVagaSituacao({ sgoVagaId: sgoVagaId(n), situacao, codigoVaga: 'V-0123', rhEventoId: `${sfx}-${situacao}` });
      expect(r.httpStatus, situacao).toBe(200);
      expect(posicaoDaVaga((await getVaga(sup(), id))!).etapa, situacao).toBe(etapa);
    }
    expect((await getVaga(sup(), id))?.codigoRh).toBe('V-0123');
  });

  it('o mesmo rhEventoId não duplica a linha do tempo', async () => {
    const antes = (await getVaga(sup(), id))!.eventos.length;
    const r = await handleVagaSituacao({ sgoVagaId: sgoVagaId(n), situacao: 'em_admissao', rhEventoId: `${sfx}-em_admissao` });
    expect(r).toMatchObject({ httpStatus: 200, body: { ok: true, repetido: true } });
    expect((await getVaga(sup(), id))!.eventos.length).toBe(antes);
  });

  it('CPF é recusado, vaga de outro sistema não existe aqui, situação inválida é 400', async () => {
    expect((await handleVagaSituacao({ sgoVagaId: sgoVagaId(n), situacao: 'em_selecao', candidato: 'Fulano 123.456.789-09' })).httpStatus).toBe(400);
    expect((await handleVagaSituacao({ sgoVagaId: `vaga-${n}`, situacao: 'em_selecao' })).httpStatus).toBe(404);
    expect((await handleVagaSituacao({ sgoVagaId: 'rest-vaga-999999999', situacao: 'em_selecao' })).httpStatus).toBe(404);
    expect((await handleVagaSituacao({ sgoVagaId: sgoVagaId(n), situacao: 'qualquer' })).httpStatus).toBe(400);
  });

  it('"concluida" fecha a solicitação', async () => {
    expect((await handleVagaSituacao({ sgoVagaId: sgoVagaId(n), situacao: 'concluida', rhEventoId: `${sfx}-fim` })).body).toMatchObject({ ok: true, status: 'CONCLUIDA' });
    expect(await getVaga(sup(), id)).toMatchObject({ status: 'CONCLUIDA' });
  });
});

describe('a situação de cada currículo (rota 3)', () => {
  let id: string; let cvs: number[];
  beforeAll(async () => {
    id = await novaAprovada({}, [{ file: pdf('um.pdf'), indicadoPor: null }, { file: pdf('dois.pdf'), indicadoPor: null }]);
    await entregar(id);
    cvs = (await prisma.vagaCurriculo.findMany({ where: { vagaId: id }, orderBy: { number: 'asc' }, select: { number: true } })).map((c) => c.number);
  });

  it('aceita o status como está na tela do RH e grava o evento RH_CV_*', async () => {
    const r = await handleCurriculoDaVaga({ sgoCurriculoId: sgoCurriculoId(cvs[0]), situacao: 'Entrevista técnica', observacao: 'quinta às 14h', rhEventoId: `${sfx}-cv1` });
    expect(r).toMatchObject({ httpStatus: 200, body: { ok: true, situacao: 'entrevista_tecnica' } });
    const v = (await getVaga(sup(), id))!;
    expect(v.curriculos.find((c) => c.number === cvs[0])).toMatchObject({ rhSituacao: 'entrevista_tecnica', rhObservacao: 'quinta às 14h' });
    expect(v.eventos.at(-1)).toMatchObject({ tipo: 'RH_CV_ENTREVISTA_TECNICA', origem: 'RH' });
  });

  it('repetido não duplica; inválido é 400; inexistente é 404; CPF é 400', async () => {
    expect((await handleCurriculoDaVaga({ sgoCurriculoId: sgoCurriculoId(cvs[0]), situacao: 'entrevista_tecnica', rhEventoId: `${sfx}-cv1` })).body).toMatchObject({ repetido: true });
    expect((await handleCurriculoDaVaga({ sgoCurriculoId: sgoCurriculoId(cvs[0]), situacao: 'xpto' })).httpStatus).toBe(400);
    expect((await handleCurriculoDaVaga({ sgoCurriculoId: 'rest-cv-999999999', situacao: 'aprovado' })).httpStatus).toBe(404);
    expect((await handleCurriculoDaVaga({ sgoCurriculoId: `cv-${cvs[0]}`, situacao: 'aprovado' })).httpStatus).toBe(404);
    expect((await handleCurriculoDaVaga({ sgoCurriculoId: sgoCurriculoId(cvs[0]), situacao: 'aprovado', observacao: 'cpf 123.456.789-09' })).httpStatus).toBe(400);
  });

  it('em lote, um item ruim não derruba os outros', async () => {
    const r = await handleCurriculoDaVaga({ curriculos: [
      { sgoCurriculoId: sgoCurriculoId(cvs[0]), situacao: 'Reprovado' },
      { sgoCurriculoId: 'rest-cv-999999999', situacao: 'aprovado' },
      { sgoCurriculoId: sgoCurriculoId(cvs[1]), situacao: 'banco de talentos' },
    ] });
    expect(r.httpStatus).toBe(200);
    expect((r.body.resultados as { http: number }[]).map((x) => x.http)).toEqual([200, 404, 200]);
    const v = (await getVaga(sup(), id))!;
    expect(v.curriculos.map((c) => c.rhSituacao).sort()).toEqual(['banco_de_talentos', 'reprovado']);
  });
});

describe('currículo novo em vaga que já está no RH', () => {
  let id: string;
  beforeAll(async () => { id = await novaAprovada(); await entregar(id); });

  it('o do gerente espera o supervisor, que recusa com motivo ou envia ao RH', async () => {
    expect((await anexarCurriculos(ger(), id, [{ file: pdf('novo1.pdf'), indicadoPor: null }, { file: pdf('novo2.pdf'), indicadoPor: 'Maria' }])).ok).toBe(true);
    const cs = await prisma.vagaCurriculo.findMany({ where: { vagaId: id }, orderBy: { number: 'asc' } });
    expect(cs.map((c) => c.fluxo)).toEqual(['AGUARDANDO_SUPERVISOR', 'AGUARDANDO_SUPERVISOR']);
    expect(await pendenciasDeVagas(sup())).toBeGreaterThanOrEqual(1);
    expect(await avaliarCurriculo(ger(), id, cs[0].id, { enviar: true })).toMatchObject({ ok: false, status: 409 });
    expect(await avaliarCurriculo(sup(), id, cs[0].id, { enviar: false, motivo: 'x' })).toMatchObject({ ok: false, status: 400 });
    expect((await avaliarCurriculo(sup(), id, cs[0].id, { enviar: false, motivo: 'Arquivo ilegível, peça outro.' })).ok).toBe(true);
    expect((await avaliarCurriculo(sup(), id, cs[1].id, { enviar: true })).ok).toBe(true);
    expect(await avaliarCurriculo(sup(), id, cs[1].id, { enviar: true })).toMatchObject({ ok: false, status: 409 });
    const depois = await prisma.vagaCurriculo.findMany({ where: { vagaId: id }, orderBy: { number: 'asc' } });
    expect(depois.map((c) => [c.fluxo, c.rhEnvioSituacao])).toEqual([['RECUSADO', null], ['ENVIADO_RH', 'NA_FILA']]);
    /* O RH aprova AQUELE currículo. */
    expect((await handleCurriculoDaVaga({ sgoCurriculoId: sgoCurriculoId(depois[1].number), situacao: 'aprovado' })).httpStatus).toBe(200);
    expect((await prisma.vagaCurriculo.findUnique({ where: { id: depois[1].id } }))?.fluxo).toBe('APROVADO_RH');
  });

  it('o do supervisor vai direto para a fila do RH', async () => {
    expect((await anexarCurriculos(sup(), id, [{ file: pdf('direto.pdf'), indicadoPor: null }])).ok).toBe(true);
    const c = await prisma.vagaCurriculo.findFirst({ where: { vagaId: id, nomeArquivo: 'direto.pdf' } });
    expect(c).toMatchObject({ fluxo: 'ENVIADO_RH', rhEnvioSituacao: 'NA_FILA' });
  });

  it('arquivo que não é currículo é recusado', async () => {
    const lixo = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], 'virus.pdf');
    expect(await anexarCurriculos(ger(), id, [{ file: lixo, indicadoPor: null }])).toMatchObject({ ok: false, status: 400 });
  });
});

describe('cancelar e excluir são lógicos', () => {
  it('cancelar a vaga que está no RH avisa o RH; a que não chegou só fecha', async () => {
    const noRh = await novaAprovada(); await entregar(noRh);
    expect(await cancelarVaga(sup(), noRh, 'curto')).toMatchObject({ ok: false, status: 400 });
    expect((await cancelarVaga(sup(), noRh, 'A unidade desistiu da contratação.')).ok).toBe(true);
    expect(await prisma.vagaSolicitacao.findUnique({ where: { id: noRh } })).toMatchObject({ status: 'CANCELADA', rhEnvioAcao: 'cancelar', rhEnvioSituacao: 'NA_FILA' });

    const pendente = await criarVaga(ger(), corpo(), []);
    if (!pendente.ok) throw new Error(pendente.error);
    expect((await cancelarVaga(ger(), pendente.id, 'Pedi errado, vou refazer.')).ok).toBe(true);
    expect(await prisma.vagaSolicitacao.findUnique({ where: { id: pendente.id } })).toMatchObject({ status: 'CANCELADA', rhEnvioAcao: null });
  });

  it('excluída some das listas e do detalhe, mas o registro fica', async () => {
    const r = await criarVaga(ger(), corpo(), []);
    if (!r.ok) throw new Error(r.error);
    expect(await excluirVaga(ger(), r.id, 'Motivo qualquer bem escrito.')).toMatchObject({ ok: false, status: 409 });
    expect((await excluirVaga(sup(), r.id, 'Solicitação de teste, duplicada.')).ok).toBe(true);
    expect((await listarVagas(sup())).some((v) => v.id === r.id)).toBe(false);
    expect(await getVaga(sup(), r.id)).toBeNull();
    expect(await prisma.vagaSolicitacao.findUnique({ where: { id: r.id } })).toMatchObject({ excluidaPorNome: 'Supervisora Vaga', motivoExclusao: 'Solicitação de teste, duplicada.' });
  });

  it('quem não alcança a unidade não vê a vaga', async () => {
    const r = await criarVaga(ger(), corpo(), []);
    if (!r.ok) throw new Error(r.error);
    const estranho: SessionUser = { id: gerId, name: 'Outro', role: 'MANAGER', unitIds: [outraId], seesAllUnits: false, needsTerms: false };
    expect(await getVaga(estranho, r.id)).toBeNull();
    expect(await cancelarVaga(estranho, r.id, 'Não deveria conseguir cancelar.')).toMatchObject({ ok: false, status: 404 });
  });
});
