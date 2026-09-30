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
import { UiViewRegistry } from "@molis-ai/molis-work-ui-host";
import { UI_VIEW_SLOTS } from "@molis-ai/molis-work-contracts/platform/ui";
import { inspectActionDeclarations } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  bindFileEntriesHandler, defineFileContentAction, defineFileEntriesAction, definePlugin, fileContentOf, fileEntriesPage, FILE_CONTENT_MAX_BYTES,
} from "../packages/plugin-sdk/src/index.js";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { localWebActionContext } from "../apps/local-host/dist/local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/dist/local-owner-permissions.js";
import { browserAddress } from "../apps/local-host/dist/browser/browser-host.js";
import { renderSidePanel } from "../apps/workbench/src/side-panel.js";

/*
 * The side panel as a platform capability (specs/side-panel §3.3, D11, D13): the file source protocol, the `side`
 * slot, the Host's file routes through the action directory, and a plugin nobody told the Host about joining by its
 * declarations alone and leaving when it stops.
 */

const kinds = [{ kind: "memo", title: "备忘", surface: "memos" }];
const canonical = (value: unknown) => JSON.stringify(value);

test("file source declarations pass the manifest check only in the protocol's exact shape", () => {
  const entries = defineFileEntriesAction("memos.files.entries", kinds, "备忘", ["memos:read"]);
  const content = defineFileContentAction("memos.files.content", kinds, "备忘", ["memos:read"]);
  assert.deepEqual(inspectActionDeclarations([entries, content]), []);
  assert.equal(entries.action.file_source?.role, "entries");
  assert.deepEqual(entries.action.audiences, ["user"], "a side panel source is for the person unless its owner widens it");
  const closedToUser = { ...entries, action: { ...entries.action, audiences: ["agent" as const] } };
  assert.match(inspectActionDeclarations([closedToUser]).join(""), /文件来源协议/u);
  const wrongRole = { ...content, action: { ...content.action, file_source: { kinds, role: "entries" as const } } };
  assert.match(inspectActionDeclarations([wrongRole]).join(""), /文件来源协议/u);
  const loose = { ...entries, action: { ...entries.action, output_schema: { type: "object" } } };
  assert.match(inspectActionDeclarations([loose]).join(""), /文件来源协议/u);
  void canonical;
});

test("file entries page by kind and id with a revision over every entry; previews are bounded", () => {
  const entry = (id: string, revision = "1") => ({ subject: { kind: "memo", id }, revision, title: id, folder: [], media_type: "text/plain", size: null, updated_at: null, open: null });
  const first = fileEntriesPage([entry("b"), entry("a"), entry("c")], { cursor: null, limit: 2 });
  assert.deepEqual(first.entries.map(item => item.subject.id), ["a", "b"]);
  const second = fileEntriesPage([entry("b"), entry("a"), entry("c")], { cursor: first.next_cursor, limit: 2 });
  assert.deepEqual(second.entries.map(item => item.subject.id), ["c"]);
  assert.equal(second.next_cursor, null);
  assert.notEqual(fileEntriesPage([entry("a", "2")], { cursor: null, limit: 5 }).collection_revision, fileEntriesPage([entry("a", "1")], { cursor: null, limit: 5 }).collection_revision);
  assert.throws(() => fileEntriesPage([entry("a"), entry("a")], { cursor: null, limit: 5 }), /重复/u);
  const long = fileContentOf({ subject: { kind: "memo", id: "a" }, revision: "1", title: "a", media_type: "text/plain", text: "x".repeat(FILE_CONTENT_MAX_BYTES) });
  assert.equal(long.truncated, true);
  assert.ok(long.data.length < FILE_CONTENT_MAX_BYTES);
  const image = fileContentOf({ subject: { kind: "memo", id: "i" }, revision: "1", title: "i", media_type: "image/png", bytes: new Uint8Array([137, 80, 78, 71]) });
  assert.deepEqual({ encoding: image.encoding, data: image.data }, { encoding: "base64", data: "iVBORw==" });
  assert.throws(() => fileContentOf({ subject: { kind: "memo", id: "big" }, revision: "1", title: "big", media_type: "image/png", bytes: new Uint8Array(FILE_CONTENT_MAX_BYTES + 1) }), /太大/u);
});

