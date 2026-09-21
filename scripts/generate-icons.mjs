#!/usr/bin/env node
/**
 * Generates Hac-Man's original app icons as plain PNGs, with no image
 * dependency: a hand-rolled PNG encoder (deflate via Node's own zlib) draws
 * the project's own player-mouth silhouette — the same shape
 * `src/render/renderer.ts#drawPlayer` already draws in the maze — on the
 * brand background, so the icon is this project's existing character design
 * rather than a copy of arcade artwork.
 *
 * Run with `node scripts/generate-icons.mjs`. Output goes to `public/icons/`,
 * which Vite copies verbatim into the build output; see `README.md`'s PWA
 * section for when to regenerate these.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BACKGROUND = [0x05, 0x06, 0x0f]; // --bg
const PLAYER = [0xff, 0xd2, 0x3f]; // --accent, the player's own fill colour
const RING = [0xff, 0xff, 0xff]; // the ball's white ring (see src/render/renderer.ts COLORS.ballRing)

let crcTable;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crcTable[(crc ^ buffer[i]) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Encodes an opaque RGBA buffer (row-major, no filter bytes) as a PNG. */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function setPixel(rgba, width, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= width) return;
  const offset = (y * width + x) * 4;
  rgba[offset] = r;
  rgba[offset + 1] = g;
  rgba[offset + 2] = b;
  rgba[offset + 3] = 255;
}

/**
 * Draws the app mark: the player's mouth-wedge disc, facing up-and-right
 * (rather than the classic due-right orientation) and encircled by the
 * ball's own white ring (`COLORS.ballRing`) — the combination distinguishes
 * this icon from the plain arcade logo while reusing only this project's
 * already-established, original in-game shapes and palette.
 */
function drawPlayerDisc(rgba, width, height, cx, cy, radius, mouthTurns) {
  const mouthRadians = mouthTurns * 2 * Math.PI;
  const facingRadians = -Math.PI / 4; // up-and-right, not due right
  const ringInner = radius * 1.14;
  const ringOuter = radius * 1.28;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance >= ringInner && distance <= ringOuter) {
        setPixel(rgba, width, x, y, RING);
        continue;
      }
      if (distance > radius) continue;
      const angle = Math.atan2(dy, dx) - facingRadians;
      const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
      const withinMouth = Math.abs(normalized) <= mouthRadians;
      if (withinMouth && distance > radius * 0.06) continue; // the open wedge
      setPixel(rgba, width, x, y, PLAYER);
    }
  }
}

function generateIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = BACKGROUND[0];
    rgba[i * 4 + 1] = BACKGROUND[1];
    rgba[i * 4 + 2] = BACKGROUND[2];
    rgba[i * 4 + 3] = 255;
  }
  // Maskable icons need their content inside the platform's safe zone (an
  // 80%-diameter centred circle, i.e. 40% radius); the ring extends to 1.28x
  // the disc radius, so the disc radius itself is kept well inside that.
  const radius = size * (maskable ? 0.3 : 0.36);
  drawPlayerDisc(rgba, size, size, size / 2, size / 2, radius, 0.09);
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', generateIcon(192)],
  ['icon-512.png', generateIcon(512)],
  ['icon-512-maskable.png', generateIcon(512, { maskable: true })],
  ['apple-touch-icon.png', generateIcon(180)],
];

for (const [name, data] of targets) {
  writeFileSync(path.join(OUT_DIR, name), data);
  console.log(`wrote public/icons/${name} (${data.length} bytes)`);
}
