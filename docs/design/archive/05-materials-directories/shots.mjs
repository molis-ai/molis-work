// Screenshots and layout checks for this prototype, in a throwaway headless Chrome on a throwaway profile, served by a throwaway
// local server on a free port (127.0.0.1). No Home is touched.
//   node docs/design/05-materials-directories/shots.mjs <out-dir> [--all] [--only a:a3:ask:plain:zh:light:1440,…] [--sheets]
// Keeps a picture of every option and state in 1440, 1024 and 390, Chinese and English, light and dark, and contact sheets in
// <out-dir>/sheets. Prints every place the page scrolls sideways, a control leaves the window or a button's words are cut, and any
// script error. --all also checks the layout of every view with the crowded and sparse data, without keeping pictures.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const served = resolve(here, "..");
const kit = await import(pathToFileURL(join(root, "packages/test-kit/dist/browser/index.js")).href);
const out = resolve(process.argv[2] || join(root, ".impeccable/qa/review/05-materials-directories"));
const args = process.argv.slice(3);
const all = args.includes("--all");
const onlyAt = args.indexOf("--only");
const sheetsOnly = args.includes("--sheets");
mkdirSync(out, { recursive: true });

const GROUPS = {
  a: { options: ["a1", "a2", "a3"], states: ["ask", "empty", "unknown", "kept", "unasked", "busy", "retry"], data: ["plain", "full"] },
  b: { options: ["b1", "b2", "b3"], states: ["unmapped", "goal", "picker", "mapping", "mapped", "missing", "manage", "changed", "wrong", "refused"], data: ["plain", "full", "empty"] },
};
const SIZES = { 1440: [1440, 900], 1024: [1024, 768], 390: [390, 844] };
const jobs = [];
const add = (g, o, st, d, l, t, w, keep) => jobs.push({ g, o, st, d, l, t, w: Number(w), keep });
if (sheetsOnly) { /* contact sheets only, from pictures already there */ }
else if (onlyAt >= 0) for (const spec of args[onlyAt + 1].split(",")) { const [g, o, st, d, l, t, w] = spec.split(":"); add(g, o, st, d, l, t, w, true); }
else for (const [g, { options, states, data }] of Object.entries(GROUPS)) for (const o of options) for (const st of states) {
  for (const l of ["zh", "en"]) for (const t of ["light", "dark"]) for (const w of [1440, 1024, 390]) add(g, o, st, "plain", l, t, w, true);
  // The layout does not change with the theme, so the crowded and sparse checks run in one of them.
  if (all) for (const d of data.filter((x) => x !== "plain")) for (const l of ["zh", "en"]) for (const w of [1440, 1024, 390]) add(g, o, st, d, l, "light", w, false);
}

