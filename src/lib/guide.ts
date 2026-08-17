import type { Role } from '@prisma/client';

/**
 * Treinamento da Plataforma — guias de uso por perfil.
 * Conteúdo versionado no código (fácil de manter). AO CRIAR/AJUSTAR QUALQUER
 * FUNCIONALIDADE, adicione/atualize o guia aqui para manter a central completa.
 * `roles` = perfis para quem o guia é mais relevante (todos veem se ligarem "ver tudo").
 */

export const ALL_ROLES: Role[] = ['CEO', 'ADMIN', 'SUPERVISOR', 'COORDINATOR', 'MANAGER', 'FINANCE', 'CASHIER'];

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
          'CAMPOS DE ESCOLHA, DATA E HORA: as listas, o calendário e o relógio agora são do próprio sistema, iguais em qualquer aparelho — antes cada celular abria o seu. Toque no campo para abrir; no computador dá para usar só o teclado (setas para andar, Enter para escolher, Esc para fechar).',
          'Campo opcional que você preencheu por engano: reabra a lista e escolha a primeira opção ("— nenhum —", "Todas as unidades"…) para deixar em branco de novo. No calendário e no relógio, o botão "Limpar".',
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
          'Tarefas pessoais: crie lembretes com data e hora (a hora é escolhida de 30 em 30 min no lembrete; nos demais campos de hora, de 5 em 5). Dá para editar (✏️) e excluir (🗑️) cada tarefa; o sistema avisa por notificação na hora marcada.',
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
          'Item com ocorrência EM ABERTO aparece sinalizado (⚠ desde DD/MM) nos checklists seguintes, sem gerar pendência nova — o aviso some quando a ocorrência for encerrada.',
        ],
        tips: ['Não realizado (não feito) penaliza a meta; por isso, mesmo atrasado, vale concluir.', 'Checklist "da unidade" (1 por unidade) só pode ser concluído UMA vez no dia — depois fica como "Concluída" e abre só em leitura ("Ver preenchimento").'],
      },
      {
        id: 'fichas-link',
        title: 'Fichas (checklists por link)',
        roles: MANAGERLINE,
        summary: 'Fichas preenchidas por um link, sem login (ex.: Controle de Massas).',
        steps: [
          'Configuração (quem for liberado na Gestão de Acessos): Configurações → "Fichas (checklists por link)".',
          'Crie a ficha com um título e escolha a UNIDADE; adicione as perguntas escolhendo o tipo de cada uma: texto, observação, número, horário, data, lista suspensa (com opções), Sim/Não, ou um subtítulo de seção.',
          'Marque os campos obrigatórios; reordene com as setas; edite ou exclua quando precisar.',
          'Gere/copie o LINK da ficha e compartilhe com a equipe. Dá para desligar o link, gerar um novo (revoga o antigo) e definir um teto de envios por dia.',
          'Quem abre o link NÃO faz login: escolhe o próprio nome na lista de funcionários da unidade e preenche.',
          'Histórico: em Tarefas → "Fichas" (ou pelo atalho na tela de configuração) você vê todos os envios — quem preencheu, quando e as respostas — com filtro por ficha e período.',
        ],
        tips: ['A ficha por link NÃO entra na meta nem aparece na aba Tarefas — é um formulário avulso, separado dos checklists diários.'],
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
          'Categorias em UNIDADES (ex.: lanchonete): lance produto por produto (nome + quantidade) — o total soma sozinho. O Admin define kg/un em Configurações → Desperdícios.',
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
          'Mais rápido: o botão "📷 Conferir com leitor" abre a conferência por código de barras (ver o guia próprio) — o caixa passa o leitor em vez de tocar comanda por comanda.',
        ],
      },
      {
        id: 'comandas-leitor',
        title: 'Conferência de comandas com leitor de código de barras',
        roles: [...MANAGERLINE, 'CASHIER'],
        summary: 'O caixa bipa as comandas presentes e o sistema calcula as faltantes sozinho.',
        steps: [
          'O Administrador cria o usuário do caixa em Configurações → Usuários com o perfil "Caixa" e vincula a unidade. Esse perfil só enxerga a conferência de comandas.',
          'Na máquina do caixa, entre no SGO com esse usuário — a tela de conferência abre direto.',
          'O leitor funciona como teclado: clique uma vez no campo grande e vá passando o leitor em cada comanda presente. Não precisa tocar em nada entre uma comanda e outra.',
          'Os contadores no topo mostram conferidas / ativas / faltando em tempo real. "Desfazer última" corrige um bipe errado.',
          'Terminou a bandeja? Toque em "Concluir conferência", confira a lista de faltantes na confirmação e registre.',
          'As faltantes viram divergências e o supervisor da unidade é avisado na hora — exatamente como na conferência em grade.',
        ],
        tips: [
          'Leituras repetidas são ignoradas (aparece "já bipada") — não tem risco de contar a mesma comanda duas vezes.',
          'Se o código bipado não pertencer à sequência da unidade, a tela avisa e mostra o código lido, em vez de aceitar em silêncio.',
          'Comanda em uso na mesa: bipe assim que ela voltar, ou registre na observação antes de concluir.',
          'Se a unidade já tiver subido o relatório de "Comandas em Aberto", ao concluir o sistema mostra quais faltantes estão ABERTAS com valor no Teknisa — é o sinal forte da fraude das "2 comandas", leve os horários ao monitoramento.',
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
          'Na ocorrência, registre as FASES do andamento (timeline "Andamento") até o encerramento.',
          'Precisa mudar a classificação? Use "Reclassificar" — tipos de Manutenção/TI movem a ocorrência para a sub-aba correspondente.',
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
        id: 'cobertura-setor',
        title: 'Freelancer — cobertura de setor',
        roles: MANAGERLINE,
        summary: 'Valor fechado por dia, por setor.',
        steps: [
          'O Admin cadastra no freelancer os setores com valor por dia (Configurações → Pagamentos → editar freelancer).',
          'No lançamento Freelancer, marque "Cobertura temporária de setor", escolha o setor — o valor do dia sai automático (+ VT opcional).',
          'Na Hora Extra também dá para somar o vale-transporte ao total.',
          'Na Consolidação de freelancers, além do mês dá para fechar por SEMANA (segunda→domingo) — como o pagamento de segunda.',
        ],
      },
      {
        id: 'meu-perfil',
        title: 'Meu Perfil',
        roles: [...MANAGERLINE, 'CEO', 'FINANCE'],
        summary: 'Complete seus dados e troque sua senha.',
        steps: [
          'Toque no seu nome/avatar no topo da tela para abrir o Meu Perfil.',
          'Complete o nome completo e o CPF — a Supervisão/Admin visualizam esses dados em Configurações → Usuários.',
          'Troque a senha informando a senha atual + a nova (mínimo 8 caracteres).',
          'Em "Aparência", escolha o tema: CLARO, ESCURO ou APARELHO (segue o que o celular estiver usando).',
          'Mais abaixo, em "Notificações no celular", ative os avisos do SGO no aparelho (ver o guia próprio).',
        ],
        tips: [
          'O SGO abre CLARO para todo mundo. O escuro só aparece se você marcar — ou se marcar APARELHO e o celular estiver no modo escuro. A escolha fica salva por 1 ano.',
          'A escolha é por aparelho, não por usuário: se você usa celular e computador, marque nos dois.',
        ],
      },
      {
        id: 'push-celular',
        title: 'Receber notificações no celular (avisos com o app fechado)',
        roles: ALL_ROLES,
        summary: 'Instale o SGO no celular e ative as notificações — o aviso chega mesmo sem o app aberto.',
        steps: [
          'INSTALAR O APP: no Android (Chrome), abra o SGO e toque no menu ⋮ → "Instalar aplicativo"/"Adicionar à tela de início". No iPhone (Safari), toque em Compartilhar → "Adicionar à Tela de Início".',
          'No iPhone esse passo é OBRIGATÓRIO: sem instalar, o iOS não entrega notificação nenhuma.',
          'Abra o SGO pelo ÍCONE instalado, entre em Meu Perfil (seu nome no topo) e vá até "Notificações no celular".',
          'Toque em "Ativar notificações neste aparelho" e responda PERMITIR na pergunta do navegador.',
          'Toque em "Enviar teste" — deve aparecer uma notificação na tela em alguns segundos.',
          'Ao tocar na notificação, o SGO abre direto na tela do assunto.',
        ],
        tips: [
          'É por aparelho: se você usa celular e computador, ative nos dois.',
          'Em "O que quero receber no celular" dá para desligar categorias (ex.: só comunicados e ocorrências). O aviso continua no sino 🔔 — só não vira notificação no aparelho.',
          'Avisos críticos são sempre enviados, mesmo com a categoria desligada.',
          'Se você bloqueou por engano, libere em Configurações do site → Notificações e recarregue a página.',
          'A lista "Meus aparelhos" mostra onde você ativou; toque na lixeira para remover um aparelho antigo (ex.: celular trocado).',
        ],
      },
      {
        id: 'escala-atraso',
        title: 'Escala — Atraso',
        roles: MANAGERLINE,
        summary: 'Registrar atraso avisa o RH.',
        steps: [
          'Na Escala → aba Realizado, além de Falta/Atestado/Férias agora existe o status "Atraso" (AT).',
          'Use quando o colaborador trabalhou mas chegou atrasado — ele continua aparecendo no Mapa do dia.',
          'Cada atraso registrado entra nos Avisos ao RH automaticamente (facilita a conferência de ponto).',
        ],
      },
      {
        id: 'lancamento-fora-do-prazo',
        title: 'Lançamento fora do prazo',
        roles: MANAGERLINE,
        summary: 'Data corrigida desconta na meta.',
        steps: [
          'Pagamentos, Notas, Gás e Óleo mostram a data da solicitação e ordenam do mais novo para o mais antigo.',
          'Se o gerente esquecer de lançar no dia, o Admin/Supervisor corrige a data pelo botão "Editar data".',
          'Cada correção marca o lançamento, avisa o gerente e desconta % na meta do mês (padrão 2%/lançamento; o Admin ajusta na tela de Metas).',
          'A linha "Fora do prazo" aparece no detalhamento da meta.',
        ],
      },
      {
        id: 'ocorrencias-ti',
        title: 'Ocorrências de TI',
        roles: MANAGERLINE,
        summary: 'Sub-aba separada para chamados de TI.',
        steps: [
          'Em Configurações → Ocorrências, marque um tipo como "TI".',
          'As ocorrências desses tipos aparecem na sub-aba TI dentro de Ocorrências (como a de Manutenção).',
          'Preparado para a futura integração com o sistema de gestão de TI.',
        ],
      },
      {
        id: 'avisos-rh-escala',
        title: 'Avisos ao RH (Escala)',
        roles: MANAGERLINE,
        summary: 'Variações do Realizado viram avisos.',
        steps: [
          'Toda variação lançada no Realizado da Escala (falta, atestado, férias…) gera um aviso automático registrado.',
          'Em Escala → "Avisos ao RH", acompanhe tudo em formato de relatório, filtrando por período e unidade.',
          'Quando a API do RH aceitar estes eventos, os avisos passam a ser enviados na hora (a tela mostra o status).',
        ],
      },
      {
        id: 'apis-integracoes',
        title: 'APIs & Integrações',
        roles: ['ADMIN', 'CEO'],
        summary: 'Central única de chaves, URLs e eventos.',
        steps: [
          'Em Configurações → APIs & Integrações: API do RH (consumo), endpoints de recepção RH→SGO (URLs para colar no painel do RH) e webhook de férias SGO→RH.',
          'Os tokens aparecem mascarados; os valores completos ficam no .env do servidor.',
          'A lista "Últimos eventos" mostra tudo que entrou/saiu (admissões, desligamentos, webhooks de férias) com status.',
        ],
      },
      {
        id: 'visao-executiva',
        title: 'Visão Executiva',
        roles: ['CEO', 'ADMIN'],
        summary: 'A rede em uma tela por mês.',
        steps: [
          'Em "Visão Executiva", escolha o mês: cartões da rede (meta média, uso, desperdício, atestados, troco, manutenção, ocorrências graves, visitas) + tabela por unidade ordenada pela meta.',
          'A bolinha ao lado da unidade é o uso do sistema (🟢 ≥80% · 🟡 ≥50% · 🔴 <50%).',
          '"Imprimir / PDF" gera a versão para reunião de diretoria.',
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
          'Em "Recorrência de visitas", defina por unidade "visitar a cada N dias" — concluir a visita reagenda a próxima e vencida gera aviso diário.',
          'Toda semana o sistema envia sozinho um resumo de aderência: unidades com dias sem lançamentos ou checklists baixos são cobradas automaticamente.',
          'Use "Excel do mês" para exportar as visitas (com feedback e itens não OK).',
        ],
      },
      {
        id: 'troco',
        title: 'Gestão de Troco (cofre)',
        roles: MANAGERLINE,
        summary: 'Cofre por denominação + baldes dos caixas.',
        steps: [
          'O TROCO da unidade vive num COFRE, controlado por denominação (valor em R$ de cada nota/moeda, como a sua folha de papel).',
          'Comece o dia com "Conferir cofre": lance o valor contado de cada denominação — isso vira o saldo oficial.',
          '"Repor balde": registre os miúdos que saíram do cofre para o balde do caixa e as notas grandes que voltaram (troca de igual valor).',
          'Quando o cofre acumular notas grandes (o painel avisa em ≥50%), use "Troca c/ escritório": envia as grandes, recebe moedas.',
          'A supervisão fixa o valor-alvo de cada balde e vê os cofres da rede com as retiradas do mês.',
          '🚨 Retirar troco para pagamento é PROIBIDO — se for inevitável, registre pela opção vermelha: a supervisão é avisada na hora e a reposição será cobrada.',
          '"Solicitar troco": peça troco/moedas à supervisão (supervisor, coordenador e administrador) — eles são avisados na hora e veem o pedido destacado ao abrir a aba de Troco.',
          '"Troca no caixa": para unidades SEM baldes (ex.: Nova União), registre a troca de dinheiro feita direto no cofre com o caixa — fica no histórico.',
          'Aba "Histórico": veja todas as movimentações do cofre com filtros completos (tipo, usuário, período, valor) e ordenação.',
          '⚙️ Configuração (Supervisão/Coordenação, em Configurações → "Troco — denominações por unidade"): escolha, por unidade, quais notas/moedas existem no cofre e em quais blocos aparecem (miúdos × notas grandes), quais contam no indicador de ≥50% e a ordem de exibição. O botão "copiar para todas as minhas unidades" replica a configuração de uma vez. Denominação com saldo no cofre não pode ser desativada (some valor da conta).',
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
          '"Excel do mês" exporta os lançamentos com total (bom para conferência com o financeiro).',
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
        summary: 'Registrar o recebimento das notas.',
        steps: [
          'Em NOTAS → "Registrar nota", toque em "Escanear" para ler o QR code OU o código de barras (DANFE) — a chave preenche sozinha. Sem câmera? Cole a chave de 44 dígitos.',
          'Escolha o fornecedor NA LISTA de cadastrados (não dá mais para digitar — falta algum? peça ao Admin em Configurações → Fornecedores).',
          'A lista mostra as notas por data de lançamento (mais novas primeiro), últimos 60 dias — mude o período e use os filtros/busca.',
          'O pagamento é controlado no Teknisa — aqui marque só "Problema" ou "Devolver" (com o motivo).',
          'Atenção à meta: se a Supervisão corrigir a data OU precisar lançar uma nota que era sua, desconta % na sua meta do mês.',
          'GÁS agora entra por aqui: se o fornecedor for de gás (marcado no cadastro), ao selecioná-lo os campos viram os de gás (kg/botijão + vencimento). Veja a aba "Análise de gás".',
          'Aba "Vencimentos": acompanhe os boletos a vencer (notas e gás) com filtros; a supervisão e o financeiro são avisados dos próximos vencimentos.',
          'Supervisor/Admin: aba "Análise" com todos os filtros, campos completos, editar/excluir, Excel e Imprimir/PDF.',
        ],
        tips: ['A leitura usa a câmera do próprio celular no navegador (precisa permitir o acesso à câmera). Lê tanto o QR (NFC-e) quanto o código de barras (Code-128 da DANFE).'],
      },
      {
        id: 'gas',
        title: 'Gás (dentro de Notas Recebidas)',
        roles: [...MANAGERLINE, 'CEO'],
        summary: 'O gás agora é lançado como nota; a análise fica na aba "Análise de gás".',
        steps: [
          'O "Recebimento de Gás" saiu da barra lateral — tudo fica em NOTAS RECEBIDAS. (Links antigos de /modulos/gas redirecionam para lá.)',
          'Primeiro, o Admin/Supervisão marca o fornecedor como "fornecedor de gás" em Configurações → Fornecedores.',
          'Para lançar: NOTAS → "Registrar nota", escolha o fornecedor de gás — os campos viram os de gás (granel em kg + valor/kg, ou botijão P45) + a data de vencimento do boleto.',
          'Aba "Análise de gás" (dentro de Notas): Dashboard com preço médio/kg e VOLUME comprado por unidade e por fornecedor (com filtros de unidade/fornecedor/mês que agora funcionam), histórico, contratos e o relatório de variação (imprimível).',
          'Contratos: Supervisão/Admin cadastram período, kg e preço/kg por fornecedor; os recebimentos abatem sozinhos e o Dashboard mostra o % cumprido.',
          'Se o preço/kg subir acima do limite (padrão 10%) vs a última compra da unidade, gerente e supervisor são avisados.',
        ],
        tips: ['A lista de fornecedores é compartilhada com Notas e Pagamentos. O Admin ajusta o limite do alerta no Dashboard da Análise de gás.'],
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
          'Supervisão/Admin: "Configuração da Meta" reúne todos os componentes e pesos — inclusive os novos "Desperdício diário" e "Comandas diárias" (cobertura mensal; nascem desligados).',
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
          'Em "Unidades hoje", cada unidade é um botão: toque nela para abrir as tarefas do dia já filtradas por aquela unidade (o mesmo vale para a lista por unidade do gerente multi-unidade).',
          'Na tela de tarefas filtrada, o nome da unidade aparece abaixo do título com o atalho "Ver todas as unidades" para voltar à visão completa.',
          'No computador (telas a partir de 1024px) os cartões do Dashboard ficam em duas colunas para aproveitar a largura; os alertas seguem em linha cheia. No celular nada muda: continua uma coluna.',
          'Ainda no computador, o botão à esquerda da barra vinho (no topo da tela) recolhe o menu lateral para uma faixa fina só com os ícones (passe o mouse para ver o nome) e o conteúdo ocupa o espaço liberado. O sistema lembra sua escolha nas próximas telas e ao recarregar. No celular o menu de baixo continua igual.',
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
