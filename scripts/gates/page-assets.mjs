#!/usr/bin/env node
// CCR-02–07. Compare actual served bytes with the actual merge-base build; no committed absolute budget.
// --report [--json] only measures. --base defaults to origin/main. --output writes the trusted CI measurement artifact.
// --sizes / --base-sizes are explicit fixture hooks; CI never supplies them. No --update: shrinking needs no ledger edit.
// Route-reading limits are documented in page-assets-measure.mjs and docs/cli-and-development.md.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assetProblems, sizeMap } from "./page-assets-policy.mjs";
import { allowanceFiles, git, measurementKey, cachedMeasurement, buildBaseline, measure } from "./page-assets-baseline.mjs";

const options = {}, flags = new Set();
const abort = new AbortController();
const cancel = () => abort.abort();
process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
try {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index++) {
    const [name, inline] = args[index].split(/=(.*)/s);
    if (["--report", "--json"].includes(name)) flags.add(name);
    else if (["--base", "--root", "--sizes", "--base-sizes", "--output"].includes(name)) {
      const value = inline ?? args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
      options[name.slice(2)] = value;
    } else throw new Error(`unknown argument ${args[index]}; use --base <ref> or --report [--json]`);
  }
  if (flags.has("--json") && !flags.has("--report")) throw new Error("--json goes with --report");
  const root = options.root ? path.resolve(options.root) : fileURLToPath(new URL("../../", import.meta.url));
  const fixture = file => ({ measured: sizeMap(JSON.parse(readFileSync(file, "utf8")), file), gzip: {}, misses: [] });
  let base, sha, key, current = {}, previous = {}, source = "fixture";
  if (!flags.has("--report")) {
    sha = git(root, "merge-base", "HEAD", options.base ?? "origin/main");
    ({ current, previous } = allowanceFiles(root, sha));
    if (options["base-sizes"]) base = fixture(options["base-sizes"]);
    else {
      key = measurementKey();
      base = await cachedMeasurement({ sha, key, signal: abort.signal }); source = "CI artifact";
      if (!base) {
        source = "isolated build";
        // workspace:build acquires the shared machine slot itself; cancellation kills only this child process group.
        base = await buildBaseline(root, sha, abort.signal);
      }
      if (base.misses.length) throw new Error("base asset route discovery missed served paths");
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
    for (const [asset, bytes] of Object.entries(result.measured)) {
      const delta = bytes - (base.measured[asset] ?? 0);
      if (delta) console.log(`${asset}: ${base.measured[asset] ?? 0} → ${bytes} (${delta > 0 ? "+" : ""}${delta} bytes)`);
    }
    const errors = [...result.misses.map(asset => `${asset}: still served but route not found in the host source`), ...assetProblems(result.measured, base.measured, current, previous)];
    if (errors.length) { console.error(`Page asset budgets failed against ${sha} (${source}):\n- ${errors.join("\n- ")}`); process.exitCode = 1; }
    else {
      console.log(`Page asset budgets passed against ${sha} (${source}); ${Object.keys(result.measured).length} assets`);
      if (options.output) {
        if (options.sizes || options["base-sizes"]) throw new Error("fixture sizes cannot produce a CI artifact");
        if (git(root, "status", "--porcelain", "--untracked-files=no")) throw new Error("CI artifact requires a clean tracked checkout");
        const head = git(root, "rev-parse", "HEAD");
        const file = path.resolve(options.output); mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, JSON.stringify({ sha: head, key: key ?? measurementKey(), ...result }));
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `artifact=page-assets-${head}-${key}\n`);
      }
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 2; }
finally { process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel); }
