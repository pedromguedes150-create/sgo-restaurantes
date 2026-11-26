import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import {
  codigoDaVaga, CURRICULOS_POR_ENVIO, CURRICULOS_POR_VAGA, dataMinimaDaEdicao, diferencasDaEdicao, inicioMaisCedo, MOTIVO_MIN,
  normalizarVaga, podeFazer, resumoDeTexto, resumoDosCargos, validarVaga,
  type Acao, type DadosDaVaga, type ErroDeCampo, type PessoaDaVaga, type StatusDaVaga,
} from '@/lib/vagas/regras';
import { diaBR } from '@/lib/vagas/acompanhamento';
import { aprovadoresDaUnidade, papelNaVaga, permissoesDeVagas } from '@/lib/vagas/dados';
import { apagarArquivo, ArquivoInvalido, guardarCurriculoDaVaga, type ArquivoGuardado } from '@/lib/vagas/arquivo';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma } from '@prisma/client';

/**
 * AÇÕES da Solicitação de Vagas (servidor). Toda decisão é refeita aqui: a tela
 * só ajuda. Quem pode o quê vem de `acoesDaVaga` (a mesma tabela da tela); o
 * que não pode volta 409. Nada é apagado — cancelar e excluir são lógicos, com
 * motivo, e tudo vira evento na linha do tempo.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type Resultado<T = object> = ({ ok: true; id: string } & T) | { ok: false; status: 400 | 403 | 404 | 409; error: string; erros?: ErroDeCampo[] };
export interface ArquivoEnviado { file: File; indicadoPor: string | null }

const link = (id: string) => `/modulos/vagas/${id}`;
const nega = (status: 400 | 403 | 404 | 409, error: string, erros?: ErroDeCampo[]) => ({ ok: false as const, status, error, erros });

type Tx = Prisma.TransactionClient;
async function evento(tx: Tx | typeof prisma, vagaId: string, tipo: string, descricao: string, user: SessionUser | null, dados?: Prisma.InputJsonValue) {
  await tx.vagaEvento.create({ data: { vagaId, tipo, origem: 'SGO', descricao: descricao.slice(0, 2000), usuarioId: user?.id ?? null, usuarioNome: user?.name ?? null, dados } });
}

async function avisar(ids: (string | null | undefined)[], menos: string, p: { title: string; body: string; id: string; alta?: boolean }) {
  const alvo = [...new Set(ids.filter((x): x is string => Boolean(x) && x !== menos))];
  if (alvo.length) await notifyUsers(alvo, { title: p.title, body: p.body, link: link(p.id), module: 'VAGAS', ...(p.alta ? { nivel: 'IMPORTANTE' as const } : {}) });
}

/** Lê a vaga e confere se a ação cabe ao usuário nesta situação (403 sem permissão, 409 fora de hora). */
async function porta(user: SessionUser, id: string, acao: Acao) {
  const v = await prisma.vagaSolicitacao.findUnique({ where: { id }, include: { posicoes: { orderBy: { ordem: 'asc' } }, curriculos: true } });
  if (!v || v.excluidaEm || !canAccessUnit(user, v.unitId)) return { ok: false as const, erro: nega(404, 'Solicitação não encontrada.') };
  const perm = await permissoesDeVagas(user);
  const papel = papelNaVaga(user, perm, v.unitId);
  if (!papel.dono && !papel.aprovador) return { ok: false as const, erro: nega(403, 'Você não tem permissão para esta ação.') };
  if (!podeFazer(v.status as StatusDaVaga, papel, acao)) return { ok: false as const, erro: nega(409, 'Esta ação não está disponível na situação atual da vaga.') };
  return { ok: true as const, v, papel };
}

