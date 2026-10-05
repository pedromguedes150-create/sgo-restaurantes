import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { ehTipoFixo, tipoPorCodigo, TIPOS_DE_DESPERDICIO, totaisDoDia } from '@/lib/waste/tipos';
import {
  diasDoMes, faixaDoMes, hojeEmBrasilia, lancadoDepois, mapaDeLancamentos, porDiaDaSemana, porParte, porUnidade,
  resumir, serieDiaria, situacaoDaFoto, tendenciaMensal, variacaoDaMedia, direcao, ymDe, ymMenos,
  type RegistroDia, type SituacaoDaFoto,
} from '@/lib/waste/painel-calculo';
import type { SessionUser } from '@/lib/auth/session';

/**
 * PAINEL DE DESPERDÍCIO — servidor (v1.152.0). Conferência (cada lançamento com
 * as fotos) e Performance (gráficos: subiu ou caiu). As contas moram em
 * `painel-calculo.ts`; aqui só se lê o banco, SEMPRE recortado pelo escopo do
 * usuário (regra nº 3) — o filtro de unidade da URL é um AND, nunca um atalho.
 */
export type Frente = 'restaurante' | 'salgados';

const fmtHora = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
const diaBrasilia = (d: Date) => hojeEmBrasilia(d);

/** Unidades do alcance e, se pedido, só a escolhida (id fora do alcance = rede toda). */
export async function unidadesDoPainel(user: SessionUser, unitId?: string | null) {
  const todas = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const escolhida = unitId ? todas.find((u) => u.id === unitId) ?? null : null;
  return { todas, alvo: escolhida ? [escolhida] : todas, escolhida };
}

/* ───────────────────────── leitura em registros ───────────────────────── */

async function registrosRestaurante(unitIds: string[], de: string, ate: string): Promise<RegistroDia[]> {
  if (!unitIds.length) return [];
  const entries = await prisma.wasteEntry.findMany({
    where: { unitId: { in: unitIds }, operationalDate: { gte: de, lt: ate } },
    select: { unitId: true, operationalDate: true, items: { select: { kg: true, category: { select: { code: true } } } } },
  });
  return entries.map((e) => {
    const bruto: Record<string, number> = {};
    for (const i of e.items) if (ehTipoFixo(i.category.code)) bruto[i.category.code] = (bruto[i.category.code] ?? 0) + Number(i.kg);
    const t = totaisDoDia(bruto);
    const partes = Object.fromEntries(Object.entries(t.porCodigo).filter(([, v]) => v > 0));
    return { unitId: e.unitId, date: e.operationalDate, total: t.geral, partes };
  });
}

async function registrosSalgados(unitIds: string[], de: string, ate: string): Promise<RegistroDia[]> {
  if (!unitIds.length) return [];
  const rows = await prisma.wasteSnackDiscard.findMany({
    where: { unitId: { in: unitIds }, operationalDate: { gte: de, lt: ate } },
    select: { unitId: true, operationalDate: true, typeName: true, reasonName: true, quantity: true },
  });
  const por = new Map<string, RegistroDia>();
  for (const r of rows) {
    const k = `${r.unitId}|${r.operationalDate}`;
    const reg = por.get(k) ?? { unitId: r.unitId, date: r.operationalDate, total: 0, partes: {}, motivos: {} };
    reg.total += r.quantity;
    reg.partes[r.typeName] = (reg.partes[r.typeName] ?? 0) + r.quantity;
    reg.motivos![r.reasonName] = (reg.motivos![r.reasonName] ?? 0) + r.quantity;
    por.set(k, reg);
  }
  return [...por.values()];
}

const carregar = (frente: Frente) => (frente === 'restaurante' ? registrosRestaurante : registrosSalgados);

/* ─────────────────────────────── PERFORMANCE ─────────────────────────────── */

export const MESES_DA_TENDENCIA = 6;

