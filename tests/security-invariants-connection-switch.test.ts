// S-108: who may switch the account a consumer uses (spec assistant-service-connections §13.4): the contract every consumer's switch is
// declared with, then the Host's aggregate and the two consumers it holds (model providers, plugin connection slots).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { connectorAccountActionProvider, connectorPluginSlotSwitch, connectorUsagesSwitchAction, modelProviderSwitch, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { ActionError, actionReachesAudience, type ActionAudience, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineConnectorUsagesSwitchAction } from "@molis-ai/molis-work-contracts/services/connector-host";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { openTestHome } from "./fixtures/test-home.js";

const switchAction = defineConnectorUsagesSwitchAction("example.connection.switch", "换用账号", ["connectors:management:write"], "home");

test("S-108 RAC-2940 only the person reaches a consumer's switch: Agent, MCP, workflow and plugin callers are refused", () => {
  const others: ActionAudience[] = ["agent", "mcp", "workflow", "plugin"];
  assert.equal(actionReachesAudience(switchAction.action, switchAction.capability_id, "user"), true);
  for (const audience of others) assert.equal(actionReachesAudience(switchAction.action, switchAction.capability_id, audience), false, audience);
  assert.deepEqual(switchAction.action.audiences, ["user"]);
  assert.equal(switchAction.operation, "command");
  assert.equal(switchAction.action.effect, "write");
});

test("S-108 RAC-2941 a switch input names only the two connections and the usages, never who calls or where", () => {
  const input = compileActionSchema(switchAction.action.input_schema);
  assert.equal(input({ from_connection_id: "a", to_connection_id: "b" }), true);
  assert.equal(input({ from_connection_id: "a", to_connection_id: "b", usage_ids: ["slot-1"] }), true);
  for (const trusted of ["actor_id", "project_id", "install_id", "audience", "credential"]) {
    assert.equal(input({ from_connection_id: "a", to_connection_id: "b", [trusted]: "x" }), false, trusted);
  }
  assert.equal(input({ to_connection_id: "b" }), false);
  assert.equal(input({ from_connection_id: "", to_connection_id: "b" }), false);
  assert.equal(input({ from_connection_id: "a", to_connection_id: "b", usage_ids: [] }), false);
  const output = compileActionSchema(switchAction.action.output_schema!);
  assert.equal(output({ switched: ["slot-1"], refused: [{ usage_id: "slot-2", code: "connector.plugin_slots.slot_undeclared" }] }), true);
  // A refusal says which usage and a stable `<owner>.<reason>` code; free text or a credential has no place to go.
  assert.equal(output({ switched: [], refused: [{ usage_id: "slot-2", code: "connector.plugin_slots.slot_undeclared", message: "token abc" }] }), false);
  for (const code of ["这个账号已经失效", "the account was revoked", "connector", "Connector.Slot", "connector.plugin slots"]) {
    assert.equal(output({ switched: [], refused: [{ usage_id: "slot-2", code }] }), false, code);
  }
});

// The Host's half (§13.4): the aggregate and the two consumers it holds, through a real Home's action client.
const user: ActionCallContext = { actor_id: "switch-person", audience: "user", project_id: null, permissions: ["connectors:management:read", "connectors:management:write"] };
type Report = { results: Array<{ capability_id: string; switched: string[]; refused: Array<{ usage_id: string; code: string }> }>; failed: Array<{ capability_id: string; code: string }> };
const switchAll = (client: ActionClient, from: string, to: string, caller: ActionCallContext = user) => client.invoke(caller, connectorUsagesSwitchAction, { from_connection_id: from, to_connection_id: to }) as Promise<Report>;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

