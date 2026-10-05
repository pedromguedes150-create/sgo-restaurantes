import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { getVisitaOperacional } from '@/lib/supervisor/operacional';
import { ROTULO_SITUACAO } from '@/lib/supervisor/operacional-calculo';

/** Excel da visita operacional (v1.155.0): Resumo · Itens · Plano de ação. */
const RESP: Record<string, string> = { CONFORME: 'Conforme', NAO_CONFORME: 'Não conforme', NAO_SE_APLICA: 'Não se aplica' };
const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const id = new URL(req.url).searchParams.get('visita') ?? '';
  const d = await getVisitaOperacional(user, id);
  if (!d) return NextResponse.json({ error: 'Visita não encontrada' }, { status: 404 });
  const a = d.resumo.aderencia;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Visita operacional'],
    ['Unidade', d.unidade?.name ?? ''], ['Data', br(d.visita.data)], ['Supervisor', d.visita.supervisor], ['Situação', d.visita.status === 'DONE' ? 'Concluída' : 'Em andamento'],
    [],
    ['Aderência operacional (%)', a.pct ?? 'sem itens conferidos'], ['Itens no roteiro', a.total], ['Respondidos', a.respondidos],
    ['Conformes', a.conformes], ['Não conformes', a.naoConformes], ['Não se aplica', a.naoAplicaveis], ['Críticos', a.criticos], ['Reincidências', d.resumo.reincidencias],
    [],
    ['Principais desvios'], ...d.resumo.desvios.map((x) => [x.secao, x.qtd]),
    [],
    ['Pendências anteriores verificadas', d.resumo.pendenciasAnteriores.verificadas], ['Resolvidas', d.resumo.pendenciasAnteriores.resolvidas], ['Permanecem', d.resumo.pendenciasAnteriores.permanecem],
    ['Ações abertas', d.resumo.acoes.abertas], ['Ações críticas', d.resumo.acoes.criticas],
    [],
    ['Comentário', d.visita.feedback ?? ''],
  ]), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.respostas.map((r) => ({
    Seção: r.section, Item: r.text, Nível: r.level, Resposta: r.answer ? RESP[r.answer] : 'Pendente', Gravidade: r.gravity ?? '',
    'Conferidos (amostra)': r.sampleChecked ?? '', 'Conformes (amostra)': r.sampleOk ?? '', Temperatura: r.temperature ?? '',
    Observação: r.note ?? '', Fotos: r.photos.length, 'Respondido por': r.answeredByName ?? '',
  }))), 'Itens');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.acoes.map((x) => ({
    Problema: x.problem, Categoria: x.category, Responsável: x.responsibleName ?? '', Prazo: br(x.dueDate), Gravidade: x.gravity,
    Situação: ROTULO_SITUACAO[x.situacao], 'Ocorrência gerada': x.occurrenceId ? 'Sim' : '',
  }))), 'Plano de ação');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const nome = `visita-operacional-${(d.unidade?.name ?? 'unidade').replace(/[^\w]+/g, '-').toLowerCase()}-${d.visita.data}.xlsx`;
  return new NextResponse(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nome}"` } });
}
