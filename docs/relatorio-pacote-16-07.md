# Relatório — Pacote 16/07 (v1.17.0 → v1.23.0)

> Para: Pedro · Gerado em 17/07/2026 · Todas as entregas construídas de forma autônoma conforme autorização, com deploy bloco a bloco.

## Resumo executivo

Os **2 blocos de áudio do dia 16/07 foram 100% implementados** em 7 versões (v1.17.0 a v1.23.0), cada uma com commit, changelog, guia de treinamento atualizado e deploy. Além do código, foram entregues **2 documentos de decisão** que aguardam sua leitura e **2 incidentes de infraestrutura** foram resolvidos (túnel e disco).

| Versão | Entrega | Status |
|---|---|---|
| v1.17.0 | Mobile (todos os módulos) · Watchdog do túnel · Escala: status ATRASO → RH · Meu Perfil (CPF + troca de senha) | ✅ no ar |
| v1.18.0 | Notas reformuladas · Comandas grade 3 estados | ✅ no ar |
| v1.19.0 | Pagamentos: cobertura de setor (freelancer) + VT na HE + consolidação semanal · Desperdício: unidades + sub-itens | ✅ no ar |
| v1.20.0 | Checklist ↔ Ocorrência (item sinalizado) · Fases de andamento · Reclassificação de categoria | ✅ no ar |
| v1.21.0 | Gás: contratos por unidade+fornecedor + filtros no dashboard | ✅ no ar |
| v1.22.0 | **Troco reformulado como COFRE** (baldes, denominações, retirada proibida) | ✅ código pronto — sobe junto com v1.23 |
| v1.23.0 | **Configuração da Meta centralizada** + **Simulação salvável do Mapa** | ✅ código pronto — em deploy |

## Destaques por bloco

### 1. Troco como COFRE (v1.22) — redesenho completo
Conforme sua foto da folha da Nova União:
- **Cofre por unidade** com **baldes** (metas de valor fixadas pela Supervisão, ex.: "Moedas R$ 500").
- **Contagem diária por denominação** (R$ 200 → R$ 0,05 + campo "outros" — modelei a linha "PUL 250,00" aí; me confirme o que significa).
- **Reposição de moedas** e **troca 1:1 com o escritório** (validação de valores iguais).
- **Retirada para pagamento = PROIBIDA**: fluxo vermelho com confirmação explícita, alerta crítico para supervisor + admins, e contador de retiradas/mês na Visão Executiva. A "trava total" fica a 1 clique quando você quiser ativar.
- Indicador de **% de notas grandes** (≥50% sugere troca com escritório).
- Os dados do modelo antigo (sessões de caixa) foram preservados.

### 2. Configuração da Meta centralizada (v1.23)
`Metas → Configuração da Meta` (Admin edita, Supervisão visualiza):
- **Checklists** (peso por checklist, como já era) · **Comunicados** · **Treinamentos** · **Avaliações**.
- **NOVOS componentes diários "Desperdício" e "Comandas"**: contam por **cobertura mensal** (dias preenchidos ÷ dias decorridos) — sem lançar, o % cai. **Nascem com peso 0** — você liga quando quiser.
- **Penalidade "fora do prazo"**: % descontado por cada data corrigida pela supervisão OU nota lançada por eles (Notas, Pagamentos, Gás, Óleo).

### 3. Simulação do Mapa de Funções (v1.23)
Ao abrir um **dia futuro** na projeção, o gerente monta uma simulação de alocação (quem fica em qual setor) e **salva** — sem alterar o quadro padrão. A simulação reaparece ao voltar na data.

### 4. Notas reformuladas (v1.18)
Lista por data (mais recente primeiro), filtros completos, padrão 60 dias, **sem botão "Paga"** (Teknisa controla), fornecedor **só da lista cadastrada**, aba Análise com todos os campos + editar/excluir (Sup/Admin) + PDF/Excel. Nota lançada pela supervisão desconta a meta do gerente.

### 5. Demais entregas
- **Comandas**: grade com 3 estados (conferida / em uso / limpa); em apuração e perdidas saem da grade.
- **Pagamentos**: freelancer com "cobertura temporária de setor" (valor/dia por setor + VT, cadastro em Config), VT na Hora Extra, **consolidação semanal seg→dom** fechando na segunda.
- **Desperdício**: lanchonete em **unidades** (medida por categoria) + sub-itens somando o total.
- **Checklist ↔ Ocorrência**: item com ocorrência aberta fica **sinalizado nos dias seguintes** (sem duplicar pendência); ocorrências ganharam **fases de andamento** e **reclassificação** de tipo/categoria (move entre abas Manutenção/TI).
- **Gás**: contratos por unidade+fornecedor (período, kg, preço/kg), **baixa automática pelos recebimentos**, % cumprido, filtros por unidade/fornecedor/mês.
- **Escala**: status **ATRASO** já gera aviso ao RH; conferi o fluxo atestado→escala (funcionando).
- **Usuários**: CPF + nome completo + troca de senha própria (`/perfil`); Sup/CEO visualizam.
- **Mobile**: `/modulos` com todos os módulos respeitando permissões.

## Documentos para sua decisão
1. **[Solicitação de Produtos + Cotação](proposta-solicitacao-produtos.md)** — análise/proposta (Fábrica/CD, categorias, cotação com fornecedores por e-mail/WhatsApp). **Não construí — aguarda seu OK.**
2. **[Plano de migração de servidor](plano-migracao-servidor.md)** — passo a passo cuidadoso, sem perda e com janela mínima; SGO migra depois do CEO.

## Incidentes resolvidos (17/07)
- **Queda da plataforma**: os builds encheram o disco C: (98%) e o daemon do Docker travou. Liberei 2,5 GB de backups locais antigos (espelho no Google Drive intacto) + 20,9 GB de cache de builds. Plataforma voltou; CEO não foi afetado.
- **Túnel (13–14/07)**: cloudflared caiu com a queda de internet e não voltou sozinho — criei o **watchdog** (tarefa agendada a cada 5 min) que o relança oculto.

## Aguardando você
- ✅/❌ da proposta de Solicitação de Produtos; decisões do plano de migração.
- Significado da linha **"PUL 250,00"** na folha de troco.
- Planilhas Teknisa / mobilidade / Swile (comissões); TI do RH (em espera, como pediu).
- Apontar o painel do RH para as URLs de **Configurações → APIs & Integrações**.
- Push GitHub (vários commits locais) · senhas demo · rotação de chaves (`docs/pendencias-producao.md`).
- **Disco C: ~96%** — reforça a migração de servidor.
