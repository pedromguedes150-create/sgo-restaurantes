# Changelog — SGO Beija Flor

Registro das versões do aplicativo. Convenção de versão: **v{maior}.{menor}.{correção}**
- **correção** (x.y.**z**): ajustes de texto/tela, correção de bugs.
- **menor** (x.**y**.0): melhorias e novas funções dentro de módulos existentes.
- **maior** (**x**.0.0): módulo novo grande / mudança estrutural.

A versão em uso aparece no rodapé do menu e na tela de login.

---

## v1.41.0 — 2026-07-23 (Gás dentro de Notas Recebidas · vencimentos · dashboard de gás corrigido)
### Adicionado
- **Gás absorvido por Notas Recebidas**: o cadastro de fornecedor ganhou o marcador **"fornecedor de gás"**; ao escolher esse fornecedor no lançamento da nota, os campos viram os de **gás** (granel kg/preço ou botijão) + **vencimento do boleto**, e o lançamento alimenta a análise de gás. Nova aba **"Análise de gás"** dentro de Notas (dashboard, histórico, contratos e link do relatório de variação). O módulo "Recebimento de Gás" saiu da barra lateral — a rota `/modulos/gas` **redireciona** para Notas Recebidas.
- **Acompanhamento de vencimentos** (aba "Vencimentos" em Notas): lista os boletos **a vencer** (notas comuns + gás) com **filtros** (unidade, fornecedor, janela de dias, incluir vencidos) e destaque dos mais próximos. Um alerta diário avisa **a supervisão (supervisor+coordenador+admin) e o Financeiro** dos boletos que vencem em até 3 dias, sem repetir (`dueAlertedAt`). `src/lib/notes/due.ts`, `/api/notes/due`, job no scheduler.
### Corrigido
- **Dashboard de gás não variava com os filtros** — o filtro de mês nunca casava (regex sem barras) e o dashboard era montado ignorando unidade/fornecedor/mês. Agora os filtros afetam os números; adicionado o **volume comprado (kg)** por unidade e por fornecedor.
- Migração `20260723130000_gas_in_notes` (Supplier.isGas, GasReceipt.dueDate, dueAlertedAt em notas e gás).

## v1.40.0 — 2026-07-23 (Troco: solicitação + histórico + troca no caixa · busca no guia · onboarding)
### Adicionado
- **Colaboração no GitHub**: `.env.example` atualizado (VAPID/Caddy, aviso de valores de DEV) e novo **`docs/setup-dev.md`** (onboarding de colaboradores: clone → env → banco → rodar → PR).
- **Regra permanente** — "supervisor/coordenador/administrador" nas conversas = perfis **SUPERVISOR + COORDINATOR + ADMIN**. Helper `SUPERVISORY_ROLES`/`isSupervisory` + `notifySupervisory`.
- **Gestão de Troco — Solicitação de troco**: o gerente pede troco/moedas à supervisão pelo botão "Solicitar troco"; os três perfis são **notificados** e veem os pedidos abertos **destacados** ao abrir a aba (na unidade e na rede). Atender/cancelar; o solicitante é avisado quando atendido (`CashChangeRequest`).
- **Gestão de Troco — Troca no caixa**: para unidades **sem baldes** (ex.: Nova União), registra a troca de dinheiro feita direto no cofre com o caixa (movimento `REGISTER_CHANGE`, troca 1:1), com histórico.
- **Gestão de Troco — Histórico**: aba com **filtros completos** (tipo, usuário, período, valor mín/máx) e **ordenação** (data/valor), com totais de entradas/saídas.
- **Filtros padronizados**: componente `FilterBar` (compacto e responsivo) que corrige os filtros grandes/desfigurados — estreia no histórico do troco e será adotado nas demais telas.
- **Treinamento da Plataforma**: **barra de busca inteligente** (autocomplete, ignora acento, multi-termo) que filtra os guias em tempo real.

