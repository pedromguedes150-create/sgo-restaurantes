# Integração GBF-RH → SGO Restaurante (ENTRADA) — o que o RH pode nos enviar hoje

> Documento pedido pelo RH em 14/10/2026 (item B do prompt). Descreve o que **já existe**
> no SGO Restaurante para receber dados do RH. Nada aqui foi alterado nesta versão — é o
> retrato do código em `src/app/api/integracoes/rh/[evento]/route.ts` e `src/lib/rh/inbound.ts`.
> O envio no sentido contrário (SGO → RH, fila de saída) está em `docs/integracao-rh-saida.md`.

## 1. Endpoints existentes (`/api/integracoes/rh/...`)

Todos são `POST`, corpo JSON, resposta JSON. A base de produção é `https://sgorestaurantesgbf.com.br`.

| Método | Caminho | O que faz no SGO |
|---|---|---|
| POST | `/api/integracoes/rh/inclusao` | Admissão: cria ou reativa o colaborador (por CPF **ou** matrícula) e vincula à unidade cuja razão social no RH é a enviada |
| POST | `/api/integracoes/rh/desligamento` | Desligamento: inativa o colaborador pelo CPF |
| POST | `/api/integracoes/rh/periodo-aquisitivo` (ou `periodo_aquisitivo`) | Só registra o evento (períodos aquisitivos são derivados da admissão no SGO; o corpo fica guardado para conferência) |
| POST | `/api/integracoes/rh/exclusao-periodo` (ou `exclusao_periodo`) | Só registra o evento |
| POST | `/api/integracoes/rh/atestado-situacao` (ou `atestado_situacao`) | **v1.197.0** — a DECISÃO do RH sobre um documento da Central de Atestados e Afins (em análise, validado, correção solicitada, não aceito, concluído). Muda a situação no SGO, avisa o gerente e, no "não aceito", tira a marcação da Escala. Ver 3.5 |

Qualquer outro `{evento}` responde `404 {"error":"Evento desconhecido: ..."}`.

Não existem endpoints de entrada para **férias**, **alterações cadastrais** nem **atestados** vindos do RH.
Hoje esses dados chegam ao SGO pelo **sync por consulta** (o SGO lê `GET {RH}/api/ext/colaboradores/unidade/<razão social>`
uma vez por dia com a chave `RH_API_KEY`): status "Férias"/"Afastado" do RH viram períodos na Escala por esse caminho.

**Desligamento sem evento (v1.171.0).** Quem está ativo no SGO e a lista da unidade **não devolve mais** é procurado na
lista geral (`GET {RH}/api/ext/colaboradores`) pela matrícula, na mesma sincronização: status de desligamento → inativado
na hora; ativo em outra razão social → transferido de unidade; ativo numa razão social da própria unidade → nada (a lista da
unidade veio incompleta); ausente nas duas → só conta, e inativa depois de 3 dias distintos, nunca mais de 30% dos ativos
da unidade numa rodada. Lista geral com erro ou vazia não conta dia nenhum. O evento `desligamento` deste documento
continua sendo o caminho preferido: chega na hora e sem adivinhação.
Se o RH passar a enviar esses eventos, será preciso criar os endpoints (ver seção 6).

## 2. Autenticação

- Header aceito: `Authorization: Bearer <token>` **ou** `x-api-key: <token>`.
- Variável de ambiente que guarda o token no SGO: **`RH_INBOUND_TOKEN`** (no `.env` do servidor; nunca no Git).
- Sem a variável configurada, **tudo responde 401** (o SGO não aceita chamada sem token).
- **Não há assinatura HMAC** (`x-signature`) — a autenticação é só pelo token.
- A rota não exige sessão de usuário (prefixo `/api/integracoes` é público para o middleware; o token é a porta).

Resposta sem/with token errado: `401 {"error":"Não autorizado"}`.

## 3. Corpo e respostas

### 3.1 `inclusao` (admissão)

```json
{
  "nome": "Maria da Silva",
  "cpf": "12345678901",
  "matricula": "20519",
  "cargo": "Auxiliar de cozinha",
  "admissao": "2026-10-01",
  "unidade": "COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA"
}
```

- Obrigatórios: `nome` e (`cpf` com 11 dígitos **ou** `matricula`). CPF pode vir com pontuação (só os dígitos são usados).
- `unidade` (aceita também `razao_social`): a razão social **exatamente como está no RH**; o SGO casa com a principal ou com as adicionais cadastradas em Configurações → Unidades. Se não casar, o colaborador é criado/atualizado mas fica **sem unidade** e os Admins são avisados.
- `admissao`: `AAAA-MM-DD`; outro formato é ignorado.

Respostas:
- `200 {"status":"processado","colaboradorId":"...","criado":true|false}`
- `400 {"error":"Payload inválido: informe nome e cpf (11 dígitos) ou matricula"}`

### 3.2 `desligamento`

```json
{ "cpf": "12345678901" }
```

Respostas:
- `200 {"status":"processado","colaboradorId":"..."}` (com `"jaEstavaDesligado":true` quando já estava inativo)
- `400 {"error":"CPF inválido"}` · `400 {"error":"Colaborador com CPF informado não encontrado"}`

### 3.3 `periodo-aquisitivo` e `exclusao-periodo`

Corpo livre (JSON). O SGO guarda tudo e responde `200 {"status":"recebido"}`. Não altera nada.

### 3.5 `atestado-situacao` (v1.197.0) — a decisão do RH volta ao SGO

Todo documento que o SGO envia a `POST /api/integracoes/sgo/atestados` leva um `sgoMovimentoId` (o id do
documento no SGO). Quando o RH analisar, chama:

