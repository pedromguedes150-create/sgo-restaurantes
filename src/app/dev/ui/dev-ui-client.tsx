'use client';

import { useEffect, useMemo, useState } from 'react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { useTheme } from '@/components/theme/theme-provider';
import { ComponentsGallery } from './components-gallery';

/* ------------------------------------------------------------------ dados */

const TYPE = [
  { cls: 'sgo-type-34', spec: '34 / 40 · −0.022em' },
  { cls: 'sgo-type-28', spec: '28 / 34 · −0.020em' },
  { cls: 'sgo-type-22', spec: '22 / 28 · −0.016em' },
  { cls: 'sgo-type-20', spec: '20 / 26 · −0.014em' },
  { cls: 'sgo-type-17', spec: '17 / 24 · −0.011em' },
  { cls: 'sgo-type-15', spec: '15 / 20 · −0.006em' },
  { cls: 'sgo-type-13', spec: '13 / 18 · −0.002em' },
  { cls: 'sgo-type-12', spec: '12 / 16 · 0' },
  { cls: 'sgo-type-11', spec: '11 / 14 · +0.06em · caixa alta' },
] as const;

interface Swatch {
  name: string;
  cssVar: string;
  on?: string; // referência p/ cálculo de contraste
  onLabel?: string;
}

const INK: Swatch[] = [
  { name: 'ink-900', cssVar: '--sgo-ink-900', on: '--sgo-surface' },
  { name: 'ink-700', cssVar: '--sgo-ink-700', on: '--sgo-surface' },
  { name: 'ink-500', cssVar: '--sgo-ink-500', on: '--sgo-surface' },
  { name: 'ink-400', cssVar: '--sgo-ink-400', on: '--sgo-surface' },
];
const SURFACES: Swatch[] = [
  { name: 'canvas', cssVar: '--sgo-canvas' },
  { name: 'surface', cssVar: '--sgo-surface' },
  { name: 'sunken', cssVar: '--sgo-sunken' },
  { name: 'line', cssVar: '--sgo-line' },
  { name: 'line-strong', cssVar: '--sgo-line-strong' },
];
const BRAND: Swatch[] = [
  { name: 'brand', cssVar: '--sgo-brand', on: '--sgo-on-brand', onLabel: 'on-brand' },
  { name: 'brand-hover', cssVar: '--sgo-brand-hover', on: '--sgo-on-brand', onLabel: 'on-brand' },
  { name: 'brand-tint', cssVar: '--sgo-brand-tint', on: '--sgo-brand', onLabel: 'brand' },
  { name: 'brand-tint-2', cssVar: '--sgo-brand-tint-2', on: '--sgo-brand', onLabel: 'brand' },
  { name: 'on-brand', cssVar: '--sgo-on-brand', on: '--sgo-brand', onLabel: 'brand' },
];
const STATUS: Swatch[] = [
  { name: 'success', cssVar: '--sgo-success', on: '--sgo-success-bg', onLabel: 'success-bg' },
  { name: 'warning', cssVar: '--sgo-warning', on: '--sgo-warning-bg', onLabel: 'warning-bg' },
  { name: 'danger', cssVar: '--sgo-danger', on: '--sgo-danger-bg', onLabel: 'danger-bg' },
  { name: 'info', cssVar: '--sgo-info', on: '--sgo-info-bg', onLabel: 'info-bg' },
];
const STATUS_BG: Swatch[] = [
  { name: 'success-bg', cssVar: '--sgo-success-bg' },
  { name: 'warning-bg', cssVar: '--sgo-warning-bg' },
  { name: 'danger-bg', cssVar: '--sgo-danger-bg' },
  { name: 'info-bg', cssVar: '--sgo-info-bg' },
];

const SPACE = [4, 8, 16, 24, 32, 40, 48, 64, 80] as const;
const RADII = [
  { name: 'control', cls: 'rounded-control', px: '10px' },
  { name: 'card', cls: 'rounded-card', px: '16px' },
  { name: 'sheet', cls: 'rounded-sheet', px: '20px' },
  { name: 'pill', cls: 'rounded-pill', px: '999px' },
] as const;
const EASES = [
  { name: 'std', cls: 'ease-sgo-std', hint: 'padrão' },
  { name: 'nav', cls: 'ease-sgo-nav', hint: 'navegação' },
  { name: 'spring', cls: 'ease-sgo-spring', hint: 'mola' },
] as const;

