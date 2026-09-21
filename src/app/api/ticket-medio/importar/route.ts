import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canEditModule } from '@/lib/permissions';
import { gravarImportacao, lerParaPrevia, type MotivoDaImportacao } from '@/lib/ticket-media/importar';

/**
 * IMPORTAÇÃO da planilha mensal — duas etapas na MESMA rota.
 *
 * `acao=previa` lê e devolve os números sem gravar nada; `acao=confirmar`
 * grava. As duas recebem o ARQUIVO: a confirmação lê a planilha de novo em vez
 * de aceitar os totais que a prévia devolveu. Números vindos do navegador
 * seriam números que qualquer um pode editar antes de mandar — e o consolidado
 * do mês passaria a valer o que o cliente disser.
 */

const STATUS: Record<MotivoDaImportacao, number> = {
  COMPETENCIA: 400, UNIDADE: 404, SEM_ACESSO: 403, NAO_PARTICIPA: 400,
  ARQUIVO: 400, PLANILHA: 400, MES_TROCADO: 400, SEM_CUPOM: 400,
  DUPLICADO: 409, SEM_PERMISSAO_SUBSTITUIR: 403,
};

/** Teto de 20 MB: a planilha real tem ~7.500 linhas e não chega perto disso. */
const TETO_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Envio inválido.', reason: 'ARQUIVO' }, { status: 400 });
  }

  const arquivo = form.get('arquivo');
  const unitId = String(form.get('unitId') ?? '');
  const competencia = String(form.get('competencia') ?? '');
  const acao = String(form.get('acao') ?? 'previa');
  const substituir = String(form.get('substituir') ?? '') === 'true';

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: 'Selecione a planilha do mês.', reason: 'ARQUIVO' }, { status: 400 });
  }
  if (arquivo.size > TETO_BYTES) {
    return NextResponse.json({ error: 'Arquivo acima de 20 MB.', reason: 'ARQUIVO' }, { status: 400 });
  }

  let linhas: unknown[][];
  try {
    const buf = Buffer.from(await arquivo.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('sem aba');
    linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  } catch {
    return NextResponse.json(
      { error: 'Não consegui abrir o arquivo. Envie a planilha em .xlsx ou .xls, sem proteção por senha.', reason: 'ARQUIVO' },
      { status: 400 },
    );
  }

  const entrada = { unitId, competencia, fileName: arquivo.name, linhas };

  if (acao === 'previa') {
    const r = await lerParaPrevia(user, entrada);
    if (!r.ok) return NextResponse.json({ error: r.erro, reason: r.reason }, { status: STATUS[r.reason] });
    return NextResponse.json({ previa: r.previa });
  }

  /* SUBSTITUIR é outra porta: quem importa não sobrescreve mês já fechado.
     A chave é a mesma de "quem administra o módulo" — a tela de unidades
     participantes —, para não inventar um terceiro conceito de permissão. */
  const podeSubstituir = await canEditModule(user.role, 'CONFIG_TICKET_MEDIA');

  const ctx = requestContext(req);
  const r = await gravarImportacao(user, { ...entrada, substituir, podeSubstituir }, ctx);
  if (!r.ok) return NextResponse.json({ error: r.erro, reason: r.reason }, { status: STATUS[r.reason] });
  return NextResponse.json({ ok: true, substituiu: r.substituiu, previa: r.previa });
}
