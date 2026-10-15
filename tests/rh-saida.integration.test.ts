import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createCertificate } from '@/lib/certificates/save';
import { deleteMedicalCertificate } from '@/lib/admin-ops';
import { createTermination, decideTermination } from '@/lib/terminations';
import { criarDemanda, listarDemandas } from '@/lib/rh/demandas';
import { enfileirarAtestado, reenviar, recuperarAposReinicio, listarEventos, resumoDaFila } from '@/lib/rh/saida/fila';
import { despacharPendentes, consultarSituacoes } from '@/lib/rh/saida/despachante';
import { ENDPOINTS, MAX_TENTATIVAS } from '@/lib/rh/saida/regras';
import type { SessionUser } from '@/lib/auth/session';

/**
 * A FILA de envio SGO → GBF-RH (v1.168.0), contra o banco e com o RH simulado.
 *
 * O que se garante aqui é o que o contrato exige e a tela não mostra: o evento
 * nasce no banco junto com o registro (sobrevive a RH fora do ar, sem token e a
 * reinício), o `sgoEventId` não muda entre tentativas, cada classe de resposta
 * faz o que a regra 3 manda, e nada vai ao RH em dobro.
 */

const sfx = `rhs${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitId: string, unitSemCnpj: string, managerId: string, supervisorId: string, adminId: string, collabId: string, collabSemCpf: string;
const manager = (): SessionUser => ({ id: managerId, name: 'Gabriel', role: 'MANAGER', unitIds: [unitId, unitSemCnpj], seesAllUnits: false, needsTerms: false });
const supervisor = (): SessionUser => ({ id: supervisorId, name: 'Sup', role: 'SUPERVISOR', unitIds: [unitId, unitSemCnpj], seesAllUnits: false, needsTerms: false });
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

/** Resposta JSON do RH simulado. Guarda a última requisição para conferir o corpo. */
let ultima: { url: string; init: RequestInit; corpo: Record<string, unknown> } | null = null;
function rhResponde(status: number, body: unknown) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    ultima = { url, init: init ?? {}, corpo: init?.body ? JSON.parse(String(init.body)) : {} };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });
}
function rhCai() {
  vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed'); });
}
const comToken = () => { process.env.RH_WEBHOOK_TOKEN = 'token-de-teste'; process.env.RH_API_URL = 'https://rh-de-teste.local'; };
const semToken = () => { delete process.env.RH_WEBHOOK_TOKEN; };
/* O banco é compartilhado com os outros arquivos (que também enfileiram ao
   criar atestado): a rodada aqui fica recortada às unidades deste arquivo. */
const despachar = (o: { agora?: Date; limite?: number } = {}) => despacharPendentes({ limite: 200, unitIds: [unitId, unitSemCnpj], ...o });

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `RS-${sfx}`, name: `RH Saída ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4, cnpj: '42790781000105' } })).id;
  unitSemCnpj = (await prisma.unit.create({ data: { code: `RN-${sfx}`, name: `Sem CNPJ ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  managerId = (await prisma.user.create({ data: { name: 'Gabriel', email: `ger-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supervisorId = (await prisma.user.create({ data: { name: 'Sup', email: `sup-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `adm-${sfx}@example.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  for (const u of [managerId, supervisorId]) for (const un of [unitId, unitSemCnpj]) await prisma.unitMembership.create({ data: { userId: u, unitId: un } });
  collabId = (await prisma.collaborator.create({ data: { name: `Ana ${sfx}`, cpf: '12345678945', active: true, hireDate: '2024-01-10', units: { create: [{ unitId }, { unitId: unitSemCnpj }] } } })).id;
  collabSemCpf = (await prisma.collaborator.create({ data: { name: `Beto ${sfx}`, active: true, units: { create: [{ unitId }] } } })).id;
});

afterEach(() => { vi.unstubAllGlobals(); ultima = null; });

afterAll(async () => {
  await prisma.rhOutboundEvent.deleteMany({ where: { unitId: { in: [unitId, unitSemCnpj] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitId, unitSemCnpj] } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [collabId, collabSemCpf] } } });
  await prisma.user.deleteMany({ where: { id: { in: [managerId, supervisorId, adminId] } } });
  semToken();
  await prisma.$disconnect();
});

const evento = (referenceId: string, acao = 'criar') => prisma.rhOutboundEvent.findFirst({ where: { referenceId, acao } });

describe('Atestado → fila', () => {
  it('salvar o atestado grava o evento PENDENTE com o corpo do contrato — sem rede', async () => {
    rhCai(); // se alguém tentasse a rede aqui, explodiria
    const r = await createCertificate(manager(), { unitId, collaboratorId: collabId, type: 'COMPANION', startDate: '2026-10-01', endDate: '2026-10-02', observation: 'consulta do filho' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ev = await evento(r.id);
    expect(ev?.status).toBe('PENDENTE');
    expect(ev?.endpoint).toBe(ENDPOINTS.ATESTADO);
    expect(ev?.sgoEventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ev?.payload).toMatchObject({ sgoMovimentoId: r.id, acao: 'criar', cpf: '12345678945', tipo: 'A', tipoDetalhe: 'COMPANION', dataInicio: '2026-10-01', dataFim: '2026-10-02', motivo: 'ACOMPANHANTE', observacoes: 'consulta do filho' });
  });

  it('enfileirar duas vezes o mesmo (tipo, registro, ação) devolve a mesma linha — nada em dobro', async () => {
    const cert = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: collabId, startDate: '2026-10-01' } });
    const a = await enfileirarAtestado(cert!.id, 'criar');
    const b = await enfileirarAtestado(cert!.id, 'criar');
    expect(b.id).toBe(a.id);
    expect(await prisma.rhOutboundEvent.count({ where: { referenceId: cert!.id, acao: 'criar' } })).toBe(1);
  });

  it('colaborador sem CPF: o evento nasce ERRO permanente com o que falta — o pedido do gerente não é barrado', async () => {
    const r = await createCertificate(manager(), { unitId, collaboratorId: collabSemCpf, startDate: '2026-10-05', endDate: '2026-10-05' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ev = await evento(r.id);
    expect(ev?.status).toBe('ERRO');
    expect(ev?.ultimoErro).toContain('sem CPF');
  });

  it('sem RH_WEBHOOK_TOKEN o despachante não toca em nada: pendente continua pendente, sem chamada', async () => {
    semToken();
    rhCai();
    const r = await despachar();
    expect(r.semToken).toBe(true);
    expect(r.processados).toBe(0);
    const cert = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: collabId, startDate: '2026-10-01' } });
    expect((await evento(cert!.id))?.status).toBe('PENDENTE');
  });

  it('com token: 201 → ENVIADO, Bearer no header, sgoEventId no corpo, rhAtestadoId gravado no atestado', async () => {
    comToken();
    rhResponde(201, { status: 'processado', rhAtestadoId: 'RH-ATT-1' });
    const r = await despachar({ limite: 200 });
    expect(r.enviados).toBeGreaterThanOrEqual(1);
    const cert = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: collabId, startDate: '2026-10-01' } });
    const ev = await evento(cert!.id);
    expect(ev?.status).toBe('ENVIADO');
    expect(ev?.rhId).toBe('RH-ATT-1');
    expect(ev?.httpStatus).toBe(201);
    expect(cert && (await prisma.medicalCertificate.findUnique({ where: { id: cert.id } }))?.rhAtestadoId).toBe('RH-ATT-1');
    expect(ultima?.url).toBe(`https://rh-de-teste.local${ENDPOINTS.ATESTADO}`);
    expect((ultima?.init.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste');
    expect(ultima?.corpo.sgoEventId).toBe(ev?.sgoEventId);
    expect(ultima?.corpo).not.toHaveProperty('anexo'); // sem foto, sem campo
  });

  it('excluir o atestado já aceito enfileira "cancelar" com o mesmo sgoMovimentoId; "duplicado" conta como enviado', async () => {
    comToken();
    const cert = await prisma.medicalCertificate.findFirst({ where: { collaboratorId: collabId, startDate: '2026-10-01' } });
    const del = await deleteMedicalCertificate(admin(), cert!.id);
    expect(del.ok).toBe(true);
    const ev = await evento(cert!.id, 'cancelar');
    expect(ev?.status).toBe('PENDENTE');
    expect(ev?.payload).toMatchObject({ sgoMovimentoId: cert!.id, acao: 'cancelar', cpf: '12345678945' });
    rhResponde(200, { status: 'duplicado' });
    await despachar({ limite: 200 });
    expect((await evento(cert!.id, 'cancelar'))?.status).toBe('ENVIADO');
  });

  it('excluir um atestado cujo "criar" NUNCA foi enviado descarta a linha pendente (não há o que cancelar no RH)', async () => {
    semToken();
    const r = await createCertificate(manager(), { unitId, collaboratorId: collabId, startDate: '2026-10-10', endDate: '2026-10-10' });
    if (!r.ok) throw new Error('não criou');
    expect((await evento(r.id))?.status).toBe('PENDENTE');
    await deleteMedicalCertificate(admin(), r.id);
    expect(await prisma.rhOutboundEvent.count({ where: { referenceId: r.id } })).toBe(0);
  });
});

describe('Regra 3: respostas do RH', () => {
  async function novoPendente(start: string) {
    semToken();
    const r = await createCertificate(manager(), { unitId, collaboratorId: collabId, startDate: start, endDate: start });
    if (!r.ok) throw new Error(`não criou ${r.reason}`);
    return r.id;
  }

  it('422 = ERRO de dados: não tenta de novo, guarda a resposta com CPF mascarado', async () => {
    const id = await novoPendente('2026-09-01');
    comToken();
    rhResponde(422, { status: 'recusado', resultado: 'Colaborador 12345678945 sem contrato ativo' });
    await despachar({ limite: 200 });
    const ev = await evento(id);
    expect(ev?.status).toBe('ERRO');
    expect(ev?.ultimoErro).toBe('HTTP 422 — Colaborador 123.***.***-45 sem contrato ativo');
    expect(JSON.stringify(ev?.resposta)).not.toContain('12345678945');
    rhResponde(201, { status: 'processado' });
    const r2 = await despachar({ limite: 200 });
    expect((await evento(id))?.status).toBe('ERRO'); // não foi retomado sozinho
    void r2;
  });

  it('reenvio manual (só Admin) remonta do cadastro e devolve à fila com o MESMO sgoEventId', async () => {
    /* o evento do 422 — não o do colaborador sem CPF, que continua sem conserto no cadastro */
    const ev0 = await prisma.rhOutboundEvent.findFirst({ where: { status: 'ERRO', unitId, tipo: 'ATESTADO', httpStatus: 422 } });
    expect(ev0).not.toBeNull();
    expect((await reenviar(manager(), ev0!.id)).ok).toBe(false);
    const r = await reenviar(admin(), ev0!.id);
    expect(r.ok && r.status).toBe('PENDENTE');
    const ev1 = await prisma.rhOutboundEvent.findUnique({ where: { id: ev0!.id } });
    expect(ev1?.sgoEventId).toBe(ev0!.sgoEventId);
    expect(ev1?.tentativas).toBe(0);
    comToken();
    rhResponde(201, { status: 'processado', rhAtestadoId: 'RH-ATT-2' });
    await despachar({ limite: 200 });
    expect((await prisma.rhOutboundEvent.findUnique({ where: { id: ev0!.id } }))?.status).toBe('ENVIADO');
  });

  it('503 / rede = adiar com espera crescente; na 10ª vira ESGOTADO e continua guardado', async () => {
    const id = await novoPendente('2026-09-02');
    comToken();
    rhResponde(503, 'indisponível');
    let agora = new Date();
    await despachar({ agora, limite: 200 });
    let ev = await evento(id);
    expect(ev?.status).toBe('PENDENTE');
    expect(ev?.tentativas).toBe(1);
    expect(ev!.proximaTentativaEm.getTime()).toBeGreaterThan(agora.getTime());
    /* antes da hora, o despachante não pega */
    await despachar({ agora, limite: 200 });
    expect((await evento(id))?.tentativas).toBe(1);
    rhCai();
    for (let i = 2; i <= MAX_TENTATIVAS; i++) {
      agora = new Date(agora.getTime() + 24 * 3600_000); // bem depois da espera
      await despachar({ agora, limite: 200 });
    }
    ev = await evento(id);
    expect(ev?.status).toBe('ESGOTADO');
    expect(ev?.tentativas).toBe(MAX_TENTATIVAS);
    expect(ev?.sgoEventId).toBeTruthy();
    /* esgotado é reenviável */
    expect((await reenviar(admin(), ev!.id)).ok).toBe(true);
    expect((await evento(id))?.status).toBe('PENDENTE');
  });

  it('401 = PARADO: o despacho para na hora (o segundo pendente nem é tentado); o reinício devolve à fila', async () => {
    /* esvazia o que os casos anteriores deixaram pendente, para a rodada ter só a e b */
    comToken();
    rhResponde(201, { status: 'processado' });
    await despachar();
    const a = await novoPendente('2026-09-03');
    const b = await novoPendente('2026-09-04');
    comToken();
    let chamadas = 0;
    vi.stubGlobal('fetch', async () => { chamadas++; return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 }); });
    const r = await despachar({ limite: 200 });
    expect(r.parado).toBe(true);
    expect(chamadas).toBe(1);
    const parados = await prisma.rhOutboundEvent.findMany({ where: { referenceId: { in: [a, b] } } });
    expect(parados.map((e) => e.status).sort()).toEqual(['PARADO', 'PENDENTE']);
    expect(parados.find((e) => e.status === 'PARADO')?.tentativas).toBe(0); // não é falha do evento
    const n = await recuperarAposReinicio();
    expect(n).toBeGreaterThanOrEqual(1);
    expect((await prisma.rhOutboundEvent.findMany({ where: { referenceId: { in: [a, b] } } })).every((e) => e.status === 'PENDENTE')).toBe(true);
    rhResponde(201, { status: 'processado' });
    await despachar({ limite: 200 });
  });

  it('404 em desligamento/demanda = módulo não ligado: adia, não é erro de dados', async () => {
    const id = await novoPendente('2026-09-05');
    comToken();
    rhResponde(404, { error: 'not found' });
    await despachar({ limite: 200 });
    const ev = await evento(id);
    expect(ev?.status).toBe('PENDENTE');
    expect(ev?.tentativas).toBe(1);
    rhResponde(201, { status: 'processado' });
    await despachar({ agora: new Date(Date.now() + 3600_000), limite: 200 });
  });
});

