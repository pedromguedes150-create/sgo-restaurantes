/**
 * A QUE SETOR ESTE PRODUTO PERTENCE.
 *
 * "Uma Coca é BEBIDAS, um chiclete é BOMBONIERE" — é lógica, e lógica não
 * precisa de chamada de rede. Esta camada resolve o caso comum na hora, de
 * graça, offline e sem chave de IA. A IA entra só no que sobra
 * (`src/lib/ai/produto-setor.ts`), e o gerente confirma antes de gravar nos
 * dois caminhos.
 *
 * As regras abaixo foram calibradas contra o ROMANEIO REAL do CD, item por
 * item (o teste `estoque-setor` é literalmente aquela lista). Três coisas que
 * ele ensinou, e que um catálogo inventado não teria ensinado:
 *
 *  1. **O QUE a coisa é vence DO QUE ela é feita.** "Coxinha de requeijão" é
 *     salgado, não laticínio; "bolinho de aipim com carne sol" é salgado, não
 *     açougue. Por comprimento de termo, "requeijão" (9) venceria "coxinha"
 *     (7) e o item iria para a câmara fria. Daí a PRIORIDADE do conceito.
 *  2. **O recipiente vence o conteúdo.** "Forminhas de papel para empadas" é
 *     descartável, não salgado. Mas "embalagem" NÃO entra como termo: naquela
 *     lista ela é unidade de medida ("12 embalagens de brigadeiro"), e entraria
 *     roubando a confeitaria.
 *  3. **O plural é a regra, não a exceção.** O romaneio diz "Bolos", "Broas",
 *     "Molhos de Pimenta", "pães de sal", "luvas". Comparar sem reduzir o
 *     plural faz metade da lista não casar com nada.
 *
 * E uma decisão de fundo: **nenhum nome de setor está fixo aqui.** Os setores
 * são cadastrados por instalação (`CdSector`) — hoje o banco tem "Bebidas,
 * Secos, Descartáveis" e o romaneio tem oito. Fixar nomes faria o classificador
 * parar de funcionar, em silêncio, no dia em que alguém renomeasse "Secos" para
 * "Despensa Cozinha". Cada conceito declara os APELIDOS pelos quais o setor
 * costuma se chamar, e o casamento é com o que está cadastrado.
 *
 * Puro: sem Prisma e sem SDK.
 */

export interface SetorCadastrado {
  id: string;
  name: string;
}

export interface SetorSugerido {
  sectorId: string;
  sectorName: string;
  /** O termo do produto que decidiu — a tela mostra, para a pessoa conferir. */
  termo: string;
  fonte: 'REGRA';
}

/**
 * Reduz uma palavra à raiz, resolvendo o plural português.
 *
 * Aplicada nos DOIS lados (no texto do produto, nos termos das regras e no nome
 * do setor), o que também conserta o casamento "DESCARTÁVEIS" × apelido
 * "descartável" — que falha por uma letra e não teria como ser percebido.
 */
export function raiz(palavra: string): string {
  const p = palavra;
  if (p.length <= 3) return p;
  /* Plurais irregulares antes do 's' simples: pães→pão, limões→limão,
     papéis→papel, descartáveis→descartável. */
  if (p.endsWith('aes') || p.endsWith('oes')) return `${p.slice(0, -3)}ao`;
  if (p.endsWith('eis')) return `${p.slice(0, -3)}el`;
  if (p.endsWith('s')) return p.slice(0, -1);
  return p;
}

/** Sem acento, minúsculo, sem pontuação e com cada palavra na raiz. */
export function normalizar(texto: string | null | undefined): string {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(raiz)
    .join(' ');
}

/**
 * Prioridade do conceito. Empata-se pelo comprimento do termo; a prioridade é
 * o que resolve quando comprimento levaria à resposta errada.
 */
const RECIPIENTE = 3;
const PREPARADO = 2;
const INGREDIENTE = 1;

