import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { resolveGoalsReadRoute, resolveGoalsPageRoute, type GoalsReadRoute } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchGoalsFragmentRenderer, renderWorkbenchGoalsReadRoute, renderWorkbenchGoalsReadRequest, renderWorkbenchGoalsPageRequest,
  type GoalsReadRenderers } from "@molis-ai/molis-work-app-workbench";

test("fragment composition selects the correct owner and preserves collection restrictions, context and prefix behavior", () => {
  const goal = (goal_id: string, archived_at: string | null = null, trashed_at: string | null = null) =>
    ({ goal: { goal_id, archived_at, trashed_at } });
  const current = goal("same"), archived = goal("same", "date"), trash = goal("same", null, "date");
  const view = { goals: [current, goal("stale", "date")], archived_goals: [archived], trashed_goals: [trash], route_prefix: "/projects/project%2Fid" };
  const calls: { owner: string; args: unknown[] }[] = [];
  const render = (owner: string) => (...args: unknown[]) => { calls.push({ owner, args }); return owner; };
  const fragments = createWorkbenchGoalsFragmentRenderer<typeof current, typeof view>({
    document: render("document"), trash: render("trash"), momentum: render("momentum"),
    prefixLinks: (html, prefix) => { calls.push({ owner: "prefix", args: [html, prefix] }); return prefix + html; },
  });
  const check = (action: () => unknown, name: string, args: unknown[], prefixed = true) => {
    calls.length = 0;
    assert.equal(action(), prefixed ? view.route_prefix + name : name);
    assert.deepEqual(calls, [{ owner: name, args }, ...(prefixed ? [{ owner: "prefix", args: [name, view.route_prefix] }] : [])]);
  };
  check(() => fragments.renderGoalDocumentFragment(view, "same"), "document", [current, view]);
  check(() => fragments.renderGoalDocumentFragment(view, "same", "archive"), "document", [archived, view]);
  check(() => fragments.renderGoalDocumentFragment(view, "same", "trash"), "trash", [trash]);
  check(() => fragments.renderMolisWorkMomentumFragment(view, "same", "archive"), "momentum", [view, "same", view.archived_goals]);
  calls.length = 0;
  for (const action of [
    () => fragments.renderGoalDocumentFragment(view, "missing"),
    () => fragments.renderMolisWorkMomentumFragment(view, "same", "trash"),
  ]) assert.equal(action(), null);
  assert.deepEqual(calls, [], "Rejected surfaces do not invoke an owner or prefixer");
});

test("Workbench request dispatch rejects invalid requests before reading views or loading Project operations", async () => {
  const view = { goals: [{ goal: { goal_id: "current" } }], archived_goals: [{ goal: { goal_id: "archived" } }],
    trashed_goals: [{ goal: { goal_id: "trash" } }] };
  let reads = 0, renders = 0;
  const request = (method: string, path: string) => renderWorkbenchGoalsPageRequest(method, path,
    () => { reads++; return view; },
    async (input, selection) => { assert.equal(input, view); renders++; return JSON.stringify(selection); });
  for (const [method, path] of [["POST", "/goals/current"], ["GET", "/unrelated"]]) {
    assert.equal(await request(method, path), null);
  }
  assert.deepEqual(await request("GET", "/goals/%"), { status: 404, error: "Goal 页面不存在" });
  assert.equal(reads, 0);
  assert.equal(renders, 0);
  assert.deepEqual(await request("GET", "/goals/missing"), { status: 404, error: "找不到这个 Goal: missing" });
  assert.equal(reads, 1);
  assert.equal(renders, 0, "Missing Goals never load asynchronous page resources");
  for (const [path, goalId, archiveView, trashView, decisionView] of [
    ["/goals/current", "current", false, false, false],
    ["/goals/archived", "archived", true, false, false],
    ["/goals/trash", "trash", false, true, false],
    ["/archive/goals/trash", "trash", false, true, false],
    ["/archive", undefined, true, false, false],
    ["/trash", undefined, false, true, false],
    ["/decisions", undefined, false, false, true],
  ] as const) {
    const result = await request("GET", path);
    assert.ok(result && "html" in result);
    assert.deepEqual(JSON.parse(result.html), { ...(goalId ? { goalId } : {}), archiveView, trashView, decisionView });
  }
  assert.deepEqual(await request("GET", "/trash/goals/current"), { status: 404, error: "找不到这个 Goal: current" });
  let ownerLoads = 0;
  const owners = () => { ownerLoads++; throw new Error("Owner load"); };
  assert.equal(renderWorkbenchGoalsReadRequest("POST", "/api/goals/current/document", new URLSearchParams(), owners), null);
  assert.equal(renderWorkbenchGoalsReadRequest("GET", "/api/board", new URLSearchParams(), owners), null);
  assert.deepEqual(renderWorkbenchGoalsReadRequest("GET", "/api/goals/%/document", new URLSearchParams(), owners),
    { status: 404, error: "Goal 内容不存在" });
  assert.deepEqual(renderWorkbenchGoalsReadRequest("GET", "/api/board/refresh", new URLSearchParams("view=bad"), owners),
    { status: 400, error: "Goal 正文集合无效" });
  assert.equal(ownerLoads, 0);
  assert.throws(() => renderWorkbenchGoalsReadRequest("GET", "/api/board/refresh", new URLSearchParams(), owners), /Owner load/);
  assert.equal(ownerLoads, 1, "Recognized requests propagate provider failures to the existing HTTP error boundary");
});