describe('Desligamento → RH só na aprovação', () => {
  let termId: string;
  it('o pedido do gerente NÃO gera evento; fica Aguardando aprovação', async () => {
    const r = await createTermination(manager(), { unitId, collaboratorId: collabId, terminationKind: 'DISPENSA_SEM_JUSTA_CAUSA', noticeMode: 'INDENIZADO', reasonCode: 'REDUCAO_QUADRO', terminationDate: '2026-10-30', reason: 'reestruturação' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    termId = r.id;
    expect(await prisma.rhOutboundEvent.count({ where: { referenceId: termId } })).toBe(0);
    expect((await prisma.termination.findUnique({ where: { id: termId } }))?.status).toBe('PENDING');
  });
  it('quem pediu não aprova o próprio pedido', async () => {
    const r = await decideTermination({ ...manager(), role: 'SUPERVISOR' }, termId, true, undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });
  it('a aprovação do supervisor enfileira com o CNPJ da unidade do pedido e os valores do contrato; o RH devolve processo e prazo', async () => {
    semToken();
    const r = await decideTermination(supervisor(), termId, true, undefined);
    expect(r.ok).toBe(true);
    const ev = await evento(termId, 'solicitar');
    expect(ev?.status).toBe('PENDENTE');
    expect(ev?.endpoint).toBe(ENDPOINTS.DESLIGAMENTO);
    expect(ev?.payload).toMatchObject({ cpf: '12345678945', unitCode: '42790781000105', dataDesligamento: '2026-10-30', tipo: 'dispensa_sem_justa_causa', modalidadeAviso: 'indenizado', motivo: 'reducao_quadro', observacao: 'reestruturação', solicitanteNome: 'Gabriel' });
    comToken();
    rhResponde(201, { status: 'processado', processo: 'DES-2026-77', prazoLegal: '2026-11-09' });
    await despachar({ limite: 200 });
    const t = await prisma.termination.findUnique({ where: { id: termId } });
    expect(t?.rhProcesso).toBe('DES-2026-77');
    expect(t?.rhPrazoLegal).toBe('2026-11-09');
    expect(t?.rhSituacao).toBe('solicitado');
  });
  it('a situação é consultada por GET .../{sgoEventId} e gravada no pedido', async () => {
    comToken();
    const ev = await evento(termId, 'solicitar');
    rhResponde(200, { situacao: 'em_andamento' });
    const r = await consultarSituacoes();
    expect(r.alterados).toBeGreaterThanOrEqual(1);
    expect(ultima?.url).toBe(`https://rh-de-teste.local${ENDPOINTS.DESLIGAMENTO}/${ev!.sgoEventId}`);
    expect((await prisma.termination.findUnique({ where: { id: termId } }))?.rhSituacao).toBe('em_andamento');
  });
  it('unidade sem CNPJ: evento nasce ERRO nomeando o que falta; pedido anterior à integração não é enviado', async () => {
    const r = await createTermination(manager(), { unitId: unitSemCnpj, collaboratorId: collabId, terminationKind: 'JUSTA_CAUSA', reasonCode: 'COMPORTAMENTO', terminationDate: '2026-10-31', reason: '' });
    if (!r.ok) throw new Error(r.message ?? r.reason);
    await decideTermination(supervisor(), r.id, true, undefined);
    const ev = await evento(r.id, 'solicitar');
    expect(ev?.status).toBe('ERRO');
    expect(ev?.ultimoErro).toContain('sem CNPJ');
    expect(ev?.payload).toEqual({});
    /* legado: sem terminationKind */
    const legado = await prisma.termination.create({ data: { unitId, collaboratorId: collabId, requestedById: managerId, noticeType: 'WORKED', reason: 'antigo', collaboratorName: 'Ana' } });
    await decideTermination(supervisor(), legado.id, true, undefined);
    expect(await prisma.rhOutboundEvent.count({ where: { referenceId: legado.id } })).toBe(0);
  });
  it('pedido de demissão exige carta; justa causa não leva modalidade', async () => {
    const semCarta = await createTermination(manager(), { unitId, collaboratorId: collabId, terminationKind: 'PEDIDO_DEMISSAO', noticeMode: 'TRABALHADO_2H', reasonCode: 'OUTRA_OPORTUNIDADE', terminationDate: '2026-11-01', reason: '' });
    expect(semCarta.ok).toBe(false);
    const jc = await createTermination(manager(), { unitId, collaboratorId: collabId, terminationKind: 'JUSTA_CAUSA', noticeMode: 'INDENIZADO', reasonCode: 'COMPORTAMENTO', terminationDate: '2026-11-01', reason: '' });
    expect(jc.ok).toBe(true);
    if (jc.ok) expect((await prisma.termination.findUnique({ where: { id: jc.id } }))?.noticeMode).toBeNull();
  });
});

describe('Demanda ao RH', () => {
  it('cria, enfileira, envia e mostra ao gerente número/prazo/situação sem o detalhe técnico', async () => {
    semToken();
    const r = await criarDemanda(manager(), { unitId, tipo: 'FERIAS', titulo: 'Antecipar férias da Ana', descricao: 'pedido da própria', collaboratorId: collabId, prioridade: 'ALTA', dataEvento: '2026-12-01' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ev = await evento(r.id, 'solicitar');
    expect(ev?.endpoint).toBe(ENDPOINTS.DEMANDA);
    expect(ev?.payload).toMatchObject({ tipo: 'ferias', titulo: 'Antecipar férias da Ana', descricao: 'pedido da própria', cpf: '12345678945', unitCode: '42790781000105', solicitanteNome: 'Gabriel', dataEvento: '2026-12-01', prioridade: 'alta' });
    let lista = await listarDemandas(manager());
    expect(lista.find((d) => d.id === r.id)?.envio).toBe('AGUARDANDO');
    comToken();
    rhResponde(201, { status: 'processado', numero: 'DM-15', prazoAlvo: '2026-10-21' });
    await despachar({ limite: 200 });
    lista = await listarDemandas(manager());
    const d = lista.find((x) => x.id === r.id)!;
    expect(d.envio).toBe('ENVIADO');
    expect(d.rhNumero).toBe('DM-15');
    expect(d.rhPrazoAlvo).toBe('2026-10-21');
    expect(d.situacaoRotulo).toBe('Solicitado');
    expect(Object.keys(d)).not.toContain('ultimoErro');
  });
  it('recusa tipo inválido, título vazio/longo e colaborador de outra unidade', async () => {
    expect((await criarDemanda(manager(), { unitId, tipo: 'X', titulo: 't' })).ok).toBe(false);
    expect((await criarDemanda(manager(), { unitId, tipo: 'DUVIDA', titulo: '' })).ok).toBe(false);
    expect((await criarDemanda(manager(), { unitId, tipo: 'DUVIDA', titulo: 'x'.repeat(201) })).ok).toBe(false);
    expect((await criarDemanda(manager(), { unitId: unitSemCnpj, tipo: 'DUVIDA', titulo: 't', collaboratorId: collabSemCpf })).ok).toBe(false);
  });
});

describe('Tela do Admin', () => {
  it('lista com CPF mascarado e resumo por status', async () => {
    const eventos = await listarEventos({ status: 'ENVIADO', limite: 500 });
    const meus = eventos.filter((e) => e.unitName?.includes(sfx));
    expect(meus.length).toBeGreaterThan(0);
    for (const e of meus) {
      expect(e.resumo).not.toContain('12345678945');
      expect(JSON.stringify(e)).not.toContain('12345678945');
    }
    const r = await resumoDaFila();
    expect(r.enviados).toBeGreaterThan(0);
  });
});
