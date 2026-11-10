import assert from "node:assert/strict";
import nodeTest from "node:test";
import ts from "typescript";
import { transformSync } from "esbuild";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import { BUILTIN_PLUGIN_CATALOG, renderHomePluginPage, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { createLocalHostWorkbenchRenderer, htmlLang, installHostUiText, readText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { FIELD_FIT_CLIENT_SCRIPT, FIELD_FIT_STYLES, FLOATING_DETAILS_CLIENT_SCRIPT, ROVING_FOCUS_CLIENT_SCRIPT, TIP_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { IM_CLIENT_SCRIPT, IM_STYLES } from "@molis-ai/molis-work-im-ui";

// The platform's stable keys use the same text provider as the running Host.
installHostUiText();

// W3-10: the pages that are written inline (their programs are not part of /assets/, so the helper costs the page-asset
// budget nothing) carry the one request helper instead of their own copy of the headers function. Each page is rendered
// by its own renderer, the way the Host serves it.

const test = (name: string, run: () => void) => nodeTest(name, () => runWithLocale("zh", run));
const TOKEN = "page-control-token-0123456789abcdef";
const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);

const webService = {
  provider: "macos-launchagent" as const, state: "absent" as const, supported: true, owned: false, running: false,
  label: "Web", plist_path: "", command: [] as string[], stdout_log: "", stderr_log: "", message: "",
};
const diagnostics = { home_directory: "/tmp", installation_state: "ready" as const, version: "0.2.0", release_directory: "/tmp", project_count: 1, launchers: [] };
const projectView = {
  snapshot: {
    board: { project_id: "board-1", title: "工作台", active_goal_id: null, created_at: "2026-09-17T00:00:00.000Z", updated_at: "2026-09-17T00:00:00.000Z" },
    cursor: 0, goals: [], relations: [], goal_tree_proposals: [], planning_method_packs: [],
  },
  project: { project_id: "project-1", display_name: "工作台" },
  projects: [{ project_id: "project-1", display_name: "工作台" }],
  route_prefix: "/projects/project-1", demo: false, active_goal_id: null, goals: [], archived_goals: [], trashed_goals: [], counts: {},
  input_bindings: [], policy_bindings: [], events: [], feed: { sources: [], feed_items: [], inbox_entries: [], runs: [], out_rules: [] },
} as MolisWorkWebView;
const guidance = { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" };

const count = (html: string, part: string) => html.split(part).length - 1;
/** The headers function every page used to carry a copy of: it is the helper's `headers`, and nothing else defines it any more. */
const OWN_HEADERS_FUNCTION = /molisWorkControlHeaders = \(\) =>/;

/** The page carries the helper once, after the translator it speaks through, and no copy of the old headers function. */
function assertCarriesHelper(name: string, html: string) {
  assert.equal(count(html, UI_REQUEST_CLIENT_SCRIPT), 1, `${name}: the request helper, once`);
  assert.doesNotMatch(html, OWN_HEADERS_FUNCTION, `${name}: no second copy of the headers function`);
  assert.ok(html.indexOf("data-ui-language-resource") >= 0 && html.indexOf("data-ui-language-resource") < html.indexOf(UI_REQUEST_CLIENT_SCRIPT), `${name}: the translator is defined first`);
  assert.match(html, new RegExp(`<meta name="molis-work-page-session" content="${TOKEN}">`), `${name}: the token the helper reads is in the page`);
}

test("the global settings pages carry the request helper", () => {
  for (const section of ["appearance", "projects"] as const) {
    assertCarriesHelper(`settings/${section}`, renderer.renderMolisWorkSettings({ section, runtimes: [], projects: [], web_service: webService, diagnostics }, TOKEN));
  }
});

test("the project settings pages carry the request helper", () => {
  assertCarriesHelper("project guidance", renderer.renderMolisWorkProjectGuidanceSettings(projectView, guidance, [], TOKEN));
  assertCarriesHelper("project settings hub", renderer.renderMolisWorkProjectSettingsHub(projectView, guidance, [], TOKEN));
  // The planning pages are drawn by a shared page frame, which embeds the helper only for a page that changes something:
  // the method editor does, the read-only library does not.
  assertCarriesHelper("planning method (new)", renderer.renderMolisWorkPlanningMethodPage(null, "new", "personal", null, TOKEN));
  const library = renderer.renderMolisWorkPlanningLibrary([], null, TOKEN);
  assert.equal(count(library, UI_REQUEST_CLIENT_SCRIPT), 0, "the read-only library asks for nothing");
  assert.doesNotMatch(library, OWN_HEADERS_FUNCTION);
});

nodeTest("FSS-36 standalone planning clients receive only their Goals words before startup", () => runWithLocale("en", () => {
  const project = renderer.renderMolisWorkProjectSettingsHub(projectView, guidance, [], TOKEN, false, "planning");
  const editor = renderer.renderMolisWorkPlanningMethodPage(null, "new", "personal", null, TOKEN);
  for (const page of [project, editor]) {
    const pack = /<script type="application\/json" data-ui-page-text>([^<]+)<\/script>/.exec(page);
    assert.ok(pack && pack.index < page.indexOf("data-ui-language-resource"));
    assert.match(page, /data-ui-language-resource src="\/assets\/locale\/workbench\.en\.[a-f0-9]+\.js"/);
    const [{ slot, producer, packs }] = JSON.parse(pack[1]!);
    assert.deepEqual([slot, producer], ["settings:planning", "io.molis.work.goals"]);
    assert.deepEqual(packs.map(({ owner, locale }: { owner: string; locale: string }) => [owner, locale]), [["io.molis.work.goals", "en"]]);
    const words = packs[0].messages;
    assert.equal(words["goals.planning-client.fill-least-one-planning-step"], "Fill in at least one planning step.");
    assert.ok(Object.keys(words).every(key => key.startsWith("goals.planning-client.")));
  }
}));

test("the update page and the first-run and new-project journey carry the request helper", () => {
  for (const mode of ["update", "first_run", "new_project"] as const) {
    assertCarriesHelper(`onboarding/${mode}`, renderer.renderMolisWorkOnboarding({ mode, currentVersion: "0.2.0", controlToken: TOKEN }));
  }
});

test("the project chooser carries the request helper, and its assistant bar reaches the headers through it", () => {
  const html = renderer.renderMolisWorkProjectIndex([{ project_id: "local-1", display_name: "工作台", data_class: "user" as const }], TOKEN, false, { now: "2026-10-01T10:00:00", last_project_id: null, opened: {} });
  assertCarriesHelper("chooser", html);
  assert.match(html, /headers: \(\) => molisWorkControlHeaders\(\)/, "the bar still asks for its headers by name, which the helper provides");
});

test("a plugin's side panel document carries the request helper", () => {
  const html = renderer.renderSideViewDocument({ projectPluginId: "lingguang", viewId: "side", projectId: "p1", routePrefix: "/projects/p1", enabled: ["lingguang"], controlToken: TOKEN });
  assert.ok(html, "the side view is served");
  assertCarriesHelper("side view", html!);
});

test("Home and side plugin documents carry the shared field, roving, floating and tip programs", () => {
  const programs = [FIELD_FIT_CLIENT_SCRIPT, ROVING_FOCUS_CLIENT_SCRIPT, FLOATING_DETAILS_CLIENT_SCRIPT, TIP_CLIENT_SCRIPT];
  const entry = BUILTIN_PLUGIN_CATALOG.find(candidate => candidate.project_plugin_id === "todo");
  assert.ok(entry, "the Todo plugin is a Home plugin with a page of its own");
  const home = renderHomePluginPage(entry, "<section data-work-surface></section>", null, TOKEN, { readText, htmlLang });
  const side = renderer.renderSideViewDocument({ projectPluginId: "lingguang", viewId: "side", projectId: "p1", routePrefix: "/projects/p1", enabled: ["lingguang"], controlToken: TOKEN });
  assert.ok(side, "the side view is served");
  for (const program of programs) {
    assert.ok(home.includes(program), "the Home plugin page carries every shared program");
    assert.ok(side!.includes(program), "the side view carries every shared program");
  }
});

/** Compare the shipped IIFE with its owner, preserving bindings and syntax while allowing minification to rename locals. */
function fieldFitProgram(script: string): unknown {
  script = transformSync(script, { minify: true, charset: "utf8", target: "es2022", legalComments: "none" }).code;
  const file = "served-field-fit.js", options = { allowJs: true, noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options), parsed = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  host.getSourceFile = name => name === file ? parsed : undefined;
  const program = ts.createProgram([file], options, host), checker = program.getTypeChecker();
  let owner: ts.CallExpression | undefined;
  const find = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText(parsed) === "window.molisFit") {
      for (let parent = node.parent; parent; parent = parent.parent) if (ts.isCallExpression(parent)) { owner = parent; break; }
    }
    ts.forEachChild(node, find);
  };
  find(parsed);
  assert.ok(owner, "the served script exports the actual field-fit program");
  const bindings = new Map<ts.Symbol, number>();
  const shape = (node: ts.Node): unknown => {
    const children: unknown[] = [];
    ts.forEachChild(node, child => { children.push(shape(child)); });
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol && (symbol.flags & (ts.SymbolFlags.FunctionScopedVariable | ts.SymbolFlags.BlockScopedVariable | ts.SymbolFlags.Function))
        && symbol.declarations?.some(declaration => declaration.pos >= owner!.pos && declaration.end <= owner!.end)) {
        if (!bindings.has(symbol)) bindings.set(symbol, bindings.size);
        return [node.kind, bindings.get(symbol)];
      }
      return [node.kind, node.text];
    }
    return [node.kind, ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text : null, children];
  };
  return shape(owner);
}