test("public route descriptors decode once, preserve collection/offset boundaries and leave unrelated paths alone", () => {
  const read = (path: string) => { const url = new URL(path, "http://fixture.test"); return resolveGoalsReadRoute(url.pathname, url.searchParams); };
  assert.deepEqual(read("/api/goals/goal%252Fname/document?view=archive"), { route: { kind: "document", goal_id: "goal%2Fname", collection: "archive" } });
  assert.deepEqual(read("/api/board/refresh?goal_id=%20one%20&view=trash"), { route: { kind: "refresh", goal_id: "one", collection: "trash" } });
  assert.deepEqual(read("/api/board/momentum?goal_id=%20&view=archive"), { route: { kind: "momentum", goal_id: "", collection: "archive" } });
  assert.deepEqual(read("/api/goals/%/document?view=bad"), { status: 404, error: "Goal 内容不存在" });
  for (const path of ["/api/goals/one/draft", "/api/goals/one/panels/progress", "/api/goals/one/records", "/api/goals/one/quick-record", "/api/goals/one/record-events", "/api/goals/a/b/document", "/api/goals/one/document/", "/api/board"]) assert.equal(read(path), null, path);
  assert.deepEqual(resolveGoalsPageRoute("/"), { route: { collection: "current" } });
  assert.deepEqual(resolveGoalsPageRoute("/archive"), { route: { collection: "archive" } });
  assert.deepEqual(resolveGoalsPageRoute("/trash/goals/a%252Fb"), { route: { collection: "trash", goal_id: "a%2Fb" } });
  assert.deepEqual(resolveGoalsPageRoute("/goals/%"), { status: 404, error: "Goal 页面不存在" });
  for (const path of ["/decisions", "/settings/planning", "/goals/a/b", "/archive/", "/projects/one/goals/a"]) assert.equal(resolveGoalsPageRoute(path), null, path);
});

test("Workbench routes call only the selected owner with exact inputs and retain empty/missing response semantics", () => {
  const calls: Array<{ owner: string; args: unknown[] }> = [];
  const owner = (name: string) => (...args: unknown[]) => { calls.push({ owner: name, args }); return "<section>" + name + "</section>"; };
  const renderers: GoalsReadRenderers = { refresh: owner("refresh"), momentum: owner("momentum"), document: owner("document") };
  const cases: [GoalsReadRoute, string, unknown[]][] = [
    [{ kind: "refresh", collection: "trash" }, "refresh", [undefined, "trash"]],
    [{ kind: "momentum", collection: "archive", goal_id: "a/b" }, "momentum", ["a/b", "archive"]],
    [{ kind: "document", collection: "trash", goal_id: "a" }, "document", ["a", "trash"]],
  ];
  for (const [route, name, args] of cases) {
    calls.length = 0;
    assert.deepEqual(renderWorkbenchGoalsReadRoute(route, renderers), { status: 200, html: "<section>" + name + "</section>" });
    assert.deepEqual(calls, [{ owner: name, args }]);
  }
  assert.deepEqual(renderWorkbenchGoalsReadRoute({ kind: "refresh", collection: "current" }, { ...renderers, refresh: () => "" }), { status: 200, html: "" });
  assert.deepEqual(renderWorkbenchGoalsReadRoute({ kind: "document", collection: "current", goal_id: "missing" }, { ...renderers, document: () => "" }), { status: 404, error: "找不到这个 Goal: missing" });
});

