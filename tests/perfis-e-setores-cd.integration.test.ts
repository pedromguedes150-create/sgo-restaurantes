import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role as RoleValues } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { ALL_ROLES, isFullAccess, setRolePermission, effectivePermissions } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/roles';
import { createUser, updateUser, toggleUser, deleteUser } from '@/lib/admin';
import {
  alternarSetorDoCd,
  criarSetorDoCd,
  excluirSetorDoCd,
  listarSetoresDoCd,
  renomearSetorDoCd,
  setoresAtivosDoCd,
} from '@/lib/products/setores';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O bug que este arquivo existe para não deixar voltar: `ALL_ROLES` era escrito
 * à mão e ficou com sete perfis enquanto o enum tinha oito. O Separador do CD
 * sumia da tela de Perfis e o servidor recusava configurá-lo — sem nada acusar.
 */
describe('a lista de perfis acompanha o enum', () => {
  it('ALL_ROLES tem TODOS os perfis do enum, sem faltar nenhum', () => {
    expect([...ALL_ROLES].sort()).toEqual(Object.values(RoleValues).sort());
  });

  it('o Separador do CD está entre eles', () => {
    expect(ALL_ROLES).toContain('SEPARATOR');
  });

  it('todo perfil do enum tem rótulo em português', () => {
    for (const r of Object.values(RoleValues)) {
      expect(ROLE_LABELS[r], `perfil ${r} sem rótulo`).toBeTruthy();
    }
  });

  it('só ADMIN e CEO têm acesso total', () => {
    expect(ALL_ROLES.filter(isFullAccess).sort()).toEqual(['ADMIN', 'CEO']);
  });
});

const sfx = process.pid.toString(36);
let actorId: string;
let alvoAdminId: string;
let setorId: string;
let setorEmUsoId: string;
let setorVazioId: string;

