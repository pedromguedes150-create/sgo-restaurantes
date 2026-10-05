# SGO Beija Flor (Restaurantes) — Análise geral do sistema

> Versão analisada: **v1.154.0** (05/10/2026) · em produção desde 12/06/2026
> Documento feito para **comparar com outro sistema**. A seção final traz um prompt pronto para essa comparação.
> Sem dados sensíveis: não há senhas, chaves, endereços de servidor nem dados de colaboradores.

---

## 1. O que é

O SGO (Sistema de Gestão Operacional) é a plataforma de gestão da operação de uma **rede de restaurantes e churrascarias**, pensada para 6 a 15 unidades. Ela também atende um Centro de Distribuição (CD), uma lanchonete e uma pizzaria. O sistema cobre o dia a dia da unidade: checklists, desperdício, comandas, cofre e notas. Cobre também pessoas (escala, férias, hora extra, atestados, pagamentos) e a gestão da rede (metas, painéis executivos, supervisão e auditoria).

**Princípios de desenho que valem para o sistema todo**
- **Escopo por unidade sempre no servidor.** Cada perfil só vê e grava nas unidades a que pertence, inclusive quando tenta acessar por URL.
- **Data operacional por unidade.** O dia vira às 04:00, não à meia-noite, porque restaurante fecha de madrugada.
- **Calendário de operação.** Fins de semana contam; o sistema nunca usa "dias úteis".
- **Auditoria imutável** das ações críticas, com quem, quando, o antes e o depois.
- **Números derivados, não copiados.** Variação de preço, saldo de férias, faixa de validade e estoque de massas são calculados na leitura. Por isso uma correção retroativa se propaga sozinha.
- **Nada some calado.** Exclusão é lógica ou bloqueada quando há histórico, e registro sem dono é apontado na tela.
- **Interface 100% em português, pensada primeiro para o celular**, com a identidade visual da rede (bordô e grafite).

---

## 2. Números do sistema

| Item | Quantidade |
|---|---|
| Telas (páginas) | 128 |
| Rotas de API | 147 |
| Módulos/partes com permissão própria na matriz | 91 |
| Tabelas (modelos de dados) | 154 |
| Migrações de banco aplicadas | 123 (todas aditivas ou combinadas) |
| Arquivos de teste automatizado | 216 |
| Testes automatizados | 2.340 (todos passando) |
| Linhas de código (TypeScript) | ~100 mil |
| Versões publicadas | 154 (≈ 1 a 3 por dia útil de desenvolvimento) |
| Perfis de acesso nativos | 8 (+ perfis personalizados criados pelo Admin) |

---

## 3. Tecnologia e infraestrutura

| Camada | Escolha |
|---|---|
| Aplicação | Next.js 14 (front e back no mesmo projeto), TypeScript, React 18 |
| Visual | Tailwind + design system próprio ("kit de layout") com tema claro e escuro |
| Banco | PostgreSQL 16 com Prisma (ORM e migrações) |
| Autenticação | JWT com refresh token e senhas com bcrypt |
| Inteligência artificial | Claude (Anthropic) para leitura de fotos e PDFs; o modelo é configurável por ambiente |
| Celular | PWA instalável, com notificação push (Web Push / VAPID) |
| Planilhas | Exportação e importação Excel (SheetJS) e PDF pela impressão do navegador |
| Publicação | Docker num servidor em nuvem (VPS), atrás de proxy com HTTPS automático |
| Qualidade | CI no GitHub: tipos, lint, 7 guardas de design system e testes com banco efêmero |
| Entrega | PR verde → mescla automática → publicação automática; rollback por botão |

**Pontos de atenção de infraestrutura**
- **Um servidor só** (2 vCPU / 8 GB), compartilhado com outra plataforma da empresa. Não há alta disponibilidade.
- **Backup diário automático com 14 dias de retenção, mas no mesmo servidor.** A cópia externa está preparada e ainda não foi ligada.

---

## 4. Perfis de acesso e permissões

**Perfis nativos**
- **CEO e Administrador:** acesso total.
- **Supervisor:** acompanha várias unidades e aprova.
- **Coordenador:** aprova e paga pela unidade.
- **Gerente:** opera a unidade.
- **Financeiro:** paga e concilia na rede.
- **Caixa:** só a conferência de comandas.
- **Separador do CD:** só a fila do seu setor.

**Matriz de permissões perfil × módulo** com "Ver" e "Editar":
- cobre 91 partes, entre módulos, abas internas e telas de configuração;
- vale no menu, na tela **e na API** (71+ rotas conferem a matriz);
- um teste automatizado falha se uma tela ou rota nova ficar sem dono.

