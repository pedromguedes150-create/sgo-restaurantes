import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canEditModule } from '@/lib/permissions';
import { gravarImportacao, lerParaPrevia, type MotivoDaImportacao } from '@/lib/ticket-media/importar';

/**
 * IMPORTAÇÃO mensal — duas etapas na MESMA rota, com DUAS planilhas.
 *
 * `arquivo` = Relação de Cupons (conta cupons e confere o mês);
 * `produtos` = Produtos Mais Vendidos (a receita, Σ "Vr. Total").
 *
 * `acao=previa` lê e devolve os números sem gravar nada; `acao=confirmar`
 * grava. As duas recebem os ARQUIVOS: a confirmação lê as planilhas de novo em
 * vez de aceitar os totais que a prévia devolveu. Números vindos do navegador
 * seriam números que qualquer um pode editar antes de mandar — e o consolidado
 * do mês passaria a valer o que o cliente disser.
 */

const STATUS: Record<MotivoDaImportacao, number> = {
  COMPETENCIA: 400, UNIDADE: 404, SEM_ACESSO: 403, NAO_PARTICIPA: 400,
  ARQUIVO: 400, PLANILHA: 400, MES_TROCADO: 400, SEM_CUPOM: 400,
  DUPLICADO: 409, SEM_PERMISSAO_SUBSTITUIR: 403,
};

/** Teto de 20 MB por arquivo: a Relação de Cupons real tem ~22.000 linhas e não chega perto disso. */
const TETO_BYTES = 20 * 1024 * 1024;

function abrir(arquivo: File, buf: Buffer): unknown[][] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('sem aba');
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
}

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
  const produtos = form.get('produtos');
  const unitId = String(form.get('unitId') ?? '');
  const competencia = String(form.get('competencia') ?? '');
  const acao = String(form.get('acao') ?? 'previa');
  const substituir = String(form.get('substituir') ?? '') === 'true';

  if (!(produtos instanceof File) || produtos.size === 0) {
    return NextResponse.json({ error: 'Selecione a planilha "Produtos Mais Vendidos" do mês (é dela que sai a receita).', reason: 'ARQUIVO' }, { status: 400 });
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ error: 'Selecione a "Relação de Cupons SAT/NFC-e" do mês (é dela que sai o número de cupons).', reason: 'ARQUIVO' }, { status: 400 });
  }
  if (arquivo.size > TETO_BYTES || produtos.size > TETO_BYTES) {
    return NextResponse.json({ error: 'Arquivo acima de 20 MB.', reason: 'ARQUIVO' }, { status: 400 });
  }

  let linhas: unknown[][];
  let linhasProdutos: unknown[][];
  try {
    linhas = abrir(arquivo, Buffer.from(await arquivo.arrayBuffer()));
    linhasProdutos = abrir(produtos, Buffer.from(await produtos.arrayBuffer()));
  } catch {
    return NextResponse.json(
      { error: 'Não consegui abrir um dos arquivos. Envie as planilhas em .xlsx ou .xls, sem proteção por senha.', reason: 'ARQUIVO' },
      { status: 400 },
    );
  }

  const entrada = { unitId, competencia, fileName: arquivo.name, linhas, produtosFileName: produtos.name, linhasProdutos };

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
