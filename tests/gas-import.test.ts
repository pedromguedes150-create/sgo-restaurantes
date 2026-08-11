import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { validateGasImport, commitGasImport, parseDateCell, parseDecimal, COLS, FORMA_BOTIJAO } from '@/lib/notes/gas-import';
import type { SessionUser } from '@/lib/auth/session';

const sfx = `gimp${process.pid.toString(36)}`;
const UCNPJ = '05336082000163', SCNPJ = '61602199027665', NGCNPJ = '11222333000181';
let unitId: string, gasSupId: string, nonGasSupId: string, adminId: string;
const admin = (): SessionUser => ({ id: adminId, name: 'Adm', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [COLS.empresa]: 'Empresa X', [COLS.cnpj]: '05.336.082/0001-63', [COLS.fornecedorNome]: 'Ultragaz',
    [COLS.cnpjFornecedor]: '61.602.199/0276-65', [COLS.numero]: '6766', [COLS.emissao]: '15/01/2022',
    [COLS.preco]: '6,528', [COLS.quantidade]: '640', ...over,
  };
}

beforeAll(async () => {
  unitId = (await prisma.unit.create({ data: { code: `GI-${sfx}`, name: 'Un Import', cnpj: UCNPJ, timezone: 'America/Sao_Paulo', cutoffHour: 4 } })).id;
  gasSupId = (await prisma.supplier.create({ data: { name: 'Ultragaz', cnpj: SCNPJ, isGas: true, category: 'Gás' } })).id;
  nonGasSupId = (await prisma.supplier.create({ data: { name: 'Outros', cnpj: NGCNPJ, isGas: false } })).id;
  adminId = (await prisma.user.create({ data: { name: 'Adm', email: `${sfx}@ex.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
});
afterAll(async () => {
  await prisma.gasReceipt.deleteMany({ where: { unitId } }).catch(() => {});
  await prisma.unit.delete({ where: { id: unitId } }).catch(() => {});
  await prisma.supplier.deleteMany({ where: { id: { in: [gasSupId, nonGasSupId] } } }).catch(() => {});
  await prisma.user.delete({ where: { id: adminId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Import de gás — parsers', () => {
  it('parseDateCell: serial do Excel, DD/MM/AAAA e inválidas', () => {
    expect(parseDateCell(44575)).toBe('2022-01-14'); // serial ~ jan/2022
    expect(parseDateCell('15/01/2022')).toBe('2022-01-15');
    expect(parseDateCell('31/02/2022')).toBeNull();
    expect(parseDateCell('')).toBeNull();
  });
  it('parseDecimal: vírgula e ponto', () => {
    expect(parseDecimal('6,528')).toBeCloseTo(6.528, 5);
    expect(parseDecimal('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(parseDecimal(640)).toBe(640);
  });
});

describe('Import de gás — validação (dry-run)', () => {
  it('coluna obrigatória ausente → aborta nomeando a coluna', async () => {
    const bad = [{ [COLS.empresa]: 'X', [COLS.cnpj]: UCNPJ }]; // faltam várias
    const r = await validateGasImport(admin(), bad);
    expect(r.ok).toBe(false);
    if (!r.ok && 'missingColumns' in r) expect(r.missingColumns).toContain(COLS.numero);
  });

  it('linha válida = OK e resolve unidade/fornecedor + total', async () => {
    const r = await validateGasImport(admin(), [row()]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const x = r.rows[0];
      expect(x.status).toBe('OK');
      expect(x.resolved?.unitId).toBe(unitId);
      expect(x.resolved?.supplierId).toBe(gasSupId);
      expect(x.resolved?.operationalDate).toBe('2022-01-15');
      expect(x.resolved?.totalValue).toBeCloseTo(640 * 6.528, 2);
      expect(x.resolved?.noteNumber).toBe('6766');
    }
  });

  it('erros por linha: unidade/fornecedor/data futura/venc<emissão/qtd/preço/número/forma', async () => {
    const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10).split('-').reverse().join('/');
    const rows = [
      row({ [COLS.cnpj]: '99999999999999' }),                       // unidade não encontrada
      row({ [COLS.cnpjFornecedor]: '99999999999999' }),             // fornecedor não cadastrado
      row({ [COLS.emissao]: future }),                              // data futura
      row({ [COLS.vencimento]: '01/01/2020' }),                     // venc < emissão
      row({ [COLS.quantidade]: '0' }),                              // qtd <= 0
      row({ [COLS.preco]: '0' }),                                   // preço <= 0
      row({ [COLS.numero]: '' }),                                   // número vazio
      row({ [COLS.forma]: 'Balde' }),                               // forma inválida
    ];
    const r = await validateGasImport(admin(), rows);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows.every((x) => x.status === 'ERRO')).toBe(true);
      expect(r.summary.erros).toBe(8);
    }
  });

  it('duplicada dentro do arquivo → 2ª ocorrência é erro', async () => {
    const r = await validateGasImport(admin(), [row({ [COLS.numero]: 'DUP1' }), row({ [COLS.numero]: 'DUP1' })]);
    if (r.ok) { expect(r.rows[0].status).toBe('OK'); expect(r.rows[1].status).toBe('ERRO'); }
  });

  it('idempotência no banco → Duplicada', async () => {
    await prisma.gasReceipt.create({ data: { unitId, supplierId: gasSupId, operationalDate: '2022-01-15', noteNumber: 'EXISTE1', quantityKg: 1, totalValue: 1, pricePerKg: 1 } });
    const r = await validateGasImport(admin(), [row({ [COLS.numero]: 'EXISTE1' })]);
    if (r.ok) { expect(r.rows[0].status).toBe('DUPLICADA'); }
  });

  it('fornecedor não-gás → OK com aviso; botijão vira CYLINDER; linha vazia é ignorada', async () => {
    const r = await validateGasImport(admin(), [
      row({ [COLS.numero]: 'NG1', [COLS.cnpjFornecedor]: NGCNPJ }),
      row({ [COLS.numero]: 'BT1', [COLS.forma]: FORMA_BOTIJAO }),
      { [COLS.empresa]: '', [COLS.cnpj]: '', [COLS.numero]: '' }, // vazia → ignorada
    ]);
    if (r.ok) {
      const ng = r.rows.find((x) => x.preview.numero === 'NG1');
      expect(ng?.status).toBe('OK'); expect(ng?.aviso).toBeTruthy();
      const bt = r.rows.find((x) => x.preview.numero === 'BT1');
      expect(bt?.resolved?.kind).toBe('CYLINDER');
      expect(r.rows.length).toBe(2); // a vazia não entra
    }
  });
});

describe('Import de gás — gravação (commit)', () => {
  it('grava só as OK (importBatchId), ignora duplicada e erro', async () => {
    const rows = [
      row({ [COLS.numero]: 'C-100' }),
      row({ [COLS.numero]: 'C-101' }),
      row({ [COLS.numero]: 'EXISTE1' }), // já existe (do teste de idempotência) → Duplicada
      row({ [COLS.numero]: '' }),         // erro (número vazio)
    ];
    const r = await commitGasImport(admin(), rows);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.imported).toBe(2);
      expect(r.result.duplicadas).toBe(1);
      expect(r.result.erros).toBe(1);
      const saved = await prisma.gasReceipt.findMany({ where: { importBatchId: r.result.batchId }, select: { noteNumber: true } });
      expect(saved.map((s) => s.noteNumber).sort()).toEqual(['C-100', 'C-101']);
    }
  });

  it('reimportar as mesmas notas não duplica (idempotência)', async () => {
    const r = await commitGasImport(admin(), [row({ [COLS.numero]: 'C-100' })]);
    if (r.ok) expect(r.result.imported).toBe(0);
  });
});
