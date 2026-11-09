#!/usr/bin/env node
// First-screen report (batch 14): what the real Host sends for the first screen of each page, in Chinese and in English,
// including what scripts/gates/page-assets.mjs does not see (the HTML and what is inlined in it, /api, pty-client).
// Byte counts are informational. Failed or incomplete measurements exit nonzero.
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
// Out (default .impeccable/qa/review/first-screen, ignored): http.json and the measured HTML; browser.json, every
// request of each cold (fresh profile) and warm (new tab) run; audit.json, the differences between observed and measured
// requests; catalog-use.json, which language entries the code of every frame of the first screen read.
//
// `--http-only` reads the same paths as the budget checker without running a browser. `--summarize` reads browser.json.
// `--reads-only` skips the timed visits and only writes catalog-use.json (still a browser, still the slot).
// `--resources` reads packages/design-system/resources/registry.json (what ships with the product and has a path in a package,
// specs/font-and-skin-system/resource-budget.md §6.1), one line a file: a language directory is one line a language. Nothing is
// stored, so the numbers are always the files' own; a font whose bytes no longer match the sha256 the registry pins says so.

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir, loadavg } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { BASELINE_REGISTRY } from "@molis-ai/molis-work-design-system";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { LOCALES, LOCALE_COOKIE, withFirstScreenHost } from "./first-screen/host.mjs";
import { auditFirstScreen } from "./first-screen/audit.mjs";
import { sampleFirstScreen } from "./first-screen/http.mjs";
import { currentRows, readManifest, registeredPaths } from "./first-screen/manifest.mjs";

const ROOT = resolve(import.meta.dirname, "..");
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
  if (options.httpOnly && options.readsOnly) throw new Error("--http-only and --reads-only exclude each other");
  return options;
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