test("the side slot places a plugin's tab only while the plugin is enabled, and the panel renders it as a frame", () => {
  assert.equal(UI_VIEW_SLOTS.includes("side"), true);
  const manifest = { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.side", version: "1.0.0", name: "侧栏样例", kind: "native",
    publisher: { publisher_id: "example", signature: "example-side" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: ["io.molis.work.example.side.notes"], views: [{ view_id: "notes", slot: "side", title: "随手记", icon: "note" }] } } as const;
  assert.deepEqual(new UiViewRegistry([{ manifest: manifest as never, enabled: true }]).slot("side").map(view => view.view_id), ["notes"]);
  assert.deepEqual(new UiViewRegistry([{ manifest: manifest as never, enabled: false }]).slot("side"), [], "a disabled plugin leaves no tab behind");
  const html = renderSidePanel({ L: text => text, escapeHtml: value => String(value), icon: name => `<svg data-icon="${name}"></svg>` },
    [{ key: "example/notes", title: "随手记", icon: "note", src: "/projects/p1/side/example/notes" }]);
  assert.match(html, /data-side-tab="plugin:example\/notes"/u);
  assert.match(html, /data-side-src="\/projects\/p1\/side\/example\/notes"/u);
  assert.match(html, /data-side-tab="discussion"[\s\S]*data-side-tab="browser"[\s\S]*data-side-tab="files"/u);
  assert.doesNotMatch(html, /assistant-/u, "the panel stays out of the Assistant's classes");
});

test("the address bar opens web addresses, searches the rest and refuses other schemes", () => {
  assert.deepEqual(browserAddress("example.com/docs"), { url: "https://example.com/docs" });
  assert.deepEqual(browserAddress("localhost:3000"), { url: "http://localhost:3000/" });
  assert.deepEqual(browserAddress("https://example.com/a?b=1"), { url: "https://example.com/a?b=1" });
  assert.deepEqual(browserAddress(""), { url: "about:blank" });
  assert.match((browserAddress("怎么写周报") as { url: string }).url, /^https:\/\/www\.bing\.com\/search\?q=/u);
  for (const blocked of ["file:///etc/passwd", "javascript:alert(1)", "chrome://settings", "data:text/html,hi"]) {
    assert.ok("blocked" in browserAddress(blocked), blocked);
  }
});

