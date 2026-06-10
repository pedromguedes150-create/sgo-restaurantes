import 'dotenv/config';
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Senha padrão de desenvolvimento (trocar em produção!)
const DEV_PASSWORD = 'Beijaflor@123';
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

async function main() {
  console.log('🌱 Seed SGO Beija Flor...');
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, ROUNDS);

  // --- 3 unidades (seed realista) ---
  const unitsData = [
    { code: 'CENTRO', name: 'Beija Flor Centro', cutoffHour: 4, address: 'Av. Central, 100' },
    { code: 'SHOPPING', name: 'Beija Flor Shopping', cutoffHour: 5, address: 'Shopping Plaza, L3' },
    { code: 'ORLA', name: 'Beija Flor Orla', cutoffHour: 4, address: 'Orla Mar, 2000' },
  ];

  const units = [];
  for (const u of unitsData) {
    const unit = await prisma.unit.upsert({
      where: { code: u.code },
      update: { name: u.name, cutoffHour: u.cutoffHour, address: u.address },
      create: u,
    });
    units.push(unit);
  }
  const [centro, shopping, orla] = units;
  console.log(`  ✔ ${units.length} unidades`);

  // --- Um usuário por perfil ---
  // unitCodes vazio = vê todas (CEO/ADMIN ignoram vínculo)
  const usersData: {
    name: string;
    email: string;
    role: Role;
    unitIds: string[];
  }[] = [
    { name: 'Diretoria Beija Flor', email: 'ceo@beijaflor.com.br', role: 'CEO', unitIds: [] },
    { name: 'Ana Administradora', email: 'admin@beijaflor.com.br', role: 'ADMIN', unitIds: [] },
    {
      name: 'Sérgio Supervisor',
      email: 'supervisor@beijaflor.com.br',
      role: 'SUPERVISOR',
      unitIds: [centro.id, shopping.id],
    },
    {
      name: 'Carla Coordenadora',
      email: 'coordenador@beijaflor.com.br',
      role: 'COORDINATOR',
      unitIds: [orla.id],
    },
    {
      // Gerente multi-unidade (vínculo múltiplo respeitado)
      name: 'Gabriel Gerente',
      email: 'gerente@beijaflor.com.br',
      role: 'MANAGER',
      unitIds: [centro.id, orla.id],
    },
    {
      name: 'Fernanda Financeiro',
      email: 'financeiro@beijaflor.com.br',
      role: 'FINANCE',
      unitIds: [],
    },
  ];

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, passwordHash, active: true },
      create: { name: u.name, email: u.email, role: u.role, passwordHash, active: true },
    });

    // Recria vínculos
    await prisma.unitMembership.deleteMany({ where: { userId: user.id } });
    if (u.unitIds.length) {
      await prisma.unitMembership.createMany({
        data: u.unitIds.map((unitId) => ({ userId: user.id, unitId })),
        skipDuplicates: true,
      });
    }
  }
  console.log(`  ✔ ${usersData.length} usuários (1 por perfil)`);

  await prisma.auditLog.create({
    data: { action: 'SEED', module: 'SYSTEM', metadata: { units: units.length, users: usersData.length } },
  });

  console.log('\n✅ Seed concluído. Login de teste:');
  console.log('   gerente@beijaflor.com.br / ' + DEV_PASSWORD);
  console.log('   admin@beijaflor.com.br   / ' + DEV_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
