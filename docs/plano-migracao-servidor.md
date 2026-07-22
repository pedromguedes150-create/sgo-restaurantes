# Plano de Migração do SGO para o novo servidor — SEM perda e SEM parada percebida

> Pedido no pacote 16/07 (após o rompimento de internet de 4 dias). O CEO já está migrando a plataforma dele para um servidor on-line seu; o SGO vai depois destes ajustes.
> **Princípios: nada será executado sem você; ensaio completo antes; rollback pronto em cada passo; janela de madrugada.**

## O que compõe o SGO hoje (o que precisa viajar)
1. **Banco PostgreSQL** (`sgo_postgres`, volume `sgo_db_data`) — TODOS os dados.
2. **Uploads/fotos** (volume `sgo_uploads`, ~113 MB hoje) — evidências, atestados, anexos.
3. **Código** (repositório Git — já espelhável via push).
4. **Segredos** (`.env`: chaves RH, Anthropic, tokens de integração, senha do banco, passphrase do backup).
5. **Publicação** (túnel Cloudflare + DNS `sgorestaurantesgbf.com.br`).
6. **Agendados**: tarefa de backup 03:00 + watchdog do túnel (recriar no novo servidor).

## Pré-requisitos no servidor novo (antes de qualquer migração)
- [ ] Docker + Docker Compose funcionando; disco com folga (≥50 GB livres — o C: atual está em 95%!).
- [ ] Acesso meu (ou seu com meus comandos) por terminal.
- [ ] Cloudflare: criar um **túnel próprio do SGO** (independente do túnel do CEO — fim do acoplamento que derruba os dois juntos) como serviço/systemd com auto-restart.
- [ ] Backup 3-2-1 replicado lá (tarefa agendada + espelho no Drive).

## Fase 0 — Ensaio (sem tocar na produção)
1. Restaurar o **backup mais recente** (dump + uploads) no servidor novo.
2. Subir o stack completo (`docker-compose.prod.yml`) apontando para um subdomínio de teste (ex.: `homolog.sgorestaurantesgbf.com.br`).
3. **Checklist de verificação funcional** (login, checklist, foto, desperdício, comandas, RH sync, notas, relatórios, mobile).
4. Você navega e valida. Só avançamos com seu OK.

## Fase 1 — Migração real (janela de madrugada, ~30–60 min de leitura-somente)
1. **Aviso prévio aos gerentes** (comunicado no próprio SGO, 1 dia antes).
2. `T-0`: colocar o SGO atual em modo leitura (banner "manutenção programada") — ou simplesmente escolher 03:00–04:00 (uso ~zero).
3. **Dump final** do banco + rsync final dos uploads (delta — rápido).
4. Restaurar no novo; subir o stack; rodar o checklist de verificação (10 min).
5. **Virar o DNS**: apontar `sgorestaurantesgbf.com.br` para o túnel novo (TTL baixo preparado na véspera → propagação em minutos).
6. Verificação pós-virada (health, login, 1 lançamento de teste real, mobile).
7. O servidor antigo **fica intacto por 14 dias** como rollback instantâneo (voltar o DNS = voltar tudo).

## Rollback (em qualquer ponto)
- Antes da virada de DNS: nada mudou para os usuários — apagar o ambiente novo e recomeçar.
- Depois da virada: voltar o DNS para o túnel antigo (minutos). Dados criados no novo durante a janela: exportar o delta (por isso a janela de madrugada + leitura-somente).

## Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Perda de dados na virada | Dump final DENTRO da janela + antigo preservado 14 dias |
| DNS demorar a propagar | TTL reduzido na véspera; túnel novo testado no subdomínio antes |
| Integração RH quebrar (IP/URL) | URLs públicas não mudam (mesmo domínio); tokens iguais no .env |
| Esquecerem agendados | Checklist inclui backup + watchdog + scheduler interno (instrumentation roda no app, migra junto) |
| Disco/recursos insuficientes no novo | Validado na Fase 0 com o stack completo rodando |

## O que decidir antes de marcar
1. Qual o servidor novo (specs, onde roda, quem acessa)?
2. Túnel Cloudflare próprio do SGO (recomendo) ou reaproveitar o modelo atual?
3. Data da janela (sugestão: madrugada de um dia de menor movimento).
4. Quero fazer a Fase 0 (ensaio) já na próxima oportunidade — me diga quando o servidor estiver de pé.

---

## Execução assistida (noite de 22/07) — PRONTO, aguarda só sua autorização

**Scripts prontos no repositório:**
- `scripts/pre-migracao-export.sh` — empacota TUDO do servidor atual (dump do banco `-Fc`, volume de uploads, `.env`, compose, Dockerfile, estado das migrações) numa pasta transferível. **Não derruba nada**; roda com o SGO no ar.
- `scripts/restore-migracao.sh <pasta>` — no servidor NOVO: restaura banco + uploads e sobe o app.

**Sequência da noite (quando você autorizar):**
1. `bash scripts/pre-migracao-export.sh` → gera o pacote (mando o caminho).
2. Você me passa o **acesso ao servidor novo** (IP/SSH ou como prefere) — sem isso não dá para restaurar do outro lado.
3. Transfiro o pacote e rodo `restore-migracao.sh` no novo servidor.
4. Subo o app, confiro `/api/health` local.
5. **Cutover do túnel Cloudflare**: apontar o ingress do SGO para o novo servidor (as rotas do CEO ficam intactas) e conferir `https://sgorestaurantesgbf.com.br`. Reiniciar o cloudflared derruba o CEO por ~5s — combinar o instante.
6. Janela escolhida: madrugada (gerentes fora). Rollback: o servidor atual continua de pé até validarmos o novo (só troco o DNS/ingress de volta).

**O que eu preciso de você para executar:** (a) sua autorização; (b) acesso ao servidor de destino; (c) confirmar se o túnel do CEO pode piscar ~5s no cutover.
