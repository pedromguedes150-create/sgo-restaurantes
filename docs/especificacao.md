# SGO Beija Flor — Especificação (v3.0 Final Consolidada)

> Fonte: `SGO_Prompt_ClaudeCode_v3.md`. Sempre leia a seção do módulo antes de codar.

## Contexto
SGO (Sistema de Gestão Operacional) para a Rede Beija Flor — rede familiar de restaurantes/churrascarias (6–15 unidades, em crescimento). Centraliza e mede a gestão operacional, substituindo WhatsApp/planilhas. Gerente opera pelo celular; diretoria tem visão consolidada.

Hospedagem: servidor próprio do cliente, que **já roda em produção a plataforma do CEO** (intocável). SGO instalado no mesmo servidor, subdomínio dedicado, isolamento total.

## Princípios inegociáveis
1. Não derrubar/conflitar com a plataforma do CEO. Inspecionar antes de instalar.
2. Mobile-first absoluto (gerentes no celular).
3. Simplicidade operacional (baixo letramento digital, ≤3 toques).
4. Tema claro, PT-BR. Verde `#1B4332`, dourado `#C9A84C`, fundo `#FFFFFF`, superfície `#F5F5F5`, crítico `#DC2626`, médio `#F59E0B`, sucesso `#16A34A`.
5. Responsivo (tablet/desktop p/ admin/diretoria).
6. Arquitetura modular e portátil (Docker; migração à nuvem sem reescrita).

## Stack
- Front: React + TS + Tailwind + shadcn/ui (Next.js full-stack)
- Banco: PostgreSQL 16 em Docker, base única, escopo por `unit_id` SEMPRE no servidor
- Auth: JWT + refresh + bcrypt
- Push: FCM + Central de Notificações in-app (fallback garantido)
- Storage: volume Docker local (fotos, anexos, POPs)
- IA: Claude API — modelo via VARIÁVEL DE AMBIENTE (nunca fixo no código)
- PWA: Service Worker offline + HTTPS
- Infra: Docker Compose, reverse proxy com HTTPS. Prod `sgo.SEUDOMINIO.com.br`, Homolog `sgo-homolog.SEUDOMINIO.com.br`
- Integrações: API REST do RH (disponível); Teknisa por importação manual (PDF/CSV/Excel, sem API)

## Fase 0 — Infraestrutura (antes de qualquer módulo)
- 0.1 Inspeção do ambiente existente (SO, docker ps, portas, proxy, certificados, disco)
- 0.2 Isolamento total (containers/rede/banco/volumes próprios; nada publicado direto; segredos em `.env`)
- 0.3 Docker Compose de referência (prod) + compose de homologação separado
- 0.4 Backups 3-2-1 (pg_dump diário + uploads, criptografado offsite, cópia local, teste de restauração mensal, retenção 30 diários + 12 mensais)
- 0.5 Resiliência (no-break, religar após queda, `restart: unless-stopped`, `/api/health`)
- 0.6 Monitoramento externo (UptimeRobot → `/api/health`)
- 0.7 Segurança do servidor (firewall 80/443, SSH por chave, fail2ban, updates, acesso físico restrito)
- 0.8 Portabilidade (tudo containerizado)

## Perfis de acesso
| Perfil | Visibilidade | Permissões |
|---|---|---|
| CEO/Diretoria | Todas (consolidado) | Leitura total + relatórios + auditoria |
| Administrador | Todas | Configs globais, cadastros, metas, POPs, importações |
| Supervisor | Unidades sob gestão | Aprovações, encerramentos, relatórios |
| Coordenador | Sua(s) unidade(s) | Acompanhamento, sem aprovação |
| Gerente | Sua(s) unidade(s) | Operação diária, lançamentos, solicitações |
| Financeiro | Sem acesso operacional | Recebe notificações de demandas aprovadas |

Visibilidade por vínculo (regra no servidor). Admin/CEO veem tudo. Colaborador multi-unidade respeitado.

## Conceitos transversais
1. **Data Operacional** — hora de corte por unidade (padrão 04:00); antes do corte = dia operacional anterior. Tudo usa data operacional.
2. **Calendário de Operação** — tarefas pelos dias de funcionamento (incl. fins de semana/feriados), nunca "dia útil". Fechamentos excepcionais não geram tarefa nem penalizam meta.
3. **Fuso** — UTC no banco, exibição no fuso da unidade (padrão America/Sao_Paulo).
4. **Central de Notificações in-app** — toda push também registrada (fonte garantida). Críticas destacadas até leitura.
5. **Conflito offline** — vale o primeiro sincronizado; segundo é avisado, nada sobrescrito silenciosamente.
6. **Evidência fotográfica configurável** — Admin marca tarefa "exige evidência"; foto pela câmera anexa ao registro (integridade da meta).

