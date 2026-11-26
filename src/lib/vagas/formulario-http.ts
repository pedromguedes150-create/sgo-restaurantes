import type { ArquivoEnviado } from '@/lib/vagas/acoes';

/**
 * Lê o corpo das rotas de vaga. Multipart: `dados` (JSON), `acao`, e os
 * arquivos em `curriculo` com o "indicado por" de cada um em `indicadoPor`, na
 * mesma ordem. JSON: o objeto como veio.
 */
export async function lerCorpo(req: Request): Promise<{ dados: Record<string, unknown>; arquivos: ArquivoEnviado[] } | null> {
  const tipo = req.headers.get('content-type') ?? '';
  if (tipo.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return null;
    let dados: Record<string, unknown> = {};
    const bruto = form.get('dados');
    if (typeof bruto === 'string' && bruto) {
      try { const j = JSON.parse(bruto); if (j && typeof j === 'object') dados = j as Record<string, unknown>; } catch { return null; }
    }
    const acao = form.get('acao');
    if (typeof acao === 'string' && acao) dados.acao = acao;
    const indicados = form.getAll('indicadoPor').map((x) => (typeof x === 'string' ? x : ''));
    const arquivos = form.getAll('curriculo').filter((x): x is File => x instanceof File && x.size > 0).map((file, i) => ({ file, indicadoPor: indicados[i]?.trim() || null }));
    return { dados, arquivos };
  }
  const j = await req.json().catch(() => null);
  if (!j || typeof j !== 'object') return null;
  return { dados: j as Record<string, unknown>, arquivos: [] };
}
