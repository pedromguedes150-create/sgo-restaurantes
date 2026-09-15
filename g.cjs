const fs = require('fs');
const p = 'src/lib/guide.ts';
let s = fs.readFileSync(p, 'utf8');
const i = s.indexOf("        id: 'produtos'");
if (i < 0) { console.log('X'); process.exit(1); }
const fim = s.indexOf('        ],', i);
if (fim < 0) { console.log('X steps'); process.exit(1); }
const novo = `          'PEDIDOS INTERNOS (v1.86.0): a tela abre com "+ Iniciar pedido", e não mais com a lista inteira de produtos. Fluxo: iniciar → adicionar itens (câmera ou busca) → revisar → enviar ao CD.',
          'ESCANEAR: toque em "Escanear produto" e aponte a câmera para o código de barras. O produto entra no pedido e você continua bipando.',
          'CÓDIGO NÃO RECONHECIDO: o mesmo produto chega com código diferente conforme a remessa. Quando isso acontecer, a tela pede para localizar o produto na mão e oferece "Associar" (fica no cadastro para as próximas vezes) ou "Só desta vez". Associar é permanente e vale para a rede — por isso só quem edita o catálogo pode.',
          'BUSCA: por nome, categoria ou código de barras, ignorando acento e maiúsculas — "mucarela" acha "Muçarela". Quem começa com a palavra digitada vem primeiro.',
          'SUGESTÃO: a partir do histórico da PRÓPRIA unidade, mostrando a quantidade de costume e os últimos pedidos, para você conferir de onde veio o número. Use "Montar pedido sugerido" ou adicione um a um. Nada é enviado sozinho.',
          'A barra de baixo mostra quantos itens estão no pedido e leva à revisão. Na revisão você confere tudo, escreve uma observação para o CD e envia.',
`;
s = s.slice(0, fim) + novo + s.slice(fim);
fs.writeFileSync(p, s);
console.log('ok');
