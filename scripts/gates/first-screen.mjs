#!/usr/bin/env node
// FSS-BG-01–05 + Batch 100-2 (Decision 58): real read-only HTTP samples against route cold/warm ceilings
// in tooling/gates/page-asset-budgets.json (with optional CI artifact delta logging and merge-base budget ratchet).
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { isMainScript } from "../script-paths.mjs";
import { LOCALES, withFirstScreenHost } from "../first-screen/host.mjs";
import { sampleFirstScreen } from "../first-screen/http.mjs";
import { GATED_PAGES, MANIFEST, MEASURED_PAGES, comparisonRows, currentRows, parseManifest, readManifest, registeredPaths, removedManifestRows } from "../first-screen/manifest.mjs";
import { git, readBaseBudgets, readBudgets, trustedRun } from "./page-assets-baseline.mjs";
import { VISITS, firstScreenBudgetProblems } from "./page-assets-policy.mjs";

const CHECKER_SOURCES = [
  import.meta.filename,
  new URL("../first-screen/host.mjs", import.meta.url),
  new URL("../first-screen/http.mjs", import.meta.url),
  new URL("../first-screen/manifest.mjs", import.meta.url),
];

export function firstScreenMeasurementKey(rows) {
  const hash = createHash("sha256");
  for (const file of CHECKER_SOURCES) hash.update(readFileSync(file));
  hash.update(JSON.stringify({ rows, node: process.version, platform: process.platform, arch: process.arch }));
  return hash.digest("hex").slice(0, 24);
}

function validMeasurementMap(pages) {
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return false;
  for (const page of MEASURED_PAGES) {
    for (const locale of LOCALES) {
      const entry = pages[`${page}/${locale}`];
      if (!entry || typeof entry !== "object" || !entry.totals || !entry.entries || typeof entry.entries !== "object") return false;
      for (const visit of VISITS) if (!Number.isInteger(entry.totals[visit]) || entry.totals[visit] < 0) return false;
      for (const size of Object.values(entry.entries)) {
        if (!size || typeof size !== "object") return false;
        for (const visit of VISITS) if (!Number.isInteger(size[visit]) || size[visit] < 0) return false;
      }
    }
  }
  return true;
}

export function firstScreenReportMatches(report, sha, key) {
  return report?.sha === sha && report?.key === key && validMeasurementMap(report?.pages);
}

