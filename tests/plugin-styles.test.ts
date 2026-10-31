import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { createLocalWebAssets } from "@molis-ai/molis-work-app-local-host";
import {
  parseConditionFrame, pluginOnDemandStylesheet, pluginSettingsStyleLinks, pluginSurfaceClients,
  pluginWorkbenchPacks, pluginWorkbenchStyles, renderMolisWorkConditionsSpecimen, renderPluginFrameSurface, selectorNames,
  splitPluginStylesheet, SETTINGS_DIRECTORY_FACTORY_SCRIPT, type BuiltinPluginWorkbenchPack, type MolisWorkSettingsView,
} from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkSettings, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

// PG-070: a plugin whose page runs in a frame sends the rules of its own namespace as a sheet of its own, which only the frames that
// need it link. What moves is decided by the names in the selectors, so a rule never changes what it applies to; the shared sheet
// loads first, so the plugin's rules follow the host's.

const root = new URL("..", import.meta.url).pathname;
const normal = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("RAC-756 a rule moves out only when every selector names the plugin's own class or data attribute", () => {
  const css = "/* the plugin's note */.git-a{color:red}.mw-btn{color:blue}.git-a .mw-btn,.git-b{margin:0}.mw-btn:not(.git-x){top:0}"
    + ".mw-btn:is(.git-a,.mw-row){top:1px}.github-row{left:0}[data-git-row]{right:0}[data-gitx]{bottom:0}.git-s{content:\"}{\"}"
    + "@media (max-width:600px){.git-a{color:green}.mw-btn{color:gray}}@media print{.mw-btn{color:#000}}"
    + "@keyframes git-spin{to{opacity:0}}@font-face{font-family:x}@import url(\"a.css\");.mw-note{--tone:git-a}";
  const { scoped, shared } = splitPluginStylesheet(css, "git", ["git-s"]);
  assert.equal(normal(scoped), ".git-a{color:red}.git-a .mw-btn,.git-b{margin:0}[data-git-row]{right:0}@media (max-width:600px){.git-a{color:green}}");
  assert.equal(normal(shared), ".mw-btn{color:blue}.mw-btn:not(.git-x){top:0}.mw-btn:is(.git-a,.mw-row){top:1px}.github-row{left:0}[data-gitx]{bottom:0}"
    + ".git-s{content:\"}{\"}@media (max-width:600px){.mw-btn{color:gray}}@media print{.mw-btn{color:#000}}"
    + "@keyframes git-spin{to{opacity:0}}@font-face{font-family:x}@import url(\"a.css\");.mw-note{--tone:git-a}");
  assert.deepEqual(selectorNames(".mw-btn:not(.git-x) > .git-a[data-git-id]:is(.git-y)"), ["mw-btn", "git-a", "data-git-id"],
    "a name inside :not(), :is() or :where() does not make a selector the plugin's own");
});

const packs = pluginWorkbenchPacks();
const framed = (pack: BuiltinPluginWorkbenchPack) => Boolean(pack.stylesheet && pack.clientFactory);

test("RAC-757 a framed plugin's sheet is split with nothing lost; a plugin the shell draws keeps its whole sheet in the shared one", () => {
  const shared = pluginWorkbenchStyles(packs, "beneath-shell") + pluginWorkbenchStyles(packs);
  let moved = 0;
  for (const pack of packs.filter((one) => one.stylesheet)) {
    const id = pack.project_plugin_id, own = pluginOnDemandStylesheet(id, packs);
    if (!framed(pack)) {
      assert.equal(own, null, `${id} has no frame of its own, so its sheet cannot be loaded on demand`);
      assert.ok(shared.includes(pack.stylesheet!), `${id} keeps its whole sheet in the shared one`);
      continue;
    }
    const split = splitPluginStylesheet(pack.stylesheet!, id, pack.stylesheetShared, pack.stylesheetPrefixes);
    assert.equal(own, split.scoped || null);
    assert.equal(splitPluginStylesheet(split.scoped, id, pack.stylesheetShared, pack.stylesheetPrefixes).shared, "", `${id}: the sheet it brings holds only its own rules`);
    assert.equal(splitPluginStylesheet(split.shared, id, pack.stylesheetShared, pack.stylesheetPrefixes).scoped, "", `${id}: nothing movable is left in the shared sheet`);
    const bare = (css: string) => normal(css).replace(/\s+/g, "").length;
    assert.ok(bare(split.scoped) + bare(split.shared) >= bare(pack.stylesheet!), `${id}: no rule is lost`);
    assert.ok(bare(split.scoped) + bare(split.shared) <= bare(pack.stylesheet!) + 512, `${id}: only conditional wrappers are repeated`);
    if (split.scoped) assert.ok(!shared.includes(split.scoped.trim()), `${id}: what it brings is not also in the shared sheet`);
    moved += split.scoped.length;
  }
  assert.ok(moved > 200_000, `the plugins' own sheets take real weight off the shared one (${moved} bytes)`);
});