interface Conceito {
  /** Como o SETOR costuma se chamar no cadastro. Casado por conteúdo. */
  apelidos: string[];
  prioridade: number;
  /** Palavras/expressões que identificam o PRODUTO. */
  termos: string[];
}

/**
 * Os conceitos saem do romaneio real do CD, e não de um catálogo genérico de
 * supermercado: é ele que diz o que a rede de fato pede.
 */
const CONCEITOS: Conceito[] = [
  {
    apelidos: ['bebida', 'liquido'],
    prioridade: INGREDIENTE,
    termos: [
      'coca cola', 'coca', 'refrigerante', 'guarana', 'fanta', 'sprite', 'pepsi',
      'suco', 'nectar', 'refresco', 'agua mineral', 'agua com gas', 'agua',
      'gatorade', 'isotonico', 'monster', 'red bull', 'energetico',
      'cerveja', 'chopp', 'vinho', 'espumante', 'vodka', 'whisky', 'cachaca',
      'mate', 'cha gelado', 'ice tea', 'tonica', 'leveger',
    ],
  },
  {
    apelidos: ['bomboniere', 'doce', 'guloseima', 'confeito'],
    prioridade: INGREDIENTE,
    termos: [
      'chiclete', 'trident', 'halls', 'drops', 'bala', 'gomets', 'ice kiss',
      'chocolate', 'lacta', 'talento', 'snickers', 'prestigio', 'lollo', 'trento',
      'kit kat', 'kitkat', 'bis', 'diamante negro', 'bombom',
      'pacoca', 'pacoquita', 'amendoim', 'bananinha',
      'biscoito polvilho', 'biscoito', 'pirulito',
    ],
  },
  {
    apelidos: ['carne', 'churrasco', 'acougue', 'frigorifico'],
    prioridade: INGREDIENTE,
    termos: [
      'alcatra', 'maminha', 'picanha', 'fraldinha', 'cupim', 'contrafile', 'costela',
      'coracao', 'medalhao', 'sobrecoxa', 'filezinho', 'file mignon', 'file',
      'linguica', 'bisteca', 'lombo', 'pernil', 'paleta', 'acem', 'patinho',
      'carne sol', 'carne seca', 'frango inteiro', 'peito de frango', 'carne',
    ],
  },
  {
    apelidos: ['camara', 'fria', 'frio', 'resfriado', 'congelado', 'laticinio'],
    prioridade: INGREDIENTE,
    termos: [
      'requeijao', 'mussarela', 'mucarela', 'presunto', 'queijo prato', 'queijo',
      'toucinho', 'barriga', 'espetinho', 'camarao', 'pao de queijo',
      'manteiga', 'margarina', 'iogurte', 'creme de leite', 'leite',
      'salame', 'mortadela', 'bacon', 'peito de peru',
    ],
  },
  {
    apelidos: ['salgado', 'fritura'],
    prioridade: PREPARADO,
    termos: [
      'coxinha', 'risole', 'rissole', 'kibe', 'quibe', 'esfirra', 'esfiha',
      'pastel', 'hamburguer', 'bolinho', 'tortinha', 'empada', 'enroladinho',
      'croquete', 'bolinha de queijo',
    ],
  },
  {
    apelidos: ['confeitaria', 'padaria', 'panificacao'],
    prioridade: PREPARADO,
    /* Sem "pão" genérico de propósito: ele venceria "pão de queijo", que é
       câmara fria. Os pães que a rede pede estão nomeados. */
    termos: [
      'bolo', 'broa', 'torta doce', 'torta', 'brigadeiro', 'beijinho',
      'pao de sal', 'pao frances', 'sonho', 'rosca', 'cuca',
      'sobremesa', 'pudim', 'mousse', 'cuba',
    ],
  },
  {
    apelidos: ['despensa', 'seco', 'mercearia', 'cozinha', 'estoque seco'],
    prioridade: INGREDIENTE,
    termos: [
      'oleo', 'ovo', 'catchup', 'ketchup', 'maionese', 'mostarda',
      'feijao', 'sal grosso', 'sal refinado', 'sal', 'acucar', 'arroz',
      'colorau', 'gordura vegetal', 'gordura', 'molho de pimenta', 'molho de tomate', 'molho',
      'farinha', 'macarrao', 'vinagre', 'extrato', 'tempero', 'fuba', 'amido',
      'leite condensado', 'creme de milho', 'milho', 'ervilha', 'azeite', 'cafe',
    ],
  },
  {
    apelidos: ['descartavel'],
    prioridade: INGREDIENTE,
    termos: ['palito de dente', 'palito dente', 'palito', 'copo descartavel', 'canudo', 'bandeja'],
  },
  {
    /* Recipiente: o que o item É vence o que ele carrega. "Forminha de papel
       para empada" é descartável. */
    apelidos: ['descartavel'],
    prioridade: RECIPIENTE,
    termos: [
      'luva', 'forminha', 'guardanapo', 'sacola', 'saco plastico',
      'papel toalha', 'papel aluminio', 'filme pvc', 'marmitex',
    ],
  },
  {
    apelidos: ['limpeza', 'higiene'],
    prioridade: INGREDIENTE,
    termos: [
      'detergente', 'sabao', 'desinfetante', 'agua sanitaria', 'cloro',
      'esponja', 'alcool', 'multiuso', 'desengordurante', 'rodo', 'vassoura',
    ],
  },
];

