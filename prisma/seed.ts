import 'dotenv/config';
import { PrismaClient, type Role, type TaskModule, type TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { subDays, addDays, format } from 'date-fns';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'Beijaflor@123';
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

// Helpers de data operacional (inline para o seed ser autossuficiente)
function opDateFor(now: Date, tz: string, cutoff: number): string {
  const z = toZonedTime(now, tz);
  const base = z.getHours() < cutoff ? subDays(z, 1) : z;
  return format(base, 'yyyy-MM-dd');
}
function dueAtFor(opDate: string, limit: string, tz: string, cutoff: number): Date {
  const [h, m] = limit.split(':').map(Number);
  const cal =
    h < cutoff ? format(addDays(new Date(`${opDate}T00:00:00`), 1), 'yyyy-MM-dd') : opDate;
  return fromZonedTime(
    `${cal}T${String(h).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}:00`,
    tz,
  );
}

// Modelos de tarefa padrão (Módulo 1 — pesos somam 100)
const TEMPLATES: {
  name: string;
  description?: string;
  limitTime: string;
  weight: number;
  module: TaskModule;
  requiresEvidence: boolean;
  order: number;
}[] = [
  { name: 'Lançamento de Perdas/Desperdícios', description: 'Pesar e registrar por categoria', limitTime: '23:00', weight: 25, module: 'WASTE', requiresEvidence: true, order: 1 },
  { name: 'Contagem de Comandas', description: 'Conferir comandas ausentes', limitTime: '23:30', weight: 20, module: 'COMMANDS', requiresEvidence: false, order: 2 },
  { name: 'Justificativa de Cancelamentos', description: 'Justificar cancelamentos do dia', limitTime: '14:00', weight: 15, module: 'CANCELLATIONS', requiresEvidence: false, order: 3 },
  { name: 'Registro de Ocorrências', description: 'Registrar ocorrências do turno', limitTime: '23:59', weight: 10, module: 'OCCURRENCES', requiresEvidence: false, order: 4 },
  { name: 'Abertura do salão (POP)', description: 'Checklist de abertura', limitTime: '10:00', weight: 15, module: 'GENERAL', requiresEvidence: false, order: 5 },
  { name: 'Conferência de temperaturas', description: 'Câmaras frias e banho-maria', limitTime: '09:00', weight: 15, module: 'GENERAL', requiresEvidence: true, order: 6 },
];

async function main() {
  console.log('🌱 Seed SGO Beija Flor...');
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, ROUNDS);

  // --- 3 unidades ---
  const unitsData = [
    { code: 'CENTRO', name: 'Beija Flor Centro', cutoffHour: 4, address: 'Av. Central, 100' },
    { code: 'SHOPPING', name: 'Beija Flor Shopping', cutoffHour: 5, address: 'Shopping Plaza, L3' },
    { code: 'ORLA', name: 'Beija Flor Orla', cutoffHour: 4, address: 'Orla Mar, 2000' },
  ];
  const units = [];
  for (const u of unitsData) {
    units.push(
      await prisma.unit.upsert({
        where: { code: u.code },
        update: { name: u.name, cutoffHour: u.cutoffHour, address: u.address },
        create: u,
      }),
    );
  }
  const [centro, shopping, orla] = units;
  console.log(`  ✔ ${units.length} unidades`);

  // --- Usuários (1 por perfil) ---
  const usersData: { name: string; email: string; role: Role; unitIds: string[] }[] = [
    { name: 'Diretoria Beija Flor', email: 'ceo@beijaflor.com.br', role: 'CEO', unitIds: [] },
    { name: 'Ana Administradora', email: 'admin@beijaflor.com.br', role: 'ADMIN', unitIds: [] },
    { name: 'Sérgio Supervisor', email: 'supervisor@beijaflor.com.br', role: 'SUPERVISOR', unitIds: [centro.id, shopping.id] },
    { name: 'Carla Coordenadora', email: 'coordenador@beijaflor.com.br', role: 'COORDINATOR', unitIds: [orla.id] },
    { name: 'Gabriel Gerente', email: 'gerente@beijaflor.com.br', role: 'MANAGER', unitIds: [centro.id, orla.id] },
    { name: 'Fernanda Financeiro', email: 'financeiro@beijaflor.com.br', role: 'FINANCE', unitIds: [] },
  ];
  const userByEmail: Record<string, string> = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, active: true },
      create: { name: u.name, email: u.email, role: u.role, passwordHash, active: true },
    });
    userByEmail[u.email] = user.id;
    await prisma.unitMembership.deleteMany({ where: { userId: user.id } });
    if (u.unitIds.length) {
      await prisma.unitMembership.createMany({
        data: u.unitIds.map((unitId) => ({ userId: user.id, unitId })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`  ✔ ${usersData.length} usuários (1 por perfil)`);

  // --- Tarefas: reset + templates por unidade ---
  await prisma.taskInstance.deleteMany({});
  await prisma.taskTemplate.deleteMany({});

  // Quem "concluiu" no histórico (atribuição plausível por unidade)
  const completerByUnit: Record<string, string> = {
    [centro.id]: userByEmail['gerente@beijaflor.com.br'],
    [orla.id]: userByEmail['gerente@beijaflor.com.br'],
    [shopping.id]: userByEmail['supervisor@beijaflor.com.br'],
  };

  const now = new Date();
  let templateCount = 0;
  let instanceCount = 0;

  for (const unit of units) {
    const templates = [];
    for (const t of TEMPLATES) {
      templates.push(
        await prisma.taskTemplate.create({
          data: { ...t, unitId: unit.id },
        }),
      );
      templateCount++;
    }

    const todayOp = opDateFor(now, unit.timezone, unit.cutoffHour);

    // 30 dias de histórico (hoje = índice 0)
    const rows: {
      templateId: string;
      unitId: string;
      operationalDate: string;
      dueAt: Date;
      status: TaskStatus;
      completedById: string | null;
      completedAt: Date | null;
      evidencePath: string | null;
    }[] = [];

    for (let d = 0; d < 30; d++) {
      const opDate = format(subDays(new Date(`${todayOp}T12:00:00`), d), 'yyyy-MM-dd');
      for (const tpl of templates) {
        const dueAt = dueAtFor(opDate, tpl.limitTime ?? '23:59', unit.timezone, unit.cutoffHour);
        let status: TaskStatus = 'PENDING';
        let completedById: string | null = null;
        let completedAt: Date | null = null;
        let evidencePath: string | null = null;

        if (d > 0) {
          // dias passados: maioria concluída, algumas não realizadas
          const done = Math.random() < 0.85;
          status = done ? 'DONE' : 'MISSED';
          if (done) {
            completedById = completerByUnit[unit.id] ?? null;
            completedAt = new Date(dueAt.getTime() - 30 * 60 * 1000); // 30min antes do limite
            if (tpl.requiresEvidence) evidencePath = `uploads/${unit.id}/seed-${tpl.id}.jpg`;
          }
        } else {
          // hoje: deixa pendente, mas conclui as 2 primeiras p/ dar vida ao dashboard
          if (tpl.order <= 2) {
            status = 'DONE';
            completedById = completerByUnit[unit.id] ?? null;
            completedAt = new Date();
            if (tpl.requiresEvidence) evidencePath = `uploads/${unit.id}/seed-${tpl.id}.jpg`;
          }
        }

        rows.push({
          templateId: tpl.id,
          unitId: unit.id,
          operationalDate: opDate,
          dueAt,
          status,
          completedById,
          completedAt,
          evidencePath,
        });
      }
    }

    const created = await prisma.taskInstance.createMany({ data: rows, skipDuplicates: true });
    instanceCount += created.count;
  }
  console.log(`  ✔ ${templateCount} modelos de tarefa · ${instanceCount} instâncias (30 dias)`);

  // --- Desperdícios: categorias + histórico ---
  await prisma.wasteEntry.deleteMany({});
  await prisma.wasteCategory.deleteMany({});
  const catData = [
    { code: 'SELF', name: 'Self-Service', order: 1, base: 12 },
    { code: 'CLIENT', name: 'Clientes', order: 2, base: 6 },
    { code: 'SNACK', name: 'Lanchonete', order: 3, base: 3 },
    { code: 'KITCHEN', name: 'Cozinha', order: 4, base: 8 },
  ];
  const cats = [];
  for (const c of catData) {
    cats.push(await prisma.wasteCategory.create({ data: { code: c.code, name: c.name, order: c.order } }));
  }

  let wasteCount = 0;
  for (const unit of units) {
    const todayOp = opDateFor(now, unit.timezone, unit.cutoffHour);
    // histórico: dias 1..29 (deixa HOJE sem lançamento p/ o gerente registrar)
    for (let d = 1; d < 30; d++) {
      const opDate = format(subDays(new Date(`${todayOp}T12:00:00`), d), 'yyyy-MM-dd');
      const entry = await prisma.wasteEntry.create({
        data: {
          unitId: unit.id,
          operationalDate: opDate,
          createdById: completerByUnit[unit.id] ?? null,
          evidencePath: `uploads/${unit.id}/seed-waste.jpg`,
          items: {
            create: cats.map((c, idx) => {
              const base = catData[idx].base;
              const kg = Math.round((base * (0.6 + Math.random() * 0.8)) * 1000) / 1000;
              return { categoryId: c.id, kg };
            }),
          },
        },
      });
      void entry;
      wasteCount++;
    }
  }
  console.log(`  ✔ ${cats.length} categorias de desperdício · ${wasteCount} lançamentos (histórico)`);

  // --- Ocorrências: tipos/categorias + exemplos ---
  await prisma.occurrence.deleteMany({});
  await prisma.occurrenceCategory.deleteMany({});
  await prisma.occurrenceType.deleteMany({});
  const TYPES = [
    { code: 'CLIENTE', name: 'Reclamação de Cliente', cats: ['Atendimento', 'Qualidade', 'Tempo de espera', 'Higiene', 'Preço', 'Outros'] },
    { code: 'COLABORADOR', name: 'Incidente com Colaborador', cats: ['Acidente de trabalho', 'Conflito', 'Descumprimento de norma', 'Outros'] },
    { code: 'EQUIPAMENTO', name: 'Problema de Equipamento', cats: ['Câmara fria', 'Fogão-forno', 'Sistema de caixa', 'Outros'] },
    { code: 'SEGURANCA', name: 'Segurança / Fraude', cats: ['Furto de cliente', 'Desvio interno', 'Comanda sumida', 'Outros'] },
    { code: 'OPERACIONAL', name: 'Irregularidade Operacional', cats: ['Descumprimento de POP', 'Produto fora do padrão', 'Falta de insumo', 'Outros'] },
    { code: 'EMERGENCIA', name: 'Acidente / Emergência', cats: ['Incêndio', 'Acidente com cliente', 'Outros'] },
  ];
  const catLookup: Record<string, { id: string; name: string; typeId: string; typeName: string }> = {};
  for (const [ti, t] of TYPES.entries()) {
    const type = await prisma.occurrenceType.create({ data: { code: t.code, name: t.name, order: ti + 1 } });
    for (const [ci, name] of t.cats.entries()) {
      const cat = await prisma.occurrenceCategory.create({ data: { typeId: type.id, name, order: ci + 1 } });
      catLookup[`${t.code}|${name}`] = { id: cat.id, name, typeId: type.id, typeName: type.name };
    }
  }

  let occCount = 0;
  for (const unit of units) {
    const reporter = completerByUnit[unit.id] ?? null;
    const supervisor = userByEmail['supervisor@beijaflor.com.br'];
    const samples = [
      { key: 'CLIENTE|Atendimento', gravity: 'MEDIUM' as const, status: 'OPEN' as const, daysAgo: 5, desc: 'Cliente reclamou da demora no atendimento.' },
      { key: 'EQUIPAMENTO|Câmara fria', gravity: 'HIGH' as const, status: 'IN_PROGRESS' as const, daysAgo: 3, desc: 'Câmara fria oscilando temperatura.' },
      { key: 'CLIENTE|Atendimento', gravity: 'MEDIUM' as const, status: 'OPEN' as const, daysAgo: 1, desc: 'Nova reclamação de atendimento (reincidência).' },
      { key: 'SEGURANCA|Furto de cliente', gravity: 'CRITICAL' as const, status: 'CLOSED' as const, daysAgo: 10, desc: 'Suspeita de furto registrada por câmeras.' },
    ];
    let n = 0;
    for (const s of samples) {
      n++;
      const cat = catLookup[s.key];
      const occurredAt = subDays(now, s.daysAgo);
      const opDate = opDateFor(occurredAt, unit.timezone, unit.cutoffHour);
      const isRecurrence = s.key === 'CLIENTE|Atendimento' && n > 1; // a 3ª é reincidência
      await prisma.occurrence.create({
        data: {
          unitId: unit.id,
          number: n,
          occurredAt,
          operationalDate: opDate,
          reportedById: reporter,
          typeId: cat.typeId,
          categoryId: cat.id,
          typeName: cat.typeName,
          categoryName: cat.name,
          gravity: s.gravity,
          description: s.desc,
          status: s.status,
          isRecurrence,
          ...(s.status === 'CLOSED'
            ? {
                closedById: supervisor,
                closedAt: subDays(now, s.daysAgo - 2),
                closureJustification: 'Apurado com a equipe e câmeras.',
                correctiveAction: 'Reforço de treinamento e monitoramento.',
                reviewDate: addDays(now, 20),
              }
            : {}),
        },
      });
      occCount++;
    }
  }
  console.log(`  ✔ ${TYPES.length} tipos de ocorrência · ${occCount} ocorrências de exemplo`);

  // --- Comandas: configuração de sequência + divergências de exemplo ---
  await prisma.commandReplacement.deleteMany({});
  await prisma.commandDivergence.deleteMany({});
  await prisma.commandCount.deleteMany({});
  await prisma.unitCommandConfig.deleteMany({});
  for (const unit of units) {
    await prisma.unitCommandConfig.create({ data: { unitId: unit.id, rangeStart: 1, rangeEnd: 150 } });
  }
  // Centro: 1 divergência aberta (37) e 1 baixa definitiva (88, perdida)
  await prisma.commandDivergence.create({
    data: { unitId: centro.id, number: 37, status: 'OPEN', observation: 'Não localizada no fechamento.', createdById: completerByUnit[centro.id] },
  });
  await prisma.commandDivergence.create({
    data: {
      unitId: centro.id, number: 88, status: 'CLOSED', outcome: 'LOST',
      observation: 'Extraviada; baixa definitiva.', createdById: completerByUnit[centro.id],
      resolvedById: userByEmail['supervisor@beijaflor.com.br'], resolvedAt: subDays(now, 2),
    },
  });
  console.log('  ✔ comandas: sequência 1–150 por unidade + 2 divergências (Centro)');

  // --- Cancelamento de cupons: motivos + exemplos ---
  await prisma.cancellation.deleteMany({});
  await prisma.cancellationImport.deleteMany({});
  await prisma.cancellationReason.deleteMany({});
  const reasonNames = ['Erro do operador', 'Solicitação do cliente', 'Problema técnico', 'Outros'];
  const reasons = [];
  for (const [i, name] of reasonNames.entries()) {
    reasons.push(await prisma.cancellationReason.create({ data: { name, order: i + 1 } }));
  }
  const todayOpCentro = opDateFor(now, centro.timezone, centro.cutoffHour);
  const imp = await prisma.cancellationImport.create({
    data: { unitId: centro.id, operationalDate: todayOpCentro, fileName: 'teknisa_seed.csv', rowCount: 5, importedById: userByEmail['admin@beijaflor.com.br'] },
  });
  const cancRows = [
    { coupon: '100245', operator: 'Caixa 01', value: 47.9, justified: false },
    { coupon: '100247', operator: 'Caixa 02', value: 12.5, justified: false },
    { coupon: '100251', operator: 'Caixa 01', value: 89.0, justified: false },
    { coupon: '100260', operator: 'Caixa 03', value: 25.0, justified: true },
    { coupon: '100262', operator: 'Caixa 01', value: 8.9, justified: true },
  ];
  for (const c of cancRows) {
    await prisma.cancellation.create({
      data: {
        unitId: centro.id, operationalDate: todayOpCentro, importId: imp.id,
        couponNumber: c.coupon, cashOperator: c.operator, value: c.value,
        status: c.justified ? 'JUSTIFIED' : 'PENDING',
        ...(c.justified ? { reasonId: reasons[0].id, justificationNote: 'Erro de digitação', justifiedById: completerByUnit[centro.id], justifiedAt: now } : {}),
      },
    });
  }
  console.log(`  ✔ ${reasons.length} motivos de cancelamento + 5 cancelamentos (Centro)`);

  // --- Pagamentos: freelancers, tipos avulsos, delegação e solicitações ---
  await prisma.paymentRequest.deleteMany({});
  await prisma.approvalDelegation.deleteMany({});
  await prisma.freelancerUnit.deleteMany({});
  await prisma.freelancer.deleteMany({});
  await prisma.miscPaymentType.deleteMany({});

  const fl1 = await prisma.freelancer.create({ data: { name: 'João Garçom (freela)', defaultValue: 150, units: { create: [{ unitId: centro.id }, { unitId: orla.id }] } } });
  const fl2 = await prisma.freelancer.create({ data: { name: 'Maria Cozinha (freela)', defaultValue: 180, units: { create: [{ unitId: centro.id }] } } });
  const mt1 = await prisma.miscPaymentType.create({ data: { name: 'Reembolso de despesa', approverRole: 'SUPERVISOR', order: 1 } });
  const mt2 = await prisma.miscPaymentType.create({ data: { name: 'Adiantamento', approverRole: 'ADMIN', order: 2 } });

  // Delegação: supervisor delega aprovação à coordenadora por 15 dias
  await prisma.approvalDelegation.create({
    data: {
      fromUserId: userByEmail['supervisor@beijaflor.com.br'],
      toUserId: userByEmail['coordenador@beijaflor.com.br'],
      startsAt: subDays(now, 2),
      endsAt: addDays(now, 13),
      createdById: userByEmail['admin@beijaflor.com.br'],
    },
  });

  // Solicitações de exemplo
  await prisma.paymentRequest.create({
    data: { type: 'FREELANCER', unitId: centro.id, requestedById: completerByUnit[centro.id], approverRole: 'SUPERVISOR', amount: 150, freelancerId: fl1.id, workDate: subDays(now, 1), shift: 'noite', hours: 8, status: 'PENDING' },
  });
  await prisma.paymentRequest.create({
    data: { type: 'OVERTIME', unitId: centro.id, requestedById: completerByUnit[centro.id], approverRole: 'SUPERVISOR', amount: 95.5, collaboratorName: 'Carlos Auxiliar', workDate: subDays(now, 3), hours: 3, reason: 'Fechamento de inventário', status: 'APPROVED', approvedById: userByEmail['supervisor@beijaflor.com.br'], approvedAt: subDays(now, 2) },
  });
  await prisma.paymentRequest.create({
    data: { type: 'MISC', unitId: orla.id, requestedById: completerByUnit[orla.id], approverRole: 'ADMIN', amount: 60, miscTypeId: mt2.id, beneficiary: 'Fornecedor X', description: 'Adiantamento combustível', status: 'PAID', approvedById: userByEmail['admin@beijaflor.com.br'], approvedAt: subDays(now, 4), paidById: userByEmail['financeiro@beijaflor.com.br'], paidAt: subDays(now, 3) },
  });
  void fl2; void mt1;
  console.log('  ✔ pagamentos: 2 freelancers, 2 tipos avulsos, 1 delegação, 3 solicitações');

  // --- Notas recebidas ---
  await prisma.receivedNote.deleteMany({});
  await prisma.receivedNote.createMany({
    data: [
      { unitId: centro.id, source: 'QRCODE', accessKey: '35240312345678000199550010000001231000000000', supplierName: 'Distribuidora Bebidas LTDA', supplierCnpj: '12.345.678/0001-99', number: '123', totalValue: 1840.5, status: 'RECEIVED', createdById: completerByUnit[centro.id] },
      { unitId: centro.id, source: 'MANUAL', supplierName: 'Hortifruti Central', totalValue: 620.0, status: 'PAID', createdById: completerByUnit[centro.id] },
      { unitId: orla.id, source: 'PHOTO', supplierName: 'Gás e Cia', totalValue: 410.0, status: 'PROBLEM', problemNote: 'Valor divergente do pedido', createdById: completerByUnit[orla.id] },
    ],
  });
  console.log('  ✔ notas: 3 notas de exemplo');

  // --- Inventário ---
  await prisma.inventorySchedule.deleteMany({});
  await prisma.inventorySchedule.createMany({
    data: [
      { unitId: centro.id, categoryName: 'Bebidas', scheduledDate: todayOpCentro, responsibleId: completerByUnit[centro.id], status: 'PENDING' },
      { unitId: centro.id, categoryName: 'Carnes', scheduledDate: format(subDays(new Date(`${todayOpCentro}T12:00:00`), 7), 'yyyy-MM-dd'), responsibleId: completerByUnit[centro.id], status: 'DONE', confirmedById: completerByUnit[centro.id], confirmedAt: subDays(now, 7) },
      { unitId: orla.id, categoryName: 'Descartáveis', scheduledDate: opDateFor(now, orla.timezone, orla.cutoffHour), responsibleId: completerByUnit[orla.id], status: 'PENDING' },
    ],
  });
  console.log('  ✔ inventário: 3 agendamentos');

  // --- Pessoas: colaboradores, férias, escala ---
  await prisma.scheduleEntry.deleteMany({});
  await prisma.vacation.deleteMany({});
  await prisma.collaboratorUnit.deleteMany({});
  await prisma.collaborator.deleteMany({});
  const collabData = [
    { name: 'Pedro Atendente', jobTitle: 'Garçom', unitIds: [centro.id] },
    { name: 'Lucia Caixa', jobTitle: 'Operadora de Caixa', unitIds: [centro.id, orla.id] },
    { name: 'Rafael Cozinheiro', jobTitle: 'Cozinheiro', unitIds: [orla.id] },
  ];
  const collabs = [];
  for (const c of collabData) {
    collabs.push(await prisma.collaborator.create({ data: { name: c.name, jobTitle: c.jobTitle, source: 'RH', units: { create: c.unitIds.map((unitId) => ({ unitId })) } } }));
  }
  await prisma.vacation.create({ data: { collaboratorId: collabs[0].id, unitId: centro.id, startDate: addDays(now, 10), endDate: addDays(now, 25), status: 'CONFIRMED' } });
  await prisma.vacation.create({ data: { collaboratorId: collabs[1].id, unitId: centro.id, startDate: addDays(now, 30), endDate: addDays(now, 44), status: 'CONFIRMED' } });
  await prisma.scheduleEntry.createMany({
    data: [
      { collaboratorId: collabs[0].id, unitId: centro.id, date: now, planned: '18:00-23:00', variation: 'NONE' },
      { collaboratorId: collabs[1].id, unitId: centro.id, date: now, planned: '11:00-15:00', variation: 'LATE', variationNote: 'Chegou 20min atrasada' },
      { collaboratorId: collabs[2].id, unitId: orla.id, date: now, planned: '17:00-23:00', variation: 'NONE' },
    ],
  });
  console.log(`  ✔ pessoas: ${collabs.length} colaboradores, 2 férias, 3 entradas de escala`);

  // --- POPs ---
  await prisma.pop.deleteMany({});
  await prisma.pop.create({
    data: {
      title: 'Abertura do Salão', category: 'Setor', sector: 'Salão', status: 'PUBLISHED', version: 1,
      content: [
        { type: 'text', text: 'Conferir limpeza, montar mesas, ligar equipamentos e checar temperaturas.' },
        { type: 'checklist', items: ['Mesas montadas', 'Piso limpo', 'Equipamentos ligados'] },
        { type: 'video', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
      ],
      units: { create: [{ unitId: centro.id }, { unitId: orla.id }, { unitId: shopping.id }] },
    },
  });
  await prisma.pop.create({
    data: {
      title: 'Higienização do Balcão (Lanchonete)', category: 'Setor', sector: 'Lanchonete', status: 'PUBLISHED', version: 1,
      content: [{ type: 'text', text: 'Higienizar o balcão a cada troca de turno com produto adequado.' }],
      units: { create: [{ unitId: centro.id }] },
    },
  });
  console.log('  ✔ pops: 2 POPs publicados');

  // --- Mapa de Funções: setores + alocações (Centro) ---
  await prisma.workforceAllocation.deleteMany({});
  await prisma.sector.deleteMany({});
  const secSalao = await prisma.sector.create({ data: { unitId: centro.id, name: 'Salão', minHeadcount: 2, order: 1 } });
  const secCozinha = await prisma.sector.create({ data: { unitId: centro.id, name: 'Cozinha', minHeadcount: 2, order: 2 } });
  const secCaixa = await prisma.sector.create({ data: { unitId: centro.id, name: 'Caixa', minHeadcount: 1, order: 3 } });
  // collabs[0]=Pedro(Centro), collabs[1]=Lucia(Centro+Orla)
  await prisma.workforceAllocation.createMany({
    data: [
      { unitId: centro.id, sectorId: secSalao.id, shift: 'Noite 18-23', collaboratorId: collabs[0].id, source: 'MANUAL' },
      { unitId: centro.id, sectorId: secCaixa.id, shift: 'Noite 18-23', collaboratorId: collabs[1].id, source: 'MANUAL' },
      // Cozinha noite fica sem cobertura (demonstra 🔴)
    ],
  });
  console.log('  ✔ mapa de funções: 3 setores + 2 alocações (Centro)');

  await prisma.auditLog.create({
    data: {
      action: 'SEED',
      module: 'SYSTEM',
      metadata: { units: units.length, users: usersData.length, templates: templateCount, instances: instanceCount },
    },
  });

  console.log('\n✅ Seed concluído. Login de teste (senha: ' + DEV_PASSWORD + '):');
  console.log('   gerente@beijaflor.com.br    (Gerente — Centro + Orla)');
  console.log('   admin@beijaflor.com.br      (Administrador — vê tudo)');
  console.log('   ceo@beijaflor.com.br        (CEO — consolidado)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
