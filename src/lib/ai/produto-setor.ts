import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { normalizar, type SetorCadastrado } from '@/lib/stock/setor-sugerido';

/**
 * A IA classifica o produto num dos setores CADASTRADOS.
 *
 * Ela é a segunda camada, não a primeira: a regra determinística
 * (`setor-sugerido.ts`) já resolve o romaneio da rede inteira, na hora e sem
 * chave. Perguntar à IA o que uma tabela responde em microssegundos gastaria
 * segundos e chave com o gerente de pé no estoque, e deixaria o cadastro
 * dependente de rede.
 *
 * Duas amarras que valem mais que o prompt:
 *
 *  1. **Lista fechada.** O modelo recebe os setores que EXISTEM no cadastro e
 *     só pode responder com um deles ou com "NENHUM". A resposta é conferida
 *     contra a lista antes de virar sugestão — modelo que inventa um setor não
 *     tem como criar um destino que não existe.
 *  2. **Nada é gravado sozinho.** A saída é uma SUGESTÃO; quem confirma é o
 *     gerente, na tela. Errar o setor manda o item para a fila de um separador
 *     que não tem o que fazer com ele.
 *
 * Regra nº 6 do projeto: modelo vem do env. Sem `ANTHROPIC_API_KEY` devolve
 * `{ configured: false }` e o cadastro segue com a regra + escolha manual.
 */

export interface SetorPorIA {
  configured: boolean;
  ok: boolean;
  sectorId?: string;
  sectorName?: string;
  /** Por que o modelo decidiu — a tela mostra, para a pessoa conferir. */
  motivo?: string;
  error?: string;
}

function extrairJson(texto: string): Record<string, unknown> | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
}

/** Um produto a classificar em lote. */
export interface ProdutoParaClassificar {
  id: string;
  nome: string;
  categoria?: string | null;
}
export interface SetorPorIAEmLote {
  configured: boolean;
  /** Só os que o modelo conseguiu apontar para um setor REAL do cadastro. */
  sugestoes: { productId: string; sectorId: string; sectorName: string; motivo?: string }[];
  error?: string;
}

/**
 * Classifica VÁRIOS produtos numa chamada só.
 *
 * Com mil e duzentos produtos órfãos, uma chamada por item seriam mil e
 * duzentas idas à rede — caro, lento e frágil: uma falha no meio deixaria o
 * mutirão pela metade sem ninguém saber onde parou. Em batelada, cada ida
 * resolve dezenas, e o que falhar fica de fora sem derrubar o resto.
 *
 * A amarra da lista fechada continua valendo item a item: cada resposta é
 * conferida contra os setores cadastrados antes de virar sugestão, e o que não
 * casar é simplesmente descartado.
 */
export async function sugerirSetoresPorIAEmLote(input: {
  produtos: ProdutoParaClassificar[];
  setores: SetorCadastrado[];
}): Promise<SetorPorIAEmLote> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, sugestoes: [] };
  if (input.produtos.length === 0 || input.setores.length === 0) return { configured: true, sugestoes: [] };

  const lista = input.setores.map((s) => `- ${s.name}`).join('\n');
  const itens = input.produtos
    .map((p, i) => `${i + 1}. ${p.nome}${p.categoria ? ` (categoria: ${p.categoria})` : ''}`)
    .join('\n');

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content:
          'Você organiza o Centro de Distribuição de uma rede de churrascarias brasileiras. ' +
          'Para cada produto da lista, diga em qual setor de separação ele deve ser separado.\n\n' +
          `SETORES DISPONÍVEIS (use o nome EXATO de um deles):\n${lista}\n\n` +
          `PRODUTOS:\n${itens}\n\n` +
          'Regras: o que o produto É vence do que ele é feito (uma coxinha de requeijão é salgado, ' +
          'não laticínio); o recipiente vence o conteúdo (forminha de papel para empada é descartável). ' +
          'Quando nenhum setor servir, use "NENHUM" — chutar manda o produto para a fila de um separador ' +
          'que não tem o que fazer com ele, o que é pior que deixá-lo sem setor.\n\n' +
          'Responda SÓ com JSON: {"itens":[{"n":1,"setor":"<nome exato ou NENHUM>","motivo":"<no máximo 8 palavras>"}, ...]}, ' +
          'na mesma ordem e com um objeto por produto.',
      }],
    });

    const texto = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
    const json = extrairJson(texto);
    const itensResposta = json && Array.isArray(json.itens) ? (json.itens as unknown[]) : null;
    if (!itensResposta) return { configured: true, sugestoes: [], error: 'Resposta não compreendida.' };

    const porNome = new Map(input.setores.map((s) => [normalizar(s.name), s]));
    const sugestoes: SetorPorIAEmLote['sugestoes'] = [];
    for (const bruto of itensResposta) {
      const o = bruto as { n?: unknown; setor?: unknown; motivo?: unknown };
      const n = Number(o.n);
      /* O índice tem de apontar para um produto da lista ENVIADA. Sem esta
         conferência, um `n` fora da faixa (ou repetido) carimbaria o setor no
         produto errado — e o erro só apareceria na doca. */
      if (!Number.isInteger(n) || n < 1 || n > input.produtos.length) continue;
      const nome = String(o.setor ?? '').trim();
      if (!nome || nome.toUpperCase() === 'NENHUM') continue;
      const setor = porNome.get(normalizar(nome));
      if (!setor) continue;
      sugestoes.push({
        productId: input.produtos[n - 1].id, sectorId: setor.id, sectorName: setor.name,
        motivo: typeof o.motivo === 'string' ? o.motivo.slice(0, 120) : undefined,
      });
    }
    return { configured: true, sugestoes };
  } catch (e) {
    console.error('[ai/produto-setor] falha no lote:', e);
    return { configured: true, sugestoes: [], error: 'Não foi possível consultar a IA agora.' };
  }
}

