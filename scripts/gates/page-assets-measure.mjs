// Measure the exact bytes served by the built Host. Route discovery and independent base-path probes share this implementation.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
const fail = (message) => { throw new Error(message); };
// ---- what the host serves --------------------------------------------------------------------------------------------
// The paths come from the host's own source, so a route added there is measured and needs a budget without anyone
// updating a list here; the plugin packs come from the registered workbench packs, as the host serves them.
const PLUGIN_PACK_PREFIX = "/assets/molis-work-plugins/";
const ROUTES_SOURCE = "apps/local-host/src/web-assets.ts";
const distModule = async (root, file, what) => {
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
export async function measureServed(root, probe = []) {
  const sourcePath = path.join(root, ROUTES_SOURCE);
  if (!existsSync(sourcePath)) return fail(`${ROUTES_SOURCE} is missing; the gate reads the host's asset routes there`);
  const source = readFileSync(sourcePath, "utf8");
  const paths = declaredRoutes(source);
  if (!paths.length) return fail(`${ROUTES_SOURCE} names no "/assets/..." route any more; update scripts/gates/page-assets.mjs to the new place the host declares them`);
  if (!source.includes("molis-work-plugins")) return fail(`${ROUTES_SOURCE} no longer serves plugin packs under ${PLUGIN_PACK_PREFIX}; update scripts/gates/page-assets.mjs`);

  const assetsModule = await distModule(root, "apps/local-host/dist/web-assets.js", "the host's asset server");
  const pageAssets = await distModule(root, "apps/workbench/dist/page-assets.js", "the workbench stylesheets and client script");
  const packsModule = await distModule(root, "apps/workbench/dist/plugin-workbench.js", "the registered plugin packs");
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


if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, probeFile] = process.argv.slice(2);
    if (!root) throw new Error("usage: page-assets-measure.mjs <root> [probe.json]");
    console.log(JSON.stringify(await measureServed(root, probeFile ? JSON.parse(readFileSync(probeFile, "utf8")) : [])));
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
