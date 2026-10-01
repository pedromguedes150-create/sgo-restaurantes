'use client';

import type { CaixaDaFoto } from '@/lib/preparo/tipos';

/**
 * Recorta a foto do produto de dentro da imagem da ficha, NO NAVEGADOR.
 *
 * A IA só devolve ONDE a foto está (caixa em % da página); ela não devolve
 * bytes de imagem. Recortar aqui, com o <canvas> que `image-compress.ts` já
 * usa, evita uma dependência nativa no servidor (sharp não está instalado e
 * exigiria build nativo no droplet). O Admin vê o recorte na prévia e decide.
 */
export async function recortarFoto(arquivo: File, caixa: CaixaDaFoto): Promise<File | null> {
  if (!arquivo.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const sx = Math.max(0, Math.round((caixa.x / 100) * W));
    const sy = Math.max(0, Math.round((caixa.y / 100) * H));
    const sw = Math.min(W - sx, Math.round((caixa.w / 100) * W));
    const sh = Math.min(H - sy, Math.round((caixa.h / 100) * H));
    if (sw < 16 || sh < 16) return null;

    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob || blob.size === 0) return null;
    return new File([blob], 'foto-produto.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
