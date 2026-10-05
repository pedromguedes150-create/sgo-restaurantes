import type { Modo, TipoUnidade } from '@/lib/supervisor/operacional-calculo';

/**
 * Roteiro PADRÃO da visita operacional (semente do catálogo, v1.155.0) — o que
 * a spec do Pedro lista como primordial e complementar. O Admin edita tudo em
 * Configurações → Checklists de visita; a semente só CRIA o que falta (pela
 * `seedKey`) e nunca sobrescreve uma edição.
 *
 * `tipos` vazio = todas as unidades. R=Restaurante, L=Lanchonete, C=CD, F=Fábrica.
 * Faixa de temperatura NÃO vem preenchida: o limite é do POP/nutricionista da
 * empresa, configurado pelo Admin — o código não inventa número técnico.
 */
export interface ItemPadrao { key: string; secao: string; texto: string; nivel: 'PRIMORDIAL' | 'COMPLEMENTAR'; modo?: Modo; tipos?: TipoUnidade[]; pizzaria?: boolean; fotoNc?: boolean; obsNc?: boolean }

const OPERACAO_DE_COMIDA: TipoUnidade[] = ['RESTAURANTE', 'LANCHONETE', 'FABRICA'];
const SALAO: TipoUnidade[] = ['RESTAURANTE', 'LANCHONETE'];