export async function getPerformance(user: SessionUser, frente: Frente, year: number, month: number, unitId?: string | null) {
  const { todas, alvo, escolhida } = await unidadesDoPainel(user, unitId);
  const ids = alvo.map((u) => u.id);
  const inicio = ymMenos(year, month, MESES_DA_TENDENCIA - 1);
  const { ate } = faixaDoMes(year, month);
  const regs = await carregar(frente)(ids, `${ymDe(inicio.year, inicio.month)}-01`, ate);

  const ant = ymMenos(year, month, 1);
  const ymAtual = ymDe(year, month), ymAnt = ymDe(ant.year, ant.month);
  const atual = regs.filter((r) => r.date.startsWith(ymAtual));
  const anterior = regs.filter((r) => r.date.startsWith(ymAnt));
  const hoje = hojeEmBrasilia();
  const dias = diasDoMes(year, month, hoje);
  const diasAnt = diasDoMes(ant.year, ant.month, hoje);

  const rAtual = resumir(atual), rAnt = resumir(anterior);
  const variacao = variacaoDaMedia(rAtual, rAnt);

  /* Mesmo ponto do mês anterior (1º ao dia N): comparar "até hoje" com o mês
     inteiro passado faria todo começo de mês parecer queda. */
  const ateDia = dias.length;
  const anteriorAteHoje = anterior.filter((r) => Number(r.date.slice(8, 10)) <= ateDia);

  const nomeParte = (k: string) => (frente === 'restaurante' ? tipoPorCodigo(k)?.name ?? k : k);
  const partes = porParte(atual, anterior).map((p) => ({ ...p, nome: nomeParte(p.chave) }));

  /* Turno (só Restaurante): almoço × jantar, pelo turno de cada código. */
  const turnos = frente === 'restaurante'
    ? (['ALMOCO', 'JANTAR'] as const).map((turno) => {
        const codes = TIPOS_DE_DESPERDICIO.filter((t) => t.turno === turno).map((t) => t.code);
        const soma = (rs: RegistroDia[]) => rs.reduce((s, r) => s + codes.reduce((a, c) => a + (r.partes[c] ?? 0), 0), 0);
        const a = soma(atual), b = soma(anterior);
        const v = rAtual.lancamentos && rAnt.lancamentos && b ? ((a / rAtual.lancamentos - b / rAnt.lancamentos) / (b / rAnt.lancamentos)) * 100 : null;
        return { turno: turno === 'ALMOCO' ? 'Almoço' : 'Jantar', atual: a, anterior: b, variacao: v, direcao: direcao(v) };
      })
    : [];

  /* Tendência de cada unidade (para a minitendência ao lado da linha). */
  const tendenciaPorUnidade = Object.fromEntries(alvo.map((u) => [u.id, tendenciaMensal(regs.filter((r) => r.unitId === u.id), year, month, MESES_DA_TENDENCIA)]));

  return {
    frente, year, month, unidades: todas, escolhida,
    resumo: { atual: rAtual, anterior: rAnt, anteriorAteHoje: resumir(anteriorAteHoje), variacao, direcao: direcao(variacao), diasDecorridos: dias.length },
    serie: serieDiaria(atual, dias),
    serieAnterior: serieDiaria(anterior, diasAnt),
    porUnidade: porUnidade(atual, anterior, alvo),
    partes,
    motivos: frente === 'salgados' ? porParte(atual, anterior, 'motivos').map((p) => ({ ...p, nome: p.chave })) : [],
    turnos,
    diaDaSemana: porDiaDaSemana(atual),
    tendencia: tendenciaMensal(regs, year, month, MESES_DA_TENDENCIA),
    tendenciaPorUnidade,
  };
}

/* ─────────────────────────────── CONFERÊNCIA ─────────────────────────────── */

export interface FotoDoLancamento { rotulo: string; path: string }

export interface LancamentoConferido {
  id: string;
  unitId: string;
  unitName: string;
  date: string;
  total: number;
  /** Linhas do lançamento: "Sobra Limpa — Almoço 3,2 kg" / "Coxinha · Sobra do dia 4 un.". */
  linhas: { rotulo: string; valor: number; foto?: string | null }[];
  fotos: FotoDoLancamento[];
  foto: SituacaoDaFoto;
  /** Procedimentos com peso e sem foto (Restaurante). */
  faltamFotos: string[];
  registradoPor: string | null;
  registradoEm: string;
  atualizadoEm: string | null;
  depois: boolean;
  observacao: string | null;
}

