import 'dotenv/config';
import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { MODULES, effectivePermissions, canEditModule, viewableNavHrefs } from '@/lib/permissions';
import { acessoDasAbas, moduloDaOperacao, ABAS_MINHA_AREA } from '@/lib/permissions/manager-area';
import { canOpenPath } from '@/lib/permissions/route-guard';

/**
 * Permissão por SUBMENU — o pedido: fechar "Folgas / férias" para o Gerente
 * mantendo "Minhas tarefas" e "Bloco de notas".
 *
 * O risco desta funcionalidade não é a aba fechar; é o resto mudar junto.
 * Por isso metade dos casos aqui prova o que NÃO pode mudar: quem não mexer na
 * matriz continua exatamente como estava, e a sidebar e a guarda de rota não
 * sabem que submenu existe.
 */

const SUBS = ['MANAGER_AREA_TASKS', 'MANAGER_AREA_NOTES', 'MANAGER_AREA_LEAVES'];

async function limpar() {
  await prisma.rolePermission.deleteMany({ where: { module: { in: [...SUBS, 'MANAGER_AREA'] } } });
}

afterEach(async () => { await limpar(); });
afterAll(async () => { await limpar(); await prisma.$disconnect(); });

describe('A lista de módulos', () => {
  it('todo submenu vem DEPOIS do pai — é a ordem que o cálculo assume', () => {
    const vistos = new Set<string>();
    for (const m of MODULES) {
      if (m.parent) expect(vistos.has(m.parent), `${m.key} antes do pai ${m.parent}`).toBe(true);
      vistos.add(m.key);
    }
  });

  it('submenu não tem endereço próprio — a sidebar e a guarda de rota não mudam', async () => {
    for (const m of MODULES) if (m.parent) expect(m.nav).toBeUndefined();
    const hrefs = await viewableNavHrefs('MANAGER');
    expect(hrefs).toContain('/minha-area');
    expect(hrefs.filter((h) => h === '/minha-area')).toHaveLength(1);
  });

  it('todas as abas da Minha área existem como módulo', () => {
    for (const a of ABAS_MINHA_AREA) expect(MODULES.some((m) => m.key === a.modulo && m.parent === 'MANAGER_AREA')).toBe(true);
  });
});

describe('Sem ninguém mexer na matriz, nada muda', () => {
  it('o Gerente continua com as três abas abertas', async () => {
    const p = await effectivePermissions('MANAGER');
    for (const k of SUBS) expect(p[k], k).toEqual({ canView: true, canEdit: true });
  });

  it('ADMIN e CEO não podem ser trancados para fora', async () => {
    for (const role of ['ADMIN', 'CEO'] as const) {
      await prisma.rolePermission.create({ data: { role, module: 'MANAGER_AREA_LEAVES', canView: false, canEdit: false } });
      const p = await effectivePermissions(role);
      expect(p.MANAGER_AREA_LEAVES).toEqual({ canView: true, canEdit: true });
    }
  });

  it('o Caixa, que nasce fechado, não ganha aba nenhuma de brinde', async () => {
    const p = await effectivePermissions('CASHIER');
    expect(p.MANAGER_AREA.canView).toBe(false);
    for (const k of SUBS) expect(p[k].canView, k).toBe(false);
  });
});

describe('Fechando só a aba de folgas para o Gerente', () => {
  it('a aba fecha e as outras duas continuam abertas', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'MANAGER_AREA_LEAVES', canView: false, canEdit: false } });
    const p = await effectivePermissions('MANAGER');

    expect(p.MANAGER_AREA_LEAVES).toEqual({ canView: false, canEdit: false });
    expect(p.MANAGER_AREA_TASKS.canView).toBe(true);
    expect(p.MANAGER_AREA_NOTES.canView).toBe(true);
    /* O módulo em si continua aberto: o menu segue mostrando "Minha área". */
    expect(p.MANAGER_AREA.canView).toBe(true);
    expect(await canOpenPath('MANAGER', '/minha-area')).toBe(true);
  });

  it('a tela recebe exatamente isso', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'MANAGER_AREA_LEAVES', canView: false, canEdit: false } });
    const abas = acessoDasAbas(await effectivePermissions('MANAGER'));
    expect(abas.folgas.canView).toBe(false);
    expect(abas.tarefas.canView).toBe(true);
    expect(abas.notas.canView).toBe(true);
  });

  it('e o servidor recusa a gravação da aba fechada, não só o desenho', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'MANAGER_AREA_LEAVES', canView: false, canEdit: false } });
    expect(await canEditModule('MANAGER', 'MANAGER_AREA_LEAVES')).toBe(false);
    expect(await canEditModule('MANAGER', 'MANAGER_AREA_TASKS')).toBe(true);
  });

  it('ver sem editar: a aba aparece e a gravação é recusada', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'MANAGER_AREA_NOTES', canView: true, canEdit: false } });
    const p = await effectivePermissions('MANAGER');
    expect(p.MANAGER_AREA_NOTES).toEqual({ canView: true, canEdit: false });
    expect(await canEditModule('MANAGER', 'MANAGER_AREA_NOTES')).toBe(false);
  });
});

describe('O módulo é o teto do submenu', () => {
  it('fechando "Minha área", as três abas caem juntas', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'MANAGER_AREA', canView: false, canEdit: false } });
    const p = await effectivePermissions('MANAGER');
    for (const k of SUBS) expect(p[k], k).toEqual({ canView: false, canEdit: false });
  });

  it('mesmo com linha liberando o filho — senão a matriz se contradiria', async () => {
    await prisma.rolePermission.createMany({
      data: [
        { role: 'MANAGER', module: 'MANAGER_AREA', canView: false, canEdit: false },
        { role: 'MANAGER', module: 'MANAGER_AREA_TASKS', canView: true, canEdit: true },
      ],
    });
    const p = await effectivePermissions('MANAGER');
    expect(p.MANAGER_AREA_TASKS).toEqual({ canView: false, canEdit: false });
    expect(await canEditModule('MANAGER', 'MANAGER_AREA_TASKS')).toBe(false);
  });

  it('pai que só deixa ver não deixa o filho editar', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'MANAGER_AREA', canView: true, canEdit: false } });
    const p = await effectivePermissions('MANAGER');
    expect(p.MANAGER_AREA_TASKS).toEqual({ canView: true, canEdit: false });
  });
});

describe('Qual submenu manda em cada operação da rota', () => {
  it('cada entidade cai no seu', () => {
    expect(moduloDaOperacao('task', 'create')).toBe('MANAGER_AREA_TASKS');
    expect(moduloDaOperacao('note', 'add')).toBe('MANAGER_AREA_NOTES');
    expect(moduloDaOperacao('leave', 'add')).toBe('MANAGER_AREA_LEAVES');
  });

  it('o horário semanal segue a aba onde ele mora — senão sobra porta lateral', () => {
    expect(moduloDaOperacao('workSchedule', 'set')).toBe('MANAGER_AREA_LEAVES');
  });

  it('o Controle de gerentes fica de fora: tem guarda própria', () => {
    expect(moduloDaOperacao('workSchedule', 'setForUser')).toBeNull();
  });
});