## Navegação (bottom nav)
`[ Dashboard ] [ Tarefas ] [ Módulos ] [ Pessoas ] [ Configurações ]`

## Módulos (resumo — detalhe no documento original)
- **0 Dashboard** — gerente (anel de progresso, alertas, indicadores, meta do mês); CEO/Admin (semáforo por unidade, ranking, tendências, alertas críticos). Atualização 60s.
- **1 Checklists/Tarefas** — job gera tarefas por dia de operação, data operacional, conclusão transacional, "não realizada" automática, push 30min antes, exige evidência.
- **2 Desperdícios** — categorias (Self-Service/Clientes/Lanchonete/Cozinha), KG por categoria, 1 lançamento/unidade/dia, alerta >20% vs média 7 dias.
- **3 Comandas** — sequência por unidade, informar ausentes, divergência → alerta supervisor, ciclo de vida (perdida/recuperada/reposição).
- **4 Cancelamento de Cupons** — importa Teknisa, vira pendência de justificativa, motivos configuráveis.
- **5 Inventário** — registro de execução (feito/não feito), agendado pelo Admin.
- **6 Ocorrências** — nº sequencial/unidade, tipo→categoria, gravidade 🟢🟡🔴⚫, anexos, encerramento com ação corretiva, reincidência <30 dias.
- **7 Pagamentos** — Freelancers, Horas Extras (API RH, valor estimado), Avulsos; delegação de aprovação por período.
- **8 Notas Recebidas** — QR/chave 44 dígitos (principal) + foto/IA Claude (fallback), tela de confirmação obrigatória.
- **9 Pessoas** — API RH: Férias, Escalas (somente leitura, planejado vs realizado), Mapa de Funções, Comissões, Mobilidade.
- **10 POPs** — blocos (texto/imagem/vídeo/checklist), confirmação de leitura, versionamento.
- **11 Metas** — `Score = Σ(realizadas×peso)/Σ(previstas×peso)×100`; fechamentos excepcionais fora do denominador; evidência exigida pontua só com foto.
- **12 Log de Auditoria** — login/logout, CRUD, aprovações, encerramentos, uploads, configs, acessos a dados sensíveis. Imutável.
- **13 Configurações + LGPD** — unidades, usuários, operação, pessoas/pagamentos, inventário, POPs, metas, LGPD (retenção, anexos sensíveis, termo), importações Teknisa.

## LGPD (transversal)
Termo no 1º login (aceite registrado); minimização; anexos sensíveis restritos; retenção configurável (padrão 12 meses); direitos do titular (export/exclusão pelo Admin); acessos auditados; hospedagem no Brasil.

## Requisitos técnicos gerais
- Segurança: JWT+refresh, bcrypt ≥12, escopo por unidade no servidor em TODA consulta, uploads validados, ações críticas auditadas.
- Performance: <3s em 4G, paginação >20 itens, imagens ≤1MB, índices nas colunas de filtro.
- Offline/PWA: formulários offline + sync + regra de conflito; iOS exige PWA instalado (push) + central in-app fallback.
- Exportações: PDF com logo/unidade/período, CSV/Excel.
- Notificações: FCM + central obrigatória; ⚫ Crítica não desativável.

## Ordem de desenvolvimento
0. Fase 0 — Infra ← começar aqui
1. Auth + Estrutura base
2. Dashboard inicial
3. Checklists + Notificações
4. Desperdícios
5. Ocorrências
6. Comandas
7. Cancelamento de Cupons
8. Pagamentos
9. Notas Recebidas
10. Pessoas (API RH)
11. POPs
12. Metas
13. Log de Auditoria (estrutura desde a Fase 1)
14. Inventário
15. Configurações + LGPD

## Instruções de execução
- Inspeção Fase 0.1 antes de subir containers; não alterar plataforma do CEO sem confirmação.
- Design system antes das telas; componentes reutilizáveis (StatusBadge, AlertCard, ApprovalFlow, UserAvatar, ModuleHeader).
- Todo módulo alimenta o dashboard e tem mini-dashboard interno.
- Seeds realistas: 3 unidades, um usuário por perfil, 30 dias de histórico.
- Testes das regras sensíveis: data operacional, escopo por unidade, meta, conclusão transacional, ciclo de comandas.
- Commit por funcionalidade + tag por módulo. Preparado p/ escalar a 50+ unidades.
