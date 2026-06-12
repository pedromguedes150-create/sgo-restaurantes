import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB (requisito: imagens ≤1MB ideal; teto de segurança)
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

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
  if (!ALLOWED.includes(file.type)) {
    throw new UploadError('Formato de imagem não suportado');
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    throw new UploadError('Imagem muito grande (máx. 5MB)');
  }

  const unit = safeSegment(unitId, 'unitId');
  const inst = safeSegment(instanceId, 'instanceId');
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const dir = path.join(UPLOAD_ROOT, unit);
  await mkdir(dir, { recursive: true });

  const filename = `${inst}-${buf.byteLength}.${ext}`;
  await writeFile(path.join(dir, filename), buf);

  return path.posix.join('uploads', unit, filename);
}

const ATTACH_MAX_BYTES = 25 * 1024 * 1024; // 25MB (fotos/vídeos de ocorrências)
const ATTACH_ALLOWED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
];

/** Salva anexo (foto/vídeo) de ocorrência. Retorna { path, mimeType }. */
export async function saveAttachment(
  file: File,
  unitId: string,
  prefix: string,
): Promise<{ path: string; mimeType: string }> {
  if (!ATTACH_ALLOWED.includes(file.type)) {
    throw new UploadError('Formato de anexo não suportado');
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > ATTACH_MAX_BYTES) {
    throw new UploadError('Anexo muito grande (máx. 25MB)');
  }
  const unit = safeSegment(unitId, 'unitId');
  const dir = path.join(UPLOAD_ROOT, unit);
  await mkdir(dir, { recursive: true });

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };
  const ext = extMap[file.type] ?? 'bin';
  const safe = safeSegment(prefix, 'prefix');
  const filename = `${safe}-${buf.byteLength}.${ext}`;
  await writeFile(path.join(dir, filename), buf);

  return { path: path.posix.join('uploads', unit, filename), mimeType: file.type };
}
