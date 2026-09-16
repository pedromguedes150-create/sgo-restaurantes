import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { effectivePermissions, permissoesDoPerfil, setRolePermission } from '@/lib/permissions';
import {
  alternarPerfil,
  basesPossiveis,
  criarPerfil,
  definirPermissaoDoPerfil,
  excluirPerfil,
  listarPerfis,
  perfisAtivos,
  renomearPerfil,
  trocarBaseDoPerfil,
} from '@/lib/perfis';
import { createUser, updateUser } from '@/lib/admin';
import type { SessionUser } from '@/lib/auth/session';

const sfx = process.pid.toString(36);
let actorId: string;
let perfilId: string;

const admin = (): SessionUser => ({ id: actorId, name: 'A', role: 'ADMIN', unitIds: [], seesAllUnits: true, needsTerms: false });
const gerente = (): SessionUser => ({ id: 'x', name: 'G', role: 'MANAGER', unitIds: [], seesAllUnits: false, needsTerms: false });

beforeAll(async () => {
  actorId = (await prisma.user.create({ data: { name: `Ator ${sfx}`, email: `gp-${sfx}@e.com`, role: 'ADMIN', passwordHash: 'x', active: false } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `-${sfx}@e.com` } } });
  await prisma.profile.deleteMany({ where: { name: { contains: sfx } } });
});