/* ------------------------------------------------------------- contraste */

const ALL_VARS = Array.from(
  new Set(
    [...INK, ...SURFACES, ...BRAND, ...STATUS, ...STATUS_BG].flatMap((s) =>
      [s.cssVar, s.on].filter(Boolean) as string[],
    ),
  ),
);

function relLuminance([r, g, b]: number[]): number {
  const a = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(fg: number[], bg: number[]): number {
  const l1 = relLuminance(fg);
  const l2 = relLuminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}
function rate(ratio: number): { label: string; chip: string } {
  if (ratio >= 7) return { label: 'AAA', chip: 'bg-sgo-success-bg text-sgo-success' };
  if (ratio >= 4.5) return { label: 'AA', chip: 'bg-sgo-success-bg text-sgo-success' };
  if (ratio >= 3) return { label: 'AA grande', chip: 'bg-warning-bg text-warning' };
  return { label: 'baixo', chip: 'bg-danger-bg text-danger' };
}

/** Lê os valores resolvidos dos tokens no tema ativo (re-lê ao trocar de tema). */
function useResolvedTokens(): Record<string, number[]> {
  const { theme } = useTheme();
  const [map, setMap] = useState<Record<string, number[]>>({});
  useEffect(() => {
    const probe = document.createElement('span');
    probe.style.position = 'absolute';
    probe.style.opacity = '0';
    probe.style.pointerEvents = 'none';
    document.body.appendChild(probe);
    const next: Record<string, number[]> = {};
    for (const v of ALL_VARS) {
      probe.style.color = `var(${v})`;
      const m = getComputedStyle(probe).color.match(/\d+/g);
      if (m) next[v] = m.slice(0, 3).map(Number);
    }
    probe.remove();
    setMap(next);
    // dupla leitura no próximo frame — cobre a troca de atributo data-theme
    const id = requestAnimationFrame(() => {
      const p2 = document.createElement('span');
      p2.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
      document.body.appendChild(p2);
      const n2: Record<string, number[]> = {};
      for (const v of ALL_VARS) {
        p2.style.color = `var(${v})`;
        const m = getComputedStyle(p2).color.match(/\d+/g);
        if (m) n2[v] = m.slice(0, 3).map(Number);
      }
      p2.remove();
      setMap(n2);
    });
    return () => cancelAnimationFrame(id);
  }, [theme]);
  return map;
}

/* ------------------------------------------------------------ componentes */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-16">
      <h2 className="sgo-type-22 mb-4 font-semibold text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

function ColorCard({ s, tokens }: { s: Swatch; tokens: Record<string, number[]> }) {
  const rgb = tokens[s.cssVar];
  const onRgb = s.on ? tokens[s.on] : undefined;
  const ratio = rgb && onRgb ? contrast(rgb, onRgb) : undefined;
  const r = ratio ? rate(ratio) : undefined;
  return (
    <div className="overflow-hidden rounded-card border border-line bg-sgo-surface">
      <div
        className="flex h-16 items-center justify-center border-b border-line"
        style={{ background: `var(${s.cssVar})` }}
      >
        {s.on && (
          <span
            className="sgo-type-13 font-semibold"
            style={{ color: `var(${s.on})` }}
          >
            {s.onLabel ?? 'texto'}
          </span>
        )}
      </div>
      <div className="p-2">
        <div className="sgo-type-13 font-semibold text-ink-900">{s.name}</div>
        <div className="sgo-type-11 sgo-nums text-ink-400">
          {rgb ? toHex(rgb) : '—'}
        </div>
        {r && ratio && (
          <div className="mt-1 flex items-center gap-1">
            <span className={`sgo-type-11 sgo-nums rounded-pill px-2 py-0.5 font-semibold ${r.chip}`}>
              {ratio.toFixed(2)}:1 · {r.label}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ColorGrid({ items, tokens }: { items: Swatch[]; tokens: Record<string, number[]> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((s) => (
        <ColorCard key={s.name} s={s} tokens={tokens} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export function DevUiClient() {
  const tokens = useResolvedTokens();
  const [motionOn, setMotionOn] = useState(false);

  const reduced = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setMotionOn((v) => !v), 1400);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    // data-sheet-scales: este container recua para scale(.94) quando um Sheet abre.
    <div data-sheet-scales className="min-h-screen bg-canvas text-ink-900">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <header className="mb-16 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="sgo-type-11 mb-1 text-ink-400">SGO · Redesign · Onda 0</p>
            <h1 className="sgo-type-34 font-bold text-ink-900">Design System</h1>
            <p className="sgo-body mt-2 text-ink-500">
              Tokens, tipografia, espaço, raios e movimento. Contraste medido no
              tema ativo. Alterne claro/escuro/sistema ao lado.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <Section title="Tipografia">
          <div className="divide-y divide-line rounded-card border border-line bg-sgo-surface">
            {TYPE.map((t) => (
              <div key={t.cls} className="flex flex-wrap items-baseline justify-between gap-2 p-4">
                <span className={`${t.cls} text-ink-900`}>Churrascaria Beija-Flor</span>
                <span className="sgo-type-12 sgo-nums text-ink-400">{t.spec}</span>
              </div>
            ))}
            <div className="flex flex-wrap items-baseline justify-between gap-2 p-4">
              <span className="sgo-body text-ink-900">
                Corpo responsivo — 17px no mobile, 15px acima de 1024px.
              </span>
              <span className="sgo-type-12 text-ink-400">.sgo-body</span>
            </div>
          </div>
        </Section>

        <Section title="Tinta (texto)">
          <ColorGrid items={INK} tokens={tokens} />
        </Section>
        <Section title="Superfícies e linhas">
          <ColorGrid items={SURFACES} tokens={tokens} />
        </Section>
        <Section title="Marca">
          <ColorGrid items={BRAND} tokens={tokens} />
        </Section>
        <Section title="Status (texto sobre o próprio fundo)">
          <ColorGrid items={STATUS} tokens={tokens} />
        </Section>
        <Section title="Status · fundos">
          <ColorGrid items={STATUS_BG} tokens={tokens} />
        </Section>

        <Section title="Espaçamento (grid 8pt)">
          <div className="space-y-2 rounded-card border border-line bg-sgo-surface p-4">
            {SPACE.map((n) => (
              <div key={n} className="flex items-center gap-3">
                <span className="sgo-type-12 sgo-nums w-10 text-right text-ink-400">{n}</span>
                <span className="h-4 rounded-control bg-sgo-brand" style={{ width: `${n}px` }} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Raios">
          <div className="flex flex-wrap gap-4">
            {RADII.map((r) => (
              <div key={r.name} className="text-center">
                <div className={`h-20 w-20 border border-line bg-sgo-brand-tint-2 ${r.cls}`} />
                <div className="sgo-type-13 mt-2 font-semibold text-ink-900">{r.name}</div>
                <div className="sgo-type-11 sgo-nums text-ink-400">{r.px}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Movimento (durações 120 / 200 / 340 / 400ms)">
          <div className="space-y-4 rounded-card border border-line bg-sgo-surface p-4">
            {EASES.map((e) => (
              <div key={e.name} className="flex items-center gap-3">
                <span className="sgo-type-12 w-20 text-ink-400">
                  {e.name} <span className="text-ink-500">· {e.hint}</span>
                </span>
                <div className="relative h-8 flex-1 rounded-pill bg-sunken">
                  <span
                    className={`absolute top-1 h-6 w-6 rounded-pill bg-sgo-brand transition-transform duration-sgo-4 ${e.cls}`}
                    style={{ transform: motionOn ? 'translateX(calc(100% + 0.25rem))' : 'translateX(0.25rem)' }}
                  />
                </div>
              </div>
            ))}
            {reduced && (
              <p className="sgo-type-12 text-ink-400">
                prefers-reduced-motion ativo — animação desligada.
              </p>
            )}
          </div>
        </Section>

        <ComponentsGallery />

        <Section title="Foco (anel duplo)">
          <div className="flex flex-wrap gap-4 rounded-card border border-line bg-sgo-surface p-4">
            <button className="h-10 rounded-control bg-sgo-brand px-4 text-on-brand outline-none focus-visible:shadow-sgo-focus">
              Botão (Tab p/ focar)
            </button>
            <button className="h-10 rounded-control border border-line-strong bg-sgo-surface px-4 text-ink-900 outline-none focus-visible:shadow-sgo-focus">
              Secundário
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
