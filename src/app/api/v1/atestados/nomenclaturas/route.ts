import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { listarConfigDasNomenclaturas } from '@/lib/certificates/config-nomenclaturas';
import { GRUPOS, ORDEM_DOS_GRUPOS } from '@/lib/certificates/catalogo';
import { MOTIVOS_DE_CORRECAO, SITUACOES_DO_RH } from '@/lib/certificates/retorno-rh-regras';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/atestados/nomenclaturas (v1.198.0) — a estrutura de correspondência
 * SGO ↔ RH, para o sistema do RH cadastrar e conferir: grupo, nome no SGO, nome
 * no RH (configurado pelo Admin), regra aplicável com versão e vigência, o que
 * marca na Escala e o `tipoDetalhe`/`motivo` que vão no envio. Sem código de tipo.
 * Também devolve as situações e os motivos que o RH pode mandar em
 * POST /api/integracoes/rh/atestado-situacao.
 */
export const GET = comApiKey(async () => {
  const lista = await listarConfigDasNomenclaturas();
  return NextResponse.json({
    grupos: ORDEM_DOS_GRUPOS.map((g) => ({ chave: g, rotulo: GRUPOS[g].rotulo, descricao: GRUPOS[g].descricao })),
    nomenclaturas: lista.map((n) => ({
      grupo: n.grupo,
      nomeSgo: n.nome,
      nomeRh: n.rhName ?? n.nome,
      ativa: n.active,
      tipoDetalhe: n.tipo,
      escala: n.escala,
      regra: n.regraVigente ? { dias: n.diasVigentes, versao: n.regraVigente.versao, vigenteDesde: n.regraVigente.desde === '0000-01-01' ? null : n.regraVigente.desde, base: n.regraVigente.base, sobreposicaoDoAdmin: n.ruleDays != null } : null,
      comprovacao: n.comprovacao,
      regraResumida: n.regra,
    })),
    retorno: { situacoes: Object.keys(SITUACOES_DO_RH), motivos: MOTIVOS_DE_CORRECAO, endpoint: '/api/integracoes/rh/atestado-situacao' },
  });
});
