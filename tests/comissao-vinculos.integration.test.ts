import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import type { SessionUser } from '@/lib/auth/session';
import { montarPrevia } from '@/lib/comissao/apuracao';
import { criarVinculo, desfazerIgnorar, ignorarSugestao, listarVinculos, removerVinculo } from '@/lib/comissao/vinculos';

/**
 * VÍNCULOS DA COMISSÃO (v1.178.0) — grafia diferente vira SUGESTÃO com % (não
 * vínculo automático); confirmar grava o apelido e a próxima prévia já casa;
 * "Ignorar" tira a sugestão de vez; a tabela mostra situação; escopo por unidade.
 */

const sfx = `cv${process.pid.toString(36)}`;
let unitA = ''; let unitB = ''; let adminId = ''; let supBId = ''; let janainaId = ''; let joanaId = ''; let inativoId = '';
const colabIds: string[] = [];
const u = (id: string, role: SessionUser['role'], units: string[], seesAll = false): SessionUser => ({ id, name: `${role} ${sfx}`, role, unitIds: units, seesAllUnits: seesAll, needsTerms: false });
const admin = () => u(adminId, 'ADMIN', [], true);
const supB = () => u(supBId, 'SUPERVISOR', [unitB]);

const UNI = `0003 - CHURRASCARIA ${sfx} | 001 - CHURRASCARIA`;
const PLANILHA = [
  ['Unidade', 'Garçom', 'Vr. Total'],
  [UNI, `1036 - JANAINA SOUZA ${sfx}`, 500],
];
const prev = () => montarPrevia(admin(), { unitId: unitA, mesVenda: '2019-03', linhas: PLANILHA, fileName: 't.xlsx' });
const linhaDaJanaina = async () => {
  const r = await prev();
  if (!r.ok) throw new Error(r.erro);
  return r.previa.linhas.find((l) => l.nome.startsWith('JANAINA'))!;
};

beforeAll(async () => {
  const unit = async (code: string, name: string) => (await prisma.unit.create({ data: { code, name, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  unitA = await unit(`CV-A-${sfx}`, `Nova União ${sfx}`);
  unitB = await unit(`CV-B-${sfx}`, `Orla ${sfx}`);
  adminId = (await prisma.user.create({ data: { name: `Admin ${sfx}`, email: `admin.${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
  supBId = (await prisma.user.create({ data: { name: `Sup ${sfx}`, email: `sup.${sfx}@e.com`, role: 'SUPERVISOR', passwordHash: 'x' } })).id;
  await prisma.unitMembership.create({ data: { userId: supBId, unitId: unitB } });
  const colab = async (name: string, active = true) => {
    const id = (await prisma.collaborator.create({ data: { name, jobTitle: 'Operador de Caixa', active } })).id;
    await prisma.collaboratorUnit.create({ data: { collaboratorId: id, unitId: unitA } });
    colabIds.push(id);
    return id;
  };
  janainaId = await colab(`Janaina Sousa Coelho ${sfx}`);
  joanaId = await colab(`Joana Lima ${sfx}`);
  inativoId = await colab(`Paulo Antigo ${sfx}`, false);
});

afterAll(async () => {
  await prisma.commissionLinkDismissal.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.commissionSellerLink.deleteMany({ where: { unitId: { in: [unitA, unitB] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, supBId] } } });
  await prisma.collaboratorUnit.deleteMany({ where: { collaboratorId: { in: colabIds } } });
  await prisma.collaborator.deleteMany({ where: { id: { in: colabIds } } });
  await prisma.unitMembership.deleteMany({ where: { userId: supBId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, supBId] } } });
  await prisma.unit.deleteMany({ where: { id: { in: [unitA, unitB] } } });
});

describe('Souza × Sousa vira sugestão com percentual, não vínculo automático', () => {
  it('a prévia deixa "JANAINA SOUZA" fora da comissão, com Janaina Sousa Coelho sugerida acima de 90%', async () => {
    const l = await linhaDaJanaina();
    expect(l.kind).toBe('NAO_CADASTRADO');
    expect(l.sugestoes?.[0]).toMatchObject({ collaboratorId: janainaId });
    expect(l.sugestoes![0].confianca).toBeGreaterThanOrEqual(90);
    expect(l.sugestoes!.some((s) => s.collaboratorId === joanaId)).toBe(false); // nome diferente não aparece
  });

  it('"Ignorar" tira a sugestão de vez; "Desfazer" devolve', async () => {
    expect((await ignorarSugestao(admin(), { unitId: unitA, sellerCode: '1036', sellerName: `JANAINA SOUZA ${sfx}`, collaboratorId: janainaId })).ok).toBe(true);
    expect((await linhaDaJanaina()).sugestoes?.some((s) => s.collaboratorId === janainaId)).toBe(false);
    const { ignorados } = await listarVinculos(admin(), [unitA]);
    expect(ignorados).toHaveLength(1);
    expect((await desfazerIgnorar(admin(), ignorados[0].id)).ok).toBe(true);
    expect((await linhaDaJanaina()).sugestoes?.[0].collaboratorId).toBe(janainaId);
  });

  it('confirmar grava o apelido e a próxima prévia já paga a Janaina — sem tocar no cadastro', async () => {
    expect((await criarVinculo(admin(), { unitId: unitA, sellerCode: '1036', sellerName: `janaina souza ${sfx}`, collaboratorId: janainaId })).ok).toBe(true);
    const l = await linhaDaJanaina();
    expect(l.kind).toBe('VENDEDOR');
    expect(l.collaboratorId).toBe(janainaId);
    expect(l.valor).toBe(5);
    const c = await prisma.collaborator.findUnique({ where: { id: janainaId } });
    expect(c?.name).toBe(`Janaina Sousa Coelho ${sfx}`);
    const { vinculos } = await listarVinculos(admin(), [unitA]);
    expect(vinculos).toEqual([expect.objectContaining({ sellerCode: '1036', sellerName: `JANAINA SOUZA ${sfx}`.toUpperCase(), situacao: 'VINCULADO' })]);
    expect(await prisma.auditLog.count({ where: { userId: adminId, action: 'COMMISSION_LINK_CREATE' } })).toBe(1);
  });

  it('recusa colaborador inativo, código vazio e unidade fora do alcance', async () => {
    expect((await criarVinculo(admin(), { unitId: unitA, sellerCode: '2000', sellerName: 'PAULO', collaboratorId: inativoId })).ok).toBe(false);
    expect((await criarVinculo(admin(), { unitId: unitA, sellerCode: '', sellerName: 'X', collaboratorId: joanaId })).ok).toBe(false);
    const r = await criarVinculo(supB(), { unitId: unitA, sellerCode: '3000', sellerName: 'JOANA', collaboratorId: joanaId });
    expect(r.ok === false && r.reason).toBe('FORBIDDEN');
    expect((await listarVinculos(supB())).vinculos).toHaveLength(0);
  });

  it('vínculo que aponta para quem ficou inativo aparece com a situação; remover volta para a comparação de nomes', async () => {
    await prisma.collaborator.update({ where: { id: janainaId }, data: { active: false } });
    const { vinculos } = await listarVinculos(admin(), [unitA]);
    expect(vinculos[0].situacao).toBe('INATIVO');
    await prisma.collaborator.update({ where: { id: janainaId }, data: { active: true } });
    expect((await removerVinculo(supB(), vinculos[0].id)).ok).toBe(false);
    expect((await removerVinculo(admin(), vinculos[0].id)).ok).toBe(true);
    expect((await linhaDaJanaina()).kind).toBe('NAO_CADASTRADO');
  });
});
