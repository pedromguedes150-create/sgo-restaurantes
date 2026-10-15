# Integração SGO Restaurante → GBF-RH (SAÍDA) — fila de envio automático (v1.168.0)

> Operação e teste do envio automático. O contrato do RH (14/10/2026) é o único corpo enviado;
> nenhum campo fora dele vai. Código: `src/lib/rh/saida/` (regras puras em `regras.ts`,
> fila em `fila.ts`, despachante em `despachante.ts`, transporte em `transporte.ts`).

## Variáveis de ambiente (`.env` do servidor, nunca no Git)

| Variável | Para quê | Obrigatória? |
|---|---|---|
| `RH_WEBHOOK_TOKEN` | Token que o RH passou à parte. Vai em `Authorization: Bearer` em todo envio | **Sim** para enviar. Sem ela, nada sai e nada se perde: os eventos ficam `PENDENTE` e saem sozinhos quando o token entrar e o app reiniciar |
| `RH_API_URL` | Base do RH (`https://gbf-rh.replit.app`) | Não — sem ela vale `RH_API_BASE_URL` (a do sync), e sem as duas o padrão acima. Com as duas, `RH_API_URL` vence |

No droplet: editar `/opt/sgo/app/.env`, depois `docker compose -f docker-compose.prod.yml up -d` (recria o
`sgo_app` com o ambiente novo). No boot o SGO escreve no log `[rh-saida] envio automático ao GBF-RH ATIVO` ou
`SEM RH_WEBHOOK_TOKEN`.

## O que é enviado e quando

| Evento | Gatilho no SGO | Endpoint do RH | Campos |
|---|---|---|---|
| Atestado `criar` | Salvar atestado (Central de Atestados) | `POST /api/integracoes/sgo/atestados` | `sgoEventId`, `sgoMovimentoId` (id do atestado), `acao`, `cpf`, `tipo:"A"`, `tipoDetalhe` (FULL_DAY/HOURS/COMPANION), `dataInicio`, `dataFim`, `motivo` (DOENCA/ACOMPANHANTE/OUTROS), `cid` e `observacoes` se houver, `anexo {nome, conteudoBase64}` se houver foto/PDF |
| Atestado `cancelar` | Admin exclui o atestado **que o RH já tinha aceitado** | idem | mesma forma, sem anexo |
| Atestado `atualizar` / `retorno` | **Sem gatilho ainda** (o SGO não edita atestado). A fila e o payload já aceitam as duas ações — quando houver edição, basta chamar `enfileirarAtestado(id, 'atualizar')` | idem | idem |
| Desligamento | **Aprovação do supervisor** (nunca no pedido do gerente; quem pediu não aprova) | `POST /api/integracoes/sgo/desligamentos` | `sgoEventId`, `cpf`, `unitCode` (CNPJ da unidade do pedido, só dígitos), `dataDesligamento`, `tipo`, `modalidadeAviso` (omitida em justa causa/término de experiência), `motivo`, `justificativa` (motivo outro) ou `observacao`, `solicitanteNome`, `solicitanteEmail`, `carta {nome, base64}` (pedido de demissão) |
| Demanda | Gerente registra em Pessoas → Demandas ao RH | `POST /api/integracoes/sgo/demandas` | `sgoEventId`, `tipo`, `titulo`, `solicitanteNome`, `prioridade` e, se informados, `descricao`, `cpf`, `unitCode`, `solicitanteEmail`, `dataEvento` |

Andamento: de hora em hora o SGO consulta `GET .../desligamentos/{sgoEventId}` e `GET .../demandas/{sgoEventId}`
e grava `situacao` no pedido; o gerente vê na própria tela. Para em `concluido`/`cancelado`.

## Como a fila decide (regra 3 do contrato)

| Resposta do RH | Efeito |
|---|---|
| 2xx, ou corpo `{"status":"duplicado"}` | `ENVIADO`. Guarda `rhAtestadoId` / `processo`+`prazoLegal` / `numero`+`prazoAlvo` no registro de origem |
| 400 / 422 / 409 (e outros 4xx de dados) | `ERRO` — **não tenta de novo**. Aparece na tela do Admin com o `resultado` do RH |
| 401 | `PARADO` — o despacho para na hora, os Admins recebem aviso crítico. Reinício do app ou "Reenviar" devolve à fila |
| 404, 408, 429, 5xx, rede/timeout | `PENDENTE` com espera crescente (1, 2, 4, 8, 16, 32, 64, 128, 256, 480 min). Na 10ª falha vira `ESGOTADO` e continua guardado para reenvio manual |

Idempotência: `sgoEventId` é fixo por evento (coluna única); reenvio manual reusa o mesmo id. Um evento por
(tipo, registro, ação) — enfileirar duas vezes devolve a mesma linha.

LGPD/log: `ultimoErro` e `resposta` são gravados com CPF mascarado (`123.***.***-45`); o anexo é lido do volume
`uploads/` na hora do envio e nunca gravado na tabela; o token nunca aparece em log nem tela.

## Onde ver

- **Configurações → APIs & Integrações → cartão "Envios ao RH"**: base, token (mascarado), contagem da fila.
- **Configurações → APIs & Integrações → Envios ao RH** (`/configuracoes/integracoes/envios-rh`, Admin/CEO):
  filtros Com problema / Pendentes / Enviados / Todos, cada evento com tentativas, próxima tentativa, HTTP,
  resposta do RH e botões **Reenviar** (remonta do cadastro atual: CPF/CNPJ corrigidos entram) e
  **Processar fila agora** (roda o despachante na hora).
- O gerente vê só o andamento (Recebido pelo RH / situação / número / prazo), nunca o detalhe técnico.

## Teste de ponta a ponta (atestado)

1. No servidor: `RH_WEBHOOK_TOKEN=<token do RH>` (e `RH_API_URL` se quiser apontar para homologação do RH) no
   `.env`; reinicie o `sgo_app`. Confira no log `[rh-saida] ... ATIVO`.
2. Garanta que o colaborador de teste tem **CPF** no cadastro (vem do sync do RH) — sem CPF o evento nasce `ERRO`
   com a mensagem "sem CPF".
3. Como gerente: Atestados → Lançar → foto/PDF (opcional) → colaborador, datas → Salvar.
4. Em até 1 minuto o despachante envia. Como Admin, abra Configurações → Integrações → Envios ao RH → filtro
   "Enviados": o evento aparece com HTTP 201 e `rhAtestadoId`. Para não esperar, clique **Processar fila agora**.
5. No RH, confira o atestado (tipo Médico/Comparecimento/Falta justificada conforme `tipoDetalhe`) e o anexo.
6. Cancelamento: como Admin, exclua o atestado em Atestados → Histórico. Um evento `cancelar` entra na fila com o
   mesmo `sgoMovimentoId` e é enviado no próximo minuto.
7. Para testar a recusa: lance um atestado sobreposto a outro já aceito pelo RH → o RH responde 409 → o evento
   fica `ERRO` com o `resultado` do RH na tela; "Reenviar" só depois de corrigir.

Sem o RH disponível, os testes automatizados (`tests/rh-saida.integration.test.ts`) simulam todas as respostas
(2xx, duplicado, 422, 401, 404/5xx, esgotamento, reinício, reenvio) contra o banco de teste.
