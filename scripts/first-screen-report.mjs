#!/usr/bin/env node
// First-screen report (batch 14): what the real Host sends for the first screen of each page, in Chinese and in English,
// including what scripts/gates/page-assets.mjs does not see (the HTML and what is inlined in it, /api, pty-client).
// It reports and never judges: it exits 0 whatever the numbers are and is not part of CI.
//
//   node scripts/first-screen-report.mjs [--out <dir>] [--port <n>] [--runs <n>] [--pages <id,id>] [--http-only | --reads-only]
//   node scripts/first-screen-report.mjs --summarize <dir>     prints a saved run, median of the runs, without a Host or a browser
//   node scripts/first-screen-report.mjs --resources           prints every row of the resource registry with its files' bytes and sha256
//
// Measures the business screen after Home selection; installation login and account switching are outside this report.
// Build first (`pnpm build`). It serves a temporary Home on a free port (never 4207/4208, never ~/.molis-work), stops only
// the Host and Chrome it started, and removes that Home when it ends. The browser half drives test Chrome over the
// DevTools protocol, so wrap a full run in the machine's browser slot:
//
//   node scripts/machine-slot.mjs run browser --label "first-screen" -- node scripts/first-screen-report.mjs --out <dir>
//
// Out (default .impeccable/qa/review/first-screen, ignored): http.json, the page bytes read without a browser, with each page's
// HTML beside it; browser.json, every request of every run, cold (a new Chrome with an empty profile) and warm (a new tab in that
// Chrome); catalog-use.json, which language entries the code of every frame of the first screen read.
//
// `--http-only` needs no slot, but it is not the page's total: it reads the document and the files the document names, and misses
// the hidden side document, whatever a script loads and all startup JSON, so `--summarize` has nothing to print for it.
// `--reads-only` skips the timed visits and only writes catalog-use.json (still a browser, still the slot).
// `--resources` reads packages/design-system/resources/registry.json (what ships with the product and has a path in a package,
// specs/font-and-skin-system/resource-budget.md §6.1), one line a file: a language directory is one line a language. Nothing is
// stored, so the numbers are always the files' own; a font whose bytes no longer match the sha256 the registry pins says so.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { homedir, loadavg, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-local-host";
import { BASELINE_REGISTRY } from "@molis-ai/molis-work-design-system";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

const ROOT = resolve(import.meta.dirname, "..");
const SERVER = join(ROOT, "scripts/visual/selected-home-server.mjs");
const LOCALES = ["zh", "en"];
const COOKIE = "molis_work_locale";
const RESERVED_PORTS = new Set([4207, 4208]);
const QUIET_MS = 1_500;
const SETTLE_LIMIT_MS = 8_000;

const bytes = (text) => Buffer.byteLength(text, "utf8");
const gzip = (text) => gzipSync(text, { level: 9 }).length;
const sized = (text) => ({ raw: bytes(text), gzip: gzip(text) });

function integerAt(flag, text, least, most) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < least || value > most) throw new Error(`${flag} wants a whole number from ${least} to ${most}, got ${text}`);
  return value;
}

