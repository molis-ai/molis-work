import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { decodePng, diffImages, encodePng } from "../scripts/visual/png.mjs";

// The comparison behind W4-12 (scripts/visual-compare.mjs): reading Chrome's PNGs, the pixel diff and the verdict. The
// browser capture itself is tests/visual-surfaces.e2e.test.ts.

const image = (width: number, height: number, pixel: (x: number, y: number) => number[]) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data };
};

/** An RGB picture written with a different row filter on every row, the way Chrome's encoder mixes them. */
function filteredRgb(width: number, rows: number[][]) {
  const paeth = (a: number, b: number, c: number) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const filter = y % 5, up = y ? rows[y - 1] : null;
    raw.push(filter);
    row.forEach((value, x) => {
      const a = x >= 3 ? row[x - 3] : 0, b = up ? up[x] : 0, c = up && x >= 3 ? up[x - 3] : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      raw.push((value - predicted + 256) & 255);
    });
  });
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(body.length, 0); head.write(type, 4, "latin1");
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(rows.length, 4); header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);
}

test("W4-12: PNGs round-trip, and RGB rows under every filter read back exactly", () => {
  const picture = image(7, 5, (x, y) => [x * 30, y * 50, (x * y * 13) & 255, 255 - x]);
  assert.deepEqual(decodePng(encodePng(picture)), picture);

  const rows = Array.from({ length: 10 }, (_, y) => Array.from({ length: 4 * 3 }, (_, i) => (y * 37 + i * 91 + ((y * i) % 7) * 29) & 255));
  const decoded = decodePng(filteredRgb(4, rows));
  assert.equal(decoded.width, 4); assert.equal(decoded.height, 10);
  rows.forEach((row, y) => {
    for (let x = 0; x < 4; x++) assert.deepEqual([...decoded.data.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)], [...row.slice(x * 3, x * 3 + 3), 255], `row ${y} pixel ${x}`);
  });
});

test("W4-12: formats the comparison does not read are refused by name, not compared", () => {
  assert.throws(() => decodePng(Buffer.from("not a picture")), /not a PNG/);
  const sixteen = encodePng(image(1, 1, () => [0, 0, 0, 255]));
  sixteen[24] = 16; // the IHDR bit depth
  assert.throws(() => decodePng(sixteen), /unsupported PNG: bit depth 16/);
});

test("W4-12: a single changed pixel counts, and a size change is all of the picture", () => {
  const base = image(4, 4, () => [10, 20, 30, 255]);
  assert.equal(diffImages(base, base).changed, 0);
  const head = image(4, 4, (x, y) => x === 2 && y === 1 ? [11, 20, 30, 255] : [10, 20, 30, 255]);
  const result = diffImages(base, head);
  assert.equal(result.changed, 1);
  assert.deepEqual([...result.image.data.subarray((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4)], [230, 30, 40, 255], "the changed pixel is red in the diff");
  assert.equal(diffImages(base, head, 1).changed, 0, "a tolerance the caller asks for is applied");
  const wider = diffImages(base, image(5, 4, () => [10, 20, 30, 255]));
  assert.equal(wider.sizeChanged, true); assert.equal(wider.changed, wider.total);
});

test("W4-12: --compare reports each changed or missing picture and exits 1; identical sets exit 0", t => {
  const root = mkdtempSync(join(tmpdir(), "visual-compare-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (side: string, pictures: Record<string, ReturnType<typeof image>>) => {
    mkdirSync(join(root, side));
    for (const [name, picture] of Object.entries(pictures)) writeFileSync(join(root, side, `${name}.png`), encodePng(picture));
    writeFileSync(join(root, side, "manifest.json"), JSON.stringify({ pictures: Object.keys(pictures) }));
  };
  const plain = image(3, 3, () => [200, 200, 200, 255]), touched = image(3, 3, (x, y) => x + y === 0 ? [0, 0, 0, 255] : [200, 200, 200, 255]);
  write("base", { "home@390-light": plain, "todo@390-light": plain, "gone@390-light": plain });
  write("head", { "home@390-light": plain, "todo@390-light": touched, "new@390-light": plain });
  write("same", { "home@390-light": plain, "todo@390-light": plain, "gone@390-light": plain });
  const compare = (head: string) => spawnSync(process.execPath, ["scripts/visual-compare.mjs", "--compare", join(root, "base"), join(root, head), "--out", join(root, `out-${head}`)], { encoding: "utf8" });

  const changed = compare("head");
  assert.equal(changed.status, 1, changed.stderr);
  const report = JSON.parse(readFileSync(join(root, "out-head", "report.json"), "utf8")) as { pictures: Array<{ name: string; changed: boolean; note: string }> };
  assert.deepEqual(report.pictures.filter(row => row.changed).map(row => [row.name, row.note]).sort(),
    [["gone@390-light", "missing on the branch"], ["new@390-light", "new on the branch"], ["todo@390-light", ""]]);
  assert.match(changed.stdout, /3 of 4 pictures changed/);
  assert.match(readFileSync(join(root, "out-head", "report.html"), "utf8"), /todo@390-light/);

  const same = compare("same");
  assert.equal(same.status, 0, same.stdout + same.stderr);
  assert.match(same.stdout, /0 of 3 pictures changed/);

  const unfinished = spawnSync(process.execPath, ["scripts/visual-compare.mjs", "--compare", join(root, "base"), root, "--out", join(root, "out-unfinished")], { encoding: "utf8" });
  assert.equal(unfinished.status, 2);
  assert.match(unfinished.stderr, /no manifest\.json/);
});
