import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginModelFailure, PluginModelRequest, PluginModelSelection } from "@molis-ai/molis-work-contracts/platform/plugin";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { grantHomeProbe, homeProbe, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

async function fixture(t: TestContext) {
  const probe = homeProbe("model-selection");
  const served = await serveHomeRuntime(t, { completeText: undefined, pluginFixtures: { home: [probe.definition] } });
  await grantHomeProbe(served.host, probe);
  const makeProvider = async (id: string, name: string) => {
    const key = randomUUID(), server = await startModelStandIn(key, name);
    t.after(() => server.close());
    const created = await served.request("/api/settings/connectors/connections", { method: "POST", body: { service_id: "model-api", display_name: name, token: key } });
    assert.equal(created.status, 201);
    const { connection } = await created.json() as { connection: { connection_id: string } };
    const selection = { provider_id: id, model_id: `${id}-model` };
    const save = async (enabled = true, modelEnabled = true) => {
      const response = await served.request(`/api/settings/models/${id}`, { method: "POST", body: {
        display_name: name, base_url: server.baseUrl, api_format: "openai-chat-completions", prompt_cache: "off", enabled,
        models: [{ model_id: selection.model_id, enabled: modelEnabled }], connection_id: connection.connection_id, check_connection: false,
      } });
      assert.equal(response.status, 200, await response.text());
    };
    await save();
    assert.equal(server.requests.length, 0, "configuring without a connectivity check sends no model request");
    return { server, selection, save, connectionId: connection.connection_id };
  };
  const first = await makeProvider("first", "A default"), second = await makeProvider("second", "B selected");
  const model = probe.contexts.at(-1)!.services!.model!;
  const call = (request: PluginModelRequest = {}) => {
    probe.behavior.ask = async context => (await context.services!.model!.complete(instructed(probe.instruction, "材料"), request)).text;
    return served.host.homeActionClient().invoke(person(probe.permissions), probe.ask, {});
  };
  return { ...served, probe, model, first, second, call };
}

test("W5-01-SEL-01 an explicit Runtime model selection reaches only that configured provider and model; the default is unchanged", { timeout: 60_000 }, async t => {
  const { model, first, second, call } = await fixture(t);
  assert.deepEqual(model.availability(), { available: true, runtime_label: "Prologue · A default · first-model" });
  assert.deepEqual(model.availability(second.selection), { available: true, runtime_label: "Prologue · B selected · second-model" });
  assert.equal(await call(), "A default");
  assert.equal(await call({ selection: second.selection }), "B selected");
  assert.deepEqual(first.server.requests.map(request => request.model), ["first-model"]);
  assert.deepEqual(second.server.requests.map(request => request.model), ["second-model"]);
});

test("W5-01-SEL-02 malformed, missing, disabled and disconnected selections send nothing even while a default model is available", { timeout: 60_000 }, async t => {
  const { model, first, second, call, request } = await fixture(t);
  for (const selection of [null, {}, { provider_id: "second" }, { provider_id: "", model_id: "second-model" }, { provider_id: "second", model_id: 1 }]) {
    assert.throws(() => model.availability(selection as never), { code: "plugin.model_selection_invalid" });
    await assert.rejects(call({ selection: selection as never }), { code: "plugin.model_selection_invalid" });
  }
  const refused = async (selection: PluginModelSelection) => {
    assert.equal(model.availability(selection).available, false);
    await assert.rejects(call({ selection }), { code: "actions.connection_required" });
    assert.equal(model.availability().available, true);
    assert.equal(first.server.requests.length + second.server.requests.length, 0);
  };
  await refused({ provider_id: "absent", model_id: "second-model" });
  await refused({ provider_id: "second", model_id: "absent" });
  await second.save(false); await refused(second.selection);
  await second.save(true, false); await refused(second.selection);
  await second.save();
  assert.equal((await request(`/api/settings/connectors/connections/${second.connectionId}`, { method: "DELETE" })).status, 200);
  await refused(second.selection);
});

test("W5-01-SEL-03 changing the caller's selection while beforeEffect yields cannot change the request's model", { timeout: 60_000 }, async t => {
  const { host, probe, first, second } = await fixture(t);
  const selection = { ...second.selection };
  probe.behavior.ask = async context => {
    const pending = context.services!.model!.complete(instructed(probe.instruction, "材料"), { selection });
    Object.assign(selection, first.selection);
    return (await pending).text;
  };
  assert.equal(await host.homeActionClient().invoke(person(probe.permissions), probe.ask, {}), "B selected");
  assert.deepEqual(second.server.requests.map(request => request.model), ["second-model"]);
  assert.equal(first.server.requests.length, 0);
});

test("W5-01-SHM-02 / W5-01-SEL-03 a selected model whose connection changes while it answers cannot hand its result to the plugin", { timeout: 60_000 }, async t => {
  const { home, host, probe, first, second } = await fixture(t);
  let handed = false, disconnected = false;
  probe.behavior.ask = async context => {
    const answer = await context.services!.model!.complete(instructed(probe.instruction, "材料"), { selection: second.selection, onText() {
      if (disconnected) return;
      disconnected = true;
      withConnectorConnections(home, store => store.disconnect(second.connectionId));
    } }).catch((error: unknown) => {
      assert.ok(error instanceof Error);
      const failure = error as PluginModelFailure;
      assert.equal(failure.code, "actions.configuration_changed");
      assert.equal(failure.execution, undefined, "a terminal refusal cannot be recorded as a model failure");
      assert.equal(failure.validateResult, undefined, "a terminal refusal offers no commit guard");
      throw error;
    });
    handed = true;
    context.services!.storage!.set("answer", answer.text);
    return answer.text;
  };
  await assert.rejects(host.homeActionClient().invoke(person(probe.permissions), probe.ask, {}), { code: "actions.configuration_changed" });
  assert.equal(disconnected, true);
  assert.equal(handed, false);
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("answer"), null);
  assert.deepEqual(second.server.requests.map(request => request.model), ["second-model"]);
  assert.equal(first.server.requests.length, 0);
});
