// Génère les icônes PNG de l'extension (public/icon/<taille>.png), sans dépendance :
// carré arrondi bleu, étoile blanche et petite flèche de transfert. Lancer : node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 96, 128];
const BG = [47, 91, 234];
const FG = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Formes en coordonnées normalisées [0, 1].
const insideRoundedSquare = (x, y, r = 0.22) => {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
};

function insidePolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const star = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const r = i % 2 ? 0.15 : 0.33;
  return [0.5 + r * Math.cos(a), 0.47 + r * Math.sin(a)];
});
// Flèche → sous l'étoile.
const arrow = [
  [0.3, 0.79], [0.6, 0.79], [0.6, 0.74], [0.72, 0.83], [0.6, 0.92], [0.6, 0.87], [0.3, 0.87],
];

mkdirSync('public/icon', { recursive: true });
for (const size of SIZES) {
  const ss = 4; // suréchantillonnage pour l'anticrénelage
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (!insideRoundedSquare(x, y)) continue;
          if (insidePolygon(x, y, star) || (size >= 32 && insidePolygon(x, y, arrow))) fg++;
          else bg++;
        }
      }
      const total = ss * ss;
      const alpha = (bg + fg) / total;
      const o = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) rgba[o + c] = bg + fg ? Math.round((BG[c] * bg + FG[c] * fg) / (bg + fg)) : 0;
      rgba[o + 3] = Math.round(alpha * 255);
    }
  }
  writeFileSync(`public/icon/${size}.png`, png(size, rgba));
}
console.log('icônes générées :', SIZES.join(', '));
