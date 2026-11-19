#!/usr/bin/env node
// FSS-BG-01–05. Real read-only HTTP samples on the merge-base and candidate builds, with no absolute limits.
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
import { GATED_PAGES, MANIFEST, MEASURED_PAGES, comparisonRows, currentRows, firstScreenApprovalPath, parseManifest, readManifest, registeredPaths, removedManifestRows, requestKey } from "../first-screen/manifest.mjs";
import { allowanceFiles, git, trustedRun, withBuiltBaseline } from "./page-assets-baseline.mjs";
import { VISITS, readNewAllowances } from "./page-assets-policy.mjs";

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
    // Cache access is optional; the isolated Host build fallback below always enforces the gate.
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
 * One build's measurement in a child process of its own, run by this checker (the candidate's) against that build's root. A build's
 * Host installs process-wide state as it starts (the UI text context, one per build), so two builds seeded in one process refuse
 * each other: the second build's plugins would fail to start and its sample project could not be made.
 */
export async function measureFirstScreenApart(root, rows, signal, { execPath = process.execPath, script = import.meta.filename } = {}) {
  signal.throwIfAborted();
  // The pages go to a file, not stdout: what the Host and its build print on the way stays the child's own output.
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

function entryApprovals(records, page, locale, measured) {
  const approvals = new Map();
  const resolvePath = path => path === "<page>" ? measured.path ?? path
    : measured.project ? path.replaceAll("<project>", measured.project) : path;
  for (const [file, record] of records) {
    for (const row of record.entryApprovals ?? []) {
      if (!row.pages.includes(page) || (row.locale !== "both" && row.locale !== locale)) continue;
      const source = row.document ?? (row.response ? "<page>" : undefined);
      const path = requestKey(resolvePath(row.entry), source === undefined ? undefined : resolvePath(source), row.response);
      const key = `${row.change} ${path}`;
      approvals.set(key, [...(approvals.get(key) ?? []), file]);
    }
  }
  return approvals;
}

export function firstScreenProblems(base, candidate, current, previous) {
  const { errors, records } = readNewAllowances(current, previous);
  const draft = { reason: "", review: "", pages: {} };
  const approvalRows = [];
  for (const page of GATED_PAGES) {
    for (const locale of LOCALES) {
      const key = `${page}/${locale}`;
      const old = base[key], next = candidate[key];
      if (!old || !next) { errors.push(`${key}: incomplete page measurement`); continue; }
      const pageAllowances = records.filter(([, record]) => Object.hasOwn(record.pages ?? {}, key));
      const approvals = entryApprovals(records, page, locale, next);
      const oldByApproval = new Map();
      for (const [oldPath, oldSize] of Object.entries(old.entries)) {
        const oldApprovalPath = firstScreenApprovalPath(oldPath, locale);
        if (oldApprovalPath !== oldPath && !oldByApproval.has(oldApprovalPath)) {
          oldByApproval.set(oldApprovalPath, oldSize);
        }
      }
      const packs = new Set();
      for (const [path, size] of Object.entries(next.entries)) {
        const approvalPath = firstScreenApprovalPath(path, locale);
        if (approvalPath !== path) {
          if (packs.has(approvalPath)) errors.push(`${key} ${path}: multiple paths for ${approvalPath}`);
          packs.add(approvalPath);
        }
        const before = old.entries[path] ?? (approvalPath !== path ? oldByApproval.get(approvalPath) : undefined);
        const large = before && VISITS.some(visit => size[visit] - before[visit] > 10_000);
        if (before && !large) continue;
        const reason = before ? "growth over 10 KB" : "new entry";
        const matches = approvals.get(`${before ? "growth" : "new"} ${approvalPath}`);
        approvalRows.push(`${key} ${path} (${reason}): ${matches?.join(", ") || "missing userApproval"}`);
        if (!matches) {
          errors.push(`${key} ${path}: ${reason} requires userApproval`);
        }
      }
      const needed = { cold: 0, warm: 0 };
      for (const visit of VISITS) {
        const delta = next.totals[visit] - old.totals[visit];
        const allowed = pageAllowances.reduce((sum, [, record]) => sum + record.pages[key][visit], 0);
        if (!Number.isSafeInteger(allowed)) {
          errors.push(`${key} ${visit}: allowances exceed the supported byte range`);
        } else if (delta > allowed) {
          errors.push(`${key} ${visit} grew ${old.totals[visit]} → ${next.totals[visit]} (+${delta}); new allowances cover ${allowed} bytes`);
          needed[visit] = delta - allowed;
        }
      }
      if (needed.cold || needed.warm) draft.pages[key] = needed;
    }
  }
  return { errors, approvalRows, draft };
}

async function main(signal) {
  const { values } = parseArgs({ options: {
    base: { type: "string", default: "origin/main" }, root: { type: "string" }, output: { type: "string" },
    report: { type: "boolean" }, json: { type: "boolean" }, measure: { type: "string" }, pages: { type: "string" },
  } });
  if (values.json && !values.report) throw new Error("--json goes with --report");
  const root = values.root ? resolve(values.root) : resolve(import.meta.dirname, "../..");
  if (values.measure) {
    // A child of measureFirstScreenApart: one build, its rows from the parent, the pages as JSON in the file it names.
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
  const allowances = allowanceFiles(root, sha);
  const manifests = comparisonRows(readManifestAtCommit(root, sha), rows);
  const baseKey = firstScreenMeasurementKey(manifests.base);
  const cached = await cachedFirstScreenMeasurement({ sha, key: baseKey, signal });
  let base, source;
  if (cached) {
    base = cached.pages;
    source = "CI artifact";
  } else {
    source = "isolated Host builds";
    base = await withBuiltBaseline(root, sha, signal, async checkout => {
      const checkoutManifests = comparisonRows(readManifest(checkout, { optional: true }), rows);
      return measureFirstScreenApart(checkout, checkoutManifests.base, signal);
    }, { build: "build", offline: process.env.CI !== "true" });
  }
  const candidate = await measureFirstScreenApart(root, manifests.candidate, signal);
  signal.throwIfAborted();
  const result = firstScreenProblems(base, candidate, allowances.current, allowances.previous);
  const lines = [`First-screen budgets against ${sha} (${source})`];
  for (const [key, measured] of Object.entries(candidate)) {
    const info = key.startsWith("workbench-demo/") ? " (report only)" : "";
    lines.push(`${key}${info}: ${VISITS.map(visit => `${visit} ${base[key].totals[visit]} → ${measured.totals[visit]} B`).join(", ")}`);
  }
  const removed = removedManifestRows(manifests.base, manifests.candidate);
  if (removed.length) lines.push("First-screen entries removed or narrowed; review with the browser report", ...removed.map(row => `- ${row}`));
  if (result.approvalRows.length) lines.push("Entries requiring user approval", ...result.approvalRows.map(row => `- ${row}`));
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### First-screen budgets\n\n\`\`\`text\n${lines.join("\n")}\n\`\`\`\n`);
  if (result.errors.length) {
    console.error(`First-screen budgets failed:\n- ${result.errors.join("\n- ")}`);
    if (Object.keys(result.draft.pages).length) console.error(`Draft allowance for review\n${JSON.stringify(result.draft, null, 2)}`);
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
