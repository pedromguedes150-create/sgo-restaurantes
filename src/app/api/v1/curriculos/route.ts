import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { prisma } from '@/lib/db/prisma';
import { SITUACAO_NO_RH, SITUACOES_DO_RH } from '@/lib/curriculos/regras';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/curriculos — a Central de Currículos para o sistema do RH (v1.212.0).
 *
 * Mesma autenticação da API Global (X-API-Key), com uma trava a mais: a chave
 * precisa ter a leitura de currículos LIBERADA (Configurações → APIs &
 * Integrações). Currículo é dado pessoal de candidato — as outras chaves
 * (BI, sistema-mãe) recebem 403.
 *
 * Filtros: situacao=<slug>, unidade=<id>, atualizadoDesde=<ISO>, page, limit (≤ 200).
 */
export const GET = comApiKey(async (req, cliente) => {
  const c = await prisma.apiClient.findUnique({ where: { id: cliente.id }, select: { canReadResumes: true } });
  if (!c?.canReadResumes) return NextResponse.json({ error: 'Sem acesso', detail: 'Esta chave não tem a leitura de currículos liberada. Peça ao administrador do SGO.' }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const where: Prisma.CandidateResumeWhereInput = {};
  const situacao = (q.get('situacao') ?? '').toLowerCase();
  if (situacao) {
    const st = SITUACOES_DO_RH[situacao];
    if (!st) return NextResponse.json({ error: 'Situação desconhecida', aceitas: Object.keys(SITUACOES_DO_RH) }, { status: 400 });
    where.status = st;
  }
  const unidade = q.get('unidade');
  if (unidade) where.unitId = unidade;
  const desde = q.get('atualizadoDesde');
  if (desde) {
    const d = new Date(desde);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'atualizadoDesde inválido (use ISO 8601)' }, { status: 400 });
    where.updatedAt = { gte: d };
  }
  const limit = Math.min(200, Math.max(1, Number(q.get('limit')) || 50));
  const page = Math.max(1, Number(q.get('page')) || 1);

  const [total, linhas] = await Promise.all([
    prisma.candidateResume.count({ where }),
    prisma.candidateResume.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
      include: { unit: { select: { id: true, name: true, cnpj: true, rhUnitName: true } } },
    }),
  ]);
  return NextResponse.json({
    total, page, limit,
    situacoes: Object.keys(SITUACOES_DO_RH),
    dados: linhas.map((l) => ({
      sgoCurriculoId: l.id,
      criadoEm: l.createdAt.toISOString(),
      atualizadoEm: l.updatedAt.toISOString(),
      unidade: { id: l.unit.id, nome: l.unit.name, cnpj: l.unit.cnpj, nomeNoRh: l.unit.rhUnitName },
      encaminhadoPor: l.createdByName,
      candidato: { nome: l.candidateName, telefone: l.phone },
      cargoPretendido: l.jobTitleName,
      observacaoDoGerente: l.note,
      situacao: SITUACAO_NO_RH[l.status],
      situacaoDesde: l.statusAt.toISOString(),
      entrevistaEm: l.interviewAt?.toISOString() ?? null,
      rhCandidatoId: l.rhCandidateId,
      arquivo: { tipo: l.attachmentMime, url: `/api/v1/curriculos/${l.id}/anexo` },
    })),
  });
});
