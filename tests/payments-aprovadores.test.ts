import { describe, it, expect } from 'vitest';
import { papeisQueAprovam, aprovaCom, podePagarPorPerfil, filtrarPorTipo, FILTROS_DE_TIPO, PERFIS_QUE_PAGAM } from '@/lib/payments/aprovadores';
import type { Role } from '@prisma/client';

/**
 * Quem aprova e quem paga (v1.133.0) — regra PURA da central de Pagamentos.
 * O Coordenador entrou na operação sem reescrever o `approverRole` gravado.
 */
describe('papeisQueAprovam', () => {
  it('Freelancer e Hora Extra do Supervisor: Supervisor E Coordenador aprovam', () => {
    expect(papeisQueAprovam({ type: 'FREELANCER', approverRole: 'SUPERVISOR' })).toEqual(['SUPERVISOR', 'COORDINATOR']);
    expect(papeisQueAprovam({ type: 'OVERTIME', approverRole: 'SUPERVISOR' })).toEqual(['SUPERVISOR', 'COORDINATOR']);
  });
  it('Avulso segue exatamente o aprovador do tipo cadastrado', () => {
    expect(papeisQueAprovam({ type: 'MISC', approverRole: 'SUPERVISOR' })).toEqual(['SUPERVISOR']);
    expect(papeisQueAprovam({ type: 'MISC', approverRole: 'ADMIN' })).toEqual(['ADMIN']);
    expect(papeisQueAprovam({ type: 'MISC', approverRole: 'MANAGER' })).toEqual(['MANAGER']);
  });
  it('Freelancer/HE com aprovador diferente de Supervisor (delegação/legado) não ganha o Coordenador de brinde', () => {
    expect(papeisQueAprovam({ type: 'FREELANCER', approverRole: 'ADMIN' })).toEqual(['ADMIN']);
  });
});

describe('aprovaCom', () => {
  const set = (...r: Role[]) => new Set<Role>(r);
  it('confere os papéis carregados (inclusive por delegação) contra a regra', () => {
    expect(aprovaCom(set('COORDINATOR'), { type: 'FREELANCER', approverRole: 'SUPERVISOR' })).toBe(true);
    expect(aprovaCom(set('SUPERVISOR'), { type: 'OVERTIME', approverRole: 'SUPERVISOR' })).toBe(true);
    expect(aprovaCom(set('MANAGER'), { type: 'FREELANCER', approverRole: 'SUPERVISOR' })).toBe(false);
    expect(aprovaCom(set('COORDINATOR'), { type: 'MISC', approverRole: 'ADMIN' })).toBe(false);
    expect(aprovaCom(set('MANAGER', 'SUPERVISOR'), { type: 'MISC', approverRole: 'SUPERVISOR' })).toBe(true); // delegação
  });
});

describe('quem paga', () => {
  it('Coordenador, Financeiro, Admin e CEO; Gerente e Supervisor não', () => {
    expect(PERFIS_QUE_PAGAM).toEqual(['COORDINATOR', 'FINANCE', 'ADMIN', 'CEO']);
    expect(podePagarPorPerfil('COORDINATOR')).toBe(true);
    expect(podePagarPorPerfil('FINANCE')).toBe(true);
    expect(podePagarPorPerfil('MANAGER')).toBe(false);
    expect(podePagarPorPerfil('SUPERVISOR')).toBe(false);
  });
});

describe('filtro Tipo de pagamento', () => {
  const itens = [{ id: 1, type: 'FREELANCER' as const }, { id: 2, type: 'OVERTIME' as const }, { id: 3, type: 'MISC' as const }];
  it('Todos mostra Freelancer + Hora Extra (+ Avulso); cada opção mostra só o seu tipo', () => {
    expect(FILTROS_DE_TIPO.map((f) => f.label)).toEqual(['Todos', 'Freelancer', 'Hora Extra', 'Avulso']);
    expect(filtrarPorTipo(itens, 'ALL').map((i) => i.id)).toEqual([1, 2, 3]);
    expect(filtrarPorTipo(itens, 'FREELANCER').map((i) => i.id)).toEqual([1]);
    expect(filtrarPorTipo(itens, 'OVERTIME').map((i) => i.id)).toEqual([2]);
  });
});
