/**
 * DIAGNÓSTICO: por que uma unidade não aparece em "Contratos vigentes — % cumprido".
 *
 * READ-ONLY: só lê o banco, não altera nada. Rode NO DROPLET, onde está o banco
 * de produção. Casa a unidade por PEDAÇO DO NOME (case-insensitive) e mostra,
 * por ID, os recebimentos e os contratos — e diz exatamente por que a unidade
 * cai (ou não) no painel: contrato ausente, vencido ou inativado.
 *
 *   node scripts/diagnostico-gas-unidade.mjs "nova uniao"
 *   node scripts/diagnostico-gas-unidade.mjs "lins & guedes"
 *
 * Dentro do container:
 *   docker exec -it sgo_app node scripts/diagnostico-gas-unidade.mjs "nova uniao"
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const termo = (process.argv[2] || '').trim();
const hoje = new Date().toISOString().slice(0, 10);

function norm(s) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function main() {
  if (!termo) {
    console.log('Uso: node scripts/diagnostico-gas-unidade.mjs "<pedaço do nome da unidade>"');
    process.exit(1);
  }
  const alvo = norm(termo);
  const todas = await prisma.unit.findMany({ select: { id: true, name: true, active: true } });
  const unidades = todas.filter((u) => norm(u.name).includes(alvo));

  if (unidades.length === 0) {
    console.log(`Nenhuma unidade cujo nome contenha "${termo}".`);
    console.log('Unidades cadastradas:');
    for (const u of todas) console.log(`  - ${u.name}  [${u.id}]${u.active ? '' : '  (inativa)'}`);
    return;
  }

  console.log(`Hoje (UTC): ${hoje}`);
  console.log(`${unidades.length} unidade(s) casando "${termo}":\n`);

  for (const u of unidades) {
    console.log('='.repeat(70));
    console.log(`UNIDADE: ${u.name}`);
    console.log(`  id=${u.id}  ativa=${u.active}`);

    const [recAgg, recentes, contratosRaw] = await Promise.all([
      prisma.gasReceipt.aggregate({ where: { unitId: u.id }, _sum: { quantityKg: true }, _count: { _all: true }, _max: { operationalDate: true }, _min: { operationalDate: true } }),
      prisma.gasReceipt.findMany({ where: { unitId: u.id }, orderBy: { operationalDate: 'desc' }, take: 5, select: { operationalDate: true, quantityKg: true, supplierId: true, supplier: { select: { name: true } } } }),
      // GasContract NÃO tem relação `supplier` (o vínculo é por supplierId, sem FK dura como o resto do módulo) — nome vem à parte.
      prisma.gasContract.findMany({ where: { unitId: u.id }, orderBy: { endDate: 'desc' }, select: { id: true, active: true, startDate: true, endDate: true, supplierId: true, quantityKg: true } }),
    ]);
    const supIds = [...new Set(contratosRaw.map((c) => c.supplierId))];
    const sups = supIds.length ? await prisma.supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, name: true } }) : [];
    const supBy = new Map(sups.map((s) => [s.id, s.name]));
    const contratos = contratosRaw.map((c) => ({ ...c, supplier: { name: supBy.get(c.supplierId) ?? null } }));

    console.log(`\n  RECEBIMENTOS: ${recAgg._count._all} nota(s), ${Number(recAgg._sum.quantityKg ?? 0).toLocaleString('pt-BR')} kg`);
    console.log(`    período dos recebimentos: ${recAgg._min.operationalDate ?? '—'} → ${recAgg._max.operationalDate ?? '—'}`);
    for (const r of recentes) {
      console.log(`    · ${r.operationalDate}  ${Number(r.quantityKg).toLocaleString('pt-BR')} kg  fornecedor=${r.supplier?.name ?? 'SEM FORNECEDOR'} [${r.supplierId ?? '—'}]`);
    }

    console.log(`\n  CONTRATOS: ${contratos.length}`);
    if (contratos.length === 0) {
      console.log('    NENHUM contrato cadastrado para esta unidade → motivo: SEM_CONTRATO.');
    }
    let temVigente = false;
    for (const c of contratos) {
      const vencido = c.endDate < hoje;
      const vigente = c.active && !vencido;
      if (vigente) temVigente = true;
      const situacao = vigente ? 'VIGENTE (aparece em % cumprido)' : !c.active ? 'INATIVO' : 'VENCIDO';
      console.log(`    · ${c.startDate} → ${c.endDate}  ativo=${c.active}  ${situacao}`);
      console.log(`        fornecedor do contrato=${c.supplier?.name ?? '—'} [${c.supplierId}]  qtd=${Number(c.quantityKg).toLocaleString('pt-BR')} kg  id=${c.id}`);
    }

    console.log('\n  VEREDITO:');
    if (temVigente) {
      console.log('    ✓ Há contrato vigente — a unidade DEVE aparecer em "% cumprido".');
      console.log('    Se ainda não aparece, confira o ESCOPO do usuário (a unidade precisa estar no alcance dele).');
    } else if (contratos.length === 0) {
      console.log('    ✗ Sem contrato: crie um contrato vigente para a unidade (Contratos → novo).');
    } else {
      const latest = contratos[0];
      if (latest.endDate < hoje) console.log(`    ✗ O contrato mais recente VENCEU em ${latest.endDate}. Renove (novo contrato ou estender o período).`);
      else console.log('    ✗ O contrato está dentro do período mas INATIVO. Reative-o na aba Contratos.');
    }

    // Fornecedor: as notas batem com o fornecedor do contrato mais recente?
    if (contratos.length > 0) {
      const supContrato = contratos[0].supplierId;
      const forn = new Map();
      for (const r of recentes) forn.set(r.supplierId ?? '—', (forn.get(r.supplierId ?? '—') ?? 0) + 1);
      const outros = [...forn.keys()].filter((s) => s !== supContrato);
      if (outros.length > 0) {
        console.log(`    ⚠ Atenção: há recebimentos com fornecedor DIFERENTE do contrato mais recente [${supContrato}].`);
        console.log('      Mesmo com contrato vigente, essas notas cairiam em "NÃO entraram neste contrato".');
      }
    }
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