/** O substituído escolhido da LISTA vale pelo cadastro (e tem de ser da unidade); senão fica só o nome digitado. */
async function conferirPessoas(unitId: string, pessoas: PessoaDaVaga[]): Promise<PessoaDaVaga[]> {
  const ids = [...new Set(pessoas.map((p) => p.substituiColaboradorId).filter((x): x is string => Boolean(x)))];
  const cad = ids.length ? await prisma.collaborator.findMany({ where: { id: { in: ids }, units: { some: { unitId } } }, select: { id: true, name: true } }) : [];
  const nome = new Map(cad.map((c) => [c.id, c.name]));
  return pessoas.map((p) => {
    if (p.motivo !== 'SUBSTITUICAO' && !p.substituiNome) return { ...p, substituiColaboradorId: null };
    const n = p.substituiColaboradorId ? nome.get(p.substituiColaboradorId) : undefined;
    return n ? { ...p, substituiNome: n } : { ...p, substituiColaboradorId: null };
  });
}

const colunas = (d: DadosDaVaga) => ({
  cargoResumo: resumoDosCargos(d.pessoas), quantidade: d.pessoas.length,
  requisitos: resumoDeTexto(d.pessoas, 'requisitos'), observacao: resumoDeTexto(d.pessoas, 'observacao'),
  inicioDesejado: inicioMaisCedo(d.pessoas), prioridade: d.prioridade,
});
const linhasDasPessoas = (vagaId: string, pessoas: PessoaDaVaga[]) => pessoas.map((p, i) => ({
  vagaId, ordem: i + 1, cargo: p.cargo, motivo: p.motivo, substituiNome: p.substituiNome ?? null, substituiColaboradorId: p.substituiColaboradorId ?? null,
  escala: p.escala, horario: p.horario, inicioDesejado: p.inicioDesejado, requisitos: p.requisitos ?? null, observacao: p.observacao ?? null,
}));

async function guardarTodos(arquivos: ArquivoEnviado[], unitId: string): Promise<{ ok: true; guardados: (ArquivoGuardado & { indicadoPor: string | null })[] } | { ok: false; error: string }> {
  const guardados: (ArquivoGuardado & { indicadoPor: string | null })[] = [];
  try {
    for (const a of arquivos) guardados.push({ ...(await guardarCurriculoDaVaga(a.file, unitId)), indicadoPor: a.indicadoPor?.trim().slice(0, 120) || null });
    return { ok: true, guardados };
  } catch (e) {
    for (const g of guardados) await apagarArquivo(g.path);
    return { ok: false, error: e instanceof ArquivoInvalido ? e.message : 'Não foi possível guardar o arquivo.' };
  }
}

/* ───────────────────────── pedir ───────────────────────── */

export async function criarVaga(user: SessionUser, bruto: unknown, arquivos: ArquivoEnviado[], ctx: Ctx = {}): Promise<Resultado<{ codigo: string }>> {
  const perm = await permissoesDeVagas(user);
  if (!perm.pedir) return nega(403, 'Você não tem permissão para pedir vaga.');
  const d = normalizarVaga(bruto);
  /* Quem tem UMA unidade no cadastro pede só para ela — o servidor força, venha o que vier no corpo. */
  if (!user.seesAllUnits && user.unitIds.length === 1) d.unitId = user.unitIds[0];
  if (d.unitId && !canAccessUnit(user, d.unitId)) return nega(403, 'Você não pode pedir vaga para esta unidade.');
  const erros = validarVaga(d, { dataMinima: diaBR(new Date()) });
  if (erros.length) return nega(400, erros[0].mensagem, erros);
  if (arquivos.length > CURRICULOS_POR_ENVIO) return nega(400, `No máximo ${CURRICULOS_POR_ENVIO} currículos por envio.`);
  const unidade = await prisma.unit.findFirst({ where: { id: d.unitId, active: true }, select: { id: true, name: true } });
  if (!unidade) return nega(400, 'Unidade inválida.');
  d.pessoas = await conferirPessoas(d.unitId, d.pessoas);

  const g = await guardarTodos(arquivos, d.unitId);
  if (!g.ok) return nega(400, g.error);

  const v = await prisma.$transaction(async (tx) => {
    const criada = await tx.vagaSolicitacao.create({ data: { unitId: d.unitId, ...colunas(d), status: 'PENDENTE_APROVACAO', createdById: user.id, createdByName: user.name } });
    await tx.vagaPosicao.createMany({ data: linhasDasPessoas(criada.id, d.pessoas) });
    if (g.guardados.length) await tx.vagaCurriculo.createMany({ data: g.guardados.map((a) => ({ vagaId: criada.id, path: a.path, nomeArquivo: a.nomeArquivo, mime: a.mime, tamanho: a.tamanho, indicadoPor: a.indicadoPor, enviadoPorId: user.id, enviadoPorNome: user.name })) });
    await evento(tx, criada.id, 'CRIADA', `Solicitação enviada ao supervisor: ${criada.cargoResumo}${g.guardados.length ? ` · ${g.guardados.length} currículo(s)` : ''}.`, user);
    return criada;
  }).catch(async (e) => { for (const a of g.guardados) await apagarArquivo(a.path); throw e; });

  const codigo = codigoDaVaga(v.number);
  await audit({ userId: user.id, unitId: d.unitId, action: 'VAGA_CRIADA', module: 'VAGAS', entity: 'vaga', entityId: v.id, metadata: { codigo, pessoas: d.pessoas.length, prioridade: d.prioridade, curriculos: g.guardados.length }, ...ctx });
  await avisar(await aprovadoresDaUnidade(d.unitId), user.id, { id: v.id, alta: d.prioridade === 'URGENTE', title: `Vaga para aprovar${d.prioridade === 'URGENTE' ? ' — URGENTE' : ''}`, body: `${codigo} · ${unidade.name}: ${v.cargoResumo}. Pedido por ${user.name}. Prazo: 1 dia útil.` });
  return { ok: true, id: v.id, codigo };
}

