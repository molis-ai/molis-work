import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, ensureSystemAgentService, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFileSecretStore, resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { toolField } from "./fixtures/connector-assistant-model.js";
import { createSingleHomeTestWebServer } from "./fixtures/local-web-core.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

test("ASC-26: model evaluation reads actual tool results, never schemas, requested values or prose", () => {
  const result = (value: unknown, is_error = false) => ({ role: "user", content: [{ type: "tool_result", is_error, content: [{ type: "text", text: JSON.stringify(value) }] }] });
  const schema = result({ capabilities: [{ input_schema: { properties: { authorization_id: { type: "string", format: "uuid" }, intent_revision: { type: "string" } } } }] });
  const messages = [result({ authorization_id: "original", intent_revision: "2" }), schema,
    { role: "assistant", content: [{ type: "tool_use", input: { authorization_id: "invented" } }] },
    { role: "user", content: JSON.stringify({ authorization_id: "user-material" }) }];
  assert.equal(toolField(messages, "authorization_id"), "original");
  assert.equal(toolField([schema], "authorization_id"), undefined);
  assert.equal(toolField(messages, "intent_revision"), "2");
  assert.equal(toolField([...messages, result({ authorization_id: "latest", intent_revision: "6" })], "authorization_id"), "latest");
  assert.equal(toolField([...messages, result({ authorization_id: "rejected" }, true)], "authorization_id"), "original");
  assert.ok(Array.isArray(toolField([schema], "capabilities")), "capability discovery remains readable as a result");
});

interface HealthList {
  health: Array<{ provider_id: string; status: string; credential_status?: string }>;
}

async function createModelSecretFixture(t: TestContext) {
  const home = await mkdtemp(path.join(tmpdir(), "molis-model-secrets-"));
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  resetSecretStoreCache();
  const controlToken = `model-secrets-control-${randomUUID()}`;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const withCatalog = host.configurePersonalPlanning(home, host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog);
  const server: Server = createSingleHomeTestWebServer({ homeDirectory: home, localHost: host, controlToken });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let closed = false;
  const closeHost = async () => {
    if (closed) return;
    closed = true;
    if (server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
    await host.close();
  };
  t.after(async () => {
    await closeHost();
    if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend;
    resetSecretStoreCache();
    await rm(home, { recursive: true, force: true });
  });
  const headers = () => ({
    origin,
    "content-type": "application/json",
    "x-molis-work-idempotency-key": randomUUID(),
    "x-molis-work-control-token": controlToken,
  });
  const getModels = async (): Promise<HealthList> => {
    const response = await fetch(`${origin}/api/settings/models`);
    assert.equal(response.status, 200);
    return (await response.json()) as HealthList;
  };
  const testModel = async (providerId: string, modelId: string) => {
    const response = await fetch(`${origin}/api/settings/models/${providerId}/test`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ model_id: modelId }),
    });
    return { status: response.status, text: await response.text() };
  };
  return { home, withCatalog, closeHost, getModels, testModel };
}

async function assertOpenConfiguredAgentRefused(home: string) {
  const agentHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    // Calling ensureSystemAgentService without `withCatalog` routes model lookups through `openConfiguredModels(home)`.
    const system = ensureSystemAgentService(agentHost, home);
    await system.ready;
    const adapter = system.agentHost.adapter("prologue");
    const health = await adapter.health();
    assert.equal(health.ok, false);
    assert.equal(health.status, "needs_setup");
    const owner = { actor_id: "local-person", project_id: "model-secret-gate", plugin_id: "host", install_id: "host" };
    const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Refused model check" });
    await assert.rejects(
      adapter.start({
        ...owner,
        session,
        workspace: "none",
        role_id: "reader",
        task: "Must not dispatch without an active origin-pinned model-api connection",
        role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", host_tools: [], prompts: [] },
      }),
      (error: unknown) => error instanceof ActionError && error.code === "agent.model_not_configured",
      "Agent start must refuse when the model-api connection is disabled, mismatched, or missing",
    );
  } finally {
    await agentHost.close();
  }
}