## v1.39.0 — 2026-07-22 (Conferência de comandas por leitor de código de barras)
### Adicionado
- **Perfil CAIXA** (`Role.CASHIER`, rótulo "Caixa"): login próprio criado em Configurações → Usuários. Nasce **fechado** — vê só Comandas e o Treinamento da Plataforma (novo `DEFAULT_ALLOW_ONLY` em `permissions.ts`; o Admin ainda pode liberar mais na matriz). Ao entrar, cai direto na conferência.
- **Conferência por leitor** (`/modulos/comandas/conferencia`, botão "📷 Conferir com leitor" na tela de Comandas): campo focado que recebe a bipagem (o leitor age como teclado, digita o código e dá Enter), contadores **conferidas / ativas / faltando** em tempo real, "Desfazer última", leituras repetidas sinalizadas ("já bipada") e código fora da sequência **avisado com o valor lido** em vez de aceito em silêncio. Substitui os 600+ toques da grade manual.
- Ao concluir: **faltantes = ativas − bipadas**, reaproveitando `submitCount` — mesmas divergências, mesmo alerta imediato ao supervisor, sem lógica paralela.
- **Cruzamento antifraude (itens 3 + 4)**: as faltantes são cruzadas com a **última análise de "Comandas em Aberto"** da unidade; comanda que sumiu da bandeja **E** está aberta com valor no Teknisa aparece destacada com data/hora e valor — o padrão da fraude das "2 comandas", pronto para o monitoramento buscar a câmera.
- `src/lib/commands/barcode.ts` (parser **tolerante**: número puro, zeros à esquerda, prefixos, EAN-13 com dígito verificador — só aceita palpite que exista na sequência ativa, nunca inventa comanda), `src/lib/commands/scan.ts`, `/api/commands/scan`, migração `20260722200000_cashier_role`. 12 testes novos.
- ⚠️ O parser será **calibrado** quando chegar 1 exemplo real do código de barras da comanda da rede.
### Corrigido
- **Servidor não subia com o push ligado** (pego na verificação em instância local, antes de qualquer deploy): o scheduler (`src/instrumentation.ts`) importa a Central de Notificações, que agora carrega `web-push`; o Next compila a instrumentação **também para o runtime edge**, onde `http`/`https` do Node não resolvem — o app respondia 500 em todas as telas. `next.config.mjs` passou a marcar `web-push` como externo no bundle edge (onde o `register()` já sai na primeira linha).

## v1.38.0 — 2026-07-22 (Notificações no celular — PWA + Web Push)
### Adicionado
- **App instalável (PWA)**: manifesto, ícones da marca (bordô + "BF") e service worker. No Android dá para "Instalar aplicativo"; no iPhone, "Adicionar à Tela de Início" (pré-requisito do push no iOS).
- **Notificações no celular (Web Push/VAPID)**: em **Meu Perfil → Notificações no celular**, o usuário ativa o aviso **em cada aparelho**; a notificação chega **com o app fechado** e, ao tocar, abre direto na tela do assunto. Envia teste, lista "Meus aparelhos" (com remoção) e **preferências por categoria** (Tarefas e metas, Comunicados, Ocorrências e manutenção, Operação do dia, Pessoas e escala, Gerais) — avisos **críticos ignoram a preferência**.
- O push é um **canal extra plugado na Central de Notificações**: todo aviso que já existia (`notifyUsers`/`notifyRole`/`notifyAdmins`/`notifyUnitRole`) passa a sair também no aparelho, sem mudança nos módulos. O registro no sino 🔔 continua sendo criado mesmo se o push falhar.
- Inscrições mortas (aparelho trocado/app desinstalado) são **removidas automaticamente** (404/410 do serviço de push ou 5 falhas seguidas).
- `src/lib/push/*` (send/manage/categories), `/api/push` + `/api/push/key`, models `PushSubscription`/`PushPreference`, migração `20260722190000_web_push`, `scripts/gen-vapid.mjs` e `scripts/gen-icons.mjs`. **Inerte sem as chaves** `VAPID_*` no `.env` (o sistema segue igual, só in-app). 10 testes novos.

## v1.37.0 — 2026-07-22 (Antifraude de cancelamentos + relatórios de comandas)
### Adicionado
- **Cancelamentos → Análise antifraude (PDF)** (Supervisão/Admin): sobe o **PDF** "Vendas/Itens Cancelados no Período" (Teknisa) e o SGO analisa por **caixa (terminal)**, por **autorizador (SUPERVISOR)**, por **horário** e **valor**, com **alertas automáticos** (concentração ≥50% do valor num caixa/autorizador, valor médio muito acima da mediana, cancelamentos altos, pico de horário) + maiores cancelamentos + histórico. `src/lib/cancellations/fraud-analysis.ts` (parser via pdf-parse), model `CancellationAnalysis`.
- **Comandas em aberto**: **relatório A4 dedicado para o Monitoramento** (corrige o "Imprimir" que saía desfigurado) + **Consolidado da rede para o Administrativo** (comandas a travar por unidade e data, imprimível). Histórico já existente.