/** O termo está no texto como PALAVRA, e não como pedaço de outra palavra. */
function contemTermo(texto: string, termo: string): boolean {
  /* Sem a fronteira, "sal" casaria com "salgadinho" e "salsicha", e "ovo" com
     "novo" — o produto iria parar no setor errado sem nada indicar por quê. */
  return ` ${texto} `.includes(` ${termo} `);
}

/** O setor cadastrado cujo nome carrega um dos apelidos do conceito. */
function setorDoConceito(conceito: Conceito, setores: SetorCadastrado[]): SetorCadastrado | null {
  for (const s of setores) {
    const nome = normalizar(s.name);
    if (conceito.apelidos.some((a) => nome.includes(normalizar(a)))) return s;
  }
  return null;
}

/**
 * Sugere o setor pelo nome do produto.
 *
 * `null` quando nenhuma regra casa OU quando o conceito não tem setor
 * cadastrado correspondente — e as duas devolvem `null` de propósito. Apontar
 * um setor "mais ou menos parecido" mandaria o produto para a fila de um
 * separador que não tem o que fazer com ele, e ninguém saberia por quê.
 */
export function sugerirSetorPorRegra(
  nomeDoProduto: string,
  setores: SetorCadastrado[],
  categoria?: string | null,
): SetorSugerido | null {
  const texto = normalizar(`${nomeDoProduto} ${categoria ?? ''}`);
  if (texto.length === 0 || setores.length === 0) return null;

  /* Pontuação = prioridade do conceito, e o comprimento do termo como
     desempate. O comprimento sozinho mandaria "coxinha de requeijão" para a
     câmara fria; a prioridade sozinha mandaria "pão de queijo" para a
     confeitaria. */
  let melhor: { conceito: Conceito; termo: string; pontos: number } | null = null;
  for (const conceito of CONCEITOS) {
    for (const bruto of conceito.termos) {
      const termo = normalizar(bruto);
      if (!contemTermo(texto, termo)) continue;
      const pontos = conceito.prioridade * 1000 + termo.length;
      if (!melhor || pontos > melhor.pontos) melhor = { conceito, termo: bruto, pontos };
    }
  }
  if (!melhor) return null;

  const setor = setorDoConceito(melhor.conceito, setores);
  if (!setor) return null;
  return { sectorId: setor.id, sectorName: setor.name, termo: melhor.termo, fonte: 'REGRA' };
}

/** Os apelidos conhecidos, para a IA receber a mesma noção de setor. */
export function apelidosConhecidos(): string[] {
  return [...new Set(CONCEITOS.flatMap((c) => c.apelidos))];
}