const tracked = execFileSync("git", ["ls-files", "apps", "plugins", "packages", "horizontal", "modules", "server"], { cwd: root, encoding: "utf8" }).split("\n")
  .filter((file) => /\.(ts|tsx|mts)$/.test(file) && !/\.d\.ts$/.test(file) && !/(^|\/)(tests?|dist|node_modules)\//.test(file));
const sources = new Map(tracked.map((file) => [file, readFileSync(`${root}${file}`, "utf8")]));
// Style sources hold the rules, not the elements, so a class named there is not drawn there.
const styleSource = (file: string) => /(^|\/)styles?(\/|\.ts$)|(^|\/)[^/]*-styles?\.ts$|(^|\/)styles?-[^/]*\.ts$/.test(file);
const DRAWN = /class|querySelector|closest\(|matches\(|classList|\.add\(|\.toggle\(|\.remove\(|getElementsBy/;
const packageOf = (file: string) => /^plugins\/native\/([^/]+)\//.exec(file)?.[1] ?? null;
const ids = new Set(packs.filter(framed).map((pack) => pack.project_plugin_id));

/** The classes of a plugin's namespace that code outside the plugin's own package draws: by the host and the shared libraries, and by other plugins. */
function drawnOutside(pack: BuiltinPluginWorkbenchPack) {
  const id = pack.project_plugin_id, names = new Set<string>();
  const namespaces = [id, ...(pack.stylesheetPrefixes ?? []).map((prefix) => prefix.endsWith("-") ? prefix.slice(0, -1) : prefix)];
  const own = (name: string) => namespaces.some((namespace) => name === namespace || name.startsWith(`${namespace}-`)
    || name === `data-${namespace}` || name.startsWith(`data-${namespace}-`));
  for (const match of pack.stylesheet!.matchAll(/\.(-?[_a-zA-Z][\w-]*)|\[\s*(data-[\w-]+)/g)) {
    const name = (match[1] ?? match[2])!;
    if (own(name)) names.add(name);
  }
  const byHost = new Set<string>(), byPlugin = new Map<string, Set<string>>();
  for (const [file, text] of sources) {
    const owner = packageOf(file);
    if (owner === id || styleSource(file)) continue;
    for (const name of names) {
      const pattern = new RegExp(`(?<![\\w-])${name.replaceAll("-", "\\-")}(?![\\w-])`);
      if (!pattern.test(text) || (!name.startsWith("data-") && !text.split("\n").some((line) => pattern.test(line) && DRAWN.test(line)))) continue;
      if (owner && ids.has(owner)) (byPlugin.get(owner) ?? byPlugin.set(owner, new Set()).get(owner)!).add(name);
      else byHost.add(name);
    }
  }
  return { byHost: [...byHost].sort(), byPlugin };
}

test("RAC-758 the classes something outside a plugin's own frame draws are listed, so their rules stay in the shared sheet", () => {
  for (const pack of packs.filter(framed)) {
    const { byHost, byPlugin } = drawnOutside(pack);
    assert.deepEqual([...(pack.stylesheetShared ?? [])].sort(), byHost,
      `${pack.project_plugin_id}: stylesheetShared is exactly the namespace classes the host, the shared libraries and the plugins the shell draws use`);
    for (const [user, names] of byPlugin) {
      const userPack = packs.find((one) => one.project_plugin_id === user)!;
      const missing = [...names].filter((name) => !byHost.includes(name));
      if (missing.length > 0) {
        assert.ok(userPack.stylesheetUses?.includes(pack.project_plugin_id), `${user} draws ${pack.project_plugin_id}'s ${missing.join(", ")}, so its frame has to link that sheet`);
      }
    }
  }
});

const link = (name: string) => `<link rel="stylesheet" href="/assets/molis-work-plugins/${name}.css">`;
/** The page a surface hands its frame: the JSON string in the surface's data script. */
const documentOf = (surface: string): string => JSON.parse(/<script type="application\/json" data-plugin-document>([\s\S]*?)<\/script>/.exec(surface)![1]!) as string;

test("RAC-759 a frame's page starts with its plugin's sheet and the sheets of the plugins whose classes it draws, and no plugin lists a sheet that does not exist", () => {
  const clients = pluginSurfaceClients(packs);
  for (const client of clients) {
    const pack = packs.find((one) => one.project_plugin_id === client.id)!;
    const wanted = [client.id, ...(pack.stylesheetUses ?? [])].filter((id) => pluginOnDemandStylesheet(id, packs) !== null);
    assert.deepEqual([...client.styles], [...new Set(wanted)], `${client.id}: its own sheet first, then the used ones, only where a sheet exists`);
  }
  const coding = clients.find((client) => client.id === "coding")!;
  assert.deepEqual([...coding.styles].sort(), ["coding", "files", "git"], "Coding mounts the Git and Files clients, so its frame links their sheets");
  assert.ok(!clients.find((client) => client.id === "diff")!.styles.includes("diff"), "the Diff plugin's rules are all shared, so it has no sheet to link");
  assert.deepEqual([...clients.find((client) => client.id === "shelf")!.styles], ["shelf"], "Shelf's page loads Shelf's own sheet");
  assert.deepEqual([...clients.find((client) => client.id === "plugin-builder")!.styles], ["plugin-builder"], "so does the studio");
  assert.equal(documentOf(renderPluginFrameSurface("<p>x</p>", "coding", "Coding")), `${link("coding")}${link("git")}${link("files")}<p>x</p>`);
  assert.equal(documentOf(renderPluginFrameSurface("<p>x</p>", "diff", "Diff")), "<p>x</p>", "a plugin with no sheet of its own adds nothing");
  assert.equal(documentOf(renderPluginFrameSurface("<p>x</p>", "feed", "Feed")), "<p>x</p>", "the shell draws Feed itself, so it has no sheet to link");
  assert.equal(documentOf(renderPluginFrameSurface("<p>x</p>", "a-copy", "t", false, false, "coding")), `${link("coding")}${link("git")}${link("files")}<p>x</p>`,
    "a standalone view of a plugin's bundle takes the bundle's sheets");
  assert.ok(!renderPluginFrameSurface("<p>x</p>", "coding", "Coding").includes("<link"), "the links travel inside the inert page data, never in the shell's own markup");
});

const serve = (assets: ReturnType<typeof createLocalWebAssets>, pathname: string): Promise<{ status: number; type: string; body: string }> => new Promise((resolve, reject) => {
  const server = createServer((request, response) => { if (!assets.serveWorkbenchAsset(request, response, pathname)) { response.statusCode = 404; response.end(); } });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") { server.close(); reject(new Error("no port")); return; }
    fetch(`http://127.0.0.1:${address.port}${pathname}`).then(async (response) => {
      const body = await response.text();
      server.close(() => resolve({ status: response.status, type: response.headers.get("content-type") ?? "", body }));
    }).catch((error) => server.close(() => reject(error)));
  });
});

test("RAC-760 the host serves a plugin's own sheet at its address, and nothing at the address of a plugin that has none", async () => {
  const assets = createLocalWebAssets({ ptyClientFilePath: () => "/missing-pty-client.js", renderer: {
    renderMolisWorkWorkbenchClientScript: () => "", renderMolisWorkWorkbenchStylesheet: () => "", renderMolisWorkArrivalStylesheet: () => "", renderMolisWorkSettingsStylesheet: () => "" } });
  const coding = await serve(assets, "/assets/molis-work-plugins/coding.css");
  assert.equal(coding.status, 200);
  assert.match(coding.type, /^text\/css/);
  assert.match(coding.body, /\.coding-/);
  const shelf = await serve(assets, "/assets/molis-work-plugins/shelf.css");
  assert.equal(shelf.status, 200);
  assert.match(shelf.body, /\.shelf-/, "Shelf's rules are served as its own sheet");
  const studio = await serve(assets, "/assets/molis-work-plugins/plugin-builder.css");
  assert.equal(studio.status, 200);
  assert.match(studio.body, /\.as-shell/, "the studio's own rules are served as its own sheet");
  for (const none of ["diff", "feed", "not-a-plugin"]) assert.equal((await serve(assets, `/assets/molis-work-plugins/${none}.css`)).status, 404, `${none} has no sheet of its own`);
  assert.equal((await serve(assets, "/assets/molis-work-plugins/coding.js")).status, 200, "the client bundle keeps its address");
});

test("RAC-761 the plugin sheets come after the workbench sheet the frame links in its head, inside the sheet sources its policy already allows", () => {
  const bundle = readFileSync(`${root}apps/workbench/dist/plugin-frame-client.js`, "utf8");
  const head = bundle.indexOf("<link rel=\"stylesheet\""), body = bundle.indexOf("<body", head);
  assert.ok(head > 0 && body > head && /molis-work-workbench\.css/.test(bundle.slice(head, body)), "the frame's head links the workbench sheet, and its body holds the page, which starts with the plugin's links");
  assert.match(bundle, /style-src 'unsafe-inline' "?\s*\+\s*\w+\s*\+\s*"?\/assets\//, "the frame's policy allows sheets from /assets/ only");
});

test("RAC-762 the component board's plugin rows link the sheets of the plugins whose rows they draw", () => {
  const options = parseConditionFrame(new URLSearchParams("part=rows"));
  const page = renderMolisWorkConditionsSpecimen(options, { L: (text) => text, htmlLang: () => "zh-CN", clientI18nScript: () => "" });
  assert.match(page, /<link rel="stylesheet" href="\/assets\/molis-work-plugins\/coding\.css">/, "Coding's rows are drawn with Coding's sheet");
  assert.ok(page.indexOf("molis-work-workbench.css") < page.indexOf("molis-work-plugins/coding.css"), "after the workbench sheet");
  assert.doesNotMatch(renderMolisWorkConditionsSpecimen(parseConditionFrame(new URLSearchParams("part=reply")), { L: (text) => text, htmlLang: () => "zh-CN", clientI18nScript: () => "" }),
    /molis-work-plugins\//, "the reply part draws no plugin row");
});

const SHELF_SETTINGS_CONTRIBUTION = "io.molis.work.native.shelf.settings.v1";

test("RAC-763 Shelf's whole sheet is its own page asset, linked by its frame and by the settings page the shell draws", () => {
  const shelf = packs.find((pack) => pack.project_plugin_id === "shelf")!;
  const own = pluginOnDemandStylesheet("shelf", packs);
  assert.ok(own?.includes(".shelf-"), "Shelf's rules leave the shared sheet for a sheet of its own");
  assert.deepEqual([...(shelf.stylesheetShared ?? [])], [], "nothing of Shelf's page is drawn outside its own package");
  assert.doesNotMatch(normal(pluginWorkbenchStyles(packs)), /\.shelf-|\[data-shelf/u, "the shared sheet carries none of them");
  assert.equal(pluginSettingsStyleLinks(SHELF_SETTINGS_CONTRIBUTION, packs), link("shelf"), "the settings page the shell draws links the same sheet");
  assert.equal(pluginSettingsStyleLinks("io.molis.work.native.goals.proposal", packs), "", "a page with no sheet of its own adds nothing");
  assert.equal(pluginSettingsStyleLinks("no.such.contribution", packs), "", "so does an unknown page");
  assert.equal(documentOf(renderPluginFrameSurface("<p>x</p>", "shelf", "Shelf")), `${link("shelf")}<p>x</p>`, "the frame links it first");
  // The host's own rules may name a Shelf class (the stage chrome craft draws); the Shelf sheet's rules must not be in either sheet.
  const shelfSheet = own!;
  for (const rule of ["[data-shelf-material-dialog]", "[data-shelf-back]", ".shelf-doc"]) {
    assert.ok(shelfSheet.includes(rule), `Shelf's sheet holds ${rule}`);
    assert.ok(!renderMolisWorkWorkbenchStylesheet().includes(rule), `the workbench sheet no longer carries ${rule}`);
    assert.ok(!renderMolisWorkSettingsStylesheet().includes(rule), `nor does the settings sheet: ${rule}`);
  }
  // The shell-drawn settings page: the plugin sheet follows the settings sheet.
  const view: MolisWorkSettingsView = {
    section: "shelf", plugin_settings_html: "<p>s</p>", runtimes: [], projects: [],
    web_service: { provider: "unsupported", state: "unsupported", supported: false, owned: false, running: false, label: "", plist_path: "", command: [], stdout_log: "", stderr_log: "", message: "" },
    diagnostics: { home_directory: "/", installation_state: "ready", version: null, release_directory: null, project_count: 0, launchers: [] },
  };
  const page = renderMolisWorkSettings(view);
  assert.ok(page.indexOf('href="/assets/molis-work-settings.css"') < page.indexOf('href="/assets/molis-work-plugins/shelf.css"'), "linked after the settings sheet");
});

test("RAC-764 the studio declares its own class prefixes, and only rules that name them leave the shared sheet", () => {
  const builder = packs.find((pack) => pack.project_plugin_id === "plugin-builder")!;
  assert.deepEqual([...(builder.stylesheetPrefixes ?? [])], ["as-", "pb-"]);
  const own = pluginOnDemandStylesheet("plugin-builder", packs)!;
  assert.match(own, /\.as-shell\{/u);
  assert.match(own, /\.as-canvas/u);
  assert.doesNotMatch(own, /as-preview-page/u, "the host draws the preview page, so its rules stay shared");
  const shared = pluginWorkbenchStyles(packs);
  assert.match(shared, /as-preview-page/u);
  assert.match(shared, /\.pc-/, "the component vocabulary generated plugins draw stays in the shared sheet");
});

test("RAC-765 the diff view's classes belong to the host page, so the Diff plugin brings no sheet", () => {
  const diff = packs.find((pack) => pack.project_plugin_id === "diff")!;
  assert.equal(diff.stylesheet, undefined, "no stylesheet is registered");
  assert.equal(pluginOnDemandStylesheet("diff", packs), null);
  const sheet = renderMolisWorkWorkbenchStylesheet();
  for (const token of ["mw-diff", "mw-diff-sides", "mw-diff-source", "mw-diff-rows", "mw-diff-split", "mw-diff-before", "mw-diff-after", "mw-diff-sign", "mw-diff-fold", "mw-diff-notices"]) {
    assert.match(sheet, new RegExp(`\\.${token}(?![\\w-])`, "u"), token);
  }
  assert.doesNotMatch(sheet, /\.diff \.diff-/u, "the old class names are gone");
  assert.ok(!pluginSurfaceClients(packs).some((client) => client.id === "diff" && client.styles.length), "no frame links a Diff sheet");
});

test("RAC-768 the workbench's settings panel loads a fetched page's plugin sheets before it shows it", () => {
  const script = SETTINGS_DIRECTORY_FACTORY_SCRIPT;
  assert.match(script, /molis-work-plugins\//u);
  assert.ok(script.includes("ensureStyleSheets(html)"), "the panel reads the sheets a fetched page links");
  assert.ok(script.indexOf("ensureStyleSheets(html)") < script.indexOf("loadFromHtml(section, html, fetchPath)"), "and waits for them before it inserts the page");
  // The script is a template string: a regex written `\b` there is a backspace, no link tag is ever found and the sheet never loads (found by tests/shelf-plugin.e2e.test.ts).
  const statement = /const sources = [^\n]*;/u.exec(script)?.[0];
  assert.ok(statement, "the panel reads the links of a fetched page");
  const sheets = new Function("html", `${statement} return sources;`) as (html: string) => string[];
  assert.deepEqual(sheets('<head><link rel="stylesheet" href="/assets/molis-work-settings.css"><link rel="stylesheet" href="/assets/molis-work-plugins/shelf.css"></head><p>x</p>'),
    ["/assets/molis-work-plugins/shelf.css"], "only a plugin's own sheet is brought");
});
