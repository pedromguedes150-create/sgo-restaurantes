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
        const dueAt = dueAtFor(opDate, tpl.limitTime, unit.timezone, unit.cutoffHour);
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
