import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getPainelDoRh } from '@/lib/certificates/painel-rh';
import { listarConfigDasNomenclaturas } from '@/lib/certificates/config-nomenclaturas';
import { SITUACOES, GRUPOS } from '@/lib/certificates/catalogo';
import { ROTULO_DO_ALERTA } from '@/lib/certificates/alertas';
import { ROTULO_DA_PENDENCIA } from '@/lib/certificates/painel-rh-calculo';

/**
 * Excel do RH (v1.199.0): DOCUMENTOS (situação, motivo, alertas, envio) ·
 * PENDÊNCIAS · NOMENCLATURAS (correspondência e regras). Mesma leitura da
 * aba Painel do RH. ?unit= recorta. Sem CID, sem médico.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const url = new URL(req.url);
  const unit = url.searchParams.get('unit') || undefined;
  const [p, cfg] = await Promise.all([getPainelDoRh(user, { unitId: unit }), listarConfigDasNomenclaturas()]);
  const br = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
  const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Unidade', 'Colaborador', 'Grupo', 'Documento', 'Situação', 'Motivo do RH', 'Observação do RH', 'Início', 'Fim', 'Dias', 'Alertas', 'Envio ao RH', 'Lançado por', 'Lançado em', 'Situação desde'],
    ...p.linhas.map((l) => [
      l.unitName, l.collaboratorName, GRUPOS[l.grupo].rotulo, l.rotulo, SITUACOES[l.status].rotulo, l.statusMotivoLabel ?? '', l.statusNote ?? '',
      br(l.startDate), br(l.endDate), l.days, l.alertas.map((a) => ROTULO_DO_ALERTA[a.tipo]).join(' · '),
      l.envioRh ? `${l.envioRh.acao} ${l.envioRh.status}${l.envioRh.erro ? ` — ${l.envioRh.erro}` : ''}` : 'anterior à integração',
      l.by ?? '', hora(l.createdAt), hora(l.statusAt),
    ]),
  ]), 'DOCUMENTOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Pendência', 'Unidade', 'Colaborador', 'Documento', 'Situação', 'Detalhe'],
    ...p.pendencias.map((x) => [ROTULO_DA_PENDENCIA[x.tipo].titulo, x.doc.unitName, x.doc.collaboratorName, x.doc.rotulo, SITUACOES[x.doc.status].rotulo, x.detalhe]),
  ]), 'PENDÊNCIAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Grupo', 'Nome no SGO', 'Nome no RH', 'Ativa', 'Dias da regra (hoje)', 'Versão', 'Vigente desde', 'Base legal', 'Sobreposição do Admin', 'Escala', 'tipoDetalhe', 'Observação'],
    ...cfg.map((c) => [GRUPOS[c.grupo].rotulo, c.nome, c.rhName ?? c.nome, c.active ? 'Sim' : 'Não', c.diasVigentes ?? '', c.regraVigente?.versao ?? '', c.regraVigente && c.regraVigente.desde !== '0000-01-01' ? br(c.regraVigente.desde) : '', c.regraVigente?.base ?? '', c.ruleDays != null ? 'Sim' : '', c.escala ?? 'não afasta', c.tipo, c.notes ?? '']),
  ]), 'NOMENCLATURAS');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="atestados_rh_${p.hoje}.xlsx"` } });
}
