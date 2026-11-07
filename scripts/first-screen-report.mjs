#!/usr/bin/env node
// First-screen report (batch 14): what the real Host sends for the first screen of each page, in Chinese and in English,
// including what scripts/gates/page-assets.mjs does not see (the HTML and what is inlined in it, /api, pty-client).
// It reports and never judges: it exits 0 whatever the numbers are and is not part of CI.
//
//   node scripts/first-screen-report.mjs [--out <dir>] [--port <n>] [--runs <n>] [--pages <id,id>] [--http-only]
//   node scripts/first-screen-report.mjs --summarize <dir>     prints a saved run, median of the runs, without a Host or a browser
//
// Build first (`pnpm build`). It serves a temporary Home on a free port (never 4207/4208, never ~/.molis-work), stops only
// the Host and Chrome it started, and removes that Home when it ends. The browser half drives test Chrome over the
// DevTools protocol, so wrap a full run in the machine's browser slot:
//
//   node scripts/machine-slot.mjs run browser --label "first-screen" -- node scripts/first-screen-report.mjs --out <dir>
//
// Out (default .impeccable/qa/review/first-screen, ignored): http.json, the page bytes read without a browser, with each page's
// HTML beside it; browser.json, every request of every run, cold (a new Chrome with an empty profile) and warm (a new tab in that
// Chrome); catalog-use.json, which language-catalog entries each first screen's code read. `--http-only` needs no slot.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, loadavg, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-local-host";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

const ROOT = resolve(import.meta.dirname, "..");
const SERVER = join(ROOT, "dist/web/server.js");
const LOCALES = ["zh", "en"];
const COOKIE = "molis_work_locale";
const RESERVED_PORTS = new Set([4207, 4208]);
const QUIET_MS = 1_500;
const SETTLE_LIMIT_MS = 8_000;

const bytes = (text) => Buffer.byteLength(text, "utf8");
const gzip = (text) => gzipSync(text, { level: 9 }).length;
const sized = (text) => ({ raw: bytes(text), gzip: gzip(text) });

function parse(argv) {
  const options = { out: join(ROOT, ".impeccable/qa/review/first-screen"), port: 0, runs: 3, httpOnly: false, pages: null, summarize: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--out") options.out = resolve(argv[++index]);
    else if (flag === "--port") options.port = Number(argv[++index]);
    else if (flag === "--runs") options.runs = Number(argv[++index]);
    else if (flag === "--http-only") options.httpOnly = true;
    else if (flag === "--summarize") options.summarize = resolve(argv[++index]);
    else if (flag === "--pages") options.pages = argv[++index].split(",");
    else throw new Error(`unknown argument ${flag}`);
  }
  if (RESERVED_PORTS.has(options.port)) throw new Error(`port ${options.port} belongs to the real Home`);
  return options;
}

async function freePort(requested) {
  if (requested) return requested;
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  probe.close();
  await once(probe, "close");
  return RESERVED_PORTS.has(port) ? freePort(0) : port;
}

/** Three projects: a new one (the emptier case), one with every project-scoped plugin (the crowded case) and the demo (sample data). */
async function seed(home) {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const plain = await catalog.createProject({ display_name: "默认项目", actor_id: "first-screen-report" });
    const crowded = await catalog.createProject({ display_name: "全部插件", actor_id: "first-screen-report" });
    for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: crowded.project_id, plugin_id, actor_id: "first-screen-report" });
    const demo = (await catalog.ensureDemoProject({ actor_id: "first-screen-report", user_confirmed: true })).project;
    return { plain: plain.project_id, crowded: crowded.project_id, demo: demo.project_id };
  } finally { catalog.close(); }
}