export async function cachedFirstScreenMeasurement({ sha, key, repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN, fetch: get = globalThis.fetch, signal }) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) return null;
  let temporary;
  try {
    const api = "https://api.github.com";
    const request = async (route, binary = false) => {
      const response = await get(`${api}/repos/${repo}/${route}`, {
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`cache request returned ${response.status}`);
      return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
    };
    const runs = await request(`actions/workflows/ci.yml/runs?head_sha=${sha}&status=success&per_page=20`);
    for (const run of (runs.workflow_runs ?? []).filter(run => trustedRun(run, sha))) {
      const list = await request(`actions/runs/${run.id}/artifacts?per_page=100`);
      const artifact = (list.artifacts ?? []).find(item => item.name === `first-screen-${sha}-${key}` && !item.expired && item.size_in_bytes < 2_000_000);
      if (!artifact) continue;
      temporary = mkdtempSync(join(tmpdir(), "molis-first-screen-cache-"));
      const archive = join(temporary, "measurement.zip");
      writeFileSync(archive, await request(`actions/artifacts/${artifact.id}/zip`, true));
      const contents = execFileSync("unzip", ["-p", archive, "measurement.json"], { encoding: "utf8", maxBuffer: 2 << 20, stdio: ["ignore", "pipe", "pipe"] });
      const report = JSON.parse(contents);
      rmSync(temporary, { recursive: true, force: true }); temporary = undefined;
      if (firstScreenReportMatches(report, sha, key)) return report;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    // Cache access is optional for informational delta logging.
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
  return null;
}

function readManifestAtCommit(root, sha) {
  const present = git(root, "ls-tree", "--name-only", sha, "--", MANIFEST);
  if (!present) return null;
  return parseManifest(git(root, "show", `${sha}:${MANIFEST}`), `${sha.slice(0, 8)}:${MANIFEST}`);
}

export async function measureFirstScreen(root, rows, signal) {
  return withFirstScreenHost(root, { signal }, async host => {
    const pages = {};
    for (const page of host.pages) {
      if (!MEASURED_PAGES.includes(page.id)) continue;
      for (const locale of LOCALES) {
        const samples = await sampleFirstScreen(host.origin, page, locale, registeredPaths(rows, page, locale), { signal: host.signal });
        const totals = { cold: 0, warm: 0 };
        const entries = {};
        for (const [path, sample] of samples) {
          entries[path] = { cold: sample.cold.wire, warm: sample.warm.wire };
          for (const visit of VISITS) totals[visit] += entries[path][visit];
        }
        pages[`${page.id}/${locale}`] = { totals, entries, path: page.path, project: page.project };
      }
    }
    return pages;
  });
}

/**
 * One build's measurement in a child process of its own, run by this checker against that build's root. A build's
 * Host installs process-wide state as it starts (the UI text context, one per build), so each build runs isolated.
 */
export async function measureFirstScreenApart(root, rows, signal, { execPath = process.execPath, script = import.meta.filename } = {}) {
  signal.throwIfAborted();
  const folder = mkdtempSync(join(tmpdir(), "molis-first-screen-rows-")), rowsFile = join(folder, "rows.json"), pagesFile = join(folder, "pages.json");
  try {
    writeFileSync(rowsFile, JSON.stringify(rows));
    const child = spawn(execPath, [script, "--measure", rowsFile, "--pages", pagesFile, "--root", root], { stdio: ["ignore", "inherit", "pipe"], signal, killSignal: "SIGTERM" });
    const err = [];
    child.stderr.on("data", chunk => err.push(chunk));
    const [code, ended] = await once(child, "close");
    signal.throwIfAborted();
    if (code !== 0) throw new Error(`${root}: first-screen measurement exited ${code ?? ended}${err.length ? `\n${Buffer.concat(err).toString().trim()}` : ""}`);
    return JSON.parse(readFileSync(pagesFile, "utf8"));
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

export function firstScreenProblems(candidate, budgets, baseBudgets = null) {
  return { errors: firstScreenBudgetProblems(candidate, budgets, baseBudgets) };
}

async function main(signal) {
  const { values } = parseArgs({ options: {
    base: { type: "string", default: "origin/main" }, root: { type: "string" }, output: { type: "string" },
    report: { type: "boolean" }, json: { type: "boolean" }, measure: { type: "string" }, pages: { type: "string" },
  } });
  if (values.json && !values.report) throw new Error("--json goes with --report");
  const root = values.root ? resolve(values.root) : resolve(import.meta.dirname, "../..");
  if (values.measure) {
    if (!values.pages) throw new Error("--measure goes with --pages");
    const pages = await measureFirstScreen(root, JSON.parse(readFileSync(values.measure, "utf8")), signal);
    signal.throwIfAborted();
    writeFileSync(values.pages, JSON.stringify(pages));
    return;
  }
  const rows = readManifest(root);
  if (values.report) {
    const pages = await measureFirstScreen(root, currentRows(rows), signal);
    signal.throwIfAborted();
    if (values.json) console.log(JSON.stringify(pages, null, 2));
    else for (const [key, page] of Object.entries(pages)) console.log(`${key}: ${page.totals.cold} B cold, ${page.totals.warm} B warm`);
    return;
  }

  const sha = git(root, "merge-base", "HEAD", values.base);
  if (!sha) throw new Error(`no merge-base for HEAD and ${values.base}`);
  const budgets = readBudgets(root);
  const baseBudgets = readBaseBudgets(root, sha);
  const manifests = comparisonRows(readManifestAtCommit(root, sha), rows);
  const baseKey = firstScreenMeasurementKey(manifests.base);
  const cached = await cachedFirstScreenMeasurement({ sha, key: baseKey, signal });
  const base = cached?.pages ?? null;
  const candidate = await measureFirstScreenApart(root, manifests.candidate, signal);
  signal.throwIfAborted();
  const result = firstScreenProblems(candidate, budgets, baseBudgets);
  const lines = [`First-screen budgets (base ${sha.slice(0, 8)}${base ? ", CI artifact delta" : ""})`];
  for (const [key, measured] of Object.entries(candidate)) {
    const pageId = key.split("/")[0];
    const limit = budgets.firstScreen[pageId];
    const info = limit ? "" : " (report only)";
    const parts = VISITS.map((visit) => {
      const prev = base?.[key]?.totals?.[visit];
      const delta = prev !== undefined ? ` (base ${prev})` : "";
      return `${visit} ${measured.totals[visit]}${limit ? ` / ${limit[visit]}` : ""} B${delta}`;
    });
    lines.push(`${key}${info}: ${parts.join(", ")}`);
  }
  const removed = removedManifestRows(manifests.base, manifests.candidate);
  if (removed.length) lines.push("First-screen entries removed or narrowed; review with the browser report", ...removed.map(row => `- ${row}`));
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### First-screen budgets\n\n\`\`\`text\n${lines.join("\n")}\n\`\`\`\n`);
  if (result.errors.length) {
    console.error(`First-screen budgets failed:\n- ${result.errors.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("First-screen budgets passed");
    if (values.output) {
      if (git(root, "status", "--porcelain", "--untracked-files=no")) throw new Error("CI artifact requires a clean tracked checkout");
      const head = git(root, "rev-parse", "HEAD");
      const candidateKey = firstScreenMeasurementKey(manifests.candidate);
      const file = resolve(values.output);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ sha: head, key: candidateKey, pages: candidate }));
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `artifact=first-screen-${head}-${candidateKey}\n`);
    }
  }
}

if (isMainScript(import.meta.url)) {
  const stop = new AbortController();
  const interrupt = () => { process.exitCode ||= 130; stop.abort(new Error("first-screen check interrupted")); };
  const terminate = () => { process.exitCode ||= 143; stop.abort(new Error("first-screen check terminated")); };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try { await main(stop.signal); }
  catch (error) { console.error(error.message); process.exitCode ||= 2; }
  finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); }
}
