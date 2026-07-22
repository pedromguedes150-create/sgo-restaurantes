# Antifraude de comandas/cancelamentos + automações (pacote 20/07)

> Estruturação pedida pelo Pedro. Alguns itens precisam de decisão/insumo dele antes de codar (marcados com ❓).

---

## Item 2 — Por que o Jefferson (admin) não aprovou os próprios pagamentos

**Não é bug — é um controle antifraude proposital (segregação de funções).**
Em `src/lib/payments/approve.ts` (linha ~41):

```ts
// Segregação de funções: ninguém aprova a própria solicitação.
if (req.requestedById === user.id) return { ok: false, reason: 'FORBIDDEN' };
```

Ou seja: **quem lança um pagamento nunca pode aprovar aquele mesmo lançamento** — nem admin. Como o Jefferson foi quem *criou* as solicitações, ele ficou impedido de aprová-las. Você (outro admin) aprovou porque é uma pessoa diferente do solicitante. É a mesma lógica de "quem pede não assina o próprio cheque", que evita que uma só pessoa crie e libere pagamentos.

**Decisão sua (❓):** manter assim (recomendado — é boa prática) ou permitir que admin aprove o próprio? Posso, se quiser, deixar configurável (ex.: só ADMIN/CEO podem se autoaprovar), mas o padrão seguro é manter o bloqueio.

---

## Itens 3 + 4 — Conferência de comandas por leitor de código de barras + antifraude

Os dois se completam: o **item 3** descobre o que sumiu fisicamente; o **item 4** descobre o que ficou "aberto" no Teknisa. O cruzamento dos dois é o que pega a fraude.

### Item 3 — Conferência por bipagem (madrugada)
**Ideia:** página de conferência acessível pelos caixas, que bipam cada comanda física; o SGO calcula presentes × faltantes automaticamente.

**Como funciona tecnicamente (é viável e simples):**
- O leitor de código de barras do caixa funciona como **teclado**: ao bipar, ele "digita" o código + Enter. A página só precisa de um **campo focado** que, a cada Enter, registra 1 comanda.
- A página soma cada bipe em "conferidas". Ao fechar: `faltantes = comandas ativas − conferidas`. Reaproveita o fluxo de contagem que já existe (`/api/commands/count`), sem refazer a lógica.
- Vantagem sobre a grade manual atual (600+ toques): o caixa passa o leitor, não toca comanda por comanda.

**Decisões/dúvidas (❓):**
1. **Login do caixa por CPF:** os caixas não são usuários completos do SGO. Proponho uma **página de conferência dedicada por unidade** onde o caixa entra só com **CPF** (validado contra os colaboradores daquela unidade que já vêm do RH) + um PIN curto por unidade (evita que qualquer um abra). Confirma esse modelo? Ou prefere criar um perfil "CAIXA" com login próprio?
2. **O código de barras da comanda contém o quê?** Preciso de 1 foto/exemplo do valor lido (é o nº da comanda "0000000007"? um EAN? outro código?). Isso define o parser.
3. **Acesso na máquina do caixa:** o PC do caixa abre `sgorestaurantesgbf.com.br` normalmente? (rede/internet liberada?)
4. **"Em uso" na madrugada:** às 3h sem cliente, o normal é tudo presente/limpo; o foco vira **faltante**. Mantenho "em uso" como exceção manual (comanda que ficou aberta de propósito) ou removo na conferência noturna?

### Item 4 — Análise das comandas em aberto (Teknisa) → fraude das "2 comandas"
Já **li o relatório que você anexou** (`Comandas-em-Aberto Moreira.xlsx`). Formato: cada comanda tem os itens + uma linha `Total (Comanda:NNNN - Data abert.: DD/MM/AAAA HH:MM:SS ...)` com **número, data/hora de abertura e valor**. Ex.: comandas abertas em **03/07 e 04/07 ainda apareciam abertas em 20/07** — exatamente o sinal de alerta.

**A fraude das 2 comandas:** o cliente abre 2, consome numa, sai com a vazia e descarta a cheia. A comanda cheia **nunca é fechada/paga** → fica **aberta no Teknisa, com itens e valor, datada no passado**. Logo:

> **Comanda ABERTA + com consumo (valor > 0) + data de abertura anterior a hoje = forte suspeita.**

**Rotina proposta no SGO:**
- Supervisor/Admin **sobe o relatório** (Excel/CSV) diariamente (upload numa aba nova em Comandas).
- O SGO faz o parse, separa as comandas com **data de abertura < hoje** e valor > 0, e gera um **relatório de suspeitas** com nº, data/hora, valor e itens.
- Saída para o **monitoramento** buscar as câmeras por data/hora.
- **Cruzamento com o item 3:** comanda que está **aberta com valor no Teknisa** E **faltante na bipagem** = o caso clássico (saiu com a comanda / foi descartada). Esse cruzamento é o "ouro" — junta o físico (bipagem) com o fiscal (Teknisa).

