# Bem-vindo ao SGO Beija Flor — roteiro para começar a desenvolver

Este arquivo é para quem entra no time de desenvolvimento do SGO (Sistema de Gestão
Operacional das churrascarias). Ele complementa o `CLAUDE.md`, que o Claude Code lê
sozinho em toda sessão e que é a fonte das regras do projeto. Leia os dois.

## 1. O que você precisa ter

| Item | Por quê |
|---|---|
| Acesso de escrita ao repositório `pedromguedes150-create/sgo-restaurantes` no GitHub | Toda mudança entra por Pull Request. **Atenção:** PR com CI verde faz merge e publica em produção sozinho. Escrita no repositório é, na prática, permissão de deploy. |
| Usuário do Claude Code (o Pedro cria) | O Claude Code é a ferramenta de trabalho. Instale, faça login, abra a pasta do projeto. |
| Node 20 ou mais novo | O projeto roda com Node 25 nas máquinas atuais. |
| Docker Desktop | O PostgreSQL de desenvolvimento sobe num container. |
| Git com Credential Manager | Para `git push` sem digitar senha. |
| GitHub CLI (`gh`), opcional | Facilita abrir PR. Sem ele, o Claude abre pela API do GitHub. |

**O que você NÃO precisa e não deve pedir:** chave SSH do servidor de produção, `.env` de
produção, `ANTHROPIC_API_KEY`, `RH_API_KEY`. Nada disso é necessário para desenvolver. Sem a
chave da IA, as funções de visão (leitura de atestado, conferência de padrão) ficam inertes e
todo o resto funciona.

## 2. Subir o projeto na sua máquina

```bash
git clone https://github.com/pedromguedes150-create/sgo-restaurantes.git
cd sgo-restaurantes
npm install
```

Copie `.env.example` para `.env`. Para desenvolver, basta preencher:

- o bloco `POSTGRES_*` e `DATABASE_URL` (na sua máquina qualquer porta serve; a 5433 do exemplo
  existe porque a máquina do Pedro tem outro Postgres na 5432);
- `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` com duas strings aleatórias longas.

Depois:

```bash
docker compose up -d        # Postgres do SGO
npx prisma migrate dev      # cria o schema
npm run db:seed             # unidades, usuários e dados de exemplo
npm run dev                 # http://localhost:3100
```

Logins de teste do seed (senha `Beijaflor@123`): `admin@beijaflor.com.br`,
`supervisor@beijaflor.com.br`, `gerente@beijaflor.com.br`, `financeiro@beijaflor.com.br`,
`ceo@beijaflor.com.br`.

Os testes de integração rodam contra o banco do `DATABASE_URL`, então o Postgres precisa estar
no ar para `npm test`.

## 3. Como o trabalho acontece

1. **Leia a seção do módulo em `docs/especificacao.md`** antes de codar.
2. **Plano curto antes de implementar**, e aguarde o ok de quem pediu.
3. **Toda branch nasce de `origin/main` atualizada**: `git fetch origin && git checkout -b feat/descricao origin/main`.
   Nunca reuse uma branch já mesclada (o merge é squash; reusar gera conflito e o CI nem roda).
   Nunca faça push na `main`: a proteção bloqueia.
4. Antes de subir, rode as quatro checagens e **confira pelo código de saída**, não pelo texto:

   ```bash
   npx tsc --noEmit; echo $?
   npx next lint --no-cache; echo $?
   npm run lint:ds; echo $?
   npm test; echo $?
   ```

   `next lint` tem 7 avisos antigos de `no-img-element` que não bloqueiam; erro bloqueia.
   `lint:ds` são os guards de design system e de fronteira cliente/servidor. O CI roda os mesmos.
5. **Cada entrega sobe a versão** em `src/lib/version.ts` e ganha uma entrada no `CHANGELOG.md`,
   uma frase no guia da plataforma (`src/lib/guide.ts`, a aba Ajuda que o usuário vê) e, se mudou
   o escopo de um módulo, a linha dele na tabela do `CLAUDE.md`.
6. Commit em português no padrão `feat:`/`fix:`/`refactor:`, com o corpo explicando o porquê.
7. Abra o PR para a `main`. CI verde → auto-merge → deploy em produção. Acompanhe até o
   `/api/health` responder. Rollback pela aba Actions → "Voltar versão (rollback)".

No Claude Code, dizer **"finaliza e sobe"** dispara essa sequência inteira; o `CLAUDE.md`
descreve o gatilho.

Migrações de banco: basta commitar o arquivo gerado por `npx prisma migrate dev --name ...`;
elas sobem sozinhas no deploy. **Migração destrutiva** (drop/rename de coluna) só combinada
com o Pedro antes.

## 4. Regras inegociáveis (resumo; a lista completa está no CLAUDE.md)

- Escopo por unidade (`unitId`) **sempre no servidor**, nunca só na tela.
- Lógica diária usa a **data operacional** da unidade (corte 04:00), não a data do relógio.
- Ações críticas vão para o Log de Auditoria.
- Permissão nasce na matriz de perfis (`src/lib/permissions*`): rota nova precisa de dono no
  mapa `REGRAS` ou de motivo escrito em `FORA_DA_MATRIZ`; há um teste que quebra se faltar.
- Interface em português, mobile-first, componentes do design system (`src/components/ui/ds`).
- Segredos só em `.env`, nunca no Git.

## 5. Trabalhando em paralelo com outras pessoas

Hoje há mais de uma frente de desenvolvimento ao mesmo tempo. Para não pisar no pé:

- **Combine a área antes de começar.** Cada pessoa pega um módulo; dois PRs no mesmo arquivo
  viram conflito.
- **Rebase antes de abrir o PR** (`git fetch origin && git rebase origin/main`). Se a `main`
  andou e o seu PR ficou "dirty", rebase de novo, resolva e `git push --force-with-lease`.
- **Número de versão colide.** Se a `main` já passou do número que você usou, renumere para o
  próximo livre no `version.ts`, no `CHANGELOG.md`, no `guide.ts` e no `CLAUDE.md` antes de
  reenviar.
- **A memória do Claude é por máquina.** O que o Claude aprendeu na máquina de outra pessoa não
  chega ao seu. Regra permanente do projeto vai no `CLAUDE.md`, que viaja no repositório.

## 6. Onde ler mais

- `CLAUDE.md`: regras, status de cada módulo, fluxo de entrega, ambiente de produção.
- `docs/especificacao.md`: a especificação completa, módulo a módulo.
- `docs/deploy-auto-merge.md`: como a esteira publica.
- `CHANGELOG.md`: o histórico, versão a versão, com o porquê de cada mudança.
- Aba **Ajuda** dentro do sistema: o guia por perfil que o usuário final lê.
