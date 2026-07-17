# Proposta — Módulo de Solicitação de Produtos (Fábrica/CD) + Cotação

> Análise pedida no pacote 16/07. **Nada foi construído ainda** — este documento é para você aprovar/ajustar antes de codar.
> Problema de hoje: listas em papel pelos gerentes → transcritas → e-mail para CD e Fábrica. Erros, retrabalho e sem histórico.

## Fase 1 — Pedidos (o coração)

### Cadastro de produtos (Admin/Supervisão)
- `Product`: nome, **origem: FÁBRICA ou CD**, categoria (ex.: Carnes, Hortifruti, Descartáveis, Limpeza…), unidade de medida (un/kg/cx/pct/L), ativo.
- Import/export **Excel** para montar o catálogo em lote (o mesmo padrão dos modelos de checklist).
- Tela: Configurações → Produtos (busca + filtro por origem/categoria).

### Pedido do gerente (mobile-first)
- Módulo "Pedidos" na Operação. Botão **"Novo pedido"**:
  - **Barra de busca inteligente** no topo (busca por qualquer parte do nome, ignora acento, mostra origem e categoria de cada resultado).
  - Lista **agrupada por categoria** com visual limpo (como você pediu): seções claras, toque no produto → informa a quantidade → entra no "carrinho".
  - Carrinho separado automaticamente em **2 blocos visíveis: FÁBRICA e CD** (conforme o cadastro do produto) — o gerente faz UM pedido só e o sistema divide.
- Ao enviar: gera **2 solicitações** (uma por destino, só se houver itens), com nº sequencial, unidade, data e itens.

### Recebimento pela Fábrica/CD
- Perfis novos de visão (ou usuários FÁBRICA/CD com módulo próprio): veem **apenas os pedidos do seu destino**, por unidade e data, com status **Novo → Em separação → Enviado → Recebido** (o gerente confirma o recebimento — fecha o ciclo).
- **E-mail automático** para os endereços da Fábrica/CD a cada pedido (mantém o fluxo atual como redundância) — e futuramente WhatsApp (ver Fase 2).
- Impressão da lista de separação (A4) por pedido.

### Extras que já deixaria prontos
- Repetir pedido anterior ("pedir igual ao de terça").
- Relatório mensal: o que cada unidade pediu (quantidades por produto) — base para padronizar consumo.

## Fase 2 — Cotação de mercadorias (compras da supervisão)
- Vincula ao cadastro de **Fornecedores** existente, que ganharia campos extras: **e-mail, WhatsApp, contato, categorias que fornece**.
- Fluxo: Supervisão monta a cotação (lista de produtos + quantidades) → seleciona fornecedores → o sistema **envia por e-mail automático** (e por WhatsApp via link `wa.me` com o texto pronto; envio 100% automático por WhatsApp exigiria integrar a Evolution API — possível, mas mexe no ambiente do CEO, então ficaria para depois com seu OK).
- Fornecedor responde por fora; a supervisão **lança os preços recebidos** → tela comparativa (menor preço por item destacado) → marca o vencedor → gera o pedido de compra (PDF).
- Histórico de cotações por fornecedor (quem ganha mais, variação de preços).

## Esforço estimado
| Entrega | Tamanho |
|---|---|
| Fase 1 completa (catálogo + pedido + telas Fábrica/CD + e-mail + impressão) | ~2 blocos de release |
| Fase 2 (cotação + comparativo + envio) | ~2 blocos |

## O que preciso de você para começar
1. **Aprovação desta proposta** (ou ajustes).
2. A **lista de produtos** atual (Excel/foto das folhas) para eu montar o catálogo inicial.
3. Os **e-mails** da Fábrica e do CD.
4. Decisão: Fábrica/CD acessam o SGO (crio usuários/perfil) ou só recebem por e-mail no início?
