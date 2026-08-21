import zlib from 'node:zlib';
import fs from 'node:fs';

// Encodeur PNG minimal (RGBA) — sans dépendance. Icône : « T » or sur fond encre (plein cadre → maskable-safe).
const TABLE = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size) {
  const W = size, H = size;
  const ink = [12, 11, 10, 255], gold = [201, 168, 106, 255];
  const raw = Buffer.alloc(H * (1 + W * 4));
  const inT = (x, y) => {
    const bx0 = 0.22 * W, bx1 = 0.78 * W, by0 = 0.27 * H, by1 = 0.40 * H; // barre horizontale
    const sx0 = 0.44 * W, sx1 = 0.56 * W, sy0 = 0.27 * H, sy1 = 0.75 * H; // hampe verticale
    return (x >= bx0 && x < bx1 && y >= by0 && y < by1) || (x >= sx0 && x < sx1 && y >= sy0 && y < sy1);
  };
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0; // filtre None
    for (let x = 0; x < W; x++) {
      const c = inT(x + 0.5, y + 0.5) ? gold : ink;
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
fs.mkdirSync('public/icons', { recursive: true });
fs.writeFileSync('public/icons/icon-192.png', png(192));
fs.writeFileSync('public/icons/icon-512.png', png(512));
fs.writeFileSync('public/apple-touch-icon.png', png(180));
console.log('icônes écrites : 192, 512, apple 180');
