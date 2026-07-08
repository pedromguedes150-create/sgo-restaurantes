# Relatório da noite — 07→08/07/2026 (pacote de atualizações do Pedro)

> Trabalho autônomo executado durante a madrugada, conforme autorizado.
> **App em produção: v1.16.0** · CEO intacto (307) em todos os deploys · backup 3-2-1 feito ANTES da exclusão de dados.

---

## ✅ O QUE FOI FEITO (por item do seu pacote)

### 1. Ocorrências — segmento TI ✅ (v1.15.0)
Sub-aba **TI** dentro de Ocorrências, exatamente como a de Manutenção: marque um tipo como "TI" em Configurações → Ocorrências e as ocorrências dele aparecem separadas. Preparado para a futura API do sistema de gestão de TI (mesma base que usei na integração do RH).

### 2. Manutenção fora da sidebar ✅ (v1.15.0)
Removida do menu lateral. Acesso continua por Ocorrências → sub-aba Manutenção (com o atalho para chamados e preventivas).

### 3. Unidades de teste excluídas ✅
**Beija Flor Centro, Orla e Shopping** apagadas com todos os históricos vinculados + 3 colaboradores de teste exclusivos delas, em transação única e auditado. **Backup 3-2-1 rodado antes** (local + Google Drive). As 11 unidades reais estão intactas.

### 4. Data da solicitação + edição penalizada ✅ (v1.15.0) — Pagamentos, Notas, **Gás e Óleo**
- Data da solicitação visível nos lançamentos; histórico ordenado da mais nova para a mais antiga.
- **Admin/Supervisor** têm o botão **"Editar data"** nos 4 módulos.
- Cada correção: marca o lançamento em vermelho ("Data corrigida por X — desconta na meta"), **avisa o gerente** e **desconta % na meta do mês** — `LATE_ENTRY_PENALTY_PCT`, **padrão 2% por lançamento**, ajustável por você na tela de Metas (caixinha nova, só Admin).
- O detalhamento da meta ganha a linha "Fora do prazo (−X%)".

### 5. Folgas/férias da equipe ✅ (verificado, nada a mudar)
Conferi a matriz de permissões na produção: **não há liberações extras** — o módulo já aparece só para Supervisor, Admin e CEO (padrão restrito). Gerente/Coordenador/Financeiro não veem.

### 6. POPs nos Treinamentos ✅ (v1.15.0)
Abrir um POP a partir de Treinamentos agora é **só visualização** (o editor não aparece, nem para Admin) e o botão vira **"Confirmar leitura e marcar treinado"** — confirma a leitura e completa o treinamento numa ação só, voltando para a tela de Treinamentos.

### 7. Auditoria da meta ✅ (diagnóstico — nada alterado nas notas)
O que conta hoje na meta, unidade a unidade:
| Componente | Estado |
|---|---|
| Checklists (peso por template `entersMeta`) | ✅ ativo |
| Treinamentos (POPs) | ✅ ativo — peso padrão **15** |
| Comunicados | ✅ ativo — peso padrão **10** |
| Avaliações da equipe | ✅ integrado com **peso 0** (como você decidiu — liga quando quiser) |
| **NOVO:** Lançamentos fora do prazo | ✅ desconto 2%/lançamento (padrão) |

**⚠️ Achado importante:** *nenhuma unidade* tem checklist de **Desperdício** ou **Comandas** marcado como "entra na meta" — ou seja, hoje esses dois módulos diários **não pontuam** na meta de nenhuma unidade. E 4 unidades (KM13, Nova União, Santo Antônio, Vespasiano) têm **zero templates ativos**. Recomendo gerar os checklists via Configurações → Checklists → "Modelos prontos" nessas unidades. **Não criei sozinho** — depende de quais unidades operam cada módulo.

