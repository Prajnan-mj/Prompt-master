// Generates simple placeholder PNG/ICO icons for PromptBooster without external deps.
// Draws a rounded indigo square with a white "P" glyph baked in as pixel blocks.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const ACCENT = [99, 102, 241]; // #6366F1
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Simple 5x7 bitmap font for "P" only (that's all we need for the glyph)
const P_GLYPH = [
  '11110',
  '10001',
  '10001',
  '11110',
  '10000',
  '10000',
  '10000'
];

function pixelIsGlyph(x, y, size) {
  const glyphW = 5, glyphH = 7;
  const scale = Math.max(1, Math.floor(size / 16));
  const totalW = glyphW * scale;
  const totalH = glyphH * scale;
  const offX = Math.floor((size - totalW) / 2);
  const offY = Math.floor((size - totalH) / 2);
  const gx = Math.floor((x - offX) / scale);
  const gy = Math.floor((y - offY) / scale);
  if (gx < 0 || gy < 0 || gx >= glyphW || gy >= glyphH) return false;
  return P_GLYPH[gy][gx] === '1';
}

function roundedMask(x, y, size, radius) {
  const cx = x < radius ? radius : x > size - 1 - radius ? size - 1 - radius : x;
  const cy = y < radius ? radius : y > size - 1 - radius ? size - 1 - radius : y;
  if ((x >= radius && x <= size - 1 - radius) || (y >= radius && y <= size - 1 - radius)) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function makePNG(size) {
  const radius = Math.max(2, Math.floor(size * 0.2));
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type none
    for (let x = 0; x < size; x++) {
      const inBounds = roundedMask(x, y, size, radius);
      const isGlyph = inBounds && pixelIsGlyph(x, y, size);
      const [r, g, b] = isGlyph ? WHITE : ACCENT;
      const a = inBounds ? 255 : 0;
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeICO(sizes) {
  const images = sizes.map(makePNG);
  const headerSize = 6;
  const dirEntrySize = 16;
  const dir = Buffer.alloc(headerSize + dirEntrySize * images.length);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  let dataOffset = headerSize + dirEntrySize * images.length;
  const buffers = [dir];
  images.forEach((img, i) => {
    const size = sizes[i];
    const entryOffset = headerSize + i * dirEntrySize;
    dir.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0);
    dir.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    dir.writeUInt8(0, entryOffset + 2);
    dir.writeUInt8(0, entryOffset + 3);
    dir.writeUInt16LE(1, entryOffset + 4);
    dir.writeUInt16LE(32, entryOffset + 6);
    dir.writeUInt32LE(img.length, entryOffset + 8);
    dir.writeUInt32LE(dataOffset, entryOffset + 12);
    dataOffset += img.length;
    buffers.push(img);
  });
  return Buffer.concat(buffers);
}

fs.writeFileSync(path.join(ASSETS_DIR, 'tray-icon.png'), makePNG(16));
fs.writeFileSync(path.join(ASSETS_DIR, 'tray-icon@2x.png'), makePNG(32));
fs.writeFileSync(path.join(ASSETS_DIR, 'icon-512.png'), makePNG(512));
fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), makeICO([16, 32, 48, 256]));

console.log('Icons generated in', ASSETS_DIR);
