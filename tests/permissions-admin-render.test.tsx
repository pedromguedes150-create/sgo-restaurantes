import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/configuracoes/perfis',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PermissionsAdmin } from '@/components/admin/permissions-admin';
import { MODULES } from '@/lib/permissions';

/**
 * A matriz passou de 31 para ~76 linhas. Sem dobrar as partes de dentro, a tela
 * vira uma parede de caixas de seleção e achar "Minha área" fica pior do que
 * era antes. Estes casos garantem que ela abre dobrada e diz o que tem dentro.
 */

const modules = MODULES.map((m) => ({ key: m.key, label: m.label, parent: m.parent }));

function render(over: Record<string, { canView: boolean; canEdit: boolean }> = {}) {
  const linha: Record<string, { canView: boolean; canEdit: boolean }> = {};
  for (const m of modules) linha[m.key] = { canView: true, canEdit: true };
  const matrix = { MANAGER: { ...linha, ...over }, SUPERVISOR: linha, COORDINATOR: linha, FINANCE: linha };
  return renderToString(React.createElement(PermissionsAdmin, { modules, matrix })).split('<!-- -->').join('');
}

describe('A matriz abre dobrada', () => {
  it('mostra os módulos de primeiro nível', () => {
    const html = render();
    expect(html).toContain('Minha área');
    expect(html).toContain('Configurações');
    expect(html).toContain('Comandas');
  });

  it('não despeja as partes de dentro na tela', () => {
    const html = render();
    expect(html).not.toContain('Bloco de notas');
    expect(html).not.toContain('APIs e integrações');
    expect(html).not.toContain('Conferência por leitor');
  });

  it('avisa quantas partes cada módulo tem', () => {
    const html = render();
    expect(html).toContain('3 partes'); // Minha área
    expect(html).toContain('partes');
  });
});

describe('Parte fechada não passa despercebida', () => {
  it('o módulo avisa quantas partes estão fechadas, mesmo dobrado', () => {
    const html = render({ MANAGER_AREA_LEAVES: { canView: false, canEdit: false } });
    expect(html).toContain('1 fechada');
  });

  it('sem nada fechado, não há aviso', () => {
    expect(render()).not.toContain('fechada');
  });
});
