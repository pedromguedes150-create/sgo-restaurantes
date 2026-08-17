/**
 * Detector de SUMIÇO (Onda 7) — roda DENTRO da página.
 *
 * O audit-contrast.js mede texto sobre fundo. Ele é cego para o outro modo de
 * falha da migração de cores: um elemento que ficou da MESMA cor do vizinho e
 * simplesmente desapareceu. Aconteceu duas vezes —
 *   · o quadrado "BF" do login (bg-accent virou bg-brand sobre bg-brand);
 *   · o trilho do anel de progresso (classe órfã, stroke herdou a cor do texto).
 * Nos dois casos o contraste do TEXTO continuava perfeito.
 *
 * A regra aqui: se a classe DECLARA uma cor própria (bg-brand, border-danger,
 * text-success num ícone…), essa cor tem que se distinguir do que está atrás.
 * Elemento sem classe de cor é ignorado — dois <div> herdando o mesmo fundo é
 * layout normal, não defeito.
 *
 * Uso: injetar e chamar. Ao trocar de tema antes, force repintura (ver a nota
 * no topo de audit-contrast.js).
 */
window.__sumico = function () {
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (o) => 0.2126 * lin(o.r) + 0.7152 * lin(o.g) + 0.0722 * lin(o.b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); const [h, l] = x >= y ? [x, y] : [y, x]; return Math.floor(((h + 0.05) / (l + 0.05)) * 100) / 100; };
  const parse = (s) => {
    if (!s || s === 'none') return null;
    if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const p = m[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean).map(Number);
    return p.length < 3 ? null : { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (f, b) => ({
    r: Math.round(f.r * f.a + b.r * (1 - f.a)),
    g: Math.round(f.g * f.a + b.g * (1 - f.a)),
    b: Math.round(f.b * f.a + b.b * (1 - f.a)), a: 1,
  });
  const base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };

  /** Fundo efetivo ATRÁS do elemento (começa no pai). */
  function atras(el) {
    const camadas = [];
    let n = el.parentElement;
    while (n && n.nodeType === 1) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 1) break; }
      n = n.parentElement;
    }
    let b = { ...base, a: 1 };
    for (let i = camadas.length - 1; i >= 0; i--) b = over(camadas[i], b);
    return b;
  }

  const classe = (el) => (typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '');

  /**
   * Cada checagem exige a classe que a justifica — senão vira ruído. Um
   * elemento com `text-ink-700` e fundo branco sobre branco NÃO é sumiço: quem
   * o delimita é a borda ou o próprio texto, não o preenchimento.
   * Cinzas de superfície (surface/canvas/sunken/line) ficam de fora: existem
   * para serem sutis.
   */
  const DESTAQUE = '(?:brand|danger|warning|info|success|on-brand)';
  const TEM_FILL = new RegExp(`(?:^|[\\s:])bg-${DESTAQUE}(?:-(?:hover|tint|tint-2|bg))?(?:/\\d+)?(?=$|\\s)`);
  const TEM_BORDA = new RegExp(`(?:^|[\\s:])border-${DESTAQUE}(?:/\\d+)?(?=$|\\s)`);
  const TEM_TRACO = new RegExp(`(?:^|[\\s:])(?:text|fill|stroke)-(?:${DESTAQUE}|ink-900|ink-700|ink-500)(?:/\\d+)?(?=$|\\s)`);
  const CORPROPRIA = new RegExp(`${TEM_FILL.source}|${TEM_BORDA.source}|${TEM_TRACO.source}`);

  /** Borda visível já delimita o elemento — o preenchimento não precisa. */
  function bordaSalva(el, s, bg) {
    if ((parseFloat(s.borderTopWidth) || 0) <= 0) return false;
    const bc = parse(s.borderTopColor);
    if (!bc || bc.a === 0) return false;
    return ratio(bc.a < 1 ? over(bc, bg) : bc, bg) >= 1.5;
  }

  const visivel = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 3 && r.height >= 3;
  };

  const achados = [];
  let checados = 0;

  for (const el of document.querySelectorAll('body *')) {
    const cls = classe(el);
    if (!CORPROPRIA.test(cls) || !visivel(el)) continue;
    const s = getComputedStyle(el);
    const bg = atras(el);
    const rect = el.getBoundingClientRect();
    const temTextoProprio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

    // 1) Preenchimento de destaque que virou o próprio fundo.
    const fill = parse(s.backgroundColor);
    if (TEM_FILL.test(cls) && fill && fill.a > 0 && !bordaSalva(el, s, bg)) {
      checados++;
      const solido = fill.a < 1 ? over(fill, bg) : fill;
      const r = ratio(solido, bg);
      if (r < 1.15) achados.push({ tipo: 'preenchimento', cls: cls.slice(0, 60), cor: s.backgroundColor, atras: `rgb(${bg.r},${bg.g},${bg.b})`, px: `${Math.round(rect.width)}x${Math.round(rect.height)}`, r });
    }

    // 2) Borda declarada que não se distingue do que está atrás.
    const bw = parseFloat(s.borderTopWidth) || 0;
    if (bw > 0 && TEM_BORDA.test(cls)) {
      checados++;
      const bc = parse(s.borderTopColor);
      if (bc && bc.a > 0) {
        const solido = bc.a < 1 ? over(bc, bg) : bc;
        const r = ratio(solido, bg);
        if (r < 1.15) achados.push({ tipo: 'borda', cls: cls.slice(0, 60), cor: s.borderTopColor, atras: `rgb(${bg.r},${bg.g},${bg.b})`, px: `${Math.round(rect.width)}x${Math.round(rect.height)}`, r });
      }
    }

    // 3) Ícone/traço de SVG sumido (sem texto próprio para denunciar).
    if (!temTextoProprio && TEM_TRACO.test(cls) && ['svg', 'path', 'circle', 'rect'].includes(el.tagName.toLowerCase())) {
      const st = parse(s.stroke) || parse(s.fill);
      if (st && st.a > 0) {
        checados++;
        const solido = st.a < 1 ? over(st, bg) : st;
        const r = ratio(solido, bg);
        if (r < 1.5) achados.push({ tipo: 'traço svg', cls: cls.slice(0, 60), cor: s.stroke !== 'none' ? s.stroke : s.fill, atras: `rgb(${bg.r},${bg.g},${bg.b})`, px: `${Math.round(rect.width)}x${Math.round(rect.height)}`, r });
      }
    }
  }

  return {
    url: location.pathname,
    tema: document.documentElement.getAttribute('data-theme'),
    checados,
    sumidos: achados.length,
    achados: achados.sort((a, b) => a.r - b.r).slice(0, 10),
  };
};