async function startHost(home, port) {
  const host = spawn(process.execPath, [SERVER, "--home", home, "--port", String(port)], {
    cwd: ROOT, stdio: "ignore", env: { ...process.env, MOLIS_WORK_HOME: home },
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (host.exitCode !== null) throw new Error(`the Host exited with ${host.exitCode}`);
    const answer = await fetch(`${origin}/health`).catch(() => null);
    if (answer?.ok) return { host, origin };
    await new Promise((done) => { setTimeout(done, 200); });
  }
  host.kill();
  throw new Error("the Host did not answer /health");
}

async function stopHost(host) {
  if (host.exitCode !== null) return;
  const gone = once(host, "exit");
  host.kill("SIGTERM");
  await gone;
}

// ---- the page's own bytes -------------------------------------------------------------------------------------------

/** The parts of the i18n script: each `globalThis.NAME = <json>;` is told apart so a catalog is not hidden in "script". */
function splitI18n(body) {
  const parts = [];
  let rest = body;
  for (const name of ["MOLIS_WORK_MESSAGES", "MOLIS_WORK_PLUGIN_TITLES", "MOLIS_WORK_PLUGIN_WORDS"]) {
    const start = rest.indexOf(`globalThis.${name} = `);
    if (start < 0) continue;
    const from = start + `globalThis.${name} = `.length;
    const end = rest.indexOf(";\n", from);
    const value = rest.slice(from, end);
    parts.push({ label: name, ...sized(value), entries: Object.keys(JSON.parse(value)).length });
    rest = rest.slice(0, start) + rest.slice(end + 2);
  }
  parts.push({ label: "script (rest of the block)", ...sized(rest) });
  return parts;
}

function blockLabel(tag, attributes, body) {
  if (tag === "style") return "<style>";
  if (attributes.includes("application/json")) return `json ${attributes.replace(/\s*type="application\/json"\s*/, " ").trim()}`;
  if (body.includes('const themeKey = "molis-work:theme"') && bytes(body) < 16_000) return "theme bootstrap";
  return attributes.trim() ? `script ${attributes.trim()}` : "script";
}

/** Every inline block of the HTML, largest first; a block holding the catalog is split into its parts. */
function inlineBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(/<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const [, tag, attributes, body] = match;
    if (!body) continue;
    const parts = body.includes("globalThis.MOLIS_WORK_MESSAGES = ") ? splitI18n(body) : null;
    blocks.push({ label: parts ? "i18n + page script" : blockLabel(tag, attributes, body), ...sized(body), ...(parts ? { parts } : {}) });
  }
  return blocks.sort((a, b) => b.raw - a.raw);
}

/** What the page links, read without a browser. */
function linkedAssets(html) {
  const found = [...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="(\/[^"]+)"/g)].map((match) => match[1]);
  return [...new Set(found)];
}

async function readHttp(origin, pages, out) {
  const report = {};
  for (const page of pages) {
    for (const locale of LOCALES) {
      const answer = await fetch(origin + page.path, { headers: { cookie: `${COOKIE}=${locale}`, "accept-encoding": "gzip, br" } });
      const html = await answer.text();
      writeFileSync(join(out, `${page.id}.${locale}.html`), html);
      const inline = inlineBlocks(html);
      const assets = {};
      for (const asset of linkedAssets(html)) {
        const response = await fetch(origin + asset, { headers: { cookie: `${COOKIE}=${locale}`, "accept-encoding": "gzip, br" } });
        const body = Buffer.from(await response.arrayBuffer());
        assets[asset] = { status: response.status, raw: body.length, gzip: gzipSync(body, { level: 9 }).length, encoding: response.headers.get("content-encoding"), cache: response.headers.get("cache-control") };
      }
      report[`${page.id}/${locale}`] = {
        status: answer.status, encoding: answer.headers.get("content-encoding"), cache: answer.headers.get("cache-control"),
        html: sized(html), inline, inline_total: inline.reduce((sum, block) => sum + block.raw, 0), assets,
      };
    }
  }
  return report;
}

// ---- the browser ----------------------------------------------------------------------------------------------------

const kindOf = (url, type) => {
  const path = new URL(url).pathname;
  if (type === "Document") return "html";
  if (path.startsWith("/api/") || path.startsWith("/projects/") && path.includes("/api/")) return "api";
  if (type === "Font" || path.endsWith(".woff2")) return "font";
  if (type === "Stylesheet" || path.endsWith(".css")) return "css";
  if (type === "Script" || path.endsWith(".js")) return "js";
  if (type === "Fetch" || type === "XHR") return "api";
  return (type ?? "other").toLowerCase();
};

