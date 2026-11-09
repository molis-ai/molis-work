// Screenshots and layout checks for this prototype, in a throwaway headless Chrome on a throwaway profile. No Home is touched.
//   python3 -m http.server 4461 --bind 127.0.0.1 --directory docs/design     (in another terminal)
//   node docs/design/capability-pack/shots.mjs <out-dir> [--only A:normal:zh:light:1440,…] [--sheets]
// Keeps a picture of every screen of every scheme in every width, language and theme (and a tall one of the detail screens),
// prints every place a page scrolls sideways or a control leaves the window, and writes contact sheets to <out-dir>/sheets.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const kit = await import(pathToFileURL(join(root, "packages/test-kit/dist/browser/index.js")).href);
const out = resolve(process.argv[2] || "shots");
const args = process.argv.slice(3);
const onlyAt = args.indexOf("--only");
const sheetsOnly = args.includes("--sheets");
mkdirSync(out, { recursive: true });

const SCHEMES = ["A", "B"];
const VIEWS = ["normal", "pack", "role", "prompt", "skill", "mcp", "tool", "disabled", "gone", "partial", "fail", "empty", "many", "loading", "import", "export"];
const DETAIL = ["pack", "role", "prompt", "skill", "mcp", "tool", "gone", "import"];
const SIZES = { 1440: [1440, 900], 1024: [1024, 768], 390: [390, 844] };
const jobs = [];
const add = (s, v, l, t, w, tall = false) => jobs.push({ s, v, l, t, w: Number(w), tall });
if (sheetsOnly) { /* only the contact sheets */ }
else if (onlyAt >= 0) for (const spec of args[onlyAt + 1].split(",")) { const [s, v, l, t, w] = spec.split(":"); add(s, v, l, t, w); }
else for (const s of SCHEMES) for (const v of VIEWS) {
  for (const l of ["zh", "en"]) for (const t of ["light", "dark"]) for (const w of [1440, 1024, 390]) add(s, v, l, t, w);
  if (DETAIL.includes(v)) for (const w of [1440, 390]) add(s, v, "zh", "light", w, true);
}

const CHECK = `(() => {
  const out = (window.__errors || []).map((e) => "script error: " + e);
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) out.push("page scrolls sideways " + de.scrollWidth);
  for (const el of document.querySelectorAll(".kit-settings button, .kit-settings a, .kit-settings .mw-status, .kit-settings .mw-badge, .kp-menu")) {
    if (el.closest("[hidden]") || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > innerWidth + 1 || r.left < -1) out.push((el.className || el.tagName).toString().slice(0, 40) + " leaves the window " + Math.round(r.left) + "-" + Math.round(r.right));
  }
  for (const b of document.querySelectorAll(".kit-settings [data-slot=button-label]")) {
    if (b.getClientRects().length && b.scrollWidth > b.clientWidth + 1) out.push("button label cut: " + b.textContent);
  }
  const list = document.querySelector(".mw-list-detail__list");
  for (const el of document.querySelectorAll(".kp-tool__name strong, .mw-item strong")) if (el.getClientRects().length && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis") out.push("name cut: " + el.textContent.slice(0, 30));
  if (list && list.scrollWidth > list.clientWidth + 1) out.push("list overflows " + list.scrollWidth + ">" + list.clientWidth);
  const det = document.querySelector(".kp-detail");
  if (det && det.getClientRects().length && det.scrollWidth > det.clientWidth + 1) out.push("detail overflows " + det.scrollWidth + ">" + det.clientWidth);
  return out;
})()`;

