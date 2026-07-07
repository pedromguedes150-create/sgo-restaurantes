# Changelog — SGO Beija Flor

Registro das versões do aplicativo. Convenção de versão: **v{maior}.{menor}.{correção}**
- **correção** (x.y.**z**): ajustes de texto/tela, correção de bugs.
- **menor** (x.**y**.0): melhorias e novas funções dentro de módulos existentes.
- **maior** (**x**.0.0): módulo novo grande / mudança estrutural.

A versão em uso aparece no rodapé do menu e na tela de login.

---

## v1.12.0 — 2026-07-07 (fecha a Onda 4 e o lote de ajustes jul/2026)
### Adicionado
- **Novo módulo: Rotina do Supervisor** (item 17, Onda 4) em `Gestão → Rotina do Supervisor` (visível por padrão para Supervisão/Admin/CEO; ajustável na matriz de Perfis):
  - **Fase A — Painel de uso dos gerentes**: consolida por unidade/mês % de checklists, cobertura de desperdício e comandas (dias com lançamento ÷ dias decorridos), ocorrências, notas, caixas de troco e meta, com **indicador de uso correto** (🟢🟡🔴) e piores primeiro.
  - **Fase B — Visitas & Feedbacks**: agenda de visitas por unidade (gerente é notificado), conclusão com **feedback obrigatório** (gerente recebe), números do mês (feitas/agendadas/atrasadas) e histórico.
  - **Fase C — Checklists de supervisor**: criados em `Configurações → Checklists de supervisor` (Admin), preenchidos na visita item a item (OK/Não + observação), resultados congelados na visita.

## v1.11.0 — 2026-07-07
### Adicionado
- **Novo módulo: Gestão de Troco** (item 16, Onda 4) em `Operação → Gestão de Troco`: **sessões de caixa em cadeia** — o fechamento de um caixa é a **abertura esperada** do próximo (o troco "pernoita" entre dias). Abertura digitada diferente do fechamento anterior gera **divergência com alerta automático** ao supervisor da unidade + Admins. Vários caixas por dia (um aberto por vez), resumo do dia, **dashboard de divergências do mês por unidade** e histórico. Admin exclui sessões (auditado). Módulo `CASH` na matriz de Perfis.

## v1.10.0 — 2026-07-07 (fecha a Onda 3 — Pessoas/RH)
### Adicionado
- **Pessoas — Comissões & Mobilidade** (item 14): Supervisão/Admin lança valores (comissão do Teknisa / mobilidade) por colaborador/mês, com **dashboard** (totais do mês, por unidade, maiores do mês, tendência 12 meses) e **histórico mensal**. Admin exclui lançamentos (auditado).
- **Pessoas — Solicitar férias ao RH** (item 11, provisório até a API do RH): na aba Férias, o gerente escolhe colaborador + período e **pede ao RH** — o pedido fica "Solicitada ao RH" e os **Admins são avisados**. Anti-duplicidade de período por colaborador.
- **Escala — Trocas → RH** (item 15): novo registro de trocas (`Escala → Trocas de escala (RH)`): só de dia, entre dois colaboradores ou troca completa, com motivo. Cada registro **notifica os Admins** para informar o RH (pronto para plugar a futura API).

## v1.9.0 — 2026-07-07
### Adicionado
- **Pessoas — Mudanças de função/setor → RH** (item 12, Onda 3): no **Mapa de Funções**, ao editar um alocado dá para trocar também a **função (cargo)**. Mudança de **setor** vale na hora no SGO e gera registro; mudança de **função** vira **solicitação ao RH** (o cadastro vem do RH — o cargo atualiza no próximo sync). Toda mudança **notifica os Admins** e entra no **registro consolidado** `Pessoas → Mudanças de função/setor (RH)` (pronto para plugar a futura API do RH).

## v1.8.0 — 2026-07-07
### Adicionado
- **Pessoas — Avaliação do colaborador** (item 13, Onda 3): nova tela (`Pessoas → Avaliação do colaborador`) com **observações do dia a dia** (texto livre, com autor e data — sem mexer no cadastro, que continua vindo do RH) e **avaliação mensal** (1 por colaborador/mês) com 4 critérios de 1–5 ★ (Pontualidade, Desempenho, Trabalho em equipe, Apresentação/higiene) + comentário, com **histórico dos últimos 12 meses**.
- **Meta — componente "Avaliações da equipe"**: as avaliações contam na meta do gerente como componente único com **peso configurável pelo Admin (padrão 0 = desligado — as notas atuais não mudam)**. Só penaliza colaborador sem avaliação em **mês já encerrado**. Peso ajustável na própria tela (Admin).
- **Admin**: pode excluir avaliações e observações lançadas (auditado), via padrão de exclusão da Operação.

