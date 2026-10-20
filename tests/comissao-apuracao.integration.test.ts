import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { montarPrevia, confirmarApuracao, listarApuracoes, getApuracao } from '@/lib/comissao/apuracao';
import { definirFuncoesDaCozinha, getPercentuais, quadroDeFuncoes, setPercentuais, chavesDaCozinha } from '@/lib/comissao/config';
import { getPedidoSwile } from '@/lib/comissao/swile';

/**
 * COMISSÃO (v1.175.0) — a apuração contra o banco: só funcionário cadastrado
 * NA unidade recebe; a cozinha é quem tem função marcada; freelancer fora;
 * vínculo manual fica lembrado; confirmar grava um lançamento COMMISSION por
 * pessoa na competência venda + 2; substituir troca os lançamentos; fechada
 * recusa; escopo por unidade.
 */

const sfx = `com${process.pid.toString(36)}`;
const MES_VENDA = '2019-07'; // bem no passado: competência 2019-09, longe de qualquer outro teste
const COMP = '2019-09';

let unitA = ''; let unitB = ''; let adminId = ''; let supBId = '';
let mariaId = ''; let thiagoId = ''; let anaId = ''; let biaId = ''; let marceloId = ''; let gerenteId = '';
const colabIds: string[] = [];
/* A tabela de funções da cozinha é GLOBAL e `definirFuncoesDaCozinha` substitui o conjunto inteiro:
   guardamos o que havia para devolver no fim — senão o teste apaga a configuração do banco de dev. */
let funcoesAntes: { jobTitleKey: string; jobTitle: string; createdByName: string }[] = [];

const u = (id: string, role: SessionUser['role'], units: string[], seesAll = false): SessionUser => ({ id, name: role, role, unitIds: units, seesAllUnits: seesAll, needsTerms: false });
const admin = () => u(adminId, 'ADMIN', [], true);
const supB = () => u(supBId, 'SUPERVISOR', [unitB]);

const CAB = ['Unidade', 'Garçom', 'Vr. Total'];
const UNI = `0003 - CHURRASCARIA ${sfx} | 001 - CHURRASCARIA`;
const PLANILHA = [
  CAB,
  [UNI, '0001 - GRUPO BEIJA FLOR', 1000], [UNI, '0001 - GRUPO BEIJA FLOR', 500],
  [UNI, `1065 - MARIA MERCES ${sfx}`, 300], [UNI, `1065 - MARIA MERCES ${sfx}`, 200],
  [UNI, `1055 - THIAGO HEITOR ${sfx}`, 100],
  [UNI, '0004 - freelancer 04', 50],
  [UNI, `0106 - MARCELO TELES ${sfx}`, 80],
  [UNI, `0300 - RODRIGO GERENTE ${sfx}`, 1000],
];

