# Mapa de Funcionalidades — SGO Beija Flor (v1.3.3)

> Atualizado 06/07/2026 · 26 módulos · no ar em sgorestaurantesgbf.com.br
> Legenda: **[OK]** pronto · **[REFINO]** pronto c/ refino aberto · **[ABERTO]** parte a construir
> Cada módulo tem um código (M0, M3…) e cada funcionalidade uma letra — anote item a item (ex.: "M3-a: mudar X").

---

## A) Operação diária do gerente

### [M0] Dashboard — [OK]
- a) Gerente: anel da meta do dia, atalhos e alertas
- b) CEO/Admin/Supervisor: semáforo por unidade, ranking, alertas críticos
- c) Atualização a cada 60s, com skeletons

### [M1] Checklists / Tarefas — [OK]
- a) Geração pelo dia operacional; conclusão transacional
- b) Evidência fotográfica por item; "não realizada" automática
- c) Programação por período; editar em quais unidades aparece
- d) Conferência por padrão de produtos (IA) nos itens marcados
- e) Admin exclui histórico de realizados/não realizados

### [M11] Metas — [OK]
- a) Ranking mensal e "Minha Meta do Mês" com detalhamento por peso
- b) Histórico de 12 meses; export PDF e Excel
- c) Treinamentos e Comunicados entram na meta (pesos configuráveis)

### [M20] Minha área — [OK]
- a) Tarefas pessoais com lembrete por notificação
- b) Bloco de notas livre e folgas/férias
- c) Disponível a todos os usuários, individualmente (NOVO v1.3.3)

## B) Perdas, caixa & suprimentos

### [M2] Desperdícios — [OK]
- a) 1 lançamento/dia com foto da balança
- b) Alerta quando >20% acima da média de 7 dias
- c) Categorias em Config; lançar dia anterior; export Excel/CSV

### [M3] Comandas — [OK]
- a) Conferência em grade: toca cada comanda; não marcadas = faltando (NOVO)
- b) Várias sequências por unidade
- c) Divergência gera alerta ao supervisor; ciclo perdida/recuperada/reposição

### [M4] Cancelamento de Cupons — [REFINO]
- a) Import CSV Teknisa; vira pendência de justificativa
- b) Motivos configuráveis; ranking por operador; badge no dashboard
- **REFINO 1 (em curso): exportar relatório em PDF/Excel**

### [M17] Coleta de Óleo — [OK]
- a) Litros, valor/litro e total a receber por unidade
- b) Forma de recebimento (PIX/dinheiro/crédito/troca) e empresa coletora
- c) Dashboard de litros + R$ e tendência mensal

### [M8] Notas Recebidas — [OK]
- a) Leitura por câmera de QR (NFC-e) e código de barras (DANFE)
- b) Chave de 44 dígitos com confirmação obrigatória
- c) Status Recebida/Paga/Problema; editar e excluir só Supervisor/Admin/CEO (NOVO)
- **ABERTO: leitura da nota por foto/IA**

### [M16] Recebimento de Gás — [OK]
- a) Leitura QR/código + fornecedor; kg + valor → preço real/kg
- b) Alerta de variação vs. última compra da unidade
- c) Dashboard por unidade e por fornecedor; lançamento por botijão P45

### [M5] Inventário — [OK]
- a) Teknisa: agendamento pelo Admin + confirmação do gerente
- b) Equipamentos: item, movimentação entrada/saída/ajuste, saldo e valor
- c) Alerta de estoque mínimo; contagem com folha imprimível

### [SUP] Fornecedores — [OK]
- a) Lista única (nome, CNPJ, PIX, categoria)
- b) Gerida por Admin/CEO/Supervisão
- c) Compartilhada por Gás, Notas Recebidas e Pagamentos

### [M22] Padrão de produtos por foto — [OK]
- a) Catálogo com foto de referência por produto (em Configurações)
- b) No checklist, compara a foto da vitrine com o padrão (IA)
- c) Lista os itens fora do padrão da rede

## C) Pessoas & RH

### [M9] Pessoas — API RH — [PARCIAL]
- a) Sincronização por unidade e "todas as cadastradas"
- b) Só entram colaboradores das unidades do SGO
- c) Auto-sync ~1x/dia + botão manual
- **ABERTO: rota de Férias, Comissões e Mobilidade**