test("Goal document HTTP routes retain bad-encoding, collection, offset, missing-content and response-header behavior", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-document-route-"));
  const databasePath = join(directory, "fixture.db");
  seedDemoBoard(databasePath);
  const server = createMolisWorkWebServer({ databasePath, boardId: DEMO_BOARD_ID, homeDirectory: directory, controlToken: "route-test-control-0123456789abcdef" });
  t.after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await rm(directory, { recursive: true, force: true }); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = "http://127.0.0.1:" + address.port;
  const cases: [string, number, string | null][] = [
    ["/api/board/refresh", 200, null], ["/api/board/momentum", 200, null],
    ["/api/board/refresh?view=bad", 400, "Goal 正文集合无效"],
    ["/api/board/momentum?view=trash", 400, "Goal 推进态势集合无效"],
    ["/api/goals/V1/document", 200, null],
    ["/api/goals/%/document?view=bad", 404, "Goal 内容不存在"],
    ["/api/goals/V1/document?view=", 400, "Goal 正文集合无效"],
    ["/api/goals/missing/document", 404, "找不到这个 Goal: missing"],
    ["/api/goals/V1/document?offset=-1", 200, null],
    ["/api/goals/V1/records", 404, "页面或接口不存在"],
    ["/api/goals/V1/quick-record", 404, "页面或接口不存在"],
    ["/api/goals/V1/panels/completion", 404, "页面或接口不存在"],
    ["/goals/%", 404, "Goal 页面不存在"], ["/archive/goals/%", 404, "Goal 页面不存在"],
    ["/trash/goals/%", 404, "Goal 页面不存在"], ["/goals/missing", 404, "找不到这个 Goal: missing"],
  ];
  for (const [path, expected, error] of cases) {
    const response = await fetch(origin + path);
    assert.equal(response.status, expected, path);
    if (error) assert.deepEqual(await response.json(), { error }, path);
    else {
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      const html = await response.text();
      if (path.includes("offset=9007199254740991")) assert.match(html, /data-has-more="false"/);
    }
  }
  const archive = await fetch(origin + "/api/goals/CORE/archive", {
    method: "POST",
    headers: { "content-type": "application/json", origin,
      "x-molis-work-control-token": "route-test-control-0123456789abcdef",
      "x-molis-work-idempotency-key": "route-archive-core" },
    body: JSON.stringify({ archived: true, reason: "Verify existing direct URL after archive" }),
  });
  assert.equal(archive.status, 200, await archive.text());
  const beforeReads = await (await fetch(origin + "/api/board")).json();
  for (const path of ["/goals/CORE", "/archive/goals/CORE", "/archive", "/trash", "/decisions"]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src/);
    const html = await response.text();
    if (path.endsWith("/CORE")) {
      assert.match(html, /data-board-view="archive"/);
      assert.match(html, /data-goal-view="CORE"/);
      assert.doesNotMatch(html, /data-draft-form/);
    }
    if (path === "/decisions") assert.match(html, /data-board-view="decisions"/);
  }
  const wrongCollection = await fetch(origin + "/trash/goals/CORE");
  assert.equal(wrongCollection.status, 404);
  assert.deepEqual(await wrongCollection.json(), { error: "找不到这个 Goal: CORE" });
  assert.deepEqual(await (await fetch(origin + "/api/board")).json(), beforeReads);
});
