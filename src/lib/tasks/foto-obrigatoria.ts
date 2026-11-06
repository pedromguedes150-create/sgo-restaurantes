/**
 * FOTO OBRIGATÓRIA NO ITEM DO CHECKLIST (v1.191.0) — as regras, sem banco.
 *
 * Pedido do Pedro (06/11/2026): o item marcado "Exige foto" no modelo do
 * checklist precisa da foto DE VERDADE — o gerente não segue para o item
 * seguinte sem tirá-la, recebe um alerta se tentar, o checklist não conclui
 * sem ela (tela E servidor) e a foto é tirada NA HORA, pela câmera, não
 * escolhida na galeria.
 *
 * Até aqui "Exige foto" era só o rótulo "(foto)" ao lado do item: a tela
 * oferecia o campo, mas nada conferia se a foto veio — e o servidor só
 * conferia a foto GERAL do checklist (`requiresEvidence`).
 */

export interface ItemComFoto { id: string; requiresPhoto: boolean; text?: string }
export interface FotoLigada { itemId: string | null }

/** Teto de fotos por checklist: antes 5 fixas; com foto obrigatória por item, 5 gerais + uma por item exigido. */
export const MAX_FOTOS_CHECKLIST = 30;
export const FOTOS_GERAIS = 5;
export function limiteDeFotos(items: ItemComFoto[]): number {
  return Math.min(MAX_FOTOS_CHECKLIST, FOTOS_GERAIS + items.filter((i) => i.requiresPhoto).length);
}

/** Os itens que exigem foto e ainda não têm NENHUMA ligada a eles, na ordem do checklist. */
export function itensSemFoto<T extends ItemComFoto>(items: T[], fotos: FotoLigada[]): T[] {
  const com = new Set(fotos.map((f) => f.itemId).filter((x): x is string => !!x));
  return items.filter((i) => i.requiresPhoto && !com.has(i.id));
}

/**
 * Os itens TRAVADOS: tudo que vem DEPOIS do primeiro item que exige foto e
 * ainda não a tem. É o "só segue para o próximo depois da foto" — o gerente
 * responde até ali, tira a foto, e a lista destrava.
 */
export function itensTravados(items: ItemComFoto[], fotos: FotoLigada[]): Set<string> {
  const pendente = itensSemFoto(items, fotos)[0];
  if (!pendente) return new Set();
  const pos = items.findIndex((i) => i.id === pendente.id);
  return new Set(items.slice(pos + 1).map((i) => i.id));
}

/** O que o alerta diz quando o gerente tenta seguir (ou concluir) sem a foto. */
export function mensagemFotoObrigatoria(item: { text?: string }): string {
  return `Tire a foto do item "${(item.text ?? '').trim() || 'anterior'}" para continuar. A foto é obrigatória e precisa ser feita agora, pela câmera.`;
}

/**
 * A foto foi tirada AGORA? O arquivo que a câmera devolve nasce com a hora de
 * agora; o da galeria traz a hora em que foi feito. Tolerância de 30 min cobre
 * relógio do aparelho um pouco fora e a demora entre tirar e anexar. Sem data
 * (0/NaN — alguns Androids) não dá para julgar: aceita.
 */
export const TOLERANCIA_FOTO_RECENTE_MS = 30 * 60 * 1000;
export function fotoTiradaAgora(lastModified: number | undefined | null, agora = Date.now()): boolean {
  if (!lastModified || !Number.isFinite(lastModified) || lastModified <= 0) return true;
  const diff = agora - lastModified;
  return diff <= TOLERANCIA_FOTO_RECENTE_MS && diff >= -5 * 60 * 1000;
}
export const MENSAGEM_FOTO_ANTIGA = 'Esta foto não foi tirada agora. Use a câmera para fotografar o item na hora — fotos da galeria não valem.';