test("real Host: the file tab lists and previews plugin files through the action directory; a new plugin joins by declaring and leaves when stopped", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "side-panel-files-"));
  const [a] = await withCatalog({ homeDirectory: home }, async catalog => [await catalog.createProject({ display_name: "侧栏项目", actor_id: "owner" })]);
  await withCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: a.project_id, plugin_id: "pages", actor_id: "owner" }));
  const ref = molisWorkHostProjectReference({ databasePath: a.database_path, boardId: a.board_id, projectId: a.project_id });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  let runtime: PluginRuntime | undefined;
  try {
    const owner = await localWebActionContext(host, ref, LOCAL_OWNER_PERMISSIONS);
    await host.actionClient(ref).invoke(owner, { capability_id: pagesActions.create.capability_id, version: 1 }, { title: "周报草稿", markdown: "# 本周\n\n- 完成侧栏" });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const get = async (path: string) => { const response = await fetch(`${origin}/projects/${a.project_id}${path}`); return { status: response.status, body: await response.json() as Record<string, any> }; };

    const sources = (await get("/api/side/files/sources")).body.sources as Array<{ id: string; plugin_id: string; kinds: Array<{ kind: string }> }>;
    const pages = sources.find(source => source.kinds.some(kind => kind.kind === "pages_document"));
    assert.ok(pages, JSON.stringify(sources));
    const listed = (await get(`/api/side/files/entries?source=${encodeURIComponent(pages.id)}`)).body.page.entries as Array<{ title: string; subject: { kind: string; id: string }; media_type: string }>;
    assert.deepEqual(listed.map(entry => entry.title), ["周报草稿"]);
    const preview = await get(`/api/side/files/content?source=${encodeURIComponent(pages.id)}&kind=pages_document&id=${encodeURIComponent(listed[0]!.subject.id)}&media_type=text/markdown`);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.via, "reader", "Pages declares no preview action: its subject reader supplies the text");
    assert.match(preview.body.content.data, /完成侧栏/u);

    // A plugin nobody told the Host about: its declarations alone put its files in the panel.
    const entries = defineFileEntriesAction("newcomer.files.entries", [{ kind: "newcomer-file", title: "新插件文件", surface: "newcomer" }], "新插件文件", ["newcomer:read"]);
    const content = defineFileContentAction("newcomer.files.content", [{ kind: "newcomer-file", title: "新插件文件", surface: "newcomer" }], "新插件文件", ["newcomer:read"]);
    const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.newcomer-files", version: "1.0.0", name: "新插件",
      kind: "app", publisher: { publisher_id: "example", signature: "example-newcomer" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: [{ permission: "newcomer:read", required: false, reason: "读取文件" }], actions: [entries, content], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
      async start() { return { kind: "app", actions: [
        { ...entries, ...bindFileEntriesHandler(entries, () => [{ subject: { kind: "newcomer-file", id: "f1" }, revision: "1", title: "说明.txt", folder: ["资料"], media_type: "text/plain", size: 12, updated_at: null, open: null }]) },
        { ...content, handle: () => fileContentOf({ subject: { kind: "newcomer-file", id: "f1" }, revision: "1", title: "说明.txt", media_type: "text/plain", text: "新插件自己的文件内容" }) },
      ] }; } });
    const repository = await host.withProject(ref, projectRuntime => new SqlitePluginRuntimeRepository(projectRuntime.store.db));
    runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(ref), project_id: ref.project_id } });
    const installId = runtime.install({ definition: plugin, deployment: "local", grants: ["newcomer:read"] }).install.install_id;
    await runtime.start(installId);
    const joined = ((await get("/api/side/files/sources")).body.sources as typeof sources).find(source => source.kinds.some(kind => kind.kind === "newcomer-file"));
    assert.ok(joined, "declared and running: listed");
    const newcomerFiles = (await get(`/api/side/files/entries?source=${encodeURIComponent(joined.id)}`)).body.page.entries as typeof listed;
    assert.deepEqual(newcomerFiles.map(entry => entry.title), ["说明.txt"]);
    const newcomerPreview = await get(`/api/side/files/content?source=${encodeURIComponent(joined.id)}&kind=newcomer-file&id=f1`);
    assert.equal(newcomerPreview.body.via, "content");
    assert.equal(newcomerPreview.body.content.data, "新插件自己的文件内容");
    await runtime.stop(installId);
    const after = (await get("/api/side/files/sources")).body.sources as typeof sources;
    assert.equal(after.some(source => source.kinds.some(kind => kind.kind === "newcomer-file")), false, "stopped: gone from the panel");
    assert.equal((await get(`/api/side/files/entries?source=${encodeURIComponent(joined.id)}`)).status, 404);

    // Another project's route never reaches this project's files.
    const [b] = await withCatalog({ homeDirectory: home }, async catalog => [await catalog.createProject({ display_name: "别的项目", actor_id: "owner" })]);
    const other = await fetch(`${origin}/projects/${b.project_id}/api/side/files/entries?source=${encodeURIComponent(pages.id)}`);
    const otherBody = await other.json() as { page?: { entries: unknown[] } };
    assert.ok(other.status === 404 || (otherBody.page?.entries.length ?? 0) === 0, "project boundary");
    void randomUUID;
  } finally {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
