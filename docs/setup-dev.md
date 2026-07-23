# Onboarding — rodar o SGO na sua máquina (para colaboradores)

Guia para quem vai **programar** no SGO. Você só precisa do repositório e do Docker;
nada da plataforma do CEO é necessário nem faz parte deste projeto.

> ⚠️ **Nunca peça o `.env` de produção.** Ele tem segredos reais (chaves, senhas).
> Você roda com valores de desenvolvimento locais, gerados por você.

## Pré-requisitos
- **Node.js 20+** e **npm**
- **Docker Desktop** (para subir o PostgreSQL local)
- **Git**

## Passo a passo

```bash
# 1. Clonar
git clone https://github.com/pedromguedes150-create/sgo-restaurantes.git
cd sgo-restaurantes

# 2. Criar o seu .env a partir do modelo (edite as senhas de DEV)
cp .env.example .env

# 3. Instalar dependências
npm install

# 4. Subir o PostgreSQL local (porta 5433, isolado)
docker compose up -d

# 5. Criar o schema e dados de exemplo
npm run db:migrate
npm run db:seed

# 6. Rodar o app
npm run dev
# abre em http://localhost:3100
```

**Logins de teste** (criados pelo seed, senha `Beijaflor@123`):
- `admin@beijaflor.com.br` — Administrador (vê tudo)
- `gerente@beijaflor.com.br` — Gerente
- `ceo@beijaflor.com.br` — CEO

## Comandos úteis
| Comando | O que faz |
|---|---|
| `npm run dev` | App em http://localhost:3100 |
| `npm test` | Testes (Vitest) |
| `npx tsc --noEmit` | Checagem de tipos |
| `npx next lint --no-cache` | Lint (rodar antes de abrir PR) |
| `npm run db:migrate` | Aplica migrações no seu banco local |
| `npm run db:seed` | Popula dados de exemplo |

## Fluxo de trabalho (importante)
1. **Nunca** trabalhe direto na `main`. Crie uma branch por tarefa:
   ```bash
   git checkout -b feat/minha-tarefa
   ```
2. Commit por funcionalidade, mensagem clara em PT-BR (veja o histórico como exemplo).
3. Antes de abrir o PR: `npx tsc --noEmit` e `npx next lint --no-cache` (0 erros) + `npm test`.
4. `git push origin feat/minha-tarefa` e abra um **Pull Request** no GitHub.
5. O Pedro revisa e faz o merge. **O deploy em produção é feito só pelo Pedro** (o servidor
   também hospeda outra plataforma — ninguém mais tem acesso ao servidor).

## Regras do projeto (leia antes de codar)
- **`CLAUDE.md`** na raiz — contexto, regras inegociáveis e o status de cada módulo.
- **`docs/especificacao.md`** — a especificação de cada módulo. Leia a seção antes de mexer.
- **`CHANGELOG.md`** — atualize a cada release/funcionalidade.
- Interface 100% PT-BR, mobile-first, tema claro. Multi-seleção usa o componente `MultiSelect`.
- Escopo por unidade (`unit_id`) SEMPRE aplicado no servidor.
- Segredos só em `.env` (fora do Git).

## Migrações de banco
Ao mudar o `prisma/schema.prisma`, gere a migração localmente:
```bash
npx prisma migrate dev --name descricao_curta
```
Isso cria a pasta em `prisma/migrations/`. Commite a migração junto com o código.
**Não** aplique nada direto no banco de produção — isso faz parte do deploy do Pedro.
