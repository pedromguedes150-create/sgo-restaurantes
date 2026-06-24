import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MAX_BYTES = 25 * 1024 * 1024; // 25MB — fotos de celular podem passar de 5MB
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', ''];

export class UploadError extends Error {}

/**
 * Sanitiza um segmento de caminho (defesa contra path traversal — ids vêm do
 * request e CEO/ADMIN passam pelo canAccessUnit sem validação de existência).
 */
function safeSegment(value: string, label: string): string {
  const safe = (value ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) throw new UploadError(`${label} inválido`);
  return safe;
}

/**
 * Salva uma evidência fotográfica no volume de uploads e retorna o caminho
 * relativo (a ser guardado em TaskInstance.evidencePath).
 * Valida tipo e tamanho (requisito de segurança — uploads validados).
 */
export async function saveEvidence(
  file: File,
  unitId: string,
  instanceId: string,
): Promise<string> {
  const nameExt = (file.name?.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED.includes(file.type) && !['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(nameExt)) {
    throw new UploadError('Formato de imagem não suportado');
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new UploadError('Imagem muito grande (máx. 25MB)');
  }

  const unit = safeSegment(unitId, 'unitId');
  const inst = safeSegment(instanceId, 'instanceId');
  const ext = file.type === 'image/png' || nameExt === 'png' ? 'png'
    : file.type === 'image/webp' || nameExt === 'webp' ? 'webp'
    : file.type === 'image/heic' || file.type === 'image/heif' || nameExt === 'heic' || nameExt === 'heif' ? 'heic'
    : 'jpg';
  const dir = path.join(UPLOAD_ROOT, unit);
  await mkdir(dir, { recursive: true });

  const filename = `${inst}-${buf.byteLength}.${ext}`;
  await writeFile(path.join(dir, filename), buf);

  return path.posix.join('uploads', unit, filename);
}

const ATTACH_MAX_BYTES = 25 * 1024 * 1024; // 25MB (fotos/vídeos de ocorrências)
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};
// extensões aceitas quando o navegador do celular não envia o MIME (campo type vazio)
const EXT_ALLOWED = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'mp4', 'mov', 'webm', 'pdf']);
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', pdf: 'application/pdf',
};

/**
 * Salva anexo (foto/vídeo/PDF). Tolerante a celulares: quando o MIME vem vazio
 * ou desconhecido (comum em câmera de Android/iPhone), infere o formato pela
 * extensão do arquivo. Retorna { path, mimeType }.
 */
export async function saveAttachment(
  file: File,
  unitId: string,
  prefix: string,
): Promise<{ path: string; mimeType: string }> {
  const nameExt = (file.name?.split('.').pop() ?? '').toLowerCase();
  let ext = EXT_BY_MIME[file.type];
  if (!ext && EXT_ALLOWED.has(nameExt)) ext = nameExt === 'jpeg' ? 'jpg' : nameExt; // MIME ausente → usa a extensão
  if (!ext) throw new UploadError('Formato de anexo não suportado');

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > ATTACH_MAX_BYTES) {
    throw new UploadError('Anexo muito grande (máx. 25MB)');
  }
  const unit = safeSegment(unitId, 'unitId');
  const dir = path.join(UPLOAD_ROOT, unit);
  await mkdir(dir, { recursive: true });

  const safe = safeSegment(prefix, 'prefix');
  const filename = `${safe}-${buf.byteLength}.${ext}`;
  await writeFile(path.join(dir, filename), buf);

  return { path: path.posix.join('uploads', unit, filename), mimeType: file.type || MIME_BY_EXT[ext] || 'application/octet-stream' };
}