beforeAll(async () => {
  const unit = async (code: string, name: string) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await unit(`COM-A-${sfx}`, `Juatuba ${sfx}`);
  unitB = await unit(`COM-B-${sfx}`, `Orla ${sfx}`);
  adminId = (await prisma.user.create({ data: { name: `Admin ${sfx}`, email: `admin.${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supBId = (await prisma.user.create({ data: { name: `Sup ${sfx}`, email: `sup.${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: supBId, unitId: unitB } });
  const colab = async (name: string, jobTitle: string, unitId: string) => {
    const id = (await prisma.collaborator.create({ data: { name, jobTitle, active: true } })).id;
    await prisma.collaboratorUnit.create({ data: { collaboratorId: id, unitId } });
    colabIds.push(id);
    return id;
  };
  mariaId = await colab(`Maria Merces ${sfx}`, 'Garçom', unitA);
  thiagoId = await colab(`Thiago Heitor ${sfx}`, 'Garçom', unitA);
  anaId = await colab(`Ana ${sfx}`, `Auxiliar de Cozinha ${sfx}`, unitA);
  biaId = await colab(`Bia ${sfx}`, `SALADEIRA ${sfx}`, unitA);
  /* Marcelo é funcionário, mas o nome no Teknisa está diferente: vai precisar de vínculo manual */
  marceloId = await colab(`Marcelo Teles da Silva ${sfx}`, 'Garçom', unitA);
  /* gerente da unidade: o nome vende no Teknisa, mas a função deixa fora (v1.176.0) */
  gerenteId = await colab(`Rodrigo Gerente ${sfx}`, 'Gerente de Loja', unitA);
  await prisma.collaborator.update({ where: { id: mariaId }, data: { cpf: '123.456.789-01' } });
  /* função da cozinha em OUTRA unidade: não divide a cozinha da A */
  await colab(`Zé ${sfx}`, `Auxiliar de Cozinha ${sfx}`, unitB);
  funcoesAntes = (await prisma.commissionKitchenJobTitle.findMany()).map((f) => ({ jobTitleKey: f.jobTitleKey, jobTitle: f.jobTitle, createdByName: f.createdByName }));
  await definirFuncoesDaCozinha(admin(), [`Auxiliar de Cozinha ${sfx}`, `saladeira ${sfx}`]);
});

afterAll(async () => {
  await prisma.collaboratorPayout.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.commissionImport.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.commissionSellerLink.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.commissionKitchenJobTitle.deleteMany({});
  if (funcoesAntes.length) await prisma.commissionKitchenJobTitle.createMany({ data: funcoesAntes, skipDuplicates: true });
  await prisma.payoutClosure.deleteMany({ where: { yearMonth: COMP, type: 'COMMISSION' } });
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: colabIds } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: colabIds } } });
  await prisma.unitMembership.deleteMany({ where: { userId: supBId } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supBId] } } });
});

describe('configuração', () => {
  it('percentuais nascem em 1% e 0,5%; só o Admin muda; funções da cozinha ficam marcadas pela chave normalizada', async () => {
    const p = await getPercentuais();
    expect(p.vendedor).toBeGreaterThanOrEqual(0);
    expect((await setPercentuais(supB(), { vendedor: 2, cozinha: 1 })).ok).toBe(false);
    expect((await setPercentuais(admin(), { vendedor: 200, cozinha: 1 })).ok).toBe(false);
    const chaves = await chavesDaCozinha();
    expect(chaves.has(`auxiliar de cozinha ${sfx}`)).toBe(true);
    expect(chaves.has(`saladeira ${sfx}`)).toBe(true);
    const quadro = await quadroDeFuncoes();
    expect(quadro.find((f) => f.jobTitleKey === `saladeira ${sfx}`)).toMatchObject({ marcada: true, colaboradores: 1 });
    expect((await definirFuncoesDaCozinha(u('x', 'MANAGER', [unitA]), ['Garçom'])).ok).toBe(false);
  });
});