## v1.36.0 — 2026-07-21 (Módulo Solicitação de Produtos — Fase 1)
### Adicionado
- **Solicitação de Produtos (Fábrica/CD)**: catálogo (`Configurações → Catálogo de Produtos`, CRUD + **import/export Excel**); **pedido mobile** com **busca inteligente** (ignora acento), agrupado por categoria e quantidade por item; ao enviar, o sistema **separa automaticamente em Fábrica e CD** (gera 1 pedido por destino). **Meus pedidos** com status (Novo→Em separação→Enviado→Recebido) e **confirmação de recebimento** pelo gerente; **visão Fábrica/CD** (Supervisão/Admin) move os status e imprime a separação. `src/lib/products.ts`, models `Product`/`ProductRequest`. Fábrica/CD por e-mail entra na fase seguinte.

## v1.35.0 — 2026-07-21 (Higiene dos banheiros — QR + notificação + análise)
### Adicionado
- **Módulo Higiene dos banheiros**: QR do banheiro aponta para uma **página pública** (`/higiene/<unidade>`, sem login) onde o cliente escolhe o banheiro, o problema e uma avaliação e envia — o **gerente é notificado na hora** (in-app). Módulo interno com **análise** (solicitações, em aberto, tempo médio de resposta, horário de pico, banheiros com mais pedidos), **resolver** solicitação, **cadastro de banheiros** e o **link do QR** por unidade. Substitui o antigo Forms→WhatsApp; **WhatsApp fica para a fase 2** (Evolution API do CEO). `src/lib/hygiene.ts`, models `HygieneLocation`/`HygieneRequest`.

## v1.34.0 — 2026-07-21 (Antifraude: análise de comandas em aberto)
### Adicionado
- **Comandas → Análise de comandas em aberto** (Supervisão/Admin): sobe o relatório do Teknisa (.xlsx/.csv) e o SGO destaca **comandas abertas com valor e data de abertura anterior ao corte** (possível fraude das "2 comandas") — nº, data/hora, dias em aberto, valor e itens; ordena pelas mais antigas; imprimível para o monitoramento buscar câmeras. Histórico das análises por unidade. `src/lib/commands/open-analysis.ts`, `OpenCommandAnalysis`.

## v1.33.0 — 2026-07-21 (Painel resumo da unidade — reunião supervisor×gerente)
### Adicionado
- **Painel da unidade** (`/modulos/painel-unidade`, Supervisão/Admin): uma tela por unidade+mês para a reunião com o gerente — **performance** (meta, uso, checklists, desperdício), **preenchimento operacional** (checklists concluídos/atrasados/não realizados, cobertura de comandas/desperdício, notas, movimentos do cofre, ocorrências) e **detalhamento da meta**. Seletor de unidade/mês + **Imprimir/PDF**. Reaproveita os números de `getUsageBoard`/`getMetaBreakdown` (sem divergência). Link na Rotina do Supervisor.

## v1.32.0 — 2026-07-21 (Comunicados em tela cheia ao abrir o app)
### Adicionado
- **Comunicados pendentes aparecem em TELA CHEIA ao abrir o app** (como um anúncio): o gerente lê e **confirma ali mesmo**. Um por vez (urgentes/fixados primeiro), com anexos e, quando exigido, campo de resposta. "Ver depois" pula sem confirmar. `/api/communications/pending` + `CommunicationInterstitial` no layout.

## v1.31.0 — 2026-07-21 (Calendário de gerentes + Resumo de checklists)
### Adicionado
- **Calendário de gerentes**: nova **grade semanal por horário** (linha de horas à esquerda) mostrando o **nome dos gerentes** em cada faixa e destacando em vermelho as **horas sem gerente**; nomes também nas células do mês; **alerta na aba** para gerentes 7+ dias sem folga (além da notificação a supervisores E admins); botão **"Todos os dias"** (gerente sem folga fixa marca a folga depois).
- **Configurações → Checklists → aba "Resumo por unidade"**: **matriz checklist × unidade** (✓ habilitado; âmbar = checklist comum faltando na unidade) + busca + filtro "só possíveis faltas" + total por unidade. Ajuda o supervisor a achar checklists faltando.

