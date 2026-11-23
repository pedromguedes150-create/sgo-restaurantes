import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { diaDoFreelancerAceito, diasDeHoje, podeLancarFreelancerEmOutroDia } from '@/lib/payments/dia-do-freelancer';

/** v1.221.0 — o freelancer é lançado só no dia do trabalho (pedido do Daniel, 23/11/2026). */
describe('freelancer só no dia', () => {
  it('só o GERENTE é travado (v1.221.1); os demais escolhem o dia', () => {
    expect(podeLancarFreelancerEmOutroDia('MANAGER')).toBe(false);
    for (const r of ['ADMIN', 'COORDINATOR', 'SUPERVISOR', 'CEO', 'FINANCE']) expect(podeLancarFreelancerEmOutroDia(r)).toBe(true);
  });
  it('gerente: hoje vale; ontem, anteontem e amanhã não', () => {
    expect(diaDoFreelancerAceito('MANAGER', '2026-11-23', '2026-11-23', '2026-11-23')).toBe(true);
    expect(diaDoFreelancerAceito('MANAGER', '2026-11-22', '2026-11-23', '2026-11-23')).toBe(false);
    expect(diaDoFreelancerAceito('MANAGER', '2026-11-24', '2026-11-23', '2026-11-23')).toBe(false);
    expect(diaDoFreelancerAceito('SUPERVISOR', '2026-11-10', '2026-11-23', '2026-11-23')).toBe(true);
    expect(diaDoFreelancerAceito('ADMIN', '2026-12-05', '2026-11-23', '2026-11-23')).toBe(true); // dia futuro
    expect(diaDoFreelancerAceito('ADMIN', '2026-11-10', '2026-11-23', '2026-11-23')).toBe(true);
  });
  it('de madrugada valem os dois: o dia civil e o operacional (turno que virou a noite)', () => {
    expect(diasDeHoje('2026-11-24', '2026-11-23')).toEqual(['2026-11-24', '2026-11-23']);
    expect(diasDeHoje('2026-11-23', '2026-11-23')).toEqual(['2026-11-23']);
    expect(diaDoFreelancerAceito('MANAGER', '2026-11-23', '2026-11-24', '2026-11-23')).toBe(true);
    expect(diaDoFreelancerAceito('MANAGER', '2026-11-24', '2026-11-24', '2026-11-23')).toBe(true);
    expect(diaDoFreelancerAceito('MANAGER', '2026-11-22', '2026-11-24', '2026-11-23')).toBe(false);
  });
  it('fonte: o servidor aplica a regra e a tela não oferece o calendário ao Gerente', () => {
    const create = readFileSync('src/lib/payments/create.ts', 'utf8');
    expect(create).toContain('diaDoFreelancerAceito(user.role');
    const tela = readFileSync('src/components/payments/payments-client.tsx', 'utf8');
    expect(tela).toContain('dia-do-trabalho-fixo');
    expect(tela).toContain('diaLivre={diaDoFreelancerLivre}');
    expect(readFileSync('src/app/(app)/modulos/pagamentos/page.tsx', 'utf8')).toContain('podeLancarFreelancerEmOutroDia(user.role)');
  });
});