describe('prévia', () => {
  it('vendedor casado pelo nome recebe 1%; cozinha = quem tem a função marcada NESTA unidade, em partes iguais; freelancer fora; nome diferente fica "não cadastrado" com sugestão', async () => {
    const r = await montarPrevia(admin(), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'prod.xlsx' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.previa;
    expect(p).toMatchObject({ mesVenda: MES_VENDA, mesApuracao: '2019-08', competencia: COMP, totalVendas: 3230, jaExiste: false, fechada: false, erros: [] });
    /* o gerente casou pelo nome, mas a função deixa FORA: aparece, não recebe */
    expect(p.linhas.find((l) => l.chave === `VENDEDOR:0300 - RODRIGO GERENTE ${sfx}`)).toMatchObject({ kind: 'FUNCAO_FORA', valor: 0, collaboratorName: `Rodrigo Gerente ${sfx}` });
    expect(p.totais.foraPorFuncao).toBe(1);
    expect(p.unidadeDeclarada).toBe(UNI);
    const por = Object.fromEntries(p.linhas.map((l) => [l.chave, l]));
    expect(por[`VENDEDOR:1065 - MARIA MERCES ${sfx}`]).toMatchObject({ kind: 'VENDEDOR', collaboratorId: mariaId, valor: 5 });
    expect(por[`VENDEDOR:1055 - THIAGO HEITOR ${sfx}`]).toMatchObject({ kind: 'VENDEDOR', collaboratorId: thiagoId, valor: 1 });
    expect(por['FREELANCER:0004 - freelancer 04']).toMatchObject({ kind: 'FREELANCER', valor: 0 });
    const marcelo = por[`VENDEDOR:0106 - MARCELO TELES ${sfx}`];
    expect(marcelo).toMatchObject({ kind: 'NAO_CADASTRADO', valor: 0 });
    expect(marcelo.sugestoes?.map((s) => s.collaboratorId)).toEqual([marceloId]);
    const cozinha = p.linhas.filter((l) => l.kind === 'COZINHA');
    expect(cozinha.map((l) => l.collaboratorId).sort()).toEqual([anaId, biaId].sort()); // o Zé é de outra unidade
    expect(cozinha.map((l) => l.valor)).toEqual([3.75, 3.75]); // 1500 × 0,5% = 7,50 ÷ 2
    expect(p.totais.comissao).toBe(5 + 1 + 7.5);
    /* gerente não é oferecido como candidato de vínculo */
    expect(marcelo.sugestoes?.some((s) => s.collaboratorId === gerenteId)).toBe(false);
  });

  it('escopo: supervisor da B não apura a A; gerente não apura; mês inválido e planilha errada recusam', async () => {
    expect((await montarPrevia(supB(), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'x' })).ok).toBe(false);
    expect((await montarPrevia(u('m', 'MANAGER', [unitA]), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'x' })).ok).toBe(false);
    const mes = await montarPrevia(admin(), { unitId: unitA, mesVenda: '2019-13', linhas: PLANILHA, fileName: 'x' });
    expect(mes.ok === false && mes.reason).toBe('MES');
    const pl = await montarPrevia(admin(), { unitId: unitA, mesVenda: MES_VENDA, linhas: [['Produto', 'Qtd'], ['x', 1]], fileName: 'x' });
    expect(pl.ok === false && pl.reason).toBe('PLANILHA');
  });
});

