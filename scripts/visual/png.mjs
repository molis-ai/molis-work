import { deflateSync, inflateSync } from "node:zlib";

/**
 * The PNG reading and writing the visual comparison needs, on node:zlib alone: Chrome's screenshots (8-bit, RGB or RGBA,
 * not interlaced) in, RGBA pixels out, and a diff image written back. Anything else is refused by name, so a format this
 * does not read never turns into a silent "no change".
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @param {Buffer} file @returns {{ width: number, height: number, data: Uint8Array }} RGBA, row by row. */
export function decodePng(file) {
  if (!file.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  let width = 0, height = 0, channels = 0;
  const parts = [];
  for (let at = 8; at < file.length;) {
    const length = file.readUInt32BE(at), type = file.toString("latin1", at + 4, at + 8), body = file.subarray(at + 8, at + 8 + length);
    at += 12 + length;
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      const [depth, color, , , interlace] = body.subarray(8, 13);
      channels = color === 6 ? 4 : color === 2 ? 3 : 0;
      if (depth !== 8 || !channels || interlace !== 0) throw new Error(`unsupported PNG: bit depth ${depth}, color type ${color}, interlace ${interlace}`);
    } else if (type === "IDAT") parts.push(body);
    else if (type === "IEND") break;
  }
  if (!width || !height) throw new Error("PNG without a header");
  const raw = inflateSync(Buffer.concat(parts)), stride = width * channels;
  if (raw.length !== height * (stride + 1)) throw new Error("PNG data does not match its size");
  const rows = new Uint8Array(height * stride), data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = rows.subarray(y * stride, (y + 1) * stride), up = y ? rows.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0, b = up ? up[x] : 0, c = up && x >= channels ? up[x - channels] : 0;
      row[x] = (line[x] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : bad(filter))) & 255;
    }
    for (let x = 0; x < width; x++) {
      data.set(row.subarray(x * channels, x * channels + 3), (y * width + x) * 4);
      data[(y * width + x) * 4 + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
  }
  return { width, height, data };
}

/** @param {{ width: number, height: number, data: Uint8Array }} image RGBA. @returns {Buffer} */
export function encodePng({ width, height, data }) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Pixels whose largest channel difference exceeds `tolerance` count as changed. The
 * diff image is the head picture faded to a fifth, with changed pixels in red; images of different sizes compare as
 * wholly changed and say so.
 * @param {{ width: number, height: number, data: Uint8Array }} base
 * @param {{ width: number, height: number, data: Uint8Array }} head
 */
export function diffImages(base, head, tolerance = 0) {
  const total = head.width * head.height;
  if (base.width !== head.width || base.height !== head.height) return { changed: total, total, sizeChanged: true, image: head };
  const data = new Uint8Array(total * 4);
  let changed = 0;
  for (let i = 0; i < total * 4; i += 4) {
    const delta = Math.max(Math.abs(base.data[i] - head.data[i]), Math.abs(base.data[i + 1] - head.data[i + 1]), Math.abs(base.data[i + 2] - head.data[i + 2]), Math.abs(base.data[i + 3] - head.data[i + 3]));
    if (delta > tolerance) { changed++; data.set([230, 30, 40, 255], i); }
    else { const grey = Math.round((head.data[i] + head.data[i + 1] + head.data[i + 2]) / 3); data.set([255 - (255 - grey) / 5, 255 - (255 - grey) / 5, 255 - (255 - grey) / 5, 255], i); }
  }
  return { changed, total, sizeChanged: false, image: { width: head.width, height: head.height, data } };
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function bad(filter) { throw new Error(`unsupported PNG row filter ${filter}`); }

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0); head.write(type, 4, "latin1");
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([head.subarray(4), body])) crc = CRC[(crc ^ byte) & 255] ^ (crc >>> 8);
  const tail = Buffer.alloc(4); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([head, body, tail]);
}