### [M9.3] Mapa de Funções — [OK]
- a) Turnos por unidade; quadro padrão em 2 listas (a alocar × alocados)
- b) Mapa derivado da Escala em tempo real, por dia
- c) Freelancers na alocação; histórico por dia congelado

### [M14] Escala (presença mensal) — [OK]
- a) Planejado (12x36, 6x1, 5x2, personalizada)
- b) Realizado editável (T/F/FI/FJ/A/FE); ausência por período com anexo
- c) Comparação planejado × realizado; export Excel/CSV/PDF

### [M19] Central de Atestados — [OK]
- a) Foto com leitura por IA; colaborador via picker do RH
- b) Marca os dias na Escala e notifica o RH
- c) CID restrito a Admin/CEO; painel de absenteísmo; export PDF/CSV

### [M21] Desligamentos — [OK]
- a) Gerente solicita → supervisor aprova/recusa → RH
- b) Puxa tempo de empresa e atestados/dias do sistema
- c) Tipo de aviso trabalhado/indenizado; relatório PDF

### [M10] POPs — [REFINO]
- a) Blocos texto/checklist/imagem/vídeo; publicação
- b) Confirmação de leitura por versão; versionamento
- c) Criar/editar/excluir com unidades + setores
- **REFINO 3 (em curso): editor rico (formatação) + reordenar blocos**

### [M10.1] Treinamentos — [OK]
- a) POP vira treinamento Inicial e/ou Setorial (recorrência única/mensal)
- b) Reconcilia pendências (alocação, sync RH, vencidos, nova versão)
- c) Cobertura por setor; conta na meta do gerente

## D) Ocorrências, comunicação & alertas

### [M6] Ocorrências — [REFINO]
- a) Nº sequencial/unidade; tipo → categoria; gravidade em 4 níveis
- b) Anexos foto/vídeo; reincidência <30d; ação corretiva no encerramento
- c) Relatório PDF por ocorrência; sub-aba Manutenção (filtra tipos)
- **REFINO 4 (em curso): fluxo de chamado de manutenção + manutenção preventiva**

### [M15] Central de Comunicação — [OK]
- a) Comunicados com confirmação de leitura obrigatória
- b) Público por unidade + avulsos; anexos, links, prioridade, fixar, exigir resposta
- c) Painel lidos/pendentes; lembrete automático; conta na meta

### [NOTIF] Central de Notificações — [OK]
- a) Sino in-app com badge no header; tela /notificacoes
- b) Marcar como lida; notificar Admins/Perfil/Usuários
- c) Usada por todos os módulos que disparam avisos

## E) Financeiro, gestão & conformidade

### [M7] Pagamentos — [OK]
- a) Freelancers, horas extras e avulsos; solicitar → aprovar → pagar
- b) Delegação de aprovador por período; PIX obrigatório no freelancer
- c) Divergência de valor vs. padrão; relatório mensal de freelancers

### [M13] Configurações + LGPD — [OK]
- a) Cadastros Admin: unidades, usuários, checklists, comandas, categorias…
- b) Perfis de acesso (matriz perfil × módulo, Ver/Editar)
- c) Aceite de termo e controles de LGPD

### [M12] Log de Auditoria — [REFINO]
- a) Tela com filtros por módulo; timeline imutável
- b) Registra ações críticas de todos os módulos
- **REFINO 2 (em curso): exportar em PDF/CSV**

---

## Pendências abertas (resumo)

**Em curso agora**
1. M4 Cupons — exportar PDF/Excel
2. M12 Auditoria — exportar PDF/CSV
3. M10 POPs — editor rico + reordenar blocos
4. M6 Ocorrências — chamado de manutenção + preventiva
12. Produção — backup 3-2-1 agendado

**A construir**
5. M9 Pessoas — rota de Férias (RH)
6. M9 Pessoas — Comissões e Mobilidade
7. M8 Notas — leitura da nota por foto/IA
8. Transversal — PWA instalável + push nativo (FCM)

**Operacional / produção**
10. Trocar senhas de demonstração antes de liberar usuários
11. Rotacionar RH_API_KEY e chave Anthropic