describe('confirmar', () => {
  it('grava a apuração, um lançamento COMMISSION por pessoa na competência venda + 2, aplica ajuste com motivo e lembra o vínculo manual', async () => {
    const r = await confirmarApuracao(admin(), {
      unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'prod.xlsx',
      ajustes: { [`VENDEDOR:1065 - MARIA MERCES ${sfx}`]: { ajuste: 10, motivo: 'combinado com a Maria' } },
      vinculos: { [`0106 - MARCELO TELES ${sfx}`]: marceloId },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r).toMatchObject({ competencia: COMP, lancamentos: 5, total: 15 + 1 + 0.8 + 7.5, substituiu: false });

    const payouts = await prisma.collaboratorPayout.findMany({ where: { unitId: unitA, type: 'COMMISSION', yearMonth: COMP } });
    expect(payouts).toHaveLength(5);
    const maria = payouts.find((p) => p.collaboratorId === mariaId)!;
    expect(Number(maria.amount)).toBe(15);
    expect(maria.note).toContain('× 1%');
    expect(maria.note).toContain('ajuste +10.00 (combinado com a Maria)');
    expect(Number(payouts.find((p) => p.collaboratorId === marceloId)!.amount)).toBe(0.8);
    expect(payouts.find((p) => p.collaboratorId === anaId)!.note).toContain('cozinha');

    const ap = await getApuracao(admin(), r.importId);
    expect(ap).toMatchObject({ mesVenda: MES_VENDA, competencia: COMP, totalVendas: 3230, vendasGrupo: 1500, comissao: 24.3 });
    expect(ap!.linhas.find((l) => l.kind === 'FUNCAO_FORA')!.payoutId).toBeNull();
    expect(payouts.some((p) => p.collaboratorId === gerenteId)).toBe(false);

    /* Pedido de Carga Swile: uma linha por pessoa com CPF; quem não tem CPF vai à parte */
    const swile = await getPedidoSwile(admin(), COMP, unitA);
    expect(swile.linhas).toEqual([{ nome: `Maria Merces ${sfx}`, cpf: '12345678901', valor: 15, unidade: `Juatuba ${sfx}` }]);
    expect(swile.semCpf.map((l) => l.nome).sort()).toEqual([`Ana ${sfx}`, `Bia ${sfx}`, `Marcelo Teles da Silva ${sfx}`, `Thiago Heitor ${sfx}`].sort());
    expect(swile.total).toBe(15);
    expect((await getPedidoSwile(supB(), COMP)).linhas).toEqual([]);
    const grupo = ap!.linhas.find((l) => l.kind === 'GRUPO')!;
    expect(grupo.payoutId).toBeNull();
    expect(ap!.linhas.find((l) => l.kind === 'FREELANCER')!.payoutId).toBeNull();
    expect(ap!.linhas.filter((l) => l.payoutId).length).toBe(5);

    /* o vínculo manual ficou lembrado: a próxima prévia casa o Marcelo sozinha */
    const link = await prisma.commissionSellerLink.findUnique({ where: { unitId_sellerCode: { unitId: unitA, sellerCode: '0106' } } });
    expect(link?.collaboratorId).toBe(marceloId);
    const p2 = await montarPrevia(admin(), { unitId: unitA, mesVenda: '2019-08', linhas: PLANILHA, fileName: 'prod2.xlsx' });
    expect(p2.ok && p2.previa.linhas.find((l) => l.chave === `VENDEDOR:0106 - MARCELO TELES ${sfx}`)).toMatchObject({ kind: 'VENDEDOR', collaboratorId: marceloId, valor: 0.8 });

    const lista = await listarApuracoes(admin());
    expect(lista.find((a) => a.id === r.importId)).toMatchObject({ unidade: `Juatuba ${sfx}`, linhasPagas: 5, naoCadastrados: 0, comissao: 24.3 });
    /* a supervisora da B não vê a apuração da A */
    expect((await listarApuracoes(supB())).some((a) => a.id === r.importId)).toBe(false);
    expect(await getApuracao(supB(), r.importId)).toBeNull();
  });

  it('a mesma unidade e mês de venda: sem "substituir" é DUPLICADO; com, troca os lançamentos e conta a substituição', async () => {
    const dup = await confirmarApuracao(admin(), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'prod.xlsx' });
    expect(dup.ok === false && dup.reason).toBe('DUPLICADO');
    const antes = await prisma.collaboratorPayout.findMany({ where: { unitId: unitA, type: 'COMMISSION', yearMonth: COMP }, select: { id: true } });
    const r = await confirmarApuracao(admin(), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'prod-v2.xlsx', substituir: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.substituiu).toBe(true);
    const depois = await prisma.collaboratorPayout.findMany({ where: { unitId: unitA, type: 'COMMISSION', yearMonth: COMP }, select: { id: true, collaboratorId: true, amount: true } });
    expect(depois.map((p) => p.id).some((id) => antes.map((a) => a.id).includes(id))).toBe(false); // os antigos saíram
    expect(depois).toHaveLength(5); // Marcelo entra pelo vínculo lembrado
    expect(Number(depois.find((p) => p.collaboratorId === mariaId)!.amount)).toBe(5); // sem o ajuste desta vez
    expect((await prisma.commissionImport.findUnique({ where: { unitId_salesMonth: { unitId: unitA, salesMonth: MES_VENDA } } }))?.replacedCount).toBe(1);
  });

  it('ajuste sem motivo recusa (AJUSTE); competência fechada recusa (FECHADA)', async () => {
    const a = await confirmarApuracao(admin(), { unitId: unitA, mesVenda: '2019-10', linhas: PLANILHA, fileName: 'x', ajustes: { [`VENDEDOR:1065 - MARIA MERCES ${sfx}`]: { ajuste: 3, motivo: '' } } });
    expect(a.ok === false && a.reason).toBe('AJUSTE');
    await prisma.payoutClosure.create({ data: { yearMonth: COMP, type: 'COMMISSION', closedByName: 'teste' } });
    const f = await confirmarApuracao(admin(), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'x', substituir: true });
    expect(f.ok === false && f.reason).toBe('FECHADA');
    const p = await montarPrevia(admin(), { unitId: unitA, mesVenda: MES_VENDA, linhas: PLANILHA, fileName: 'x' });
    expect(p.ok && p.previa.fechada).toBe(true);
  });
});
