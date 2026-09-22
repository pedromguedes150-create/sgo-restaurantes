import { describe, it, expect } from 'vitest';
import { normalizar, sugerirSetorPorRegra, type SetorCadastrado } from '@/lib/stock/setor-sugerido';

/**
 * A QUE SETOR O PRODUTO PERTENCE.
 *
 * A prova principal deste arquivo é o ROMANEIO REAL do CD — a lista que o Pedro
 * mandou, item por item. Um classificador validado contra exemplos inventados
 * acerta os exemplos inventados; validado contra o pedido de verdade, ele
 * acerta o que a rede pede de verdade.
 */

/** Os oito setores do romaneio, como aparecem lá. */
const OITO: SetorCadastrado[] = [
  { id: 'carnes', name: 'CARNES CHURRASCO' },
  { id: 'frias', name: 'CÂMARAS FRIAS' },
  { id: 'salgados', name: 'SALGADOS' },
  { id: 'confeitaria', name: 'CONFEITARIA' },
  { id: 'despensa', name: 'DESPENSA COZINHA' },
  { id: 'bomboniere', name: 'BOMBONIERE DIVERSOS' },
  { id: 'bebidas', name: 'BEBIDAS' },
  { id: 'descartaveis', name: 'DESCARTÁVEIS' },
];

const setorDe = (nome: string, setores = OITO) => sugerirSetorPorRegra(nome, setores)?.sectorId ?? null;

describe('O caso que originou o pedido', () => {
  it('uma Coca é BEBIDAS e um chiclete é BOMBONIERE', () => {
    expect(setorDe('Coca-Cola 2L')).toBe('bebidas');
    expect(setorDe('Chiclete Trident Menta')).toBe('bomboniere');
  });
});

