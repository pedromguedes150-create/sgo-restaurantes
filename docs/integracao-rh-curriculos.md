# Central de Currículos — integração SGO Restaurante ↔ sistema do RH

Versão do SGO: v1.212.0 · Documento para o time do sistema do RH (GBF-RH).

O gerente da unidade cadastra o candidato no SGO e anexa o currículo (PDF, JPG ou PNG).
O RH **lê** esses cadastros e arquivos, faz toda a análise **no sistema do RH** e **devolve a
situação** ao SGO, que a mostra ao gerente. O SGO não tem tela de análise e não muda situação
por conta própria.

São dois sentidos, e cada um usa uma credencial que **já existe** na integração dos atestados:

| Sentido | O que é | Credencial |
|---|---|---|
| RH lê do SGO | lista de currículos + arquivo | chave da **API Global** do SGO, header `X-API-Key` |
| RH avisa o SGO | mudança de situação | **token de entrada** do RH, header `Authorization: Bearer <token>` |

Base: `https://sgorestaurantesgbf.com.br`

---

## 1. Ler os currículos — `GET /api/v1/curriculos`

Header: `X-API-Key: <chave da API Global>`

A chave precisa ter a **leitura de currículos liberada** pelo administrador do SGO
(Configurações → APIs & Integrações → API Global → "Liberar currículos" na chave do RH).
Sem isso a resposta é `403`. Sem chave válida, `401`.

Parâmetros (todos opcionais):

| Parâmetro | Exemplo | Efeito |
|---|---|---|
| `atualizadoDesde` | `2026-11-18T00:00:00-03:00` | só o que foi criado/alterado a partir desse instante (para sincronizar aos poucos) |
| `situacao` | `recebido` | só essa situação |
| `unidade` | id da unidade no SGO | só essa unidade |
| `page`, `limit` | `1`, `50` | paginação (limite máximo 200) |

Resposta `200`:

```json
{
  "total": 1,
  "page": 1,
  "limit": 50,
  "situacoes": ["recebido", "em_analise", "primeira_etapa_concluida", "entrevista_agendada", "em_avaliacao_final", "aprovado", "reprovado", "banco_de_talentos", "desistencia", "contratado"],
  "dados": [
    {
      "sgoCurriculoId": "cmxxxxxxxxxxxxxxxxxxxxxxx",
      "criadoEm": "2026-11-18T14:02:11.000Z",
      "atualizadoEm": "2026-11-18T14:02:11.000Z",
      "unidade": { "id": "…", "nome": "…", "cnpj": "00.000.000/0001-00", "nomeNoRh": "RAZÃO SOCIAL NO RH" },
      "encaminhadoPor": "Nome do gerente",
      "candidato": { "nome": "Nome Completo", "telefone": "31999999999" },
      "cargoPretendido": "Auxiliar de Cozinha",
      "observacaoDoGerente": "candidato entregou o currículo presencialmente",
      "situacao": "recebido",
      "situacaoDesde": "2026-11-18T14:02:11.000Z",
      "entrevistaEm": null,
      "rhCandidatoId": null,
      "arquivo": { "tipo": "application/pdf", "url": "/api/v1/curriculos/cmxxxxxxxxxxxxxxxxxxxxxxx/anexo" }
    }
  ]
}
```

- `sgoCurriculoId` é o identificador único do currículo no SGO. Guarde-o: é por ele que a situação volta.
- `unidade.cnpj` e `unidade.nomeNoRh` são os mesmos identificadores de unidade usados nos atestados.
- `telefone` vem só com dígitos (DDD + número).

## 2. Baixar o arquivo — `GET /api/v1/curriculos/{sgoCurriculoId}/anexo`

Header: `X-API-Key: <a mesma chave>`

Devolve o arquivo em si (`Content-Type` = `application/pdf`, `image/jpeg` ou `image/png`), até 15 MB.
A primeira vez que o RH baixa o arquivo fica registrada no histórico do currículo
("O RH abriu o currículo") — o gerente vê isso.

`404` se o currículo não existe; `403` se a chave não tem a leitura liberada.

---

## 3. Devolver a situação — `POST /api/integracoes/rh/curriculo-situacao`

Header: `Authorization: Bearer <token de entrada do RH>` (o mesmo usado em `atestado-situacao`)
`Content-Type: application/json`

```json
{
  "sgoCurriculoId": "cmxxxxxxxxxxxxxxxxxxxxxxx",
  "situacao": "entrevista_agendada",
  "entrevistaEm": "2026-11-25T14:00:00-03:00",
  "observacao": "Levar documento com foto",
  "rhCandidatoId": "12345"
}
```

| Campo | Obrigatório | Regra |
|---|---|---|
| `sgoCurriculoId` | sim* | o id recebido na leitura. *Pode ser omitido se `rhCandidatoId` já tiver sido informado num evento anterior. |
| `situacao` | sim | uma das dez da lista abaixo, exatamente como escrita |
| `entrevistaEm` | não | data e hora em ISO 8601; use junto com `entrevista_agendada` |
| `observacao` | não | texto curto (até 500 caracteres) que o gerente vai ler |
| `rhCandidatoId` | não | o id do candidato no sistema do RH; o SGO guarda e devolve na leitura |

Situações aceitas:

| `situacao` | O gerente vê |
|---|---|
| `recebido` | Recebido |
| `em_analise` | Em análise |
| `primeira_etapa_concluida` | 1ª etapa concluída |
| `entrevista_agendada` | Entrevista agendada |
| `em_avaliacao_final` | Em avaliação final |
| `aprovado` | Aprovado |
| `reprovado` | Reprovado |
| `banco_de_talentos` | Banco de talentos |
| `desistencia` | Desistência |
| `contratado` | Contratado |

Respostas:

| Status | Significado |
|---|---|
| `200` `{ "status": "processado", "sgoCurriculoId": "…", "situacao": "…" }` | gravado; o gerente foi avisado |
| `200` com `"repetido": true` | o mesmo evento já tinha chegado; nada foi duplicado (pode reenviar sem medo) |
| `400` | corpo inválido — a mensagem diz o que corrigir (situação fora da lista, data inválida, sem id) |
| `401` | token de entrada ausente ou diferente do gravado no SGO |
| `404` | currículo não encontrado no SGO |

O que o SGO faz ao receber: muda a situação, grava a linha no histórico do currículo (imutável),
marca a data da última sincronização e notifica o gerente que encaminhou (ou os gerentes da
unidade, se ele não estiver mais ativo).

---

## 4. Como testar

1. O administrador do SGO libera a leitura de currículos na chave do RH.
2. `GET /api/v1/curriculos?limit=5` → deve vir `200` com a lista.
3. Baixe um arquivo pelo `arquivo.url`.
4. `POST /api/integracoes/rh/curriculo-situacao` com `em_analise` para um `sgoCurriculoId` real.
5. No SGO, o evento aparece em Configurações → APIs & Integrações → "Eventos recebidos", e o
   currículo muda de situação na Central de Currículos.

## 5. Dados pessoais

Nome, telefone e currículo de candidato são dados pessoais. Trafegam só por HTTPS, só para a chave
com a leitura liberada, e cada chamada fica registrada no SGO (sistema, endpoint, data e hora — a
chave nunca). O arquivo fica em área privada do servidor do SGO e não é acessível por link direto.