/** O gerente corrige a DEVOLVIDA e reenvia: volta para o supervisor e o prazo recomeça. */
export async function corrigirVaga(user: SessionUser, id: string, bruto: unknown, ctx: Ctx = {}): Promise<Resultado> {
  const p = await porta(user, id, 'corrigir');
  if (!p.ok) return p.erro;
  const d = normalizarVaga(bruto);
  d.unitId = p.v.unitId;
  const erros = validarVaga(d, { dataMinima: diaBR(new Date()) });
  if (erros.length) return nega(400, erros[0].mensagem, erros);
  d.pessoas = await conferirPessoas(d.unitId, d.pessoas);
  await prisma.$transaction(async (tx) => {
    const r = await tx.vagaSolicitacao.updateMany({ where: { id, status: 'DEVOLVIDA' }, data: { ...colunas(d), status: 'PENDENTE_APROVACAO', enviadoParaAprovacaoEm: new Date(), lembreteEm: null } });
    if (r.count === 0) throw new Error('ESTADO');
    await tx.vagaPosicao.deleteMany({ where: { vagaId: id } });
    await tx.vagaPosicao.createMany({ data: linhasDasPessoas(id, d.pessoas) });
    await evento(tx, id, 'REENVIADA', 'Corrigida pelo gerente e reenviada ao supervisor.', user);
  });
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_REENVIADA', module: 'VAGAS', entity: 'vaga', entityId: id, ...ctx });
  await avisar(await aprovadoresDaUnidade(p.v.unitId), user.id, { id, alta: d.prioridade === 'URGENTE', title: 'Vaga corrigida para aprovar', body: `${codigoDaVaga(p.v.number)}: ${resumoDosCargos(d.pessoas)}. Corrigida por ${user.name}.` });
  return { ok: true, id };
}

/* ───────────────────────── o supervisor ───────────────────────── */

