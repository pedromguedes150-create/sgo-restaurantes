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
        summary: 'Concluir as rotinas do dia (checklists).',
        steps: [
          'Abra TAREFAS e toque em "Realizar" no checklist.',
          'Responda cada item: 🟢 De acordo / 🟡 Em correção / 🔴 A corrigir (o "A corrigir" abre uma ocorrência automática).',
          'Anexe até 5 fotos. Em itens com checagem por IA, toque em "Conferir a foto com IA" para ver se está no padrão (compatível/divergente).',
          'O preenchimento é salvo sozinho — se for interrompido, retoma de onde parou.',
          'Toque em "Concluir checklist". Feito após o horário = conta como "fora do prazo" (não penaliza, mas também não pontua).',
          'Use "Ver preenchimento" para rever respostas e fotos de um checklist concluído.',
          'O sistema avisa ~30 min antes do vencimento de cada checklist. Veja execuções passadas em Tarefas → "Histórico".',
          'No Histórico, o Admin pode "Selecionar para excluir", marcar vários (ou todos) e excluir o histórico em lote (sai das métricas; fica na Auditoria).',
        ],
        tips: ['Não realizado (não feito) penaliza a meta; por isso, mesmo atrasado, vale concluir.', 'Checklist "da unidade" (1 por unidade) só pode ser concluído UMA vez no dia — depois fica como "Concluída" e abre só em leitura ("Ver preenchimento").'],
      },
      {
        id: 'comunicacao',
        title: 'Central de Comunicação',
        roles: ALL_ROLES,
        summary: 'Comunicados oficiais com confirmação de leitura (substitui a cobrança por WhatsApp).',
        steps: [
          'Gerente: em COMUNICAÇÃO, a aba "Recebidos" mostra o que falta confirmar. Abra, leia e toque em "Confirmar leitura".',
          'Se o comunicado exigir resposta, anexe foto e/ou escreva um comentário ao confirmar (prova de execução).',
          'Supervisão/Admin: aba "Novo comunicado" — escreva título e mensagem, escolha prioridade, prazo, unidades (e pessoas avulsas), anexe fotos/PDF e links; marque "Fixar no topo" e "Exigir resposta" se quiser.',
          'Aba "Painel & Histórico": acompanhe quem já confirmou e quem está pendente, com barra de progresso, por comunicado.',
          'A confirmação conta na META do gerente: no prazo pontua; atrasado é neutro; vencido sem confirmar penaliza.',
        ],
        tips: ['O peso de "Comunicados" na meta é configurável pelo Admin (no Painel). Comunicados urgentes geram notificação destacada no sino.'],
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
          'No histórico, clique em um lançamento para ver os itens (categoria, kg e observação).',
          'Esqueceu de lançar? Use o seletor de data para registrar um dia anterior.',
          'Botão "Exportar (Excel)" baixa a planilha do mês para relatório.',
          'O Admin cadastra as categorias de desperdício em Configurações → Desperdícios.',
        ],
      },
      {
        id: 'comandas',
        title: 'Comandas',
        roles: MANAGERLINE,
        summary: 'Contagem diária e divergências.',
        steps: [
          'Antes do uso, o Admin cadastra as faixas em Configurações → Comandas (várias sequências por unidade, ex.: 1–200 e 500–650).',
          'Abra COMANDAS e informe "todas presentes" ou as ausentes (considera todas as faixas ativas).',
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
          'Na ocorrência, "Gerar relatório (PDF)" abre uma versão A4 para imprimir/salvar e compartilhar no WhatsApp.',
          'A sub-aba "Manutenção" lista só as ocorrências de tipos marcados como manutenção (ex.: problema crônico).',
          'O Admin cria/edita/exclui tipos e categorias em Configurações → Ocorrências (a gravidade segue fixa em 4 níveis).',
        ],
      },
      {
        id: 'inventario',
        title: 'Inventário',
        roles: MANAGERLINE,
        summary: 'Tarefa do Teknisa + inventário de equipamentos do restaurante.',
        steps: [
          'Seção "Teknisa": o Admin agenda; o gerente confirma a realização (o detalhe é feito no Teknisa, aqui acompanhamos e conferimos).',
          'Seção "Equipamentos": cadastre os itens (nome, fornecedor, unidade, valor, estoque mínimo, local).',
          'Use "Movimentar" para Entrada (recebimento) e Saída — o saldo é atualizado automaticamente.',
          'Use "Contagem" para informar o contado e ajustar o saldo, ou imprima a folha de contagem.',
          'O painel mostra valor em estoque e alerta de "estoque baixo"; o "Histórico" lista todas as movimentações.',
        ],
        tips: ['Itens com saldo abaixo do mínimo ganham selo "baixo". A lista de fornecedores é a mesma das Configurações.'],
      },
      {
        id: 'oleo',
        title: 'Coleta de Óleo',
        roles: [...MANAGERLINE, 'CEO'],
        summary: 'Controle da coleta de óleo usado (recebemos por ela).',
        steps: [
          'Em ÓLEO → "Lançar coleta", informe litros e valor por litro — o total a receber é calculado na hora.',
          'Escolha a empresa coletora (fornecedor) e "como recebemos" (PIX, dinheiro, crédito, troca…).',
          'O "Dashboard" mostra litros e valor recebido por unidade, por forma de recebimento e a tendência mensal.',
          'O "Histórico" guarda todas as coletas, com valor por litro e forma de recebimento.',
        ],
      },
      {
        id: 'notas',
        title: 'Notas Recebidas',
        roles: [...MANAGERLINE, 'FINANCE'],
        summary: 'Registrar notas e controlar pagamento.',
        steps: [
          'Em NOTAS → "Registrar nota", toque em "Escanear" para abrir a câmera e ler o QR code OU o código de barras da nota (DANFE) — a chave preenche sozinha.',
          'Sem câmera? Cole/digite a chave de 44 dígitos (preenche sozinho) ou informe manualmente.',
          'Confirme os dados e salve. O Financeiro/Admin é avisado.',
          'Marque "Paga" ou "Com problema" conforme o andamento.',
        ],
        tips: ['A leitura usa a câmera do próprio celular no navegador (precisa permitir o acesso à câmera). Lê tanto o QR (NFC-e) quanto o código de barras (Code-128 da DANFE).'],
      },
      {
        id: 'gas',
        title: 'Recebimento de Gás',
        roles: [...MANAGERLINE, 'CEO'],
        summary: 'Controle do preço real por kg, com comparativo entre unidades e fornecedores.',
        steps: [
          'Em GÁS → "Lançar recebimento", leia a nota (QR ou código de barras) ou digite a chave; escolha o fornecedor.',
          'Informe a quantidade recebida (kg) e o valor total da nota — o sistema calcula o preço real por kg na hora.',
          'Se o preço por kg subir acima do limite (padrão 10%) vs a última compra da unidade, gerente e supervisor são avisados.',
          'A aba "Dashboard" compara o preço médio/kg por unidade e por fornecedor, e mostra a tendência mensal.',
          'O cadastro de fornecedores fica em Configurações → Fornecedores (Admin/CEO/Supervisão).',
        ],
        tips: ['A lista de fornecedores é compartilhada com Notas Recebidas e Pagamentos. O Admin ajusta o limite do alerta no Dashboard.'],
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
          'Use o seletor de meses para ver o histórico dos meses anteriores.',
          'Botões "PDF" (imprimir/salvar) e "Excel" geram o relatório do mês selecionado.',
        ],
      },
      {
        id: 'pagamentos',
        title: 'Pagamentos',
        roles: [...MANAGERLINE, 'FINANCE'],
        summary: 'Freelancers, horas-extra e avulsos.',
        steps: [
          'Em PAGAMENTOS, solicite (aba Minhas), aprove (Aprovar) e registre o pagamento (Pagar).',
          'Freelancer: ao lançar, o valor vem do padrão cadastrado. Se você mudar o valor, aparece um alerta de divergência (não bloqueia) e o aprovador é avisado.',
          'Financeiro/Admin: use "Consolidação de freelancers" para o relatório mensal (chave PIX + total por freelancer) em PDF e Excel, pronto para o Financeiro.',
          'O Admin pode delegar a aprovação por período (férias do aprovador).',
          'O Admin pode editar o valor/descrição ou excluir lançamentos no histórico (tudo fica no Log de Auditoria).',
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
          'Em CONFIGURAÇÕES, gerencie Unidades, Usuários, Checklists, Comandas, Desperdícios, Ocorrências e Pagamentos.',
          'Comandas: cadastre várias sequências por unidade. Desperdícios e Ocorrências: crie/edite/exclua categorias (e tipos, nas Ocorrências).',
          'Checklists: ao editar um checklist, use "Salvar unidades" para mudar em quais unidades ele aparece (replica nas novas; remove/inativa nas retiradas).',
          'Checklists têm "Programação" (início/encerramento): sem início vale desde já; sem encerramento é contínuo. O checklist só é gerado dentro do período.',
          'Excluir checklist: se ele já tiver execuções, o sistema bloqueia e oferece a exclusão definitiva (apaga histórico/fotos) — ideal para checklists de teste.',
          'Pagamentos: o cadastro de freelancers e tipos de avulso é só aqui. No freelancer, a chave PIX é obrigatória.',
          'Fornecedores: lista única (Admin/CEO/Supervisão) usada em Gás, Notas Recebidas e Pagamentos.',
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