## v1.30.0 — 2026-07-21 (Pagamentos: admin/CEO podem se autoaprovar)
### Alterado
- **Autoaprovação de pagamentos** liberada para **ADMIN/CEO** (decisão do Pedro). Demais perfis seguem com a segregação de funções (quem lança não aprova o próprio). Investigação do caso Jefferson documentada em `docs/antifraude-e-automacoes.md`.

## v1.29.0 — 2026-07-21 (Troco: editar/excluir baldes)
### Adicionado
- **Gestão de Troco → baldes dos caixas**: Supervisão/Admin agora **editam o nome E o valor-alvo** (antes só o valor) e podem **excluir o balde inteiro** (o histórico de movimentos preserva o nome). Auditado.

## v1.28.0 — 2026-07-21 (pacote 20/07 — bloco 3.1: Admin cadastra horário do gerente)
### Adicionado
- **Admin/CEO cadastram o horário de qualquer gerente** direto no **Calendário de gerentes** (botão "Editar horário" em cada gerente): marca os dias + horário e salva (auditado). Antes só o próprio gerente podia; agora o admin também preenche por eles.

## v1.27.0 — 2026-07-21 (pacote 20/07 — bloco 3: Controle de gerentes)
### Adicionado
- **"Folgas da equipe" → "Controle de gerentes"** (nova nomenclatura na sidebar e no módulo).
- **Horário de trabalho do gerente** (padrão semanal): cada gerente cadastra em **Minha área → Folgas / férias** os dias que trabalha + horário.
- **Calendário de gerentes** (nova aba): visão mensal por unidade da cobertura de gerência (padrão semanal − folgas/férias). **Dias sem nenhum gerente ficam em vermelho** ("buraco de gerência") para o supervisor realocar reservas; badges de dias sem cobertura e gerentes sem horário.
- **Alerta automático ao supervisor** quando um gerente **não lança folga há 7+ dias** (scheduler diário, anti-spam de 7 dias).

## v1.26.0 — 2026-07-20 (pacote 20/07 — bloco 2: Pagamentos por dia/unidade + detalhes)
### Alterado
- **Pagamentos — todas as abas** (Minhas, Para Aprovar, Pagar, Histórico): lançamentos **agrupados por DIA e por UNIDADE** (dia mais recente primeiro, total do dia no cabeçalho) para a conferência do supervisor.
- **Clicar na solicitação abre os detalhes completos** (freelancer+PIX, cobertura de setor, dia/horário/horas, VT, motivo, beneficiário/fornecedor, observações, quem aprovou/pagou e quando, anexo) — em qualquer aba.

## v1.25.0 — 2026-07-20 (pacote 20/07 — bloco 1: Tarefas N/A + Notificações + Gás)
### Adicionado
- **Checklist: "Não se aplica" (⚪)** — 4ª opção por item, neutra (não gera ocorrência, não entra em correções).
- **Histórico de checklists recolhível** — cada dia abre/fecha (o mais recente aberto); em modo de exclusão fica aberto.
- **Notificações com filtros por tipo** — chips Todas / 💳 Pagamentos / 👥 Pessoal / 🍽️ Operação / Outros (com contagem).
- **Gás: editar lançamento** (kg + valor) por erro de digitação do gerente — Supervisão/Admin, recalcula preço/kg; **não interfere na meta** (só a edição de DATA penaliza).

## v1.24.0 — 2026-07-20 (ajustes pós-revisão do Pedro)
### Corrigido / Ajustado
- **Ocorrências (lista "Todas")**: cards agora mostram a **data/hora de criação**; unidades vêm **recolhidas** (abre ao tocar); nova **barra de busca** (nº, tipo, categoria, descrição) e **filtros no topo** (unidade + gravidade).
- **Desperdício — Lanchonete** passa a ser lançada em **UNIDADES** (não kg), com **sub-itens por tipo de salgado** somando o total. (A funcionalidade já existia desde a v1.19; faltava a categoria estar marcada como "un" — corrigido no dado + seed.)
- **Notas recebidas**: ordenação por **data de lançamento (mais recente primeiro)** confirmada no ar — antes a produção rodava uma imagem antiga.
- **Pagamentos — cobertura de setor do freelancer**: recurso confirmado no ar; o seletor aparece assim que houver **setores+valores cadastrados** para o freelancer (Configurações → Pagamentos).

