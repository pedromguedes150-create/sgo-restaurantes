# INTEGRAÇÃO SGO RESTAURANTE → GBF-RH — CENTRAL DE ATESTADOS E AFINS (v1.196.0 / v1.197.0)

> Documento para o responsável técnico do GBF-RH. Data: 09/11/2026 (revisado no mesmo dia: a Parte 3 JÁ ESTÁ IMPLEMENTADA no SGO e a URL correta é `/api/integracoes/rh/atestado-situacao`).
> Parte 1 explica o que o SGO já está enviando hoje (nada a programar, só conferir).
> Parte 2 é o que precisa ser cadastrado no RH (sem código).
> Parte 3 é o que precisa ser PROGRAMADO no RH para a próxima etapa, escrita como instrução de implementação.

---

## PARTE 1 — O QUE JÁ MUDOU E JÁ ESTÁ EM PRODUÇÃO (conferir, não programar)

Atue como desenvolvedor responsável pela integração do GBF-RH com o SGO Restaurante e confira os pontos abaixo. Nenhum campo do contrato de 14/10/2026 foi alterado ou removido; a integração atual não quebra.

### 1.1 O endpoint é o mesmo, o alcance aumentou

O SGO continua chamando `POST /api/integracoes/sgo/atestados` com `Authorization: Bearer <token de saída do Restaurante>`. Antes só saíam atestados médicos. Agora saem, pelo MESMO endpoint e com o MESMO corpo, todos os documentos que o funcionário entrega ao gerente:

- Atestados: atestado médico, atestado odontológico, declaração de internação.
- Afastamentos: afastamento pelo INSS, acidente de trabalho (CAT).
- Comparecimentos: declarações de consulta, exame, acompanhante, pré-natal, doação de sangue, eleitoral, Justiça, vestibular.
- Licenças: maternidade, paternidade, casamento, luto, aborto, prorrogação da maternidade, amamentação.

### 1.2 Corpo do envio (inalterado) e a novidade em `observacoes`

```json
{
  "sgoEventId": "uuid fixo do evento (reenvio repete o mesmo id)",
  "sistema": "SGO Restaurante",
  "sgoMovimentoId": "id do documento no SGO",
  "acao": "criar | atualizar | cancelar",
  "cpf": "12345678901",
  "tipo": "A",
  "tipoDetalhe": "FULL_DAY | HOURS | COMPANION",
  "dataInicio": "2026-11-03",
  "dataFim": "2026-11-07",
  "motivo": "DOENCA | ACOMPANHANTE | OUTROS",
  "cid": "J11 (só se estiver escrito no documento)",
  "observacoes": "[Licença-paternidade] texto livre do gerente",
  "anexo": { "nome": "documento.jpg", "conteudoBase64": "..." }
}
```

NOVIDADE: quando o SGO classificou o documento, `observacoes` começa com o NOME DO TIPO entre colchetes, exatamente como está na lista da Parte 2. Exemplos:

- `"[Atestado médico]"` (sem texto do gerente)
- `"[Licença-paternidade] nasceu dia 03/11"`
- `"[Consulta médica] saiu às 14h"`

Documento que a IA do SGO não conseguiu classificar vai SEM o prefixo — nesse caso o RH define o tipo na análise.

ATENÇÃO: `tipoDetalhe` e `motivo` continuam com os valores antigos do contrato. Uma licença de dias inteiros chega como `tipoDetalhe: FULL_DAY` e `motivo: DOENCA`. O que diz o que o documento é de verdade é o nome entre colchetes. Leia o prefixo com esta regra: texto que começa com `[` e termina no primeiro `]`.

### 1.3 Anexo obrigatório

Todo envio novo traz `anexo` (foto JPG/PNG/WEBP ou PDF, até 10 MB). Envios antigos sem anexo continuam como estão.

### 1.4 Leitura pela API Global do SGO (já disponível)

`GET /api/v1/atestados?from=AAAA-MM-DD&to=AAAA-MM-DD&page=1&limit=500` com header `X-API-Key: <chave do RH>` passou a devolver, por documento:

- `documentGroup`: `ATESTADO | AFASTAMENTO | COMPARECIMENTO | LICENCA` (nulo nos registros anteriores a 09/11/2026)
- `nomenclature`: o nome do tipo (ex.: `"Licença-paternidade"`)
- `status`: situação do lançamento no SGO (ver Parte 3.1)
- `fileUrl`: `/api/v1/atestados/{id}/anexo` (mesma chave) para baixar a imagem/PDF

`GET /api/v1/atestados/resumo?from=&to=` soma por `documentGroup`, `nomenclature` e `status`.

---

