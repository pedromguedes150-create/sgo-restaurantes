import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { canOpenPath, homeForRole } from '@/lib/permissions/route-guard';
import { prisma } from '@/lib/db/prisma';
import { afterAll } from 'vitest';

/**
 * A decisão de liberar depende da matriz no banco — por isso este teste é de
 * integração. Ele prova o que o pedido do Pedro exige: o Caixa entra para bipar
 * comandas e **mais nada**.
 */

afterAll(async () => { await prisma.$disconnect(); });

describe('Guarda de rota — o Caixa só alcança a conferência', () => {
  it('deixa o Caixa abrir Comandas e a Ajuda', async () => {
    expect(await canOpenPath('CASHIER', '/modulos/comandas/conferencia')).toBe(true);
    expect(await canOpenPath('CASHIER', '/modulos/comandas')).toBe(true);
    expect(await canOpenPath('CASHIER', '/ajuda')).toBe(true);
  });

  it('BLOQUEIA o Caixa nas telas com dado sensível', async () => {
    // CID é dado sensível de LGPD; CPF e PIX estão em Pessoas e Pagamentos
    expect(await canOpenPath('CASHIER', '/modulos/atestados')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/pessoas')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/pagamentos')).toBe(false);
  });

  it('BLOQUEIA o Caixa na visão da rede e nas configurações', async () => {
    expect(await canOpenPath('CASHIER', '/modulos/executivo')).toBe(false);
    expect(await canOpenPath('CASHIER', '/configuracoes')).toBe(false);
    expect(await canOpenPath('CASHIER', '/configuracoes/usuarios')).toBe(false);
    expect(await canOpenPath('CASHIER', '/auditoria')).toBe(false);
  });

  it('bloqueia também as telas internas, não só a raiz do módulo', async () => {
    expect(await canOpenPath('CASHIER', '/modulos/atestados/relatorio')).toBe(false);
    expect(await canOpenPath('CASHIER', '/modulos/pessoas/comissoes')).toBe(false);
  });

  it('manda o Caixa para a bipagem, nunca para uma porta fechada', async () => {
    const destino = await homeForRole('CASHIER');
    expect(destino).toBe('/modulos/comandas/conferencia');
    // e o destino tem de ser abrível pelo próprio perfil, senão vira laço
    expect(await canOpenPath('CASHIER', destino)).toBe(true);
  });

  it('não muda nada para Admin e CEO', async () => {
    for (const p of ['/modulos/executivo', '/configuracoes', '/auditoria', '/modulos/atestados']) {
      expect(await canOpenPath('ADMIN', p)).toBe(true);
      expect(await canOpenPath('CEO', p)).toBe(true);
    }
  });

  it('o Gerente segue com o acesso amplo de sempre', async () => {
    expect(await canOpenPath('MANAGER', '/modulos/comandas')).toBe(true);
    expect(await canOpenPath('MANAGER', '/modulos/desperdicios')).toBe(true);
    expect(await canOpenPath('MANAGER', '/tarefas')).toBe(true);
  });

  it('o destino de cada perfil é sempre uma tela que ele pode abrir', async () => {
    for (const role of ['MANAGER', 'SUPERVISOR', 'COORDINATOR', 'FINANCE', 'CASHIER'] as const) {
      const destino = await homeForRole(role);
      expect(await canOpenPath(role, destino), `${role} → ${destino}`).toBe(true);
    }
  });
});