export async function getConferencia(user: SessionUser, frente: Frente, year: number, month: number, unitId?: string | null) {
  const { todas, alvo, escolhida } = await unidadesDoPainel(user, unitId);
  const ids = alvo.map((u) => u.id);
  const nome = new Map(todas.map((u) => [u.id, u.name]));
  const { de, ate } = faixaDoMes(year, month);
  const dias = diasDoMes(year, month, hojeEmBrasilia());

  const lancamentos: LancamentoConferido[] = [];

  if (frente === 'restaurante' && ids.length) {
    const entries = await prisma.wasteEntry.findMany({
      where: { unitId: { in: ids }, operationalDate: { gte: de, lt: ate } },
      orderBy: [{ operationalDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, unitId: true, operationalDate: true, observation: true, evidencePath: true, createdAt: true, updatedAt: true,
        createdBy: { select: { name: true } },
        items: { select: { kg: true, category: { select: { code: true, name: true } } } },
        photos: { select: { typeCode: true, path: true } },
      },
    });
    for (const e of entries) {
      const fotoDe = new Map(e.photos.map((p) => [p.typeCode, p.path]));
      const linhas = e.items
        .filter((i) => Number(i.kg) > 0)
        .map((i) => ({ code: i.category.code, rotulo: tipoPorCodigo(i.category.code)?.name ?? i.category.name, valor: Number(i.kg) }))
        .sort((a, b) => (tipoPorCodigo(a.code)?.order ?? 999) - (tipoPorCodigo(b.code)?.order ?? 999));
      const exigidas = linhas.filter((l) => ehTipoFixo(l.code)).map((l) => l.code);
      const fotos: FotoDoLancamento[] = e.photos
        .sort((a, b) => (tipoPorCodigo(a.typeCode)?.order ?? 999) - (tipoPorCodigo(b.typeCode)?.order ?? 999))
        .map((p) => ({ rotulo: tipoPorCodigo(p.typeCode)?.name ?? p.typeCode, path: p.path }));
      if (e.evidencePath) fotos.push({ rotulo: 'Foto da balança (antiga)', path: e.evidencePath });
      const total = linhas.filter((l) => ehTipoFixo(l.code)).reduce((s, l) => s + l.valor, 0);
      const comFoto = [...fotoDe.keys(), ...(e.evidencePath ? exigidas : [])];
      lancamentos.push({
        id: e.id, unitId: e.unitId, unitName: nome.get(e.unitId) ?? '', date: e.operationalDate, total,
        linhas: linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor, foto: fotoDe.get(l.code) ?? null })),
        fotos,
        foto: situacaoDaFoto(exigidas, comFoto),
        faltamFotos: exigidas.filter((c) => !fotoDe.has(c) && !e.evidencePath).map((c) => tipoPorCodigo(c)?.name ?? c),
        registradoPor: e.createdBy?.name ?? null,
        registradoEm: fmtHora(e.createdAt),
        atualizadoEm: e.updatedAt.getTime() - e.createdAt.getTime() > 60_000 ? fmtHora(e.updatedAt) : null,
        depois: lancadoDepois(e.operationalDate, diaBrasilia(e.createdAt)),
        observacao: e.observation ?? null,
      });
    }
  }

  if (frente === 'salgados' && ids.length) {
    const [rows, evid] = await Promise.all([
      prisma.wasteSnackDiscard.findMany({
        where: { unitId: { in: ids }, operationalDate: { gte: de, lt: ate } },
        orderBy: [{ operationalDate: 'desc' }, { typeName: 'asc' }],
        select: { id: true, unitId: true, operationalDate: true, typeName: true, reasonName: true, quantity: true, createdAt: true, createdBy: { select: { name: true } } },
      }),
      prisma.wasteSnackDayEvidence.findMany({
        where: { unitId: { in: ids }, operationalDate: { gte: de, lt: ate } },
        select: { unitId: true, operationalDate: true, path: true },
      }),
    ]);
    const fotoDoDia = new Map(evid.map((e) => [`${e.unitId}|${e.operationalDate}`, e.path]));
    const grupos = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.unitId}|${r.operationalDate}`;
      grupos.set(k, [...(grupos.get(k) ?? []), r]);
    }
    for (const [k, rs] of grupos) {
      const [uId, date] = k.split('|');
      const path = fotoDoDia.get(k) ?? null;
      const criado = rs.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rs[0].createdAt);
      const total = rs.reduce((s, r) => s + r.quantity, 0);
      lancamentos.push({
        id: k, unitId: uId, unitName: nome.get(uId) ?? '', date, total,
        linhas: rs.map((r) => ({ rotulo: `${r.typeName} · ${r.reasonName}`, valor: r.quantity })),
        fotos: path ? [{ rotulo: 'Recipiente de descarte', path }] : [],
        foto: situacaoDaFoto(total > 0 ? ['dia'] : [], path ? ['dia'] : []),
        faltamFotos: [],
        registradoPor: rs[0].createdBy?.name ?? null,
        registradoEm: fmtHora(criado),
        atualizadoEm: null,
        depois: lancadoDepois(date, diaBrasilia(criado)),
        observacao: null,
      });
    }
    lancamentos.sort((a, b) => b.date.localeCompare(a.date) || a.unitName.localeCompare(b.unitName, 'pt-BR'));
  }

  const mapa = mapaDeLancamentos(alvo, dias, lancamentos.map((l) => ({ unitId: l.unitId, date: l.date, foto: l.foto })));
  const esperados = alvo.length * dias.length;
  return {
    frente, year, month, unidades: todas, escolhida, dias, mapa, lancamentos,
    resumo: {
      lancamentos: lancamentos.length,
      esperados,
      semLancamento: Math.max(0, esperados - lancamentos.length),
      fotoCompleta: lancamentos.filter((l) => l.foto === 'completa').length,
      fotoFaltando: lancamentos.filter((l) => l.foto === 'sem-foto' || l.foto === 'parcial').length,
      depois: lancamentos.filter((l) => l.depois).length,
    },
  };
}
