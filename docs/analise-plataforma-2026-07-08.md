# SGO Beija Flor — Análise completa da plataforma e sugestões

> Escrita em 07/07/2026 (noite), após a conclusão do lote de ajustes jul/2026 (Ondas 1–4).
> App em produção: **v1.12.0** em https://sgorestaurantesgbf.com.br
> Para revisão do Pedro na manhã de 08/07.

---

## 1. O que a plataforma é hoje

O SGO cobre, de ponta a ponta, a rotina operacional de uma rede de churrascarias:

- **Rotina diária do gerente**: checklists por dia operacional (com evidência de foto e IA de padrão de produtos), desperdícios com foto da balança, conferência de comandas em grade, recebimento de notas (QR/código de barras), gás, óleo, **troco (novo)** — tudo alimentando a **meta mensal** com pesos configuráveis.
- **Gestão de pessoas completa**: sync automático com o RH, escala mensal (planejado × realizado), mapa de funções derivado da escala em tempo real, atestados com IA e absenteísmo, desligamentos com aprovação, período de experiência, **avaliação mensal do colaborador (novo)**, **comissões/mobilidade (novo)**, férias e trocas de escala com **ponte para o RH via registro + notificação (novo)**.
- **Supervisão**: ocorrências com gravidade, manutenção (chamados + preventiva), central de comunicação com confirmação de leitura, e agora a **Rotina do Supervisor (novo)** — painel de aderência dos gerentes, visitas com feedback e checklists de visita.
- **Governança**: auditoria imutável, perfis × módulos, LGPD (CID restrito, termos), exports PDF/Excel em quase tudo, central de treinamento 🎓 por perfil, backup diário agendado.

São **23 módulos concluídos**. A arquitetura é consistente: model snapshot denormalizado → lib com escopo por unidade no servidor → API dispatch → página server + client component; CRUD admin em tudo; auditoria em toda ação crítica.

## 2. O que subiu hoje (07/07) — v1.8.0 → v1.12.0

| Versão | Entrega |
|---|---|
| v1.8.0 | **Avaliação do colaborador** (item 13): observações do dia a dia + avaliação mensal (4 critérios 1–5★, histórico 12m). Conta na meta com **peso 0 por padrão** — nada muda nas notas até você ligar |
| v1.9.0 | **Mudanças de função/setor → RH** (item 12): campo Função no Mapa; setor muda na hora, função vira solicitação (o sync do RH sobrescreve o cargo — decisão de arquitetura); registro consolidado |
| v1.10.0 | **Comissões & Mobilidade** (item 14, dashboard + histórico); **Solicitar férias ao RH** (item 11); **Trocas de escala → RH** (item 15). Onda 3 fechada |
| v1.11.0 | **Gestão de Troco** (item 16): caixas em cadeia, divergência = alerta crítico ao supervisor + admins, dashboard por unidade |
| v1.12.0 | **Rotina do Supervisor** (item 17, 3 fases): painel de uso, visitas + feedbacks, checklists de visita (Config) |

Cada versão passou por: migração validada em shadow DB → lint sem cache (0 erros) → typecheck → build limpo do container → migração na prod via psql (registrada no Prisma) → deploy → verificação (health 200 local+público, versão no /login, **CEO 307 intacto em todas**).

### ⚠️ Decisões que tomei sozinho hoje — valide quando puder
1. **Avaliação (13)**: 4 critérios fixos (Pontualidade, Desempenho, Trabalho em equipe, Apresentação/higiene). Fácil trocar os nomes/quantidade se quiser.
2. **Meta das avaliações**: mês corrente nunca penaliza (dá tempo de avaliar); mês fechado sem avaliação penaliza usando o headcount *atual* da unidade (aproximação — o histórico de headcount não existe).
3. **Função (12)**: NÃO edito o cargo localmente (o sync diário do RH reverteria); é solicitação + notificação. A tela avisa isso ao gerente.
4. **Troco (16)**: cadeia única por unidade (um caixa aberto por vez; o troco "pernoita"). **Se alguma unidade opera 2+ caixas físicos simultâneos, o modelo precisa de ajuste** (ex.: cadeia por "ponto de caixa"). Validar com a operação.
5. **Painel de uso (17-A)**: cobertura de desperdício/comandas = dias com lançamento ÷ dias decorridos do mês (até ontem). Unidade que fecha 1 dia/semana nunca chega a 100% — se isso incomodar, dá para descontar dias sem operação.
6. **Visitas (17-B)**: recorrência automática ficou de fora (agendamento manual + destaque de atrasadas). Refino sugerido abaixo.

## 3. Pendências (nada novo — consolidado)

