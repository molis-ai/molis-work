import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { createLocalWebAssets } from "@molis-ai/molis-work-app-local-host";
import {
  parseConditionFrame, pluginOnDemandStylesheet, pluginSurfaceClients, pluginWorkbenchPacks, pluginWorkbenchStyles,
  renderMolisWorkConditionsSpecimen, renderPluginFrameSurface, selectorNames, splitPluginStylesheet,
  type BuiltinPluginWorkbenchPack,
} from "@molis-ai/molis-work-app-workbench";

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
const framed = (pack: BuiltinPluginWorkbenchPack) => Boolean(pack.stylesheet && pack.clientFactory && !pack.settingsClient);

test("RAC-757 a framed plugin's sheet is split with nothing lost; a plugin the shell draws keeps its whole sheet in the shared one", () => {
  const shared = pluginWorkbenchStyles(packs);
  let moved = 0;
  for (const pack of packs.filter((one) => one.stylesheet)) {
    const id = pack.project_plugin_id, own = pluginOnDemandStylesheet(id, packs);
    if (!framed(pack)) {
      assert.equal(own, null, `${id} has no frame of its own, so its sheet cannot be loaded on demand`);
      assert.ok(shared.includes(pack.stylesheet!), `${id} keeps its whole sheet in the shared one`);
      continue;
    }
    const split = splitPluginStylesheet(pack.stylesheet!, id, pack.stylesheetShared);
    assert.equal(own, split.scoped || null);
    assert.equal(splitPluginStylesheet(split.scoped, id, pack.stylesheetShared).shared, "", `${id}: the sheet it brings holds only its own rules`);
    assert.equal(splitPluginStylesheet(split.shared, id, pack.stylesheetShared).scoped, "", `${id}: nothing movable is left in the shared sheet`);
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
  for (const match of pack.stylesheet!.matchAll(/\.(-?[_a-zA-Z][\w-]*)|\[\s*(data-[\w-]+)/g)) {
    const name = (match[1] ?? match[2])!;
    if (name === id || name.startsWith(`${id}-`) || name === `data-${id}` || name.startsWith(`data-${id}-`)) names.add(name);
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
  for (const none of ["diff", "feed", "shelf", "not-a-plugin"]) assert.equal((await serve(assets, `/assets/molis-work-plugins/${none}.css`)).status, 404, `${none} has no sheet of its own`);
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