## v1.23.0 — 2026-07-16 (pacote 16/07 — bloco 7: Central da Meta + Simulação do Mapa)
### Adicionado
- **Configuração da Meta centralizada** (`Metas → Configuração da Meta`; Admin edita, Supervisão visualiza): TODOS os componentes num lugar só — Checklists (peso por checklist), **NOVOS componentes diários "Desperdício" e "Comandas"** (cobertura mensal: dias preenchidos ÷ dias decorridos — sem preenchimento o % cai; **nascem com peso 0**), Comunicados, Treinamentos, Avaliações da equipe e a **penalidade por correções da supervisão** (fora do prazo).
- **Mapa de Funções — simulação salvável**: ao ver um **dia futuro** na projeção, o gerente monta uma **simulação de alocação** (quem fica em qual setor naquele dia) e **salva** — sem alterar o quadro padrão; a simulação salva reaparece ao voltar na data.

## v1.22.0 — 2026-07-16 (pacote 16/07 — bloco 6: Troco reformulado como COFRE)
### Alterado
- **Gestão de Troco reformulada** (modelo correto confirmado pelo Pedro + foto): agora é um **COFRE por unidade** com saldo **por denominação** (valor em R$ de cada nota/moeda, como a folha do gerente — 200/100/50/…/0,05 + "Outros") que alimenta os **baldes dos caixas** (valor-alvo fixado pela supervisão).
### Adicionado
- **Conferência diária**: lança a contagem completa por denominação (substitui o saldo; primeira contagem = posição inicial).
- **Reposição de balde**: registra o que **saiu** do cofre (miúdos) e o que **entrou** (notas grandes do balde) — troca 1:1 validada.
- **Troca com o escritório**: envia notas grandes, recebe moedas/miúdos (mesmo valor, validado).
- **Retirada para pagamento (PROIBIDA)**: dá para registrar em emergência, mas em **vermelho com aviso forte** — supervisão e admins avisados **na hora** (trava total virá depois, como combinado).
- **Indicador "hora de pedir troca"**: % de notas grandes no cofre (alerta ≥50%).
- Painel da rede (Supervisão): cofres e **retiradas proibidas do mês por unidade**; Visão Executiva e Painel de Uso atualizados para o novo modelo.

## v1.21.0 — 2026-07-16 (pacote 16/07 — bloco 5: Contratos de Gás)
### Adicionado
- **Gás — Contratos por unidade+fornecedor**: nova aba **Contratos** no módulo (Supervisão/Admin gerenciam): período, **quantidade (kg)** e **preço/kg acordados**, com espaço para lançar a **posição atual** de contrato que já estava andando ("já comprado"). A **baixa é automática** pelos recebimentos lançados da unidade+fornecedor dentro do período.
- **Gás — Dashboard**: **% cumprido de cada contrato vigente** (barra verde/âmbar/vermelha) + **filtros de unidade, fornecedor e mês** com o total **comprado no filtro** (kg, R$ e nº de recebimentos).
- **Gás — Histórico com filtros**: busca + unidade + fornecedor sobre todos os lançamentos.

## v1.20.0 — 2026-07-16 (pacote 16/07 — bloco 4: Checklist↔Ocorrência)
### Adicionado
- **Checklist — problema em aberto sinalizado**: quando um item "A corrigir" gera uma ocorrência, os checklists dos **dias seguintes mostram o aviso** "⚠ Problema em aberto desde DD/MM (ocorrência nº X)" naquele item, **sem criar pendência nova todo dia** — o aviso some quando a ocorrência é encerrada.
- **Ocorrências — fases de andamento**: timeline "Andamento" na ocorrência — registre cada fase (técnico acionado, peça pedida…) até o encerramento; cada registro guarda autor e horário.
- **Ocorrências — reclassificar**: mude o **tipo/categoria** de qualquer ocorrência aberta (inclusive as geradas pelo checklist) — tipos de Manutenção/TI movem a ocorrência para a sub-aba correspondente.

