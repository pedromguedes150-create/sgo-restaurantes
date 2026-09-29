import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';

/**
 * SUSPENSÃO TEMPORÁRIA do sync automático do RH (v1.132.2): enquanto os
 * colaboradores inativados em 29/09/2026 não forem conferidos, nada roda
 * sozinho. O teste garante que o automático devolve SUSPENSO sem consultar o
 * RH nem gravar auditoria — e que o caminho manual continua existindo.
 */
const chamadasAoRh = vi.fn();
vi.mock('@/lib/rh/client', () => ({
  rhConfigured: () => true,
  rh: {
    colaboradoresDaUnidade: async () => { chamadasAoRh(); return { data: [] }; },
    colaboradores: async () => { chamadasAoRh(); return { data: [] }; },
    unidades: async () => { chamadasAoRh(); return { data: [] }; },
  },
}));

describe('sync automático do RH suspenso', () => {
  it('runDailyRhSync devolve SUSPENSO, não chama o RH e não grava RH_SYNC_AUTO', async () => {
    const { runDailyRhSync, RH_AUTO_SYNC_SUSPENSO, syncCollaboratorsForUnit } = await import('@/lib/rh/sync');
    expect(RH_AUTO_SYNC_SUSPENSO).toBe(true);
    const antes = new Date();
    const r = await runDailyRhSync();
    expect(r).toEqual({ ran: false, motivo: 'SUSPENSO' });
    expect(chamadasAoRh).not.toHaveBeenCalled();
    const auto = await prisma.auditLog.count({ where: { action: 'RH_SYNC_AUTO', createdAt: { gte: antes } } });
    expect(auto).toBe(0);
    // o caminho manual continua existindo (a suspensão é só do automático)
    expect(typeof syncCollaboratorsForUnit).toBe('function');
    await prisma.$disconnect();
  });
});
