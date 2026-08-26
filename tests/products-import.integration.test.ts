import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db/prisma';
import { importProductsXlsx, exportProductsBuffer } from '@/lib/products';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Import do catálogo de ponta a ponta: planilha → banco.
 *
 * O teste do parser garante a leitura; este garante o que vai para o banco —
 * inclusive que reimportar a mesma lista ATUALIZA em vez de duplicar, que é o
 * que acontece quando o fornecedor manda a lista revisada.
 */

const sfx = `pr${process.pid.toString(36)}`;
let admId: string;
const adm = (): SessionUser => ({ id: admId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const ger = (): SessionUser => ({ id: admId, name: 'G', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

/** Monta um .xlsx igual ao que o fornecedor manda. */
function planilha(linhas: string[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plan1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

const NOMES = [`CERVEJA TESTE ${sfx} 600ML`, `ENERGETICO TESTE ${sfx} 473ML`];
const BARRAS = [`789${sfx.replace(/\D/g, '') || '1'}0001`, `078${sfx.replace(/\D/g, '') || '1'}0002`];

const BEBIDAS = [
  ['BEBIDAS', 'QUANT', 'UN', 'COD. BARRAS'],
  [NOMES[0], '24', 'UN', BARRAS[0]],
  [NOMES[1], '6', 'UN', BARRAS[1]],
];

beforeAll(async () => {
  admId = (await prisma.user.create({ data: { name: 'A', email: `${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x' } })).id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { name: { in: NOMES } } }).catch(() => {});
  await prisma.product.deleteMany({ where: { barcode: { in: BARRAS } } }).catch(() => {});
  await prisma.user.delete({ where: { id: admId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('Import da lista do fornecedor', () => {
  it('gerente não importa catálogo', async () => {
    const r = await importProductsXlsx(ger(), planilha(BEBIDAS));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('FORBIDDEN');
  });

  it('cria os produtos com categoria do cabeçalho, embalagem e código de barras', async () => {
    const r = await importProductsXlsx(adm(), planilha(BEBIDAS), 'CD');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(2);
    expect(r.updated).toBe(0);
    expect(r.categoryFromHeader).toBe('BEBIDAS');
    expect(r.hadOriginColumn).toBe(false);

    const p = await prisma.product.findFirst({ where: { name: NOMES[0] } });
    expect(p!.category).toBe('BEBIDAS');
    expect(p!.packSize).toBe(24);
    expect(p!.barcode).toBe(BARRAS[0]);
    /* Sem coluna de origem, valeu a escolha de quem importou. */
    expect(p!.origin).toBe('CD');
  });

  it('reimportar a MESMA lista atualiza, não duplica', async () => {
    /* O fornecedor manda a lista revisada toda semana. Duplicar dobraria o
       catálogo e o gerente veria cada bebida duas vezes ao pedir. */
    const r = await importProductsXlsx(adm(), planilha(BEBIDAS), 'CD');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(0);
    expect(r.updated).toBe(2);
    expect(await prisma.product.count({ where: { name: { in: NOMES } } })).toBe(2);
  });

  it('produto RENOMEADO com o mesmo código de barras não vira cadastro novo', async () => {
    /* "600ML" → "600 ML" é a mudança mais comum entre uma lista e a seguinte.
       Se a chave fosse o nome, cada revisão criaria produtos repetidos. */
    const renomeado = NOMES[0].replace('600ML', '600 ML');
    const r = await importProductsXlsx(adm(), planilha([
      ['BEBIDAS', 'QUANT', 'UN', 'COD. BARRAS'],
      [renomeado, '24', 'UN', BARRAS[0]],
    ]), 'CD');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(0);
    expect(r.updated).toBe(1);

    const doCodigo = await prisma.product.findMany({ where: { barcode: BARRAS[0] } });
    expect(doCodigo).toHaveLength(1);
    expect(doCodigo[0].name).toBe(renomeado);
    /* Volta ao nome original para os outros testes não dependerem da ordem. */
    await prisma.product.update({ where: { id: doCodigo[0].id }, data: { name: NOMES[0] } });
  });

  it('planilha sem nenhum produto é recusada, com motivo', async () => {
    /* "Importado: 0 criados" faria a pessoa tentar de novo com o mesmo arquivo. */
    const r = await importProductsXlsx(adm(), planilha([['Relatório de estoque'], ['', '']]), 'CD');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('EMPTY');
  });

  it('arquivo que não é planilha é recusado', async () => {
    const r = await importProductsXlsx(adm(), Buffer.from('isto não é um xlsx'));
    expect(r.ok).toBe(false);
  });
});

describe('Exportar serve de MODELO para importar', () => {
  it('o ciclho exportar → importar fecha: as colunas são as mesmas', () => {
    const buf = exportProductsBuffer([
      { name: 'COCA 2L', origin: 'CD', category: 'BEBIDAS', measure: 'un', packSize: 6, barcode: '070847033301', active: true },
    ]);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as string[][];

    expect(linhas[0]).toEqual(['Nome', 'Origem', 'Categoria', 'Medida', 'Quant', 'Cod. Barras', 'Ativo']);
    expect(linhas[1][0]).toBe('COCA 2L');
    expect(linhas[1][4]).toBe('6');
    /* O código sai como TEXTO — como número, o Excel comeria o zero. */
    expect(linhas[1][5]).toBe('070847033301');
  });

  it('catálogo vazio exporta só o cabeçalho — é a planilha modelo', () => {
    const wb = XLSX.read(exportProductsBuffer([]), { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as string[][];
    expect(linhas[0]).toEqual(['Nome', 'Origem', 'Categoria', 'Medida', 'Quant', 'Cod. Barras', 'Ativo']);
  });
});