## v1.19.0 — 2026-07-16 (pacote 16/07 — bloco 3: Pagamentos + Desperdícios)
### Adicionado
- **Pagamentos — cobertura temporária de setor** (freelancer): o Admin cadastra no freelancer os **setores com valor por DIA** (Configurações → Pagamentos → editar freelancer); no lançamento, o gerente marca "Cobertura temporária de setor", escolhe o setor e o valor sai **automático** (valor do dia + VT opcional).
- **Pagamentos — vale-transporte na Hora Extra**: campo VT opcional que soma ao total.
- **Consolidação de freelancers — fechamento semanal**: além do mês, escolha uma data e o relatório fecha a semana **segunda → domingo** (pelo dia do trabalho), como o pagamento de segunda-feira. Excel idem.
- **Desperdícios — categoria em UNIDADES com sub-itens**: categoria pode ser **kg** ou **un** (Configurações → Desperdícios). Categorias em "un" (ex.: lanchonete) ganham **sub-itens por produto** (nome + quantidade) com **soma total automática**.

## v1.18.0 — 2026-07-16 (pacote 16/07 — bloco 2: Notas + Comandas)
### Alterado
- **Notas — aba "Notas" reformulada**: lista por **data de lançamento (mais nova → mais antiga)**, sem agrupamento por fornecedor; **filtros completos** (busca por fornecedor/nº/CNPJ/produto/obs/valor, fornecedor, unidade, status, período); **padrão últimos 60 dias** (troca no filtro: 90/180/365).
- **Notas — sem botão "Paga"**: pagamento é controlado no Teknisa; aqui fica só recebimento/**problema**/**devolução** (o status "Paga" antigo permanece como legado nos filtros).
- **Notas — fornecedor SÓ da lista de cadastrados** ao lançar (acabou a digitação livre; a tela orienta pedir cadastro ao Admin quando faltar).
- **Notas — Análise completa**: mesmos filtros da lista + totais + **campos completos** (CNPJ, emissão, produto, obs, problema) + **editar/excluir** para Supervisão/Admin + **Excel e Imprimir/PDF** (`/api/notes/export`).
- **Notas — meta**: além da correção de data, **nota lançada pela Supervisão/Admin** (gerente esqueceu) agora também desconta na meta (marcada em vermelho no card).
- **Comandas — grade com 3 estados**: toque 1× = **conferida** (verde), 2× = **em uso** (azul — com cliente, conta como presente), 3× = limpa; não marcadas viram **apuração**. Comandas **em apuração ou perdidas saem da grade** (tratadas no bloco de Divergências).

## v1.17.0 — 2026-07-16 (pacote 16/07 — bloco 1)
### Corrigido
- **Celular — módulos que não apareciam**: a página "Módulos" (navegação do celular) estava desatualizada — agora espelha o menu do computador: **Minha área, Folgas da equipe, Rotina do Supervisor, Visão Executiva, Treinamentos, Gestão de Troco e Ajuda** entraram, agrupados como no desktop e respeitando a matriz de Perfis.
- **Túnel de publicação — proteção**: criado watchdog que verifica a cada 5 minutos se o túnel Cloudflare está vivo e o religa sozinho (causa da queda de 13→14/07: o processo encerrou quando a internet caiu e nada o reiniciava). Desfazer: `schtasks /Delete /TN "sgo-tunnel-watchdog" /F`.
### Adicionado
- **Meu Perfil** (toque no seu nome/avatar no topo): o próprio usuário completa **nome completo e CPF** e **troca a própria senha** (exige a atual). Supervisor/CEO ganham **visualização dos usuários** (Configurações → Usuários, sem edição).
- **Escala — status "Atraso" (AT)** no Realizado: colaborador trabalhou mas chegou atrasado — segue aparecendo no Mapa do dia e o atraso entra automaticamente nos **Avisos ao RH** (conferência de ponto). *(Verificado também: atestado lançado já ajusta a Escala automaticamente — nenhuma correção necessária.)*