### 8. Configurações — checklists unificados ✅ (v1.15.0)
**Uma página com 3 abas**: Checklists das unidades · Biblioteca de modelos · Checklists de supervisor. Os endereços antigos redirecionam (a impressão de modelos continua funcionando). Dois botões a menos nas Configurações.

---

## 🔌 INTEGRAÇÕES RH (v1.16.0) — o que descobri e o que construí

### Diagnóstico do Período de Experiência (2 × 30+) — **o problema é a API do RH**
- A API retorna **667 ativos**, mas as admissões mais recentes são de **09/04/2026** — exatamente na borda dos 90 dias. **Ninguém admitido nos últimos ~3 meses aparece na API.**
- Pelo dado da API, só existem **3** colaboradores em experiência no grupo TODO (2 na Moreira + 1 num posto que nem é unidade SGO) → o SGO mostrando 2 está **correto**.
- **Ação sua:** pedir à equipe do RH para corrigir o endpoint `/api/ext/colaboradores` (não traz admissões novas). Alternativa: quando você apontar o "envio automático" do RH para os endpoints novos do SGO (abaixo), as admissões passam a chegar por evento e o problema morre.
- A planilha que você citou **não veio anexada** — se quiser, me manda que eu cruzo com a API.

### Envio automático RH→SGO — endpoints construídos ✅
O destino configurado hoje no painel do RH **não é o nosso SGO** (as respostas da fila têm IDs numéricos; os nossos são texto). Construí a recepção completa:
- `POST /api/integracoes/rh/inclusao` — cria/reativa colaborador (CPF/matrícula) e vincula à unidade pela razão social
- `POST /api/integracoes/rh/desligamento` — inativa por CPF (mesma semântica das mensagens da fila do RH)
- `POST /api/integracoes/rh/periodo-aquisitivo` e `/exclusao-periodo` — registrados (períodos aquisitivos ainda não são modelados no SGO)
- Autenticação: `Authorization: Bearer <RH_INBOUND_TOKEN>` — token gerado, visível (mascarado) na central.
- Tudo fica logado e visível na central. **O sync automático atual não foi tocado** — continua rodando normal.
- **Ação sua:** colar as URLs + token no painel do RH (estão prontas em Configurações → APIs & Integrações). Se o payload deles divergir do que deduzi pelas mensagens da fila, me manda 1 exemplo que eu ajusto em minutos.

### Webhook de férias SGO→RH ✅
Solicitar férias (planejamento) e excluir férias (cancelamento) já disparam para `https://gbf-rh.replit.app/api/integracoes/sgo/ferias`. **Inerte até você colar o `SGO_WEBHOOK_TOKEN`** (gerado por mim) no campo do token no painel do RH — o valor está na central (e completo no `.env`). Disparos ficam registrados na central com o retorno do RH.

### Central "APIs & Integrações" ✅ (seu pedido da madrugada)
`Configurações → APIs & Integrações`: TUDO num lugar só — API do RH (status/chave mascarada), URLs de recepção prontas para copiar, webhook de férias com token, e os **últimos 25 eventos** de integração. **Toda nova API que eu criar entra registrada aí.**

### Escala — Avisos ao RH ✅
Toda variação lançada no Realizado (falta, atestado, férias…, exceto trabalho/folga normais) gera **aviso automático registrado**. Nova tela `Escala → Avisos ao RH`: relatório por período e unidade, agrupado por colaborador, com status "Registrado"/"Enviado ao RH". Quando o RH aceitar esses eventos via API, é plugar o envio (estrutura pronta, campo `sent`).

### Sua visão da Escala (planejado → realizado → comparação)
Confirmo que o fluxo que você descreveu **é o que existe**: gerente cadastra o padrão → Planejado gerado → Realizado editável por cima do planejado → Comparação consolida o mês. O que faltava era o aviso automático ao RH — feito acima.

### CPF no cadastro ✅
O sync do RH agora grava o CPF (a API já manda) — é o que permite casar os eventos de desligamento (as 5 falhas "CPF não encontrado" na fila do RH eram por isso).

