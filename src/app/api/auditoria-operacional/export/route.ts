import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getAuditoriaOperacional } from '@/lib/auditoria-operacional/auditoria';
import { ROTULO_ORIGEM, ROTULO_SITUACAO, moduloAuditado } from '@/lib/auditoria-operacional/regras';

/** Excel da auditoria operacional (v1.184.0): OCORRÊNCIAS · POR UNIDADE · POR GERENTE · MÓDULOS. ?mes=AAAA-MM&unit=&modulo=. Mesma leitura da tela. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') ?? '') ? url.searchParams.get('mes')! : new Date().toISOString().slice(0, 7);
  const unit = url.searchParams.get('unit') || undefined;
  const modulo = url.searchParams.get('modulo') || undefined;
  const a = await getAuditoriaOperacional(user, ym, { unitId: unit, modulo });
  const cat = moduloAuditado(a.modulo)!;
  const br = (iso: string) => iso.split('-').reverse().join('/');
  const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Módulo', 'Unidade', 'Referência', 'Data do fato', 'Ciência do gerente', 'Prazo', 'Origem', 'Detalhe da origem', 'Lançado em', 'Lançado por', 'Lançamento', 'Situação', 'Informado por', 'Responsável previsto', 'Justificativa', 'Decisão da supervisão', 'Nota da supervisão', 'Responsável (validado)'],
    ...a.ocorrencias.map((e) => [cat.rotulo, e.unitName, e.reference, br(e.eventDate), hora(e.noticeAt), hora(e.prazoAte), ROTULO_ORIGEM[e.source], e.sourceDetail ?? '', hora(e.lancamento?.lancadoEm ?? null), e.lancamento?.lancadoPor ?? '', e.lancamento?.descricao ?? '', ROTULO_SITUACAO[e.situacao], e.informedByName, e.expectedUserName ?? '', e.justification ?? '', e.reviewedByName ? `${e.reviewStatus} — ${e.reviewedByName}` : '', e.reviewNote ?? '', e.responsibleName ?? '']),
  ]), 'OCORRÊNCIAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Unidade', 'Esperadas', 'Conformes', 'Justificadas', 'Falhas confirmadas', 'Em conferência', 'No prazo', 'Inválidas', 'Conformidade (%)', 'Desconto (% do peso)', 'Pontos do componente'],
    ...a.porUnidade.map((u) => [u.unitName, u.esperados, u.conformes, u.justificados, u.falhas, u.emConferencia, u.noPrazo, u.invalidos, u.pct ?? '', u.penalizacao ?? '', u.pontos ?? '']),
    ['REDE', a.rede.esperados, a.rede.conformes, a.rede.justificados, a.rede.falhas, a.rede.emConferencia, a.rede.noPrazo, a.rede.invalidos, a.rede.pct ?? '', a.rede.penalizacao ?? '', a.rede.pontos ?? ''],
  ]), 'POR UNIDADE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Gerente/Coordenador', 'Unidade(s)', 'Falhas confirmadas (responsável validado)', 'Lançamentos', 'Lançamentos no prazo'],
    ...a.porGerente.map((g) => [g.name, g.unidades.join(', '), g.falhasConfirmadas, g.lancamentos, g.lancamentosNoPrazo]),
  ]), 'POR GERENTE');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Módulo', 'Esperadas', 'Conformes', 'Justificadas', 'Falhas confirmadas', 'Em conferência', 'Conformidade (%)', 'Prazo (h úteis)', '% por falha', 'Desconto (% do peso)', 'Pontos'],
    ...a.modulos.map((m) => [m.rotulo, m.esperados, m.conformes, m.justificados, m.falhas, m.emConferencia, m.pct ?? '', m.prazoHoras, m.pctPorFalha, m.penalizacao ?? '', m.pontos ?? '']),
  ]), 'MÓDULOS');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="auditoria_operacional_${a.modulo.toLowerCase()}_${ym}.xlsx"` } });
}