describe('O romaneio real, setor por setor', () => {
  const casos: [string, string][] = [
    /* CARNES CHURRASCO */
    ['2 cxs alcatra', 'carnes'],
    ['1 cx maminha', 'carnes'],
    ['1 cx picanha', 'carnes'],
    ['1 cx fraldinha', 'carnes'],
    ['1 pacote filezinho', 'carnes'],
    ['6 cupim', 'carnes'],
    ['2 cxs coração', 'carnes'],
    ['2 cxs medalhão', 'carnes'],
    ['1 cx sobrecoxa', 'carnes'],

    /* CÂMARAS FRIAS */
    ['2 requeijão moedense balcão', 'frias'],
    ['10 mussarela fatiado', 'frias'],
    ['5 presunto fatiado', 'frias'],
    ['1 cx toucinho barriga', 'frias'],
    ['2 cxs espetinho de frango', 'frias'],
    ['1 cx camarão com casca', 'frias'],
    ['10 cxs pão de queijo', 'frias'],

    /* SALGADOS */
    ['1 cx coxinha frango requeijão', 'salgados'],
    ['1 cx coxinha camarão', 'salgados'],
    ['1 cx bolinho aipim com carne sol', 'salgados'],
    ['1 cx risole de milho', 'salgados'],
    ['1 cx kibe', 'salgados'],
    ['1 cx esfirra carne', 'salgados'],
    ['1 cx pastel assado', 'salgados'],
    ['1 cx hambúrguer assado', 'salgados'],
    ['2 cxs Tortinhas de frango', 'salgados'],

    /* CONFEITARIA */
    ['3 Bolos cenoura', 'confeitaria'],
    ['6 Broas', 'confeitaria'],
    ['1 torta doce inteira média', 'confeitaria'],
    ['12 embalagens Brigadeiros com 4unid', 'confeitaria'],
    ['120 unid pães de sal', 'confeitaria'],

    /* DESPENSA COZINHA */
    ['3 cxs óleo', 'despensa'],
    ['1 cx ovos', 'despensa'],
    ['5 cxs catchup sachê', 'despensa'],
    ['1 sc feijão carioca 50kg', 'despensa'],
    ['1 fd sal grosso', 'despensa'],
    ['3 fds açúcar 5kg', 'despensa'],
    ['4 fds arroz sempre bom', 'despensa'],
    ['2 fds arroz integral', 'despensa'],
    ['2 pcts colorau', 'despensa'],
    ['1 cx gordura vegetal hidrogenada', 'despensa'],
    ['Molhos de Pimenta grandes e pequenos', 'despensa'],

    /* BOMBONIERE DIVERSOS */
    ['2 cxs Halls drops Uva verde', 'bomboniere'],
    ['2 cxs Balas Goma Gomets tubo', 'bomboniere'],
    ['4 cxs Trident Tradicional Menta verde', 'bomboniere'],
    ['2 pcts Balas ice kiss 600g', 'bomboniere'],
    ['Chocolates Lacta pequenos', 'bomboniere'],
    ['Chocolate Talento 85g', 'bomboniere'],
    ['1 cx Chocolates Snickers original 45g', 'bomboniere'],
    ['1 cx Chocolate Prestígio tradicional 33g', 'bomboniere'],
    ['1 cx Chocolate Lollo 28g', 'bomboniere'],
    ['1 cx Chocolate Trento Vermelho 29g', 'bomboniere'],
    ['Chocolates KIT KAT 41,5G', 'bomboniere'],
    ['1 cx Bananinha FADUNI tradicional', 'bomboniere'],
    ['1 cx Paçoquita Tradicional', 'bomboniere'],
    ['1 fd Amendoim Ligeiro 250g', 'bomboniere'],
    ['1 cx espetos de Paçoca Ricco', 'bomboniere'],
    ['50 pcts Amendoim Beijo Quente Bom Apetite 70g', 'bomboniere'],
    ['10 unid BIS branco caixinha 100,8g', 'bomboniere'],
    ['1 cx Biscoito polvilho palito Sô Mineiro', 'bomboniere'],

    /* BEBIDAS */
    ['50 coca cola lata', 'bebidas'],
    ['5 gatorade limão', 'bebidas'],
    ['1 cx suco Leveger de cada sabor', 'bebidas'],
    ['10 monster tradicional', 'bebidas'],
    ['3 cxs red bull tradicional', 'bebidas'],
    ['3 mate couro tradicional pet', 'bebidas'],

    /* DESCARTÁVEIS */
    ['3 cxs luvas silicone Vabene TAM G', 'descartaveis'],
    ['10 embalagens forminhas papel para empadas e salgados', 'descartaveis'],
    ['5 cxs palitos dentes', 'descartaveis'],
  ];

  for (const [produto, esperado] of casos) {
    it(`"${produto}" → ${esperado}`, () => {
      expect(setorDe(produto)).toBe(esperado);
    });
  }
});

describe('O termo mais LONGO vence o mais genérico', () => {
  it('"pão de queijo" é câmara fria, "pão de sal" é confeitaria', () => {
    /* Com a primeira correspondência ganhando, "pão" decidiria os dois. */
    expect(setorDe('10 cxs pão de queijo')).toBe('frias');
    expect(setorDe('120 unid pães de sal')).toBe('confeitaria');
  });

  it('"molho de pimenta" é despensa, mesmo com "pimenta" em nada mais', () => {
    expect(setorDe('Molho de Pimenta grande')).toBe('despensa');
  });

  it('mas o QUE a coisa é vence DO QUE ela é feita', () => {
    /* Aqui o comprimento levaria à resposta errada — "requeijão" tem 9 letras e
       "coxinha" tem 7; "carne sol" tem 9 e "bolinho" tem 7. É a PRIORIDADE do
       conceito (preparado > ingrediente) que decide, e é uma regra de negócio
       de verdade: uma coxinha de requeijão é separada pelos salgados. */
    expect(setorDe('1 cx coxinha frango requeijão')).toBe('salgados');
    expect(setorDe('1 cx bolinho aipim com carne sol')).toBe('salgados');
    expect(setorDe('1 cx coxinha camarão')).toBe('salgados');
  });

  it('e o RECIPIENTE vence o conteúdo', () => {
    /* "Forminhas de papel para empadas" é descartável, não salgado. */
    expect(setorDe('10 embalagens forminhas papel para empadas e salgados')).toBe('descartaveis');
  });

  it('"embalagem" sozinha NÃO decide nada', () => {
    /* No romaneio ela é unidade de medida — "12 embalagens de brigadeiro" são
       brigadeiros. Se fosse termo de descartáveis, roubaria a confeitaria. */
    expect(setorDe('12 embalagens Brigadeiros com 4unid')).toBe('confeitaria');
  });

  it('"palito" não rouba o biscoito palito', () => {
    /* "Palito" é forma do biscoito e também é o palito de dente. Ganha quem
       trouxer o termo mais específico. */
    expect(setorDe('1 cx Biscoito polvilho palito Sô Mineiro')).toBe('bomboniere');
    expect(setorDe('5 cxs palitos dentes')).toBe('descartaveis');
  });
});

