import 'dotenv/config';
import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { MODULES, effectivePermissions, canEditModule } from '@/lib/permissions';
import { ABAS, acessoDasAbas, abaInicial, abasVisiveis, podeAba } from '@/lib/permissions/abas';

/**
 * As ABAS de cada módulo como partes da matriz.
 *
 * O registro (`abas.ts`) é a única fonte: a matriz nasce dele, a tela esconde
 * por ele e a rota recusa por ele. Estes casos guardam essa unidade — e, do
 * outro lado, que ninguém perde acesso enquanto o Admin não mexer.
 */

const CHAVES = Object.values(ABAS).flat().map((a) => a.key);

afterEach(async () => { await prisma.rolePermission.deleteMany({ where: { module: { in: [...CHAVES, 'PAYMENTS', 'CASH', 'GAS'] } } }); });
afterAll(async () => { await prisma.$disconnect(); });

describe('O registro de abas e a matriz não podem divergir', () => {
  it('toda aba declarada virou linha da matriz, com o pai certo', () => {
    for (const [modulo, abas] of Object.entries(ABAS)) {
      for (const a of abas) {
        const m = MODULES.find((x) => x.key === a.key);
        expect(m, `${a.key} não está na matriz`).toBeDefined();
        expect(m!.parent, `${a.key} com pai errado`).toBe(modulo);
        expect(m!.nav, `${a.key} não deveria ter endereço próprio`).toBeUndefined();
      }
    }
  });

  it('o pai de toda aba existe e vem antes dela', () => {
    const pos = new Map(MODULES.map((m, i) => [m.key, i]));
    for (const [modulo, abas] of Object.entries(ABAS)) {
      expect(pos.has(modulo), `módulo ${modulo} não existe`).toBe(true);
      for (const a of abas) expect(pos.get(a.key)!).toBeGreaterThan(pos.get(modulo)!);
    }
  });

  it('não há chave repetida em todo o sistema', () => {
    const todas = MODULES.map((m) => m.key);
    expect(new Set(todas).size).toBe(todas.length);
  });

  it('dentro de um módulo, cada aba tem um id só', () => {
    for (const [modulo, abas] of Object.entries(ABAS)) {
      const ids = abas.map((a) => a.id);
      expect(new Set(ids).size, `ids repetidos em ${modulo}`).toBe(ids.length);
    }
  });

  it('as 15 telas de aba do pedido estão cobertas', () => {
    for (const m of ['PAYMENTS', 'NOTES', 'CASH', 'INVENTORY', 'MAINTENANCE', 'SUPERVISION', 'PRODUCTS',
      'CERTIFICATES', 'COMMUNICATION', 'TERMINATIONS', 'GAS', 'OIL', 'PEOPLE', 'SCHEDULE', 'OCCURRENCES']) {
      expect(ABAS[m]?.length, `${m} sem abas`).toBeGreaterThan(1);
    }
  });
});

describe('Sem ninguém mexer, nada muda', () => {
  it('o Gerente enxerga todas as abas de Pagamentos', async () => {
    const acesso = acessoDasAbas(await effectivePermissions('MANAGER'), 'PAYMENTS');
    for (const a of ABAS.PAYMENTS) expect(podeAba(acesso, a.id), a.id).toBe(true);
  });
});

describe('Fechando uma aba', () => {
  it('some só ela, e a tela abre na primeira que restou', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'PAYMENTS_TAB_NEW', canView: false, canEdit: false } });
    const acesso = acessoDasAbas(await effectivePermissions('MANAGER'), 'PAYMENTS');

    expect(podeAba(acesso, 'nova')).toBe(false);
    expect(podeAba(acesso, 'minhas')).toBe(true);
    expect(podeAba(acesso, 'pagar')).toBe(true);
    /* Abrir numa aba fechada mostraria a tela vazia e pareceria defeito. */
    expect(abaInicial(acesso, 'PAYMENTS', 'nova')).toBe('minhas');
    expect(abasVisiveis(acesso, 'PAYMENTS')).toHaveLength(4);
  });

  it('e o servidor recusa a gravação da aba fechada', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'CASH_TAB_VAULT', canView: false, canEdit: false } });
    expect(await canEditModule('MANAGER', 'CASH_TAB_VAULT')).toBe(false);
    expect(await canEditModule('MANAGER', 'CASH_TAB_HISTORY')).toBe(true);
  });

  it('fechar o módulo fecha as abas dele', async () => {
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'GAS', canView: false, canEdit: false } });
    const acesso = acessoDasAbas(await effectivePermissions('MANAGER'), 'GAS');
    for (const a of ABAS.GAS) expect(podeAba(acesso, a.id), a.id).toBe(false);
  });
});

describe('Aba de consulta não tem "Editar" separado', () => {
  it('painel e histórico acompanham o "Ver"', async () => {
    /* Um "Editar" que não muda nada seria uma caixa mentirosa na matriz. */
    for (const key of ['PAYMENTS_TAB_HISTORY', 'GAS_TAB_PANEL', 'OIL_TAB_HISTORY', 'SUPERVISION_TAB_PANEL']) {
      expect(MODULES.find((m) => m.key === key)?.soVer, key).toBe(true);
    }
    await prisma.rolePermission.create({ data: { role: 'MANAGER', module: 'PAYMENTS_TAB_HISTORY', canView: true, canEdit: false } });
    const p = await effectivePermissions('MANAGER');
    expect(p.PAYMENTS_TAB_HISTORY).toEqual({ canView: true, canEdit: true });
  });
});