**Perfis personalizados**
- O Admin cria perfis herdando as regras de negócio de um perfil base.
- Isso preserva, por exemplo, quem pode aprovar pagamento ou encerrar ocorrência.

---

## 5. Módulos (o que o sistema faz)

### 5.1 Início e comunicação
- **Dashboard / Central da rede:**
  - indicadores clicáveis, já filtrados;
  - alertas agrupados;
  - unidades ordenadas por gravidade;
  - home do gerente organizada para o turno.
- **Minha área:** tarefas pessoais com lembrete, bloco de notas e consulta de folgas e férias.
- **Central de Comunicação:**
  - comunicados com confirmação de leitura obrigatória, prioridade, anexos e resposta exigida;
  - painel de quem leu, cobrança com 1 clique;
  - conta na meta.
- **Central de Notificações:** aviso dentro do sistema e push no celular, com preferências por categoria.
- **Treinamento da Plataforma:** guia por perfil dentro do sistema, atualizado a cada versão.

### 5.2 Tarefas, checklists e treinamento
- **Checklists por dia operacional:**
  - conclusão transacional (sem duplicidade);
  - foto de evidência;
  - "não realizada" automática;
  - tolerância de prazo;
  - biblioteca de modelos com importação e exportação Excel.
- **Conferência de padrão por foto (IA):** compara a foto da vitrine com a foto de referência do produto.
- **Higiene por QR Code público.**
- **POPs (procedimentos):**
  - editor de blocos (texto rico, checklist, imagem, vídeo);
  - versionamento e confirmação de leitura.
- **Treinamentos:**
  - por função, setor ou pessoa;
  - **módulos dentro do POP**, cada um com o seu público (a pessoa é medida só pelo que se aplica a ela);
  - painel da rede e PDF.
- **Padronização de Preparo (fichas técnicas):**
  - importação de ficha por foto ou PDF com IA, sempre conferida por uma pessoa;
  - histórico de alterações.

### 5.3 Operação da unidade
- **Desperdícios em duas frentes que nunca se somam:** Restaurante em kg e Salgados em unidades.
  - Fotos por procedimento; cobrança configurável no Restaurante e obrigatória nos Salgados.
  - Alerta quando passa de 20% sobre a média de 7 dias.
  - **Painel com três abas:**
    - **Resumo;**
    - **Conferência:** mapa unidade × dia, com a foto de cada lançamento;
    - **Performance:** subiu ou caiu pela média por dia lançado, tendência de 6 meses, por tipo, motivo, turno e dia da semana.
- **Comandas:**
  - contagem diária em grade ou por **leitor de código de barras**;
  - divergência com apuração;
  - cruzamento com comandas em aberto, para indício de fraude.
- **Cancelamento de cupons:**
  - importação do PDV (Teknisa) e justificativa obrigatória;
  - análise antifraude e ranking por operador.
- **Gestão de Troco (cofre):**
  - contagem por cédula e moeda;
  - metas por "balde";
  - trocas validadas com o escritório;
  - retirada para pagamento proibida e alertada.
- **Despesas:** retiradas do cofre com comprovante; a devolução é registrada pelo escritório.
- **Ocorrências:**
  - número por unidade, gravidade em 4 níveis, anexos, reincidência e fases de andamento;
  - tratamento **em lote**;
  - subáreas Manutenção e TI;
  - PDF por ocorrência.
- **Manutenção:** chamados com custo e prazo, e plano preventivo com aviso de vencimento.
- **Coleta de óleo:** comprovante obrigatório, conferência lado a lado com o recibo e painel em litros e R$.
- **Recebimento de gás:**
  - preço real por kg;
  - variação recalculada pela série, inclusive com nota retroativa;
  - faixa de plausibilidade contra erro de digitação;
  - contratos com % cumprido e o que ficou de fora;
  - relatório por unidade.
- **Controle de Pizzas:**
  - fechamento por canal (PDV × iFood) e tamanho por **link sem login**;
  - controle de **massas** com estoque derivado, validade por lote, desperdício e correção retroativa com motivo.

### 5.4 Suprimentos
- **Notas recebidas:**
  - leitura da chave da NF-e por QR Code ou código de barras;
  - vencimentos com alerta;
  - análise e exportação.
- **Catálogo e Pedidos internos:**
  - um cadastro com vários códigos de barras;
  - pedido por embalagem (unidade, fardo, display, caixa);
  - **pedido dividido automaticamente por destino** (Fábrica × CD) e por setor do CD.
- **Cadastro e classificação:**
  - cadastro provisório pelo gerente;
  - fila de pendências e detecção de duplicados;
  - **setor do CD proposto pela IA e aprovado pelo Coordenador**.
