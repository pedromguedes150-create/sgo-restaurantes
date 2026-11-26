# Solicitação de Vagas — SGO Restaurante × RH (gbf-rh)

O SGO Restaurante usa **o mesmo contrato do SGO Operacional (postos)**. A referência completa é o
`docs/integracao-sgo-vagas.md` do repositório `sgo-postos`. Este documento lista só o que é **próprio do
Restaurante** e o que o RH precisa fazer para as vagas do Restaurante andarem.

## 1. Identificação (não colide com o SGO Operacional)

| | SGO Operacional | SGO Restaurante |
|---|---|---|
| `sistema` | — | `"SGO Restaurante"` em todo corpo enviado |
| `sgoVagaId` | `vaga-<n>` | `rest-vaga-<n>` |
| `sgoCurriculoId` | `cv-<n>` | `rest-cv-<n>` |
| Código que o gerente vê | `VAG-0012` | `VAGR-0012` |

No retorno, o Restaurante só aceita o próprio prefixo; o identificador de outro sistema responde **404**.

## 2. Rota 1 — SGO → RH

`POST {base do RH}/api/integracoes/sgo/vagas` · `Authorization: Bearer <chave de saída do SGO Restaurante>`
(a mesma chave dos demais envios do Restaurante ao RH: atestados, desligamentos, demandas).

Ações: `criar` · `atualizar` (edição do supervisor depois de entregue) · `cancelar` · `curriculo` (currículo novo de
vaga já entregue). O corpo é o do contrato dos postos, com estas particularidades:

- `unidade.sgoUnidadeId` é **texto** (identificador interno do Restaurante), não número;
- `unidade.cidade` e `unidade.uf` vão `null` (o cadastro de unidades do Restaurante não tem esses campos);
  `unidade.endereco` vai quando existe;
- `posicoes[].salario` vai sempre `null` (o RH define pelo cargo);
- `posicoes[].substitui.cpf` vai só quando o gerente escolheu o colaborador na lista do cadastro.

Resposta esperada: **2xx** (ou **409** se já recebeu) com `rhVagaId` e, quando houver, `codigoVaga`.
400/413/422 e 401/403 são tratados como recusa definitiva (o supervisor vê o motivo e reenvia);
404/408/429/5xx e falha de rede são repetidos sozinhos (5 min, 15 min, 1 h, 3 h e depois a cada 6 h).

## 3. Rota 2 — RH → SGO Restaurante: cada passo da vaga

`POST https://sgorestaurantesgbf.com.br/api/integracoes/rh/vaga-situacao` (aceita `/vaga_situacao`)
`Authorization: Bearer <chave de entrada do RH no SGO Restaurante>` — a mesma do retorno dos atestados.

```json
{ "sgoVagaId": "rest-vaga-12", "situacao": "vaga_numerada", "rhEventoId": "…", "codigoVaga": "…",
  "candidato": "nome, sem documento", "observacao": "…", "ocorridoEm": "ISO", "sgoCurriculoId": "rest-cv-31" }
```

`situacao`: `recebida` · `vaga_numerada` · `em_selecao` · `consulta_cadastral` · `entrevista_agendada` ·
`candidato_aprovado` · `candidato_reprovado` · `em_admissao` · `concluida` · `cancelada`.

Respostas: `200 { ok, status }` · `200 { ok, repetido: true }` (mesmo `rhEventoId`) · `400` corpo inválido ou
**CPF em `candidato`/`observacao`** · `401` chave · `404` vaga inexistente · `500` erro (repita).

## 4. Rota 3 — RH → SGO Restaurante: situação de cada currículo

`POST https://sgorestaurantesgbf.com.br/api/integracoes/rh/curriculo-situacao` (aceita `/curriculo_situacao`), mesma chave.
Um objeto ou `{ "curriculos": [ … ] }` (até 200; a resposta traz `resultados` com o `http` de cada item).

```json
{ "sgoCurriculoId": "rest-cv-31", "situacao": "Entrevista técnica", "observacao": "…", "rhEventoId": "…", "ocorridoEm": "ISO" }
```

`situacao` como está na tela do RH (sem acento, maiúscula/minúscula e barra são tolerados): recebido · em_analise ·
recrutamento_selecao · entrevista_tecnica · em_avaliacao_final · aprovado · reprovado · banco_de_talentos ·
desistencia · contratado. Desconhecida = 400 com a lista. CPF na observação = 400.

## 5. O que o RH precisa fazer

1. Aceitar `sistema: "SGO Restaurante"` e os prefixos `rest-vaga-` / `rest-cv-`.
2. Guardar o `sistema` de cada vaga e mandar os retornos (rotas 2 e 3) para o **endereço do SGO que a criou**.
3. Aceitar `acao: "atualizar"` e `acao: "curriculo"` vindos do Restaurante.
4. Aceitar `salario: null` e `unidade.sgoUnidadeId` em texto.

Enquanto isso não estiver publicado no RH, a vaga aprovada no Restaurante fica como "Indo para o RH" e é
reenviada sozinha — nada se perde.