async function modelHome(t: TestContext) {
  const home = await openTestHome(t), client = home.host.homeActionClient();
  const [a, b, other, image] = withConnectorConnections(home.home, store => [
    store.createToken({ serviceId: "model-api", displayName: "Key A", token: "fixture-switch-key-a" }),
    store.createToken({ serviceId: "model-api", displayName: "Key B", token: "fixture-switch-key-b" }),
    store.createToken({ serviceId: "model-api", displayName: "Key elsewhere", token: "fixture-switch-key-c" }),
    store.createToken({ serviceId: "image-api", displayName: "Image key", token: "fixture-switch-image" }),
  ]);
  withConnectorConnections(home.home, store => {
    store.assertTarget(a!.connection_id, "model-api", "https://model.example/v1");
    store.assertTarget(b!.connection_id, "model-api", "https://model.example/v1");
    store.assertTarget(other!.connection_id, "model-api", "https://other.example/v1");
  });
  const models = home.host.configurePersonalPlanning(home.home, withMolisWorkProjectCatalog);
  await models({ homeDirectory: home.home }, catalog => {
    for (const [provider_id, base_url] of [["here", "https://model.example/v1"], ["there", "https://other.example/v1"]] as const) {
      catalog.models.upsert({ provider_id, display_name: provider_id, base_url, api_format: "openai-chat-completions", credential_ref: a!.credential_ref!, models: [{ model_id: "text-1", enabled: true }] });
    }
  });
  const keyOf = (provider_id: string) => models({ homeDirectory: home.home }, catalog => catalog.models.get(provider_id)?.credential_ref);
  return { home, client, a: a!, b: b!, other: other!, image: image!, keyOf };
}

test("S-108 RAC-2942 an Agent or MCP cannot switch; two services, the same account or an account not connected moves nothing", { timeout: 60_000 }, async t => {
  const { home, client, a, b, image, keyOf } = await modelHome(t);
  for (const audience of ["agent", "mcp"] as const) await assert.rejects(switchAll(client, a.connection_id, b.connection_id, { ...user, audience }));
  await assert.rejects(switchAll(client, a.connection_id, image.connection_id), code("connector.switch.service_mismatch"));
  await assert.rejects(switchAll(client, a.connection_id, a.connection_id), code("connector.switch.same_connection"));
  withConnectorConnections(home.home, store => store.disconnect(b.connection_id));
  await assert.rejects(switchAll(client, a.connection_id, b.connection_id), code("connector.switch.target_unavailable"));
  assert.deepEqual([await keyOf("here"), await keyOf("there")], [a.credential_ref, a.credential_ref], "every provider keeps the key it had");
});

test("S-108 RAC-2943 a model provider takes the new key only for the address that key was saved for; one at another address is refused alone", { timeout: 60_000 }, async t => {
  const { client, a, b, keyOf } = await modelHome(t);
  const report = await switchAll(client, a.connection_id, b.connection_id);
  const models = report.results.find(result => result.capability_id === modelProviderSwitch.capability_id)!;
  assert.deepEqual(models.switched, ["here"]);
  assert.deepEqual(models.refused, [{ usage_id: "there", code: "model_provider.origin_mismatch" }]);
  assert.deepEqual([await keyOf("here"), await keyOf("there")], [b.credential_ref, a.credential_ref]);
  assert.doesNotMatch(JSON.stringify(report), /fixture-switch-key/, "no key in the answer");
});