**Produção/segurança (bloqueiam liberar usuários reais):**
1. Trocar senhas de demonstração dos usuários seed.
2. Rotacionar `RH_API_KEY` (exposta em prints) e a chave Anthropic.
3. Definir `BACKUP_MIRROR_DIR` no `.env` para completar o 3-2-1 (backup diário já roda às 03:00).
4. Push para o GitHub (com você — 6 commits locais de hoje: `710ca91`…`11b7075`).

**Funcionais:**
5. PWA/FCM (push no celular) — pendência antiga.
6. API real do RH para férias/mudanças/trocas (itens 11/12/15 já estão prontos para plugar).
7. Testes: a suíte existente não foi rodada hoje (exige Postgres descartável na 5433; procedimento seguro documentado). Os módulos novos não ganharam testes dedicados.

## 4. O que pode melhorar — visão de quem agora conhece a plataforma inteira

**a) O celular do gerente ainda não "grita" (PWA/FCM).** A plataforma gera alertas valiosos — divergência de troco, comunicado urgente, checklist vencendo, manutenção atrasada — mas tudo morre no sino in-app. Push é o multiplicador de valor nº 1 de tudo que já existe.

**b) O CEO não tem uma página "minha rede em 60 segundos".** O dashboard atual é bom para o dia; falta a visão mensal executiva: ranking de metas + uso (Fase A) + absenteísmo + desperdício + divergências de troco + custo de manutenção, por unidade, em uma tela/PDF. Quase tudo já está calculado — é composição, não construção.

**c) Aderência é o calcanhar de Aquiles de qualquer sistema operacional.** A Fase A mostra quem não usa; o próximo passo natural é o sistema *cobrar sozinho*: resumo semanal automático para o supervisor ("unidade X está 3 dias sem lançar desperdício") via scheduler — o motor de schedulers já existe.

**d) Módulos novos sem exports.** Troco, Comissões, Avaliações e Visitas nasceram sem PDF/Excel — o padrão da casa é ter. Rápido de fazer (reuso do padrão print + xlsx).

**e) Recorrência de visitas (17-B).** "A cada N dias por unidade" com aviso de vencida ao supervisor — espelho exato do `MaintenancePlan` que já existe; baixo esforço.

**f) Avaliações → decisões.** A avaliação mensal ganha força quando aparece: média da unidade no painel do supervisor, nota do colaborador no relatório de desligamento (já puxa tempo de casa e atestados) e no período de experiência.

**g) Higiene técnica (sem urgência):** `package.json` ainda diz 1.3.2 (a versão real vive em `src/lib/version.ts` — ou alinhar, ou ignorar de vez); os 3 builds de hoje mostraram `PrismaClientInitializationError` benignos no "collecting page data" (páginas force-dynamic, exit 0 — dá para silenciar com um guard, cosmético); testes de integração para as regras novas (cadeia do troco em concorrência, meta das avaliações).

## 5. Sugestões para amanhã (08/07) — em ordem

| # | Sugestão | Por quê | Esforço |
|---|---|---|---|
| 1 | **Higiene de produção**: senhas demo + rotação RH_API_KEY/Anthropic + `BACKUP_MIRROR_DIR` + push GitHub | Bloqueia usuários reais; risco real; 30–60 min | 🟢 baixo |
| 2 | **Rodar a suíte de testes** (Postgres descartável) + testes das regras novas (troco/avaliação-meta) | 5 versões subiram hoje sem rodar testes — verificação pendente | 🟢 baixo |
| 3 | **Validar comigo as 6 decisões da seção 2** (em especial troco multi-caixa e critérios da avaliação) | Ajustar agora é barato; depois de dados lançados, migra | 🟢 baixo |
| 4 | **Exports dos módulos novos** (Troco, Comissões, Visitas — Excel/PDF) | Completa o padrão da casa; supervisor vai pedir | 🟢 baixo |
| 5 | **Recorrência de visitas** (espelho do MaintenancePlan) | Fecha o "recorrente" prometido na Fase B | 🟡 médio |
| 6 | **Resumo semanal automático de aderência** p/ supervisores (scheduler) | Transforma a Fase A de painel passivo em cobrança ativa | 🟡 médio |
| 7 | **Dashboard executivo mensal do CEO** (1 tela + PDF) | Maior valor percebido por R$ de esforço para a diretoria | 🟡 médio |
| 8 | **PWA/FCM push** | Multiplicador de tudo; é o maior item, merece um dia dedicado | 🔴 alto |

Minha recomendação de pauta para amanhã: **1 → 2 → 3 de manhã** (higiene + verificação), e à tarde escolher entre **4+5** (rápidos, fecham o lote com acabamento) ou partir direto para **7** (dashboard CEO) se a prioridade for impressionar a diretoria. O item 8 (push) vale ser agendado como um bloco próprio.

---
*Gerado autonomamente na sessão de 07/07 — todas as entregas verificadas em produção; plataforma do CEO intocada (307 em todos os deploys).*