```json
{
  "sgoMovimentoId": "id do documento no SGO (o mesmo recebido no envio)",
  "sgoEventId": "sgoEventId do envio original (opcional)",
  "rhAtestadoId": "id do documento no RH (opcional; o SGO grava)",
  "situacao": "em_analise | validado | correcao_solicitada | nao_aceito | concluido",
  "motivo": "ilegivel | foto_cortada | incompleto | colaborador_incorreto | datas_divergentes | documento_complementar | classificacao_revisar | outro",
  "observacao": "texto curto para o GERENTE, sem CID nem diagnóstico (até 500 caracteres)",
  "nomenclaturaRh": "nome do tipo como o RH classificou (opcional, grafia do catálogo do SGO)",
  "data": "2026-11-09T14:30:00-03:00"
}
```

Regras:
- `motivo` e `observacao` são **obrigatórios** em `correcao_solicitada` e `nao_aceito`; nos demais, opcionais.
- `observacao` aparece na tela do gerente. O SGO **recusa com 400** texto que contenha CID (padrão da CID-10, ex.: "J11", "M54.5") ou a palavra "CID".
- `nomenclaturaRh` com um nome do catálogo (25 nomes, em `docs/para-o-rh-central-atestados-afins-v1.196.0.md`) **reclassifica** o documento no SGO (grupo e tipo acompanham). Nome fora do catálogo fica só registrado na linha do tempo, sem aplicar.
- Repetição (mesmo documento, mesma situação, mesmo motivo e observação) responde `200 {"repetido":true}` e não gera aviso novo.
- `nao_aceito` tira o documento da Escala (os dias voltam ao planejado). Um `validado` depois faz a Escala voltar a marcar.
- Quando o gerente **corrige e reenvia** (botão na tela), o SGO manda ao RH um `acao: "atualizar"` com o MESMO `sgoMovimentoId`, `sgoEventId` NOVO e o anexo novo; o RH atualiza o documento existente e, após a nova análise, manda a situação de novo.

Respostas:
- `200 {"status":"processado","sgoMovimentoId":"...","situacao":"CORRECAO_SOLICITADA"}` (+ `"repetido":true` na repetição; + `"diasDesmarcadosNaEscala":N` no não aceito)
- `400 {"error":"motivo é obrigatório em correcao_solicitada — use ..."}` · `400 {"error":"observacao não pode conter CID ou dado médico — ela aparece para o gerente"}`
- `404 {"error":"Documento não encontrado no SGO","sgoMovimentoId":"..."}`

Efeitos no SGO: situação do documento (Histórico da Central e `GET /api/v1/atestados` → `status`, `statusMotivo`, `statusNote`), linha do tempo em `medical_certificate_events`, aviso ao gerente que lançou (ou aos gerentes da unidade), registro em `rh_inbound_events` e na Auditoria (`CERTIFICATE_RH_RETURN`).

### 3.4 Erros gerais

- Corpo não-JSON ou vazio: `400 {"error":"Payload inválido"}`.
- Todo evento (processado, recebido ou com erro) fica registrado em `rh_inbound_events` e aparece em
  Configurações → APIs & Integrações → "Últimos eventos".

## 4. O que o SGO já recebe do RH hoje

- Pelo caminho acima, o SGO recebe **admissões e desligamentos** quando o RH os dispara (as URLs estão
  configuradas no painel do RH pelo time do RH). Não há **restrição por IP/endereço de origem**: qualquer
  origem com o token em `RH_INBOUND_TOKEN` é aceita. O endereço de origem de cada chamada não é gravado.
- Pelo sync diário por consulta (não é "receber", é o SGO lendo): colaboradores, cargo, status
  (Ativo/Férias/Afastado/Aposentado/Em desligamento/desligado) e admissão, com a chave `RH_API_KEY`.
- Também existe um **webhook de férias SGO → RH** (saída, não entrada): `POST {RH_WEBHOOK_FERIAS_URL}` com
  `Authorization: Bearer <SGO_WEBHOOK_TOKEN>`, disparado ao solicitar/cancelar férias no SGO. Melhor esforço, sem fila.

## 5. Valores do campo `type` do atestado

O atestado no SGO (`medical_certificates.type`, enum `CertificateType`) tem **três** valores:

| `type` | Significado no SGO | `tipoDetalhe` enviado ao RH (saída) |
|---|---|---|
| `FULL_DAY` | Dias inteiros de afastamento (atestado médico) | `FULL_DAY` → RH grava "Médico" |
| `HOURS` | Atestado de horas / comparecimento (não afasta o dia todo) | `HOURS` → RH grava "Comparecimento" |
| `COMPANION` | Acompanhamento de familiar (declaração de comparecimento) | `COMPANION` → RH grava "Falta justificada" |

`GET /api/v1/atestados` devolve exatamente esses valores. O texto do catálogo (`GET /api/v1`) dizia
"DAYS | HOURS | COMPANION" por engano de descrição — corrigido na v1.168.0 para `FULL_DAY | HOURS | COMPANION`.
Nenhum dado nem endpoint da API v1 mudou.

## 6. Se o RH passar a enviar mais eventos (ainda não existe)

Para admissões/alterações/desligamentos/férias/atestados das pessoas de restaurante, lanchonete e
fábrica/CD, o caminho natural é **o mesmo**: `POST /api/integracoes/rh/<evento>` com o token
`RH_INBOUND_TOKEN`. Hoje `inclusao`, `desligamento` e `atestado-situacao` (v1.197.0) alteram dados. Quando o RH definir o
formato de `alteracao` e `ferias`, eles entram em `src/lib/rh/inbound.ts` com o mesmo registro e a
mesma autenticação — sem mudar o que já funciona.
