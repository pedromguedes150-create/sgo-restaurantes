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
          'O capelo 🎓 no topo (ao lado do sino) abre o "Treinamento da Plataforma" — os guias do SEU perfil, em qualquer aparelho.',
          'Ao entrar em uma tela, use o link "← Voltar" para retornar.',
          'Se você cuida de mais de uma unidade, escolha a unidade nos botões/lista no topo de cada tela.',
        ],
        tips: ['O sistema usa a "data operacional" (o dia vira após o horário de corte, ex.: 04:00). Lançamentos da madrugada contam no dia anterior.'],
      },
      {
        id: 'minha-area',
        title: 'Minha área',
        roles: ALL_ROLES,
        summary: 'Seu espaço pessoal — tarefas, notas e folgas.',
        steps: [
          'A aba MINHA ÁREA aparece para todos os usuários, individualmente (é sua, ninguém mais vê).',
          'Tarefas pessoais: crie lembretes com data e hora (a hora é escolhida de 30 em 30 min). Dá para editar (✏️) e excluir (🗑️) cada tarefa; o sistema avisa por notificação na hora marcada.',
          'Bloco de notas: dê um título, escreva com formatação (negrito, itálico, sublinhado, listas, link) e edite quando quiser.',
          'Folgas/férias: registre seus dias de folga/férias.',
          'Gestores (Supervisão/Admin): na aba Folgas há o botão "Consolidado da equipe" — veja folgas/férias por unidade num período. Quem enxerga isso é definido em Configurações → Perfis de acesso.',
        ],
        tips: ['Para gerentes: nos dias marcados como folga/férias, os checklists não aparecem na aba Tarefas (você ainda pode entrar no sistema).'],
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
          'No topo de TAREFAS, o resumo do dia mostra logo se ainda há algo "a fazer": 🟢 no prazo (conta na meta) · 🟡 fora do prazo · 🔴 não realizada · ⚪ a fazer. Mesmo com checklists feitos atrasados, dá pra ver na hora se sobrou algum pendente.',
          'Use "Ver preenchimento" para rever respostas e fotos de um checklist concluído.',
          'O sistema avisa ~30 min antes do vencimento de cada checklist. Veja execuções passadas em Tarefas → "Histórico".',
          'No Histórico, o Admin pode "Selecionar para excluir", marcar vários (ou todos) e excluir o histórico em lote (sai das métricas; fica na Auditoria).',
          'Em Tarefas → "Correções do dia": relatório consolidado dos itens 🟡 Em correção e 🔴 A corrigir do dia (com histórico por data, imprimível). Itens "A corrigir" também viram ocorrência automática.',
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
          'Conta na meta se o lançamento for feito no dia ou até 1 dia depois; passando disso, não conta (nem penaliza).',
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
          'Conferência em grade: abra COMANDAS e toque em cada comanda conferida (fica verde), como na folha de papel. Um contador mostra conferidas/faltando. Use "Marcar todas"/"Limpar", a seleção por FAIXA (de X até Y — marca/desmarca em lote as sequências guardadas) e o filtro por número para agilizar.',
          'Ao "Confirmar conferência", as comandas NÃO marcadas viram as ausentes: o sistema registra a contagem e alerta os supervisores automaticamente (observação obrigatória quando há falta).',
          'Atalhos: "Todas presentes" registra tudo presente num toque; o lançamento manual de ausentes continua disponível (recolhido).',
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
          'A sub-aba "Manutenção" lista só as ocorrências de tipos marcados como manutenção e leva ao módulo Manutenção (chamados e planos preventivos).',
          'O Admin cria/edita/exclui tipos e categorias em Configurações → Ocorrências (a gravidade segue fixa em 4 níveis).',
        ],
      },
      {
        id: 'experiencia',
        title: 'Período de Experiência',
        roles: MANAGERLINE,
        summary: 'Aprovar colaboradores em 90 dias.',
        steps: [
          'Em Pessoas → "Período de Experiência", veja quem tem até 90 dias de casa (a admissão vem do RH).',
          'A barra mostra os dias (X/90) e fica vermelha quando faltam 15 dias ou menos.',
          'Aprove ou reprove com anotações — a decisão avisa os Admins para comunicar ao RH.',
        ],
      },
      {
        id: 'rotina-supervisor',
        title: 'Rotina do Supervisor',
        roles: ['SUPERVISOR', 'ADMIN', 'CEO'],
        summary: 'Painel de uso, visitas e checklists de visita.',
        steps: [
          'Em "Rotina do Supervisor", o Painel de uso mostra por unidade: % de checklists, dias com desperdício/comandas lançados, ocorrências, notas e meta — piores primeiro (quem está deixando de usar o sistema).',
          'Na aba Visitas & Feedbacks, agende visitas por unidade; o gerente é avisado.',
          'Ao concluir a visita, escreva o feedback (obrigatório) e, se quiser, preencha um checklist de visita item a item (OK/Não + observação).',
          'O Admin cria os checklists de visita em Configurações → Checklists de supervisor.',
          'Visitas atrasadas ficam destacadas; o histórico guarda feedbacks e resultados dos checklists.',
        ],
      },
      {
        id: 'troco',
        title: 'Gestão de Troco',
        roles: MANAGERLINE,
        summary: 'Caixas em cadeia com alerta de divergência.',
        steps: [
          'Em Operação → "Gestão de Troco": ao abrir um caixa, conte o troco e digite o valor real.',
          'O sistema compara com o fechamento do caixa anterior (a abertura esperada) — diferença gera alerta automático à supervisão.',
          'Ao fechar, conte de novo e digite o valor: ele vira a abertura esperada do próximo caixa (vale até de um dia para o outro).',
          'Pode haver vários caixas no mesmo dia — sempre um aberto por vez.',
          'A tela mostra os caixas de hoje, o histórico e as divergências do mês (por unidade, para a supervisão).',
        ],
      },
      {
        id: 'comissoes-mobilidade',
        title: 'Comissões & Mobilidade',
        roles: MANAGERLINE,
        summary: 'Lançar e acompanhar valores por colaborador.',
        steps: [
          'Em Pessoas → "Comissões & Mobilidade", a Supervisão/Admin lança o valor (comissão do Teknisa ou mobilidade) escolhendo colaborador, tipo e mês.',
          'O dashboard mostra os totais do mês, por unidade, os maiores valores e a tendência de 12 meses.',
          'O histórico lista cada lançamento (quem lançou, quando, observação); o Admin pode excluir (auditado).',
        ],
      },
      {
        id: 'ferias-solicitar',
        title: 'Férias — pedir ao RH',
        roles: MANAGERLINE,
        summary: 'Solicitar férias de um colaborador.',
        steps: [
          'Em Pessoas → aba "Férias", use "Solicitar férias ao RH": escolha o colaborador e o período.',
          'O pedido fica com status "Solicitada ao RH" e os Admins são avisados para levar ao RH.',
          'As férias vindas do RH continuam aparecendo na lista; use "Solicitar alteração" quando precisar mudar uma já confirmada.',
        ],
      },
      {
        id: 'escala-trocas',
        title: 'Trocas de escala (RH)',
        roles: MANAGERLINE,
        summary: 'Registrar trocas para informar o RH.',
        steps: [
          'Na Escala, toque em "Trocas de escala (RH)".',
          'Registre quem trocou: só de dia (colaborador + dia original + novo dia) ou entre dois colaboradores.',
          'Cada registro avisa os Admins para informar o RH. A presença em si você continua lançando na aba Realizado da Escala.',
        ],
      },
      {
        id: 'mudancas-funcao-setor',
        title: 'Mudanças de função/setor (RH)',
        roles: MANAGERLINE,
        summary: 'Registrar mudanças e avisar o RH.',
        steps: [
          'No Mapa de Funções, ao editar um alocado dá para trocar o setor/turno e também a função (cargo).',
          'Mudança de setor vale na hora no SGO; mudança de função vira uma solicitação — os Admins são avisados para efetivar no RH, e o cargo atualiza no próximo sync.',
          'Em Pessoas → "Mudanças de função/setor (RH)" fica o registro consolidado (quem mudou, de onde para onde, quando e por quem).',
        ],
      },
      {
        id: 'avaliacao-colaborador',
        title: 'Avaliação do colaborador',
        roles: MANAGERLINE,
        summary: 'Observações do dia a dia + nota mensal.',
        steps: [
          'Em Pessoas → "Avaliação do colaborador", escolha o mês e toque no colaborador.',
          'Registre observações do dia a dia na aba "Observações" (não altera o cadastro do RH).',
          'Na aba "Avaliação", dê nota de 1 a 5 em Pontualidade, Desempenho, Trabalho em equipe e Apresentação + comentário do mês.',
          'A aba "Histórico" mostra as médias dos meses anteriores.',
          'O Admin define o peso das avaliações na meta do gerente (padrão 0 = não conta; só passa a contar quando o Admin ligar).',
        ],
      },
      {
        id: 'manutencao',
        title: 'Manutenção',
        roles: MANAGERLINE,
        summary: 'Chamados e manutenção preventiva.',
        steps: [
          'Aba "Chamados": abra um chamado (o que precisa, equipamento, prestador e prazo). Acompanhe pelo status Aberto → Em andamento → Concluído.',
          'Ao concluir, informe o custo e o que foi feito — os supervisores são avisados na abertura, e o painel mostra abertos, atrasados e o custo do mês.',
          'Aba "Preventiva": crie planos recorrentes por equipamento (ex.: limpar a coifa a cada 30 dias). O sistema avisa gerente e supervisão quando vence.',
          'Ao fazer a preventiva, use "Registrar execução" — o sistema agenda a próxima automaticamente e guarda o histórico.',
          'O Admin pode excluir chamados e planos.',
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
          'Marque "Paga", "Com problema" ou "Devolver" (nota errada/devolução ao fornecedor — informe o motivo).',
          'Supervisor/Admin têm a aba "Análise": filtra o histórico por fornecedor, unidade e status, com os totais.',
          'Editar/excluir uma nota lançada: somente supervisores, administradores e CEO. O gerente lança e acompanha (Paga/Problema/Devolver), mas não altera nem apaga.',
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
          'Informe a quantidade (kg) e o VALOR POR KG — o valor total é calculado automaticamente.',
          'Em "Relatório de variação" você acompanha a evolução do preço/kg por unidade (com Δ% a cada compra), imprimível e exportável em Excel.',
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
          'O Admin importa o relatório do Teknisa em Excel (.xlsx) ou CSV — "Relação de Cupons SAT/NFC-e". O sistema traz só o nº do cupom e o valor; linhas de total são ignoradas.',
          'Cada cupom vira uma pendência: selecione o motivo e justifique.',
          'O botão "Relatório" abre a visão do mês (por unidade) para exportar em Excel ou salvar em PDF, com o ranking por operador.',
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
        summary: 'Monte o quadro uma vez; o mapa mostra quem está na unidade agora.',
        steps: [
          'QUADRO PADRÃO: em PESSOAS → Mapa de Funções, use "A alocar" para colocar cada colaborador num Setor e Turno. Ao alocar, ele sai de "A alocar" e entra em "Alocados" (editável/removível). Isso é feito UMA vez.',
          'MAPA DA UNIDADE: mostra automaticamente quem está trabalhando AGORA — segue a Escala. Quem está de folga, falta, atestado ou férias não aparece naquele dia (sem você fazer nada).',
          'Se ninguém estiver no horário, o mapa fica vazio — confira a Escala do dia em Pessoas → Escala.',
          'HISTÓRICO: escolha um DIA passado e um HORÁRIO para ver como a equipe estava naquele dia e hora exatos.',
          'PROJEÇÃO: escolha um DIA futuro (ou use "Amanhã"/"Depois de amanhã") para ver como a equipe deve ficar, pela escala planejada — ótimo para se programar. "Agora" volta ao tempo real.',
          'FREELANCER: depois de lançar o pedido de pagamento dele com o DIA e a HORA (início/fim), ele aparece em "Freelancers do dia" no Mapa — escolha o setor e ele entra no mapa naquele dia/horário.',
        ],
        tips: [
          'Toda alocação/remoção avisa os Admins (para informar o RH).',
          'O quadro padrão é fixo; o mapa do dia é só leitura e se atualiza sozinho pela Escala.',
        ],
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
      {
        id: 'atestados',
        title: 'Atestados (Central de Atestados)',
        roles: MANAGERLINE,
        summary: 'Lance o atestado por foto; a IA lê e pré-preenche.',
        steps: [
          'Em ATESTADOS → aba "Lançar", tire a foto do atestado (ou anexe um PDF).',
          'A IA lê os campos e pré-preenche o formulário; confira os campos destacados em amarelo (baixa confiança).',
          'Selecione o colaborador na lista (a IA mostra o nome lido como dica), confirme as datas e salve.',
          'Ao salvar, os dias do período são marcados automaticamente como "Atestado" na Escala — não precisa lançar de novo lá.',
          'Atestado de horas (consulta) não afasta o dia todo; acompanhamento de familiar marca o(s) dia(s).',
        ],
        tips: [
          'O sistema avisa o RH a cada novo atestado (Central de Notificações).',
          'Evita duplicidade: o mesmo colaborador + mesmo período não é aceito duas vezes.',
        ],
      },
      {
        id: 'atestados-painel',
        title: 'Atestados — Painel e Relatório',
        roles: ['ADMIN', 'CEO', 'SUPERVISOR'],
        summary: 'Quantidade, dias perdidos e absenteísmo por unidade.',
        steps: [
          'Na aba "Painel", escolha o mês e veja total de atestados, dias perdidos, ranking por unidade e taxa de absenteísmo.',
          'Veja a tendência de 12 meses, a distribuição por dia da semana e por tipo.',
          'Use "Relatório (PDF)" para imprimir e "Excel/CSV" para enviar ao RH/contabilidade.',
        ],
        tips: ['O CID é dado sensível (LGPD): só Administrador/CEO (papel de RH) enxergam; nunca aparece para gerentes nem nos rankings.'],
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
          'Em POPs → "Novo POP", monte o conteúdo em BLOCOS: Texto (com negrito, itálico, listas, subtítulo e link), Checklist, Imagem e Vídeo do YouTube.',
          'Arraste os blocos pelo ícone ⁞⁞ (ou use ▲▼) para reordenar; cada bloco tem seu botão de remover.',
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
          'No Histórico dá para filtrar por tipo (freelancer/hora extra/avulso), unidade e status, e buscar por prestador/beneficiário.',
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
          'Botão "Modelos prontos…" abre a biblioteca de modelos (por setor/momento) — marque só os que quiser criar na unidade; os que já existem ficam sinalizados.',
          'Em "Biblioteca de modelos" (ou Configurações → Modelos de checklist) o Admin cria, edita e exclui os modelos — clique no modelo para visualizá-lo; o lápis edita.',
          'Modelos: "Exportar (Excel)" baixa a planilha; edite (altere/adicione modelos e etapas) e use "Importar (Excel)" para atualizar a biblioteca em lote. "Imprimir (PDF)" gera a folha para conferência in loco.',
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
        steps: [
          'Em AUDITORIA, filtre por módulo e veja a linha do tempo das ações críticas.',
          'Em "Relatório / Export", escolha o período (7/30/90 dias) e o módulo, salve em PDF ou exporte o CSV completo (com entidade, ID e IP).',
        ],
      },
    ],
  },
];

/** Filtra os guias relevantes para um perfil (ou todos). */
export function guidesForRole(role: Role, all: boolean): GuideSection[] {
  if (all) return GUIDE;
  return GUIDE.map((s) => ({ ...s, guides: s.guides.filter((g) => g.roles.includes(role)) })).filter((s) => s.guides.length > 0);
}
