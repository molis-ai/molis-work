#!/usr/bin/env node
// Page resource budget (specs/repository-anti-corruption §4.8/§4.13, slice W1-07, decision #17): the workbench's
// stylesheets and scripts, the plugin client packs and the fonts are frozen at the size they have now and may only fall.
// The real per-asset targets are set after the superseded skins are deleted; until then nothing may grow.
//
// What is measured is what the host sends: every `/assets/...` path that apps/local-host/src/web-assets.ts serves
// (`serveWorkbenchAsset`), requested from the built `createLocalWebAssets`, with the byte length of the body. The host
// sends these uncompressed (it sets no content-encoding), so the raw length is what a page pulls. It needs the built
// output of the workspace (`pnpm workspace:build`, which CI has already run when this step comes).
//
//   node scripts/gates/page-assets.mjs                  measure and compare with tooling/gates/page-assets.json
//   node scripts/gates/page-assets.mjs --base <ref>     also compare that file with the merge-base's copy: a budget that
//                                                       was raised, or added, relative to the merge-base fails. CI runs
//                                                       this form (the same merge-base `scripts/ci-health-base.mjs` picks
//                                                       for the health gates).
//   --update                      write the budget file from the measurement; refuses when anything grew (with --base:
//                                 relative to the merge-base). The first run, with no file yet, writes the freeze.
//   --report [--json]             print every asset: bytes, gzip bytes, budget
//   --root <dir>                  gate another repository root (tests/page-assets-budget.test.ts)
//   --sizes <file>                test hook: take { "<path>": <bytes> } from a JSON file instead of the built output
// Exit codes: 0 passed, 1 a gate failed, 2 the command or the environment is unusable (a missing build is exit 2, never a pass).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const USAGE = "usage: page-assets.mjs [--base <ref>] [--update] [--report [--json]] [--root <dir>] [--sizes <file>]";
const fail = (message) => { console.error(message); process.exit(2); };

// ---- command line ---------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const options = {};
const flags = new Set();
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (["--update", "--report", "--json"].includes(name)) flags.add(name);
  else if (["--base", "--root", "--sizes"].includes(name)) {
    const value = inline ?? args[++index];
    if (!value || value.startsWith("--")) fail(`${name} needs a value\n${USAGE}`);
    options[name.slice(2)] = value;
  } else fail(`unknown argument ${args[index]}\n${USAGE}`);
}
if (flags.has("--json") && !flags.has("--report")) fail(`--json goes with --report\n${USAGE}`);
const update = flags.has("--update"), report = flags.has("--report");
const root = options.root ? path.resolve(options.root) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUDGET_FILE = "tooling/gates/page-assets.json";
const budgetPath = path.join(root, BUDGET_FILE);
const NOTE = "Only decreases. The size in bytes of each asset the host sends under /assets/ (the body as served, uncompressed), "
  + "measured from the built workspace by scripts/gates/page-assets.mjs. Lower it with "
  + "`node scripts/gates/page-assets.mjs --update --base origin/main` in the PR that shrinks an asset. CI compares this file with "
  + "the merge-base's copy, so raising a number or adding an asset here is refused. Frozen by decision #17; the real targets are "
  + "set after the superseded skins are deleted (specs/repository-anti-corruption).";

const git = (gitArgs) => {
  try { return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { return fail(`git ${gitArgs.join(" ")} failed in ${root}: ${String(error.stderr ?? error.message).trim()}`); }
};
const gitMaybe = (gitArgs) => { try { return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

// ---- the budget file -------------------------------------------------------------------------------------------------
const parseBudget = (text, where) => {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return fail(`${where} is not valid JSON`); }
  const assets = parsed?.assets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) return fail(`${where} needs an "assets" object of { "/assets/...": bytes }`);
  for (const [asset, bytes] of Object.entries(assets)) {
    if (!asset.startsWith("/assets/")) return fail(`${where}: "${asset}" is not an /assets/ path`);
    if (!Number.isInteger(bytes) || bytes <= 0) return fail(`${where}: "${asset}" needs a positive whole number of bytes`);
  }
  return assets;
};

// ---- what the host serves --------------------------------------------------------------------------------------------
// The paths come from the host's own source, so a route added there is measured and needs a budget without anyone
// updating a list here; the plugin packs come from the registered workbench packs, as the host serves them.
const PLUGIN_PACK_PREFIX = "/assets/molis-work-plugins/";
const ROUTES_SOURCE = "apps/local-host/src/web-assets.ts";
const distModule = async (file, what) => {
  const full = path.join(root, file);
  if (!existsSync(full)) return fail(`${file} is missing (${what}); build the workspace first: pnpm workspace:build`);
  // Importing the workbench loads node:sqlite through the plugin packages, which prints an experimental-feature warning.
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
    if (type !== "ExperimentalWarning") return emit.call(process, warning, ...rest);
  };
  try { return await import(pathToFileURL(full).href); } finally { process.emitWarning = emit; }
};
const fakeRequest = () => ({ method: "GET", headers: {} });
const fakeResponse = () => {
  const sent = { status: 0, body: undefined };
  return { sent, writeHead(status) { sent.status = status; }, end(body) { sent.body = body; } };
};
const bodyBytes = (body) => (typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body));

