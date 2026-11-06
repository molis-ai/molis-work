#!/usr/bin/env node
// Page resource budget (specs/archive/repository-anti-corruption §4.8/§4.13, slice W1-07, decision #17): the workbench's
// stylesheets and scripts, the plugin client packs and the fonts are frozen at the size they have now and by default only fall.
// The budget is a size control, not a hard ceiling (the user amended decision #17 on 2026-10-18): growth a feature needs and
// that cannot be won back in the same asset is admitted once through APPROVED_CEILINGS below, after review, with the reason,
// the bytes and what was tried written in the PR. More than 10 KB on one asset at once, or a new asset, is asked of the user
// first (AGENTS.md).
//
// What is measured is what the host sends: every `/assets/...` path that apps/local-host/src/web-assets.ts serves
// (`serveWorkbenchAsset`), requested from the built `createLocalWebAssets`, with the byte length of the body. The host
// sends these uncompressed (it sets no content-encoding), so the raw length is what a page pulls. It needs the built
// output of the workspace (`pnpm workspace:build`, which CI has already run when this step comes).
//
// The routes are read from the string literals in web-assets.ts ('…', "…" or `…`), and the plugin packs from the registered
// workbench packs. A reading of source can be missed by a refactor, and the budget must not depend on it: so every path
// the committed budget or the merge-base's budget names that the reading did not find is asked of the built host as well.
// If the host still sends it, it is measured and the run fails as a discovery miss, so deleting a budget entry together with
// the literal that named the route does not stop the asset from being measured, and a harmless rewrite of the routes does
// not silently blind the gate. A route compared with something that is not a literal (an imported constant), a
// `/assets/` mention the gate cannot read as a whole literal, or the word `assets` anywhere else in the file than inside a
// whole `/assets/…` string literal or the plugin pack pattern (a route spelled as a regular expression or with escaped
// slashes: `\/assets\/`, `[\/]assets`, `[/]assets`, `(assets)`), is exit 2: the gate cannot see what it would have to measure.
//
// Not covered, said here so nobody reads the gate as stronger than it is (spec §5a has the same list; AGENTS.md points here):
//  - Only apps/local-host/src/web-assets.ts is read. A route added in another host file is not seen, however it is spelled;
//    today only `serveWorkbenchAsset` there answers /assets/ (web-server.ts hands the request to it).
//  - A route spelled so that the word `assets` is not left in the text: two string halves concatenated, `\x2f`/`\u002f`
//    escapes, a path built at run time, or a regular expression that breaks the word itself (`asset[s]`, `a(?:ss)ets`),
//    and that is in no budget. A path that is in a budget is still asked of the host.
//  - The comparison check looks for the identifier `pathname`, the name web-assets.ts gives the request path. A route compared
//    through a renamed parameter with a constant imported from another file is not seen; a constant declared in
//    web-assets.ts itself is, because its literal is read.
//  - Bytes moved out of a measured asset into inline <style>/<script> in the page HTML are not measured (first-screen HTML
//    is not measured at all), and plugin client code that leaves /assets/molis-work-plugins/ for another place (Plugin
//    Runtime) leaves the budget with its entry, which removing is always allowed.
//  - The terminal client (dist/web/pty-client.js) is built by the root `pnpm build:pty-client`, which CI does not run.
//  - Sizes are measured on one platform at a time; they do not depend on locale, time or paths, but nothing here proves
//    that the CI machine builds the same bytes as a laptop: the first CI run on a PR that changes assets is the check.
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
  + "set after the superseded skins are deleted (specs/archive/repository-anti-corruption).";

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

