import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getAuditoriaDeAtestados } from '@/lib/certificates/auditoria';
import { ROTULO_SITUACAO } from '@/lib/certificates/auditoria-regras';

/** Excel da auditoria de atestados (v1.181.0): ESPERADOS · POR UNIDADE · POR GERENTE. ?mes=AAAA-MM&unit=. Mesma leitura da tela. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') ?? '') ? url.searchParams.get('mes')! : new Date().toISOString().slice(0, 7);
  const unit = url.searchParams.get('unit') || undefined;
  const a = await getAuditoriaDeAtestados(user, ym, unit);
  const br = (iso: string) => iso.split('-').reverse().join('/');
  const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Unidade', 'Colaborador', 'Início', 'Fim', 'Ciência do gerente', 'Prazo', 'Lançado em', 'Lançado por', 'Situação', 'Recebido por', 'Informado por', 'Justificativa', 'Decisão da supervisão', 'Nota da supervisão', 'Responsável (validado)'],
    ...a.esperados.map((e) => [e.unitName, e.collaboratorName, br(e.startDate), br(e.endDate), hora(e.noticeAt), hora(e.prazoAte), hora(e.lancamento?.lancadoEm ?? null), e.lancamento?.lancadoPor ?? '', ROTULO_SITUACAO[e.situacao], e.receivedByName ?? '', e.informedByName, e.justification ?? '', e.reviewedByName ? `${e.reviewStatus} — ${e.reviewedByName}` : '', e.reviewNote ?? '', e.responsibleName ?? '']),
  ]), 'ESPERADOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Unidade', 'Esperados', 'Conformes', 'Justificados', 'Falhas confirmadas', 'Em conferência', 'No prazo', 'Inválidos', 'Conformidade (%)', 'Penalização (% do peso)', 'Pontos do componente'],
    ...a.porUnidade.map((u) => [u.unitName, u.esperados, u.conformes, u.justificados, u.falhas, u.emConferencia, u.noPrazo, u.invalidos, u.pct ?? '', u.penalizacao ?? '', u.pontos ?? '']),
    ['REDE', a.rede.esperados, a.rede.conformes, a.rede.justificados, a.rede.falhas, a.rede.emConferencia, a.rede.noPrazo, a.rede.invalidos, a.rede.pct ?? '', a.rede.penalizacao ?? '', a.rede.pontos ?? ''],
  ]), 'POR UNIDADE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Gerente/Coordenador', 'Unidade(s)', 'Falhas confirmadas (responsável validado)', 'Lançamentos', 'Lançamentos no prazo'],
    ...a.porGerente.map((g) => [g.name, g.unidades.join(', '), g.falhasConfirmadas, g.lancamentos, g.lancamentosNoPrazo]),
  ]), 'POR GERENTE');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="auditoria_atestados_${ym}.xlsx"` } });
}