describe('Palavra inteira, nunca pedaço de outra', () => {
  it('"sal" não casa dentro de "salgadinho" nem "salsicha"', () => {
    /* Sem fronteira de palavra o produto ia para o setor errado sem nada
       indicar por quê — e o separador é que descobriria, na doca. */
    expect(setorDe('Salsicha Hot Dog')).not.toBe('despensa');
    expect(setorDe('Salgadinho de queijo')).not.toBe('despensa');
  });

  it('"ovo" não casa dentro de "novo"', () => {
    expect(setorDe('Produto novo qualquer')).toBeNull();
  });
});

describe('Quando NÃO sugerir nada', () => {
  it('produto que nenhuma regra conhece devolve null', () => {
    /* Chutar "mais ou menos parecido" mandaria o item para a fila de um
       separador que não tem o que fazer com ele. */
    expect(sugerirSetorPorRegra('Peça de reposição do fogão', OITO)).toBeNull();
  });

  it('conceito sem setor CADASTRADO devolve null', () => {
    /* A rede hoje tem só Bebidas, Secos e Descartáveis. Um chiclete não tem
       para onde ir, e inventar um destino é pior que não sugerir. */
    const tresSetores: SetorCadastrado[] = [
      { id: 'b', name: 'Bebidas' }, { id: 's', name: 'Secos' }, { id: 'd', name: 'Descartáveis' },
    ];
    expect(sugerirSetorPorRegra('Chiclete Trident', tresSetores)).toBeNull();
    /* Mas o que TEM setor continua funcionando. */
    expect(sugerirSetorPorRegra('Coca-Cola 2L', tresSetores)?.sectorId).toBe('b');
    expect(sugerirSetorPorRegra('Arroz Tio João', tresSetores)?.sectorId).toBe('s');
  });

  it('sem setor nenhum cadastrado, nada é sugerido', () => {
    expect(sugerirSetorPorRegra('Coca-Cola 2L', [])).toBeNull();
  });

  it('nome vazio devolve null', () => {
    expect(sugerirSetorPorRegra('   ', OITO)).toBeNull();
  });
});

describe('Nenhum nome de setor está fixo no código', () => {
  it('o setor é achado pelo APELIDO, então renomear não quebra', () => {
    /* "Secos" e "DESPENSA COZINHA" são o mesmo lugar com nomes diferentes. Se
       os nomes estivessem no código, renomear pararia o classificador em
       silêncio — e ninguém ligaria uma coisa à outra. */
    for (const nome of ['Secos', 'DESPENSA COZINHA', 'Despensa / Cozinha', 'Estoque Seco', 'Mercearia']) {
      expect(sugerirSetorPorRegra('Arroz 5kg', [{ id: 'x', name: nome }])?.sectorId).toBe('x');
    }
  });

  it('acento e caixa no nome do setor não atrapalham', () => {
    expect(sugerirSetorPorRegra('Luvas', [{ id: 'd', name: 'DESCARTÁVEIS' }])?.sectorId).toBe('d');
  });
});

describe('A sugestão diz o que a decidiu', () => {
  it('devolve o termo, para a pessoa conferir em vez de confiar', () => {
    const s = sugerirSetorPorRegra('Coca-Cola 2L', OITO);
    expect(s?.termo).toBe('coca cola');
    expect(s?.fonte).toBe('REGRA');
  });
});

describe('Normalização', () => {
  it('tira acento, pontuação e caixa', () => {
    expect(normalizar('Chocolate PRESTÍGIO 33g')).toBe('chocolate prestigio 33g');
    expect(normalizar('Coca-Cola 2L')).toBe('coca cola 2l');
  });
});