## v1.7.0 — 2026-07-07
### Adicionado
- **Pessoas — Período de Experiência**: nova tela (`Pessoas → Período de Experiência`) que lista automaticamente os colaboradores com **até 90 dias de casa** (admissão vinda do RH), com barra de dias (X/90) e alerta quando faltam ≤15 dias. O gestor **aprova ou reprova** o período com **anotações**; a decisão notifica os Admins para avisar o RH. (1º bloco da Onda 3 — Pessoas/RH.)

## v1.6.0 — 2026-07-06
### Adicionado
- **Notas — aba Análise**: supervisores/admins têm uma aba de **análise/histórico** que filtra por **fornecedor, unidade e status**, com totais (nº de notas + valor).
- **Notas — devolução**: ao receber uma nota errada, dá para marcá-la como **Devolvida** (com o motivo) — novo status ao lado de Recebida/Paga/Problema.
- **Folgas/Férias — consolidado da equipe**: novo **/modulos/folgas-equipe** para gestores, com **período selecionável** e agrupamento por unidade. **Quem vê é configurável** em Configurações → Perfis de acesso (padrão: Supervisão/Admin/CEO). Atalho na aba Folgas da Minha área.

## v1.5.0 — 2026-07-06
### Adicionado
- **Comandas — seleção em lote**: na conferência em grade dá para **marcar/desmarcar uma faixa** de comandas de uma vez (ex.: sequências guardadas que não se confere todos os dias), além do "Marcar todas"/"Limpar".
- **Minha área — tarefas melhores**: agora dá para **editar e excluir** cada tarefa pessoal, e o horário do lembrete é escolhido em **passos de 30 minutos** (data + hora em lista).
- **Minha área — notas ricas**: o bloco de notas ganhou **título** (nomear a nota), **edição** e **texto formatado** (negrito, itálico, sublinhado, listas, subtítulo, link) — o mesmo editor dos POPs.
- **Pagamentos — filtros no histórico**: filtre por **tipo** (freelancer/hora extra/avulso), **unidade**, **status** e busca por **prestador/beneficiário**.
### Alterado
- **Metas — seletor de mês em lista**: a escolha do mês passou de botões para uma **lista suspensa** (mais compacta).
- **Consolidação de freelancers — filtros em lista**: mês e unidade agora são **listas suspensas** no lugar dos botões.

## v1.4.0 — 2026-07-06
### Adicionado
- **Manutenção (módulo novo)**: `/modulos/manutencao` com duas abas. **Chamados** — abra um chamado (o que precisa, equipamento, prestador, prazo) e acompanhe o status **Aberto → Em andamento → Concluído** (com custo e o que foi feito); painel com abertos, em andamento, atrasados, feitos no mês e custo do mês; supervisão avisada na abertura. **Preventiva** — planos recorrentes por equipamento (ex.: limpar a coifa a cada 30 dias); quando vencem, gerente e supervisão são avisados na Central de Notificações; "Registrar execução" agenda a próxima e guarda o histórico. Acessível também pela sub-aba Manutenção das Ocorrências. Admin exclui chamados e planos.
- **Cupons — relatório PDF/Excel**: botão "Relatório" na tela de Cancelamentos abre a visão do mês (por unidade) para exportar em **Excel** (cupons + ranking por operador) ou salvar em **PDF**.
- **Auditoria — export PDF/CSV**: botão "Relatório / Export" no Log de Auditoria, com filtro de período (7/30/90 dias) e módulo; salva em **PDF** ou baixa o **CSV** completo (com entidade, ID e IP).
- **Backup 3-2-1 agendado**: instalador `scripts/install-backup-task.ps1` registra a Tarefa Agendada `sgo-backup` (diária, 03:00) que roda o `backup-db.ps1` (dump do PostgreSQL + fotos, retenção e 2ª cópia opcional via `BACKUP_MIRROR_DIR`).
### Alterado
- **POPs — editor rico + blocos reordenáveis**: o conteúdo do POP agora é montado em **blocos** (Texto com **negrito/itálico/listas/subtítulo/link**, Checklist, Imagem e Vídeo), que podem ser **reordenados arrastando** (ou por ▲▼) e removidos individualmente.

