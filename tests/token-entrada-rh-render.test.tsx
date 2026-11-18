import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
import { TokenEntradaRhClient, gerarTokenNoNavegador } from '@/components/admin/token-entrada-rh-client';

/**
 * v1.211.0 — o token de entrada pode ser trocado pela tela mesmo quando o
 * valor em vigor está no .env do servidor (que ninguém lê sem SSH).
 */
describe('token de entrada do RH: a tela sempre deixa trocar', () => {
  it('com o token no servidor, o campo, o "Gerar token novo" e o "Trocar token" aparecem', () => {
    const html = renderToString(<TokenEntradaRhClient origem="servidor" mascarado="abcdef…wxyz" temNoServidor />);
    expect(html).toContain('definido no servidor');
    expect(html).toContain('data-testid="token-entrada-servidor"');
    expect(html).toContain('data-testid="gerar-token-entrada"');
    expect(html).toContain('data-testid="salvar-token-entrada"');
    expect(html).toContain('Trocar token');
    expect(html).not.toContain('edite o');
  });
  it('sem token nenhum o botão é "Salvar token"; com o da tela aparece o Remover', () => {
    expect(renderToString(<TokenEntradaRhClient origem="nenhum" mascarado="—" />)).toContain('Salvar token');
    const tela = renderToString(<TokenEntradaRhClient origem="tela" mascarado="abcdef…wxyz" temNoServidor />);
    expect(tela).toContain('Remover');
    expect(tela).toContain('quem vale é o gravado pela tela');
  });
  it('o token gerado tem 48 caracteres seguros, sem espaço, e não se repete', () => {
    const a = gerarTokenNoNavegador(); const b = gerarTokenNoNavegador();
    expect(a).toMatch(/^[A-Za-z0-9_-]{48}$/);
    expect(a).not.toBe(b);
  });
});
