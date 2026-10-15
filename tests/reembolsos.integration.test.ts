import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { createPaymentRequest } from '@/lib/payments/create';
import { approverEditRequest, approveRequest } from '@/lib/payments/approve';
import { getReembolsos, lerFiltroReembolso, queryDoFiltroReembolso, resumirReembolsos, porColaboradorReembolso, comprovanteValido, type LinhaReembolso } from '@/lib/payments/reembolsos';
import type { SessionUser } from '@/lib/auth/session';

/**
 * REEMBOLSO (v1.169.0) — o "Pagamento Avulso" com o nome certo.
 *
 * O que muda é a FOLHA, não o fluxo: o beneficiário virou o colaborador do RH
 * (obrigatório — decisão do Pedro), com data da despesa, descrição obrigatória
 * e comprovante do volume da própria unidade; aprovar e pagar seguem iguais.
 * A planilha e a tela leem a mesma consulta, no escopo do usuário.
 */

const sfx = `rb${process.pid.toString(36)}${Date.now().toString(36).slice(-3)}`;
let unitA: string, unitB: string, mgrId: string, supId: string, colabA: string, colabB: string, motivoSup: string;
const mgr = (): SessionUser => ({ id: mgrId, name: 'Gerente', role: 'MANAGER', unitIds: [unitA], seesAllUnits: false, needsTerms: false });
const sup = (): SessionUser => ({ id: supId, name: 'Supervisora', role: 'SUPERVISOR', unitIds: [unitA, unitB], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  unitA = (await prisma.unit.create({ data: { code: `RA-${sfx}`, name: `Reemb A ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitB = (await prisma.unit.create({ data: { code: `RB-${sfx}`, name: `Reemb B ${sfx}`, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  mgrId = (await prisma.user.create({ data: { name: 'Gerente', email: `rb-ger-${sfx}@example.com`, role: 'MANAGER', passwordHash: 'x' } })).id;
  supId = (await prisma.user.create({ data: { name: 'Supervisora', email: `rb-sup-${sfx}@example.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: mgrId, unitId: unitA } });
  for (const u of [unitA, unitB]) await prisma.unitMembership.create({ data: { userId: supId, unitId: u } });
  colabA = (await prisma.collaborator.create({ data: { name: `Carlos ${sfx}`, cpf: '12345678909', active: true, source: 'RH', units: { create: { unitId: unitA } } } })).id;
  colabB = (await prisma.collaborator.create({ data: { name: `Bia ${sfx}`, active: true, source: 'RH', units: { create: { unitId: unitB } } } })).id;
  motivoSup = (await prisma.miscPaymentType.create({ data: { name: `Passagem ${sfx}`, approverRole: 'SUPERVISOR' } })).id;
});

afterAll(async () => {
  await prisma.paymentRequest.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.miscPaymentType.deleteMany({ where: { id: motivoSup } });
  await prisma.collaborator.deleteMany({ where: { id: { in: [colabA, colabB] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [mgrId, supId] } } });
  await prisma.$disconnect();
});

describe('Pedir reembolso', () => {
  it('exige colaborador do RH DA UNIDADE, motivo e descrição', async () => {
    const semColab = await createPaymentRequest(mgr(), { type: 'MISC', unitId: unitA, amount: 30, miscTypeId: motivoSup, description: 'passagem' });
    expect(semColab.ok).toBe(false);
    if (!semColab.ok) expect(semColab.detail).toContain('colaborador');
    const deOutraUnidade = await createPaymentRequest(mgr(), { type: 'MISC', unitId: unitA, amount: 30, miscTypeId: motivoSup, collaboratorId: colabB, description: 'passagem' });
    expect(deOutraUnidade.ok).toBe(false);
    const semMotivo = await createPaymentRequest(mgr(), { type: 'MISC', unitId: unitA, amount: 30, collaboratorId: colabA, description: 'passagem' });
    expect(semMotivo.ok).toBe(false);
    const semDescricao = await createPaymentRequest(mgr(), { type: 'MISC', unitId: unitA, amount: 30, miscTypeId: motivoSup, collaboratorId: colabA });
    expect(semDescricao.ok).toBe(false);
    if (!semDescricao.ok) expect(semDescricao.detail).toContain('Descreva');
  });

  it('grava o nome do cadastro (não o texto do corpo), a data da despesa e o comprovante da própria unidade', async () => {
    const r = await createPaymentRequest(mgr(), {
      type: 'MISC', unitId: unitA, amount: 12.5, miscTypeId: motivoSup, collaboratorId: colabA, workDate: '2026-10-12',
      description: 'passagem ida e volta', beneficiary: 'nome que NÃO deve valer', attachmentPath: `uploads/${unitA}/reembolso-1-100.jpg`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = await prisma.paymentRequest.findUnique({ where: { id: r.id } });
    expect(row?.collaboratorId).toBe(colabA);
    expect(row?.collaboratorName).toBe(`Carlos ${sfx}`);
    expect(row?.beneficiary).toBe(`Carlos ${sfx}`);
    expect(row?.workDate?.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect(row?.attachmentPath).toBe(`uploads/${unitA}/reembolso-1-100.jpg`);
    expect(row?.approverRole).toBe('SUPERVISOR'); // o motivo decide quem aprova — regra de sempre
    expect(row?.status).toBe('PENDING');
  });

  it('comprovante de OUTRA unidade ou fora do volume é recusado', async () => {
    const r = await createPaymentRequest(mgr(), { type: 'MISC', unitId: unitA, amount: 10, miscTypeId: motivoSup, collaboratorId: colabA, description: 'x', attachmentPath: `uploads/${unitB}/reembolso-2-100.jpg` });
    expect(r.ok).toBe(false);
    expect(comprovanteValido('../../etc/passwd', unitA)).toBe(false);
    expect(comprovanteValido(`uploads/${unitA}/a.pdf`, unitA)).toBe(true);
    expect(comprovanteValido(undefined, unitA)).toBe(true);
  });

  it('o aprovador corrige o colaborador pela lista do RH e a data; registro antigo mantém o nome digitado', async () => {
    /* Pedido na unidade B feito por OUTRA pessoa: quem pede não corrige o próprio pedido (regra de sempre). */
    const r = { ok: true as const, id: (await prisma.paymentRequest.create({ data: { type: 'MISC', unitId: unitB, requestedById: mgrId, approverRole: 'SUPERVISOR', amount: 40, miscTypeId: motivoSup, collaboratorId: colabB, collaboratorName: `Bia ${sfx}`, beneficiary: `Bia ${sfx}`, description: 'diferença' } })).id };
    /* legado: linha antiga, sem colaborador, só com beneficiário digitado */
    const legado = await prisma.paymentRequest.create({ data: { type: 'MISC', unitId: unitB, requestedById: mgrId, approverRole: 'SUPERVISOR', amount: 15, miscTypeId: motivoSup, beneficiary: 'Fulano Antigo', description: 'antigo' } });
    const e1 = await approverEditRequest(sup(), r.id, { workDate: '2026-10-01', amount: 45 });
    expect(e1.ok).toBe(true);
    const atual = await prisma.paymentRequest.findUnique({ where: { id: r.id } });
    expect(atual?.workDate?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(Number(atual?.amount)).toBe(45);
    const e2 = await approverEditRequest(sup(), r.id, { collaboratorId: colabA }); // colabA não é da unidade B
    expect(e2.ok).toBe(false);
    const e3 = await approverEditRequest(sup(), legado.id, { beneficiary: 'Fulano Corrigido' });
    expect(e3.ok).toBe(true);
    expect((await prisma.paymentRequest.findUnique({ where: { id: legado.id } }))?.beneficiary).toBe('Fulano Corrigido');
  });
});

describe('Lista e planilha', () => {
  it('consulta no escopo do usuário, período pela solicitação, totais sem rejeitado e por colaborador', async () => {
    const pago = await createPaymentRequest(mgr(), { type: 'MISC', unitId: unitA, amount: 20, miscTypeId: motivoSup, collaboratorId: colabA, description: 'ônibus' });
    if (!pago.ok) throw new Error('não criou');
    expect((await approveRequest(sup(), pago.id)).ok).toBe(true);

    const filtro = lerFiltroReembolso(new URLSearchParams('periodo=mes'));
    const gerente = await getReembolsos(mgr(), filtro);
    expect(gerente.linhas.every((l) => l.unitId === unitA)).toBe(true);
    expect(gerente.linhas.length).toBeGreaterThanOrEqual(2);
    const carlos = gerente.porColaborador.find((c) => c.chave === colabA)!;
    expect(carlos.quantidade).toBeGreaterThanOrEqual(2);
    expect(carlos.cpf).toBe('12345678909');

    const rede = await getReembolsos(sup(), filtro);
    expect(rede.linhas.some((l) => l.unitId === unitB)).toBe(true);
    expect(rede.linhas.find((l) => l.colaborador === 'Fulano Corrigido')?.colaboradorId).toBeNull(); // legado continua legível

    /* unidade fora do alcance na URL: vazio, nunca a rede */
    const fora = await getReembolsos(mgr(), { ...filtro, unitId: unitB });
    expect(fora.linhas).toEqual([]);

    const soAprovados = await getReembolsos(mgr(), { ...filtro, status: 'APPROVED' });
    expect(soAprovados.linhas.map((l) => l.id)).toContain(pago.id);
    expect(soAprovados.linhas.every((l) => l.status === 'APPROVED')).toBe(true);
    expect(queryDoFiltroReembolso({ ...filtro, unitId: unitA, status: 'PAID' })).toBe(`periodo=mes&unit=${unitA}&status=PAID`);
  });

  it('regras puras: rejeitado fora do total, por colaborador agrupa por id e cai no nome no legado', () => {
    const base = { unitId: 'u', unidade: 'U', dataSolicitacao: '2026-10-15', descricao: '', status: 'PAID' as const, solicitadoPor: 'G', aprovadoPor: null, aprovadoEm: null, pagoPor: null, pagoEm: null, comprovante: true, rejeicao: null, dataDespesa: null, cpf: null, motivo: 'Passagem' };
    const xs: LinhaReembolso[] = [
      { ...base, id: '1', colaboradorId: 'c1', colaborador: 'Ana', valor: 10 },
      { ...base, id: '2', colaboradorId: 'c1', colaborador: 'Ana', valor: 5.5, status: 'PENDING', comprovante: false },
      { ...base, id: '3', colaboradorId: null, colaborador: 'Fulano', valor: 7, status: 'REJECTED' },
      { ...base, id: '4', colaboradorId: null, colaborador: 'fulano', valor: 3, status: 'APPROVED' },
    ];
    const r = resumirReembolsos(xs);
    expect(r).toEqual({ quantidade: 4, total: 18.5, pendente: 5.5, aPagar: 3, pago: 10, rejeitado: 7, semComprovante: 1 });
    const pc = porColaboradorReembolso(xs);
    expect(pc.map((c) => [c.colaborador, c.quantidade, c.total, c.pago, c.pendente])).toEqual([['Ana', 2, 15.5, 10, 5.5], ['fulano', 1, 3, 0, 3]]);
  });
});
