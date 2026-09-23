const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 implementation for PNG chunks
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function createPng(width, height, getPixel) {
  // Raw RGBA image data with scanline filter byte (0 = None)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc(height * (1 + rowBytes));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression method: 0
  ihdr[11] = 0; // Filter method: 0
  ihdr[12] = 0; // Interlace method: 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// 7x5 Monospace bitmap font for "[DLXR]"
// Each char is 5 wide, 7 tall
const FONT = {
  '[': [
    [1,1,1],
    [1,0,0],
    [1,0,0],
    [1,0,0],
    [1,0,0],
    [1,0,0],
    [1,1,1]
  ],
  ']': [
    [1,1,1],
    [0,0,1],
    [0,0,1],
    [0,0,1],
    [0,0,1],
    [0,0,1],
    [1,1,1]
  ],
  'D': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0]
  ],
  'L': [
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,1,1,1,1]
  ],
  'X': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1]
  ],
  'R': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1]
  ]
};

function renderIconPixel(x, y, w, h) {
  const normX = x / w;
  const normY = y / h;

  // Background: Deep dark #090b0a
  let r = 9, g = 11, b = 10, a = 255;

  // Border: 1px border around icon edge
  const borderMargin = 0.04;
  if (normX >= borderMargin && normX <= (1 - borderMargin) &&
      normY >= borderMargin && normY <= (1 - borderMargin)) {
    // Inside inner card: pitch black
    r = 0; g = 0; b = 0;

    // Subtle grid dots in background
    const gridSpacing = w / 16;
    const gx = Math.floor(x / gridSpacing) * gridSpacing + gridSpacing / 2;
    const gy = Math.floor(y / gridSpacing) * gridSpacing + gridSpacing / 2;
    const distDot = Math.hypot(x - gx, y - gy);
    if (distDot < Math.max(1, w * 0.006)) {
      r = 25; g = 35; b = 28;
    }

    // Outer border line in sage #6DA871
    const edgeDistX = Math.min(normX - borderMargin, (1 - borderMargin) - normX);
    const edgeDistY = Math.min(normY - borderMargin, (1 - borderMargin) - normY);
    if ((edgeDistX < 0.008 || edgeDistY < 0.008) && edgeDistX >= 0 && edgeDistY >= 0) {
      r = 109; g = 168; b = 113; // #6DA871
    }
  }

  // Neon broadcast indicator dot top right (pulsing neon green #00cc55)
  const pipX = w * 0.82;
  const pipY = h * 0.22;
  const pipDist = Math.hypot(x - pipX, y - pipY);
  const pipRadius = w * 0.04;
  if (pipDist <= pipRadius) {
    r = 0; g = 204; b = 85; // #00cc55
  } else if (pipDist <= pipRadius * 2) {
    const fade = 1 - (pipDist - pipRadius) / pipRadius;
    r = Math.round(r + 0 * fade);
    g = Math.round(g + 204 * fade * 0.3);
    b = Math.round(b + 85 * fade * 0.3);
  }

  // Draw "[DLXR]" text in the center
  // String sequence: ['[', 'D', 'L', 'X', 'R', ']']
  const chars = [
    { char: '[', color: [109, 168, 113] },
    { char: 'D', color: [240, 240, 240] },
    { char: 'L', color: [240, 240, 240] },
    { char: 'X', color: [240, 240, 240] },
    { char: 'R', color: [240, 240, 240] },
    { char: ']', color: [109, 168, 113] }
  ];

  // Calculate text scale and placement
  const charPixelW = 5;
  const charPixelH = 7;
  const spacing = 1;
  const bracketW = 3;

  const totalGridW = (bracketW * 2) + (charPixelW * 4) + (spacing * 5); // 3+5+5+5+5+3 + 5 = 31
  const pixelScale = Math.max(1, Math.floor((w * 0.72) / totalGridW));

  const textTotalW = totalGridW * pixelScale;
  const textTotalH = charPixelH * pixelScale;

  const startX = Math.floor((w - textTotalW) / 2);
  const startY = Math.floor((h - textTotalH) / 2) + Math.floor(h * 0.02);

  if (x >= startX && x < startX + textTotalW && y >= startY && y < startY + textTotalH) {
    let curX = startX;
    for (const item of chars) {
      const glyph = FONT[item.char];
      const charWidth = glyph[0].length;
      const cW = charWidth * pixelScale;

      if (x >= curX && x < curX + cW) {
        const gx = Math.floor((x - curX) / pixelScale);
        const gy = Math.floor((y - startY) / pixelScale);
        if (glyph[gy] && glyph[gy][gx]) {
          r = item.color[0];
          g = item.color[1];
          b = item.color[2];
        }
      }
      curX += cW + (spacing * pixelScale);
    }
  }

  return [r, g, b, a];
}

const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating PWA Icons...');
const sizes = [192, 512, 180];
for (const size of sizes) {
  const filename = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  const outPath = path.join(iconsDir, filename);
  const pngBuf = createPng(size, size, renderIconPixel);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`✓ Created ${filename} (${size}x${size}, ${pngBuf.length} bytes)`);
}

// Also generate a clean SVG icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#000000" rx="64"/>
  <rect x="24" y="24" width="464" height="464" fill="none" stroke="#6DA871" stroke-width="4" rx="40" opacity="0.8"/>
  <circle cx="410" cy="110" r="18" fill="#00cc55"/>
  <circle cx="410" cy="110" r="32" fill="none" stroke="#00cc55" stroke-width="3" opacity="0.4"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="92" font-weight="800" fill="#ffffff" letter-spacing="4">
    <tspan fill="#6DA871">[</tspan>DLXR<tspan fill="#6DA871">]</tspan>
  </text>
  <text x="50%" y="72%" dominant-baseline="middle" text-anchor="middle" font-family="'JetBrains Mono', monospace" font-size="20" font-weight="700" fill="#6DA871" letter-spacing="6">
    IADT COLLEGE RADIO
  </text>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');
console.log('✓ Created icon.svg');