export async function aprovarVaga(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Resultado> {
  const p = await porta(user, id, 'aprovar');
  if (!p.ok) return p.erro;
  const agora = new Date();
  const r = await prisma.vagaSolicitacao.updateMany({
    where: { id, status: 'PENDENTE_APROVACAO' },
    data: { status: 'APROVADA', decididoPorId: user.id, decididoPorNome: user.name, decididoEm: agora, motivoDevolucao: null, rhEnvioAcao: 'criar', rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0, rhEnvioHttp: null, rhEnvioMotivo: null, rhEnvioProximaEm: agora },
  });
  if (r.count === 0) return nega(409, 'Esta vaga já foi decidida.');
  await evento(prisma, id, 'APROVADA', 'Aprovada pelo supervisor. Na fila de envio ao RH.', user);
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_APROVADA', module: 'VAGAS', entity: 'vaga', entityId: id, ...ctx });
  await avisar([p.v.createdById], user.id, { id, title: 'Vaga aprovada', body: `${codigoDaVaga(p.v.number)} (${p.v.cargoResumo}) foi aprovada por ${user.name} e está indo para o RH.` });
  return { ok: true, id };
}

export async function devolverVaga(user: SessionUser, id: string, motivoBruto: unknown, ctx: Ctx = {}): Promise<Resultado> {
  const p = await porta(user, id, 'devolver');
  if (!p.ok) return p.erro;
  const motivo = String(motivoBruto ?? '').trim().slice(0, 1000);
  if (motivo.length < MOTIVO_MIN) return nega(400, `Diga o que precisa ser ajustado (pelo menos ${MOTIVO_MIN} letras).`);
  const r = await prisma.vagaSolicitacao.updateMany({ where: { id, status: 'PENDENTE_APROVACAO' }, data: { status: 'DEVOLVIDA', decididoPorId: user.id, decididoPorNome: user.name, decididoEm: new Date(), motivoDevolucao: motivo } });
  if (r.count === 0) return nega(409, 'Esta vaga já foi decidida.');
  await evento(prisma, id, 'DEVOLVIDA', `Devolvida para ajuste: ${motivo}`, user);
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_DEVOLVIDA', module: 'VAGAS', entity: 'vaga', entityId: id, metadata: { motivo }, ...ctx });
  await avisar([p.v.createdById], user.id, { id, alta: true, title: 'Vaga devolvida para ajuste', body: `${codigoDaVaga(p.v.number)}: ${user.name} pediu: ${motivo}` });
  return { ok: true, id };
}

/** Cancelar (gerente ou supervisor). Vaga que já chegou ao RH manda `cancelar` ao RH. */
export async function cancelarVaga(user: SessionUser, id: string, motivoBruto: unknown, ctx: Ctx = {}): Promise<Resultado> {
  const p = await porta(user, id, 'cancelar');
  if (!p.ok) return p.erro;
  const motivo = String(motivoBruto ?? '').trim().slice(0, 1000);
  if (motivo.length < MOTIVO_MIN) return nega(400, `Diga o motivo do cancelamento (pelo menos ${MOTIVO_MIN} letras).`);
  const noRh = p.v.status === 'APROVADA' && Boolean(p.v.rhChegouEm);
  const agora = new Date();
  await prisma.vagaSolicitacao.update({
    where: { id },
    data: {
      status: 'CANCELADA', canceladoPorNome: user.name, canceladoEm: agora, motivoCancelamento: motivo,
      ...(noRh ? { rhEnvioAcao: 'cancelar', rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0, rhEnvioHttp: null, rhEnvioMotivo: null, rhEnvioProximaEm: agora } : { rhEnvioSituacao: p.v.rhChegouEm ? p.v.rhEnvioSituacao : null }),
    },
  });
  await evento(prisma, id, 'CANCELADA', `Cancelada: ${motivo}${noRh ? ' — o RH será avisado.' : ''}`, user);
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_CANCELADA', module: 'VAGAS', entity: 'vaga', entityId: id, metadata: { motivo, avisaRh: noRh }, ...ctx });
  await avisar([p.v.createdById, ...(await aprovadoresDaUnidade(p.v.unitId))], user.id, { id, title: 'Vaga cancelada', body: `${codigoDaVaga(p.v.number)} (${p.v.cargoResumo}) foi cancelada por ${user.name}: ${motivo}` });
  return { ok: true, id };
}

/** Excluir (só quem aprova): some de listas, contadores e lembretes; o registro fica. */
export async function excluirVaga(user: SessionUser, id: string, motivoBruto: unknown, ctx: Ctx = {}): Promise<Resultado> {
  const p = await porta(user, id, 'excluir');
  if (!p.ok) return p.erro;
  const motivo = String(motivoBruto ?? '').trim().slice(0, 1000);
  if (motivo.length < MOTIVO_MIN) return nega(400, `Diga o motivo da exclusão (pelo menos ${MOTIVO_MIN} letras).`);
  const noRh = p.v.status === 'APROVADA' && Boolean(p.v.rhChegouEm);
  const agora = new Date();
  await prisma.vagaSolicitacao.update({
    where: { id },
    data: {
      excluidaEm: agora, excluidaPorNome: user.name, motivoExclusao: motivo,
      ...(noRh ? { status: 'CANCELADA', canceladoPorNome: user.name, canceladoEm: agora, motivoCancelamento: motivo, rhEnvioAcao: 'cancelar', rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0, rhEnvioHttp: null, rhEnvioMotivo: null, rhEnvioProximaEm: agora } : {}),
    },
  });
  await evento(prisma, id, 'EXCLUIDA', `Excluída das listas: ${motivo}${noRh ? ' — o RH será avisado do cancelamento.' : ''}`, user);
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_EXCLUIDA', module: 'VAGAS', entity: 'vaga', entityId: id, metadata: { motivo, avisaRh: noRh }, ...ctx });
  return { ok: true, id };
}

/** Editar (só quem aprova): o mesmo formulário, sem currículos; a situação NÃO muda. */
export async function editarVaga(user: SessionUser, id: string, bruto: unknown, ctx: Ctx = {}): Promise<Resultado<{ mudou: boolean }>> {
  const p = await porta(user, id, 'editar');
  if (!p.ok) return p.erro;
  const d = normalizarVaga(bruto);
  d.unitId = p.v.unitId;
  const erros = validarVaga(d, { dataMinima: dataMinimaDaEdicao(diaBR(new Date()), p.v.inicioDesejado) });
  if (erros.length) return nega(400, erros[0].mensagem, erros);
  d.pessoas = await conferirPessoas(d.unitId, d.pessoas);
  const antes = { prioridade: p.v.prioridade, pessoas: p.v.posicoes.map((x): PessoaDaVaga => ({ cargo: x.cargo, motivo: x.motivo, substituiNome: x.substituiNome, substituiColaboradorId: x.substituiColaboradorId, escala: x.escala, horario: x.horario, inicioDesejado: x.inicioDesejado, requisitos: x.requisitos, observacao: x.observacao })) };
  const difs = diferencasDaEdicao(antes, { prioridade: d.prioridade, pessoas: d.pessoas });
  if (difs.length === 0) return { ok: true, id, mudou: false };
  const noRh = p.v.status === 'APROVADA' && Boolean(p.v.rhChegouEm);
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.vagaSolicitacao.update({ where: { id }, data: { ...colunas(d), ...(noRh ? { rhEnvioAcao: 'atualizar', rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0, rhEnvioHttp: null, rhEnvioMotivo: null, rhEnvioProximaEm: agora } : {}) } });
    await tx.vagaPosicao.deleteMany({ where: { vagaId: id } });
    await tx.vagaPosicao.createMany({ data: linhasDasPessoas(id, d.pessoas) });
    await evento(tx, id, 'EDITADA', `Editada pelo supervisor: ${difs.join(' · ')}${noRh ? ' — a alteração vai ao RH.' : ''}`, user, { difs });
  });
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_EDITADA', module: 'VAGAS', entity: 'vaga', entityId: id, metadata: { difs, avisaRh: noRh }, ...ctx });
  await avisar([p.v.createdById], user.id, { id, title: 'Vaga editada pelo supervisor', body: `${codigoDaVaga(p.v.number)}: ${difs.slice(0, 3).join(' · ')}${difs.length > 3 ? ` (+${difs.length - 3})` : ''}` });
  return { ok: true, id, mudou: true };
}

