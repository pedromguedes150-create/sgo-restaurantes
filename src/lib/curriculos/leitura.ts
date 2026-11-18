import { normalizarNome, normalizarTelefone } from './regras';

/**
 * LEITURA DO CURRÍCULO POR IA — a parte PURA (v1.216.0).
 *
 * Pedido do Daniel (18/11/2026): o gerente não digita mais o nome; a IA lê o
 * currículo e preenche nome e telefone, e o gerente só completa o que faltar,
 * escolhe o cargo e escreve a observação se houver.
 *
 * A IA só TRANSCREVE: o que ela devolve passa pelas mesmas regras do
 * formulário (`normalizarNome`, `normalizarTelefone`). O que não passa volta
 * vazio para o gerente preencher — nada é inventado nem "arrumado".
 */
export interface LeituraDoCurriculo {
  nome: string | null;
  /** Só dígitos (DDD + número). */
  telefone: string | null;
  /** O arquivo parece mesmo um currículo legível? */
  legivel: boolean;
}

export const INSTRUCOES_DE_LEITURA = [
  'Você recebeu o currículo de um candidato a emprego. Transcreva APENAS o que está escrito.',
  'Responda SOMENTE com um JSON, sem texto em volta, neste formato:',
  '{"legivel": true, "nome": "Nome Completo do Candidato", "telefone": "31999998888"}',
  'Regras:',
  '- "nome": o nome completo do CANDIDATO (não o de empresa, escola ou referência). Se não estiver escrito ou estiver ilegível, use null.',
  '- "telefone": o telefone ou WhatsApp do candidato com DDD, só os dígitos. Havendo mais de um, o celular. Se não estiver escrito, estiver sem DDD ou ilegível, use null.',
  '- "legivel": false se o arquivo não for um currículo ou não der para ler.',
  '- NUNCA invente, complete ou deduza nome ou telefone.',
].join('\n');

/** Nome em caixa de título quando veio TODO EM MAIÚSCULAS (comum em currículo); senão, como está. */
function arrumarCaixa(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome;
  const minusculas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return nome.toLowerCase().split(' ').map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

export function interpretarLeitura(parsed: Record<string, unknown> | null): LeituraDoCurriculo {
  if (!parsed) return { nome: null, telefone: null, legivel: false };
  const nome = typeof parsed.nome === 'string' ? normalizarNome(parsed.nome) : null;
  const telefone = typeof parsed.telefone === 'string' || typeof parsed.telefone === 'number' ? normalizarTelefone(parsed.telefone) : null;
  return { nome: nome ? arrumarCaixa(nome) : null, telefone, legivel: parsed.legivel !== false };
}