export const ROTEIRO_PADRAO: ItemPadrao[] = [
  // A) PRIMORDIAIS
  { key: 'desp-rotina', secao: 'Desperdício', texto: 'Rotina de pesagem cumprida (almoço e jantar)', nivel: 'PRIMORDIAL', tipos: ['RESTAURANTE'], fotoNc: true },
  { key: 'desp-recipiente', secao: 'Desperdício', texto: 'Recipiente correto e categorias separadas conforme o POP (sobra limpa × produção)', nivel: 'PRIMORDIAL', tipos: ['RESTAURANTE'], fotoNc: true },
  { key: 'desp-salgados', secao: 'Desperdício', texto: 'Descarte de salgados registrado e recipiente conferido', nivel: 'PRIMORDIAL', tipos: ['LANCHONETE'], fotoNc: true },
  { key: 'chk-amostra', secao: 'Checklists', texto: 'Amostra de itens marcados como feitos no SGO conferida no local', nivel: 'PRIMORDIAL', modo: 'AMOSTRAGEM' },
  { key: 'val-amostra', secao: 'Validade e armazenamento', texto: 'Validades conferidas por amostragem (validade no SGO × encontrada)', nivel: 'PRIMORDIAL', modo: 'AMOSTRAGEM', fotoNc: true },
  { key: 'val-organizacao', secao: 'Validade e armazenamento', texto: 'Organização, identificação e FIFO/PEPS do estoque', nivel: 'PRIMORDIAL', fotoNc: true },
  { key: 'val-abertos', secao: 'Validade e armazenamento', texto: 'Produtos abertos identificados e embalagens íntegras', nivel: 'PRIMORDIAL', tipos: OPERACAO_DE_COMIDA, fotoNc: true },
  { key: 'hig-cozinha', secao: 'Higiene e segurança dos alimentos', texto: 'Higiene geral da cozinha: bancadas, utensílios, piso, paredes e lixeiras', nivel: 'PRIMORDIAL', tipos: OPERACAO_DE_COMIDA, fotoNc: true },
  { key: 'hig-equipamentos', secao: 'Higiene e segurança dos alimentos', texto: 'Limpeza dos equipamentos', nivel: 'PRIMORDIAL', tipos: OPERACAO_DE_COMIDA, fotoNc: true },
  { key: 'hig-contaminacao', secao: 'Higiene e segurança dos alimentos', texto: 'Sem contaminação cruzada aparente; produtos de limpeza separados dos alimentos', nivel: 'PRIMORDIAL', tipos: OPERACAO_DE_COMIDA, fotoNc: true },
  { key: 'hig-manipulados', secao: 'Higiene e segurança dos alimentos', texto: 'Alimentos manipulados identificados e armazenados corretamente', nivel: 'PRIMORDIAL', tipos: OPERACAO_DE_COMIDA, fotoNc: true },
  { key: 'hig-pessoal', secao: 'Higiene e segurança dos alimentos', texto: 'Higiene pessoal e uniforme da equipe de manipulação', nivel: 'PRIMORDIAL', tipos: OPERACAO_DE_COMIDA },
  { key: 'temp-refrigeradores', secao: 'Temperatura e conservação', texto: 'Refrigeradores — temperatura', nivel: 'PRIMORDIAL', modo: 'TEMPERATURA', tipos: OPERACAO_DE_COMIDA },
  { key: 'temp-freezers', secao: 'Temperatura e conservação', texto: 'Freezers — temperatura', nivel: 'PRIMORDIAL', modo: 'TEMPERATURA' },
  { key: 'temp-camara', secao: 'Temperatura e conservação', texto: 'Câmara fria — temperatura', nivel: 'PRIMORDIAL', modo: 'TEMPERATURA' },
  { key: 'temp-quentes', secao: 'Temperatura e conservação', texto: 'Equipamentos quentes / buffet — temperatura', nivel: 'PRIMORDIAL', modo: 'TEMPERATURA', tipos: ['RESTAURANTE'] },
  { key: 'est-geral', secao: 'Estrutura física', texto: 'Iluminação, vazamentos, torneiras/pias, tomadas e fiação, portas, piso e teto', nivel: 'PRIMORDIAL', fotoNc: true, obsNc: true },
  { key: 'est-equipamentos', secao: 'Estrutura física', texto: 'Equipamentos sem dano aparente', nivel: 'PRIMORDIAL', fotoNc: true },
  { key: 'pragas', secao: 'Controle de pragas', texto: 'Sem sinais de pragas', nivel: 'PRIMORDIAL', fotoNc: true },
  { key: 'equipe-prevista', secao: 'Equipe e escala', texto: 'Equipe encontrada confere com a escala do dia (funções cobertas, gerente presente)', nivel: 'PRIMORDIAL', obsNc: true },
  { key: 'treino-amostra', secao: 'Treinamentos e POPs', texto: 'Colaboradores sabem executar o procedimento (amostragem)', nivel: 'PRIMORDIAL', modo: 'AMOSTRAGEM' },
  { key: 'comandas-processo', secao: 'Comandas', texto: 'Comandas armazenadas, utilizadas e contadas conforme o procedimento', nivel: 'PRIMORDIAL', tipos: SALAO },
  { key: 'cofre-procedimento', secao: 'Cofre, troco e despesas', texto: 'Cofre organizado e procedimento de conferência seguido (só observação)', nivel: 'PRIMORDIAL', tipos: SALAO, obsNc: true },
  { key: 'ocorrencias-solucao', secao: 'Ocorrências', texto: 'Ocorrências marcadas como resolvidas estão de fato solucionadas no local', nivel: 'PRIMORDIAL', obsNc: true },
  // Operações específicas
  { key: 'cd-separacao', secao: 'Separação e expedição', texto: 'Separação e expedição organizadas; carga conferida', nivel: 'PRIMORDIAL', tipos: ['CD'] },
  { key: 'pizza-massas', secao: 'Massas e pizzas', texto: 'Massas armazenadas, identificadas e dentro da validade', nivel: 'PRIMORDIAL', pizzaria: true, fotoNc: true },
  // C) COMPLEMENTARES
  { key: 'salao', secao: 'Salão', texto: 'Limpeza, organização, mesas/cadeiras e apresentação do salão', nivel: 'COMPLEMENTAR', tipos: SALAO },
  { key: 'banheiros', secao: 'Banheiros', texto: 'Limpeza, papel, sabonete, funcionamento e odor', nivel: 'COMPLEMENTAR', tipos: SALAO },
  { key: 'cozinha-org', secao: 'Cozinha', texto: 'Organização, utensílios e manipulação', nivel: 'COMPLEMENTAR', tipos: OPERACAO_DE_COMIDA },
  { key: 'camaras-org', secao: 'Câmaras e freezers', texto: 'Organização, identificação e integridade', nivel: 'COMPLEMENTAR' },
  { key: 'recebimento', secao: 'Área de recebimento', texto: 'Limpeza, organização, produtos fora do chão e separação adequada', nivel: 'COMPLEMENTAR' },
  { key: 'residuos', secao: 'Lixo e resíduos', texto: 'Recipiente adequado com tampa, descarte e área externa', nivel: 'COMPLEMENTAR' },
  { key: 'equipe-apresentacao', secao: 'Equipe', texto: 'Uniforme, apresentação e organização operacional', nivel: 'COMPLEMENTAR' },
  { key: 'atendimento', secao: 'Atendimento', texto: 'Fluxo, postura da equipe e padrão de atendimento', nivel: 'COMPLEMENTAR', tipos: SALAO },
  { key: 'equipamentos-func', secao: 'Equipamentos', texto: 'Funcionamento, limpeza e conservação', nivel: 'COMPLEMENTAR' },
  { key: 'seguranca', secao: 'Segurança operacional', texto: 'Sem obstáculos ou riscos aparentes', nivel: 'COMPLEMENTAR', obsNc: true },
];
