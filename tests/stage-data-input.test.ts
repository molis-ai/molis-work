// T-116 (PG-060, RAC-2681): the GET pages a plugin answers are declared in its Manifest as data (`ui.page_routes`) and matched by one
// matcher the Host runs over every plugin's declarations; a plugin's stage is given of the request exactly the parameters it names in
// `stage_data.input` (`StagePageModel.request`) and nothing else: not a parameter the route does not declare, not the raw path or query,
// not a value over the length limit (it is refused, never cut).
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { UI_PAGE_ROUTE_PARAM_LIMIT, type UiPageRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { PAGE_ROUTE_LIMITS, matchDeclaredPageRoute, matchPageRoute, pageRouteProblems, stageRequestParams } from "@molis-ai/molis-work-plugin-sdk";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import { BUILTIN_PLUGIN_CATALOG, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { createLocalHostWorkbenchRenderer, declaredStageRequests } from "@molis-ai/molis-work-app-local-host";
import { DECLARATION_PLUGIN_ID, declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

type Part = Record<string, unknown>;

const routesOf = (page_routes: unknown): Record<string, unknown> => declarationManifest({ ui: { contributions: [], page_routes } });
const readAction = () => ({ capability_id: "notes.snapshot", version: 1, operation: "query", action: {
  title: "读取", description: "读取舞台的数据", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object" }, output_schema: { type: "object" } } });
const stageManifest = (input: unknown, page_routes: unknown = [{ route_id: "note", path: "/notes/:note_id", query: ["tab"] }]): Record<string, unknown> =>
  declarationManifest({ actions: [readAction()], ui: { contributions: [`${DECLARATION_PLUGIN_ID}.main`], page_routes,
    views: [{ view_id: "main", slot: "navigator", title: "Main", icon: "note", stage_data: { action: "notes.snapshot", ...(input === undefined ? {} : { input }) } }] } });

const DECLARATION_RULES: ReadonlyArray<{ rule: string; manifest: Record<string, unknown>; expected: string }> = [
  { rule: "routes of literals and parameters, with the query they read", manifest: routesOf([{ route_id: "home", path: "/" },
    { route_id: "item", path: "/items/:item_id", query: ["tab"] }, { route_id: "new-item", path: "/items/new/draft" }]), expected: "" },
  { rule: "a path that does not start with a slash", manifest: routesOf([{ route_id: "a", path: "items" }]), expected: "页面路由 a 的 路径必须以 / 开头" },
  { rule: "a literal in capitals", manifest: routesOf([{ route_id: "a", path: "/Items" }]), expected: "路径段 “Items” 只能是小写字母、数字、下划线和连字符，不能为空" },
  { rule: "an empty segment", manifest: routesOf([{ route_id: "a", path: "/items/" }]), expected: "路径段 “” 只能是小写字母" },
  { rule: "a parameter name in capitals", manifest: routesOf([{ route_id: "a", path: "/items/:Item" }]), expected: "参数名 :Item 只能用小写字母" },
  { rule: "a route without a valid id", manifest: routesOf([{ route_id: "A b", path: "/" }]), expected: "页面路由缺少合法的 route_id" },
  { rule: "a repeated route id", manifest: routesOf([{ route_id: "a", path: "/a" }, { route_id: "a", path: "/b" }]), expected: "页面路由重复：a" },
  { rule: "two routes that answer the same path", manifest: routesOf([{ route_id: "one", path: "/items/:item_id" }, { route_id: "two", path: "/items/new" }]),
    expected: "页面路由 two 与 one 能匹配同一个路径" },
  { rule: "more query parameters than the limit", manifest: routesOf([{ route_id: "a", path: "/", query: ["a", "b", "c", "d", "e"] }]),
    expected: `页面路由 a 的 query 必须是最多 ${PAGE_ROUTE_LIMITS.query} 个参数名` },
  { rule: "a query parameter name in capitals", manifest: routesOf([{ route_id: "a", path: "/", query: ["Tab"] }]), expected: "页面路由 a 的 query 必须是最多" },
  { rule: "one name used by the path and the query", manifest: routesOf([{ route_id: "a", path: "/items/:item_id", query: ["item_id"] }]), expected: "页面路由 a 的参数名重复" },
  { rule: "more segments than the limit", manifest: routesOf([{ route_id: "a", path: "/" + Array.from({ length: PAGE_ROUTE_LIMITS.segments + 1 }, (_, i) => `s${i}`).join("/") }]),
    expected: `路径最多 ${PAGE_ROUTE_LIMITS.segments} 段` },
  { rule: "more routes than the limit", manifest: routesOf(Array.from({ length: PAGE_ROUTE_LIMITS.routes + 1 }, (_, i) => ({ route_id: `r${i}`, path: `/r${i}` }))),
    expected: `ui.page_routes 最多 ${PAGE_ROUTE_LIMITS.routes} 条` },
  { rule: "page_routes that is not an array", manifest: routesOf("/items"), expected: "ui.page_routes 必须为数组" },
  { rule: "a stage that names a parameter its Manifest's routes declare", manifest: stageManifest(["note_id", "tab"]), expected: "" },
  { rule: "a stage that names a parameter no route declares", manifest: stageManifest(["note_id", "secret"]),
    expected: "视图 main 的 stage_data.input 指向 secret，本 Manifest 的 page_routes 没有这个参数" },
  { rule: "a stage that names input and a Manifest with no routes", manifest: stageManifest(["note_id"], []),
    expected: "视图 main 的 stage_data.input 指向 note_id，本 Manifest 的 page_routes 没有这个参数" },
  { rule: "a stage whose input is empty", manifest: stageManifest([]), expected: `视图 main 的 stage_data.input 必须是 1 到 ${PAGE_ROUTE_LIMITS.input} 个参数名` },
  { rule: "a stage whose input is not a list of names", manifest: stageManifest("note_id"), expected: "视图 main 的 stage_data.input 必须是 1 到" },
  { rule: "a stage that names a parameter twice", manifest: stageManifest(["note_id", "note_id"]), expected: "视图 main 的 stage_data.input 有重复的参数名" },
];

for (const { rule, manifest, expected } of DECLARATION_RULES) {
  test(`RAC-2681 page route declaration: ${rule}`, () => {
    const problems = manifestProblems(manifest);
    if (expected === "") assert.equal(problems, "");
    else assert.ok(problems.includes(expected), `${expected} ⊄ ${problems}`);
  });
}

const ROUTES: UiPageRouteDeclaration[] = [
  { route_id: "home", path: "/" },
  { route_id: "note", path: "/notes/:note_id", query: ["tab", "q"] },
  { route_id: "note-edit", path: "/notes/:note_id/edit" },
  { route_id: "new-note", path: "/notes/new" },
];
const url = (path: string) => new URL(path, "http://fixture.test");
const match = (path: string) => { const { pathname, searchParams } = url(path); return matchPageRoute(ROUTES, pathname, searchParams); };

test("RAC-2681 the matcher gives the route's declared parameters, decoded once, and nothing else of the request", () => {
  assert.deepEqual(match("/"), { route_id: "home", params: {} });
  assert.deepEqual(match("/notes/a%252Fb?tab=files&q="), { route_id: "note", params: { note_id: "a%2Fb", tab: "files", q: "" } });
  assert.deepEqual(match("/notes/one/edit"), { route_id: "note-edit", params: { note_id: "one" } });
  assert.deepEqual(match("/notes/one"), { route_id: "note", params: { note_id: "one" } }, "a query parameter the request does not carry is not in params");
  // The shape decides the route, the first declared one winning when two shapes fit (a parameter segment is one non-empty segment).
  assert.equal(match("/notes/new")?.route_id, "note", "the first declared route that fits is the one");
  for (const path of ["/notes", "/notes/", "/notes/a/b", "/notes/a/edit/more", "/other", "/api/notes/a", "/notes//edit"]) assert.equal(match(path), null, path);
  assert.equal(matchPageRoute(ROUTES, "notes/a", url("/").searchParams), null, "a path without its leading slash is not a path");
});

test("RAC-2681 an undeclared query or path parameter, a one-time key and the raw request never reach the match", () => {
  const found = match("/notes/one?tab=files&secret=x&control_token=t&idempotency_key=k&project=p&__proto__=z&note_id=other");
  assert.deepEqual(found, { route_id: "note", params: { note_id: "one", tab: "files" } });
  assert.deepEqual(Object.keys(found!.params).sort(), ["note_id", "tab"]);
  assert.deepEqual(Object.keys(found!).sort(), ["params", "route_id"], "no path, query or search of the request is carried along");
});

test("RAC-2681 a declared parameter over the limit is refused with the route's rejection, never cut", () => {
  const atLimit = "n".repeat(UI_PAGE_ROUTE_PARAM_LIMIT), over = "n".repeat(UI_PAGE_ROUTE_PARAM_LIMIT + 1);
  assert.deepEqual(match("/notes/" + atLimit), { route_id: "note", params: { note_id: atLimit } });
  assert.deepEqual(match("/notes/" + over), { route_id: "note", params: {}, rejected: { param: "note_id", reason: "too_long" } });
  assert.deepEqual(match("/notes/one?tab=" + over), { route_id: "note", params: { note_id: "one" }, rejected: { param: "tab", reason: "too_long" } });
  // The limit counts characters, not UTF-16 units: a limit's worth of astral characters is accepted, one more is refused whole.
  const emoji = "😀".repeat(UI_PAGE_ROUTE_PARAM_LIMIT);
  assert.equal(match("/notes/" + encodeURIComponent(emoji))?.rejected, undefined);
  assert.equal(match("/notes/" + encodeURIComponent(emoji + "😀"))?.rejected?.reason, "too_long");
  // Not valid percent-encoding is a refusal too, not an exception.
  assert.deepEqual(match("/notes/%zz"), { route_id: "note", params: {}, rejected: { param: "note_id", reason: "encoding" } });
});

test("RAC-2681 each plugin's declarations are matched by one matcher; the first plugin whose route fits answers", () => {
  const manifests = [{ plugin_id: "io.example.one", ui: { contributions: [], page_routes: [{ route_id: "a", path: "/a/:id" }] } },
    { plugin_id: "io.example.two", ui: { contributions: [], page_routes: [{ route_id: "b", path: "/b/:id" }] } },
    { plugin_id: "io.example.none", ui: { contributions: [] } }];
  const ask = (path: string) => matchDeclaredPageRoute(manifests, path, new URLSearchParams());
  assert.deepEqual(ask("/b/7"), { plugin_id: "io.example.two", route_id: "b", params: { id: "7" } });
  assert.deepEqual(ask("/a/1"), { plugin_id: "io.example.one", route_id: "a", params: { id: "1" } });
  assert.equal(ask("/c/1"), null);
});

test("RAC-2681 a stage is given the parameters its stage_data.input names and no other", () => {
  assert.deepEqual(stageRequestParams(["note_id", "tab"], { note_id: "one", tab: "files", q: "x" }), { note_id: "one", tab: "files" });
  assert.deepEqual(stageRequestParams(["note_id", "tab"], { note_id: "one" }), { note_id: "one" }, "a parameter the request did not carry is absent");
  assert.deepEqual(stageRequestParams(undefined, { note_id: "one" }), {}, "a stage that names none reads nothing of the request");
  assert.deepEqual(stageRequestParams(["toString", "constructor"], {}), {}, "inherited names are not parameters");
});

/** Schedule's real registration, with a Manifest that declares a route and names its parameters as the stage's input. */
function registrationNaming(input?: string[]) {
  const schedule = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "schedule")!;
  const views = (schedule.manifest.ui.views ?? []).map(view => view.stage_data && input ? { ...view, stage_data: { ...view.stage_data, input } } : view);
  const page_routes: UiPageRouteDeclaration[] = [{ route_id: "task-page", path: "/tasks/:task_id", query: ["tab"] }];
  const manifest = { ...schedule.manifest, ui: { ...schedule.manifest.ui, views, page_routes } };
  return { registration: { ...schedule, manifest }, manifest };
}

test("RAC-2681 the Host gives a stage only the request parameters it names, from its own plugin's route", () => {
  const { registration, manifest } = registrationNaming(["task_id"]);
  assert.deepEqual(pageRouteProblems(manifest), []);
  const ask = (path: string) => { const { pathname, searchParams } = url(path); return matchDeclaredPageRoute([manifest], pathname, searchParams); };
  const requests = (path: string, shown: string[] = ["schedule"]) => declaredStageRequests(shown, ask(path), [registration]);
  // `tab` is a parameter the route declares and the request carries, but the stage does not name it; `secret` is declared by nothing.
  assert.deepEqual(requests("/tasks/t1?tab=files&secret=x&control_token=k"), { schedule: { task_id: "t1" } });
  assert.deepEqual(requests("/tasks/t1?tab=files"), { schedule: { task_id: "t1" } });
  // Over-long declared parameter: the whole match is refused, so the stage is given nothing (and the plugin's page answers its rejection).
  assert.deepEqual(requests("/tasks/" + "t".repeat(UI_PAGE_ROUTE_PARAM_LIMIT + 1)), {});
  // A path no route declares, a plugin the page does not show and another plugin's route give nothing.
  assert.deepEqual(requests("/elsewhere"), {});
  assert.deepEqual(requests("/tasks/t1", ["feed"]), {});
  assert.deepEqual(declaredStageRequests(["schedule"], { plugin_id: "io.example.other", route_id: "task-page", params: { task_id: "t1" } }, [registration]), {});
  assert.deepEqual(declaredStageRequests(["schedule"], null, [registration]), {});
  // A stage that names no input is given nothing even when its plugin's route matched.
  assert.deepEqual(declaredStageRequests(["schedule"], ask("/tasks/t1"), [registrationNaming().registration]), {});
});

test("RAC-2681 the Manifest refuses a stage input that names a parameter no route declares", () => {
  const { manifest } = registrationNaming(["task_id", "secret"]);
  assert.deepEqual(pageRouteProblems(manifest), ["视图 " + manifest.ui.views.find(view => view.stage_data)!.view_id + " 的 stage_data.input 指向 secret，本 Manifest 的 page_routes 没有这个参数"]);
});

const baseView = JSON.parse(readFileSync(new URL("fixtures/goals-page-golden/view.json", import.meta.url), "utf8")) as MolisWorkWebView;

test("RAC-2681 the stage model carries `request` only when the view has one for that plugin, and leaves a stage that names none as it was", () => {
  const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
  const view: MolisWorkWebView = { ...baseView, shown_plugins: ["schedule"], stage_data: { schedule: { tasks: [] } } };
  const plain = renderer.declaredStageModel("schedule", view) as Part;
  assert.equal("request" in plain, false, "no request without a declared input");
  assert.deepEqual(plain.data, { tasks: [] });
  const asked = renderer.declaredStageModel("schedule", { ...view, stage_request: { schedule: { task_id: "t1" }, feed: { x: "y" } } }) as Part;
  assert.deepEqual(asked.request, { task_id: "t1" }, "only this plugin's own request");
  assert.deepEqual(asked.data, { tasks: [] });
  assert.equal("request" in (renderer.declaredStageModel("schedule", { ...view, stage_request: { feed: { x: "y" } } }) as Part), false);
});