/** Recoloca na fila o envio que o RH recusou (só quem aprova). */
export async function reenviarAoRh(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Resultado> {
  const v = await prisma.vagaSolicitacao.findUnique({ where: { id }, select: { unitId: true, excluidaEm: true, rhEnvioSituacao: true, rhEnvioAcao: true } });
  if (!v || !canAccessUnit(user, v.unitId)) return nega(404, 'Solicitação não encontrada.');
  if (!papelNaVaga(user, await permissoesDeVagas(user), v.unitId).aprovador) return nega(403, 'Só quem aprova pode reenviar ao RH.');
  if (v.rhEnvioSituacao !== 'ERRO' && v.rhEnvioSituacao !== 'FALHA') return nega(409, 'Não há envio com problema para reenviar.');
  await prisma.vagaSolicitacao.update({ where: { id }, data: { rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0, rhEnvioMotivo: null, rhEnvioHttp: null, rhEnvioProximaEm: new Date() } });
  await evento(prisma, id, 'RH_REENVIO', 'Envio ao RH recolocado na fila pelo supervisor.', user);
  await audit({ userId: user.id, unitId: v.unitId, action: 'VAGA_RH_REENVIO', module: 'VAGAS', entity: 'vaga', entityId: id, ...ctx });
  return { ok: true, id };
}

/* ───────────────────────── currículos ───────────────────────── */

/**
 * Anexar currículo. Antes da aprovação, vai junto com a vaga. Com a vaga já no
 * RH: o do gerente espera o supervisor; o de quem aprova vai direto.
 */
export async function anexarCurriculos(user: SessionUser, id: string, arquivos: ArquivoEnviado[], ctx: Ctx = {}): Promise<Resultado<{ anexados: number }>> {
  const p = await porta(user, id, 'anexar');
  if (!p.ok) return p.erro;
  if (arquivos.length === 0) return nega(400, 'Escolha pelo menos um arquivo.');
  if (arquivos.length > CURRICULOS_POR_ENVIO) return nega(400, `No máximo ${CURRICULOS_POR_ENVIO} currículos por envio.`);
  const vivos = p.v.curriculos.filter((c) => !c.removidoEm).length;
  if (vivos + arquivos.length > CURRICULOS_POR_VAGA) return nega(400, `Esta vaga já tem ${vivos} currículo(s); o limite é ${CURRICULOS_POR_VAGA}.`);
  const g = await guardarTodos(arquivos, p.v.unitId);
  if (!g.ok) return nega(400, g.error);

  const noRh = p.v.status === 'APROVADA';
  const direto = noRh && p.papel.aprovador;
  const agora = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.vagaCurriculo.createMany({
      data: g.guardados.map((a) => ({
        vagaId: id, path: a.path, nomeArquivo: a.nomeArquivo, mime: a.mime, tamanho: a.tamanho, indicadoPor: a.indicadoPor, enviadoPorId: user.id, enviadoPorNome: user.name,
        ...(noRh ? (direto
          ? { fluxo: 'ENVIADO_RH', decididoPorNome: user.name, decididoEm: agora, rhEnvioSituacao: 'NA_FILA', rhEnvioProximaEm: agora }
          : { fluxo: 'AGUARDANDO_SUPERVISOR' }) : {}),
      })),
    });
    await evento(tx, id, 'CURRICULO_ANEXADO', `${g.guardados.length} currículo(s) anexado(s)${noRh ? (direto ? ' e enviado(s) ao RH pelo supervisor.' : ' — aguardando o supervisor.') : '.'}`, user);
  }).catch(async (e) => { for (const a of g.guardados) await apagarArquivo(a.path); throw e; });
  await audit({ userId: user.id, unitId: p.v.unitId, action: 'VAGA_CURRICULO_ANEXADO', module: 'VAGAS', entity: 'vaga', entityId: id, metadata: { quantidade: g.guardados.length, noRh, direto }, ...ctx });
  if (noRh && !direto) await avisar(await aprovadoresDaUnidade(p.v.unitId), user.id, { id, title: 'Currículo novo para avaliar', body: `${codigoDaVaga(p.v.number)}: ${user.name} anexou ${g.guardados.length} currículo(s). Envie ao RH ou recuse.` });
  return { ok: true, id, anexados: g.guardados.length };
}