### Desligamentos — idade automática ❌ (bloqueado pela API)
A API do RH **não expõe data de nascimento** em nenhum endpoint (testei lista e detalhe). A idade segue manual. **Ação sua:** pedir ao RH para incluir `nascimento` na API — eu pluga no mesmo dia.

### Avaliação do colaborador — filtro de unidade ✅ (v1.16.0)
Seletor de unidade na barra, para quem tem mais de uma. Contador "X/Y avaliados" respeita o filtro.

### Comissões & Mobilidade — histórico ao lançar ✅ (v1.16.0)
Ao escolher o colaborador no lançamento, aparecem os **últimos 12 lançamentos dele com a variação** (verde subiu / vermelho caiu) contra o lançamento anterior do mesmo tipo. Import automático das planilhas Teknisa/mobilidade/Swile: fico aguardando os modelos que você vai mandar.

### Mapa de Funções — análise contra a sua visão (sem mexer, como pedido)
| O que você descreveu | Estado |
|---|---|
| Turnos por unidade | ✅ existe (Admin CRUD) |
| Setores com mínimo de colaboradores | ✅ existe — **mas o mínimo é por setor, o MESMO para todos os turnos** (se quiser mínimo diferente por turno, é evolução) |
| Alocar e sobrar só os não alocados | ✅ existe ("A alocar" × "Alocados") |
| Freelancers do dia aparecem para alocar | ✅ existe (painel "Freelancers do dia") |
| Mapa em tempo real | ✅ existe (derivado da Escala) |
| Histórico por dia/horário | ✅ existe (snapshot congelado + seletor) |
| Projeção de dias à frente | ✅ existe (mostra os escalados do dia futuro) |
| **Simulação de alocação na projeção, com salvar** | ❌ **não existe** — a projeção é só leitura do quadro padrão. É o único gap real vs. sua visão. Se aprovar, construo um "modo simulação" (rascunho por dia futuro que o gerente salva/aplica) |

---

## 📦 Versões publicadas nesta noite
| Versão | Conteúdo | Status |
|---|---|---|
| v1.15.0 | Itens 1, 2, 3, 4 (+gás/óleo), 6, 8 + penalidade na meta | ✅ NO AR |
| v1.16.0 | Integrações RH + avisos Escala + filtro Avaliação + histórico Comissões + central APIs | ✅ NO AR |

62 testes verdes; migrações validadas em shadow e aplicadas via psql (registradas); lint/typecheck 0 erros; SGO 200 local+público e CEO 307 verificados a cada deploy. *(Nota: um build falhou por instabilidade do Docker Desktop — disco a 95% — e foi refeito com sucesso; nada foi ao ar sem verificação.)*

## 👉 AÇÕES SUAS (amanhã)
1. **Painel do RH**: apontar o "envio automático" para as URLs novas + colar os 2 tokens (tudo em Configurações → APIs & Integrações).
2. **Equipe do RH**: corrigir o endpoint de colaboradores (admissões pós-09/04 não aparecem — causa do Período de Experiência mostrar 2) e incluir `nascimento` na API (destrava idade automática nos Desligamentos).
3. **Meta**: decidir em quais unidades gerar os checklists de Desperdício/Comandas (hoje não pontuam em lugar nenhum) — e conferir se o desconto padrão de 2%/lançamento fora do prazo te atende.
4. **Me enviar quando tiver**: planilha dos colaboradores em experiência (conferência), modelos Teknisa/mobilidade/Swile (imports automáticos), e a decisão sobre o "modo simulação" do Mapa.
5. Continuam pendentes: senhas demo + rotação de chaves + push GitHub (`docs/pendencias-producao.md`).

*Extra verificado no deploy: recepção RH→SGO testada ponta a ponta em produção (401 sem token; com token criou e vinculou colaborador de teste, removido em seguida — o evento ficou anotado na central).*
