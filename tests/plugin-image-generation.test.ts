import assert from "node:assert/strict";
import test from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { imagesActions as actions } from "@molis-ai/molis-work-plugin-images";
import { imageRuntimeFixture, imageTerminal } from "./fixtures/images-runtime.js";

// W5-01-IMGPORT-01: the actual Host adapter supplies metadata and a revision; credentials remain outside the plugin.
test("image port inspects without pinning, pins only an authorized binding and hides credentials", async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const f = await imageRuntimeFixture(t), service = f.contexts.at(-1)!.services!.imageGeneration!;
  const secret = "image-runtime-test-value";
  const account = withConnectorConnections(f.home, store => store.createToken({ serviceId: "image-api", displayName: "Image port", token: secret }));
  // A connector binding can already exist before an Images configuration: discovery must not pin it.
  withConnectorConnections(f.home, store => store.bind({ scopeId: "home", pluginId: "images", slotId: "existing", serviceId: "image-api", connectionId: account.connection_id }));
  const target = { slot_id: "existing", base_url: f.input.base_url };
  const before = service.inspect(target); assert.equal(before.available, true);
  assert.equal(withConnectorConnections(f.home, store => store.targetOrigin(account.connection_id)), null);
  assert.doesNotMatch(JSON.stringify([service.connections(), before]), new RegExp(secret));
  await assert.rejects(service.bind(target, account.connection_id), { code: "plugin.image_action_required" });
  assert.equal(withConnectorConnections(f.home, store => store.targetOrigin(account.connection_id)), null);
  const { connection } = await f.client(null).invoke(actions.saveConnection, { ...f.input, auth_connection_id: account.connection_id });
  assert.equal(withConnectorConnections(f.home, store => store.targetOrigin(account.connection_id)), new URL(f.input.base_url).origin);
  assert.equal(connection.has_key, true); assert.equal(connection.auth_connection_id, account.connection_id);
  assert.doesNotMatch(readFileSync(join(f.home, "images", "images.db")).toString(), new RegExp(secret));
  await assert.rejects(service.generate({ ...target, expected_revision: before.revision, protocol: "openai-images", model: "fixture", prompt: "forbidden" }), { code: "plugin.image_action_required" });
  assert.equal(f.calls.length, 0);
});

for (const change of ["disabled", "removed", "disconnected"] as const) test(`W5-01-IMGPORT-01: ${change} selected connection cannot fall back to anonymous loopback`, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const f = await imageRuntimeFixture(t);
  const account = withConnectorConnections(f.home, store => store.createToken({ serviceId: "image-api", displayName: "Selected", token: "image-runtime-credential" }));
  const { connection } = await f.client(null).invoke(actions.saveConnection, { ...f.input, auth_connection_id: account.connection_id });
  withConnectorConnections(f.home, store => {
    if (change === "disabled") store.setEnabled(account.connection_id, false);
    else if (change === "removed") store.remove(account.connection_id);
    else store.disconnect(account.connection_id);
  });
  const listed = await f.client(null).invoke(actions.connections, {});
  assert.equal(listed.connections[0]!.auth_connection_id, account.connection_id); assert.equal(listed.connections[0]!.available, false);
  await assert.rejects(f.client().invoke(actions.start, { request_id: "blocked", connection_id: connection.id, prompt: "blocked" }), { code: "images.key_required" });
  assert.equal(f.calls.length, 0); assert.deepEqual((await f.client().invoke(actions.list, {})).jobs, []);
});

test("W5-01-IMGPORT-02: an asynchronous final authority check is refused before a binding or task write", async t => {
  const f = await imageRuntimeFixture(t), before = await f.client(null).invoke(actions.connections, {});
  const caller = f.client(null, { assert_authority_current: async () => { await Promise.resolve(); } });
  await assert.rejects(caller.invoke(actions.saveConnection, f.input));
  assert.deepEqual(await f.client(null).invoke(actions.connections, {}), before);
  assert.equal(f.calls.length, 0);
  const { connection } = await f.connection();
  await assert.rejects(f.client("project-a", { permissions: ["images:generate"] }).invoke(actions.start,
    { request_id: "without-model-permission", connection_id: connection.id, prompt: "denied" }), { code: "actions.forbidden" });
  assert.deepEqual((await f.client().invoke(actions.list, {})).jobs, []);
  const { job } = await f.client().invoke(actions.start, { request_id: "authorized", connection_id: connection.id, prompt: "allowed" });
  assert.equal((await imageTerminal(f.client(), job.id)).status, "succeeded");
});