function parse(argv) {
  const options = { out: join(ROOT, ".impeccable/qa/review/first-screen"), port: 0, runs: 3, httpOnly: false, readsOnly: false, pages: null, summarize: null, resources: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--out") options.out = resolve(argv[++index]);
    else if (flag === "--port") options.port = integerAt(flag, argv[++index], 1, 65_535);
    else if (flag === "--runs") options.runs = integerAt(flag, argv[++index], 1, 100);
    else if (flag === "--http-only") options.httpOnly = true;
    else if (flag === "--reads-only") options.readsOnly = true;
    else if (flag === "--summarize") options.summarize = resolve(argv[++index]);
    else if (flag === "--pages") options.pages = argv[++index].split(",");
    else if (flag === "--resources") options.resources = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (RESERVED_PORTS.has(options.port)) throw new Error(`port ${options.port} belongs to the real Home`);
  if (options.httpOnly && options.readsOnly) throw new Error("--http-only and --reads-only exclude each other");
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

/**
 * Three projects: a new one (the emptier case), one with every project-scoped plugin (the crowded case) and the demo (sample data).
 * The ids are fixed because the page derives bytes from them (`data-hue`, and every route that names the project).
 */
async function seed(home) {
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const plain = await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000001", display_name: "默认项目", actor_id: "first-screen-report" });
    const crowded = await catalog.createProject({ project_id: "project-onboarding-00000000-0000-4000-8000-000000000002", display_name: "全部插件", actor_id: "first-screen-report" });
    for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: crowded.project_id, plugin_id, actor_id: "first-screen-report" });
    const demo = (await catalog.ensureDemoProject({ actor_id: "first-screen-report", user_confirmed: true })).project;
    return { plain: plain.project_id, crowded: crowded.project_id, demo: demo.project_id };
  } finally { catalog.close(); }
}

async function startHost(home, port) {
  const host = spawn(process.execPath, [SERVER, home, String(port)], {
    cwd: ROOT, stdio: "ignore", env: { ...process.env, MOLIS_WORK_HOME: home },
  });
  running.host = host;
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
  if (host.exitCode !== null || host.signalCode !== null) return;
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
  if (stopped) throw new Error("interrupted");
  const starting = ChromeHarness.start(join(home, "chrome", label), { executable: locateTestChrome(), commandTimeoutMs: 45_000 });
  running.starting.add(starting);
  const browser = await starting;
  running.starting.delete(starting);
  running.browsers.add(browser);
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
        } finally { await closeBrowser(browser); }
      }
      report[`${page.id}/${locale}`] = samples;
      writeFileSync(join(out, "browser.json"), `${JSON.stringify(report, null, 1)}\n`);
      process.stdout.write(`${page.id}/${locale}: ${samples.map((sample) => `${sample.cold.timing.fcp}/${sample.warm.timing.fcp}`).join(" ")} (fcp cold/warm, ms)\n`);
    }
  }
}

/**
 * Stands behind the globals the i18n script assigns, in every frame, and reports through a binding (a frame's own variable would be
 * lost with the frame and cannot be read from a sandboxed one). A key is reported once per frame. A whole-catalog copy (parent.ts
 * spreads the catalog into a frame's config) is reported as a copy, not as thousands of reads: it is the entries that follow an
 * `ownKeys`, in that order. Not seen: a sandboxed plugin frame, whose `L` reads the copy it was handed (child.ts). It reported nothing
 * here, also when attached to as a target of its own; `all_frames` lists it, so frames without a record stay visible.
 */
const RECORD_CATALOG_READS = `(() => {
  const send = globalThis.__firstScreenRead;
  if (typeof send !== "function") return;
  const frame = location.protocol === "about:" ? location.href : location.pathname + location.search;
  const seen = new Set();
  const report = (kind, catalog, key) => {
    const id = kind + "/" + catalog + "/" + key;
    if (seen.has(id)) return;
    seen.add(id);
    send(JSON.stringify({ frame, kind, catalog, key }));
  };
  const watched = (target, catalog) => {
    let copying = null;
    let at = 0;
    return new Proxy(target, {
      ownKeys(from) {
        copying = Reflect.ownKeys(from);
        at = 0;
        report("copy", catalog, copying.length);
        return copying;
      },
      get(from, key) {
        if (typeof key !== "string" || !Object.hasOwn(from, key)) return from[key];
        if (copying && copying[at] === key) { at += 1; if (at === copying.length) copying = null; return from[key]; }
        copying = null;
        report("read", catalog, key);
        return from[key];
      },
    });
  };
  const stand = (name, wrap) => {
    let held;
    Object.defineProperty(globalThis, name, { configurable: true, get: () => held, set: (value) => { report("catalog", name, Object.keys(value ?? {}).length); held = wrap(value); } });
  };
  stand("MOLIS_WORK_MESSAGES", (value) => watched(value, "messages"));
  stand("MOLIS_WORK_PLUGIN_WORDS", (value) => {
    const inner = new Map();
    return new Proxy(value, {
      get(from, plugin) {
        const words = from[plugin];
        if (typeof plugin !== "string" || !words || typeof words !== "object") return words;
        if (!inner.has(plugin)) inner.set(plugin, watched(words, plugin));
        return inner.get(plugin);
      },
    });
  });
})();`;

