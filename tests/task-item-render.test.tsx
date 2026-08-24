import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tarefas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { TaskItem, type TaskItemData } from '@/components/tasks/task-item';

/** O link tem de sair no HTML com o filtro — não basta a função estar certa. */
const tarefa = (over: Partial<TaskItemData> = {}): TaskItemData => ({
  id: 't1', name: 'Abertura do dia', description: null, limitTime: '07:00',
  requiresEvidence: false, status: 'PENDING', isOverdue: false, ...over,
});

const render = (t: TaskItemData, unitParam?: string) =>
  renderToString(React.createElement(TaskItem, { task: t, unitParam }));

describe('Linha de tarefa — o link carrega a unidade', () => {
  it('com filtro, o link do detalhe leva a unidade', () => {
    expect(render(tarefa(), 'u1')).toContain('/tarefas/t1?unit=u1');
  });

  it('sem filtro, o link fica limpo', () => {
    const html = render(tarefa());
    expect(html).toContain('/tarefas/t1');
    expect(html).not.toContain('unit=');
  });

  it('tarefa concluída também volta para a unidade certa', () => {
    /* Concluída ignora o moduleHref e vai para o detalhe — é justamente a tela
       do relato (checklist já concluído, botão voltar). */
    expect(render(tarefa({ status: 'DONE', moduleHref: '/modulos/desperdicios' }), 'u1'))
      .toContain('/tarefas/t1?unit=u1');
  });

  it('tarefa pendente de módulo continua abrindo o módulo', () => {
    const html = render(tarefa({ moduleHref: '/modulos/comandas' }), 'u1');
    expect(html).toContain('/modulos/comandas');
    expect(html).not.toContain('/tarefas/t1');
  });
});