## PARTE 2 — O QUE CADASTRAR NO SISTEMA DO RH (sem programar)

A correspondência entre os dois sistemas é PELO NOME, sem código. **v1.198.0**: a tabela completa — grupo, nome no SGO, nome no RH (se o Administrador do SGO configurar um diferente), regra aplicável com versão e vigência, o que marca na Escala, `tipoDetalhe` e `motivo` do envio — pode ser lida em `GET /api/v1/atestados/nomenclaturas` (API Global, `X-API-Key`). Se o RH preferir usar os nomes DELE, basta o Admin do SGO cadastrá-los em Configurações → Atestados e afins: o envio passa a trazer `[Nome do RH]` e o retorno aceita essa grafia em `nomenclaturaRh`. Cadastre no RH os 25 tipos abaixo com a grafia idêntica (acentos e hífens incluídos), agrupados nos 4 grupos:

**Atestados**
- Atestado médico
- Atestado odontológico
- Declaração de internação

**Afastamentos**
- Afastamento pelo INSS
- Acidente de trabalho (CAT)

**Comparecimentos**
- Consulta médica
- Consulta odontológica
- Exames (laboratoriais e outros)
- Acompanhante de familiar
- Acompanhamento de gestante (consulta ou exame)
- Acompanhamento de filho até 6 anos
- Pré-natal da empregada gestante
- Doação voluntária de sangue
- Exames preventivos de câncer
- Alistamento eleitoral
- Trabalho eleitoral (mesário)
- Comparecimento à Justiça
- Vestibular

**Licenças**
- Licença-maternidade
- Licença-paternidade
- Licença-casamento
- Licença por falecimento (luto)
- Repouso por aborto não criminoso
- Prorrogação da licença-maternidade
- Licença-amamentação

Regras que o SGO segue e que o RH deve conhecer:
- Atestado de 3 dias e atestado de 16 dias são o MESMO tipo ("Atestado médico"); a duração não cria tipo novo. Acima de 15 dias o SGO só gera um ALERTA de "análise INSS necessária" para os administradores — não concede nada.
- Declaração de comparecimento nunca é convertida em afastamento pelo SGO.
- Licença chega com o período SUGERIDO pela regra geral (ex.: paternidade = 5 dias em 2026); o prazo definitivo é decisão do RH.
- Aposentadoria não é enviada: é situação cadastral do RH.

---

## PARTE 3 — O QUE PRECISA SER PROGRAMADO NO RH

Atue como desenvolvedor sênior do GBF-RH e implemente a DEVOLUÇÃO DA DECISÃO do RH para o SGO. Hoje o RH recebe o documento e o SGO não fica sabendo se ele foi validado, se precisa de correção ou se foi recusado. O gerente precisa dessa informação na tela dele.

**O lado do SGO JÁ ESTÁ PRONTO (v1.197.0)**: o endpoint abaixo está em produção e responde exatamente como descrito. Basta o RH chamar.

### 3.1 Situações que o SGO conhece

```
AGUARDANDO_LEITURA · LEITURA_CONCLUIDA · CLASSIFICACAO_PENDENTE · ENVIADO_RH ·
EM_ANALISE_RH · CORRECAO_SOLICITADA · CORRIGIDO_REENVIADO · VALIDADO_RH · NAO_ACEITO · CONCLUIDO
```

As cinco primeiras são do SGO. As que o RH informa são: `em_analise`, `validado`, `correcao_solicitada`, `nao_aceito`, `concluido`.

### 3.2 O RH avisa o SGO por webhook (implementado)

Chamar o webhook de entrada do SGO — a MESMA porta e o MESMO token já usados para `inclusao` e `desligamento`:

```
POST https://sgorestaurantesgbf.com.br/api/integracoes/rh/atestado-situacao
Authorization: Bearer <RH_INBOUND_TOKEN — o mesmo token já usado para inclusao/desligamento>
Content-Type: application/json
```

Corpo:

```json
{
  "sgoMovimentoId": "id do documento no SGO (o mesmo recebido no envio)",
  "sgoEventId": "sgoEventId do envio original (opcional, ajuda a casar)",
  "rhAtestadoId": "id do documento no RH (opcional; o SGO grava)",
  "situacao": "em_analise | validado | correcao_solicitada | nao_aceito | concluido",
  "motivo": "ilegivel | foto_cortada | incompleto | colaborador_incorreto | datas_divergentes | documento_complementar | classificacao_revisar | outro",
  "observacao": "texto curto para o gerente, SEM dado médico (até 500 caracteres)",
  "nomenclaturaRh": "nome do tipo como o RH classificou (opcional; use a grafia da Parte 2 — reclassifica no SGO)",
  "data": "2026-11-09T14:30:00-03:00"
}
```

