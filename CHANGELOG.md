# Changelog — SGO Beija Flor

Registro das versões do aplicativo. Convenção de versão: **v{maior}.{menor}.{correção}**
- **correção** (x.y.**z**): ajustes de texto/tela, correção de bugs.
- **menor** (x.**y**.0): melhorias e novas funções dentro de módulos existentes.
- **maior** (**x**.0.0): módulo novo grande / mudança estrutural.

A versão em uso aparece no rodapé do menu e na tela de login.

---

## v1.0.0 — 2026-07-02 (base em produção)
Primeira versão consolidada, já em uso pelos gerentes. Módulos entregues:

- **Dashboard** (gerente: meta/atalhos; CEO/Admin/Supervisor: semáforo/ranking/alertas).
- **Tarefas / Checklists** (geração por dia operacional, conclusão transacional, evidência fotográfica, conferência por IA, correções do dia, histórico).
- **Central de Comunicação** (leitura obrigatória, painel de leitura, conta na meta).
- **Desperdícios**, **Ocorrências**, **Comandas**, **Cancelamento de Cupons**, **Inventário** (Teknisa + Equipamentos), **Notas Recebidas** (QR/código de barras), **Recebimento de Gás**, **Coleta de Óleo**.
- **Pagamentos** (freelancer/HE/avulso, delegação, relatório de freelancers).
- **Pessoas**: Escala (planejado/realizado/comparação), Mapa de Funções (quadro padrão, mapa em tempo real/dia+hora/projeção, freelancers do dia), **Central de Atestados** (foto + IA, CID restrito ao RH, painel, relatório).
- **POPs** + **Treinamentos** (por setor, conta na meta).
- **Metas** (ranking, minha meta, histórico, export).
- **Auditoria**, **Configurações** (unidades, usuários, perfis de acesso, cadastros dos módulos, fornecedores, LGPD).
- **Central de Notificações** (sino + badges).
- **IA** (leitura de atestados e conferência de fotos de checklist) ligada em produção.
- Publicado em https://sgorestaurantesgbf.com.br (Docker + Cloudflare Tunnel), backup diário do banco.

## v1.0.1 — 2026-07-03 (correções)
### Corrigido
- **Treinamentos por setor**: POP marcado como "inicial" **e** com setor aparecia para todos os colaboradores. Agora "inicial" e "setorial" são **exclusivos** (escolher setor = não é inicial), reforçado no servidor e no editor de POP. Os 2 POPs de teste foram corrigidos para setoriais.
- **Mapa da unidade**: quando há gente no quadro padrão mas ninguém escalado, o aviso agora explica que o mapa segue a **Escala** e orienta a cadastrá-la (antes o mapa só ficava vazio sem explicação).
### Adicionado
- **Versão do app** visível no rodapé do menu e na tela de login; `CHANGELOG.md`.

<!--
## v1.1.0 — (em desenvolvimento)
### Adicionado
### Alterado
### Corrigido
-->
