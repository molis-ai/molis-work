import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalMcpServer, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { hostActionToolName } from "../apps/local-host/src/mcp-action-grants.js";
import { readMcpToolPreference, writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("local management discovers an unknown plugin, authorizes its exact contract and can revoke a missing provider without granting from supplied permissions", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "mcp-action-settings-")), token = "mcp-action-grant-test-control-token";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "授权范围", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  let connected = true, calls = 0;
  const id = `unknown.${randomUUID()}`;
  const definition: ActionDefinition = { capability_id: id, version: 7, operation: "command", action: {
    title: "Unknown", description: "A new plugin's declared operation", kind: "operation", scope: "project", audiences: ["mcp"], permissions: ["fixture:write"], subject_kinds: [],
    input_schema: { type: "object", properties: { payload: { type: "string" } }, required: ["payload"], additionalProperties: false }, output_schema: { type: "integer" },
  } };
  let stop = host.actionRegistry(ref).registerProvider({ provider: { provider_id: id, title: "未知插件", kind: "plugin" }, definitions: [definition],
    handlers: [{ capability_id: id, version: 7, handle: () => ++calls, availability: () => connected ? { available: true } : { available: false, code: "fixture.offline", reason: "服务未连接" } }] });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
    const input = { client_id: "runtime:external", project_id: project.project_id, capability_id: id, version: 7, provider_id: id, enabled: true };
    const endpoint = `${origin}/api/settings/mcp/actions`;
    const send = (value: unknown, authorized = true) => fetch(endpoint, { method: "POST", body: JSON.stringify(value), headers: {
      origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(), ...(authorized ? { "x-molis-work-control-token": token } : {}),
    } });
    const read = async () => {
      const response = await fetch(`${endpoint}?client_id=${input.client_id}&project_id=${input.project_id}`); assert.equal(response.status, 200); return response.json();
    };
    const initial = await read(); assert.ok(initial.actions.some((row: any) => row.capability_id === id)); assert.deepEqual(initial.grants, []); assert.equal(calls, 0);
    const entry = (state: any) => state.entries.find((row: any) => row.capability_id === id);
    assert.equal(entry(initial).status, "ungranted");
    assert.equal((await send(input, false)).status, 403);
    assert.equal((await send({ ...input, permissions: ["everything"] })).status, 400);
    connected = false;
    assert.equal((await send(input)).status, 400);
    assert.deepEqual((await read()).grants, []);
    connected = true;
    const saved = await send(input); assert.equal(saved.status, 200, await saved.clone().text());
    assert.deepEqual((await saved.json()).permissions, ["fixture:write"]);
    assert.equal(calls, 0, "metadata discovery and grant creation must not invoke the plugin");
    const granted = await read(); assert.equal(granted.actions.find((row: any) => row.capability_id === id).availability.available, true);
    assert.equal(granted.grants.length, 1);
    assert.equal(entry(granted).status, "enabled");
    connected = false;
    assert.equal(entry(await read()).status, "unavailable");
    assert.equal(entry(await read()).reason, "服务未连接");
    connected = true;
    const page = await fetch(`${origin}/capabilities/access?client=${input.client_id}&project=${input.project_id}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /runtime:external/);
    const external = new LocalMcpServer(withMolisWorkProjectCatalog, "runtime", { projectId: project.project_id,
      databasePath: project.database_path, webBaseUrl: origin }, { homeDirectory: home,
      runtimeContext: { runtime_id: "external", stable_work_context_id: null, host_declares_stable: false } }, host);
    const reply = await external.handleMessage({ id: 1, method: "tools/call", params: {
      name: hostActionToolName(definition), arguments: { payload: "a legitimate plugin field" },
    } }) as any;
    assert.equal(reply.result.isError, false, JSON.stringify(reply));
    assert.deepEqual(reply.result.structuredContent, { result: 1 });
    await external.close();
    assert.equal((await send({ ...input, version: 8 })).status, 404);
    assert.equal((await send({ ...input, provider_id: "replacement" })).status, 404);
    stop();
    const changed = { ...definition, action: { ...definition.action, permissions: ["fixture:write", "fixture:extra"] } };
    stop = host.actionRegistry(ref).registerProvider({ provider: { provider_id: id, title: "未知插件", kind: "plugin" }, definitions: [changed],
      handlers: [{ capability_id: id, version: 7, handle: () => ++calls }] });
    assert.equal(entry(await read()).status, "stale");
    assert.deepEqual((await read()).grants[0].permissions, ["fixture:write"], "changed declarations cannot silently expand saved authority");
    assert.equal((await send(input)).status, 200);
    assert.equal(entry(await read()).status, "enabled");
    assert.deepEqual((await read()).grants[0].permissions, ["fixture:extra", "fixture:write"]);
    stop();
    const removed = await read(); assert.equal(removed.actions.some((row: any) => row.capability_id === id), false); assert.equal(removed.grants.length, 1);
    assert.equal(entry(removed).status, "missing");
    assert.equal(entry(removed).can_revoke, true);
    const revoked = await send({ ...input, enabled: false }); assert.equal(revoked.status, 200);
    assert.equal((await readMcpToolPreference(home)).action_grants?.[0]?.enabled, false);
    assert.equal(entry(await read()).can_revoke, false);
    await writeMcpActionGrant(home, { ...removed.grants[0], enabled: true });
    await catalog.deleteProject({ project_id: project.project_id, actor_id: "test", delete_confirmed: true, idempotency_key: "delete-grant-scope" });
    const orphan = await read();
    assert.equal(entry(orphan).status, "missing");
    assert.equal(entry(orphan).reason, "原项目已不存在。");
    const orphanPage = await fetch(`${origin}/capabilities/access?client=${input.client_id}&project=${input.project_id}`);
    assert.equal(orphanPage.status, 200);
    assert.match(await orphanPage.text(), /所选项目已不存在/);
    assert.equal((await send({ ...input, enabled: false })).status, 200);
    assert.equal(entry(await read()).can_revoke, false);
    assert.equal(calls, 1);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
});

test("an action that writes through other actions is granted together with them: refused naming the missing grants, saved all or nothing when sent in one request", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "mcp-action-settings-together-")), token = "mcp-action-grant-together-control-token";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "一起授权", actor_id: "test" });
  if (!catalog.listProjectPlugins(created.project_id).includes("feed")) catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "feed", actor_id: "test" });
  const projectId = created.project_id;
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object"); const origin = `http://127.0.0.1:${address.port}`;
    const endpoint = `${origin}/api/settings/mcp/actions`;
    const read = async (client: string) => (await fetch(`${endpoint}?client_id=${client}&project_id=${projectId}`)).json() as Promise<{ entries: Array<{ capability_id: string; version: number; provider_id: string; status: string }>; grants: unknown[] }>;
    const send = (value: unknown, language = "zh") => fetch(endpoint, { method: "POST", body: JSON.stringify(value), headers: {
      origin, "content-type": "application/json", "accept-language": language, "x-molis-work-idempotency-key": randomUUID(), "x-molis-work-control-token": token } });
    const identity = async (client: string, capability: string) => {
      const entry = (await read(client)).entries.find(row => row.capability_id === capability);
      assert.ok(entry, `${capability} is in the catalog`);
      return { capability_id: entry.capability_id, version: entry.version, provider_id: entry.provider_id };
    };
    const grant = (client: string, action: { capability_id: string; version: number; provider_id: string }, extra: Record<string, unknown> = {}) =>
      ({ client_id: client, project_id: projectId, ...action, enabled: true, ...extra });
    const dependencies = ["goals.directory.read", "goals.create", "goals.inputs.confirm"];

    // Alone, the promotion cannot be saved, and the refusal names the grants it needs (in the language asked for).
    const client = "runtime:together";
    const promote = await identity(client, "feed.items.promote");
    const alone = await send(grant(client, promote));
    assert.equal(alone.status, 400);
    const refused = await alone.json() as { code: string; error: string };
    assert.equal(refused.code, "mcp.grant_requires");
    assert.ok(dependencies.every(id => refused.error.includes(id)), refused.error);
    assert.match(refused.error, /还要同时授权/);
    const english = await (await send(grant(client, promote), "en")).json() as { error: string };
    assert.match(english.error, /^This action also needs these actions granted with it: goals\.directory\.read, goals\.create, goals\.inputs\.confirm$/);
    assert.deepEqual((await read(client)).grants, [], "nothing was saved");

    // What is already granted is not named again.
    for (const id of dependencies.slice(1)) assert.equal((await send(grant(client, await identity(client, id)))).status, 200);
    const partly = await (await send(grant(client, promote))).json() as { error: string };
    assert.ok(partly.error.includes("goals.directory.read") && !partly.error.includes("goals.create") && !partly.error.includes("goals.inputs.confirm"), partly.error);

    // Sent together, the dependency and the action are checked as one set and saved as one.
    assert.equal((await send(grant(client, promote, { with: [await identity(client, "goals.directory.read")] }))).status, 200);
    const saved = await read(client);
    assert.equal(saved.grants.length, 4);
    assert.equal(saved.entries.find(row => row.capability_id === "feed.items.promote")?.status, "enabled");

    const other = "runtime:all-at-once";
    const all = await Promise.all(dependencies.map(id => identity(other, id)));
    assert.equal((await send(grant(other, await identity(other, "feed.items.promote"), { with: all }))).status, 200);
    assert.deepEqual((await read(other)).entries.filter(row => [...dependencies, "feed.items.promote"].includes(row.capability_id)).map(row => row.status), ["enabled", "enabled", "enabled", "enabled"]);

    // A dependency that is not in the catalog saves nothing, and `with` is for granting only.
    const third = "runtime:nothing-saved";
    const missing = await send(grant(third, await identity(third, "feed.items.promote"), { with: [...all, { capability_id: "goals.no-such-action", version: 1, provider_id: all[0]!.provider_id }] }));
    assert.equal(missing.status, 404);
    assert.deepEqual((await read(third)).grants, []);
    const revoking = await send({ ...grant(third, await identity(third, "feed.items.promote"), { with: all }), enabled: false });
    assert.equal(revoking.status, 400);
    assert.equal(((await revoking.json()) as { code: string }).code, "mcp.grant_invalid");
    assert.deepEqual((await read(third)).grants, []);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
});
