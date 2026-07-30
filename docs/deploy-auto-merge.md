# Deploy automático sem merge manual — guia para o Pedro (admin)

> Objetivo: fazer o PR ir para produção **sozinho quando o CI passar**, sem depender
> do Pedro clicar em "Merge". Só o **dono/admin do repositório** consegue ligar isto
> (exige permissões de admin). O restante (build, migração, publicação no site) já é
> automático via `.github/workflows/deploy.yml`.

## ⚠️ Leia antes de ligar
Isto **remove o único portão humano** antes de publicar para **todos os restaurantes**,
num servidor que **também hospeda a plataforma do CEO**. Depois de ligado, qualquer PR
que fique com o **CI verde** entra na `main` e **vai para produção automaticamente**,
**sem revisão de ninguém**. Ligue com consciência disso. A configuração recomendada
abaixo exige o CI verde (tsc + lint + testes), mas **não** exige aprovação humana — é o
que elimina a ação do Pedro.

## Peças já preparadas neste repositório
- **`.github/workflows/ci.yml`** — roda em todo PR para a `main`: sobe um Postgres
  efêmero, aplica migrações e roda `tsc` + `next lint` + `npm test`. O job se chama
  **`verificacoes`** — é o status check que a branch protection vai exigir.
- **`.github/workflows/automerge.yml`** — liga o auto-merge nativo do GitHub em cada PR
  (fica **inerte** até os passos abaixo).
- **`.github/workflows/deploy.yml`** — já existente: no push da `main`, builda a imagem,
  envia ao droplet e o comando remoto `deploy` **migra + sobe + avisa**. Publica em
  https://sgorestaurantesgbf.com.br.

## Passo a passo (tudo com a conta admin do Pedro)

### 1. Mergear estes workflows primeiro
Faça o merge do PR que traz `ci.yml`/`automerge.yml`/este guia **manualmente** (ainda no
modelo atual). É preciso que o CI rode **pelo menos uma vez** num PR para o check
`verificacoes` aparecer na lista de status checks do próximo passo.

### 2. Ligar o auto-merge no repositório
Settings → **General** → seção *Pull Requests*:
- ✅ **Allow auto-merge**
- ✅ **Allow squash merging** (o `automerge.yml` usa `--squash`)
- (opcional) ✅ *Automatically delete head branches*

### 3. Criar o token que dispara o deploy (importante)
O merge feito pelo `GITHUB_TOKEN` padrão **não dispara** o `deploy.yml` (regra do GitHub
para evitar recursão). Por isso o auto-merge usa um **PAT**:
1. Crie um **fine-grained PAT** (Settings → Developer settings → Fine-grained tokens),
   com acesso **só a este repositório** e permissões: **Contents: Read and write** +
   **Pull requests: Read and write**.
2. Repositório → Settings → **Secrets and variables → Actions** → **New repository secret**:
   - Nome: **`AUTOMERGE_TOKEN`**
   - Valor: o PAT gerado.

### 4. Criar a branch protection na `main`
Settings → **Branches** → **Add branch ruleset** (ou *Add rule*) para `main`:
- ✅ **Require status checks to pass before merging**
  - Marque o check **`verificacoes`** (aparece após o passo 1).
  - (opcional) ✅ *Require branches to be up to date before merging*.
- ❌ **NÃO** marque *Require a pull request review before merging* — se marcar, o
  auto-merge fica esperando aprovação e **você continua tendo que agir**.
- ✅ *Do not allow bypassing the above settings* (opcional, para valer inclusive p/ admin).

> Resultado: um PR aberto pelo colaborador tem o auto-merge ligado pelo `automerge.yml`;
> quando o `verificacoes` fica verde, o GitHub mergeia sozinho na `main`; o push na `main`
> dispara o `deploy.yml`; a versão sobe em produção. **Sem ação do Pedro.**

## Como testar (uma vez)
1. Abra um PR bobo (ex.: mudar um texto) a partir de uma branch.
2. Veja o `automerge.yml` rodar e o PR mostrar *"auto-merge enabled"*.
3. Quando o `verificacoes` ficar verde, o PR mergeia sozinho.
4. Confira o `deploy.yml` rodando e o e-mail/di­gsite atualizado.

## Como reverter (voltar o portão humano)
- Desligue **Allow auto-merge** (passo 2) **ou** remova/edite o ruleset (passo 4) para
  exigir aprovação, **ou** apague `automerge.yml`. Qualquer um volta o merge para manual.

## Ressalvas
- **CI e segredos**: se algum teste passar a depender de variável de ambiente (ex.: chave
  de API), adicione-a como secret e exporte no `ci.yml`. Hoje os testes só precisam do
  `DATABASE_URL` (já provido pelo Postgres efêmero do job).
- **Migrações**: continuam aplicadas **no deploy remoto** (`deploy.yml` → comando `deploy`
  no droplet). O Postgres do CI é só para os testes; não tem relação com produção.
- **Plataforma do CEO**: nada aqui toca no CEO — o deploy só roda o script do SGO no
  servidor. Mas lembre que auto-publicar sem revisão aumenta o risco de subir um bug para
  produção; a rede de segurança passa a ser só o CI (tsc + lint + testes).
