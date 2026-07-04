// Self-contained PNG icon generator (no external dependencies).
// Produces icons/icon-16.png, icon-48.png, icon-128.png for the extension.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function setPx(rgba, size, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [99, 102, 241];      // indigo-500
  const white = [255, 255, 255];
  const amber = [245, 158, 11];

  // Background with rounded corners.
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cxt = Math.min(x, size - 1 - x);
      const cyt = Math.min(y, size - 1 - y);
      let alpha = 255;
      if (cxt < r && cyt < r) {
        const dx = r - cxt, dy = r - cyt;
        if (dx * dx + dy * dy > r * r) alpha = 0;
      }
      setPx(rgba, size, x, y, bg[0], bg[1], bg[2], alpha);
    }
  }

  // White page.
  const pad = size * 0.26;
  const bx0 = Math.round(pad), by0 = Math.round(pad);
  const bx1 = Math.round(size - pad), by1 = Math.round(size - pad);
  for (let y = by0; y < by1; y++) {
    for (let x = bx0; x < bx1; x++) setPx(rgba, size, x, y, white[0], white[1], white[2], 255);
  }

  // Amber bookmark ribbon.
  const ribW = Math.max(2, Math.round(size * 0.11));
  const ribX0 = bx1 - ribW - Math.round(size * 0.07);
  const ribY0 = by0;
  const ribY1 = Math.round(by0 + (by1 - by0) * 0.46);
  for (let y = ribY0; y < ribY1; y++) {
    for (let x = ribX0; x < ribX0 + ribW; x++) setPx(rgba, size, x, y, amber[0], amber[1], amber[2], 255);
  }

  // Indigo "text lines" on the page.
  const lx0 = bx0 + Math.round((bx1 - bx0) * 0.2);
  const lx1 = bx1 - Math.round((bx1 - bx0) * 0.2);
  const lineH = Math.max(1, Math.round(size * 0.055));
  const totalH = by1 - by0;
  const startY = by0 + Math.round(totalH * 0.6);
  const gap = Math.round(totalH * 0.16);
  for (let g = 0; g < 2; g++) {
    const ly = startY + g * gap;
    for (let y = ly; y < ly + lineH; y++) {
      for (let x = lx0; x < lx1; x++) setPx(rgba, size, x, y, bg[0], bg[1], bg[2], 255);
    }
  }

  return encodePng(size, size, rgba);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const s of [16, 48, 128]) {
  const buf = makeIcon(s);
  fs.writeFileSync(path.join(outDir, 'icon-' + s + '.png'), buf);
  console.log('wrote icon-' + s + '.png (' + buf.length + ' bytes)');
}