- **Separação no CD:**
  - fila por setor;
  - romaneio por setor e da carga;
  - conferência opcional;
  - status recebido → em separação → separado → conferido → em trânsito → recebido.
- **Estoque operacional:**
  - validade por lote com faixas (30/7/2 dias, vencido);
  - "tratativa" do alerta em vez de baixa por venda (não há PDV integrado);
  - transferência entre unidades;
  - entrada a partir do recebimento do pedido.
- **Inventário de equipamentos:** entradas e saídas, estoque mínimo e folha de contagem.

### 5.5 Pessoas
- **Integração com o RH:**
  - sincronização diária automática por unidade (cadastro, função, admissão, status);
  - **nunca inativa alguém só porque não veio na resposta** (proteção criada após um incidente);
  - webhooks de admissão e desligamento;
  - diagnóstico da integração.
- **Perfil 360 do colaborador:**
  - tempo de empresa, função, unidade, férias, hora extra (12 meses), mobilidade, comissão, avaliação, atestados, treinamentos, escala;
  - linha do tempo com busca.
- **Controle de Férias:**
  - período aquisitivo calculado pela admissão (CLT);
  - vencidas e a vencer em 30, 60 e 90 dias;
  - **venda de até 10 dias (abono)**;
  - **ajustes manuais** (admissão corrigida e férias de antes do sistema).
- **Escala mensal:**
  - planejado × realizado × comparação, nos padrões 12x36, 6x1, 5x2 e personalizado;
  - atestado e férias **derivados** dos documentos;
  - avisos ao RH;
  - trocas.
- **Escala e controle de gerentes:** cobertura por unidade e dia sem gerente em destaque.
- **Mapa de Funções:**
  - setor × turno com necessidade por faixa de horário;
  - mapa do momento derivado da escala;
  - freelancers do dia;
  - histórico congelado por dia.
- **Atestados:**
  - leitura por foto com IA;
  - CID visível só para Admin e CEO (LGPD);
  - taxa de absenteísmo;
  - lançamento automático na escala.
- **Avaliação mensal** (4 critérios) com observações do dia a dia, **período de experiência**, **mudanças de função** enviadas ao RH e **desligamentos** com aprovação.
- **Pagamentos (freelancer, hora extra, avulso):**
  - solicitar → aprovar → pagar, com segregação (quem lança não aprova);
  - delegação de aprovador;
  - divergência de valor e alerta de **recorrência** do freelancer;
  - lote;
  - consolidação financeira com CPF e PIX para o Financeiro.
- **Hora extra:**
  - por período (início e fim) com valor/hora autorizado por unidade;
  - motivo de catálogo;
  - vínculo com o cadastro do RH;
  - **competência no mês seguinte**, com fechamento que marca como pago.
- **Mobilidade:** lançamento em lote por competência, com o arquivo no formato da administradora.

### 5.6 Performance e gestão da rede
- **Metas:**
  - ranking mensal com pesos configuráveis (checklists, desperdício, comandas, comunicados, treinamentos, avaliações);
  - penalidade por atraso;
  - histórico e exportação.
- **Rotina do Supervisor:**
  - painel de uso por unidade;
  - visitas com checklist próprio e recorrência;
  - resumo semanal de aderência.
- **Painel executivo da rede:** variação vs mês anterior, pontos de atenção gerados pelos dados, evolução de 6 meses e drill-down por unidade.
- **Visão Executiva (CEO):** a rede em uma tela por mês.
- **Ticket Médio:**
  - importação das planilhas do PDV;
  - consolidado ponderado, **nunca a média dos tickets**;
  - unidades participantes com vigência.

### 5.7 Administração, segurança e integrações
- **Configurações:**
  - cadastros de unidades, usuários, perfis, checklists, comandas, troco, desperdício, ocorrências, fornecedores, produtos, setores do CD, pizzas, ticket médio, escalas e valores de pagamento;
  - telas sensíveis só para Admin e CEO.
- **Auditoria** com filtros, PDF e CSV.
- **LGPD:**
  - aceite de termo;
  - dado sensível mascarado conforme o perfil (CID, CPF).
- **API Global do SGO** (`/api/v1`):
  - uma chave por sistema externo, guardada só como hash;
  - ativar, desativar e revogar;
  - registro de cada chamada.

---

## 6. Diferenciais (o que procurar no outro sistema)

