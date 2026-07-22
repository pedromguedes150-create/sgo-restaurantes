# Pendências de produção — passo a passo (para o Pedro)

> Atualizado em 07/07/2026 (tarde). O que dependia só de mim já foi feito:
> ✅ `BACKUP_MIRROR_DIR` configurado para `G:\Meu Drive\SGO Backups` (Google Drive → nuvem) e backup testado — **3-2-1 completo** (local + drive externo/nuvem, criptografado).
> ✅ Build cache do Docker limpo (−6,5 GB internos).
> O restante exige ações suas (consoles externos / comunicação com a equipe):

## 1. Trocar senhas de demonstração (antes de liberar usuários reais)
Não fiz sozinho para não trancar ninguém fora do sistema durante sua ausência.
- Em **Configurações → Usuários**, edite cada usuário seed/demonstração e defina senha forte.
- Faça o SEU (admin) primeiro; depois os demais, anotando/enviando as novas senhas por canal seguro (não WhatsApp aberto).
- Alternativa: me peça amanhã que eu gere senhas fortes e aplique via script, com você presente.

## 2. Rotacionar a RH_API_KEY (exposta em prints)
- Peça ao fornecedor do RH uma **nova chave** (ou gere no painel deles).
- Atualize `RH_API_KEY=` no `.env` da raiz do projeto.
- `docker compose -f docker-compose.prod.yml up -d` (recria só o app, ~10 s) e teste o botão "Sincronizar" em Pessoas.

## 3. Rotacionar a chave Anthropic
- No console (console.anthropic.com) → API Keys → crie nova chave e **revogue a antiga**.
- Atualize `ANTHROPIC_API_KEY=` no `.env` e repita o `up -d`.
- Teste: leitura de atestado por foto ou "Conferir padrão de produtos (IA)" num checklist.

## 4. Push para o GitHub (só do seu terminal)
Há **11 commits locais** de 07/07: v1.8.0 → v1.14.0 + testes + docs.
```
git push origin main
```

## 5. Chaves VAPID do push (v1.38.0) — gerar NO SERVIDOR de produção
As notificações no celular só funcionam com um par de chaves VAPID no `.env` do servidor.
As chaves do `.env` local são de desenvolvimento — **não reaproveite em produção** (a privada já circulou fora do servidor).
```
node scripts/gen-vapid.mjs
```
- Cole as 3 linhas (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) no `.env` de produção e suba o app (`up -d`).
- Sem elas o sistema roda normalmente, só sem push (o sino 🔔 continua igual).
- **Trocar as chaves depois invalida as inscrições já feitas** — cada usuário precisa reativar em Meu Perfil.
- O push exige **HTTPS** (já temos) e, no iPhone, que o usuário instale o app na Tela de Início.

## ⚠️ Avisos de infraestrutura
- **Disco C: com ~6,7 GB livres (95% cheio).** O VHDX do Docker não devolve espaço ao host automaticamente; compactá-lo exige parar o Docker Desktop — **derruba SGO e a plataforma do CEO por minutos**, só fazer combinado e fora de horário. Sugestão alternativa: mover a pasta `backups/` local para outro disco, e apagar downloads/temporários do Windows.
- O backup diário (03:00) agora espelha no Google Drive; confira em alguns dias se o `G:\Meu Drive\SGO Backups` está sincronizando na nuvem (ícone verde no Drive).