## v1.3.3 — 2026-07-06
### Adicionado
- **Comandas — conferência em grade**: nova forma de conferir as comandas do dia direto no sistema, como no papel. O gerente vê **todas as comandas ativas em botões numerados** e vai **tocando em cada uma conferida** (fica verde). As **não marcadas** contam como faltando — ao confirmar, o sistema já **registra a contagem e alerta os supervisores** sobre as comandas ausentes (com observação obrigatória quando há falta). Tem contador ao vivo (conferidas/faltando), filtro por número e botões "Marcar todas"/"Limpar". Continua disponível o atalho "Todas presentes" e o lançamento manual de ausentes (recolhido).
### Alterado
- **Minha área para todos os usuários**: a aba **Minha área** (tarefas pessoais, notas e folgas) agora aparece para **todos os usuários** do sistema, individualmente — não só para os gerentes.
- **Notas recebidas — edição/exclusão restrita**: apenas **supervisores, administradores e CEO** podem **editar e excluir** notas já lançadas. Gerentes continuam lançando notas e marcando como Paga/Problema, mas não editam nem apagam.

## v1.3.2 — 2026-07-05
### Adicionado
- **Padrão de produtos por foto (IA)**: Admin cadastra em **Configurações → Padrão de produtos** os produtos que podem estar nas vitrines (nome + categoria + **foto de referência**). No checklist, nos itens com checagem por IA, o gerente tira a foto e o botão **"Conferir padrão de produtos (IA)"** aponta os itens **fora do padrão** da rede. Inerte sem chave de IA.

## v1.3.1 — 2026-07-05
### Adicionado
- **Desligamentos** (Pessoas): o gerente seleciona o colaborador e abre a solicitação de desligamento (tipo de aviso trabalhado/indenizado + justificativa + motivo). O sistema **puxa automaticamente** o tempo de empresa (admissão do RH) e os **atestados/dias afastados** lançados. Sobe para o **supervisor aprovar/recusar**; **relatório em PDF** para o RH. Idade é informada manualmente (o RH não fornece a data de nascimento).

## v1.3.0 — 2026-07-05
### Adicionado
- **Minha área (do gerente)**: nova aba no menu com **tarefas pessoais** (agenda simples; o sistema **lembra por notificação** na data/hora marcada), **bloco de notas** livre e **folgas/férias**. Nos dias de folga/férias, os **checklists não aparecem** na aba Tarefas do gerente (ele ainda entra no sistema).

## v1.2.3 — 2026-07-05
### Alterado
- **Fotos por item no checklist**: cada item que exige foto tem o **seu próprio botão de foto**, e na visão concluída as fotos aparecem **agrupadas sob o item** (antes ficavam todas juntas no fim, sem indicar de qual item eram). Fotos gerais (sem item) continuam numa seção "Outras fotos".

## v1.2.2 — 2026-07-05
### Adicionado
- **Recebimento de Gás por botijão (P45)**: além do granel (kg), agora dá para lançar por **botijão** — nº de botijões × kg por botijão (P45 = 45kg) + valor total, com **botijões devolvidos (troca)**. Converte para kg automaticamente, mantendo os dashboards e o alerta de variação de preço/kg.

## v1.2.1 — 2026-07-05
### Adicionado
- **Notas Recebidas — abrir/editar**: o gestor clica em "Ver/Editar" e ajusta fornecedor, CNPJ, número, datas, valor, produto e observação do lançamento.
- **Fornecedor digitado**: ao lançar uma nota com um fornecedor **não cadastrado**, sobe uma **pendência (notificação) para o supervisor/admin** cadastrarem em Fornecedores.

## v1.2.0 — 2026-07-04
### Adicionado
- **Freelancer — valor automático**: o pedido de pagamento calcula sozinho **horas × valor/hora do dia + vale transporte**. O valor/hora é cadastrado por **unidade × tipo de dia** (dia útil / fim de semana / feriado) em **Configurações → Valor do freelancer**, com **cadastro de feriados**. Campo de **vale transporte** e **observações** no pedido. Sem valor/hora cadastrado, cai no modo manual (com aviso).

## v1.1.3 — 2026-07-04
### Adicionado
- **Tolerância de tempo nos checklists** (Configurações → Checklists, Admin): concluir até N minutos após o horário-limite ainda conta **no prazo** (padrão **10 min**). Vale para todos os checklists.

## v1.1.2 — 2026-07-04
### Alterado
- **Ocorrências**: lista **agrupada por unidade** (cabeçalho por empresa) quando há mais de uma.
- **Notas Recebidas**: lista **agrupada por empresa** (fornecedor), com total por empresa.
- **Coleta de Óleo**: **filtro por unidade** no histórico (Todas + cada unidade).

