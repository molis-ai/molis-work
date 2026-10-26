#!/usr/bin/env node
// Page resource budget (specs/repository-anti-corruption §4.8/§4.13, slice W1-07, decision #17): the workbench's
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
// batch-41 (coordinator review 2026-10-25), against batch-40 as landed, both trees measured on the served asset:
// - workbench.js (1,129,446 B base, remeasured below): PG-049's notice follow-up (8f18228e6, PIPE 6401600115): a local-directory read notice is
//   stored as a stable template with its parameters and drawn in the current UI language, its text and aria label alike. It reuses
//   the assistant's existing text-to-HTML helper and L()/fill(); the author removed the duplicated body/aria wording before handoff.
// - plugins/shelf.js +1,247 B: PG-053 (ac-shell): Shelf's terminal well moves from the platform's pty-client.js into Shelf's own
//   bundle, so the platform entry no longer imports the Shelf package. It is a move: dist/web/pty-client.js (not a budgeted asset)
//   shrinks by 3,196 B, and the frame no longer preloads that 0.5 MB script for Shelf. Tried in the same asset: the bridge reuses
//   Shelf's `post` and page lifetime in place of its own request and observer code; the tui.ts reader of the bridge is unchanged.
// ac-trust T7, against main after batch-40 (the entries batch-40 used are gone): the project settings 插件 page (install preview, each
// permission with its reason and the platform's meaning, jobs, agreements, revoke) is drawn by one inline client script, and the settings
// cover embeds that page and binds it from the `molis-work:settings-embed` event, so the script has to be part of the workbench script:
// - workbench.js +9,467 B (1,129,446 -> 1,138,913): 9.3 KB of UI text and DOM building, of which +629 B is taking a publisher back (T5b: a
//   button, its confirmation and the English text). Tried: no second client or dialog library, one shared `el`/`button` helper, the install
//   and both revoke paths reuse `molisWorkRequest` and the one `ask` dialog; the rest is Chinese text that has to be there.
// - workbench.css +1,369 B (1,234,610 -> 1,235,979): the page's rules (`styles/settings-plugins.ts`), written from the existing tokens.
// No new asset. Each is under 10 KB.
const APPROVED_CEILINGS = {
// Combined batch-41 tree (coordinator, 2026-10-26), measured after `pnpm build` on the merge of all of the above against main 2b3dc51de:
// - workbench.js 1,129,446 -> 1,139,387 (+9,941 B, under 10 KB): T7/T5b +9,467, PG-049's notice language +290, and +184 for two English
//   strings merged with PG-024 (「{name} 在这个项目里的数据」) and A3's dev view (「成果库保存的大文件原件」).
// - workbench.css 1,234,610 -> 1,236,084 (+1,474 B): T7's settings-plugins sheet +1,369 and I1's wrapped local-directory paths +105.
// - settings.css 932,738 -> 932,843 (+105 B): the same I1 rule in the settings document sheet (2fd7d21d8, PIPE Ready 6404410441).
// PG-002 (ac-shell, stacked on batch-41), the 插件 page gets a switch per optional permission, a confirmation before the four that reach
// out or spend are switched on, and a "paused" mark on a job whose permission is off; measured after `pnpm build` on that stack:
// - workbench.js 1,139,387 -> 1,141,064 (+1,677 B, under 10 KB): the switch row, the confirmation and the paused mark are 1.2 KB of
//   script, the rest is their Chinese text and English translations, which must be there. Tried: the switch is the existing `mw-switch`
//   markup, the confirmation is the page's one `ask` dialog, the rows reuse `row`/`group`/`el`; no new helper or library.
// - workbench.css 1,236,084 -> 1,236,101 (+17 B): the switch sits in the existing row column (`:is(.mw-btn, .mw-switch)`).
// BL-700 (ac-shell, stacked on PG-002), the same switches for the plugins that run as the Home's own instance, in a second list on that page:
// - workbench.js 1,141,064 -> 1,141,402 (+338 B, under 10 KB): the list is the PG-002 row renderer called a second time with the Home door's
//   send function (`installed(plugin, send)`, `grants(plugin, repaint, send)`); the bytes are the request and its heading, empty text and
//   English translations. Tried: no second renderer, no new style (the section reuses the page's `group`/`row`).
  "/assets/molis-work-workbench.js": [1129446, 1141402],
  "/assets/molis-work-workbench.css": [1234610, 1236101],
  "/assets/molis-work-settings.css": [932738, 932843],
  "/assets/molis-work-plugins/shelf.js": [63376, 64623],
  // #1306 (with F1's review fixes) reuses arrival's choice/field/button styles instead of the settings document stylesheet. The
  // journey changes and the valid dark welcome pseudo-element selector net +135 B (681,352 -> 681,487). Shared glow declarations
  // stay grouped; only dark opacity splits because :is() cannot contain a pseudo-element. No further reduction tried.
  "/assets/molis-work-arrival.css": [681352, 681487],
};
const approvedCeiling = (asset, bytes) => APPROVED_CEILINGS[asset]?.[0] === bytes ? APPROVED_CEILINGS[asset][1] : bytes;
// An asset the user approved adding, with the bytes it is admitted at once: the merge-base did not budget it, so this is its
// first freeze; from the next PR on it only falls like every other.
// User approved 2026-10-21 (specs/archive/system-review-fixes): all plugin pages run in opaque frames. Freeze the final measured
// shared bridge (including the common UI helpers) once; the original 90325-byte estimate was not a ceiling.
// User approved 2026-10-24 (pop-up decision, W5-04 third group): Files, Git, Diff and Text Stats each ship their own bundle now that
// Coding lends them to its panels through `clientUses` instead of copying their code into coding.js; coding.js falls by 82 KB.
// Each is frozen once at the measured bytes.
// User approved 2026-10-25 (pop-up decision, PG-070): a plugin whose page runs in a frame sends the rules of its own namespace as
// /assets/molis-work-plugins/<id>.css, linked only by the frames that need them, instead of inside molis-work-workbench.css. The
// sheets together are the bytes the workbench sheet loses (the workbench sheet falls by 247609, the sheets add 247526), so the total
// does not grow. Each is frozen once at the measured bytes.
const APPROVED_NEW_ASSETS = {
  "/assets/molis-work-plugin-frame.js": 187120,
  // PG-070 slice 2 (2026-10-25): Shelf no longer keeps its sheet in the settings/workbench sheets, the plugin builder's own
  // rules leave the shared sheet too; both are linked on demand, so both freeze once at the measured bytes.
  "/assets/molis-work-plugins/plugin-builder.css": 19893,
  "/assets/molis-work-plugins/shelf.css": 36541,
  "/assets/molis-work-plugins/diff.js": 1483,
  "/assets/molis-work-plugins/files.js": 11227,
  "/assets/molis-work-plugins/git.js": 29496,
  "/assets/molis-work-plugins/text-stats.js": 1281,
  "/assets/molis-work-plugins/alchemist.css": 151,
  // PG-070 slice 2 renamed the shared diff view's classes to `mw-diff-*`, including the ancestor selectors Coding's rules
  // use; coding.css and the settings sheet that also embeds Coding's rules each grew by 24 bytes, so the first freeze is what
  // this branch measures, not the pre-slice-2 number. (The coding.js bundle grew by 45 bytes and workbench.js by 642; both are
  // existing assets, listed in the delivery comment and admitted by the merge queue, not here.)
  "/assets/molis-work-plugins/coding.css": 74624,
  "/assets/molis-work-plugins/cognia.css": 8283,
  "/assets/molis-work-plugins/dataset.css": 6916,
  "/assets/molis-work-plugins/files.css": 3199,
  "/assets/molis-work-plugins/form.css": 8765,
  "/assets/molis-work-plugins/git.css": 3197,
  "/assets/molis-work-plugins/images.css": 7851,
  "/assets/molis-work-plugins/jelly.css": 19603,
  "/assets/molis-work-plugins/lingguang.css": 4505,
  "/assets/molis-work-plugins/pages.css": 48265,
  "/assets/molis-work-plugins/ppt.css": 7028,
  "/assets/molis-work-plugins/schedule.css": 1269,
  "/assets/molis-work-plugins/todo.css": 13175,
  "/assets/molis-work-plugins/workflows.css": 40743,
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