test("D0077 D0333: the minified IM page carries the complete shared intrinsic field sizing program and styles", () => {
  assert.deepEqual(fieldFitProgram(IM_CLIENT_SCRIPT), fieldFitProgram(FIELD_FIT_CLIENT_SCRIPT), "the complete field-fit program survives bundle minification");
  assert.throws(() => fieldFitProgram(IM_CLIENT_SCRIPT.replace("window.molisFit=", "window.missingFit=")), /exports the actual field-fit program/, "an omitted export is still rejected");
  assert.notDeepEqual(fieldFitProgram(IM_CLIENT_SCRIPT.replaceAll("textarea[data-fit]", "textarea[data-wrong-fit]")), fieldFitProgram(FIELD_FIT_CLIENT_SCRIPT), "changing the field selector is still detected");
  assert.ok(IM_STYLES.includes(FIELD_FIT_STYLES), "the IM stylesheet has data-fit's styles");
});

test("a Home plugin page carries the request helper before the plugin's client runs", () => {
  const entry = BUILTIN_PLUGIN_CATALOG.find(candidate => candidate.project_plugin_id === "todo");
  assert.ok(entry, "the Todo plugin is a Home plugin with a page of its own");
  const html = renderHomePluginPage(entry, "<section data-work-surface></section>", null, TOKEN, { readText, htmlLang });
  assert.equal(count(html, UI_REQUEST_CLIENT_SCRIPT), 1);
  assert.doesNotMatch(html, OWN_HEADERS_FUNCTION);
  assert.ok(html.indexOf(UI_REQUEST_CLIENT_SCRIPT) < html.indexOf("molisPluginFrames.mount"), "the helper is there before the isolated client mounts");
});

// The Workbench's shared program (/assets/molis-work-workbench.js) is the one place the page budget is measured, and it is where the
// pages that are mounted in the Workbench (the settings among them) get their requests from: the helper comes first, once.
test("the Workbench's shared browser program starts with the request helper and carries no copy of the old headers function", () => {
  const program = renderer.renderMolisWorkWorkbenchClientScript();
  assert.equal(program.indexOf(UI_REQUEST_CLIENT_SCRIPT), 0, "before any program of the Workbench can send a request");
  assert.equal(count(program, UI_REQUEST_CLIENT_SCRIPT), 1, "and only once, though a page that was opened on its own also carries it");
  assert.doesNotMatch(program, OWN_HEADERS_FUNCTION);
});