const framesOf = (tree) => [tree.frame.url, ...(tree.childFrames ?? []).flatMap(framesOf)];

/** One more visit per page and language, after the timed ones: how much of the catalogs the first screen's code really reads, frame by frame. */
async function readCatalogUse(origin, pages, home, out) {
  const report = {};
  for (const page of pages) {
    for (const locale of LOCALES) {
      const { browser, session } = await openFresh(home, `use-${page.id}-${locale}`, origin, locale);
      const frames = {};
      let exceptions = 0;
      const stops = [
        browser.on("Runtime.bindingCalled", (params, from) => {
          if (from !== session.sessionId || params.name !== "__firstScreenRead") return;
          const { frame, kind, catalog, key } = JSON.parse(params.payload);
          const entry = (frames[frame] ??= { catalogs: {}, reads: {}, copies: [] });
          if (kind === "catalog") entry.catalogs[catalog] = key;
          else if (kind === "copy") entry.copies.push({ catalog, entries: key });
          else (entry.reads[catalog] ??= []).push(key);
        }),
        browser.on("Runtime.exceptionThrown", (_params, from) => { if (from === session.sessionId) exceptions += 1; }),
      ];
      try {
        await session.command("Runtime.enable");
        await session.command("Runtime.addBinding", { name: "__firstScreenRead" });
        await session.command("Page.addScriptToEvaluateOnNewDocument", { source: RECORD_CATALOG_READS });
        await visit(browser, session, origin + page.path);
        const { frameTree } = await session.command("Page.getFrameTree");
        report[`${page.id}/${locale}`] = { frames, all_frames: framesOf(frameTree), exceptions };
      } finally { for (const stop of stops) stop(); await closeBrowser(browser); }
    }
  }
  writeFileSync(join(out, "catalog-use.json"), `${JSON.stringify(report, null, 1)}\n`);
}

// ---- the summary ----------------------------------------------------------------------------------------------------

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const KINDS = ["html", "css", "js", "font", "api"];
/** What scripts/gates/page-assets.mjs measures, by path: its literal routes and the built-in packs all live under /assets/. */
const GATED = (request) => request.url.startsWith("/assets/");

function summarize(dir) {
  const report = JSON.parse(readFileSync(join(dir, "browser.json"), "utf8"));
  for (const [page, samples] of Object.entries(report)) {
    for (const state of ["cold", "warm"]) {
      const visits = samples.map((sample) => sample[state]);
      const wire = (keep) => median(visits.map((visited) => visited.requests.filter(keep).reduce((sum, request) => sum + request.wire, 0)));
      const count = (keep) => median(visits.map((visited) => visited.requests.filter(keep).length));
      const parts = KINDS.map((kind) => `${kind} ${wire((request) => request.kind === kind)}/${count((request) => request.kind === kind)}`);
      const times = ["dcl", "fcp", "load"].map((name) => `${name} ${median(visits.map((visited) => visited.timing[name]))}`);
      const shares = visits.map((visited) => visited.requests.filter(GATED).reduce((sum, request) => sum + request.wire, 0) / visited.requests.reduce((sum, request) => sum + request.wire, 0));
      process.stdout.write(`${page} ${state}: total ${wire(() => true)}/${count(() => true)} | page-assets ${(median(shares) * 100).toFixed(1)}% | ${parts.join(" ")} | ${times.join(" ")} ms | load average ${median(visits.map((visited) => visited.load_average)).toFixed(1)}\n`);
    }
  }
}