(O evento vai no CAMINHO da URL, não no corpo. Período corrigido pelo RH não entra nesta etapa: se as datas estiverem erradas, use `correcao_solicitada` com motivo `datas_divergentes` e o gerente corrige no SGO.)

Regras de negócio a implementar no RH:

1. `motivo` e `observacao` são OBRIGATÓRIOS quando `situacao` for `correcao_solicitada` ou `nao_aceito`. Nos demais, opcionais.
2. `observacao` aparece para o GERENTE na tela do SGO. NUNCA incluir CID, diagnóstico ou qualquer dado de saúde. Exemplo correto: "Foto cortada — envie o documento inteiro". Exemplo errado: "Atestado de J11 ilegível".
3. Disparar o evento a cada mudança de situação no RH (entrou em análise → validado, ou → correção solicitada → após o reenvio do gerente, validado/não aceito → concluído).
4. Idempotência: o mesmo `sgoMovimentoId` + mesma `situacao` + mesma `data` enviados duas vezes devem ser tratados pelo RH como repetição (não é erro). O SGO vai responder 200 nos dois casos.
5. Respostas do SGO: `200 {"status":"processado","situacao":"..."}` (com `"repetido":true` quando for o mesmo evento de novo); `400` corpo inválido (campo obrigatório faltando, motivo fora da lista, observação com CID); `401` token inválido; `404` `sgoMovimentoId` desconhecido. Em `5xx` ou falha de rede, repetir com espera crescente (1, 2, 4, 8… minutos) até 10 tentativas, guardando o erro.
6. Quando o gerente corrigir e reenviar, o SGO manda ao RH um novo envio com `acao: "atualizar"`, MESMO `sgoMovimentoId`, `sgoEventId` NOVO e o anexo novo. O RH deve atualizar o documento existente (não criar outro) e, depois da nova análise, mandar a situação de novo.

### 3.3 Alternativa (não implementada) — o SGO consulta a situação no RH

Se o RH preferir que o SGO consulte em vez de receber, publicar o endpoint abaixo e avisar; o SGO passaria a consultá-lo de hora em hora, como já faz com desligamentos e demandas. Enquanto isso, vale a 3.2.

```
GET /api/integracoes/sgo/atestados/{sgoEventId}
Authorization: Bearer <token de saída do Restaurante>
```

Resposta:

```json
{
  "sgoEventId": "...",
  "rhAtestadoId": "...",
  "situacao": "em_analise | validado | correcao_solicitada | nao_aceito | concluido",
  "motivo": "...",
  "observacao": "...",
  "nomenclaturaRh": "...",
  "atualizadoEm": "2026-11-09T14:30:00-03:00"
}
```

O SGO consultaria de hora em hora, como já faz com desligamentos e demandas. Mesmas regras de conteúdo da `observacao` (sem dado médico).

### 3.4 Testes que o RH deve executar antes de liberar

1. Receber um envio com `observacoes` começando por `[Atestado médico]` e classificar automaticamente pelo prefixo.
2. Receber um envio SEM prefixo e cair na fila de classificação manual.
3. Receber `[Licença-paternidade]` com `tipoDetalhe: FULL_DAY` e `motivo: DOENCA` e classificar como licença (o prefixo vence os campos antigos).
4. Enviar `situacao: correcao_solicitada` sem `motivo` → o SGO vai responder 400; corrigir e reenviar.
5. Enviar `correcao_solicitada` com `observacao` contendo CID → deve ser barrado no próprio RH antes de sair.
6. Receber o `acao: "atualizar"` do mesmo `sgoMovimentoId` com anexo novo e NÃO duplicar o documento.
7. Repetir o mesmo evento de situação duas vezes e confirmar que não gera erro nem duplicidade.
8. Baixar o anexo por `GET /api/v1/atestados/{id}/anexo` com a `X-API-Key` do RH.

---

## RESUMO DO QUE O RH FAZ AGORA

| Item | Ação | Quando |
|---|---|---|
| Ler o prefixo `[Nome]` em `observacoes` | Conferir/ajustar o parser do endpoint de atestados | Agora (já está chegando) |
| Cadastrar os 25 tipos nos 4 grupos | Cadastro no sistema do RH, grafia idêntica | Agora |
| Consumir `documentGroup`/`nomenclature`/`status` na API Global | Opcional, para relatórios | Quando quiser |
| Devolver a decisão ao SGO (3.2) | Programar a chamada `POST /api/integracoes/rh/atestado-situacao` | Agora — o SGO já recebe (v1.197.0) |

Contato técnico do SGO para alinhar os campos da Parte 3: Daniel Soares (daniel.soares@grupobeijaflor.com).
