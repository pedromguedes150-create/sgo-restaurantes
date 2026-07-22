/**
 * Gera os ícones do PWA (PNG) sem depender de biblioteca de imagem.
 * Fundo bordô da marca (#6E1423) + monograma "BF" em branco.
 * Rode com: node scripts/gen-icons.mjs   (saída em public/)
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BG = [0x6e, 0x14, 0x23]; // bordô da marca
const FG = [0xff, 0xff, 0xff];

// Monograma 5x7 por letra (1 = pixel aceso)
const GLYPHS = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
};

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = Array.from({ length: 256 }, (_, n) => {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  }));
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** size = lado em px; inset = fração de margem livre (maskable precisa de área segura) */
function icon(size, inset) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) px.set(BG, i * 3);

  // monograma "BF": 11 colunas x 7 linhas
  const cols = 11;
  const rows = 7;
  const usable = size * (1 - 2 * inset);
  const scale = Math.max(1, Math.floor(Math.min(usable / cols, (usable * 0.85) / rows)));
  const x0 = Math.round((size - cols * scale) / 2);
  const y0 = Math.round((size - rows * scale) / 2);

  const draw = (glyph, offsetCols) => {
    glyph.forEach((line, r) => {
      [...line].forEach((v, c) => {
        if (v !== '1') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = x0 + (c + offsetCols) * scale + dx;
            const y = y0 + r * scale + dy;
            if (x >= 0 && x < size && y >= 0 && y < size) px.set(FG, (y * size + x) * 3);
          }
        }
      });
    });
  };
  draw(GLYPHS.B, 0);
  draw(GLYPHS.F, 6);

  // filtro 0 (None) por linha
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const files = [
  ['icon-192.png', 192, 0.12],
  ['icon-512.png', 512, 0.12],
  ['icon-maskable-512.png', 512, 0.22], // área segura p/ máscara circular do Android
  ['apple-touch-icon.png', 180, 0.12],
  ['badge-96.png', 96, 0.14],
];
for (const [name, size, inset] of files) {
  writeFileSync(join(OUT, name), icon(size, inset));
  console.log('gerado', name, size + 'px');
}
