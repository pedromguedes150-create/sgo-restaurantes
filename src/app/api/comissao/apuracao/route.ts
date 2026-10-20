import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { confirmarApuracao, montarPrevia, type MotivoDaApuracao } from '@/lib/comissao/apuracao';

/**
 * APURAÇÃO DA COMISSÃO — duas etapas na mesma rota, com a planilha
 * "Produtividade por Vendedor — Analítico" do Teknisa.
 *
 * `acao=previa` lê e devolve a conta sem gravar; `acao=confirmar` grava. As
 * duas recebem o ARQUIVO: a confirmação relê a planilha em vez de aceitar os
 * totais da prévia (número vindo do navegador é número que qualquer um edita).
 * O que o conferente decidiu na prévia vai junto, por chave de linha:
 * `ajustes` (JSON: chave → {ajuste, motivo}) e `vinculos` (JSON: vendedor da
 * planilha → id do colaborador).
 */

const STATUS: Record<MotivoDaApuracao, number> = {
  FORBIDDEN: 403, UNIDADE: 404, SEM_ACESSO: 403, MES: 400, PLANILHA: 400, AJUSTE: 400, VINCULO: 400, DUPLICADO: 409, FECHADA: 409,
};
const TETO_BYTES = 30 * 1024 * 1024;

function lerJson<T>(v: FormDataEntryValue | null, padrao: T): T {
  if (typeof v !== 'string' || !v.trim()) return padrao;
  try { const x = JSON.parse(v); return (x && typeof x === 'object') ? (x as T) : padrao; } catch { return padrao; }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Envio inválido.', reason: 'PLANILHA' }, { status: 400 }); }

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) return NextResponse.json({ error: 'Selecione a planilha "Produtividade por Vendedor — Analítico".', reason: 'PLANILHA' }, { status: 400 });
  if (arquivo.size > TETO_BYTES) return NextResponse.json({ error: 'Arquivo acima de 30 MB.', reason: 'PLANILHA' }, { status: 400 });

  let linhas: unknown[][];
  try {
    const wb = XLSX.read(Buffer.from(await arquivo.arrayBuffer()), { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('sem aba');
    linhas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  } catch {
    return NextResponse.json({ error: 'Não consegui abrir a planilha. Exporte do Teknisa em .xlsx.', reason: 'PLANILHA' }, { status: 400 });
  }

  const entrada = {
    unitId: String(form.get('unitId') ?? ''),
    mesVenda: String(form.get('mesVenda') ?? ''),
    linhas, fileName: arquivo.name,
    ajustes: lerJson<Record<string, { ajuste: number; motivo: string }>>(form.get('ajustes'), {}),
    vinculos: lerJson<Record<string, string>>(form.get('vinculos'), {}),
    substituir: String(form.get('substituir') ?? '') === 'true',
  };
  for (const a of Object.values(entrada.ajustes)) { a.ajuste = Number(a.ajuste); a.motivo = String(a.motivo ?? ''); }

  const acao = String(form.get('acao') ?? 'previa');
  if (acao === 'confirmar') {
    const r = await confirmarApuracao(user, entrada, requestContext(req));
    if (!r.ok) return NextResponse.json({ error: r.erro, reason: r.reason }, { status: STATUS[r.reason] });
    return NextResponse.json(r);
  }
  const r = await montarPrevia(user, entrada);
  if (!r.ok) return NextResponse.json({ error: r.erro, reason: r.reason }, { status: STATUS[r.reason] });
  return NextResponse.json({ ok: true, previa: r.previa });
}
