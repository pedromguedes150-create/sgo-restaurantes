'use client';

/**
 * Normaliza/comprime uma foto no navegador antes do upload.
 * Resolve os problemas de foto vinda de celular: arquivos grandes, formato HEIC
 * (iPhone) e MIME vazio — convertendo para JPEG com dimensão máxima controlada.
 * Em qualquer falha de decodificação (ex.: HEIC no Chrome Android), devolve o
 * arquivo original para não bloquear o envio.
 */
export async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<File> {
  // só tenta para imagens (ou tipo vazio, comum em alguns celulares)
  if (file.type && !file.type.startsWith('image/')) return file;
  try {
    const { bitmap, width, height, release } = await loadImage(file);
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { release(); return file; }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    release();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size === 0) return file;
    return new File([blob], toJpgName(file.name), { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

function toJpgName(name: string): string {
  const base = (name || 'foto').replace(/\.[^.]+$/, '');
  return `${base || 'foto'}.jpg`;
}

async function loadImage(file: File): Promise<{ bitmap: ImageBitmap | HTMLImageElement; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { bitmap: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close?.() };
    } catch { /* cai para <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return { bitmap: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, release: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