1. **Regra no servidor, não só na tela.** Escopo de unidade, permissões e validações valem na API. Burlar pela URL ou pelo corpo da requisição não funciona.
2. **Números que se explicam.** Variação recalculada pela série, consolidado ponderado, comparação pela média por dia lançado (não pelo total) e cobertura ao lado do número. O sistema mostra o que deixou de fora em vez de esconder.
3. **Feito para a operação real de restaurante:**
   - dia operacional às 04:00;
   - kg e unidades separados;
   - link sem login para a pizzaria;
   - leitor de código de barras;
   - romaneio do CD;
   - cofre por cédula.
4. **IA como assistente, nunca como decisora.** A IA lê a foto ou o PDF e sugere; uma pessoa confirma. Sem chave de IA, o sistema segue funcionando.
5. **Rastreabilidade.** Auditoria com antes e depois, motivo obrigatório em correção retroativa e histórico imutável de alterações.
6. **Qualidade de engenharia.**
   - 2.340 testes automáticos e CI bloqueando a publicação;
   - guardas que impedem tela sem permissão;
   - migrações sempre aditivas;
   - rollback em um clique.
7. **Velocidade de evolução:** 154 versões em ~4 meses, cada pedido documentado no changelog e no guia do usuário.

---

## 7. Limitações e pendências conhecidas (honestas)

| Tema | Situação |
|---|---|
| Integração com PDV | Não há integração em tempo real. Os dados do PDV entram por **importação de planilha** (cupons, cancelamentos, ticket médio). O estoque é **declarado**, não baixado por venda. |
| API do RH | A versão 1 está ativa (cadastro e admissão). A **versão 2 está bloqueada** por liberação de chave do lado do RH. O **período aquisitivo é calculado pela admissão** porque o RH ainda não envia os períodos em formato documentado. |
| Histórico anterior ao sistema | Dados de antes de junho/julho de 2026 (férias, por exemplo) precisam ser **lançados à mão** (há tela para isso). |
| Infraestrutura | Um servidor só, sem alta disponibilidade. O backup fica no mesmo servidor, e a cópia externa está pronta mas não ligada. |
| Offline | O app é instalável no celular, mas não funciona offline de forma completa. |
| Recursos que dependem de configuração | A IA depende de chave de API, e o push no celular depende das chaves VAPID. Sem elas, o recurso fica inerte sem quebrar nada. |
| Pendências de segurança operacional | Troca de credenciais de demonstração e rotação de chaves estão listadas para execução. |
| Relatórios em PDF | São gerados pela impressão do navegador, não por um gerador de PDF no servidor. |
| BI externo | Não há conector de BI pronto. A API Global permite criar, e as exportações Excel cobrem a maioria das telas. |

---

## 8. Critérios sugeridos para a comparação

Para comparar com outro sistema de forma justa, avalie cada item de 0 a 5 nos dois:

1. **Aderência à operação de restaurante:** dia operacional, desperdício kg/un, comandas, cofre, pizzaria, CD.
2. **Gestão de pessoas:** escala, férias com período aquisitivo e abono, hora extra por competência, atestados, integração com RH.
3. **Pagamentos:** fluxo com aprovação e segregação, consolidação para o financeiro (CPF/PIX).
4. **Controle e antifraude:** comandas × aberto, cancelamentos, cofre, auditoria.
5. **Gestão da rede:** metas, painéis executivos, supervisão.
6. **Permissões:** granularidade (perfil × módulo × aba), escopo por unidade **na API**.
7. **Integrações:** PDV, RH, API própria para terceiros.
8. **Celular:** usabilidade, PWA/app, push, leitor de código.
9. **Confiabilidade:** testes, CI, rollback, backup, alta disponibilidade.
10. **Custo e dono do código:** licença × sistema próprio, velocidade para pedir mudança.

---

## 9. Prompt pronto para comparar

Copie o texto abaixo numa IA, junto com a descrição ou documentação do outro sistema:

```
Você é um consultor de sistemas para redes de restaurantes. Vou te passar dois materiais:
(A) a análise do SGO Beija Flor (abaixo) e (B) a descrição de outro sistema.

Compare os dois em uma tabela com os 10 critérios da seção 8 da análise do SGO,
dando nota de 0 a 5 para cada sistema e justificando em uma frase.
Depois:
1. Liste o que o outro sistema tem e o SGO não tem (lacunas reais do SGO).
2. Liste o que o SGO tem e o outro não tem.
3. Aponte riscos de trocar (perda de funções, dados, integrações) e riscos de manter.
4. Dê uma recomendação objetiva para uma rede de 6 a 15 restaurantes, dizendo o que
   precisaria ser verdade para a recomendação mudar.
Não invente funções que não estejam descritas; quando faltar informação, diga "não informado".

(A) ANÁLISE DO SGO: [cole aqui o conteúdo deste documento]
(B) OUTRO SISTEMA: [cole aqui a descrição/documentação do outro sistema]
```
