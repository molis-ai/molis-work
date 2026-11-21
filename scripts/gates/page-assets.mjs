#!/usr/bin/env node
// Batch 100-2 (Decision 58): route / surface total payload budgets (covering workbench, arrival, settings,
// plugin iframe runtime, plugin packs, /desktop/pty-client.js and fonts) with merge-base budget ratchet.
// --report [--json] measures served paths without enforcing budgets.
// --sizes / --base-sizes / --budgets are explicit fixture hooks; CI never supplies them.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetBudgetProblems, routeTotals, sizeMap } from "./page-assets-policy.mjs";
import { cachedMeasurement, git, measure, measurementKey, readBaseBudgets, readBudgets } from "./page-assets-baseline.mjs";

const options = {}, flags = new Set();
const abort = new AbortController();
const cancel = () => abort.abort();
process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
try {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const [name, inline] = args[index].split(/=(.*)/s);
    if (["--report", "--json"].includes(name)) flags.add(name);
    else if (["--base", "--root", "--sizes", "--base-sizes", "--budgets", "--output"].includes(name)) {
      const value = inline ?? args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
      options[name.slice(2)] = value;
    } else throw new Error(`unknown argument ${args[index]}; use --base <ref> or --report [--json]`);
  }
  if (flags.has("--json") && !flags.has("--report")) throw new Error("--json goes with --report");
  const root = options.root ? path.resolve(options.root) : fileURLToPath(new URL("../../", import.meta.url));
  const fixture = (file) => ({ measured: sizeMap(JSON.parse(readFileSync(file, "utf8")), file), gzip: {}, misses: [] });
  let base = null, sha = "", key = "", budgets = null, baseBudgets = null;
  if (!flags.has("--report")) {
    budgets = readBudgets(root, options.budgets);
    if (options.base) {
      sha = git(root, "merge-base", "HEAD", options.base);
      baseBudgets = readBaseBudgets(root, sha);
    } else {
      try {
        sha = git(root, "merge-base", "HEAD", "origin/main");
        baseBudgets = readBaseBudgets(root, sha);
      } catch {
        // Standalone fixture roots without origin/main still validate route ceilings directly.
      }
    }
    if (options["base-sizes"]) base = fixture(options["base-sizes"]);
    else if (sha) {
      key = measurementKey();
      base = await cachedMeasurement({ sha, key, signal: abort.signal });
    }
  }
  const result = options.sizes ? fixture(options.sizes) : await measure(root, Object.keys(base?.measured ?? {}), abort.signal);
  if (flags.has("--report")) {
    if (flags.has("--json")) console.log(JSON.stringify({ ...result, discoveryMisses: result.misses }, null, 2));
    else {
      console.log(`Page assets: ${Object.keys(result.measured).length} served paths`);
      for (const [asset, bytes] of Object.entries(result.measured)) console.log(`${bytes} bytes (gzip ${result.gzip[asset] ?? "-"}) ${asset}`);
    }
    if (result.misses.length) process.exitCode = 1;
  } else {
    const { totals } = routeTotals(result.measured, budgets);
    for (const [name, rule] of Object.entries(budgets.routes)) {
      console.log(`route ${name}: ${totals[name] ?? 0} / ${rule.maxBytes} B`);
    }
    if (base) {
      for (const [asset, bytes] of Object.entries(result.measured)) {
        const delta = bytes - (base.measured[asset] ?? 0);
        if (delta) console.log(`${asset}: ${base.measured[asset] ?? 0} → ${bytes} (${delta > 0 ? "+" : ""}${delta} bytes)`);
      }
    }
    const errors = [
      ...result.misses.map((asset) => `${asset}: still served but route not found in the host source`),
      ...assetBudgetProblems(result.measured, budgets, baseBudgets),
    ];
    if (errors.length) {
      console.error(`Page asset budgets failed${sha ? ` (base ${sha.slice(0, 8)})` : ""}:\n- ${errors.join("\n- ")}`);
      process.exitCode = 1;
    } else {
      console.log(`Page asset budgets passed${sha ? ` (base ${sha.slice(0, 8)})` : ""}; ${Object.keys(result.measured).length} assets across ${Object.keys(budgets.routes).length} routes`);
      if (options.output) {
        if (options.sizes || options["base-sizes"]) throw new Error("fixture sizes cannot produce a CI artifact");
        if (git(root, "status", "--porcelain", "--untracked-files=no")) throw new Error("CI artifact requires a clean tracked checkout");
        const head = git(root, "rev-parse", "HEAD");
        const artifactKey = key || measurementKey();
        const file = path.resolve(options.output);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify({ sha: head, key: artifactKey, ...result }));
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `artifact=page-assets-${head}-${artifactKey}\n`);
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 2; }
finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