const admin = (): SessionUser => ({ id: actorId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: 'x', name: 'G', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  /* O ator fica INATIVO de propósito: a trava do último admin conta admins
     ativos no banco, e um ator ativo mascararia o cenário que quero testar. */
  actorId = (await prisma.user.create({ data: { name: `Ator ${sfx}`, email: `pa-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x', active: false } })).id;
  alvoAdminId = (await prisma.user.create({ data: { name: `Alvo ${sfx}`, email: `pb-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x', active: true } })).id;
  setorId = (await prisma.cdSector.create({ data: { name: `Secos ${sfx}` } })).id;
  setorVazioId = (await prisma.cdSector.create({ data: { name: `Vazio ${sfx}` } })).id;

  /* Setor com separador PRÓPRIO, que nenhum outro caso mexe. Os testes de
     cadastro movem o separador de `setorId` para outro perfil, e apoiar as
     travas de "em uso" naquele setor deixaria um teste dependendo da ordem
     do outro. */
  setorEmUsoId = (await prisma.cdSector.create({ data: { name: `Em uso ${sfx}` } })).id;
  await prisma.user.create({
    data: { name: `Separador fixo ${sfx}`, email: `fixo-${sfx}@e.com`, role: 'SEPARATOR', passwordHash: 'x', cdSectorId: setorEmUsoId },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `-${sfx}@e.com` } } });
  await prisma.cdSector.deleteMany({ where: { name: { contains: sfx } } });
});

describe('o Separador do CD pode ser configurado na matriz', () => {
  it('setRolePermission aceita SEPARATOR — antes devolvia "inválido"', async () => {
    const r = await setRolePermission(admin(), { role: 'SEPARATOR', module: 'PRODUCTS', canView: true, canEdit: false });
    expect(r).toEqual({ ok: true });
    const perms = await effectivePermissions('SEPARATOR');
    expect(perms.PRODUCTS).toEqual({ canView: true, canEdit: false });
    await prisma.rolePermission.deleteMany({ where: { role: 'SEPARATOR', module: 'PRODUCTS' } });
  });

  it('nasce fechado: sem linha cadastrada só enxerga a separação e a ajuda', async () => {
    const perms = await effectivePermissions('SEPARATOR');
    expect(perms.PRODUCT_SEPARATION.canView).toBe(true);
    expect(perms.HELP.canView).toBe(true);
    expect(perms.WASTE.canView).toBe(false);
    expect(perms.DASHBOARD.canView).toBe(false);
  });

  it('ADMIN e CEO continuam intrancáveis', async () => {
    const r = await setRolePermission(admin(), { role: 'ADMIN', module: 'WASTE', canView: false, canEdit: false });
    expect(r).toEqual({ ok: false, reason: 'INVALID' });
  });
});

describe('setor do CD no cadastro de usuário', () => {
  it('Separador SEM setor é recusado — a fila dele abriria vazia', async () => {
    const r = await createUser(admin(), { name: 'S', email: `sep1-${sfx}@e.com`, role: 'SEPARATOR', password: 'senha123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('INVALID');
  });

  it('Separador com setor válido é criado e fica vinculado', async () => {
    const r = await createUser(admin(), { name: 'S', email: `sep2-${sfx}@e.com`, role: 'SEPARATOR', password: 'senha123', cdSectorId: setorId });
    expect(r.ok).toBe(true);
    const u = await prisma.user.findUnique({ where: { email: `sep2-${sfx}@e.com` }, select: { cdSectorId: true } });
    expect(u?.cdSectorId).toBe(setorId);
  });

  it('setor desativado não serve', async () => {
    await prisma.cdSector.update({ where: { id: setorVazioId }, data: { active: false } });
    const r = await createUser(admin(), { name: 'S', email: `sep3-${sfx}@e.com`, role: 'SEPARATOR', password: 'senha123', cdSectorId: setorVazioId });
    expect(r.ok).toBe(false);
    await prisma.cdSector.update({ where: { id: setorVazioId }, data: { active: true } });
  });

  it('perfil que não é Separador sai com setor nulo, mesmo se mandarem um', async () => {
    const r = await createUser(admin(), { name: 'G', email: `ger-${sfx}@e.com`, role: 'MANAGER', password: 'senha123', cdSectorId: setorId });
    expect(r.ok).toBe(true);
    const u = await prisma.user.findUnique({ where: { email: `ger-${sfx}@e.com` }, select: { cdSectorId: true } });
    expect(u?.cdSectorId).toBeNull();
  });

  it('deixar de ser Separador LIMPA o setor', async () => {
    const id = (await prisma.user.findUnique({ where: { email: `sep2-${sfx}@e.com` }, select: { id: true } }))!.id;
    expect(await updateUser(admin(), id, { role: 'MANAGER' })).toEqual({ ok: true });
    const u = await prisma.user.findUnique({ where: { id }, select: { cdSectorId: true } });
    expect(u?.cdSectorId).toBeNull();
  });

  it('virar Separador sem informar setor é recusado', async () => {
    const id = (await prisma.user.findUnique({ where: { email: `ger-${sfx}@e.com` }, select: { id: true } }))!.id;
    const r = await updateUser(admin(), id, { role: 'SEPARATOR' });
    expect(r.ok).toBe(false);
  });

  it('perfil inexistente é recusado', async () => {
    const r = await createUser(admin(), { name: 'X', email: `inv-${sfx}@e.com`, role: 'CHEFE' as never, password: 'senha123' });
    expect(r).toEqual({ ok: false, reason: 'INVALID' });
  });
});

describe('o último Administrador ativo é protegido', () => {
  /** Deixa `alvoAdminId` como único admin ativo, roda o caso e devolve tudo. */
  async function comoUnicoAdmin(caso: () => Promise<void>) {
    const outros = await prisma.user.findMany({ where: { role: 'ADMIN', active: true, id: { not: alvoAdminId } }, select: { id: true } });
    const ids = outros.map((o) => o.id);
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    try {
      await caso();
    } finally {
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { active: true } });
    }
  }

  it('não pode ser desativado', async () => {
    await comoUnicoAdmin(async () => {
      const r = await toggleUser(admin(), alvoAdminId, false);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('BLOCKED');
    });
  });

  it('não pode ser rebaixado de perfil', async () => {
    await comoUnicoAdmin(async () => {
      const r = await updateUser(admin(), alvoAdminId, { role: 'MANAGER' });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('BLOCKED');
    });
  });

  it('não pode ser excluído', async () => {
    await comoUnicoAdmin(async () => {
      const r = await deleteUser(admin(), alvoAdminId);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('BLOCKED');
    });
  });

  it('havendo outro admin ativo, desativar é permitido', async () => {
    const r = await toggleUser(admin(), alvoAdminId, false);
    expect(r).toEqual({ ok: true });
    await toggleUser(admin(), alvoAdminId, true); // devolve ao estado anterior
  });
});

describe('setores do CD', () => {
  it('só a linha de Configurações gerencia', async () => {
    expect(await criarSetorDoCd(gerente(), `Proibido ${sfx}`)).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('cria, lista e renomeia', async () => {
    const nome = `Bebidas ${sfx}`;
    const r = await criarSetorDoCd(admin(), nome);
    expect(r.ok).toBe(true);
    const criado = (await listarSetoresDoCd()).find((s) => s.name === nome);
    expect(criado).toBeTruthy();
    expect(await renomearSetorDoCd(admin(), { id: criado!.id, name: `Bebidas geladas ${sfx}` })).toEqual({ ok: true });
  });

  it('recusa nome repetido', async () => {
    const r = await criarSetorDoCd(admin(), `Secos ${sfx}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CONFLICT');
  });

  it('setor EM USO não se exclui — desativa', async () => {
    const r = await excluirSetorDoCd(admin(), setorEmUsoId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('BLOCKED');
  });

  it('desativar setor com separador vinculado é barrado — ele ficaria sem fila', async () => {
    const r = await alternarSetorDoCd(admin(), { id: setorEmUsoId, active: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('BLOCKED');
  });

  it('setor sem uso pode ser excluído', async () => {
    const novo = await criarSetorDoCd(admin(), `Descartável ${sfx}`);
    expect(novo.ok).toBe(true);
    if (novo.ok) expect(await excluirSetorDoCd(admin(), novo.id!)).toEqual({ ok: true });
  });

  it('o seletor do cadastro de usuário só oferece setor ATIVO', async () => {
    await prisma.cdSector.update({ where: { id: setorVazioId }, data: { active: false } });
    const ativos = await setoresAtivosDoCd();
    expect(ativos.map((s) => s.id)).not.toContain(setorVazioId);
    await prisma.cdSector.update({ where: { id: setorVazioId }, data: { active: true } });
  });
});