// The page needs a server only because Chrome keeps file:// pages apart; this one serves docs/design, and the pictures under
// /shots/ for the contact sheets, and nothing else.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png" };
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const [base, rest] = pathname.startsWith("/shots/") ? [out, pathname.slice(7)] : [served, pathname];
  const path = resolve(base, "." + "/" + rest);
  if (!path.startsWith(base + sep) || !statSync(path, { throwIfNoEntry: false })?.isFile()) { res.statusCode = 404; res.end(); return; }
  res.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
  res.end(readFileSync(path));
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), "materials-directories-shots-"));
const browser = await kit.launchHeadlessChrome({ executable: kit.locateTestChrome(), profileDirectory: profile });
const harness = await kit.ChromeHarness.connect(browser.debuggerUrl, {}, browser);
const page = await harness.page();
const CHECK = `(() => {
  const found = [...window.protoErrors];
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) found.push("page scrolls sideways " + de.scrollWidth);
  const seen = (el) => !el.closest("[hidden]") && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden";
  for (const el of document.querySelectorAll("#app button, #app a, .b-pop button, dialog[open] button, .proto-toast")) {
    if (!seen(el) || el.closest(".proto")) continue;
    const r = el.getBoundingClientRect();
    let clip = el.parentElement;
    while (clip && !["auto", "scroll", "hidden"].includes(getComputedStyle(clip).overflowX)) clip = clip.parentElement;
    const box = clip ? clip.getBoundingClientRect() : { left: 0, right: innerWidth };
    if (r.right > Math.min(innerWidth, box.right) + 1 || r.left < Math.max(0, box.left) - 1) found.push((el.textContent.trim() || el.getAttribute("aria-label") || el.className).slice(0, 40) + " leaves its area " + Math.round(r.left) + "-" + Math.round(r.right));
    const label = el.querySelector("[data-slot=button-label]");
    if (label && label.scrollWidth > label.clientWidth + 1) found.push("button words cut: " + label.textContent);
  }
  for (const el of document.querySelectorAll(".b-pop, dialog[open]")) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1) found.push((el.className || el.tagName).slice(0, 40) + " leaves the window");
  }
  return found;
})()`;
const problems = [];
let n = 0;
for (const job of jobs) {
  const [width, height] = SIZES[job.w];
  await page.viewport(width, height, width < 600);
  const hash = `#g=${job.g}&o=${job.o}&st=${job.st}&d=${job.d}&l=${job.l}&t=${job.t}`;
  await page.evaluate(`location.href = "about:blank"`);
  await page.evaluate(`location.href = ${JSON.stringify(`${origin}/05-materials-directories/index.html${hash}`)}`);
  await page.wait(`document.readyState === "complete" && !!document.querySelector("#app > *")`);
  await new Promise((done) => setTimeout(done, job.keep ? 700 : 150));
  const found = await page.evaluate(CHECK);
  const name = `${job.g}-${job.o}-${job.st}-${job.d}-${job.l}-${job.t}-${job.w}`;
  if (found.length) { problems.push([name, found]); process.stdout.write(`${name}: ${found.join("; ")}\n`); }
  if (job.keep) await page.screenshot(join(out, `${name}.png`));
  n += 1;
}
process.stdout.write(`${n} views, ${problems.length} with problems\n`);

// Contact sheets: every state of an option side by side, and each key state across widths, languages and themes.
if (onlyAt < 0) {
  const names = readdirSync(out).filter((name) => name.endsWith(".png"));
  const sheet = async (file, picked, column, count) => {
    picked = picked.filter((name) => names.includes(name));
    if (!picked.length) return;
    const rows = Math.ceil(picked.length / count), cell = column + 16;
    const tall = (w) => Math.round(column * (SIZES[w][1] / SIZES[w][0]));
    const height = Math.max(...picked.map((name) => tall(Number(name.match(/-(\d+)\.png$/)[1])))) + 44;
    await page.viewport(count * cell + 16, Math.min(rows * height + 24, 8000));
    await page.evaluate(`location.href = ${JSON.stringify(`${origin}/05-materials-directories/index.html#blank`)}`);
    await page.wait(`document.readyState === "complete"`);
    const rel = (name) => `/shots/${encodeURIComponent(name)}`;
    await page.evaluate(`(() => { document.documentElement.innerHTML = ${JSON.stringify(`<body style="margin:0;padding:12px;background:#e9ecef;font:12px system-ui;display:grid;grid-template-columns:repeat(${count},${column}px);gap:12px 16px;align-items:start">${picked.map((name) => `<figure style="margin:0"><figcaption style="padding:0 0 4px;color:#333">${name.replace(/\.png$/, "").replaceAll("-", " ")}</figcaption><img src="${rel(name)}" style="display:block;width:${column}px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.25)"></figure>`).join("")}</body>`)}; })()`);
    await page.wait(`[...document.images].every((img) => img.complete)`);
    await new Promise((done) => setTimeout(done, 300));
    await page.screenshot(join(out, "sheets", file));
  };
  {
    mkdirSync(join(out, "sheets"), { recursive: true });
    for (const [g, { options, states }] of Object.entries(GROUPS)) for (const o of options) {
      for (const t of ["light", "dark"]) await sheet(`${g}-${o}-states-zh-${t}-1440.png`, states.map((st) => `${g}-${o}-${st}-plain-zh-${t}-1440.png`), 560, 3);
      await sheet(`${g}-${o}-states-en-light-390.png`, states.map((st) => `${g}-${o}-${st}-plain-en-light-390.png`), 240, 7);
      await sheet(`${g}-${o}-states-zh-dark-1024.png`, states.map((st) => `${g}-${o}-${st}-plain-zh-dark-1024.png`), 480, 3);
    }
  }
}
await harness.close?.();
await browser.close();
server.close();
rmSync(profile, { recursive: true, force: true });
