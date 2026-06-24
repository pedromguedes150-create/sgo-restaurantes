/**
 * Modelos de checklist padrão (Rede Beija Flor) — base do documento de setores.
 * Convertido para a biblioteca editável (ChecklistModel). Cada (Setor — Momento)
 * é um modelo. Convenções nos textos:
 *   📸 = item exige foto (requiresPhoto) · 🕐 = recorrente (removido do texto) ·
 *   ⚠️ = ponto crítico (mantido no texto como sinalização ao gerente).
 */
export interface SeedModel { category: string; moment: string; limitTime?: string | null; items: string[] }

const DOC: SeedModel[] = [
  // ───────── BLOCO 1 — PRODUÇÃO DE ALIMENTOS ─────────
  { category: 'Cozinha', moment: 'Abertura', limitTime: '11:00', items: [
    '⚠️ Aferir e registrar a temperatura das câmaras frias e geladeiras (refrigerado ≤ 5°C; congelado ≤ -18°C) 📸',
    '⚠️ Conferir validade e integridade dos insumos; aplicar PVPS (primeiro que vence, primeiro que sai)',
    'Verificar higiene pessoal da equipe: uniforme limpo, cabelos presos/touca, unhas, sem adornos',
    '⚠️ Higienizar bancadas, tábuas e utensílios antes do início do preparo',
    'Conferir diluição correta do sanitizante (concentração conforme rótulo)',
    'Verificar funcionamento de fogões, fornos e gás (sem vazamento)',
    'Organizar o mise en place do dia',
  ] },
  { category: 'Cozinha', moment: 'Durante o turno', items: [
    '⚠️🕐 Controlar a temperatura do banho-maria / pista quente (≥ 60°C) e registrar 📸',
    '🕐 Higienizar superfícies e utensílios entre diferentes preparos (evitar contaminação cruzada)',
    '⚠️ Manter carnes cruas e alimentos prontos separados, nunca no mesmo plano',
    '🕐 Controlar a qualidade do óleo de fritura; trocar quando saturado',
    'Repor insumos sem deixar faltar nos horários de pico',
  ] },
  { category: 'Cozinha', moment: 'Fechamento', items: [
    '⚠️ Armazenar sobras e preparos em recipientes fechados, etiquetados com data e validade 📸',
    '⚠️ Descartar alimentos fora do padrão (registrar no módulo de Desperdícios)',
    'Limpeza profunda de bancadas, fogões, coifa e piso 📸',
    'Desligar equipamentos conforme procedimento',
    'Retirar o lixo e higienizar as lixeiras',
  ] },

  { category: 'Apoio Cozinha', moment: 'Abertura', items: [
    'Higienizar utensílios e equipamentos de apoio',
    'Conferir estoque de descartáveis e embalagens',
    'Abastecer estações de trabalho da cozinha',
  ] },
  { category: 'Apoio Cozinha', moment: 'Durante o turno', items: [
    '🕐 Repor insumos e utensílios conforme a demanda da cozinha',
    '🕐 Manter área de apoio limpa e organizada',
    '⚠️ Transportar alimentos respeitando a separação (cru x pronto)',
  ] },
  { category: 'Apoio Cozinha', moment: 'Fechamento', items: [
    'Higienizar a área de apoio e equipamentos',
    'Organizar utensílios para o turno seguinte',
    'Apoiar o descarte e a separação do lixo',
  ] },

  { category: 'Churrasco', moment: 'Abertura', items: [
    '⚠️ Conferir validade, cor e odor das carnes; aplicar PVPS 📸',
    '⚠️ Verificar a temperatura de armazenamento das carnes (refrigerado/congelado)',
    'Higienizar grelhas, espetos e bancada de corte 📸',
    'Acender e estabilizar a brasa/temperatura antes do serviço',
    'Conferir uniforme e EPIs (avental, luva térmica)',
  ] },
  { category: 'Churrasco', moment: 'Durante o turno', items: [
    '⚠️🕐 Manter o ponto correto de cocção das carnes (segurança e padrão)',
    '🕐 Repor o rodízio de forma contínua nos horários de pico',
    '🕐 Higienizar a grelha e a área de corte ao longo do serviço',
    '⚠️ Manter carne crua separada da carne assada pronta',
  ] },
  { category: 'Churrasco', moment: 'Fechamento', items: [
    '⚠️ Armazenar carnes não utilizadas etiquetadas com data 📸',
    'Limpeza profunda da churrasqueira, grelhas e espetos 📸',
    'Descartar resíduos e registrar sobras no módulo de Desperdícios',
    'Desligar/apagar com segurança',
  ] },

  { category: 'Lanchonete', moment: 'Abertura', items: [
    '⚠️ Aferir temperatura de geladeiras e freezers; registrar 📸',
    '⚠️ Conferir validade dos produtos expostos e estocados',
    'Higienizar chapa, balcão e equipamentos (liquidificador, fritadeira) 📸',
    'Verificar qualidade do óleo da fritadeira',
    'Abastecer insumos e descartáveis',
  ] },
  { category: 'Lanchonete', moment: 'Durante o turno', items: [
    '⚠️🕐 Controlar a temperatura de produtos expostos (quente quente, frio frio)',
    '🕐 Higienizar a chapa e a área de preparo entre usos',
    '🕐 Repor produtos respeitando a ordem de validade',
    'Manter o balcão de atendimento limpo e organizado',
  ] },
  { category: 'Lanchonete', moment: 'Fechamento', items: [
    '⚠️ Descartar produtos vencidos e registrar no módulo de Desperdícios',
    'Limpeza profunda da chapa, fritadeira e balcão 📸',
    '⚠️ Armazenar e etiquetar produtos para o turno seguinte',
    'Repor para a equipe da madrugada',
  ] },

  // ───────── BLOCO 2 — AUTOSSERVIÇO ─────────
  { category: 'Balança (Self-service)', moment: 'Abertura', items: [
    '⚠️ Verificar a temperatura do balcão térmico: pista quente ≥ 60°C / pista fria ≤ 10°C 📸',
    '⚠️ Conferir se a balança está aferida e com o lacre do Inmetro válido 📸',
    'Higienizar o protetor salivar e a estrutura do balcão',
    'Conferir utensílios de servir limpos e em número suficiente',
    'Verificar cubas e o sistema de aquecimento/refrigeração',
  ] },
  { category: 'Balança (Self-service)', moment: 'Durante o turno', items: [
    '⚠️🕐 Monitorar a temperatura das cubas ao longo do serviço 📸',
    '🕐 Trocar utensílios de servir e cubas conforme necessário',
    '🕐 Higienizar respingos e a área do balcão continuamente',
    '⚠️ Garantir que o protetor salivar esteja sempre posicionado e limpo',
    'Repor alimentos sem completar cuba quente com alimento frio',
  ] },
  { category: 'Balança (Self-service)', moment: 'Fechamento', items: [
    '⚠️ Descartar alimentos expostos fora do tempo/temperatura seguros (registrar no Desperdício)',
    'Limpeza profunda do balcão, cubas e protetor salivar 📸',
    'Conferir o fechamento do controle de peso/vendas',
    'Desligar o sistema de aquecimento/refrigeração conforme procedimento',
  ] },

  // ───────── BLOCO 3 — SALÕES E ATENDIMENTO ─────────
  { category: 'Salão', moment: 'Abertura', items: [
    'Higienizar e secar todas as mesas e cadeiras 📸',
    'Abastecer e higienizar galheteiros, saleiros e porta-guardanapos',
    'Conferir piso limpo e seco (prevenção de queda)',
    'Verificar iluminação, ventilação/climatização e ambiente',
    'Organizar a disposição de mesas conforme o padrão da casa',
  ] },
  { category: 'Salão', moment: 'Durante o turno', items: [
    '🕐 Higienizar mesas imediatamente após a saída de cada cliente',
    '🕐 Recolher louça e manter o salão organizado',
    '🕐 Monitorar e secar o piso em caso de respingo',
    'Manter temperos e descartáveis abastecidos nas mesas',
    'Atender com cordialidade e padrão de uniforme',
  ] },
  { category: 'Salão', moment: 'Fechamento', items: [
    'Limpeza profunda de mesas, cadeiras e piso 📸',
    'Recolher e higienizar galheteiros e utensílios das mesas',
    'Organizar o salão para a abertura seguinte',
    'Conferir que nenhum equipamento/luz ficou ligado indevidamente',
    'Salão Gramado: verificar área externa, limpeza do piso/gramado, pragas e iluminação externa',
    'Salão de Reserva: conferir disponibilidade e preparo prévio conforme reservas do dia',
  ] },

  { category: 'Bar', moment: 'Abertura', items: [
    '⚠️ Aferir a temperatura das geladeiras de bebidas; registrar 📸',
    '⚠️ Conferir validade de bebidas, polpas e insumos',
    'Higienizar balcão, pia, copos e utensílios 📸',
    'Conferir estoque e abastecer o bar',
    'Verificar máquina de gelo (higiene e funcionamento)',
  ] },
  { category: 'Bar', moment: 'Durante o turno', items: [
    '🕐 Higienizar o balcão e os utensílios continuamente',
    '🕐 Repor bebidas e gelo conforme a demanda',
    '⚠️ Manter copos e taças higienizados e secos',
    'Controlar o giro de bebidas (PVPS)',
  ] },
  { category: 'Bar', moment: 'Fechamento', items: [
    'Limpeza profunda do balcão, pia e equipamentos 📸',
    '⚠️ Conferir e registrar o estoque de bebidas (controle de perdas/desvios)',
    'Organizar o bar para o turno seguinte',
    'Desligar equipamentos conforme procedimento',
  ] },

  { category: 'Picolé', moment: 'Abertura', items: [
    '⚠️ Aferir a temperatura do freezer (≤ -18°C); registrar 📸',
    '⚠️ Conferir validade e integridade das embalagens',
    'Higienizar o freezer externamente e a área de venda',
  ] },
  { category: 'Picolé', moment: 'Durante o turno', items: [
    '🕐 Manter o freezer fechado e organizado',
    'Repor produtos conforme a venda (PVPS)',
  ] },
  { category: 'Picolé', moment: 'Fechamento', items: [
    '⚠️ Conferir o estoque e registrar perdas, se houver',
    'Verificar a vedação e a temperatura do freezer',
    'Higienizar a área',
  ] },

  { category: 'Entrega Bebida', moment: 'Abertura', items: [
    '⚠️ Conferir a temperatura das geladeiras de bebida; registrar 📸',
    'Organizar bebidas por tipo e validade (PVPS)',
    'Conferir o estoque inicial',
  ] },
  { category: 'Entrega Bebida', moment: 'Durante o turno', items: [
    '🕐 Repor bebidas mantendo a organização e a temperatura',
    '⚠️ Conferir a conferência entre o que foi solicitado e o que foi entregue',
  ] },
  { category: 'Entrega Bebida', moment: 'Fechamento', items: [
    '⚠️ Conferir e registrar o estoque (controle de perdas/desvios)',
    'Higienizar a área e organizar para o turno seguinte',
  ] },

  // ───────── BLOCO 4 — CONTROLE, CAIXA E ACESSO ─────────
  { category: 'Caixa', moment: 'Abertura', items: [
    '⚠️ Conferir o fundo de troco e registrar a abertura do caixa 📸',
    'Verificar o funcionamento do sistema (Teknisa), impressora e leitor',
    'Conferir a higiene e a organização da estação',
  ] },
  { category: 'Caixa', moment: 'Durante o turno', items: [
    '⚠️🕐 Realizar sangria nos valores/horários definidos',
    '⚠️ Garantir que todo cancelamento de cupom passe pela aprovação do gerente (senha)',
    '🕐 Manter a área limpa e organizada',
  ] },
  { category: 'Caixa', moment: 'Fechamento', items: [
    '⚠️ Fechar o caixa e conferir valores (registrar diferenças) 📸',
    '⚠️ Conferir os cancelamentos do dia (vincular ao módulo de Cancelamento de Cupons)',
    '⚠️ Participar da contagem de comandas (vincular ao módulo de Comandas)',
    'Organizar a estação para o turno seguinte',
  ] },

  { category: 'Comandas Eletrônicas', moment: 'Durante o turno', items: [
    '⚠️🕐 Conferir se os consumos estão sendo lançados na comanda correta',
    '⚠️🕐 Garantir que nenhuma comanda seja fechada com lançamento pendente',
    '🕐 Acompanhar comandas abertas em aberto por tempo excessivo',
  ] },
  { category: 'Comandas Eletrônicas', moment: 'Fechamento', items: [
    '⚠️ Conferir comandas abertas x fechadas no sistema',
    '⚠️ Registrar e justificar cancelamentos (vincular ao módulo de Cupons)',
    '⚠️ Realizar a contagem de comandas e sinalizar ausências (vincular ao módulo de Comandas) 📸',
  ] },

  { category: 'Portaria', moment: 'Abertura', items: [
    'Verificar o funcionamento da catraca eletrônica',
    '⚠️ Conferir o estoque inicial de comandas eletrônicas 📸',
    'Organizar a área de entrada e a sinalização',
  ] },
  { category: 'Portaria', moment: 'Durante o turno', items: [
    '⚠️🕐 Controlar a entrega e a devolução das comandas (ponto-chave contra sumiço) 📸',
    '🕐 Organizar a fila e o fluxo de clientes nos horários de pico',
    'Orientar clientes e zelar pela segurança da entrada',
    'Acompanhar o estacionamento e o fluxo de veículos',
  ] },
  { category: 'Portaria', moment: 'Fechamento', items: [
    '⚠️ Conferir o saldo de comandas e sinalizar divergências (vincular ao módulo de Comandas) 📸',
    'Verificar o fechamento e a segurança da entrada',
    'Reportar ocorrências do turno',
  ] },

  // ───────── BLOCO 5 — HIGIENE E SUPORTE ─────────
  { category: 'Limpeza (banheiros)', moment: 'Abertura', items: [
    '⚠️ Higienizar completamente todos os banheiros antes da abertura 📸',
    'Abastecer papel higiênico, papel-toalha e sabonete',
    'Conferir a higiene de áreas comuns e acessos',
    'Preparar os carrinhos e diluir corretamente os produtos de limpeza',
  ] },
  { category: 'Limpeza (banheiros)', moment: 'Durante o turno', items: [
    '⚠️🕐 Checar e higienizar os banheiros em intervalos regulares; registrar na planilha visível ao cliente 📸',
    '🕐 Repor papel e sabonete a cada checagem',
    '⚠️🕐 Manter o piso seco e sinalizado nas áreas de circulação (prevenção de queda)',
    '🕐 Esvaziar lixeiras antes de transbordarem',
    '🕐 Monitorar e eliminar odores',
  ] },
  { category: 'Limpeza (banheiros)', moment: 'Fechamento', items: [
    '⚠️ Higienização profunda de todos os banheiros 📸',
    'Limpeza de áreas comuns, acessos e área externa',
    'Conferir o estoque de produtos de limpeza para o dia seguinte',
    'Higienizar e guardar os equipamentos de limpeza',
  ] },

  { category: 'Lavagem de Prato', moment: 'Abertura', items: [
    'Higienizar a área e os equipamentos de lavagem',
    '⚠️ Conferir a diluição correta do detergente e do sanitizante',
    'Organizar a área de louça suja e louça limpa (fluxo sem cruzamento)',
  ] },
  { category: 'Lavagem de Prato', moment: 'Durante o turno', items: [
    '⚠️🕐 Separar os restos de alimento ANTES da lavagem (vincular ao módulo de Desperdícios) 📸',
    '⚠️🕐 Garantir o enxágue/sanitização adequados da louça',
    '🕐 Organizar a louça limpa em local protegido',
    'Manter a área sem acúmulo e o piso seco',
  ] },
  { category: 'Lavagem de Prato', moment: 'Fechamento', items: [
    'Limpeza profunda da área, pias e equipamentos 📸',
    '⚠️ Conferir a higienização final da louça e dos utensílios',
    'Organizar para o turno seguinte e descartar resíduos',
  ] },

  // ───────── BLOCO 6 — MADRUGADA (24h) ─────────
  { category: 'Madrugada — Caixa', moment: 'Passagem de turno', items: [
    '⚠️ Conferir o fundo de troco e a passagem de caixa do turno anterior 📸',
    'Verificar o funcionamento do sistema e da impressora',
  ] },
  { category: 'Madrugada — Caixa', moment: 'Durante o turno', items: [
    '⚠️🕐 Realizar sangria conforme o procedimento de segurança',
    '⚠️ Garantir aprovação gerencial (ou delegado) para cancelamentos',
    '🕐 Manter a área organizada',
  ] },
  { category: 'Madrugada — Caixa', moment: 'Fechamento', items: [
    '⚠️ Fechar o caixa, conferir valores e registrar diferenças 📸',
    '⚠️ Conferir comandas e cancelamentos da madrugada',
    'Passar o turno com registro de ocorrências',
  ] },

  { category: 'Madrugada — Lanchonete', moment: 'Passagem de turno', items: [
    '⚠️ Aferir a temperatura de geladeiras/freezers; registrar 📸',
    '⚠️ Conferir a validade dos produtos expostos recebidos na passagem',
    'Higienizar a chapa e o balcão',
  ] },
  { category: 'Madrugada — Lanchonete', moment: 'Durante o turno', items: [
    '⚠️🕐 Manter o controle de temperatura mesmo no baixo movimento',
    '🕐 Higienizar a chapa e a área de preparo após cada uso',
    '⚠️ Aproveitar o baixo movimento para a limpeza profunda programada 📸',
    'Zelar pela segurança no período de madrugada',
  ] },
  { category: 'Madrugada — Lanchonete', moment: 'Fechamento', items: [
    '⚠️ Descartar produtos vencidos e registrar (módulo de Desperdícios)',
    '⚠️ Etiquetar e armazenar produtos para o turno da manhã 📸',
    'Higienizar a chapa, a fritadeira e o balcão',
    'Passar o turno com a área limpa e abastecida',
  ] },
];

export interface BuiltModel {
  name: string; category: string; moment: string; limitTime: string | null; weight: number; requiresEvidence: boolean;
  items: { text: string; requiresPhoto: boolean }[];
}

/** Converte o documento nos modelos prontos (1 por Setor — Momento). */
export function buildDefaultModels(): BuiltModel[] {
  return DOC.map((m, idx) => {
    const items = m.items.map((raw) => {
      const requiresPhoto = raw.includes('📸');
      const text = raw.replace(/📸/g, '').replace(/🕐/g, '').replace(/\s+/g, ' ').trim();
      return { text, requiresPhoto };
    });
    return {
      name: `${m.category} — ${m.moment}`,
      category: m.category,
      moment: m.moment,
      limitTime: m.limitTime ?? null,
      weight: 10,
      requiresEvidence: false,
      items,
      _order: idx,
    } as BuiltModel & { _order: number };
  });
}