## v1.1.1 — 2026-07-03
### Adicionado
- **Correções de checklist por período**: a tela de correções agora aceita um intervalo (De→Até) e **várias unidades / todas** (antes era só um dia e uma unidade).
- **Tarefas de hoje minimizáveis por unidade**: o mini-dashboard de cada unidade fica sempre visível e a lista de checklists recolhe (recolhida por padrão quando há várias unidades), para o gestor ver o resumo de todas de uma vez.

## v1.1.0 — 2026-07-03
### Alterado
- **Filtro de unidades padronizado (compacto)**: as listas largas de unidades viraram um seletor compacto. Histórico de checklists com **"Selecionar todas"** e **agrupado por unidade dentro de cada dia**; Metas, Treinamentos, Mapa de Funções, Desperdícios e Comandas com seletor compacto.

## v1.0.1 — 2026-07-03
### Corrigido
- **Treinamentos por setor**: POP não pode mais ser "inicial" e setorial ao mesmo tempo (aparecia para todos). Exclusividade reforçada; POPs de teste normalizados.
- **Mapa da unidade**: aviso claro quando há gente no quadro padrão mas sem escala (o mapa segue a Escala).
### Adicionado
- **Versão do app** no rodapé do menu e no login; `CHANGELOG.md`.

## v1.0.0 — 2026-07-02 (base em produção)
Primeira versão consolidada, já em uso pelos gerentes. Módulos entregues:

- **Dashboard** (gerente: meta/atalhos; CEO/Admin/Supervisor: semáforo/ranking/alertas).
- **Tarefas / Checklists** (geração por dia operacional, conclusão transacional, evidência fotográfica, conferência por IA, correções do dia, histórico).
- **Central de Comunicação** (leitura obrigatória, painel de leitura, conta na meta).
- **Desperdícios**, **Ocorrências**, **Comandas**, **Cancelamento de Cupons**, **Inventário** (Teknisa + Equipamentos), **Notas Recebidas** (QR/código de barras), **Recebimento de Gás**, **Coleta de Óleo**.
- **Pagamentos** (freelancer/HE/avulso, delegação, relatório de freelancers).
- **Pessoas**: Escala (planejado/realizado/comparação), Mapa de Funções (quadro padrão, mapa em tempo real/dia+hora/projeção, freelancers do dia), **Central de Atestados** (foto + IA, CID restrito ao RH, painel, relatório).
- **POPs** + **Treinamentos** (por setor, conta na meta).
- **Metas** (ranking, minha meta, histórico, export).
- **Auditoria**, **Configurações** (unidades, usuários, perfis de acesso, cadastros dos módulos, fornecedores, LGPD).
- **Central de Notificações** (sino + badges).
- **IA** (leitura de atestados e conferência de fotos de checklist) ligada em produção.
- Publicado em https://sgorestaurantesgbf.com.br (Docker + Cloudflare Tunnel), backup diário do banco.

## v1.0.1 — 2026-07-03 (correções)
### Corrigido
- **Treinamentos por setor**: POP marcado como "inicial" **e** com setor aparecia para todos os colaboradores. Agora "inicial" e "setorial" são **exclusivos** (escolher setor = não é inicial), reforçado no servidor e no editor de POP. Os 2 POPs de teste foram corrigidos para setoriais.
- **Mapa da unidade**: quando há gente no quadro padrão mas ninguém escalado, o aviso agora explica que o mapa segue a **Escala** e orienta a cadastrá-la (antes o mapa só ficava vazio sem explicação).
### Adicionado
- **Versão do app** visível no rodapé do menu e na tela de login; `CHANGELOG.md`.

## v1.1.0 — 2026-07-03 (padronização do filtro de unidades — parte 1)
### Alterado
- **Filtro de unidades compacto** no lugar das listas largas de "pills" que ocupavam a tela:
  - **Histórico de checklists**: filtro compacto com **"Selecionar todas"** (multi) e lista **agrupada por unidade dentro de cada dia**.
  - **Metas, Treinamentos, Mapa de Funções, Desperdícios, Comandas**: seletor de unidade compacto (dropdown único), preservando os demais filtros (mês/data).
- Componentes reutilizáveis: `UnitFilter` (multi + todas) e `UnitSelectNav` (único).

<!--
## v1.1.x — (em desenvolvimento)
### Próximos: Correções por período; agrupar por empresa em Ocorrências/Notas/Óleo;
### Tarefas de hoje minimizável por unidade; fotos por item no checklist.
-->