/** One visit: navigates, waits for load and for the network to go quiet, and returns every request with its bytes. */
async function visit(browser, session, url) {
  const requests = new Map();
  let loadFired = false;
  let lastActivity = Date.now();
  const touch = () => { lastActivity = Date.now(); };
  const own = (listener) => (params, from) => { if (from === session.sessionId) { touch(); listener(params); } };
  const stops = [
    browser.on("Network.requestWillBeSent", own((params) => {
      if (params.redirectResponse) requests.delete(params.requestId);
      requests.set(params.requestId, { url: params.request.url, type: params.type, method: params.request.method, status: 0, wire: 0, body: 0, finished: false, after_load: loadFired });
    })),
    browser.on("Network.responseReceived", own((params) => {
      const entry = requests.get(params.requestId);
      if (entry) Object.assign(entry, { status: params.response.status, cached: params.response.fromDiskCache === true, encoding: params.response.headers?.["content-encoding"] ?? null, stream: /event-stream/.test(params.response.mimeType ?? "") });
    })),
    browser.on("Network.dataReceived", own((params) => { const entry = requests.get(params.requestId); if (entry) entry.body += params.dataLength; })),
    browser.on("Network.loadingFinished", own((params) => { const entry = requests.get(params.requestId); if (entry) Object.assign(entry, { wire: params.encodedDataLength, finished: true }); })),
    browser.on("Network.loadingFailed", own((params) => { const entry = requests.get(params.requestId); if (entry) Object.assign(entry, { failed: params.canceled ? "canceled" : params.errorText, finished: true }); })),
  ];
  try {
    const loaded = browser.event("Page.loadEventFired", () => true, 45_000);
    await session.command("Page.navigate", { url }, 45_000);
    await loaded;
    loadFired = true;
    const started = Date.now();
    while (Date.now() - started < SETTLE_LIMIT_MS) {
      const busy = [...requests.values()].some((entry) => !entry.finished && !entry.stream);
      if (!busy && Date.now() - lastActivity >= QUIET_MS) break;
      await new Promise((done) => { setTimeout(done, 100); });
    }
    const timing = await session.evaluate(`(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
      return { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null };
    })()`);
    const list = [...requests.values()].map((entry) => ({ ...entry, kind: kindOf(entry.url, entry.type), url: new URL(entry.url).pathname + new URL(entry.url).search }));
    return { timing, requests: list, load_average: loadavg()[0] };
  } finally { for (const stop of stops) stop(); }
}

async function openTab(browser) {
  const session = await browser.page();
  await browser.command("Target.activateTarget", { targetId: session.targetId });
  await session.command("Page.enable");
  await session.command("Network.enable");
  return session;
}

/** A new Chrome with an empty profile is what "cold" means here: no disk cache, no memory cache, only the language cookie. */
async function openFresh(home, label, origin, locale) {
  const browser = await ChromeHarness.start(join(home, "chrome", label), { executable: locateTestChrome(), commandTimeoutMs: 45_000 });
  const session = await openTab(browser);
  await session.command("Network.setCookie", { name: COOKIE, value: locale, url: origin });
  return { browser, session };
}

async function readBrowser(origin, pages, runs, home, out) {
  if (!locateTestChrome()) throw new Error("no test Chrome on this machine");
  const report = {};
  for (const page of pages) {
    for (const locale of LOCALES) {
      const samples = [];
      for (let run = 0; run < runs; run += 1) {
        const { browser, session } = await openFresh(home, `${page.id}-${locale}-${run}`, origin, locale);
        try {
          const cold = await visit(browser, session, origin + page.path);
          // Warm is the page opened again in a new tab: the HTTP cache stays, the first tab's open connections do not.
          await browser.command("Target.closeTarget", { targetId: session.targetId });
          const warm = await visit(browser, await openTab(browser), origin + page.path);
          samples.push({ cold, warm });
        } finally { await browser.close(); }
      }
      report[`${page.id}/${locale}`] = samples;
      writeFileSync(join(out, "browser.json"), `${JSON.stringify(report, null, 1)}\n`);
      process.stdout.write(`${page.id}/${locale}: ${samples.map((sample) => `${sample.cold.timing.fcp}/${sample.warm.timing.fcp}`).join(" ")} (fcp cold/warm, ms)\n`);
    }
  }
}

