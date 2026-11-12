#!/usr/bin/env node
// FSS-BG-01–05. Real read-only HTTP samples on the merge-base and candidate builds, with no absolute limits.
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { isMainScript } from "../script-paths.mjs";
import { LOCALES, withFirstScreenHost } from "../first-screen/host.mjs";
import { sampleFirstScreen } from "../first-screen/http.mjs";
import { GATED_PAGES, MEASURED_PAGES, comparisonRows, currentRows, firstScreenApprovalPath, readManifest, registeredPaths, removedManifestRows, requestKey } from "../first-screen/manifest.mjs";
import { allowanceFiles, git, withBuiltBaseline } from "./page-assets-baseline.mjs";
import { VISITS, readNewAllowances } from "./page-assets-policy.mjs";

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
      const packs = new Set();
      for (const [path, size] of Object.entries(next.entries)) {
        const approvalPath = firstScreenApprovalPath(path, locale);
        if (approvalPath !== path) {
          if (packs.has(approvalPath)) errors.push(`${key} ${path}: multiple paths for ${approvalPath}`);
          packs.add(approvalPath);
        }
        const before = old.entries[path];
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
    base: { type: "string", default: "origin/main" }, root: { type: "string" },
    report: { type: "boolean" }, json: { type: "boolean" },
  } });
  if (values.json && !values.report) throw new Error("--json goes with --report");
  const root = values.root ? resolve(values.root) : resolve(import.meta.dirname, "../..");
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
  const { base, manifests } = await withBuiltBaseline(root, sha, signal, async checkout => {
    const manifests = comparisonRows(readManifest(checkout, { optional: true }), rows);
    const base = await measureFirstScreen(checkout, manifests.base, signal);
    return { base, manifests };
  }, { build: "build", offline: process.env.CI !== "true" });
  const candidate = await measureFirstScreen(root, manifests.candidate, signal);
  signal.throwIfAborted();
  const result = firstScreenProblems(base, candidate, allowances.current, allowances.previous);
  const lines = [`First-screen budgets against ${sha} (isolated Host builds)`];
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
  } else console.log("First-screen budgets passed");
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