describe('criação de perfil', () => {
  it('só o Administrador cria', async () => {
    expect(await criarPerfil(gerente(), { name: `X ${sfx}`, baseRole: 'MANAGER' })).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('cria com perfil base e aparece na lista', async () => {
    const r = await criarPerfil(admin(), { name: `Supervisor Regional ${sfx}`, baseRole: 'SUPERVISOR' });
    expect(r.ok).toBe(true);
    if (r.ok) perfilId = r.id!;
    const p = (await listarPerfis()).find((x) => x.id === perfilId);
    expect(p).toMatchObject({ baseRole: 'SUPERVISOR', active: true, usuarios: 0 });
  });

  it('ADMIN e CEO não servem de base — teriam acesso total e a matriz não se aplicaria', async () => {
    for (const base of ['ADMIN', 'CEO'] as const) {
      const r = await criarPerfil(admin(), { name: `Tentativa ${base} ${sfx}`, baseRole: base });
      expect(r.ok, `base ${base}`).toBe(false);
    }
    expect(basesPossiveis().map((b) => b.value)).not.toContain('ADMIN');
    expect(basesPossiveis().map((b) => b.value)).not.toContain('CEO');
  });

  it('recusa nome repetido', async () => {
    const r = await criarPerfil(admin(), { name: `Supervisor Regional ${sfx}`, baseRole: 'MANAGER' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('CONFLICT');
  });

  it('renomeia', async () => {
    expect(await renomearPerfil(admin(), { id: perfilId, name: `Regional ${sfx}` })).toEqual({ ok: true });
  });
});

describe('o perfil herda do base e sobrepõe só o que muda', () => {
  it('sem ajuste nenhum, enxerga exatamente o que o perfil base enxerga', async () => {
    const base = await effectivePermissions('SUPERVISOR');
    const perfil = await permissoesDoPerfil(perfilId);
    expect(perfil!.WASTE).toEqual(base.WASTE);
    expect(perfil!.SUPERVISION).toEqual(base.SUPERVISION);
  });

  it('fechar uma tela no perfil NÃO mexe no perfil base', async () => {
    expect(await definirPermissaoDoPerfil(admin(), { profileId: perfilId, module: 'WASTE', canView: false, canEdit: false })).toEqual({ ok: true });
    const perfil = await permissoesDoPerfil(perfilId);
    const base = await effectivePermissions('SUPERVISOR');
    expect(perfil!.WASTE.canView).toBe(false);
    expect(base.WASTE.canView).toBe(true);
  });

  it('restringir o perfil BASE alcança quem herda dele', async () => {
    await setRolePermission(admin(), { role: 'SUPERVISOR', module: 'OIL', canView: false, canEdit: false });
    const perfil = await permissoesDoPerfil(perfilId);
    expect(perfil!.OIL.canView).toBe(false);
    await prisma.rolePermission.deleteMany({ where: { role: 'SUPERVISOR', module: 'OIL' } });
  });

  it('o perfil pode REABRIR o que o base fechou', async () => {
    await setRolePermission(admin(), { role: 'SUPERVISOR', module: 'OIL', canView: false, canEdit: false });
    await definirPermissaoDoPerfil(admin(), { profileId: perfilId, module: 'OIL', canView: true, canEdit: true });
    const perfil = await permissoesDoPerfil(perfilId);
    expect(perfil!.OIL).toEqual({ canView: true, canEdit: true });
    await prisma.rolePermission.deleteMany({ where: { role: 'SUPERVISOR', module: 'OIL' } });
    await prisma.profilePermission.deleteMany({ where: { profileId: perfilId, module: 'OIL' } });
  });

  it('sem "Ver" não há "Editar", como na matriz dos perfis de sistema', async () => {
    await definirPermissaoDoPerfil(admin(), { profileId: perfilId, module: 'NOTES', canView: false, canEdit: true });
    const perfil = await permissoesDoPerfil(perfilId);
    expect(perfil!.NOTES).toEqual({ canView: false, canEdit: false });
  });

  it('fechar o módulo fecha as partes de dentro', async () => {
    await definirPermissaoDoPerfil(admin(), { profileId: perfilId, module: 'PEOPLE', canView: false, canEdit: false });
    const perfil = await permissoesDoPerfil(perfilId);
    expect(perfil!.PEOPLE.canView).toBe(false);
    expect(perfil!.PEOPLE_MAP.canView).toBe(false); // parte de dentro cai junto
  });

  it('módulo inexistente é recusado', async () => {
    const r = await definirPermissaoDoPerfil(admin(), { profileId: perfilId, module: 'NAO_EXISTE', canView: true, canEdit: true });
    expect(r).toEqual({ ok: false, reason: 'INVALID' });
  });
});

describe('usuário vinculado ao perfil', () => {
  let usuarioId: string;

  it('nasce com o `role` do perfil base — é o que faz as regras de negócio o enxergarem', async () => {
    const r = await createUser(admin(), { name: 'U', email: `u1-${sfx}@e.com`, profileId: perfilId, password: 'senha123' });
    expect(r.ok).toBe(true);
    usuarioId = r.ok ? r.id! : '';
    const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { role: true, profileId: true } });
    expect(u).toEqual({ role: 'SUPERVISOR', profileId: perfilId });
  });

  it('aparece na contagem do perfil', async () => {
    const p = (await listarPerfis()).find((x) => x.id === perfilId);
    expect(p!.usuarios).toBe(1);
  });

  it('trocar o perfil base REESCREVE o role de quem usa o perfil', async () => {
    expect(await trocarBaseDoPerfil(admin(), { id: perfilId, baseRole: 'COORDINATOR' })).toEqual({ ok: true });
    const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { role: true } });
    expect(u!.role).toBe('COORDINATOR');
    await trocarBaseDoPerfil(admin(), { id: perfilId, baseRole: 'SUPERVISOR' });
  });

  it('voltar o usuário a um perfil de sistema limpa o vínculo', async () => {
    expect(await updateUser(admin(), usuarioId, { role: 'MANAGER' })).toEqual({ ok: true });
    const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { role: true, profileId: true } });
    expect(u).toEqual({ role: 'MANAGER', profileId: null });
  });

  it('editar só o nome NÃO mexe no perfil', async () => {
    await updateUser(admin(), usuarioId, { profileId: perfilId });
    expect(await updateUser(admin(), usuarioId, { name: 'Outro nome' })).toEqual({ ok: true });
    const u = await prisma.user.findUnique({ where: { id: usuarioId }, select: { profileId: true } });
    expect(u!.profileId).toBe(perfilId);
  });

  it('perfil DESATIVADO some do cadastro e não pode mais ser escolhido', async () => {
    expect(await alternarPerfil(admin(), { id: perfilId, active: false })).toEqual({ ok: true });
    expect((await perfisAtivos()).map((p) => p.id)).not.toContain(perfilId);
    const r = await createUser(admin(), { name: 'U2', email: `u2-${sfx}@e.com`, profileId: perfilId, password: 'senha123' });
    expect(r.ok).toBe(false);
    await alternarPerfil(admin(), { id: perfilId, active: true });
  });

  it('perfil COM usuário não se exclui', async () => {
    const r = await excluirPerfil(admin(), perfilId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('BLOCKED');
  });

  it('sem usuários, exclui — e leva os ajustes de matriz junto', async () => {
    const novo = await criarPerfil(admin(), { name: `Descartável ${sfx}`, baseRole: 'MANAGER' });
    expect(novo.ok).toBe(true);
    const id = novo.ok ? novo.id! : '';
    await definirPermissaoDoPerfil(admin(), { profileId: id, module: 'WASTE', canView: false, canEdit: false });
    expect(await excluirPerfil(admin(), id)).toEqual({ ok: true });
    expect(await prisma.profilePermission.count({ where: { profileId: id } })).toBe(0);
  });
});
