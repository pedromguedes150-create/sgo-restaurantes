import { BarcodeFormat, DecodeHintType } from '@zxing/library';

/**
 * O que o leitor de câmera pede à câmera e à biblioteca de leitura (v1.223.1).
 *
 * Duas causas, medidas, faziam o código de barras da DANFE não ser lido no
 * iPhone (onde não há leitor nativo e a leitura é da biblioteca):
 *
 * 1. RESOLUÇÃO. Sem pedir, a câmera entrega 640×480. A chave de 44 dígitos é um
 *    Code-128 de 277 módulos: ocupando 90% da largura sobra 1,4 pixel por barra,
 *    e isso não se lê em posição nenhuma. Com 1080 de largura são 3 pixels.
 * 2. SÓ O MEIO DA IMAGEM. Sem "tentar com mais afinco" a biblioteca varre só as
 *    linhas do meio do quadro; o código no alto da tela (como a gerente aponta
 *    a folha) nunca era olhado.
 */
export const RESTRICOES_DA_CAMERA: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

/** QR (NFC-e) + os códigos de uma dimensão comuns em DANFE (Code-128 é o da chave). */
export const FORMATOS_LIDOS = [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.EAN_13, BarcodeFormat.CODABAR];

/** As dicas da leitura: os formatos e a varredura do quadro INTEIRO. */
export function dicasDoLeitor(): Map<DecodeHintType, unknown> {
  const dicas = new Map<DecodeHintType, unknown>();
  dicas.set(DecodeHintType.POSSIBLE_FORMATS, FORMATOS_LIDOS);
  dicas.set(DecodeHintType.TRY_HARDER, true);
  return dicas;
}

/** O maior lado do quadro entregue à leitura: acima disso só gasta tempo. */
export const LADO_MAXIMO_DO_QUADRO = 1920;

/** O tamanho em que o quadro é lido: o do vídeo, reduzido se passar do teto. */
export function tamanhoDoQuadro(largura: number, altura: number): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= LADO_MAXIMO_DO_QUADRO || maior === 0) return { largura, altura };
  const f = LADO_MAXIMO_DO_QUADRO / maior;
  return { largura: Math.round(largura * f), altura: Math.round(altura * f) };
}

/** Intervalo entre tentativas de leitura pela biblioteca: a varredura inteira é pesada. */
export const INTERVALO_DA_LEITURA_MS = 80;