/** A Home with two GitHub accounts and three plugin slots bound to the first; only `install-declared` declares its slot. */
async function slotHome(t: TestContext, declareEverywhere = false) {
  const home = await mkdtemp(join(tmpdir(), "connection-switch-")); t.after(() => rm(home, { recursive: true, force: true }));
  const [a, b] = withConnectorConnections(home, store => [
    store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-switch-github-a" }),
    store.createToken({ serviceId: "github", displayName: "Personal", token: "fixture-switch-github-b" }),
  ]);
  const plugin_id = "io.molis.work.example.switch";
  withConnectorConnections(home, store => {
    for (const install_id of ["install-declared", "install-undeclared"]) store.bind({ scopeId: pluginBindingScope({ install_id }), pluginId: plugin_id, slotId: "account", serviceId: "github", connectionId: a!.connection_id });
    store.bind({ scopeId: pluginBindingScope({ install_id: "install-declared", project_id: "project-1", record_key: "repo-1" }), pluginId: plugin_id, slotId: "repos", serviceId: "github", connectionId: a!.connection_id });
  });
  const declarations = async (_caller: ActionCallContext, install_id: string) => declareEverywhere || install_id === "install-declared"
    ? [{ slot_id: "account", service_id: "github" }, { slot_id: "repos", service_id: "github", binding: "per_record" as const }] : [];
  const handler = connectorAccountActionProvider(home, () => {}, undefined, undefined, undefined, declarations as never).handlers.find(entry => entry.capability_id === connectorPluginSlotSwitch.capability_id)!;
  const bound = () => withConnectorConnections(home, store => store.pluginBindings(a!.connection_id).length);
  return { home, a: a!, b: b!, plugin_id, handler, bound };
}
const usage = (install_id: string, plugin_id: string, slot_id: string, project_id: string | null = null) => JSON.stringify([install_id, plugin_id, slot_id, project_id]);

test("S-108 RAC-2944 a plugin slot is switched only where binding it would pass: an undeclared slot, a record outside the caller's project and an account made for another package are refused alone", { timeout: 30_000 }, async t => {
  const { home, a, b, plugin_id, handler, bound } = await slotHome(t);
  const call = (caller: ActionCallContext, input: object) => Promise.resolve(handler.handle({ ...caller, beforeEffect: async () => {} } as never, { from_connection_id: a.connection_id, to_connection_id: b.connection_id, ...input })) as Promise<{ switched: string[]; refused: Array<{ usage_id: string; code: string }> }>;
  withConnectorConnections(home, store => store.declarers.pin(b.connection_id, { plugin_id: "io.molis.work.example.other", install_id: "install-other", plugin_title: "Other" }));
  const pinned = await call(user, { usage_ids: [usage("install-declared", plugin_id, "account")] });
  assert.deepEqual(pinned, { switched: [], refused: [{ usage_id: usage("install-declared", plugin_id, "account"), code: "connector.plugin_slots.connection_pinned" }] });
  assert.equal(bound(), 3, "nothing moved");
  const [, c] = withConnectorConnections(home, store => [null, store.createToken({ serviceId: "github", displayName: "Another", token: "fixture-switch-github-c" })]);
  const report = await call(user, { to_connection_id: c!.connection_id });
  assert.deepEqual(report.switched, [usage("install-declared", plugin_id, "account")]);
  assert.deepEqual(report.refused.map(entry => entry.code).sort(), ["connector.plugin_slots.project_required", "connector.plugin_slots.slot_undeclared"]);
  assert.equal(bound(), 2, "the undeclared slot and the record stay on the first account");
  // In the record's own project the person can switch it.
  const inProject = await call({ ...user, project_id: "project-1" }, { to_connection_id: c!.connection_id, usage_ids: [usage("install-declared", plugin_id, "repos", "project-1")] });
  assert.deepEqual(inProject.switched, [usage("install-declared", plugin_id, "repos", "project-1")]);
});

test("S-108 RAC-2945 a switch called off part way changes nothing more: what was switched stays, what was not is left", { timeout: 30_000 }, async t => {
  const { a, b, plugin_id, handler, bound } = await slotHome(t, true);
  let effects = 0;
  await assert.rejects(Promise.resolve(handler.handle({ ...user, beforeEffect: async () => { if (++effects > 1) throw new ActionError("actions.cancelled", "已取消"); } } as never,
    { from_connection_id: a.connection_id, to_connection_id: b.connection_id, usage_ids: [usage("install-declared", plugin_id, "account"), usage("install-undeclared", plugin_id, "account")] })),
  code("actions.cancelled"));
  assert.equal(bound(), 2, "the first was switched before the call was called off; the second still has the first account");
});
