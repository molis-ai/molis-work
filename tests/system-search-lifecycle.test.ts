import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { formActions } from "@molis-ai/molis-work-plugin-form";
import { searchActions, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";
import { projectActionAvailability } from "../apps/local-host/dist/project-action-availability.js";
import { hostActionToolName, createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { assistantAuthority, actionKey } from "../apps/local-host/dist/assistant/assistant-authority.js";
import type { StoredWork } from "../apps/local-host/dist/assistant/assistant-store.js";
import { SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";

const titles = (response: SearchQueryResponse) => response.hits.map(hit => hit.title).sort();

test("a plugin disabled in the project leaves the results and comes back when enabled; restart keeps the index; a lost index is rebuilt",
  { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "system-search-lifecycle-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "生命周期", actor_id: "owner" }));
  await withCatalog({ homeDirectory: home }, catalog => { catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "owner" }); });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const open = () => new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: projectActionAvailability(withCatalog, home) });
  let host = open();
  try {
    const call = async <I, O>(definition: ActionDefinition<I, O>, input: I) =>
      await host.actionClient(reference).invoke(await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS), definition, input) as O;
    const search = (query: string) => call(searchActions.query, { query });
    await call(goalsActions.create, { title: "季度复盘会议", outcome: "复盘结论写进文档", idempotency_key: randomUUID() });
    const first = await search("复盘");
    assert.deepEqual(titles(first), ["季度复盘会议"]);
    const indexedAt = first.sources.find(source => source.plugin_id === "io.molis.work.goals")!.indexed_at;
    assert.ok(indexedAt);

    await withCatalog({ homeDirectory: home }, catalog => { catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "owner" }); });
    const disabled = await search("复盘");
    assert.deepEqual(titles(disabled), []);
    assert.equal(disabled.sources.find(source => source.plugin_id === "io.molis.work.goals")?.state, "disabled");

    await withCatalog({ homeDirectory: home }, catalog => { catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "owner" }); });
    const enabled = await search("复盘");
    assert.deepEqual(titles(enabled), ["季度复盘会议"], "re-enabled, the plugin is indexed again from its own data");
    const reindexedAt = enabled.sources.find(source => source.plugin_id === "io.molis.work.goals")!.indexed_at;

    // Restart: the index is where it was; an unchanged collection is not rebuilt.
    await host.close();
    host = open();
    const afterRestart = await search("复盘");
    assert.deepEqual(titles(afterRestart), ["季度复盘会议"]);
    assert.equal(afterRestart.sources.find(source => source.plugin_id === "io.molis.work.goals")!.indexed_at, reindexedAt);

    // The index file is lost while the Host is closed: the next Host rebuilds it from the owners.
    await host.close();
    for (const suffix of ["", "-wal", "-shm"]) { const file = homeSqlitePath(home, "search") + suffix; if (existsSync(file)) rmSync(file); }
    host = open();
    assert.deepEqual(titles(await search("复盘")), ["季度复盘会议"]);
    await call(goalsActions.create, { title: "复盘之后的行动", outcome: "按复盘结论排期", idempotency_key: randomUUID() });
    assert.deepEqual(titles(await search("复盘")), ["复盘之后的行动", "季度复盘会议"]);
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("an external MCP client searches through the same action with only what it was granted", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "system-search-mcp-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "MCP 搜索", actor_id: "user" }));
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  let sdk: Client | undefined;
  try {
    const owner = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
    const form = (await host.actionClient(reference).invoke(owner, formActions.create, { title: "采购审批问卷" }) as { form: { id: string; version: number } }).form;
    await host.actionClient(reference).invoke(owner, formActions.update, { id: form.id, expected_version: form.version, description: "预算审批流程" });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    await withCatalog({ homeDirectory: home }, catalog => catalog.bindRuntimeContext({
      context: { runtime_id: "search-client", stable_work_context_id: "search-session", host_declares_stable: true },
      project_id: project.project_id, actor_id: "user", user_confirmed: true,
    }));
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
      fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        MOLIS_WORK_HOME: home, MOLIS_WORK_RUNTIME_ID: "search-client", MOLIS_WORK_WEB_URL: origin,
        MOLIS_WORK_WORK_CONTEXT_ID: "search-session", MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
      }, stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", chunk => { errors += String(chunk); });
    sdk = new Client({ name: "search-client", version: "1" });
    await sdk.connect(transport).catch(error => { throw new Error(String(error) + errors); });
    const clientId = "runtime:search-client";
    const caller = { actor_id: clientId, project_id: project.project_id, audience: "mcp" as const, permissions: [] };
    const views = await host.inspectActions(caller, reference);
    const view = (definition: ActionDefinition) => views.find(item => item.capability_id === definition.capability_id && item.version === definition.version)!;
    const searchTool = hostActionToolName({ ...searchActions.query, provider_id: view(searchActions.query).provider.provider_id });
    assert.equal((await sdk.listTools()).tools.some(tool => tool.name === searchTool), false, "search is not offered before the person grants it");
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, null, view(searchActions.query), true));
    assert.ok((await sdk.listTools()).tools.some(tool => tool.name === searchTool));
    const ask = async (query: string) => {
      const result = await sdk!.callTool({ name: searchTool, arguments: { query } });
      assert.equal(result.isError, false, JSON.stringify(result));
      return result.structuredContent as SearchQueryResponse;
    };
    assert.deepEqual(titles(await ask("采购")), [], "granting search alone reveals no content");
    const entriesGrant = createMcpActionGrant(clientId, project.project_id, view(formActions.searchEntries), true);
    await writeMcpActionGrant(home, entriesGrant);
    await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, view(formActions.subject), true));
    assert.deepEqual(titles(await ask("采购")), ["采购审批问卷"]);
    assert.deepEqual(titles(await ask("预算审批")), ["采购审批问卷"], "body text is visible once the reader is granted too");
    await writeMcpActionGrant(home, { ...entriesGrant, enabled: false });
    assert.deepEqual(titles(await ask("采购")), [], "revoking the source removes its results at once");
  } finally {
    await sdk?.close().catch(() => undefined);
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("the Assistant finds content through search.query and reads the hit through the owner's reader, with its own switches honored", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "system-search-assistant-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "助理检索", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const owner = await localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS);
    const form = (await host.actionClient(reference).invoke(owner, formActions.create, { title: "新员工入职问卷" }) as { form: { id: string; version: number } }).form;
    await host.actionClient(reference).invoke(owner, formActions.update, { id: form.id, expected_version: form.version, description: "入职第一周的设备与账号准备" });
    const work = { work_id: "work-search", actor_id: "web-user", project_ref: reference, session_id: null } as unknown as StoredWork;
    const off = new Set<string>();
    const gateway = await assistantAuthority(host, work, () => off).actions!("prologue");
    const directory = async () => await gateway.discover();
    const find = async (capability: string) => (await directory()).find(view => view.capability_id === capability && view.availability.available);
    const query = await find(searchActions.query.capability_id);
    assert.ok(query, "search is one of the Assistant's read capabilities in its work's scope");
    const ref = (view: NonNullable<typeof query>) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
    const result = await gateway.invoke(ref(query), { query: "账号准备" }) as SearchQueryResponse;
    assert.deepEqual(result.hits.map(hit => hit.title), ["新员工入职问卷"]);
    // The hit names the object; the Assistant reads its current text through the same reader the Workbench opens by.
    const hit = result.hits[0]!;
    const reader = (await directory()).find(view => view.action.input_type === SUBJECT_REFERENCE_TYPE && view.action.output_type === SUBJECT_CONTEXT_TYPE
      && view.action.subject_kinds.includes(hit.subject.kind) && view.provider.provider_id === hit.source.provider_id)!;
    const context = await gateway.invoke(ref(reader), { subject_id: hit.subject.id }) as ActionSubjectContext;
    assert.equal(context.subject.id, form.id);
    assert.match(context.content, /设备与账号准备/);
    assert.deepEqual(context.open, hit.open);
    // Switching the source off for the Assistant removes its results from the Assistant's searches, and only there.
    const entries = (await directory()).find(view => view.capability_id === formActions.searchEntries.capability_id)!;
    off.add(actionKey(ref(entries)));
    assert.deepEqual(((await gateway.invoke(ref(query), { query: "账号准备" })) as SearchQueryResponse).hits, []);
    const forPerson = await host.actionClient(reference).invoke(owner, searchActions.query, { query: "账号准备" }) as SearchQueryResponse;
    assert.deepEqual(forPerson.hits.map(item => item.title), ["新员工入职问卷"]);
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