// The `/assets/...` routes web-assets.ts declares, read from its string literals. Comments are dropped first. What the gate
// cannot read as a whole literal is refused rather than skipped, because a skipped route is a route nobody budgets.
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
// The one route the host spells as a regular expression: the plugin client packs, whose ids come from the registered
// workbench packs, not from this text. Any other `/assets/` spelled in a regex literal (`\/assets\/…`, `[/]assets`) is a
// route the string-literal reading cannot see: the escaped slashes are not a whole "/assets/" and do not raise the
// mention count below. (`"\/assets\/x"` in a plain string has the same escapes and is refused the same way.) So once the
// readable route literals and this pattern are taken out of the code, no word `assets` may be left, whatever sits around it
// (`[\/]assets`, `/(assets)/`, `assets\/`).
const PACK_ROUTE_PATTERN = String.raw`/^\/assets\/molis-work-plugins\/([a-z0-9-]+)\.(js|css)$/`;
const ROUTE_LITERAL = /(["'`])(\/assets\/[^"'`\s\\]+)\1/g;
const STRAY_ASSETS = /.{0,16}\bassets\b.{0,56}/i;
const COMPARE = "(?:[!=]==|[!=]=)(?!=)";
const NON_LITERAL_COMPARISONS = [new RegExp(`\\bpathname\\s*${COMPARE}\\s*(?!["'\`])\\S`), new RegExp(`(?<=[^\\s"'\`=!])\\s*${COMPARE}\\s*pathname\\b`)];
function declaredRoutes(source) {
  const code = withoutComments(source);
  const comparison = NON_LITERAL_COMPARISONS.map((pattern) => code.match(pattern)).find(Boolean);
  if (comparison) {
    return fail(`${ROUTES_SOURCE} compares the request path with something that is not a string literal (\`${comparison[0].trim()}\`), `
      + "so the gate cannot tell which asset that route sends and would not measure it; write the route as a string literal there, or teach scripts/gates/page-assets.mjs to read the new form");
  }
  const literals = [...code.matchAll(ROUTE_LITERAL)].map((match) => match[2]);
  const readable = literals.filter((literal) => !literal.includes("${"));
  const mentions = (code.match(/\/assets\//g) ?? []).length;
  if (mentions !== readable.length) {
    return fail(`${ROUTES_SOURCE} mentions "/assets/" ${mentions} times but only ${readable.length} of them are whole string literals the gate can read (a template with \${…}, a concatenation or a prefix is not one), `
      + "so a route may escape the budget; write each route as one string literal, or teach scripts/gates/page-assets.mjs to read the new form");
  }
  const unread = code.split(PACK_ROUTE_PATTERN).join(" ").replace(ROUTE_LITERAL, (whole, quote, literal) => (literal.includes("${") ? whole : " "));
  const stray = unread.match(STRAY_ASSETS);
  if (stray) {
    return fail(`${ROUTES_SOURCE} has the word "assets" outside a whole "/assets/…" string literal (\`${stray[0].trim()}\`): a route spelled as a regular expression or with escaped slashes, or some other use of the word; the only regular expression the gate knows is the plugin pack pattern ${PACK_ROUTE_PATTERN}; `
      + "a route spelled that way would not be measured; write it as a string literal, or teach scripts/gates/page-assets.mjs to read the new form");
  }
  return [...new Set(readable)].sort();
}

// probe: the paths the budgets name, whatever the reading found. `misses` are the probe paths the host does send although
// the reading of web-assets.ts did not find them.
async function measureServed(probe) {
  const sourcePath = path.join(root, ROUTES_SOURCE);
  if (!existsSync(sourcePath)) return fail(`${ROUTES_SOURCE} is missing; the gate reads the host's asset routes there`);
  const source = readFileSync(sourcePath, "utf8");
  const paths = declaredRoutes(source);
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
  if (typeof packsModule.pluginOnDemandStylesheet !== "function") return fail("apps/workbench/dist/plugin-workbench.js no longer exports pluginOnDemandStylesheet");

  const { renderMolisWorkWorkbenchStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet } = pageAssets;
  const served = assetsModule.createLocalWebAssets({
    ptyClientFilePath: () => path.join(root, "dist/web/pty-client.js"),
    renderer: { renderMolisWorkWorkbenchStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet },
  });
  const packPaths = [
    ...packsModule.BUILTIN_PLUGIN_WORKBENCH.filter((pack) => pack.clientFactory).map((pack) => `${PLUGIN_PACK_PREFIX}${pack.project_plugin_id}.js`),
    // A framed plugin's own sheet (PG-070): the rules of its namespace, sent only where its frame links it.
    ...packsModule.BUILTIN_PLUGIN_WORKBENCH.filter((pack) => packsModule.pluginOnDemandStylesheet(pack.project_plugin_id)).map((pack) => `${PLUGIN_PACK_PREFIX}${pack.project_plugin_id}.css`),
  ];
  const measured = {};
  const gzip = {};
  const ask = (asset) => {
    const response = fakeResponse();
    const handled = served.serveWorkbenchAsset(fakeRequest(), response, asset);
    return { handled, status: response.sent.status, bytes: handled && response.sent.status === 200 && response.sent.body !== undefined ? bodyBytes(response.sent.body) : null };
  };
  const record = (asset, bytes) => { measured[asset] = bytes.length; gzip[asset] = gzipSync(bytes, { level: 9 }).length; };
  const found = new Set([...paths, ...packPaths]);
  for (const asset of found) {
    const answer = ask(asset);
    if (!answer.bytes) {
      return fail(`the host does not serve ${asset} from this build (handled ${answer.handled}, status ${answer.status}); is the workspace fully built? pnpm workspace:build`);
    }
    record(asset, answer.bytes);
  }
  const misses = [];
  for (const asset of [...new Set(probe)].sort()) {
    if (found.has(asset)) continue;
    const answer = ask(asset);
    if (!answer.bytes) continue; // the host sends nothing for it: it is gone, and its entry may go with it
    record(asset, answer.bytes);
    misses.push(asset);
  }
  return { measured, gzip, misses };
}

async function measure(probe) {
  if (!options.sizes) return measureServed(probe);
  let sizes;
  try { sizes = JSON.parse(readFileSync(path.resolve(options.sizes), "utf8")); } catch { return fail(`--sizes ${options.sizes} is not a readable JSON file`); }
  parseBudget(JSON.stringify({ assets: sizes }), `--sizes ${options.sizes}`);
  return { measured: sizes, gzip: {}, misses: [] };
}

// ---- the rules -------------------------------------------------------------------------------------------------------
// head: what the build measures against the committed budget. The budget must be exactly what the build measures, so a
// shrink that did not lower its number is caught too (the next PR could otherwise grow back into the slack).
const headErrors = (measured, budget, base) => {
  const errors = [];
  for (const asset of [...new Set([...Object.keys(measured), ...Object.keys(budget)])].sort()) {
    const bytes = measured[asset], allowed = budget[asset];
    if (allowed === undefined && base?.[asset] !== undefined) errors.push(`${asset} (${bytes} bytes) is still sent by the host but its entry was deleted from ${BUDGET_FILE} (the merge-base budgets ${base[asset]} bytes); deleting an entry does not exempt an asset the host sends, restore it`);
    else if (allowed === undefined) errors.push(`${asset} (${bytes} bytes) has no budget in ${BUDGET_FILE}; budgets only fall, so a new asset is refused: serve less, or fold it into an existing asset`);
    else if (bytes === undefined) errors.push(`${asset} has a budget but the host no longer serves it; remove the entry from ${BUDGET_FILE} (removing is always allowed)`);
    else if (bytes > allowed) errors.push(`${asset} grew: budget ${allowed} → built ${bytes} bytes (+${bytes - allowed}); make the page lighter; growth a feature needs is admitted once through APPROVED_CEILINGS after review (AGENTS.md), never by raising the budget file`);
    else if (bytes < allowed) errors.push(`${asset} is ${allowed - bytes} bytes under its budget (${allowed} → built ${bytes}); lower the budget with \`node scripts/gates/page-assets.mjs --update --base origin/main\` so the slack cannot be used again`);
  }
  return errors;
};
// One-time admissions of small, necessary growth under the user's #17 rule: asset → [merge-base bytes, ceiling]. Each is
// deleted in the next change to this gate.
// Component board upgrade (DESIGN「皮肤」「Reading load」, 2026-10-30 to 11-03), approved by the user on 2026-11-03 over the 10 KB line.
// In all: arrival.css +10997 B, settings.css +9713 B, workbench.css +14784 B, workbench.js +765 B, coding.css +890 B.
// - The Tray and Pill skins (design-system styles/skins.ts, its toast rule) close each of the three page sheets, about +7.3 KB on
//   each; the page script reads, applies and follows the skin preference (the +765 B on workbench.js). The default components'
//   details (legible disabled buttons, field error glyphs, menu shortcuts and groups) add about +2.6 KB on each sheet.
// - The reading-load rules (DESIGN「Reading load」): outlined ghost buttons, one-line meta rows, the diff file list, the operation
//   card's target and impact chips and the input receipt's zones as containers in their own colours; workbench.css also carries
//   the diff view and receipts, and coding.css the one-line session row with its state chip. Record actions take their kind's
//   colour (read in the accent, delete in red); the frame header no longer thins its action to a text link, which saves 439 B. The mist palette and the soft-fog
//   defaults replace values and add next to nothing.
// Tried: each skin rule is written once over shared `--sk-*` tokens; the board's own samples stay inlined on the board page;
// the palette switch was removed from the board instead of shipped; the soft-fog commit's rewrite of buttons and badges is
// smaller than what it replaced; no new asset.
// BL-953 (A track): the home bar's input is a growing textarea, not a one-line input: arrival.css +132 B, workbench.css +132 B, settings.css
// +43 B (the phone rule). Tried: the field's own sizing comes from the shared data-fit rule, so only the bar's line height, ceiling and
// one-line prompt are written; the comments are not in the sheet.
// N53/N54 D half (#1811, admitted by the coordinator on 2026-11-05): pages stop sending reads that can only fail. plugin-frame.js
// +238 B: the frames a page mounts at once share one in-flight surfaces read per address, and a page with no project asks none;
// workbench.js +169 B: the fallback naming asks no surfaces without a project, and the attention poll stops at its first 404 per
// address. (The BL-952 and N53 entries these two replace are spent: the merge-base budget holds their ceilings.) Tried: the shared
// read is one Map with no expiry timer, the project check reads the body's existing data-project-id, no new helper or asset.
// BL-952 (2026-11-04): the selection reader skips headings inside a closed dialog or a hidden element, +56 B on workbench.js and on
// plugin-frame.js (the same reader). Tried: one `closest` test with a short selector, no feature check, no second path.
// WORK-03 (2026-11-05, explicitly approved by the user): product-local account forms and protected GET.
// Reuses existing controls and request helper, minifies the typed browser program, and adds no served asset.
// Exact growth: workbench.js +6876 B, plugin-frame.js +54 B, each stylesheet +452 B; see specs/unified-account/spec.md.
// WORK-04 (2026-11-05, explicitly approved by the user): provider window/native opener, cancellation and result polling.
// Reuses the same dialog, request helper and existing native bridge; minified into workbench.js, +1562 B more (8438 B total).
// WORK-05 (2026-11-05, explicitly approved by the user): profile and security forms share verification helpers, minified in the existing bundle. +8,994 bytes over 1,083,008; no other asset changes.
// WORK-06 (2026-11-05, explicitly approved by the user): tenant/member/platform forms reuse the account UI and pagination; +8,918 bytes over 1,092,002, minified in the same bundle with no new assets.
// WORK-07 (2026-11-05, explicitly approved by the user): subscription, seat and platform forms share cards, fields and error states; +10,408 bytes over 1,100,920, minified into the existing bundle. No other assets grow.
// WORK-08 (2026-11-05, explicitly approved by the user up to +2,374 bytes): entitlement sources reuse subscription UI and the request helper; final +2,340 bytes over 1,111,328 after removing invalid cross-batch revision comparison. Other assets unchanged.
// T-01 integration: rebase the already approved account deltas onto main a00f5ba1.
// The integrated measurement adds exactly the same account bytes: +410 / +452 / +39629 / +54.
// Upstream growth is already in main; this rebases the admission and grants no additional growth.
// K-07 (2026-11-06, explicitly approved): arrival side panels follow the stage grid above the wrapping bar.
// Scoped selectors were shortened; arrival.css adds exactly 273 B over 690296, with no new asset.
// Main #1747 reduced workbench.css by 4 B; preserve its approved +452 B on the new 1194521 B base.
// ASC-56 (第 13 批⑦, approved by the user on 2026-11-05): the model settings page fetches the models a service offers and lists
// them with the board's combobox to filter and pick. settings.css +271 B and workbench.css +271 B (header alignment, the picked mark,
// the listed name), workbench.js +2357 B (fetch, filter, pick, keyboard). These add on top of the account entries above, which
// share the same merge-base. Tried: the picker reuses `.model-field` and the board's combobox styles, the save and the fetch share
// one key helper, the list header needs no wrapper; a first cut was +754/+754/+3441.
// 07-S0 (workbench navigation specimens; 07 批评审台与 D 轨合审审过（#1852）): the README's new tab-strip, titlebar and
// three-zone bar classes ship in the product sheets so the 07 slices reuse them instead of redrawing.
// workbench.css +9705 B: tab tiers, the all-tabs and ＋ menus, gone/removed marks, the layout button's hairline, touch rules and
// the phone titlebar's strip (6422 B), the glyph row with its own tab and count (2736 B, glyph-tabs.ts) and the bar zones (547 B).
// arrival.css +3283 B: the same glyph row, which the arrival titlebar draws without the project page's tab rules, and the bar
// zones. settings.css +547 B: the bar zones through craft-finish. (The BL-953 entries for these three are spent: the merge-base
// budget holds their ceilings.) Tried: the board-only scaffolding stays inline on the board's frame page; the layout button is
// the ghost icon .mw-btn and "open beside" the switcher row's button, not classes of their own; the new class names drop the
// body.immersive-workbench prefix where no rule competes (it stays on the tab, group and toggle overrides); one class for the
// strip's text buttons and one per state for the glyph tab instead of repeated :is() lists; a rule duplicating the base tab
// weight removed; the three blocks are written without spaces after ':' and ';', as the host only strips comments and indentation.
// On main's base after ASC-56 (settings.css 826998, workbench.css 1194792) the account and ASC-56 entries for those two are spent,
// so 07-S0 keys its own there; arrival.css still shares the 689886 key with the account admission, and 07-S0's ceiling there
// also covers the account PR's +683 B. Whichever lands second moves its own entry onto the new base.
// BL-912 (07-S4a, admitted by the 07 batch review desk, 2026-11-05): a Home package's tab uses the icon its stage view picked: workbench.js +37 B, the
// one tab-strip line reads the section's `data-installed-plugin-icon` before it falls back to the default. Tried: no new helper or
// table, the attribute is read in the statement that already chose the default. On main's new 1077477 base it is its own entry; the
// account entry keyed on 1075120 is spent there (ASC-56 used it), so it is replaced.
// FCS-01/02 (#1859, independently reviewed): camera-only Frame sync retains the pressed block and completed body.
// The exact main 2e973052 merge tree measured workbench.js 1077514 -> 1077683 B (+169) in CI job 127713083627.
// Tried moving inline comments out of the factory; the Host already strips them, so it saved nothing. No new helper or byte-golf.
// ASC-57 (第 13 批②, 2026-11-06): after a key change or a provider removal the page points out the old key nothing uses and
// offers to remove it or keep it. settings.css +248 B and workbench.css +248 B (the notice and the delete confirm share one
// spaced row, which also stops the confirm's two buttons touching), workbench.js +1035 B (the notice, remove, keep). Keyed on
// the merge-base after #1859. Tried: the notice reuses the delete confirm's rule and buttons, removing the key edits
// the select in place instead of reloading the page, the host names no key so the page needs no second string.
// ASC-59 (第 13 批③, #1865; admitted by the batch 13 coordinator on 2026-11-06: under 10 KB, no new asset): after logging in again
// to a remote MCP service, the connections page offers to move what used the old connection to the new one, says what it could and
// could not check (Coding's MCP settings, unread reporters), asks once before removing the old one (with cancel), and names the new
// connection apart from the old. workbench.js +6558 B over 1078718, the budget at merge-base b1e0e5b6 (main after #1858; ASC-57's
// entry keyed on 1077683 is spent there and replaced). Tried, from a first cut of +6199: the switch outcome counted per
// usage instead of per code, the pair checked on the rows themselves instead of a serialized helper, the reasons table cut to the
// codes an MCP connection's consumers can answer, errors through the page's own fail(), the two explanations and the two removal
// confirmations sharing one sentence each; no new style or asset.
// ASC-58 (13 批⑥, #1870, admitted by the coordinator after the review desk's measurement, 2026-11-06): a connection's notice in
// the Assistant's "等你处理": workbench.js +573 B, keyed on main's budget 1085274 (after #1865 and #1790; ASC-59's workbench.js entry keyed on 1078718
// is spent there, so it is replaced). About 330 B are the three English notice sentences and the rule kind's name (they follow the
// UI language); the rest is `connection` in URGENT, the one-regex settings-path check, the open branch and hiding "打开". Tried:
// the page sends the registered molis-work:open-settings-path and leaves the same-origin and S-47 parameter checks to the
// settings' own listener (no third copy); the status and rule-form wording added in review is rendered by the Host, not shipped.
// K0c (batch 10, #1872; admitted by the coordinator for the main session on 2026-11-06): the D-track review of #1850, item 5,
// folds the open ▾'s pressed fill into the primary button's own rule, `.mw-btn--primary:is(:active, [aria-expanded="true"])`,
// instead of the board copying its color-mix; it is in the page sheets because K2 draws that split button in product pages.
// +29 B on each of arrival.css, settings.css and workbench.css, keyed on main's budgets after #1870. Tried: no comment in the
// sheet, one selector list instead of a second rule.
const APPROVED_CEILINGS = {
  "/assets/molis-work-arrival.css": [693131, 693160],
  "/assets/molis-work-settings.css": [827793, 827822],
  "/assets/molis-work-workbench.css": [1204709, 1204738],
  "/assets/molis-work-workbench.js": [1085274, 1085847],
  "/assets/molis-work-plugin-frame.js": [208271, 208325],
};
const approvedCeiling = (asset, bytes) => APPROVED_CEILINGS[asset]?.[0] === bytes ? APPROVED_CEILINGS[asset][1] : bytes;
// An asset the user approved adding, with the bytes it is admitted at once: the merge-base did not budget it, so this is its
// first freeze; from the next PR on it only falls like every other. An entry is spent once the budget file holds the asset, so
// it is deleted in the change after the one that admitted it (the decisions stay in git history and the admitting PR).
const APPROVED_NEW_ASSETS = {
  // User-approved T403 split: owner client code and Feed styles load only inside their opaque plugin pages.
  // Previous new-asset entries are already in the merge-base budget and are consumed.
  // T403 first-freeze repair: wait for superseding refresh, preserve partial creation, restore config drafts/busy UI.
  // Same Feed first freeze: interval selection and current controls retain the operation busy state through refresh.
  // Preserve the selected reader read intent when refresh takes over its detail request (+3 B).
  // Preserve the same focused menu control through refresh without stealing outer focus (+165 B, reviewed).
  "/assets/molis-work-plugins/feed.js": 37548,
  "/assets/molis-work-plugins/feed.css": 43247,
  // T403's same approved Inbox URL: retain native Tab stops and same-mount evaluation feedback (+9 B served).
  "/assets/molis-work-plugins/inbox.js": 9297,
};
// base: the budget file against the merge-base's. Raising a number, or adding an asset, is the laundering move.
const baseErrors = (budget, base) => {
  const errors = [];
  for (const [asset, allowed] of Object.entries(budget)) {
    if (base[asset] === undefined && allowed <= (APPROVED_NEW_ASSETS[asset] ?? -1)) continue;
    if (base[asset] === undefined) errors.push(`${BUDGET_FILE} adds ${asset} (${allowed} bytes), which the merge-base did not budget; budgets only fall and no asset may be added`);
    else if (allowed > approvedCeiling(asset, base[asset])) errors.push(`${BUDGET_FILE} raises the budget of ${asset} ${base[asset]} → ${allowed}; budgets only fall`);
  }
  return errors;
};
// A path a budget names that the host sends although the reading of web-assets.ts did not find its route. It was measured
// anyway (so a deleted entry or a grown file still shows up below); the run fails because the gate's idea of the host's
// routes is out of date, and the next route spelled the same way would be missed with no budget to catch it.
const missErrors = (found) => found.map((asset) => `${asset} (${measured[asset]} bytes) is sent by the host, but ${ROUTES_SOURCE} no longer declares it as a string literal, so the gate's route discovery missed it; `
  + "removing its budget entry does not stop the host from sending it. Update the discovery in scripts/gates/page-assets.mjs to the new way the host declares its routes");
// update: nothing may grow relative to the reference (the merge-base's budget, else the committed one); a missing
// reference is the first freeze.
const growthErrors = (measured, reference) => Object.entries(measured).flatMap(([asset, bytes]) => {
  if (reference[asset] === undefined) return bytes <= (APPROVED_NEW_ASSETS[asset] ?? -1) ? [] : [`${asset} (${bytes} bytes) has no budget to lower`];
  return bytes > approvedCeiling(asset, reference[asset]) ? [`${asset} grew ${reference[asset]} → ${bytes}`] : [];
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

// Everything either budget names is asked of the host, whether or not the reading of web-assets.ts found its route.
const committedPaths = () => {
  try { return Object.keys(JSON.parse(readFileSync(budgetPath, "utf8")).assets ?? {}).filter((asset) => asset.startsWith("/assets/")); } catch { return []; }
};
const { measured, gzip, misses } = await measure([...committedPaths(), ...Object.keys(baseBudget ?? {})]);
const total = Object.values(measured).reduce((sum, bytes) => sum + bytes, 0);
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

// ---- --report --------------------------------------------------------------------------------------------------------
if (report) {
  const budget = existsSync(budgetPath) ? budgetNow() : {};
  const rows = Object.keys(measured).sort((a, b) => measured[b] - measured[a] || a.localeCompare(b));
  if (flags.has("--json")) {
    console.log(JSON.stringify({ mergeBase: mergeBase || null, measured, gzip, budget, baseBudget, discoveryMisses: misses }, null, 2));
    process.exit(0);
  }
  console.log(`Page assets: ${rows.length} served paths, ${total} bytes (${kib(total)}) in total; against ${against}`);
  console.log(`  ${"bytes".padStart(9)}${"gzip".padStart(9)}${"budget".padStart(10)}${baseBudget ? "      base" : ""}  path`);
  for (const asset of rows) {
    console.log(`  ${String(measured[asset]).padStart(9)}${(gzip[asset] ? String(gzip[asset]) : "-").padStart(9)}${String(budget[asset] ?? "none").padStart(10)}${baseBudget ? String(baseBudget[asset] ?? "none").padStart(10) : ""}  ${asset}${misses.includes(asset) ? "  (route not found in the host source)" : ""}`);
  }
  if (misses.length) console.log(`${misses.length} discovery miss${misses.length === 1 ? "" : "es"}: the host sends ${misses.join(", ")} although ${ROUTES_SOURCE} does not declare ${misses.length === 1 ? "it" : "them"} as string literals`);
  process.exit(0);
}

// ---- --update --------------------------------------------------------------------------------------------------------
if (update) {
  if (misses.length) {
    console.error(`Budget not written: the gate's route discovery is out of date:\n- ${missErrors(misses).join("\n- ")}`);
    process.exit(1);
  }
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
const errors = [...missErrors(misses), ...headErrors(measured, budget, baseBudget), ...(baseBudget ? baseErrors(budget, baseBudget) : [])];
if (errors.length) {
  console.error(`Page asset budgets failed against ${against}:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Page asset budgets passed against ${against} (${Object.keys(measured).length} assets, ${total} bytes).${notes.length ? ` Note: ${notes.join("; ")}.` : ""}`);
