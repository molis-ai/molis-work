import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

const publicAction: ActionDefinition<Record<string, never>, number> = { capability_id: "fixture.config.public", version: 1, operation: "command", action: {
  title: "Public system operation", description: "A permission-free system default with an observable effect", kind: "operation", scope: "home", scheduling: "concurrent",
  audiences: ["mcp"], permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" },
} };
const peer: ActionDefinition<Record<string, never>, number> = { ...publicAction, capability_id: "fixture.config.peer", action: {
  ...publicAction.action, title: "An independent exact grant", permissions: ["fixture:write"],
} };

async function fixture(t: TestContext) {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const state = { held: false, beforeEffect: false, publicWrites: 0, peerWrites: 0 };
  t.after(() => release.resolve());
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  const home = await openTestHome(t, { host: { actionAvailability: async (caller, action) => {
    if (state.held && state.beforeEffect && action.capability_id === publicAction.capability_id
      && caller.allowed_actions?.some(reference => reference.capability_id === publicAction.capability_id)) {
      entered.resolve(); await release.promise;
    }
    return { available: true };
  } } });
  const dispose = home.host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.mcp-config", title: "Configuration fixture", kind: "system" },
    definitions: [publicAction, peer], handlers: [{ ...publicAction, handle: async caller => {
      state.beforeEffect = true;
      try { await caller.beforeEffect(); return ++state.publicWrites; }
      finally { state.beforeEffect = false; }
    } }, { ...peer, handle: async caller => { await caller.beforeEffect(); return ++state.peerWrites; } }],
  });
  t.after(dispose);
  const file = join(home.home, "config", "mcp-tools.json"), clientId = "runtime:preference-integrity";
  // W1-18-MCP-CONFIG-01: a genuinely absent file retains the existing permission-free system default.
  await assert.rejects(readFile(file, "utf8"), { code: "ENOENT" });
  const mcp = await home.mcp(clientId, null);
  assert.equal(await mcp.client.invoke(mcp.caller, publicAction, {}), 1);
  await home.grant(clientId, null, [peer]);
  assert.equal(await mcp.client.invoke(mcp.caller, peer, {}), 1);
  return { home, file, clientId, mcp, state, entered, release };
}

test("W1-18-MCP-CONFIG-01 real duplicate records never reopen a withdrawn system default and preserve other exact grants", { timeout: 30_000 }, async t => {
  const f = await fixture(t);
  await f.home.revoke(f.clientId, null, [publicAction]);
  const original = await readMcpToolPreference(f.home.home);
  const denied = original.action_grants.find(grant => grant.capability_id === publicAction.capability_id);
  assert.ok(denied && !denied.enabled);
  const other = original.action_grants.filter(grant => grant.capability_id !== publicAction.capability_id);
  for (const records of [[denied, denied], [{ ...denied, enabled: true }, { ...denied, enabled: true }], [denied, { ...denied, enabled: true }]]) {
    const grants = [...other, ...records], text = JSON.stringify({ version: 3, action_grants: grants });
    await writeFile(f.file, text);
    const directory = await f.mcp.client.discover(f.mcp.caller);
    assert.equal(directory.some(view => view.capability_id === publicAction.capability_id), false);
    assert.ok(directory.some(view => view.capability_id === peer.capability_id));
    await assert.rejects(f.mcp.client.invoke(f.mcp.caller, publicAction, {}), { code: "mcp.action_revoked" });
    await f.mcp.client.invoke(f.mcp.caller, peer, {});
    await assert.rejects(f.home.grant(f.clientId, null, [publicAction]), { code: "actions.configuration_unavailable" });
    assert.equal(await readFile(f.file, "utf8"), text, "management refuses the conflict and retains every original byte");
    assert.equal(f.state.publicWrites, 1);
    assert.deepEqual((await readMcpToolPreference(f.home.home)).action_grants, grants, "the file's valid duplicate facts are not discarded or rewritten");
  }
  assert.equal(f.state.peerWrites, 4);
  // Explicit maintenance corrects only this temporary file; normal protected management may then restore its exact grant.
  await writeFile(f.file, JSON.stringify(original));
  await assert.rejects(f.mcp.client.invoke(f.mcp.caller, publicAction, {}), { code: "mcp.action_revoked" });
  await f.home.grant(f.clientId, null, [publicAction]);
  assert.equal(await f.mcp.client.invoke(f.mcp.caller, publicAction, {}), 2);
  const recovered = await readMcpToolPreference(f.home.home);
  assert.equal(recovered.action_grants.length, original.action_grants.length);
  assert.deepEqual(recovered.action_grants.filter(grant => grant.capability_id !== publicAction.capability_id), other);
});

