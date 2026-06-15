import type { Role } from '@prisma/client';

/**
 * Treinamento da Plataforma — guias de uso por perfil.
 * Conteúdo versionado no código (fácil de manter). AO CRIAR/AJUSTAR QUALQUER
 * FUNCIONALIDADE, adicione/atualize o guia aqui para manter a central completa.
 * `roles` = perfis para quem o guia é mais relevante (todos veem se ligarem "ver tudo").
 */

export const ALL_ROLES: Role[] = ['CEO', 'ADMIN', 'SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE'];

export interface Guide {
  id: string;
  title: string;
  roles: Role[];
  summary: string;
  steps: string[];
  tips?: string[];
}
export interface GuideSection {
  title: string;
  guides: Guide[];
}

const MANAGERLINE: Role[] = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'];

export const GUIDE: GuideSection[] = [
  {
    title: 'Começando',
    guides: [
      {
        id: 'navegacao',
        title: 'Como navegar no sistema',
        roles: ALL_ROLES,
        summary: 'O básico para se localizar na plataforma.',
        steps: [
          'No computador, use o MENU LATERAL à esquerda. No celular, use a barra inferior.',
          'O sino 🔔 no topo mostra suas NOTIFICAÇÕES (alertas e avisos). O número vermelho é o que falta ler.',
          'Ao entrar em uma tela, use o link "← Voltar" para retornar.',
          'Se você cuida de mais de uma unidade, escolha a unidade nos botões/lista no topo de cada tela.',
        ],
        tips: ['O sistema usa a "data operacional" (o dia vira após o horário de corte, ex.: 04:00). Lançamentos da madrugada contam no dia anterior.'],
      },
      {
        id: 'inicio-gerente',
        title: 'Por onde começar (Gerente)',
        roles: ['MANAGER', 'COORDINATOR'],
        summary: 'Sua rotina diária em poucos passos.',
        steps: [
          'Abra o DASHBOARD: veja seu anel de meta do dia e os atalhos.',
          'Faça as TAREFAS do checklist do dia (algumas pedem foto).',
          'Lance os DESPERDÍCIOS, a CONTAGEM DE COMANDAS e registre OCORRÊNCIAS se houver.',
          'Confira TREINAMENTOS pendentes da sua equipe.',
          'No fim do mês, preencha o REALIZADO da Escala e exporte para o RH.',
        ],
      },
      {
        id: 'inicio-admin',
        title: 'Por onde começar (Administrador)',
        roles: ['ADMIN'],
        summary: 'Configuração inicial e manutenção.',
        steps: [
          'Em CONFIGURAÇÕES, cadastre Unidades, Usuários e Checklists.',
          'Defina os PERFIS DE ACESSO (o que cada perfil vê/edita).',
          'No Mapa de Funções, cadastre TURNOS e SETORES de cada unidade.',
          'Crie os POPs (treinamentos) marcando Inicial e/ou Setores.',
          'Em Unidades, informe o "Nome no RH" e sincronize os colaboradores.',
        ],
        tips: ['A sincronização do RH também roda sozinha 1×/dia.'],
      },
    ],
  },
  {
    title: 'Operação do dia a dia',
    guides: [
      {
        id: 'tarefas',
        title: 'Tarefas (Checklist)',
        roles: MANAGERLINE,
        summary: 'Concluir as rotinas do dia.',
        steps: [
          'Abra TAREFAS. Toque em uma tarefa para concluí-la.',
          'Se a tarefa pedir evidência, tire/anexe a foto antes de concluir.',
          'Tarefas não feitas até o limite viram "não realizadas" e afetam a meta.',
        ],
      },
      {
        id: 'desperdicios',
        title: 'Desperdícios',
        roles: MANAGERLINE,
        summary: 'Um lançamento por dia, com foto da balança.',
        steps: [
          'Abra DESPERDÍCIOS, informe os kg por categoria e anexe a foto.',
          'Salvar conclui a tarefa de desperdício do dia automaticamente.',
          'Se uma categoria subir mais de 20% vs a média de 7 dias, o Supervisor é avisado.',
        ],
      },
      {
        id: 'comandas',
        title: 'Comandas',
        roles: MANAGERLINE,
        summary: 'Contagem diária e divergências.',
        steps: [
          'Abra COMANDAS e informe "todas presentes" ou as ausentes.',
          'Quando houver ausentes, a observação é obrigatória e gera divergência + alerta ao Supervisor.',
        ],
      },
      {
        id: 'ocorrencias',
        title: 'Ocorrências',
        roles: MANAGERLINE,
        summary: 'Registrar e acompanhar eventos.',
        steps: [
          'Em OCORRÊNCIAS → "Nova", escolha tipo, gravidade e descreva; anexe foto/vídeo.',
          'Gravidade alta/crítica e reincidência (<30 dias) alertam Supervisor/CEO.',
          'O Supervisor/Admin encerra a ocorrência com a ação corretiva.',
        ],
      },
      {
        id: 'inventario',
        title: 'Inventário',
        roles: MANAGERLINE,
        summary: 'Confirmar execução do inventário agendado.',
        steps: [
          'O Admin agenda o inventário (categoria, data, responsável).',
          'O gerente confirma a realização na tela INVENTÁRIO.',
        ],
      },
      {
        id: 'notas',
        title: 'Notas Recebidas',
        roles: [...MANAGERLINE, 'FINANCE'],
        summary: 'Registrar notas e controlar pagamento.',
        steps: [
          'Em NOTAS → "Registrar nota", cole a chave de 44 dígitos (preenche sozinho) ou informe manualmente.',
          'Confirme os dados e salve. O Financeiro/Admin é avisado.',
          'Marque "Paga" ou "Com problema" conforme o andamento.',
        ],
      },
      {
        id: 'cancelamentos',
        title: 'Cancelamento de Cupons',
        roles: [...MANAGERLINE, 'FINANCE'],
        summary: 'Justificar cancelamentos importados.',
        steps: [
          'O Admin importa o relatório (CSV do Teknisa).',
          'Cada cupom vira uma pendência: selecione o motivo e justifique.',
        ],
      },
    ],
  },
  {
    title: 'Pessoas e Escala',
    guides: [
      {
        id: 'mapa',
        title: 'Mapa de Funções',
        roles: MANAGERLINE,
        summary: 'Quem trabalha em cada setor/turno e disponibilidade do dia.',
        steps: [
          'Em PESSOAS → Mapa de Funções, aloque cada colaborador em um Setor e Turno.',
          'Alterne entre "Planta" (visão visual das áreas da unidade, colorida por cobertura) e "Lista".',
          'Use "Disponibilidade do dia" para escolher uma data e ver quem trabalha × quem está de folga/ausente.',
          'Isso ajuda a decidir hora-extra/freelancer.',
        ],
        tips: ['Toda alocação/remoção avisa os Admins (para informar o RH).'],
      },
      {
        id: 'turnos-setores',
        title: 'Turnos e Setores (Admin)',
        roles: ['ADMIN'],
        summary: 'Padronizar turnos e setores por unidade.',
        steps: [
          'No Mapa de Funções, cadastre os TURNOS da unidade (ex.: Manhã 06-14).',
          'Cadastre os SETORES (use a lista de referência para criar rápido); pode editar e excluir.',
        ],
      },
      {
        id: 'escala-cadastro',
        title: 'Escala — cadastrar o padrão',
        roles: MANAGERLINE,
        summary: 'Definir a escala de cada colaborador (gera o Planejado).',
        steps: [
          'Em PESSOAS → Escala, clique em "Cadastrar escala".',
          'Escolha o colaborador, o tipo (12x36 par/ímpar, 6x1, 5x2 ou personalizada), a data de início do ciclo e o turno.',
          'O Planejado do mês é gerado automaticamente.',
        ],
      },
      {
        id: 'escala-realizado',
        title: 'Escala — Realizado e Comparação',
        roles: MANAGERLINE,
        summary: 'Preencher o que aconteceu e comparar com o planejado.',
        steps: [
          'No modo REALIZADO (única aba editável), clique em cada dia e marque T/F/FI/FJ/A/FE.',
          'Use "Registrar ausência" para faltas/atestados/férias em um período (com anexo).',
          '"Puxar Realizado = Planejado" copia tudo; "Preencher automaticamente" só completa os vazios.',
          'No modo COMPARAÇÃO veja planejado × realizado; exporte em Excel ou PDF para o RH.',
        ],
      },
    ],
  },
  {
    title: 'Treinamentos e POPs',
    guides: [
      {
        id: 'pops-criar',
        title: 'Criar POP / Treinamento (Admin)',
        roles: ['ADMIN'],
        summary: 'Procedimentos e treinamentos da equipe.',
        steps: [
          'Em POPs → "Novo POP", escreva o conteúdo e adicione vídeos do YouTube se quiser.',
          'Marque "Treinamento inicial" (todo novo colaborador faz) e/ou selecione os SETORES.',
          'Escolha a recorrência: Único ou Mensal (reciclagem).',
          'Selecione as unidades. Ao editar o conteúdo, a versão sobe e a equipe refaz o treino.',
        ],
      },
      {
        id: 'treinamentos-gerente',
        title: 'Aplicar treinamentos (Gerente)',
        roles: MANAGERLINE,
        summary: 'Acompanhar e marcar treinamentos por setor.',
        steps: [
          'Abra TREINAMENTOS: veja por setor quem está 🟢 em dia, 🟡 pendente ou 🔴 vencido.',
          'Clique no colaborador, "Abrir POP" para treinar, e depois "Treinei" para marcar como realizado.',
          'Colaborador novo recebe os iniciais (prazo 7 dias); ao mudar de setor, aparecem os POPs do novo setor.',
          'Treinamentos contam na sua META (peso definido pelo Admin).',
        ],
      },
    ],
  },
  {
    title: 'Gestão, Metas e Financeiro',
    guides: [
      {
        id: 'metas',
        title: 'Metas',
        roles: [...MANAGERLINE, 'CEO'],
        summary: 'Sua nota do mês e o ranking.',
        steps: [
          'Em METAS, veja "Minha Meta do Mês" e o detalhamento por item (tarefas, treinamentos…).',
          'A nota considera o que já foi resolvido; pendências no prazo não penalizam.',
        ],
      },
      {
        id: 'pagamentos',
        title: 'Pagamentos',
        roles: [...MANAGERLINE, 'FINANCE'],
        summary: 'Freelancers, horas-extra e avulsos.',
        steps: [
          'Em PAGAMENTOS, solicite (aba Minhas), aprove (Aprovar) e registre o pagamento (Pagar).',
          'O Admin pode delegar a aprovação por período (férias do aprovador).',
        ],
      },
      {
        id: 'dashboard-gestao',
        title: 'Dashboard de gestão',
        roles: ['CEO', 'ADMIN', 'SUPERVISOR'],
        summary: 'Visão da rede.',
        steps: [
          'O Dashboard mostra semáforo por unidade, ranking de metas e alertas.',
          'Use para priorizar onde agir.',
        ],
      },
    ],
  },
  {
    title: 'Administração',
    guides: [
      {
        id: 'config-cadastros',
        title: 'Cadastros (Configurações)',
        roles: ['ADMIN'],
        summary: 'Criar, editar e excluir cadastros.',
        steps: [
          'Em CONFIGURAÇÕES, gerencie Unidades, Usuários, Checklists e Pagamentos.',
          'Tudo tem editar e excluir; a exclusão é bloqueada quando há histórico (nesse caso, inative).',
        ],
      },
      {
        id: 'perfis',
        title: 'Perfis de acesso',
        roles: ['ADMIN'],
        summary: 'Controlar o que cada perfil vê e edita.',
        steps: [
          'Em CONFIGURAÇÕES → Perfis de acesso, escolha o perfil e marque Ver/Editar por módulo.',
          'Sem "Ver", o módulo some do menu daquele perfil. CEO e Admin são sempre totais.',
        ],
      },
      {
        id: 'rh-sync',
        title: 'Colaboradores (RH)',
        roles: ['ADMIN'],
        summary: 'Sincronização com o sistema do RH.',
        steps: [
          'Os colaboradores vêm do RH (não se cria/exclui na plataforma).',
          'Em Unidades, defina o "Nome no RH" e clique em Sincronizar (também roda sozinho 1×/dia).',
        ],
      },
      {
        id: 'admin-operacao',
        title: 'Corrigir lançamentos (Admin)',
        roles: ['ADMIN'],
        summary: 'Excluir lançamentos errados com segurança.',
        steps: [
          'Em cada módulo da Operação, o Admin pode excluir lançamentos (com confirmação).',
          'A exclusão reverte os efeitos (a tarefa do dia pode voltar a pendente) e fica na Auditoria.',
        ],
      },
      {
        id: 'auditoria',
        title: 'Auditoria',
        roles: ['ADMIN', 'CEO'],
        summary: 'Registro imutável de ações.',
        steps: ['Em AUDITORIA, filtre por módulo e veja a linha do tempo das ações críticas.'],
      },
    ],
  },
];

/** Filtra os guias relevantes para um perfil (ou todos). */
export function guidesForRole(role: Role, all: boolean): GuideSection[] {
  if (all) return GUIDE;
  return GUIDE.map((s) => ({ ...s, guides: s.guides.filter((g) => g.roles.includes(role)) })).filter((s) => s.guides.length > 0);
}