async function readHttp(host, pages) {
  const report = {};
  const documents = {};
  const rows = currentRows(readManifest(ROOT));
  for (const page of pages) {
    for (const locale of LOCALES) {
      const paths = registeredPaths(rows, page, locale);
      const samples = await sampleFirstScreen(host.origin, page, locale, paths, { signal: host.signal, inspect: true });
      const { cold, links } = samples.get(page.path);
      const html = cold.body.toString("utf8");
      documents[`${page.id}.${locale}.html`] = html;
      const inline = inlineBlocks(html);
      const assets = {};
      for (const link of links) {
        const { status, headers, body } = samples.get(link).cold;
        assets[link] = { status, raw: body.length, gzip: gzipSync(body, { level: 9 }).length, encoding: headers["content-encoding"] ?? null, cache: headers["cache-control"] ?? null };
      }
      const responses = Object.fromEntries([...samples].map(([path, sample]) => [path, { cold: sample.cold.wire, warm: sample.warm.wire }]));
      report[`${page.id}/${locale}`] = {
        status: cold.status, encoding: cold.headers["content-encoding"] ?? null, cache: cold.headers["cache-control"] ?? null,
        html: sized(html), inline, inline_total: inline.reduce((sum, block) => sum + block.raw, 0), assets, responses,
      };
    }
  }
  return { report, documents };
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
async function visit(browser, session, url, { signal, mayRedirect }) {
  const requests = new Map();
  const redirects = [];
  let loadFired = false;
  let lastActivity = Date.now();
  const touch = () => { lastActivity = Date.now(); };
  const own = (listener) => (params, from) => { if (from === session.sessionId) listener(params); };
  const stops = [
    browser.on("Network.requestWillBeSent", own((params) => {
      touch();
      const previous = requests.get(params.requestId);
      if (previous && params.redirectResponse) {
        redirects.push({ ...previous, status: params.redirectResponse.status, wire: params.redirectResponse.encodedDataLength, finished: true });
      }
      requests.set(params.requestId, { url: params.request.url, type: params.type, method: params.request.method, status: 0, wire: 0, body: 0, finished: false, after_load: loadFired });
    })),
    browser.on("Network.responseReceived", own((params) => {
      touch();
      const entry = requests.get(params.requestId);
      if (entry) Object.assign(entry, { status: params.response.status, cached: params.response.fromDiskCache === true, encoding: params.response.headers?.["content-encoding"] ?? null, stream: /event-stream/.test(params.response.mimeType ?? "") });
    })),
    browser.on("Network.dataReceived", own((params) => {
      const entry = requests.get(params.requestId);
      if (entry) { if (!entry.stream) touch(); entry.body += params.dataLength; }
    })),
    browser.on("Network.loadingFinished", own((params) => { touch(); const entry = requests.get(params.requestId); if (entry) Object.assign(entry, { wire: params.encodedDataLength, finished: true }); })),
    browser.on("Network.loadingFailed", own((params) => { touch(); const entry = requests.get(params.requestId); if (entry) Object.assign(entry, { failed: params.canceled ? "canceled" : params.errorText, finished: true }); })),
  ];
  try {
    const loaded = browser.event("Page.loadEventFired", () => true, 45_000);
    const [, navigation] = await Promise.all([loaded, session.command("Page.navigate", { url }, 45_000)]);
    if (navigation.errorText) throw new Error(`${url}: ${navigation.errorText}`);
    loadFired = true;
    const pending = () => [...requests.values()].filter(entry => !entry.finished && !entry.stream);
    const started = Date.now();
    while (Date.now() - started < SETTLE_LIMIT_MS) {
      if (!pending().length && Date.now() - lastActivity >= QUIET_MS) break;
      await delay(100, undefined, { signal });
    }
    if (pending().length) throw new Error(`${url}: browser sample has unfinished requests`);
    const finalUrl = mayRedirect ? await session.evaluate("location.href") : url;
    const document = [...requests.values()].find(entry => entry.type === "Document" && entry.url === finalUrl);
    if (!document || document.failed || document.status < 200 || document.status >= 300 && document.status !== 304) {
      throw new Error(`${url}: browser document did not load (HTTP ${document?.status ?? "missing"})`);
    }
    const timing = await session.evaluate(`(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByType("paint").find((entry) => entry.name === "first-contentful-paint");
      return { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: fcp ? Math.round(fcp.startTime) : null };
    })()`);
    const origin = new URL(url).origin;
    const list = [...redirects, ...requests.values()].flatMap(entry => {
      const target = new URL(entry.url);
      if (target.protocol !== "http:" && target.protocol !== "https:") return [];
      const same_origin = target.origin === origin;
      const path = target.pathname + target.search;
      return [{ ...entry, kind: kindOf(entry.url, entry.type), same_origin, url: same_origin ? path : target.origin + path }];
    });
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

// The test-kit has a desktop Chrome fallback for legacy callers. This report requires the separate test browser.
function testExecutable() {
  const wrapper = join(homedir(), ".local/bin/molis-test-browser");
  const executable = locateTestChrome({ ...process.env, MOLIS_WORK_TEST_CHROME: process.env.MOLIS_WORK_TEST_CHROME || wrapper },
    path => existsSync(path) && !realpathSync(path).startsWith("/Applications/Google Chrome.app/"));
  if (!executable) throw new Error("no isolated Chrome found; set MOLIS_WORK_TEST_CHROME");
  return executable;
}

async function withFreshBrowser(host, executable, label, locale, operation) {
  const { home, origin, signal } = host;
  signal.throwIfAborted();
  const browser = await ChromeHarness.start(join(home, "chrome", label), { executable, commandTimeoutMs: 45_000 });
  let interrupted;
  const aborted = new Promise((_, reject) => { interrupted = () => reject(signal.reason); });
  signal.addEventListener("abort", interrupted, { once: true });
  try {
    signal.throwIfAborted();
    const run = async () => {
      const session = await openTab(browser);
      await session.command("Network.setCookie", { name: LOCALE_COOKIE, value: locale, url: origin });
      return operation(browser, session);
    };
    return await Promise.race([run(), aborted]);
  } finally {
    signal.removeEventListener("abort", interrupted);
    await browser.close();
  }
}

async function readBrowser(host, executable, pages, runs) {
  const report = {};
  for (const page of pages) {
    for (const locale of LOCALES) {
      const samples = [];
      for (let run = 0; run < runs; run += 1) {
        const sample = await withFreshBrowser(host, executable, `${page.id}-${locale}-${run}`, locale, async (browser, session) => {
          const url = host.origin + page.path;
          const options = { signal: host.signal, mayRedirect: page.id === "settings" };
          const cold = await visit(browser, session, url, options);
          // Warm is the page opened again in a new tab: the HTTP cache stays, the first tab's open connections do not.
          await browser.command("Target.closeTarget", { targetId: session.targetId });
          const warm = await visit(browser, await openTab(browser), url, options);
          return { cold, warm };
        });
        samples.push(sample);
      }
      report[`${page.id}/${locale}`] = samples;
    }
  }
  return report;
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
async function readCatalogUse(host, executable, pages) {
  const report = {};
  for (const page of pages) {
    for (const locale of LOCALES) {
      report[`${page.id}/${locale}`] = await withFreshBrowser(host, executable, `use-${page.id}-${locale}`, locale, async (browser, session) => {
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
          await visit(browser, session, host.origin + page.path, { signal: host.signal, mayRedirect: page.id === "settings" });
          const { frameTree } = await session.command("Page.getFrameTree");
          return { frames, all_frames: framesOf(frameTree), exceptions };
        } finally { for (const stop of stops) stop(); }
      });
    }
  }
  return report;
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

async function main(signal) {
  const options = parse(process.argv.slice(2));
  if (options.summarize) { summarize(options.summarize); return; }
  if (options.resources) { reportResources(); return; }
  const executable = options.httpOnly ? null : testExecutable();
  const { report, documents, browser, audit, catalogs } = await withFirstScreenHost(ROOT, { signal, port: options.port }, async (host) => {
    const pages = options.pages ? host.pages.filter(page => options.pages.includes(page.id)) : host.pages;
    if (options.pages && pages.length !== options.pages.length) throw new Error("--pages needs distinct known page IDs");
    const http = await readHttp(host, pages);
    const browser = options.httpOnly || options.readsOnly ? null : await readBrowser(host, executable, pages, options.runs);
    const audit = browser ? auditFirstScreen(http.report, browser) : null;
    const catalogs = options.httpOnly ? null : await readCatalogUse(host, executable, pages);
    return { ...http, browser, audit, catalogs };
  });
  signal.throwIfAborted();
  mkdirSync(options.out, { recursive: true });
  for (const [file, html] of Object.entries(documents)) writeFileSync(join(options.out, file), html);
  for (const [name, data] of [["http", report], ["browser", browser], ["audit", audit], ["catalog-use", catalogs]]) {
    if (data) writeFileSync(join(options.out, `${name}.json`), `${JSON.stringify(data, null, 1)}\n`);
  }
  process.stdout.write(`written to ${options.out}\n`);
}

const stop = new AbortController();
const interrupt = () => { process.exitCode ||= 130; stop.abort(new Error("first-screen report interrupted")); };
const terminate = () => { process.exitCode ||= 143; stop.abort(new Error("first-screen report terminated")); };
process.on("SIGINT", interrupt);
process.on("SIGTERM", terminate);
try { await main(stop.signal); }
catch (error) { console.error(error.message); process.exitCode ||= 1; }
finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
}