test("W1-18-MCP-CONFIG-01 malformed, wrong-version and unreadable real configuration fail discovery and calls without becoming first-use defaults", { timeout: 30_000 }, async t => {
  const f = await fixture(t);
  await f.home.revoke(f.clientId, null, [publicAction]);
  const original = await readMcpToolPreference(f.home.home), originalText = JSON.stringify(original);
  const denied = original.action_grants.find(grant => grant.capability_id === publicAction.capability_id);
  assert.ok(denied);
  for (const text of ['{"version":3,"action_grants":', JSON.stringify({ ...original, version: 1 }), JSON.stringify({ ...original, version: 2 }),
    JSON.stringify({ version: 3 }), JSON.stringify({ ...original, action_grants: [{ ...denied, enabled: "false" }] }),
    JSON.stringify({ ...original, overrides: {} })]) {
    await writeFile(f.file, text);
    await assert.rejects(f.mcp.client.discover(f.mcp.caller), { code: "actions.configuration_unavailable" });
    await assert.rejects(f.mcp.client.invoke(f.mcp.caller, publicAction, {}), { code: "actions.configuration_unavailable" });
    await assert.rejects(f.home.grant(f.clientId, null, [publicAction]), { code: "actions.configuration_unavailable" });
    assert.equal(await readFile(f.file, "utf8"), text);
    assert.equal(f.state.publicWrites, 1); assert.equal(f.state.peerWrites, 1);
  }
  // EISDIR is a real read failure, distinct from ENOENT; no test-only reader or permissions stub is used.
  await unlink(f.file); await mkdir(f.file);
  const marker = join(f.file, "existing-record"), markerText = "preserve this existing directory and fact";
  await writeFile(marker, markerText);
  try {
    await assert.rejects(f.mcp.client.discover(f.mcp.caller), { code: "actions.configuration_unavailable" });
    await assert.rejects(f.mcp.client.invoke(f.mcp.caller, publicAction, {}), { code: "actions.configuration_unavailable" });
    await assert.rejects(f.home.grant(f.clientId, null, [publicAction]), { code: "actions.configuration_unavailable" });
    assert.equal((await stat(f.file)).isDirectory(), true);
    assert.equal(await readFile(marker, "utf8"), markerText);
    assert.equal(f.state.publicWrites, 1);
  } finally { await rm(f.file, { recursive: true, force: true }); await writeFile(f.file, originalText); }
  assert.equal((await f.mcp.client.discover(f.mcp.caller)).some(view => view.capability_id === publicAction.capability_id), false);
  await f.home.grant(f.clientId, null, [publicAction]);
  assert.equal(await f.mcp.client.invoke(f.mcp.caller, publicAction, {}), 2);
  assert.equal(await f.mcp.client.invoke(f.mcp.caller, peer, {}), 2);
});

test("W1-18-MCP-CONFIG-01 the real AUTH synchronous effect tail also rejects configuration corrupted after its async checks", { timeout: 30_000 }, async t => {
  const f = await fixture(t), before = await readFile(f.file, "utf8");
  f.state.held = true;
  const pending = f.mcp.client.invoke(f.mcp.caller, publicAction, {}).then(result => ({ result, error: undefined }), error => ({ result: undefined, error }));
  try {
    await Promise.race([f.entered.promise, pending.then(() => { throw new Error("Operation settled before its final policy wait"); })]);
    const broken = '{"version":3,"action_grants":';
    await writeFile(f.file, broken);
    f.state.held = false; f.release.resolve();
    const outcome = await pending;
    assert.ok(outcome.error instanceof ActionError);
    assert.equal(outcome.error.code, "actions.configuration_unavailable");
    assert.equal(f.state.publicWrites, 1);
    assert.equal(await readFile(f.file, "utf8"), broken);
  } finally { f.state.held = false; f.release.resolve(); await writeFile(f.file, before); }
  assert.equal(await f.mcp.client.invoke(f.mcp.caller, publicAction, {}), 2);
});
