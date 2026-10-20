import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";

test("S-18 RAC-39 model display metadata follows current configuration without credentials or requests, and disappears on lost authority", { timeout: 60_000 }, async t => {
  const probe = homeProbe("metadata");
  const f = await serveHomeRuntime(t, { completeText: undefined, pluginFixtures: { home: [probe.definition] } });
  const { platform, install } = await grantHomeProbe(f.host, probe);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  try {
    const connection = withConnectorConnections(f.home, store => store.createToken({ serviceId: "model-api", displayName: "Metadata fixture", token: "metadata-fixture-value" }));
    withConnectorConnections(f.home, store => store.assertTarget(connection.connection_id, "model-api", "https://example.invalid"));
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "metadata", display_name: "Readable provider",
      base_url: "https://example.invalid", api_format: "openai-chat-completions", models: [{ model_id: "first-model", enabled: true }, { model_id: "second-model", enabled: true }] });
    const secrets = runWithMolisWorkHome(f.home, () => createFileSecretStore());
    let reads = 0, requests = 0;
    t.mock.method(secrets, "get", () => { reads++; throw new Error("discovery must not read credentials"); });
    t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("discovery must not make requests"); });
    const model = probe.contexts.at(-1)!.services!.model!;
    assert.deepEqual(model.availability(), { available: true, runtime_label: "Prologue · Readable provider · first-model", vision: false });
    const initial = catalog.models.get("metadata")!;
    // ISSUE-50: whether the model in use reads images is display metadata too, so a plugin knows when to attach screenshots.
    catalog.models.upsert({ ...initial, display_name: "Renamed provider", models: initial.models.map(row => ({ ...row, enabled: row.model_id === "second-model", vision: row.model_id === "second-model" })) });
    assert.deepEqual(model.availability(), { available: true, runtime_label: "Prologue · Renamed provider · second-model", vision: true });
    catalog.models.upsert({ ...catalog.models.get("metadata")!, enabled: false });
    assert.equal(model.availability().available, false); assert.equal(model.availability().runtime_label, undefined);
    catalog.models.upsert({ ...catalog.models.get("metadata")!, enabled: true });
    assert.equal(model.availability().available, true);
    withConnectorConnections(f.home, store => store.disconnect(connection.connection_id));
    assert.equal(model.availability().available, false); assert.equal(model.availability().runtime_label, undefined);
    assert.equal(reads, 0); assert.equal(requests, 0);
    await platform.runtime.stop(install.install_id);
    assert.deepEqual(model.availability(), { available: false, code: "actions.provider_stopped", reason: "此插件实例已停止" });
    await grantHomeProbe(f.host, probe, probe.permissions.filter(permission => permission !== "model:invoke"));
    assert.deepEqual(probe.contexts.at(-1)!.services!.model!.availability(), { available: false, code: "actions.plugin_permission", reason: "插件缺少模型调用授权" });
    assert.equal(reads, 0); assert.equal(requests, 0);
  } finally { catalog.close(); }
});