test("W5-01-IMGPORT-02: actual plugin actions refuse serial and undeclared image dispatch", async t => {
  const make = (name: string, permissions: string[], concurrent: boolean): ActionDefinition<Record<string, never>, unknown> => ({
    capability_id: `images.port.${name}`, version: 1, operation: "command", action: { title: name, description: "Image port refusal probe", scope: "home",
      kind: "operation", audiences: ["user"], subject_kinds: [], permissions, ...(concurrent ? { scheduling: "concurrent" as const } : {}),
      input_schema: { type: "object", additionalProperties: false } },
  });
  const serial = make("serial", ["images:generate", "model:invoke"], false), undeclared = make("undeclared", [], true);
  const f = await imageRuntimeFixture(t, { definition: definition => {
    const original = definition.start;
    return { ...definition, manifest: { ...definition.manifest, actions: [...definition.manifest.actions!, serial, undeclared] },
      async start(context) {
        const contribution = await original(context); assert.equal(contribution.kind, "app");
        return { ...contribution, actions: [...contribution.actions!, ...[serial, undeclared].map(action => ({ ...action, handle: () => {
          const port = context.services!.imageGeneration!, target = { slot_id: "probe", base_url: "http://127.0.0.1:1/v1" };
          return port.generate({ ...target, expected_revision: "unused", protocol: "openai-images", model: "fixture", prompt: "must not dispatch" });
        } }))] };
      },
    };
  } });
  await assert.rejects(f.client(null).invoke(serial, {}), { code: "plugin.image_concurrent_required" });
  await assert.rejects(f.client(null).invoke(undeclared, {}), { code: "plugin.image_permission_undeclared" });
  assert.equal(f.calls.length, 0);
});

// W5-01-IMGPORT-03: a result carries the dispatched connection revision across plugin-side awaits.
test("a connection replaced after dispatch returns cannot authorize old image bytes", async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  let reached!: () => void, release!: () => void, returned!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const settled = new Promise<void>(resolve => { returned = resolve; });
  t.after(() => release());
  const f = await imageRuntimeFixture(t, { context: context => {
    const imageGeneration = context.services!.imageGeneration!;
    return { ...context, services: { ...context.services!, imageGeneration: { ...imageGeneration,
      async generate(request, options) {
        const receipt = await imageGeneration.generate(request, options); reached(); await resume;
        returned(); return receipt;
      },
    } } };
  } });
  const account = (name: string) => withConnectorConnections(f.home, store => store.createToken({ serviceId: "image-api", displayName: name, token: `test-image-${name}` }));
  const first = account("first"), second = account("second");
  const { connection } = await f.client(null).invoke(actions.saveConnection, { ...f.input, auth_connection_id: first.connection_id });
  const { job } = await f.client().invoke(actions.start, { request_id: "replace-after-result", connection_id: connection.id, prompt: "old connection" });
  await entered;
  await f.client(null).invoke(actions.saveConnection, { ...f.input, id: connection.id, auth_connection_id: second.connection_id });
  release(); await settled;
  // The background result has returned; let its rejection and guarded persistence finish.
  await new Promise(resolve => setTimeout(resolve, 30));
  const current = (await f.client().invoke(actions.get, { id: job.id })).job;
  assert.equal(current.status, "running"); assert.deepEqual(current.images, []); assert.equal(current.error, "");
  assert.equal(f.calls.length, 1);
});

test("W5-01-IMGPORT-02: MCP availability metadata cannot recurse into its own authority check", async t => {
  const f = await imageRuntimeFixture(t), { connection } = await f.connection();
  const client = f.client("project-a", { audience: "mcp" });
  const available = await client.discover();
  assert.equal(available.find(view => view.capability_id === actions.start.capability_id)?.availability.available, true);
  const { job } = await client.invoke(actions.start, { request_id: "mcp-availability", connection_id: connection.id, prompt: "actual MCP audience" });
  assert.equal((await imageTerminal(client, job.id)).status, "succeeded");
  assert.equal(f.calls.length, 1);
});
