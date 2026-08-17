/**
 * Auditor de contraste (Onda 7) — roda DENTRO da página.
 *
 * Percorre o DOM, resolve a cor efetiva de cada par texto/fundo e reprova o que
 * fica abaixo da regra 3 do contrato (AAA ≥7:1 normal, ≥4,5:1 texto grande).
 *
 * Existe porque a migração de cores troca ~2.100 usos de classe de uma vez e
 * print não mede contraste. É a rede de segurança da onda.
 *
 * Uso: cole o conteúdo no console (ou injete via ferramenta de navegador).
 * Devolve JSON: { total, reprovados, piores[], porClasse{} }.
 *
 * ⚠ AO TROCAR DE TEMA NA MESMA SESSÃO, force uma repintura antes de medir:
 *
 *     document.documentElement.setAttribute('data-theme', 'dark');
 *     document.documentElement.style.display = 'none';
 *     void document.documentElement.offsetHeight;
 *     document.documentElement.style.display = '';
 *
 * Sem isso o Chrome devolve `background-color` velho em elementos com
 * `backdrop-filter` (as barras `bg-glass`): a variável já resolve na cor nova,
 * mas o computed style continua na antiga. Isso rendeu 18 "reprovações"
 * fantasma numa tela que estava correta — o valor lido era o do tema anterior.
 *
 * A matemática é a mesma de src/lib/ds/contrast.ts (que tem testes). Está
 * duplicada aqui de propósito: este arquivo precisa ser autossuficiente para
 * ser colado no console, sem bundler no meio.
 */
(function auditarContraste() {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (c1, c2) => {
    const a = lum(c1), b = lum(c2);
    const [hi, lo] = a >= b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  };
  const parse = (s) => {
    if (!s) return null;
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const p = m[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean).map(Number);
    if (p.length < 3) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
    a: 1,
  });

  /**
   * Fundo efetivo: sobe a árvore até achar algo opaco, compondo as camadas
   * semitransparentes no caminho. Sem isto, um card translúcido sobre a página
   * seria lido como "transparente" e o contraste sairia errado.
   */
  function fundoEfetivo(el) {
    const camadas = [];
    let n = el;
    while (n && n !== document.documentElement.parentNode) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        camadas.push(c);
        if (c.a >= 1) break;
      }
      n = n.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = camadas.length - 1; i >= 0; i--) base = over(camadas[i], base);
    return base;
  }

  const visivel = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /** Só elementos com texto PRÓPRIO — senão o mesmo texto conta em cada ancestral. */
  const textoProprio = (el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const achados = [];
  let total = 0;

  for (const el of document.querySelectorAll('body *')) {
    if (!textoProprio(el) || !visivel(el)) continue;
    const s = getComputedStyle(el);
    let fg = parse(s.color);
    if (!fg) continue;
    const bg = fundoEfetivo(el);
    if (fg.a < 1) fg = over(fg, bg);

    const size = parseFloat(s.fontSize) || 16;
    const weight = Number(s.fontWeight) || 400;
    const grande = size >= 24 || (weight >= 700 && size >= 18.66);
    const alvo = grande ? 4.5 : 7;
    const r = Math.floor(ratio(fg, bg) * 100) / 100;

    total++;
    if (r < alvo) {
      achados.push({
        texto: el.textContent.trim().slice(0, 60),
        classe: (typeof el.className === 'string' ? el.className : '').slice(0, 90),
        tag: el.tagName.toLowerCase(),
        cor: s.color,
        fundo: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
        px: Math.round(size * 10) / 10,
        peso: weight,
        razao: r,
        alvo,
      });
    }
  }

  // Agrupa por classe de cor: 40 reprovações costumam ser 3 classes repetidas.
  const porClasse = {};
  for (const a of achados) {
    const cor = (a.classe.match(/\b(?:text|bg)-[\w-]+/g) || ['(sem classe de cor)']).join(' ');
    porClasse[cor] = (porClasse[cor] || 0) + 1;
  }

  return JSON.stringify({
    url: location.pathname + location.search,
    tema: document.documentElement.getAttribute('data-theme'),
    total,
    reprovados: achados.length,
    porClasse,
    piores: achados.sort((x, y) => x.razao - y.razao).slice(0, 12),
  });
})();