// ---- resource registry --------------------------------------------------------------------------------------------

/** A package's directory, from its entry up to the package.json that names it: the same in a checkout and in a release's node_modules. */
function packageDirectory(name) {
  for (let directory = dirname(fileURLToPath(import.meta.resolve(name))); ; directory = dirname(directory)) {
    const file = join(directory, "package.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).name === name) return directory;
    if (dirname(directory) === directory) throw new Error(`no package directory for ${name}`);
  }
}

function reportResources() {
  for (const row of BASELINE_REGISTRY.resources) {
    const at = join(packageDirectory(row.package), row.path);
    const head = `${row.id} ${row.kind} ${row.owner} ${row.load}${row.route ? ` ${row.route}` : ""}`;
    if (!existsSync(at)) { process.stdout.write(`${head} ${row.path}: missing\n`); continue; }
    const files = statSync(at).isDirectory()
      ? readdirSync(at).filter((name) => name.endsWith(".json")).sort().map((name) => [`${row.path}/${name}`, join(at, name)])
      : [[row.path, at]];
    for (const [path, file] of files) {
      const content = readFileSync(file);
      const sha256 = createHash("sha256").update(content).digest("hex");
      const pinned = row.sha256 === undefined ? "" : row.sha256 === sha256 ? " (as pinned)" : ` (registry pins ${row.sha256})`;
      process.stdout.write(`${head} ${path}: ${content.length} B, gzip ${gzipSync(content, { level: 9 }).length} B, sha256 ${sha256}${pinned}\n`);
    }
  }
}

// ---- main -----------------------------------------------------------------------------------------------------------

/** What this run started, and nothing else: an interrupted run stops these by the handles it holds and removes its own Home. */
const running = { host: null, browsers: new Set(), starting: new Set(), home: null };
let stopped = null;

async function closeBrowser(browser) {
  // Stays on the list until it has closed, so an interrupt during a normal close still waits for it.
  try { await browser.close(); } finally { running.browsers.delete(browser); }
}

/** One cleanup per run, shared by both signals and main: a second caller waits for it rather than racing it, and the first signal's exit code stands. */
function stopEverything() {
  stopped ??= stopRun();
  return stopped;
}

async function stopRun() {
  // A Chrome still starting has no handle yet: wait for it, or it outlives this run and writes into the Home removed below.
  await Promise.allSettled([...running.starting, ...running.browsers].map(async (browser) => closeBrowser(await browser)));
  if (running.host) await stopHost(running.host);
  running.host = null;
  if (running.home) rmSync(running.home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  running.home = null;
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.summarize) { summarize(options.summarize); return; }
  if (options.resources) { reportResources(); return; }
  if (!existsSync(join(ROOT, 'dist/web/server.js'))) throw new Error("dist/web/server.js is missing; run pnpm build first");
  const home = mkdtempSync(join(tmpdir(), "molis-first-screen-"));
  if (resolve(home) === join(homedir(), ".molis-work")) throw new Error("refusing the real Home");
  running.home = home;
  // `on`, not `once`: with no listener a repeated signal would kill this process mid-cleanup and leave the Host, Chrome and Home behind.
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    process.on(signal, () => { void stopEverything().finally(() => process.exit(code)); });
  }
  mkdirSync(options.out, { recursive: true });
  try {
    const port = await freePort(options.port);
    const projects = await seed(home);
    const started = await startHost(home, port);
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
    if (!options.httpOnly && !options.readsOnly) await readBrowser(started.origin, chosen, options.runs, home, options.out);
    if (!options.httpOnly) await readCatalogUse(started.origin, chosen, home, options.out);
    process.stdout.write(`written to ${options.out}\n`);
  } finally { await stopEverything(); }
}

await main();
