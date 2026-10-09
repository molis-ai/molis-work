import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { MemoryPluginRuntimeRepository, PluginRuntime, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { filesActions, filesManifest, FILES_ACTIONS } from "@molis-ai/molis-work-plugin-files";
import { gitActions, gitManifest, GIT_ACTIONS } from "@molis-ai/molis-work-plugin-git";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DEMO_PROJECT_ID, HOST_PROVIDER_ID, LocalProjectDatabase, MolisWorkLocalHost, PluginHostExecutor, molisWorkHostProjectReference, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const readFile = workspaceReadActions.file, readGit = workspaceReadActions.git;
const sideEntries = FILES_ACTIONS.find(definition => definition.capability_id === "files.side.entries")!;
const sideContent = FILES_ACTIONS.find(definition => definition.capability_id === "files.side.content")!;
const WORKSPACE_FILE_KIND = sideEntries.action.file_source!.kinds[0]!.kind;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

test("a Runtime plugin reaches a Host action only when its Manifest consumes it: as the plugin audience, with its own grants, that exact action", async () => {
  const home = mkdtempSync(join(tmpdir(), "workspace-read-executor-")), file = join(home, "board.sqlite");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const service = new ActionService();
  const seen: ActionCallContext[] = [];
  const reads = { host: 0, other: 0 };
  service.registerProvider({ provider: { provider_id: HOST_PROVIDER_ID, title: "Molis Work", kind: "system" }, definitions: [readFile],
    handlers: [{ ...readFile, handle: context => { reads.host++; seen.push(context); return { outcome: "directory", entries: [], truncated: false }; } }] });
  // Another plugin's action, offered to plugins too: listing it under consumes does not reach it.
  const other: ActionDefinition = { capability_id: "other.read", version: 1, operation: "query", action: { title: "Other", description: "Another plugin's read", kind: "query", scope: "project",
    audiences: ["agent"], permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "object" } } };
  service.registerProvider({ provider: { provider_id: "io.molis.work.other", title: "Other", kind: "plugin", project_id: DEMO_PROJECT_ID }, definitions: [other],
    handlers: [{ ...other, handle: () => { reads.other++; return {}; } }] });
  const actions = { registry: service, client: service, project_id: DEMO_PROJECT_ID };
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event) }), processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event) });
  const privateStorage = new SqlitePluginPrivateStorage(store.db);
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, project_id: DEMO_PROJECT_ID, actor_id: "owner", artifacts, processItems,
    ui: new UiHost(), privateStorageFor: (context, manifest) => privateStorage.forPlugin(context, manifest) }), { actions });
  const contexts = new Map<string, PluginStartContext>();
  const pluginFor = (name: string, consumes: string[], ownAction = true): PluginDefinition => {
    const own: ActionDefinition = { capability_id: `${name}.list`, version: 1, operation: "query", action: { title: name, description: "Lists through the workspace read", kind: "query", scope: "project",
      audiences: ["user"], permissions: ["workspace:read"], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "object" },
      required_actions: [{ capability_id: readFile.capability_id, version: readFile.version }] } };
    return { manifest: { schema_version: 2, host_api_version: 2, plugin_id: `io.molis.work.example.${name}`, version: "1.0.0", name, kind: "app",
        publisher: { publisher_id: "example", signature: `example-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
        permissions: [{ permission: "workspace:read", required: false, reason: "Reads the linked folder" }], capabilities: { provides: [], consumes },
        artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: ownAction ? [own] : [], routes: [] },
      async start(context) { contexts.set(name, context); return { kind: "app", actions: ownAction ? [{ ...own, handle: () => ({}) }] : [], routes: [] }; } };
  };
  try {
    const start = async (name: string, consumes: string[], grants: string[], ownAction = true) => {
      const installed = runtime.install({ definition: pluginFor(name, consumes, ownAction), deployment: "local", grants }).install;
      await runtime.start(installed.install_id);
      return installed;
    };
    const reader = await start("reader", [readFile.capability_id, other.capability_id], ["workspace:read"]);
    const silent = await start("silent", [], ["workspace:read"]);
    const ungranted = await start("ungranted", [readFile.capability_id], []);
    const query = { workspace_id: "w", path: [], kind: "bytes" as const };

    // The one that lists the action reaches it, including the whole-file mode, as the plugin audience with exactly that grant.
    const client = contexts.get("reader")!.services!.actions!;
    assert.deepEqual(await client.invoke(readFile, query), { outcome: "directory", entries: [], truncated: false });
    assert.equal(reads.host, 1);
    const call = seen[0]!;
    assert.equal(call.audience, "plugin");
    assert.equal(call.host_plugin?.plugin_id, "io.molis.work.example.reader");
    assert.equal(call.plugin_install_id, reader.install_id);
    assert.deepEqual(call.permissions, ["workspace:read"]);
    assert.deepEqual(call.allowed_actions, [{ capability_id: readFile.capability_id, version: 1, provider_id: HOST_PROVIDER_ID }]);
    // The input schema is the action's own: a mode it does not have is refused before the handler runs.
    await assert.rejects(client.invoke(readFile, { ...query, kind: "everything" as never }));
    await assert.rejects(client.invoke(readFile, { ...query, extra: true } as never));
    assert.equal(reads.host, 1);
    // What the plugin sees of the directory is its own actions, and the dependency of its action is satisfied.
    const own = await client.discover();
    assert.deepEqual(own.map(view => view.capability_id), ["reader.list"]);
    assert.equal(own[0]!.availability.available, true);
    // Another plugin's action is not reachable this way, even listed under consumes.
    await assert.rejects(client.invoke(other, {}));
    assert.equal(reads.other, 0);

    // Not listed: refused before the Host is asked.
    await assert.rejects(contexts.get("silent")!.services!.actions!.invoke(readFile, query), { code: "actions.forbidden" });
    assert.equal(reads.host, 1);
    // Listed but not granted: the action is not usable, and the kernel refuses the call.
    const withoutGrant = contexts.get("ungranted")!.services!.actions!;
    await assert.rejects(withoutGrant.invoke(readFile, query), { code: "plugin_grant_denied" });
    assert.deepEqual(await withoutGrant.discover(), [], "its own action needs the read permission it was never granted");
    assert.equal(reads.host, 1);

    // A stopped instance holds nothing.
    await runtime.stop(reader.install_id);
    await assert.rejects(client.invoke(readFile, query), { code: "actions.forbidden" });
    assert.equal(reads.host, 1);

    // The client does not depend on having an action of one's own: a plugin that only consumes the Host action reaches it,
    // sees no action in its directory, and reaches nothing else. A plugin that lists nothing under consumes and has no action
    // has no client at all.
    await start("viewer", [readFile.capability_id], ["workspace:read"], false);
    const viewer = contexts.get("viewer")!.services!.actions!;
    assert.deepEqual(await viewer.invoke(readFile, query), { outcome: "directory", entries: [], truncated: false });
    assert.equal(reads.host, 2);
    assert.equal(seen[1]!.host_plugin?.plugin_id, "io.molis.work.example.viewer");
    assert.deepEqual(await viewer.discover(), []);
    await assert.rejects(viewer.invoke(other, {}), { code: "actions.forbidden" }, "another plugin's action is not consumed here");
    await assert.rejects(viewer.invoke(readGit, { workspace_id: "w", kind: "status" }), { code: "actions.forbidden" }, "the other read is not listed either");
    assert.equal(reads.host, 2);
    await start("quiet", [], ["workspace:read"], false);
    assert.equal(contexts.get("quiet")!.services!.actions, undefined);
    void silent;
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("one read action serves everyone: the whole file is for plugins, and a caller holds the read permission its dependents declare", { timeout: 60_000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workspace-read-one-id-")));
  const home = join(root, "home"), folder = join(root, "repository");
  await mkdir(home, { recursive: true }); await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "chart.png"), PNG);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: folder });
  const workspace = { workspace_id: "workspace-one", canonical_path: folder, realpath_verified: true, display_name: "repository" };
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project-one" });
  const person = (permissions: readonly string[], audience: ActionCallContext["audience"] = "user"): ActionCallContext => ({ actor_id: "web-user", project_id: "project-one", audience, permissions });
  const everything = ["artifact:read", "artifact:write", "storage:private", "workspace:read"];
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspacesFor: async () => [workspace] });
  const bare = new MolisWorkLocalHost({ homeDirectory: join(root, "bare"), completeText: null });
  const bareReference = molisWorkHostProjectReference({ databasePath: join(root, "bare-project.sqlite"), projectId: "project-bare" });
  try {
    await host.withProject(reference, runtime => runtime.coordinator.initializeBoard({ project_id: "project-one", title: "读取", actor_id: "web-user", idempotency_key: "init" }));
    const client = host.actionClient(reference);
    const text = { workspace_id: workspace.workspace_id, path: ["chart.png"] };

    // The whole file is for the preview of a plugin the Host runs: the person, the Agent, workflows, MCP clients and a plugin that
    // calls as the plugin audience without the Host's identity for it (a generated plugin) are refused, even holding the permission.
    for (const audience of ["user", "agent", "workflow", "mcp", "plugin"] as const) {
      await assert.rejects(client.invoke(person(["workspace:read"], audience), readFile, { ...text, kind: "bytes" }), { code: "actions.forbidden" }, audience);
      assert.equal((await client.invoke(person(["workspace:read"], audience), readFile, { ...text, kind: "text" }) as { outcome: string }).outcome, "binary", audience);
    }

    // No second id is registered for the same read.
    const registered = host.status().capabilities.map(row => row.capability_id);
    assert.deepEqual(registered.filter(id => /^projects\.workspace\.(file|files|git)\./u.test(id) && /read|inspect/u.test(id)).sort(), [readFile.capability_id, readGit.capability_id].sort());

    // What reads the folder declares the read as its dependency and the permission with it; the ones that do not, do not.
    const reading = [filesActions.directory, filesActions.open, filesActions.capture, sideEntries, sideContent,
      gitActions.state, gitActions.selectDiff, gitActions.summary, gitActions.prSupport, gitActions.conflict];
    const others = [...FILES_ACTIONS, ...GIT_ACTIONS].filter(definition => !reading.includes(definition as never));
    for (const definition of reading) {
      const wanted = definition.capability_id.startsWith("git.") ? readGit : readFile;
      assert.deepEqual(definition.action.required_actions, [{ capability_id: wanted.capability_id, version: 1 }], definition.capability_id);
      assert.ok(definition.action.permissions.includes("workspace:read"), definition.capability_id);
    }
    for (const definition of others) {
      assert.equal(definition.action.required_actions, undefined, definition.capability_id);
      assert.ok(!definition.action.permissions.includes("workspace:read"), definition.capability_id);
    }
    // The three plugins that call the reads list them, and hold the permission for them.
    for (const [manifest, ids] of [[filesManifest, [readFile.capability_id]], [gitManifest, [readGit.capability_id]], [codingManifest, [readFile.capability_id]]] as const) {
      for (const id of ids) assert.ok(manifest.capabilities.consumes.includes(id), `${manifest.plugin_id} consumes ${id}`);
      assert.ok(manifest.permissions.some(item => item.permission === "workspace:read" && item.required), `${manifest.plugin_id} holds workspace:read`);
    }

    // A caller without the permission neither sees nor runs them; with it they are available.
    const directory = await client.discover(person(everything));
    for (const definition of reading) assert.equal(directory.find(row => row.capability_id === definition.capability_id)?.availability.available, true, definition.capability_id);
    const without = await client.discover(person(everything.filter(permission => permission !== "workspace:read")));
    for (const definition of reading) assert.equal(without.some(row => row.capability_id === definition.capability_id), false, definition.capability_id);
    await assert.rejects(client.invoke(person(everything.filter(permission => permission !== "workspace:read")), filesActions.directory, { workspace_id: workspace.workspace_id, path: [] }), { code: "actions.forbidden" });

    // The plugin's own client is never the way around it: the dependents answer the person who holds the permission, with their own text.
    const listed = await client.invoke(person(everything), filesActions.directory, { workspace_id: workspace.workspace_id, path: [] }) as { result: { outcome: string; entries: Array<{ name: string }> } };
    assert.equal(listed.result.outcome, "directory"); assert.deepEqual(listed.result.entries.map(entry => entry.name), [".git", "chart.png"]);
    const status = await client.invoke(person(everything), gitActions.summary, {}) as { summary: { branch: string } | null };
    assert.equal(status.summary?.branch, "main");

    // Without a workspace port on the Host there is no read to depend on: the dependents say so.
    await bare.withProject(bareReference, runtime => runtime.coordinator.initializeBoard({ project_id: "project-bare", title: "无工作区", actor_id: "web-user", idempotency_key: "init" }));
    const bareDirectory = await bare.actionClient(bareReference).discover({ ...person(everything), project_id: "project-bare" });
    for (const definition of reading) {
      const row = bareDirectory.find(item => item.capability_id === definition.capability_id);
      assert.deepEqual(row?.availability.available, false, definition.capability_id);
      assert.equal((row?.availability as { code?: string } | undefined)?.code, "actions.dependency_missing", definition.capability_id);
    }
  } finally {
    await host.close(); await bare.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("Files, Git and Coding read the linked folder through the one action in a real Host, the whole file included", { timeout: 120_000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "workspace-read-http-")));
  const token = "workspace-read-control-token-0123456789abcdef";
  const server = createMolisWorkWebServer({ homeDirectory: root, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const request = async (url: string, method = "GET", body?: unknown) => {
    const response = await fetch(origin + url, { method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  try {
    const created = await request("/api/settings/projects", "POST", { display_name: "读取同一个动作", user_confirmed: true });
    assert.equal(created.status, 201);
    const id = created.body.project.project_id as string;
    for (const pluginId of ["coding", "files", "git"]) assert.equal((await request(`/api/settings/projects/${id}/plugins`, "POST", { plugin_id: pluginId })).status, 200);
    const directory = path.join(root, "repository"); await mkdir(join(directory, "src"), { recursive: true });
    await writeFile(join(directory, "note.txt"), "中文🙂\nfirst\n");
    await writeFile(join(directory, "chart.png"), PNG);
    await writeFile(join(directory, "src", "streaks.ts"), "export function currentStreak(days: number) { return days; }\n");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    assert.equal((await request(`/projects/${id}/api/workspaces`, "POST", { workspace_path: directory, user_confirmed: true })).status, 201);
    const workspace = (await request(`/projects/${id}/api/project-settings/workspaces`)).body.workspaces[0].workspace_id as string;
    const plugin = (name: string, suffix: string) => `/projects/${id}/api/plugins/io.molis.work.${name}${suffix}`;

    // Files: the side panel previews a picture in the linked folder whole, which only a plugin may ask the Host for.
    const sources = (await request(`/projects/${id}/api/side/files/sources`)).body.sources as Array<{ id: string; plugin_id: string; kinds: Array<{ kind: string }> }>;
    const source = sources.find(item => item.kinds.some(kind => kind.kind === WORKSPACE_FILE_KIND));
    assert.ok(source, JSON.stringify(sources));
    const entries = (await request(`/projects/${id}/api/side/files/entries?source=${encodeURIComponent(source.id)}`)).body.page.entries as Array<{ title: string; subject: { id: string } }>;
    assert.deepEqual(entries.map(entry => entry.title).sort(), ["chart.png", "note.txt", "streaks.ts"]);
    const picture = entries.find(entry => entry.title === "chart.png")!;
    const preview = await request(`/projects/${id}/api/side/files/content?source=${encodeURIComponent(source.id)}&kind=${WORKSPACE_FILE_KIND}&id=${encodeURIComponent(picture.subject.id)}`);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.content.encoding, "base64"); assert.equal(preview.body.content.media_type, "image/png");
    assert.deepEqual(Buffer.from(preview.body.content.data, "base64"), PNG);
    const text = entries.find(entry => entry.title === "note.txt")!;
    const textPreview = await request(`/projects/${id}/api/side/files/content?source=${encodeURIComponent(source.id)}&kind=${WORKSPACE_FILE_KIND}&id=${encodeURIComponent(text.subject.id)}`);
    assert.equal(textPreview.body.content.data, "中文🙂\nfirst\n");

    // Files and Git, through their own routes.
    const opened = await request(plugin("files", "/open"), "POST", { workspace_id: workspace, path: ["note.txt"] });
    assert.equal(opened.status, 200, JSON.stringify(opened.body)); assert.equal(opened.body.result.text, "中文🙂\nfirst\n");
    const listed = await request(plugin("files", "/directory?path=[]&workspace_id=" + workspace));
    assert.equal(listed.status, 200); assert.equal(listed.body.result.outcome, "directory");
    const gitState = await request(plugin("git", "/state"));
    assert.equal(gitState.status, 200, JSON.stringify(gitState.body)); assert.equal(gitState.body.view.phase, "ready");

    // Coding: the files and definitions a person can name with @ come from the same action.
    const session = await request(plugin("coding", "/sessions"), "POST", { title: "读文件" });
    assert.equal(session.status, 200, JSON.stringify(session.body));
    const sessionId = session.body.session.session_id as string;
    const index = await request(plugin("coding", `/sessions/${sessionId}/files?workspace_id=${workspace}`));
    assert.equal(index.status, 200, JSON.stringify(index.body));
    assert.deepEqual(index.body.files, ["chart.png", "note.txt", "src/", "src/streaks.ts"]);
    const symbols = await request(plugin("coding", `/sessions/${sessionId}/symbols?workspace_id=${workspace}&path=src/streaks.ts`));
    assert.equal(symbols.status, 200, JSON.stringify(symbols.body));
    assert.deepEqual(symbols.body.symbols.map((symbol: { name: string }) => symbol.name), ["currentStreak"]);
    const other = await request(plugin("coding", `/sessions/${sessionId}/files?workspace_id=another-folder`));
    assert.equal(other.status, 400, "a folder the project did not link is never read");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("a Home that installed Files, Git and Coding before the read permission existed follows the new Manifest and holds it, without asking", () => {
  for (const manifest of [filesManifest, gitManifest, codingManifest] as readonly PluginManifest[]) {
    // The Manifest as the Home last saw it: no read permission, no read dependency on any action, no read id consumed.
    const before: PluginManifest = { ...manifest, permissions: manifest.permissions.filter(item => item.permission !== "workspace:read"),
      actions: (manifest.actions ?? []).map(({ action, ...rest }) => {
        const { required_actions: _required, ...kept } = action;
        return { ...rest, action: { ...kept, permissions: action.permissions.filter(permission => permission !== "workspace:read") } };
      }),
      capabilities: { ...manifest.capabilities, consumes: manifest.capabilities.consumes.filter(id => id !== readFile.capability_id && id !== readGit.capability_id) } };
    // The Home outlives the process: the same records, read by the next start of the Host.
    const records = new MemoryPluginRuntimeRepository();
    const installed = new PluginRuntime(records).install({ definition: { manifest: before, start: async () => ({ kind: "app" }) } as PluginDefinition, deployment: "local" }).install;
    assert.ok(!installed.grants.includes("workspace:read"), manifest.plugin_id);
    const followed = new PluginRuntime(records).install({ definition: { manifest, start: async () => ({ kind: "app" }) } as PluginDefinition, deployment: "local", bundled: true }).install;
    assert.equal(followed.install_id, installed.install_id, "the same installation, so its private data stays attached");
    assert.ok(followed.grants.includes("workspace:read"), manifest.plugin_id);
    for (const permission of installed.grants) assert.ok(followed.grants.includes(permission), `${manifest.plugin_id} keeps ${permission}`);
  }
});
