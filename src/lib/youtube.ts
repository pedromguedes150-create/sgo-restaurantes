/**
 * Utilitários de YouTube para POPs (vídeos de treinamento).
 * Extrai o ID de vídeo de formatos comuns e monta a URL de embed.
 */
export function youtubeId(url: string): string | null {
  if (!url) return null;
  const u = url.trim();
  // youtu.be/ID
  let m = /youtu\.be\/([A-Za-z0-9_-]{11})/.exec(u);
  if (m) return m[1];
  // youtube.com/watch?v=ID
  m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(u);
  if (m) return m[1];
  // youtube.com/embed/ID  ou /shorts/ID  ou /live/ID
  m = /youtube\.com\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/.exec(u);
  if (m) return m[1];
  // já é só o ID
  if (/^[A-Za-z0-9_-]{11}$/.test(u)) return u;
  return null;
}

export function youtubeEmbedUrl(url: string): string | null {
  const id = youtubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