## v1.16.0 — 2026-07-08 (pacote 07/07 — parte 2: Pessoas + Integrações RH)
### Adicionado
- **Central "APIs & Integrações"** (`Configurações → APIs & Integrações`, Admin/CEO): tudo que o SGO consome e expõe — API do RH (status/chave mascarada), **endpoints de recepção RH→SGO** (URLs prontas para colar no painel do RH + token), **webhook de férias SGO→RH** (destino + token para combinar com o RH) e os **últimos eventos** de integração. Toda nova API entra aqui.
- **Recepção RH→SGO**: endpoints `/api/integracoes/rh/{inclusao|desligamento|periodo-aquisitivo|exclusao-periodo}` com token Bearer. Admissão cria/reativa colaborador (por CPF/matrícula) e vincula à unidade; desligamento inativa por CPF; períodos aquisitivos ficam registrados. **O sync automático atual continua intocado.**
- **Webhook de férias SGO→RH**: solicitar férias (planejamento) e excluir férias (cancelamento) agora avisam o RH automaticamente no endereço da doc (inerte até o token ser colado no painel do RH; disparos registrados na central).
- **CPF no cadastro**: o sync do RH agora grava o CPF do colaborador (base do casamento de eventos de desligamento).
- **Escala — Avisos ao RH**: toda variação lançada no Realizado (falta, atestado, férias…) gera um **aviso automático registrado**, com tela de **relatório por período** (`Escala → Avisos ao RH`); quando a API do RH aceitar estes eventos, passam a ser enviados na hora.
- **Avaliação do colaborador — filtro de unidade** na barra (para quem tem mais de uma unidade).
- **Comissões & Mobilidade — histórico ao lançar**: ao escolher o colaborador, aparecem os últimos lançamentos dele com a **variação de valor** (verde/vermelho).

## v1.15.0 — 2026-07-08 (pacote de ajustes 07/07 — parte 1)
### Adicionado
- **Ocorrências — segmento TI**: nova sub-aba **TI** (igual à de Manutenção): tipos marcados como "TI" em Configurações → Ocorrências aparecem separados, preparado para a futura integração com sistema de gestão de TI.
- **Lançamento fora do prazo (conta na meta)**: em **Pagamentos, Notas, Gás e Óleo**, a data da solicitação aparece no lançamento e o histórico é ordenado da mais nova para a mais antiga. **Admin/Supervisor podem corrigir a data** quando o gerente esqueceu de lançar — cada correção marca o lançamento, avisa o gerente e **desconta % na meta do mês** (padrão 2%/lançamento, ajustável pelo Admin na tela de Metas). Linha "Fora do prazo" aparece no detalhamento da meta.
- **POPs nos Treinamentos**: abrir um POP a partir de Treinamentos agora é **só visualização** (sem editor) e o botão vira "Confirmar leitura e marcar treinado" — confirma a leitura E completa o treinamento de uma vez.
### Alterado
- **Manutenção saiu da sidebar** — acesso via Ocorrências → sub-aba Manutenção (que já leva a chamados e preventivas).
- **Configurações — Checklists unificados**: Checklists das unidades, Biblioteca de modelos e Checklists de supervisor agora são **uma página com 3 abas** (menos botões nas Configurações).
### Removido
- **Unidades de teste** (Beija Flor Centro, Orla e Shopping) excluídas com todos os históricos vinculados (backup 3-2-1 feito antes; auditado). 11 unidades reais intactas.

## v1.14.0 — 2026-07-08
### Adicionado
- **Novo módulo: Visão Executiva** (`Gestão → Visão Executiva`, restrito a CEO/Admin por padrão): a rede inteira em uma tela por mês — cartões consolidados (meta média, uso do sistema, desperdício total, dias de atestado, divergências de troco, custo de manutenção, ocorrências graves, visitas de supervisão) + **tabela por unidade** ordenada pela meta, com semáforo de uso. Botão **Imprimir/PDF** para reunião de diretoria. Tudo composto do que os módulos já calculam (mesmos números das telas de origem).

## v1.13.0 — 2026-07-08
### Adicionado
- **Recorrência de visitas** (Rotina do Supervisor): defina por unidade "visitar a cada N dias" — concluir uma visita reagenda a próxima automaticamente; visita **vencida gera aviso diário** ao supervisor da unidade + Admins (0 = desliga).
- **Resumo semanal de aderência (automático)**: 1×/semana o sistema avalia os últimos 7 dias de cada unidade (dias sem desperdício/comandas, checklists < 70%) e **cobra sozinho**: supervisor da unidade recebe o alerta e os Admins um consolidado.
- **Exports Excel/CSV dos módulos novos**: Gestão de Troco (`/api/cash/export`), Comissões & Mobilidade (`/api/people/payouts/export`, com total) e Visitas do Supervisor (`/api/supervision/export`, com feedback e itens não OK) — botão "Excel do mês" nas telas.
- **+15 testes** (62 no total): cadeia do troco (divergência, um caixa por vez, fechamento transacional) e regras da avaliação na meta (peso 0 padrão, mês corrente não penaliza).

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