**Dúvidas (❓):**
1. Consigo o mesmo relatório sempre em **Excel/CSV** (não PDF)? O xlsx que você mandou é perfeito.
2. O "dia de corte" é a data operacional da unidade (04:00) ou meia-noite?
3. Quero destacar também comandas **antigas demais** (ex.: > 2 dias) com um nível de alerta maior?

---

## Item 5 — Antifraude de cancelamentos de itens (relatório Teknisa)

**Contexto:** cancelamento de cupom é raro e só com o cartão do gerente. O risco real é o gerente **emprestar o cartão** ao caixa e perder o controle. O relatório `vendaitemcancperiodo` lista os **cancelamentos de itens** aprovados no período.

⚠️ **Preciso do relatório em Excel/CSV** (o PDF não abre para leitura automática aqui). Idealmente com as colunas: **data/hora, operador(caixa), item, valor, terminal/PDV, e quem autorizou** (se houver).

**Sinais de fraude que a análise vai calcular (meu conhecimento aplicado ao seu caso):**

| Sinal | Por que é suspeito |
|---|---|
| **Valor alto** cancelado (item isolado ou soma no dia) | Pochete de valor; cancelar item caro depois de recebido |
| **Taxa de cancelamento por operador** (nº e R$ de cancelamentos ÷ vendas do operador) | Operador muito acima da média dos colegas = outlier estatístico |
| **Concentração em um operador** — cancela em (quase) todos os seus turnos | Padrão sistemático, não eventual |
| **Periodicidade de horário** (sempre perto da virada de turno / fim de expediente / horário sem gerente) | Escolhe a "janela" de menor supervisão — cruza com o horário do gerente (módulo que acabei de criar!) |
| **Cancelamento sem re-lançamento** do item | Item sai da conta e o dinheiro é embolsado |
| **Itens repetidos / valores redondos** cancelados | Assinatura de fraude manual |
| **Mesma comanda/mesa** com cancelamentos repetidos | Manipulação concentrada |
| **Cancelamento logo após a venda** (reversão rápida) | Venda "fantasma" para estornar |

**Rotina proposta:**
- Upload do relatório (aba nova em Cancelamentos ou módulo próprio "Análise de cancelamentos").
- O SGO calcula, por período/unidade: ranking de operadores por R$ e por nº, **taxa vs média** dos colegas, distribuição por **hora** e por **dia**, itens/valores mais cancelados, e marca **outliers** (ex.: acima de 2 desvios-padrão).
- **Score de risco** por operador + lista priorizada → relatório para investigação (com data/hora/terminal p/ câmera).
- Cruza com o **horário do gerente**: cancelamentos feitos **fora da presença do gerente** ganham peso.

**Dúvidas (❓):**
1. O relatório tem **operador/caixa** e **hora** por cancelamento? (essencial p/ os sinais acima)
2. Existe **motivo** do cancelamento no relatório? (ajuda a separar erro legítimo de suspeita)
3. Qual o **volume normal**? (p/ eu calibrar os limiares e não gerar alarme falso)

---

## Item 6 — QR do banheiro → notificação + histórico/análise

**Hoje:** QR → Forms → WhatsApp do gerente. **Meta:** centralizar no SGO.

**Proposta:**
- QR passa a apontar para uma **página pública do SGO** por unidade+banheiro (ex.: `/higiene/<unidade>/<banheiro>`), sem login (como o QR das notas).
- A pessoa toca "Este local precisa de limpeza", opcionalmente escolhe o problema (papel, lixo, cheiro…) e a avaliação, e envia.
- O SGO **registra** (unidade, banheiro, data/hora, tipo, avaliação) e **notifica o gerente** na hora (Central de Notificações; badge/sino).
- **Histórico e análise:** banheiros com mais solicitações, horários de pico, tempo de resposta (gerente marca "resolvido"), tendência.

**Sobre o WhatsApp (❓ importante):** enviar mensagem no WhatsApp depende da **Evolution API, que é do ambiente do CEO** (`bjf_evolution`) — mexer nela é sensível e precisa da sua confirmação + coordenação. Proponho:
- **Fase 1 (já):** notificação in-app + histórico/análise (sem tocar no ambiente do CEO).
- **Fase 2 (com seu OK):** disparo no WhatsApp reaproveitando a Evolution API do CEO, se ele autorizar.

**Dúvidas (❓):**
1. Quais banheiros/locais cadastro por unidade (masculino/feminino/PCD/por andar)?
2. Mantém a **avaliação** ("nos avalie") junto do pedido?
3. WhatsApp agora (precisa alinhar com o CEO) ou começamos in-app?

---

## Resumo do que preciso de você para destravar
- **Item 2:** manter o bloqueio de autoaprovação? (recomendo manter)
- **Itens 3/4:** exemplo do **código de barras** da comanda; modelo de **login do caixa** (CPF+PIN?); relatório de comandas em aberto sempre em **Excel/CSV**.
- **Item 5:** relatório de cancelamentos em **Excel/CSV** com operador+hora+valor(+motivo).
- **Item 6:** lista de banheiros por unidade; WhatsApp agora (com CEO) ou in-app primeiro.
