import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getRelatorioDeGas } from '@/lib/gas/query';

/**
 * Exporta o relatório do gás em CSV (abre no Excel).
 *
 * DUAS SEÇÕES no mesmo arquivo: o resumo por unidade (a pergunta gerencial) e o
 * detalhamento nota a nota (a conferência). Dois arquivos separados obrigariam
 * a abrir os dois para responder "por que a média subiu", que é sempre a
 * próxima pergunta.
 *
 * A variação sai recalculada da série, como na tela — não das colunas gravadas
 * no lançamento, que envelheciam com nota retroativa e correção de data.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const url = new URL(req.url);
  /* `unit` filtra o relatório inteiro a UMA unidade — o mesmo filtro da tela.
     O escopo do usuário continua valendo dentro de getRelatorioDeGas. */
  const unitId = url.searchParams.get('unit') || undefined;
  const relatorio = await getRelatorioDeGas(user, {
    de: url.searchParams.get('start') ?? undefined,
    ate: url.searchParams.get('end') ?? undefined,
    unitId,
    months: 12,
  });

  const sep = ';';
  /* Vírgula decimal: o Excel em pt-BR lê "6,4639" como número e "6.4639" como
     texto — e coluna de texto não soma. */
  const n2 = (v: number | null) => (v == null ? '' : v.toFixed(2).replace('.', ','));
  const n4 = (v: number | null) => (v == null ? '' : v.toFixed(4).replace('.', ','));
  const pct = (v: number | null) => (v == null ? '' : v.toFixed(1).replace('.', ','));
  const txt = (s: string) => `"${s.replace(/"/g, '""')}"`;

  const ate = relatorio.ate === '9999-12-31' ? 'hoje' : relatorio.ate;
  const linhas: string[] = [
    txt(`Relatório do gás — ${relatorio.de} a ${ate}`),
    '',
    txt('RESUMO POR UNIDADE'),
    ['Unidade', 'Notas', 'Kg', 'Valor (R$)', 'Preço médio R$/kg', 'Menor R$/kg', 'Maior R$/kg', 'Primeiro R$/kg', 'Último R$/kg', 'Variação no período %'].join(sep),
  ];

  for (const u of relatorio.unidades) {
    linhas.push([
      txt(u.unit), String(u.notas), n2(u.kg), n2(u.valor),
      n4(u.precoMedio), n4(u.menorPreco), n4(u.maiorPreco),
      n4(u.primeiroPreco), n4(u.ultimoPreco), pct(u.variacaoNoPeriodo),
    ].join(sep));
  }

  const t = relatorio.total;
  linhas.push([
    txt('CONSOLIDADO DA REDE'), String(t.notas), n2(t.kg), n2(t.valor),
    n4(t.precoMedio), n4(t.menorPreco), n4(t.maiorPreco),
    n4(t.primeiroPreco), n4(t.ultimoPreco), pct(t.variacaoNoPeriodo),
  ].join(sep));

  linhas.push('', txt('DETALHAMENTO — TODAS AS NOTAS'));
  linhas.push(['Unidade', 'Data', 'Fornecedor', 'Lançado por', 'Kg', 'Valor (R$)', 'R$/kg', 'Anterior R$/kg', 'Variação %', 'Alerta', 'Data corrigida por'].join(sep));
  for (const u of relatorio.unidades) {
    for (const r of u.rows) {
      linhas.push([
        txt(u.unit), r.date, txt(r.supplier), txt(r.lancadoPor ?? ''),
        n2(r.kg), n2(r.total), n4(r.price), n4(r.prevPrice), pct(r.variationPct),
        r.alerted ? 'sim' : '', txt(r.dateEdited ? (r.dateEditedByName ?? 'sim') : ''),
      ].join(sep));
    }
  }

  /* BOM na frente: sem ele o Excel abre o arquivo em Latin-1 e "Variação" vira
     "VariaÃ§Ã£o" na primeira coluna que alguém for ler. */
  const csv = '﻿' + linhas.join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gas-${unitId && relatorio.unidades[0] ? `${relatorio.unidades[0].unit.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}-` : ''}${relatorio.de}-a-${ate}.csv"`,
    },
  });
}
