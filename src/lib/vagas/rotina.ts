import { prisma } from '@/lib/db/prisma';
import { notifyUsers } from '@/lib/notifications';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { codigoDaVaga } from '@/lib/vagas/regras';
import { diaBR, foraDoPrazo } from '@/lib/vagas/acompanhamento';
import { aprovadoresDaUnidade, permissoesDeVagas } from '@/lib/vagas/dados';
import type { SessionUser } from '@/lib/auth/session';

/**
 * LEMBRETE do prazo de 1 dia útil (v1.227.0): de hora em hora, uma vez por dia
 * por vaga, só em dia útil das 8h às 18h (Brasília). Vira evento LEMBRETE na
 * linha do tempo. Excluída, devolvida e decidida não lembram.
 */
export function horaDeLembrar(agora: Date): boolean {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(agora);
  const dia = partes.find((p) => p.type === 'weekday')?.value ?? '';
  const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  return dia !== 'Sat' && dia !== 'Sun' && hora >= 8 && hora < 18;
}

export async function lembrarPrazoDoSupervisor(agora: Date = new Date()): Promise<{ lembradas: number }> {
  if (!horaDeLembrar(agora)) return { lembradas: 0 };
  const hoje = diaBR(agora);
  const pendentes = await prisma.vagaSolicitacao.findMany({
    where: { status: 'PENDENTE_APROVACAO', excluidaEm: null, OR: [{ lembreteEm: null }, { lembreteEm: { not: hoje } }] },
    select: { id: true, number: true, unitId: true, cargoResumo: true, enviadoParaAprovacaoEm: true, createdByName: true, unit: { select: { name: true } } },
  });
  let lembradas = 0;
  for (const v of pendentes) {
    if (!foraDoPrazo(v.enviadoParaAprovacaoEm, agora)) continue;
    /* A marca do dia entra primeiro e com a condição: duas rodadas juntas não lembram duas vezes. */
    const r = await prisma.vagaSolicitacao.updateMany({ where: { id: v.id, status: 'PENDENTE_APROVACAO', OR: [{ lembreteEm: null }, { lembreteEm: { not: hoje } }] }, data: { lembreteEm: hoje } });
    if (r.count === 0) continue;
    await prisma.vagaEvento.create({ data: { vagaId: v.id, tipo: 'LEMBRETE', origem: 'SGO', descricao: 'Prazo de 1 dia útil vencido: o supervisor foi lembrado.' } });
    const ids = await aprovadoresDaUnidade(v.unitId);
    if (ids.length) await notifyUsers(ids, { title: 'Vaga fora do prazo de aprovação', body: `${codigoDaVaga(v.number)} · ${v.unit.name}: ${v.cargoResumo}, pedida por ${v.createdByName}. O prazo de 1 dia útil já passou.`, link: `/modulos/vagas/${v.id}`, module: 'VAGAS', nivel: 'IMPORTANTE' });
    lembradas++;
  }
  return { lembradas };
}

/**
 * O número no menu, no alcance do usuário: para quem aprova, as que aguardam
 * aprovação + as que têm currículo para avaliar; para quem pede, as devolvidas.
 */
export async function pendenciasDeVagas(user: SessionUser): Promise<number> {
  const perm = await permissoesDeVagas(user);
  if (!perm.ver) return 0;
  const escopo = { excluidaEm: null, ...unitScopeWhere(user, 'unitId') };
  const [aguardando, comCurriculo, devolvidas] = await Promise.all([
    perm.aprovar ? prisma.vagaSolicitacao.count({ where: { ...escopo, status: 'PENDENTE_APROVACAO' } }) : 0,
    perm.aprovar ? prisma.vagaSolicitacao.count({ where: { ...escopo, status: 'APROVADA', curriculos: { some: { fluxo: 'AGUARDANDO_SUPERVISOR', removidoEm: null } } } }) : 0,
    perm.pedir ? prisma.vagaSolicitacao.count({ where: { ...escopo, status: 'DEVOLVIDA' } }) : 0,
  ]);
  return aguardando + comCurriculo + devolvidas;
}
