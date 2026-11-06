// Screenshots and layout checks for this prototype, in a throwaway headless Chrome on a throwaway profile. No Home is touched.
//   python3 -m http.server 4437 --bind 127.0.0.1 --directory docs/design     (in another terminal)
//   node docs/design/rule-stale-reload/shots.mjs <out-dir> [--all | --sheets | --only editor:conflict:plain:zh:light:1440,…]
// Prints every place a page scrolls sideways, a control leaves the window or the band is cut off. Keeps a picture of every state in
// every width, language and theme, and contact sheets of them in <out-dir>/sheets. --all also checks the layout of every state with
// crowded and sparse data, without keeping pictures.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const kit = await import(pathToFileURL(join(root, "packages/test-kit/dist/browser/index.js")).href);
const out = resolve(process.argv[2] || "shots");
const args = process.argv.slice(3);
const all = args.includes("--all");
const onlyAt = args.indexOf("--only");
mkdirSync(out, { recursive: true });

const STATES = ["normal", "conflict", "kept", "loaded", "offline", "deleted", "second", "clean", "noop", "published"];
const HOSTS = ["editor", "feed"];
const SIZES = { 1440: [1440, 900], 1024: [1024, 768], 390: [390, 844] };

const jobs = [];
const add = (h, st, d, l, t, w, keep) => jobs.push({ h, st, d, l, t, w: Number(w), keep });
if (args.includes("--sheets")) { /* only the contact sheets, from pictures already there */ }
else if (onlyAt >= 0) for (const spec of args[onlyAt + 1].split(",")) { const [h, st, d, l, t, w] = spec.split(":"); add(h, st, d, l, t, w, true); }
else for (const h of HOSTS) for (const st of STATES) {
  for (const l of ["zh", "en"]) for (const t of ["light", "dark"]) for (const w of [1440, 1024, 390]) add(h, st, "plain", l, t, w, true);
  // The layout does not change with the theme, so the crowded and sparse checks run in one of them.
  if (all) for (const d of ["full", "empty"]) for (const l of ["zh", "en"]) for (const w of [1440, 1024, 390]) add(h, st, d, l, "light", w, false);
}

const profile = mkdtempSync(join(tmpdir(), "rule-stale-shots-"));
const browser = await kit.launchHeadlessChrome({ executable: kit.locateTestChrome(), profileDirectory: profile });
const harness = await kit.ChromeHarness.connect(browser.debuggerUrl, {}, browser);
const page = await harness.page();
const problems = [];
const CHECK = `(() => {
  const out = [];
  const de = document.documentElement;
  if (de.scrollWidth > innerWidth + 1) out.push("page scrolls sideways " + de.scrollWidth);
  for (const el of document.querySelectorAll(".cand-band, .cand-band button, .cand-kept, .cand-kept button, dialog[open] .mw-form__footer button, [data-functions-next], [data-functions-prev]")) {
    if (el.closest("[hidden]") || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.left < -1) out.push((el.className || el.tagName) + " leaves the window " + Math.round(r.left) + "-" + Math.round(r.right));
    if (el.matches(".cand-band") && el.scrollWidth > el.clientWidth + 1) out.push("band overflows");
  }
  for (const b of document.querySelectorAll(".cand-band button, .cand-kept button")) {
    if (!b.getClientRects().length) continue;
    const label = b.querySelector("[data-slot=button-label]");
    if (label && label.scrollWidth > label.clientWidth + 1) out.push("button label cut: " + label.textContent);
  }
  // The band is what this state is about: it must be whole inside what its scroll area shows, not cut off by the bottom bar.
  const band = document.querySelector(".cand-band");
  if (band) {
    let area = band.parentElement;
    while (area && !["auto", "scroll"].includes(getComputedStyle(area).overflowY)) area = area.parentElement;
    const seen = area ? area.getBoundingClientRect() : { top: 0, bottom: innerHeight };
    const r = band.getBoundingClientRect();
    const fits = r.height <= seen.bottom - seen.top;
    if (fits && (r.bottom > seen.bottom + 1 || r.top < seen.top - 1)) out.push("band cut off by its scroll area: " + Math.round(r.top) + "-" + Math.round(r.bottom) + " in " + Math.round(seen.top) + "-" + Math.round(seen.bottom));
  }
  return out;
})()`;
let n = 0;
for (const job of jobs) {
  const [width, height] = SIZES[job.w];
  await page.viewport(width, height, width < 600);
  const hash = `#h=${job.h}&st=${job.st}&d=${job.d}&l=${job.l}&t=${job.t}`;
  await page.evaluate(`location.href = "about:blank"`);
  await page.evaluate(`location.href = "http://127.0.0.1:4437/rule-stale-reload/index.html${hash}"`);
  await page.wait(`document.readyState === "complete" && !!document.querySelector("#app > *")`);
  await new Promise((done) => setTimeout(done, job.keep ? 650 : 120));
  const found = await page.evaluate(CHECK);
  const name = `${job.h}-${job.st}-${job.d}-${job.l}-${job.t}-${job.w}`;
  if (found.length) { problems.push([name, found]); process.stdout.write(`${name}: ${found.join("; ")}\n`); }
  if (job.keep) await page.screenshot(join(out, `${name}.png`));
  n += 1;
}
process.stdout.write(`${n} views, ${problems.length} with problems\n`);
// Contact sheets: every state of a page side by side, and the widths, languages and themes of the key states.
if (onlyAt < 0) {
  const names = readdirSync(out).filter((name) => name.endsWith(".png"));
  const shown = (name) => name.replace(/\.png$/, "").replaceAll("-", " ");
  const sheet = async (file, picked, column, count) => {
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
  for (const h of HOSTS) {
    for (const t of ["light", "dark"]) await sheet(`${h}-all-states-${t}.png`, STATES.map((st) => `${h}-${st}-plain-zh-${t}-1440.png`), 560, 3);
    for (const st of STATES) await sheet(`${h}-${st}-matrix.png`, names.filter((name) => name.startsWith(`${h}-${st}-plain-`)).sort(), 300, 6);
  }
}
await harness.close?.();
await browser.close();
rmSync(profile, { recursive: true, force: true });