export async function sugerirSetorPorIA(input: {
  nome: string;
  categoria?: string | null;
  setores: SetorCadastrado[];
}): Promise<SetorPorIA> {
  if (!env.ANTHROPIC_API_KEY) return { configured: false, ok: false };
  if (input.setores.length === 0 || !input.nome.trim()) return { configured: true, ok: false };

  const lista = input.setores.map((s) => `- ${s.name}`).join('\n');

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content:
          'Você organiza o Centro de Distribuição de uma rede de churrascarias brasileiras. ' +
          'Diga em qual setor de separação este produto deve ser separado.\n\n' +
          `PRODUTO: ${input.nome.trim()}\n` +
          (input.categoria ? `CATEGORIA INFORMADA: ${input.categoria}\n` : '') +
          `\nSETORES DISPONÍVEIS (responda com o nome EXATO de um deles):\n${lista}\n\n` +
          'Regras: o que o produto É vence do que ele é feito (uma coxinha de requeijão é salgado, ' +
          'não laticínio); o recipiente vence o conteúdo (forminha de papel para empada é descartável). ' +
          'Se nenhum setor servir, responda "NENHUM" — chutar manda o produto para a fila de um separador ' +
          'que não tem o que fazer com ele.\n\n' +
          'Responda SÓ com JSON: {"setor": "<nome exato ou NENHUM>", "motivo": "<no máximo 8 palavras>"}',
      }],
    });

    const texto = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
    const json = extrairJson(texto);
    if (!json) return { configured: true, ok: false, error: 'Resposta não compreendida.' };

    const resposta = String(json.setor ?? '').trim();
    if (!resposta || resposta.toUpperCase() === 'NENHUM') return { configured: true, ok: false };

    /* A conferência contra a lista é o que impede o modelo de criar um destino
       que não existe. Comparação normalizada porque ele pode devolver com
       caixa ou acento diferentes do cadastro. */
    const alvo = normalizar(resposta);
    const setor = input.setores.find((s) => normalizar(s.name) === alvo)
      ?? input.setores.find((s) => normalizar(s.name).includes(alvo) || alvo.includes(normalizar(s.name)));
    if (!setor) return { configured: true, ok: false, error: 'O setor sugerido não existe no cadastro.' };

    return {
      configured: true, ok: true,
      sectorId: setor.id, sectorName: setor.name,
      motivo: typeof json.motivo === 'string' ? json.motivo.slice(0, 120) : undefined,
    };
  } catch (e) {
    /* Falha de IA não pode travar o cadastro: o gerente escolhe na mão. */
    console.error('[ai/produto-setor] falha ao classificar:', e);
    return { configured: true, ok: false, error: 'Não foi possível consultar a IA agora.' };
  }
}