/** Tirar o currículo — só enquanto não foi ao RH. */
export async function removerCurriculo(user: SessionUser, id: string, curriculoId: string, ctx: Ctx = {}): Promise<Resultado> {
  const v = await prisma.vagaSolicitacao.findUnique({ where: { id }, select: { unitId: true, status: true, excluidaEm: true } });
  if (!v || v.excluidaEm || !canAccessUnit(user, v.unitId)) return nega(404, 'Solicitação não encontrada.');
  const papel = papelNaVaga(user, await permissoesDeVagas(user), v.unitId);
  if (!papel.dono && !papel.aprovador) return nega(403, 'Você não tem permissão para esta ação.');
  const c = await prisma.vagaCurriculo.findFirst({ where: { id: curriculoId, vagaId: id, removidoEm: null } });
  if (!c) return nega(404, 'Currículo não encontrado.');
  const antesDaAprovacao = c.fluxo === null && (v.status === 'PENDENTE_APROVACAO' || v.status === 'DEVOLVIDA');
  if (!antesDaAprovacao && c.fluxo !== 'AGUARDANDO_SUPERVISOR') return nega(409, 'Currículo que já foi ao RH não sai mais da vaga.');
  await prisma.vagaCurriculo.update({ where: { id: c.id }, data: { removidoEm: new Date(), removidoPorNome: user.name } });
  await evento(prisma, id, 'CURRICULO_REMOVIDO', `Currículo retirado: ${c.nomeArquivo}.`, user);
  await audit({ userId: user.id, unitId: v.unitId, action: 'VAGA_CURRICULO_REMOVIDO', module: 'VAGAS', entity: 'vaga', entityId: id, ...ctx });
  return { ok: true, id };
}