/** Records which catalog entries the page's own code reads, by standing behind the global the i18n script assigns. */
const RECORD_CATALOG_READS = `(() => {
  const read = new Set();
  let held;
  globalThis.__firstScreenCatalogReads = read;
  Object.defineProperty(globalThis, "MOLIS_WORK_MESSAGES", {
    configurable: true,
    get: () => held,
    set: (value) => { held = new Proxy(value, { get: (target, key) => { if (typeof key === "string" && Object.hasOwn(target, key)) read.add(key); return target[key]; } }); },
  });
})();`;

/** One more visit per page and language, after the timed ones: how much of the catalog the first screen's code really reads. */
async function readCatalogUse(origin, pages, home, out) {
  const report = {};
  for (const page of pages) {
    for (const locale of LOCALES) {
      const { browser, session } = await openFresh(home, `use-${page.id}-${locale}`, origin, locale);
      try {
        await session.command("Page.addScriptToEvaluateOnNewDocument", { source: RECORD_CATALOG_READS });
        await visit(browser, session, origin + page.path);
        const keys = await session.evaluate("[...(globalThis.__firstScreenCatalogReads ?? [])]");
        report[`${page.id}/${locale}`] = { read: keys.length, keys };
      } finally { await browser.close(); }
    }
  }
  writeFileSync(join(out, "catalog-use.json"), `${JSON.stringify(report, null, 1)}\n`);
}

// ---- the summary ----------------------------------------------------------------------------------------------------

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const KINDS = ["html", "css", "js", "font", "api"];

function summarize(dir) {
  const report = JSON.parse(readFileSync(join(dir, "browser.json"), "utf8"));
  for (const [page, samples] of Object.entries(report)) {
    for (const state of ["cold", "warm"]) {
      const visits = samples.map((sample) => sample[state]);
      const wire = (keep) => median(visits.map((visited) => visited.requests.filter(keep).reduce((sum, request) => sum + request.wire, 0)));
      const count = (keep) => median(visits.map((visited) => visited.requests.filter(keep).length));
      const parts = KINDS.map((kind) => `${kind} ${wire((request) => request.kind === kind)}/${count((request) => request.kind === kind)}`);
      const times = ["dcl", "fcp", "load"].map((name) => `${name} ${median(visits.map((visited) => visited.timing[name]))}`);
      process.stdout.write(`${page} ${state}: total ${wire(() => true)}/${count(() => true)} | ${parts.join(" ")} | ${times.join(" ")} ms | load average ${median(visits.map((visited) => visited.load_average)).toFixed(1)}\n`);
    }
  }
}

// ---- main -----------------------------------------------------------------------------------------------------------

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.summarize) { summarize(options.summarize); return; }
  if (!existsSync(SERVER)) throw new Error("dist/web/server.js is missing; run pnpm build first");
  const home = mkdtempSync(join(tmpdir(), "molis-first-screen-"));
  if (resolve(home) === join(homedir(), ".molis-work")) throw new Error("refusing the real Home");
  mkdirSync(options.out, { recursive: true });
  let started;
  try {
    const port = await freePort(options.port);
    const projects = await seed(home);
    started = await startHost(home, port);
    const pages = [
      { id: "arrival-empty", path: "/onboarding" },
      { id: "chooser", path: "/" },
      { id: "workbench-default", path: `/projects/${projects.plain}/` },
      { id: "workbench-all-plugins", path: `/projects/${projects.crowded}/` },
      { id: "workbench-demo", path: `/projects/${projects.demo}/` },
      { id: "settings", path: "/settings/appearance" },
      { id: "catalog", path: "/__ui/catalog" },
    ];
    const chosen = options.pages ? pages.filter((page) => options.pages.includes(page.id)) : pages;
    const http = await readHttp(started.origin, chosen, options.out);
    writeFileSync(join(options.out, "http.json"), `${JSON.stringify(http, null, 1)}\n`);
    if (!options.httpOnly) {
      await readBrowser(started.origin, chosen, options.runs, home, options.out);
      await readCatalogUse(started.origin, chosen, home, options.out);
    }
    process.stdout.write(`written to ${options.out}\n`);
  } finally {
    if (started) await stopHost(started.host);
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

await main();
