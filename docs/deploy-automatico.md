# Deploy automático (CI/CD) — publicar o SGO sem tocar no CEO

Desde 24/07/2026 o SGO publica **sozinho** para todos os usuários quando o código
entra na branch `main`. Quem tem acesso de edição no GitHub pode publicar sem
precisar de acesso ao servidor.

## Como funciona (o fluxo)

```
editar (localhost) → git push / merge na main → GitHub Actions:
   1. builda a imagem (no próprio GitHub, não pesa no servidor)
   2. envia a imagem para o droplet por uma chave TRAVADA
   3. backup do banco → migra (Prisma) → sobe só o sgo_app
   4. checa a saúde; se falhar, reverte sozinho para a versão anterior
```

- **Autonomia:** qualquer colaborador com acesso de escrita publica ao subir na `main`.
- **Versionamento:** cada publicação marca uma imagem `sgo-sgo-app:vX.Y.Z` no servidor
  (a versão vem de `src/lib/version.ts`) e o Git guarda o histórico completo.
- **Rollback:** ver abaixo.

## Segurança — por que NÃO toca no CEO

- O GitHub acessa o servidor por uma **chave dedicada travada** (`forced command`):
  ela só consegue rodar `/opt/sgo/ci-deploy.sh` — **não abre terminal, não lista
  containers, não lê arquivos, não enxerga a plataforma do CEO**. Testado: qualquer
  comando que não seja `deploy`/`rollback`/`health` é recusado.
- O script de deploy só mexe em `sgo_app` / `sgo_postgres` (compose do SGO). Nunca
  nos containers `bjf_*`.
- Os segredos (chave, host) ficam em **GitHub → Secrets**, nunca no código.

## Configuração (uma vez) — Secrets no GitHub

Em **Settings → Secrets and variables → Actions → New repository secret**, crie:

| Secret | Valor |
|---|---|
| `DEPLOY_HOST` | `174.138.88.225` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_SSH_KEY` | a chave PRIVADA de deploy em **base64** (uma linha só — gere com `base64 -w0 sgo_deploy_key`). Usar base64 evita corromper a chave na colagem. |
| `DEPLOY_KNOWN_HOSTS` | `174.138.88.225 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKM+1war16Xo9KpC+/lBkrCdRbV6SV+E/Qw7l4y4+mza` |

Depois de criar os secrets, todo push na `main` publica automaticamente.
(A chave privada é de deploy — mesmo travada, guarde só nos Secrets, nunca no código.)

## Avisos a cada publicação

- **No SGO (in-app):** a cada publicação bem-sucedida, os **ADMIN/CEO** recebem uma
  notificação no sino com a versão e quem publicou (feito pelo `ci-deploy.sh`).
- **Por e-mail (opcional):** se os secrets de e-mail estiverem configurados, a esteira
  envia um e-mail em toda publicação (OK ou falha). Sem os secrets, o passo é ignorado
  (não atrapalha o deploy). Secrets de e-mail (SMTP do Gmail/Workspace):

  | Secret | Valor |
  |---|---|
  | `SMTP_USERNAME` | seu e-mail (ex.: `voce@grupobeijaflor.com.br`) |
  | `SMTP_PASSWORD` | uma **senha de app** do e-mail (não a senha normal) |
  | `NOTIFY_EMAIL` | para quem enviar (pode ser o mesmo e-mail) |
  | `SMTP_SERVER` | opcional (padrão `smtp.gmail.com`) |
  | `SMTP_PORT` | opcional (padrão `465`) |

  Senha de app do Google: conta com verificação em 2 etapas → "Senhas de app" →
  gerar uma para "Correio". Cole essa senha em `SMTP_PASSWORD`.

## Rollback — voltar uma versão

1. GitHub → aba **Actions** → workflow **"Voltar versão (rollback)"** → **Run workflow**.
2. Informe a versão (ex.: `v1.40.0`) e confirme. É instantâneo (não rebuilda).
- Só funciona para versões já publicadas (as imagens ficam guardadas no servidor).
- Se um deploy quebrar a saúde do app, ele **reverte sozinho** para a versão anterior.

## Segurança extra do banco

Antes de cada publicação o robô faz um **backup do banco** (`/opt/sgo/backups/predeploy-*.dump`,
mantém os 10 últimos), além do backup diário. Migrações que só ADICIONAM colunas/tabelas
são seguras de reverter (o código antigo ignora o que é novo); mudanças destrutivas de
banco pedem cuidado extra na revisão.

## Arquivos
- `.github/workflows/deploy.yml` — publica no push da `main`.
- `.github/workflows/rollback.yml` — rollback manual.
- Servidor: `/opt/sgo/ci-deploy.sh` (script travado), chave em `/root/.ssh/authorized_keys`.
