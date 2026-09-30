import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { formActions } from "@molis-ai/molis-work-plugin-form";
import { lingguangActions } from "@molis-ai/molis-work-plugin-lingguang";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { cogniaActions } from "@molis-ai/molis-work-plugin-cognia";
import { shelfActions } from "@molis-ai/molis-work-plugin-shelf";
import { searchActions, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindSearchEntriesHandler, defineSearchEntriesAction, definePlugin, defineSubjectContextAction, subjectContext } from "../packages/plugin-sdk/src/index.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const ids = (response: SearchQueryResponse) => response.hits.map(hit => `${hit.plugin_id}:${hit.subject.kind}`).sort();

test("real Host: unopened content of every wired plugin is searchable, kept current, scoped and opened by its owner", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "system-search-host-"));
  const [a, b] = await withCatalog({ homeDirectory: home }, async catalog => [
    await catalog.createProject({ display_name: "搜索项目甲", actor_id: "owner" }),
    await catalog.createProject({ display_name: "搜索项目乙", actor_id: "owner" }),
  ]);
  const refA = molisWorkHostProjectReference({ databasePath: a.database_path, boardId: a.board_id, projectId: a.project_id });
  const refB = molisWorkHostProjectReference({ databasePath: b.database_path, boardId: b.board_id, projectId: b.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  let runtime: PluginRuntime | undefined;
  try {
    const owner = (reference: typeof refA) => localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
    const call = async <I, O>(reference: typeof refA, definition: ActionDefinition<I, O>, input: I) =>
      await host.actionClient(reference).invoke(await owner(reference), definition, input) as O;
    const search = (reference: typeof refA, query: string, extra: Record<string, unknown> = {}) => call(reference, searchActions.query, { query, ...extra });

    // Content created through the owners' own actions. Nothing here opens a page or asks search to update.
    const page = (await call(refA, pagesActions.create, { title: "第四季度计划要点", body: doc("预算控制在50万以内，上线前完成法务审核。") })).document;
    const form = (await call(refA, formActions.create, { title: "客户满意度回访" })).form;
    await call(refA, formActions.update, { id: form.id, expected_version: form.version, description: "回访季度OKR执行情况", questions: [{ id: "q1", type: "text", title: "你对交付速度满意吗", required: true, order: 0, options: [] }] });
    const spark = (await call(refA, lingguangActions.create, { title: "灵光：搜索用短词", body: "中文两字查询要可靠" })).spark;
    await call(refA, goalsActions.create, { title: "上线系统级搜索", outcome: "用户能搜到未打开页面的内容", why: "工作台搜索只看当前页面", idempotency_key: randomUUID() });
    await call(refB, pagesActions.create, { title: "乙项目的预算", body: doc("乙项目预算只在乙项目里") });

    const first = await search(refA, "预算");
    assert.deepEqual(ids(first), ["io.molis.work.pages:pages_document"], JSON.stringify(first.sources));
    assert.equal(first.hits[0]!.title, "第四季度计划要点");
    assert.deepEqual(first.hits[0]!.open, { surface: "pages", id: page.id });
    assert.equal(first.hits[0]!.locator.text, "预算");
    assert.ok(first.sources.some(source => source.plugin_id === "io.molis.work.goals" && source.state === "ready"));
    assert.deepEqual(ids(await search(refA, "OKR")), ["io.molis.work.form:form"]);
    assert.deepEqual(ids(await search(refA, "满意")), ["io.molis.work.form:form"]);
    assert.deepEqual(ids(await search(refA, "两字")), ["io.molis.work.lingguang:lingguang_spark"]);
    assert.deepEqual(ids(await search(refA, "系统级搜索")), ["io.molis.work.goals:goal"]);
    assert.deepEqual(ids(await search(refA, "法务", { scope: "personal" })), [], "project content is not personal content");
    assert.deepEqual(ids(await search(refB, "预算")).length, 1);
    assert.equal((await search(refB, "预算")).hits[0]!.title, "乙项目的预算");

    // Personal (Home) content: one Cognia material, found from either project and from outside any project, never as project content.
    const personalCaller = await localWebActionContext(host, undefined, LOCAL_OWNER_PERMISSIONS);
    await host.homeActionClient().invoke(personalCaller, cogniaActions.createMaterial, { title: "个人知识：鲸落", body: "鲸落是深海生态的重要养分来源" });
    for (const reference of [refA, refB]) assert.deepEqual(ids(await search(reference, "鲸落")), ["io.molis.work.cognia:cognia_material"]);
    assert.deepEqual(ids(await search(refA, "鲸落", { scope: "project" })), []);
    const homeOnly = await host.homeActionClient().invoke(personalCaller, searchActions.query, { query: "深海生态" }) as SearchQueryResponse;
    assert.deepEqual(ids(homeOnly), ["io.molis.work.cognia:cognia_material"]);
    assert.ok(homeOnly.sources.every(source => source.scope === "personal"), "a caller without a project sees no project source");

    // Shelf: a material reaches as far as it is readable; clipboard history stays with the local person, as every clipboard action does.
    await host.homeActionClient().invoke(personalCaller, shelfActions.admit, { text: "置物架里的抹香鲸观察笔记", title: "抹香鲸观察", capture_pages: false });
    await host.homeActionClient().invoke(personalCaller, shelfActions.clip, { text: "剪贴板里的抹香鲸暗号 7731" });
    assert.deepEqual(ids(await search(refA, "抹香鲸")), ["io.molis.work.shelf:shelf_clip", "io.molis.work.shelf:shelf_item"]);
    const agent: ActionCallContext = { ...await owner(refA), actor_id: "agent:reader", audience: "agent" };
    const agentSees = await host.actionClient(refA).invoke(agent, searchActions.query, { query: "抹香鲸" }) as SearchQueryResponse;
    assert.deepEqual(ids(agentSees), ["io.molis.work.shelf:shelf_item"], "an Agent never finds clipboard history");
    assert.ok(!JSON.stringify(agentSees).includes("7731"), "not even in a snippet or a source status");
    const shelfClient: ActionCallContext = { actor_id: "mcp:shelf-client", project_id: refA.project_id, audience: "mcp", permissions: ["search:read", "shelf:read"],
      allowed_actions: [searchActions.query, shelfActions.searchEntries, shelfActions.clipboardSearchEntries].map(definition => ({ capability_id: definition.capability_id, version: definition.version })) };
    assert.deepEqual(ids(await host.actionClient(refA).invoke(shelfClient, searchActions.query, { query: "暗号" }) as SearchQueryResponse), [], "a grant cannot widen a local-only source");

    // A change through the owner's command is visible to the next query; the old words are gone.
    await call(refA, pagesActions.update, { id: page.id, expected_version: page.version, body: doc("成本控制在六十万以内。") });
    assert.deepEqual(ids(await search(refA, "预算")), []);
    assert.deepEqual(ids(await search(refA, "六十万")), ["io.molis.work.pages:pages_document"]);
    const hit = (await search(refA, "六十万")).hits[0]!;
    const opened = await call(refA, searchActions.open, { hit_id: hit.hit_id });
    assert.equal(opened.state, "ok");
    await call(refA, lingguangActions.discard, { ids: [spark.id] });
    assert.deepEqual(ids(await search(refA, "两字")), [], "a discarded spark leaves the results");
    await call(refA, pagesActions.delete, { id: page.id });
    assert.deepEqual(ids(await search(refA, "六十万")), []);
    assert.equal((await call(refA, searchActions.open, { hit_id: hit.hit_id })).state, "missing");

    // An external client sees only what it was granted, through the same action.
    const mcp = (allowed: ActionDefinition[]): ActionCallContext => ({ actor_id: "mcp:test-client", project_id: refA.project_id, audience: "mcp",
      permissions: [...new Set(allowed.flatMap(definition => definition.action.permissions))],
      allowed_actions: allowed.map(definition => ({ capability_id: definition.capability_id, version: definition.version })) });
    const asClient = (allowed: ActionDefinition[], query: string) => host.actionClient(refA).invoke(mcp(allowed), searchActions.query, { query }) as Promise<SearchQueryResponse>;
    await assert.rejects(asClient([], "OKR"), (error: { code?: string }) => ["actions.forbidden", "actions.missing"].includes(error.code ?? ""));
    assert.deepEqual(ids(await asClient([searchActions.query], "OKR")), [], "search itself grants no content");
    assert.deepEqual(ids(await asClient([searchActions.query, formActions.searchEntries, formActions.subject], "OKR")), ["io.molis.work.form:form"]);
    assert.deepEqual(ids(await asClient([searchActions.query, formActions.searchEntries], "满意")), [], "reader-provided text needs the reader grant");

    // A plugin nobody told the Host about joins by declaring the protocol, through the real Plugin Runtime.
    const entries = defineSearchEntriesAction("newcomer.search.entries", [{ kind: "newcomer-note", title: "新插件笔记", surface: "newcomer" }], "新插件笔记", ["newcomer:read"]);
    const reader = defineSubjectContextAction("newcomer.subject.read", "newcomer-note", "新插件笔记", ["newcomer:read"]);
    const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.newcomer-search", version: "1.0.0", name: "新插件",
      kind: "app", publisher: { publisher_id: "example", signature: "example-newcomer" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [{ permission: "newcomer:read", required: false, reason: "读取笔记" }], actions: [entries, reader], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
      async start() { return { kind: "app", actions: [
        { ...entries, ...bindSearchEntriesHandler(entries, () => [{ subject: { kind: "newcomer-note", id: "n1" }, revision: "1", title: "新来的笔记", summary: "",
          updated_at: null, content: "context", open: { surface: "newcomer", id: "n1" } }]) },
        { ...reader, handle: () => subjectContext({ subject: { kind: "newcomer-note", id: "n1" }, revision: "1", title: "新来的笔记", content: "插件自己的正文里有鲸鱼", goal_ids: [], session_id: null }) },
      ] }; } });
    const repository = await host.withProject(refA, projectRuntime => new SqlitePluginRuntimeRepository(projectRuntime.store.db));
    runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(refA), project_id: refA.project_id } });
    const installId = runtime.install({ definition: plugin, deployment: "local", grants: ["newcomer:read"] }).install.install_id;
    await runtime.start(installId);
    const newcomer = await search(refA, "鲸鱼");
    assert.deepEqual(newcomer.hits.map(item => item.title), ["新来的笔记"]);
    assert.deepEqual(newcomer.hits[0]!.open, { surface: "newcomer", id: "n1" });
    await runtime.stop(installId);
    assert.deepEqual(ids(await search(refA, "鲸鱼")), [], "a stopped plugin leaves nothing searchable");

    // The Workbench route is the same action with the person's own authority in that project.
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: unknown, authorized = true) => fetch(`${origin}${path}`, { method: "POST", headers: { "content-type": "application/json", origin,
      ...(authorized ? { "x-molis-work-control-token": token } : {}), "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body) });
    assert.equal((await post(`/projects/${a.project_id}/api/search/query`, { query: "OKR" }, false)).status, 403);
    const viaHttp = await post(`/projects/${a.project_id}/api/search/query`, { query: "OKR" });
    assert.equal(viaHttp.status, 200, await viaHttp.clone().text());
    assert.deepEqual(ids(await viaHttp.json() as SearchQueryResponse), ["io.molis.work.form:form"]);
    const personal = await post("/api/search/query", { query: "OKR" });
    assert.equal(personal.status, 200, await personal.clone().text());
    assert.deepEqual(ids(await personal.json() as SearchQueryResponse), [], "the project list page searches personal content only");
  } finally {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