test("F-hc-01: disabled model-api connection blocks ModelProviderStore health, resolveConfiguration, /test, and Agent start with zero decryptions", async (t) => {
  const key = "disabled-model-api-secret-0123456789";
  const standIn = await startModelStandIn(key);
  t.after(() => standIn.close());
  const fixture = await createModelSecretFixture(t);

  const connection = withConnectorConnections(fixture.home, (store) => {
    const created = store.createToken({ serviceId: "model-api", displayName: "Primary key", token: key });
    store.assertTarget(created.connection_id, "model-api", standIn.baseUrl);
    return created;
  });
  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    catalog.models.upsert({
      provider_id: "primary",
      display_name: "Primary",
      base_url: standIn.baseUrl,
      api_format: "openai-chat-completions",
      credential_ref: connection.credential_ref!,
      models: [{ model_id: "m-1", enabled: true }],
    });
    assert.equal(catalog.models.hasCredential("primary"), true);
    assert.equal(catalog.models.health()[0]?.status, "ready");
    assert.equal(catalog.models.resolveConfiguration({ provider_id: "primary" })?.api_key, key);
  });

  // Disable the model-api connection: the encrypted entry stays in secrets.json, so ModelProviderStore must refuse before decrypting.
  withConnectorConnections(fixture.home, (store) => store.setEnabled(connection.connection_id, false));
  const secrets = runWithMolisWorkHome(fixture.home, () => createFileSecretStore());
  const readSpy = t.mock.method(secrets, "get", () => {
    throw new Error("must not decrypt disabled model-api credential");
  });

  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    assert.equal(catalog.models.hasCredential("primary"), false);
    const [entry] = catalog.models.health();
    assert.equal(entry?.status, "needs-credential");
    assert.equal(entry?.credential_status, "missing");
    assert.equal(catalog.models.resolveConfiguration({ provider_id: "primary" }), null);
    assert.equal(catalog.models.resolveConfiguration(), null);
  });
  const listed = await fixture.getModels();
  assert.equal(listed.health.find((entry) => entry.provider_id === "primary")?.status, "needs-credential");
  const tested = await fixture.testModel("primary", "m-1");
  assert.equal(tested.status, 400);
  assert.equal(tested.text.includes(key), false);

  await fixture.closeHost();
  await assertOpenConfiguredAgentRefused(fixture.home);
  assert.equal(readSpy.mock.callCount(), 0, "disabled model-api connection must never call SecretStore.get");
  assert.equal(standIn.requests.length, 0, "disabled model-api connection must make zero upstream requests");

  // Re-enabling restores normal access without re-entering the key.
  readSpy.mock.restore();
  withConnectorConnections(fixture.home, (store) => store.setEnabled(connection.connection_id, true));
  await withMolisWorkProjectCatalog({ homeDirectory: fixture.home }, (catalog) => {
    assert.equal(catalog.models.hasCredential("primary"), true);
    assert.equal(catalog.models.health()[0]?.status, "ready");
    assert.equal(catalog.models.resolveConfiguration({ provider_id: "primary" })?.api_key, key);
  });
});

test("F-hc-01: origin mismatch between model-api targetOrigin and provider base_url refuses decryption and upstream dispatch", async (t) => {
  const key = "origin-pinned-model-secret-0123456789";
  const pinned = await startModelStandIn(key);
  const other = await startModelStandIn(key);
  t.after(async () => {
    await pinned.close();
    await other.close();
  });
  const fixture = await createModelSecretFixture(t);

  const connection = withConnectorConnections(fixture.home, (store) => {
    const created = store.createToken({ serviceId: "model-api", displayName: "Pinned key", token: key });
    store.assertTarget(created.connection_id, "model-api", pinned.baseUrl);
    return created;
  });
  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    catalog.models.upsert({
      provider_id: "mismatched",
      display_name: "Mismatched",
      base_url: other.baseUrl,
      api_format: "openai-chat-completions",
      credential_ref: connection.credential_ref!,
      models: [{ model_id: "m-1", enabled: true }],
    });
  });

  const secrets = runWithMolisWorkHome(fixture.home, () => createFileSecretStore());
  const readSpy = t.mock.method(secrets, "get", () => {
    throw new Error("must not decrypt origin-mismatched model-api credential");
  });

  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    assert.equal(catalog.models.hasCredential("mismatched"), false);
    const [entry] = catalog.models.health();
    assert.equal(entry?.status, "needs-credential");
    assert.equal(entry?.credential_status, "missing");
    assert.equal(catalog.models.resolveConfiguration({ provider_id: "mismatched" }), null);
    assert.equal(catalog.models.resolveConfiguration(), null);
  });
  const listed = await fixture.getModels();
  assert.equal(listed.health.find((entry) => entry.provider_id === "mismatched")?.status, "needs-credential");
  const tested = await fixture.testModel("mismatched", "m-1");
  assert.equal(tested.status, 400);
  assert.equal(tested.text.includes(key), false);

  await fixture.closeHost();
  await assertOpenConfiguredAgentRefused(fixture.home);
  assert.equal(readSpy.mock.callCount(), 0, "origin mismatch must never call SecretStore.get");
  assert.equal(pinned.requests.length, 0);
  assert.equal(other.requests.length, 0);
});