/** O supervisor avalia o currículo novo de vaga já no RH: envia ao RH ou recusa (com motivo). */
export async function avaliarCurriculo(user: SessionUser, id: string, curriculoId: string, decisao: { enviar: boolean; motivo?: unknown; observacao?: unknown }, ctx: Ctx = {}): Promise<Resultado> {
  const p = await porta(user, id, 'avaliarCurriculo');
  if (!p.ok) return p.erro;
  const c = p.v.curriculos.find((x) => x.id === curriculoId && !x.removidoEm);
  if (!c) return nega(404, 'Currículo não encontrado.');
  if (c.fluxo !== 'AGUARDANDO_SUPERVISOR') return nega(409, 'Este currículo já foi avaliado.');
  const agora = new Date();
  const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  if (decisao.enviar) {
    const r = await prisma.vagaCurriculo.updateMany({ where: { id: c.id, fluxo: 'AGUARDANDO_SUPERVISOR' }, data: { fluxo: 'ENVIADO_RH', decididoPorNome: user.name, decididoPorEmail: eu?.email ?? null, decididoEm: agora, observacaoEnvio: String(decisao.observacao ?? '').trim().slice(0, 500) || null, rhEnvioSituacao: 'NA_FILA', rhEnvioTentativas: 0, rhEnvioProximaEm: agora } });
    if (r.count === 0) return nega(409, 'Este currículo já foi avaliado.');
    await evento(prisma, id, 'CURRICULO_ENVIADO', `Currículo enviado ao RH pelo supervisor: ${c.nomeArquivo}.`, user);
    await avisar([c.enviadoPorId], user.id, { id, title: 'Currículo enviado ao RH', body: `${codigoDaVaga(p.v.number)}: ${user.name} enviou "${c.nomeArquivo}" ao RH.` });
  } else {
    const motivo = String(decisao.motivo ?? '').trim().slice(0, 500);
    if (motivo.length < MOTIVO_MIN) return nega(400, `Diga o motivo da recusa (pelo menos ${MOTIVO_MIN} letras).`);
    const r = await prisma.vagaCurriculo.updateMany({ where: { id: c.id, fluxo: 'AGUARDANDO_SUPERVISOR' }, data: { fluxo: 'RECUSADO', decididoPorNome: user.name, decididoEm: agora, motivoRecusa: motivo } });
    if (r.count === 0) return nega(409, 'Este currículo já foi avaliado.');
    await evento(prisma, id, 'CURRICULO_RECUSADO', `Currículo recusado pelo supervisor (${c.nomeArquivo}): ${motivo}`, user);
    await avisar([c.enviadoPorId], user.id, { id, alta: true, title: 'Currículo recusado pelo supervisor', body: `${codigoDaVaga(p.v.number)}: "${c.nomeArquivo}" não foi ao RH. Motivo: ${motivo}` });
  }
  await audit({ userId: user.id, unitId: p.v.unitId, action: decisao.enviar ? 'VAGA_CURRICULO_ENVIADO' : 'VAGA_CURRICULO_RECUSADO', module: 'VAGAS', entity: 'vaga', entityId: id, ...ctx });
  return { ok: true, id };
}
