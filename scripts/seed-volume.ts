/**
 * Volume de dados FICTÍCIOS para auditoria visual (Onda 7).
 *
 * O seed padrão cobre a operação básica, mas deixa vazios justamente os módulos
 * com barra, gráfico e semáforo — óleo, gás, atestados, manutenção, desperdício,
 * comunicados. Sem dado, esses estados coloridos nunca renderizam, e os dois
 * auditores (contraste e sumiço) ficam sem o que medir.
 *
 * NÃO é dado de produção: nomes inventados, CID de exemplo, valores redondos.
 * Serve para exercitar a UI, não para conferir números.
 *
 * Uso: DATABASE_URL=... npx tsx scripts/seed-volume.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const dia = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const units = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const colabs = await prisma.collaborator.findMany({ take: 3 });
  if (!units.length) throw new Error('Rode o seed padrão antes (npm run db:seed).');

  // ---- Fornecedores (gás precisa de um com isGas) ----
  const forn = await prisma.supplier.upsert({
    where: { id: 'seed-forn-gas' },
    update: {},
    create: { id: 'seed-forn-gas', name: 'Gás Aliança (exemplo)', isGas: true, category: 'GAS' },
  });
  const coletora = await prisma.supplier.upsert({
    where: { id: 'seed-forn-oleo' },
    update: {},
    create: { id: 'seed-forn-oleo', name: 'Coleta Verde (exemplo)', category: 'OLEO' },
  });

  // ---- Óleo: 6 meses por unidade, para render a tendência e as barras ----
  let oleo = 0;
  for (const u of units) {
    for (let m = 0; m < 6; m++) {
      const litros = 60 + ((m * 17 + u.name.length * 5) % 90);
      const preco = 1.1 + ((m * 7) % 5) / 10;
      await prisma.oilCollection.create({
        data: {
          unitId: u.id, supplierId: coletora.id, operationalDate: dia(-m * 30 - 2),
          liters: litros, pricePerLiter: preco, totalValue: +(litros * preco).toFixed(2),
          paymentMethod: ['PIX', 'Dinheiro', 'Crédito em conta', 'Troca por produto'][m % 4],
          collectorName: 'Coleta Verde', createdById: admin?.id ?? null,
        },
      });
      oleo++;
    }
  }

  // ---- Gás: variação de preço para disparar o alerta de variação ----
  let gas = 0;
  for (const u of units) {
    for (let m = 0; m < 5; m++) {
      const kg = 90 + m * 10;
      // O último recebimento sobe ~25%: alimenta o badge de variação.
      const precoKg = m === 0 ? 8.9 : 7.1 + (m % 3) / 10;
      await prisma.gasReceipt.create({
        data: {
          unitId: u.id, supplierId: forn.id, operationalDate: dia(-m * 21 - 1),
          quantityKg: kg, pricePerKg: precoKg, totalValue: +(kg * precoKg).toFixed(2),
          dueDate: new Date(Date.now() + (m === 0 ? 3 : -10) * 86400000),
          createdById: admin?.id ?? null,
        },
      });
      gas++;
    }
  }

  // ---- Atestados: alimenta ranking, absenteísmo e tendência ----
  let atestados = 0;
  const CIDS: [string, string][] = [['J11', 'Influenza'], ['M54.5', 'Dor lombar'], ['K52.9', 'Gastroenterite']];
  for (const [i, c] of colabs.entries()) {
    for (let k = 0; k < 3; k++) {
      const ini = dia(-(k * 25 + i * 3 + 4));
      const [cid, desc] = CIDS[(i + k) % 3];
      await prisma.medicalCertificate.create({
        data: {
          unitId: units[i % units.length].id, collaboratorId: c.id,
          type: k === 2 ? 'HOURS' : 'FULL_DAY',
          startDate: ini, endDate: ini, days: k === 2 ? 0 : 1 + (k % 3),
          hours: k === 2 ? 2 : null,
          doctorName: 'Dr. Exemplo', doctorCrm: `CRM-${1000 + i}`,
          cid, cidDescription: desc, createdById: admin?.id ?? null,
        },
      });
      atestados++;
    }
  }

  // ---- Manutenção: um de cada status, incluindo ATRASADO (vermelho) ----
  let chamados = 0;
  const STATUS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED'] as const;
  for (const [i, u] of units.entries()) {
    for (const [k, st] of STATUS.entries()) {
      const ultimo = await prisma.maintenanceTicket.findFirst({ where: { unitId: u.id }, orderBy: { number: 'desc' } });
      await prisma.maintenanceTicket.create({
        data: {
          unitId: u.id, number: (ultimo?.number ?? 0) + 1,
          title: ['Coifa com ruído', 'Câmara fria não gela', 'Troca de lâmpadas', 'Vazamento na pia'][k],
          status: st,
          // O primeiro de cada unidade vence no passado → aparece como atrasado.
          deadline: new Date(Date.now() + (k === 0 ? -5 : 7) * 86400000),
          cost: st === 'DONE' ? 250 + i * 90 : null,
          openedById: admin?.id ?? null, openedByName: admin?.name ?? null,
          supplierName: 'Refrigeração Exemplo',
        },
      });
      chamados++;
    }
  }

  // ---- Desperdício: 10 dias por unidade, para as barras e o comparativo ----
  const cats = await prisma.wasteCategory.findMany({ take: 3 });
  let desperdicio = 0;
  if (cats.length) {
    for (const u of units) {
      for (let d = 1; d <= 10; d++) {
        // 1 lançamento por unidade/dia é regra do módulo — reaproveita se existir.
        const data = dia(-d);
        const e = await prisma.wasteEntry.upsert({
          where: { unitId_operationalDate: { unitId: u.id, operationalDate: data } },
          update: {},
          create: { unitId: u.id, operationalDate: data, createdById: admin?.id ?? null },
        });
        const jaTem = await prisma.wasteEntryItem.count({ where: { entryId: e.id } });
        if (jaTem === 0) {
          for (const [ci, c] of cats.entries()) {
            await prisma.wasteEntryItem.create({
              data: { entryId: e.id, categoryId: c.id, kg: +(1 + ((d * (ci + 2)) % 7) * 0.8).toFixed(2) },
            });
          }
        }
        desperdicio++;
      }
    }
  }

  // ---- Comunicados: as três prioridades ----
  let comunicados = 0;
  for (const [i, p] of (['NORMAL', 'IMPORTANT', 'URGENT'] as const).entries()) {
    const c = await prisma.communication.create({
      data: {
        authorId: admin?.id ?? null,
        title: ['Ajuste no horário de abertura', 'Nova regra de conferência', 'Falta de água amanhã'][i],
        body: 'Comunicado de exemplo para conferência visual do sistema de cores.',
        priority: p, pinned: i === 2, dueAt: new Date(Date.now() + (i === 2 ? -1 : 5) * 86400000),
      },
    });
    for (const u of units) await prisma.communicationUnit.create({ data: { communicationId: c.id, unitId: u.id } });
    comunicados++;
  }

  console.log(`✔ óleo ${oleo} · gás ${gas} · atestados ${atestados} · chamados ${chamados} · desperdício ${desperdicio} · comunicados ${comunicados}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