test("F-hc-01: orphan credential_ref, unpinned model-api connection, and non-model-api connection refuse decryption while default selection skips invalid providers", async (t) => {
  const key = "orphan-model-api-secret-0123456789";
  const validKey = "valid-fallback-model-secret-0123456789";
  const standIn = await startModelStandIn(validKey);
  t.after(() => standIn.close());
  const fixture = await createModelSecretFixture(t);

  const secrets = runWithMolisWorkHome(fixture.home, () => createFileSecretStore());
  secrets.put("orphan-model-secret-ref", key);
  const unpinned = withConnectorConnections(fixture.home, (store) =>
    store.createToken({ serviceId: "model-api", displayName: "Unpinned model key", token: key }),
  );
  const wrongService = withConnectorConnections(fixture.home, (store) => {
    const created = store.createToken({ serviceId: "mcp-bearer", displayName: "Not model-api", token: key });
    store.assertTarget(created.connection_id, "mcp-bearer", standIn.baseUrl);
    return created;
  });

  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    catalog.models.upsert({
      provider_id: "alpha-orphan",
      display_name: "Alpha orphan",
      base_url: standIn.baseUrl,
      api_format: "openai-chat-completions",
      credential_ref: "orphan-model-secret-ref",
      models: [{ model_id: "m-1", enabled: true }],
    });
    catalog.models.upsert({
      provider_id: "beta-unpinned",
      display_name: "Beta unpinned",
      base_url: standIn.baseUrl,
      api_format: "openai-chat-completions",
      credential_ref: unpinned.credential_ref!,
      models: [{ model_id: "m-1", enabled: true }],
    });
    catalog.models.upsert({
      provider_id: "gamma-wrong-service",
      display_name: "Gamma wrong service",
      base_url: standIn.baseUrl,
      api_format: "openai-chat-completions",
      credential_ref: wrongService.credential_ref!,
      models: [{ model_id: "m-1", enabled: true }],
    });
  });

  const readSpy = t.mock.method(secrets, "get", () => {
    throw new Error("must not decrypt orphan, unpinned, or non-model-api credential");
  });

  for (const providerId of ["alpha-orphan", "beta-unpinned", "gamma-wrong-service"]) {
    await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
      assert.equal(catalog.models.hasCredential(providerId), false, providerId);
      const entry = catalog.models.health().find((item) => item.provider_id === providerId);
      assert.equal(entry?.status, "needs-credential", providerId);
      assert.equal(entry?.credential_status, "missing", providerId);
      assert.equal(catalog.models.resolveConfiguration({ provider_id: providerId }), null, providerId);
    });
    const tested = await fixture.testModel(providerId, "m-1");
    assert.equal(tested.status, 400, providerId);
    assert.equal(tested.text.includes(key), false, providerId);
  }
  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    assert.equal(catalog.models.resolveConfiguration(), null);
  });
  assert.equal(readSpy.mock.callCount(), 0, "invalid providers must never call SecretStore.get");
  assert.equal(standIn.requests.length, 0);

  // Adding a valid provider after the invalid ones allows default resolution to skip invalid entries without decrypting them.
  readSpy.mock.restore();
  const validConn = withConnectorConnections(fixture.home, (store) => {
    const created = store.createToken({ serviceId: "model-api", displayName: "Valid key", token: validKey });
    store.assertTarget(created.connection_id, "model-api", standIn.baseUrl);
    return created;
  });
  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    catalog.models.upsert({
      provider_id: "zeta-valid",
      display_name: "Zeta valid",
      base_url: standIn.baseUrl,
      api_format: "openai-chat-completions",
      credential_ref: validConn.credential_ref!,
      models: [{ model_id: "m-valid", enabled: true }],
    });
  });

  const readRefs: string[] = [];
  const originalGet = secrets.get.bind(secrets);
  const trackingSpy = t.mock.method(secrets, "get", (ref: string) => {
    readRefs.push(ref);
    return originalGet(ref);
  });
  await fixture.withCatalog({ homeDirectory: fixture.home }, (catalog) => {
    const resolved = catalog.models.resolveConfiguration();
    assert.equal(resolved?.provider.provider_id, "zeta-valid");
    assert.equal(resolved?.model.model_id, "m-valid");
    assert.equal(resolved?.api_key, validKey);
  });
  assert.deepEqual(readRefs, [validConn.credential_ref], "only the valid origin-pinned model-api credential is decrypted");
  trackingSpy.mock.restore();
  assert.equal(standIn.requests.length, 0);
});