const profile = mkdtempSync(join(tmpdir(), "capability-pack-shots-"));
const browser = await kit.launchHeadlessChrome({ executable: kit.locateTestChrome(), profileDirectory: profile });
const harness = await kit.ChromeHarness.connect(browser.debuggerUrl, {}, browser);
const page = await harness.page();
const problems = [];
let n = 0;
for (const job of jobs) {
  const [width, height] = SIZES[job.w];
  await page.viewport(width, job.tall ? 2400 : height, width < 600);
  const hash = `#s=${job.s}&v=${job.v}&l=${job.l}&t=${job.t}&shot=1`;
  // A fresh load each time (the hash alone would not re-run the page): blank first, then the screen.
  await page.evaluate(`location.href = "about:blank"`);
  await new Promise((done) => setTimeout(done, 150));
  await page.evaluate(`location.href = "http://127.0.0.1:4461/capability-pack/index.html?n=${n}${hash}"`);
  await new Promise((done) => setTimeout(done, 150));
  for (let i = 0; i < 60; i += 1) {
    const ready = await page.evaluate(`document.readyState === "complete" && !!document.querySelector(".kit-settings")`).catch(() => false);
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  await new Promise((done) => setTimeout(done, 700));
  const found = await page.evaluate(CHECK);
  const name = `${job.s}-${job.v}-${job.l}-${job.t}-${job.w}${job.tall ? "-tall" : ""}`;
  if (found.length) { problems.push([name, found]); process.stdout.write(`${name}: ${found.join("; ")}\n`); }
  await page.screenshot(join(out, `${name}.png`));
  n += 1;
}
process.stdout.write(`${n} views, ${problems.length} with problems\n`);

// Contact sheets: every screen of a scheme side by side (zh light 1440), and each screen's width × language × theme matrix.
if (onlyAt < 0) {
  const names = readdirSync(out).filter((name) => name.endsWith(".png"));
  const shown = (name) => name.replace(/\.png$/, "").replaceAll("-", " ");
  const sheet = async (file, picked, column, count) => {
    picked = picked.filter((name) => names.includes(name));
    if (!picked.length) return;
    const rows = Math.ceil(picked.length / count), cell = column + 16;
    const tall = (w) => Math.round(column * (SIZES[w] ? SIZES[w][1] / SIZES[w][0] : 0.625));
    const height = Math.max(...picked.map((name) => tall(Number(name.match(/-(\d+)\.png$/)[1])))) + 44;
    await page.viewport(count * cell + 16, Math.min(rows * height + 24, 8000));
    const server = createServer((req, res) => {
      const name = decodeURIComponent(req.url.slice(1));
      if (!name.endsWith(".png")) { res.statusCode = 404; res.end(); return; }
      res.setHeader("content-type", "image/png"); res.end(readFileSync(join(out, name)));
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${server.address().port}/`;
    await page.evaluate(`location.href = ${JSON.stringify(base + picked[0])}`);
    await new Promise((done) => setTimeout(done, 200));
    await page.evaluate(`(() => { document.documentElement.innerHTML = ${JSON.stringify(`<body style="margin:0;padding:12px;background:#e9ecef;font:12px system-ui;display:grid;grid-template-columns:repeat(${count},${column}px);gap:12px 16px;align-items:start">${picked.map((name) => `<figure style="margin:0"><figcaption style="padding:0 0 4px;color:#333">${shown(name)}</figcaption><img src="${base}${encodeURIComponent(name)}" style="display:block;width:${column}px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.25)"></figure>`).join("")}</body>`)}; })()`);
    await page.wait(`[...document.images].every((img) => img.complete)`);
    await new Promise((done) => setTimeout(done, 300));
    await page.screenshot(join(out, "sheets", file));
    await new Promise((done) => server.close(done));
  };
  mkdirSync(join(out, "sheets"), { recursive: true });
  for (const s of SCHEMES) {
    for (const t of ["light", "dark"]) await sheet(`${s}-all-screens-${t}.png`, VIEWS.map((v) => `${s}-${v}-zh-${t}-1440.png`), 560, 3);
    await sheet(`${s}-all-screens-en-light.png`, VIEWS.map((v) => `${s}-${v}-en-light-1440.png`), 560, 3);
    await sheet(`${s}-all-screens-390.png`, VIEWS.map((v) => `${s}-${v}-zh-light-390.png`), 260, 7);
    for (const v of VIEWS) await sheet(`${s}-${v}-matrix.png`, names.filter((name) => name.startsWith(`${s}-${v}-`) && !name.includes("-tall")).sort(), 300, 6);
  }
}
await harness.close?.();
await browser.close();
rmSync(profile, { recursive: true, force: true });
