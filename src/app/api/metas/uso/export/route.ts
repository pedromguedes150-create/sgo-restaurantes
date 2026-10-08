import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getUsoDoSgo } from '@/lib/metas/uso';
import { rotuloDoModulo, ROTULO_FAIXA_USO, taxaDeFalha } from '@/lib/metas/uso-calculo';

/** Excel do Uso do SGO (v1.164.0): RESUMO · UNIDADES · USUÁRIOS. ?month=AAAA-MM. Mesma leitura da tela. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (!(user.seesAllUnits || user.role === 'SUPERVISOR')) return new Response('Acesso restrito', { status: 403 });
  const url = new URL(req.url);
  const ym = /^\d{4}-\d{2}$/.test(url.searchParams.get('month') ?? '') ? url.searchParams.get('month')! : new Date().toISOString().slice(0, 7);
  const d = await getUsoDoSgo(user, ym);
  const r = d.resumo;
  const n = (x: number | null) => (x == null ? '' : x);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [`USO DO SGO — ${ym.slice(5)}/${ym.slice(0, 4)}`], [],
    ['Unidades', r.unidades], ['Uso médio da rede (%)', n(r.mediaUso)], ['Usuários medidos', d.usuarios.length], ['Usuários ativos', r.usuariosAtivos], ['Usuários sem ação', r.usuariosSemUso.length],
    ['Ações no sistema', r.totalAcoes], ['Acessos', r.totalAcessos], ['Tarefas no prazo', r.tarefas.done], ['Tarefas fora do prazo', r.tarefas.late], ['Tarefas não realizadas', r.tarefas.missed], ['% no prazo', n(r.tarefas.pctNoPrazo)], [],
    ['Faixa de uso', 'Unidades', 'Quais'], ...r.porFaixa.map((f) => [ROTULO_FAIXA_USO[f.faixa], f.qtd, f.unidades.join(', ')]), [],
    ['Unidade que mais usa', r.unidadeMaisUsa?.unitName ?? ''], ['Unidade que menos usa', r.unidadeMenosUsa?.unitName ?? ''],
    ['Mais deixa de fazer', r.unidadeMaisDeixaDeFazer ? `${r.unidadeMaisDeixaDeFazer.unitName} (${r.unidadeMaisDeixaDeFazer.missed} não realizadas)` : ''],
    ['Mais erra o prazo', r.unidadeMaisErra ? `${r.unidadeMaisErra.unitName} (${r.unidadeMaisErra.taxa}%)` : ''],
    ['Usuário que mais usa', r.maisUsam[0] ? `${r.maisUsam[0].name} (${r.maisUsam[0].acoes} ações)` : ''],
    ['Sem nenhuma ação', r.usuariosSemUso.map((u) => u.name).join(', ')],
  ]), 'RESUMO');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['#', 'Unidade', 'Uso (%)', 'Checklists (%)', 'Desperdício (%)', 'Comandas (%)', 'No prazo', 'Fora do prazo', 'Não realizadas', 'Falhas (%)', 'Ações', 'Usuários ativos', 'Usuários vinculados', 'Ocorrências', 'Notas', 'Meta (%)'],
    ...d.unidades.map((u, i) => [i + 1, u.unitName, u.usagePct, u.checklistPct, u.wastePct, u.commandsPct, u.done, u.late, u.missed, n(taxaDeFalha(u)), u.acoes, u.usuariosAtivos, u.usuariosVinculados, u.occurrences, u.notes, u.metaPct]),
  ]), 'UNIDADES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['#', 'Usuário', 'Perfil', 'Unidade(s)', 'Acessos', 'Ações', 'Módulos mais usados', 'Tarefas concluídas', 'Fora do prazo', 'Último acesso'],
    ...d.usuarios.map((u, i) => [i + 1, u.name, u.roleLabel, u.unidades.join(', '), u.acessos, u.acoes, u.modulos.slice(0, 5).map(rotuloDoModulo).join(', '), u.tarefasConcluidas, u.foraDoPrazo, u.ultimoAcesso ? u.ultimoAcesso.slice(0, 10).split('-').reverse().join('/') : '']),
  ]), 'USUÁRIOS');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="uso-do-sgo-${ym}.xlsx"` },
  });
}
