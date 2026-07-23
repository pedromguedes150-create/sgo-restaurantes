# Cutover do SGO para o droplet — estado e passo final (22/07/2026)

## O que JÁ está pronto no droplet (174.138.88.225)

| Item | Estado |
|---|---|
| Código | v1.39.0 (`git archive` do commit `1f82065`) em `/opt/sgo/app` |
| Imagem | `sgo-sgo-app:v1.39.0` + tag `latest` — **o build passa lá** (o que falhava na máquina Windows) |
| Banco | `sgo_postgres` restaurado do dump de 22/07 21:48 UTC — contagens idênticas à origem (users 36, task_instances 1853, notifications 7642, audit_logs 4323, collaborators 317) |
| Migrações | 56 → **60** (products, cancellation_analysis, web_push, cashier_role) |
| Uploads | volume `sgo_uploads` com 432,4 MB / 765 arquivos — fotos servidas com sucesso pelo app |
| App | `sgo_app` healthy em `127.0.0.1:3100` (nenhuma porta pública — regra nº 9) |
| VAPID | chaves de **produção geradas no próprio servidor**; a privada nunca saiu de lá |
| Caddy | bloco do SGO adicionado (backup `Caddyfile.bak-pre-sgo-*`), `caddy validate` OK, reload gracioso — **CEO respondeu 307 antes e depois, sem restart** |
| Rede | `bjf_caddy` conectado à rede `sgo` (aditivo) — alcança `sgo_app:3100` |
| Backup | `/opt/sgo/backup-sgo.sh` + cron diário 06:00 UTC (03:00 BRT), retenção 14 dias, testado |
| Swap | +4 GB temporários (`/swapfile-sgo`, **não** no fstab) para o build nunca pressionar a RAM do CEO |

## ✅ CUTOVER CONCLUÍDO — 23/07/2026 01:35 UTC (22/07 22:35 BRT)

- DNS trocado para **A → 174.138.88.225, DNS only** (apex + www) pelo Pedro.
- Certificado Let's Encrypt (produção) emitido. **Pegadinha:** o Caddy estava em backoff de 30 min
  das tentativas feitas *antes* do DNS virar, e `caddy reload` **não** limpa esse backoff (nem apagar
  os locks em `/data/caddy/locks`). Foi preciso `docker restart bjf_caddy` — **CEO fora por 2 s**,
  cert emitido em ~20 s.
- Verificado no domínio público, logado como admin: dashboard com a rede toda, Produtos, Conferência
  por leitor, Cancelamentos, Análise de comandas em aberto, Perfil, Ajuda — todos 200; foto real
  servida (JPEG 253 KB); push configurado com a chave de produção; PWA (sw/manifest/ícone) 200.
- Delta final aplicado antes da virada: contagens idênticas às da origem
  (users 36, task_instances 1853, notifications 7679, audit_logs 4325, collaborators 317).
- `sgo_app` da máquina Windows **parado** para não rodar scheduler em paralelo (evita aviso ao RH e
  notificação duplicados). Banco e volumes preservados para rollback.
- CEO verificado em cada etapa: 307 antes e depois de cada mudança.

## Histórico: o passo que faltava (DNS)

Hoje `sgorestaurantesgbf.com.br` está **proxied na Cloudflare** apontando para o túnel da máquina Windows
(resolve para 104.21.x / 172.67.x). O domínio do CEO, por comparação, aponta **direto** para o droplet
(174.138.88.225, DNS-only) — é por isso que o Caddy consegue emitir certificado para ele.

**Mudança necessária (painel Cloudflare, zona sgorestaurantesgbf.com.br):**
- `sgorestaurantesgbf.com.br` → registro **A** → `174.138.88.225` — **DNS only (nuvem cinza)**
- `www` → **A** → `174.138.88.225` — **DNS only**
- (remover os CNAME para `095cb96a….cfargotunnel.com`)

O cinza é importante: o Caddy está retentando o certificado a cada 60s e o desafio `tls-alpn-01`
não passa pelo proxy da Cloudflare. Com o DNS apontando para cá e sem proxy, o certificado sai em segundos.

O `cert.pem` do cloudflared local só autoriza a zona do CEO — por isso **não consigo fazer essa troca**.

## Sequência do corte (quando o DNS for trocado)

1. **Delta final** (eu executo, ~2 min): novo dump da produção Windows → restaura por cima no droplet.
   Isso captura tudo que foi lançado depois das 21:48 UTC. Sem ele, esses lançamentos se perdem.
   ```
   docker exec sgo_postgres pg_dump -U sgo -d sgo -Fc | ssh -i ~/.ssh/bjf_vps root@174.138.88.225 'cat > /opt/sgo/pkg/delta.dump'
   ssh … 'docker exec sgo_postgres psql -U sgo -d postgres -c "DROP DATABASE sgo WITH (FORCE)" && … CREATE DATABASE … && pg_restore …'
   ```
   (uploads: rsync do delta — poucos arquivos novos)
2. Trocar o DNS conforme acima.
3. Verificar: `https://sgorestaurantesgbf.com.br/login` 200 + v1.39.0, login real, e o CEO em 307.
4. **Rollback**: voltar os CNAME do túnel. A máquina Windows fica intacta e no ar por 14 dias.

## Depois do corte (pendências)
- Desligar o ingress do SGO no `~/.cloudflared/config.yml` da máquina Windows (só depois de validado).
- Espelho do backup em nuvem: o droplet já tem `rclone` com remote `gdrive:` (do CEO) — definir se o SGO usa a mesma conta.
- Trocar as senhas de demonstração (`docs/pendencias-producao.md`).
- Push: os gerentes precisam instalar o app e ativar em Meu Perfil (guia em `/ajuda`).