async function measureServed() {
  const sourcePath = path.join(root, ROUTES_SOURCE);
  if (!existsSync(sourcePath)) return fail(`${ROUTES_SOURCE} is missing; the gate reads the host's asset routes there`);
  const source = readFileSync(sourcePath, "utf8");
  const paths = [...new Set([...source.matchAll(/"(\/assets\/[^"\s]+)"/g)].map((match) => match[1]))].sort();
  if (!paths.length) return fail(`${ROUTES_SOURCE} names no "/assets/..." route any more; update scripts/gates/page-assets.mjs to the new place the host declares them`);
  if (!source.includes("molis-work-plugins")) return fail(`${ROUTES_SOURCE} no longer serves plugin packs under ${PLUGIN_PACK_PREFIX}; update scripts/gates/page-assets.mjs`);

  const assetsModule = await distModule("apps/local-host/dist/web-assets.js", "the host's asset server");
  const pageAssets = await distModule("apps/workbench/dist/page-assets.js", "the workbench stylesheets and client script");
  const packsModule = await distModule("apps/workbench/dist/plugin-workbench.js", "the registered plugin packs");
  if (typeof assetsModule.createLocalWebAssets !== "function") return fail("apps/local-host/dist/web-assets.js no longer exports createLocalWebAssets");
  for (const name of ["renderMolisWorkWorkbenchStylesheet", "renderMolisWorkWorkbenchClientScript", "renderMolisWorkArrivalStylesheet", "renderMolisWorkSettingsStylesheet"]) {
    if (typeof pageAssets[name] !== "function") return fail(`apps/workbench/dist/page-assets.js no longer exports ${name}`);
  }
  if (!Array.isArray(packsModule.BUILTIN_PLUGIN_WORKBENCH)) return fail("apps/workbench/dist/plugin-workbench.js no longer exports BUILTIN_PLUGIN_WORKBENCH");

  const { renderMolisWorkWorkbenchStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet } = pageAssets;
  const served = assetsModule.createLocalWebAssets({
    ptyClientFilePath: () => path.join(root, "dist/web/pty-client.js"),
    renderer: { renderMolisWorkWorkbenchStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet },
  });
  const packPaths = packsModule.BUILTIN_PLUGIN_WORKBENCH.filter((pack) => pack.clientFactory).map((pack) => `${PLUGIN_PACK_PREFIX}${pack.project_plugin_id}.js`);
  const measured = {};
  const gzip = {};
  for (const asset of [...new Set([...paths, ...packPaths])]) {
    const response = fakeResponse();
    const handled = served.serveWorkbenchAsset(fakeRequest(), response, asset);
    if (!handled || response.sent.status !== 200 || response.sent.body === undefined) {
      return fail(`the host does not serve ${asset} from this build (handled ${handled}, status ${response.sent.status}); is the workspace fully built? pnpm workspace:build`);
    }
    const bytes = bodyBytes(response.sent.body);
    measured[asset] = bytes.length;
    gzip[asset] = gzipSync(bytes, { level: 9 }).length;
  }
  return { measured, gzip };
}

async function measure() {
  if (!options.sizes) return measureServed();
  let sizes;
  try { sizes = JSON.parse(readFileSync(path.resolve(options.sizes), "utf8")); } catch { return fail(`--sizes ${options.sizes} is not a readable JSON file`); }
  parseBudget(JSON.stringify({ assets: sizes }), `--sizes ${options.sizes}`);
  return { measured: sizes, gzip: {} };
}

// ---- the rules -------------------------------------------------------------------------------------------------------
// head: what the build measures against the committed budget. The budget must be exactly what the build measures, so a
// shrink that did not lower its number is caught too (the next PR could otherwise grow back into the slack).
const headErrors = (measured, budget) => {
  const errors = [];
  for (const asset of [...new Set([...Object.keys(measured), ...Object.keys(budget)])].sort()) {
    const bytes = measured[asset], allowed = budget[asset];
    if (allowed === undefined) errors.push(`${asset} (${bytes} bytes) has no budget in ${BUDGET_FILE}; budgets only fall, so a new asset is refused: serve less, or fold it into an existing asset`);
    else if (bytes === undefined) errors.push(`${asset} has a budget but the host no longer serves it; remove the entry from ${BUDGET_FILE} (removing is always allowed)`);
    else if (bytes > allowed) errors.push(`${asset} grew: budget ${allowed} → built ${bytes} bytes (+${bytes - allowed}); make the page lighter, the budget cannot be raised`);
    else if (bytes < allowed) errors.push(`${asset} is ${allowed - bytes} bytes under its budget (${allowed} → built ${bytes}); lower the budget with \`node scripts/gates/page-assets.mjs --update --base origin/main\` so the slack cannot be used again`);
  }
  return errors;
};
// base: the budget file against the merge-base's. Raising a number, or adding an asset, is the laundering move.
const baseErrors = (budget, base) => {
  const errors = [];
  for (const [asset, allowed] of Object.entries(budget)) {
    if (base[asset] === undefined) errors.push(`${BUDGET_FILE} adds ${asset} (${allowed} bytes), which the merge-base did not budget; budgets only fall and no asset may be added`);
    else if (allowed > base[asset]) errors.push(`${BUDGET_FILE} raises the budget of ${asset} ${base[asset]} → ${allowed}; budgets only fall`);
  }
  return errors;
};
// update: nothing may grow relative to the reference (the merge-base's budget, else the committed one); a missing
// reference is the first freeze.
const growthErrors = (measured, reference) => Object.entries(measured).flatMap(([asset, bytes]) => {
  if (reference[asset] === undefined) return [`${asset} (${bytes} bytes) has no budget to lower`];
  return bytes > reference[asset] ? [`${asset} grew ${reference[asset]} → ${bytes}`] : [];
});

// ---- the merge-base's budget -----------------------------------------------------------------------------------------
let mergeBase = "";
let baseBudget = null;
const notes = [];
if (options.base) {
  const target = gitMaybe(["rev-parse", "--verify", "--quiet", `${options.base}^{commit}`]);
  if (!target) fail(`--base ${options.base} is not a commit in this clone; fetch it first (CI: scripts/ci-health-base.mjs does)`);
  mergeBase = gitMaybe(["merge-base", "HEAD", target]);
  if (!mergeBase) fail(`HEAD and ${options.base} share no history in this clone; fetch the full history`);
  // Only a clean answer that the file is not in the merge-base's tree (before this gate existed) skips the comparison;
  // an unreadable tree or blob is an error, never a pass.
  if (git(["ls-tree", "--name-only", mergeBase, "--", BUDGET_FILE]).trim()) {
    baseBudget = parseBudget(git(["cat-file", "blob", `${mergeBase}:${BUDGET_FILE}`]), `${mergeBase.slice(0, 8)}:${BUDGET_FILE}`);
  } else notes.push(`the merge-base has no ${BUDGET_FILE}, so the budget was not compared with it`);
}
const against = mergeBase ? `merge-base ${mergeBase.slice(0, 8)} (${options.base})` : BUDGET_FILE;
const budgetNow = () => {
  if (!existsSync(budgetPath)) return fail(`${budgetPath} is missing; create the freeze with --update`);
  return parseBudget(readFileSync(budgetPath, "utf8"), budgetPath);
};

const { measured, gzip } = await measure();
const total = Object.values(measured).reduce((sum, bytes) => sum + bytes, 0);
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

// ---- --report --------------------------------------------------------------------------------------------------------
if (report) {
  const budget = existsSync(budgetPath) ? budgetNow() : {};
  const rows = Object.keys(measured).sort((a, b) => measured[b] - measured[a] || a.localeCompare(b));
  if (flags.has("--json")) {
    console.log(JSON.stringify({ mergeBase: mergeBase || null, measured, gzip, budget, baseBudget }, null, 2));
    process.exit(0);
  }
  console.log(`Page assets: ${rows.length} served paths, ${total} bytes (${kib(total)}) in total; against ${against}`);
  console.log(`  ${"bytes".padStart(9)}${"gzip".padStart(9)}${"budget".padStart(10)}${baseBudget ? "      base" : ""}  path`);
  for (const asset of rows) {
    console.log(`  ${String(measured[asset]).padStart(9)}${(gzip[asset] ? String(gzip[asset]) : "-").padStart(9)}${String(budget[asset] ?? "none").padStart(10)}${baseBudget ? String(baseBudget[asset] ?? "none").padStart(10) : ""}  ${asset}`);
  }
  process.exit(0);
}

// ---- --update --------------------------------------------------------------------------------------------------------
if (update) {
  const reference = baseBudget ?? (!mergeBase && existsSync(budgetPath) ? budgetNow() : null);
  if (reference) {
    const errors = growthErrors(measured, reference);
    if (errors.length) {
      console.error(`Budget not written: something grew relative to ${baseBudget ? against : BUDGET_FILE}:\n- ${errors.join("\n- ")}`);
      process.exit(1);
    }
  }
  const assets = Object.fromEntries(Object.keys(measured).sort().map((asset) => [asset, measured[asset]]));
  mkdirSync(path.dirname(budgetPath), { recursive: true });
  writeFileSync(budgetPath, `${JSON.stringify({ note: NOTE, assets }, null, 2)}\n`);
  console.log(`page asset budget written: ${Object.keys(assets).length} assets, ${total} bytes`);
  process.exit(0);
}

// ---- the verdict -----------------------------------------------------------------------------------------------------
const budget = budgetNow();
const errors = [...headErrors(measured, budget), ...(baseBudget ? baseErrors(budget, baseBudget) : [])];
if (errors.length) {
  console.error(`Page asset budgets failed against ${against}:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Page asset budgets passed against ${against} (${Object.keys(measured).length} assets, ${total} bytes).${notes.length ? ` Note: ${notes.join("; ")}.` : ""}`);
