import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginRuntimeRepository, PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineSubjectOffersAction } from "../packages/plugin-sdk/src/index.js";
import { type ActionCallContext, type ActionDefinition, type SubjectActionOffer } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHomeOfferHandlers, homeOfferActions, type HomeActionOffers } from "../apps/local-host/src/home-offer-actions.js";
import { createActionMcpPorts, actionMcpToolName, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
const caller: ActionCallContext = { actor_id: "owner", project_id: "offer-project", audience: "user", permissions: ["home:read", "note:read", "note:write"] };

test("unknown SDK plugin prepares real actions, Home revalidates exact input and source, and MCP uses the same execution", async () => {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: "system.home", title: "Home", kind: "system", project_id: caller.project_id! }, definitions: Object.values(homeOfferActions), handlers: createHomeOfferHandlers(service) });
  let revision = 1, saved = "original", writes = 0, prepares = 0, mode: "normal" | "invalid" | "cross" | "duplicate" | "retarget" = "normal";
  const write: ActionDefinition = { capability_id: "unknown.note.replace", version: 1, operation: "command", action: {
    title: "替换笔记", description: "按原版本写入本插件笔记", kind: "operation", scope: "project", audiences: ["user", "mcp"], permissions: ["note:write"], subject_kinds: ["note"],
    input_schema: { type: "object", properties: { id: { type: "string" }, expected_revision: { type: "integer" }, text: { type: "string" }, request_id: { type: "string" } }, required: ["id", "expected_revision", "text", "request_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { revision: { type: "integer" }, text: { type: "string" } }, required: ["revision", "text"] } } };
  const offers = defineSubjectOffersAction("unknown.note.offers", ["note"], "笔记可用动作", ["note:read"], [
    { offer_id: "notes.replace", title: "整理笔记", action: { capability_id: write.capability_id, version: 1 } },
  ]);
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.offer-notes", version: "1.0.0", name: "Notes",
    kind: "app", publisher: { publisher_id: "example", signature: "example-offer" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["note:read", "note:write"].map(permission => ({ permission, required: false, reason: "读写原笔记" })), capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [write, offers] },
    async start() { return { kind: "app", actions: [{ ...write, handle: (_caller, value) => {
      const input = value as { id: string; expected_revision: number; text: string };
      assert.equal(input.id, "note-1"); assert.equal(input.expected_revision, revision);
      revision++; saved = input.text; writes++; return { revision, text: saved };
    } }, { ...offers, handle: (_caller, value) => {
      prepares++;
      const input = value as { subject: { id: string }; request_id: string };
      const offer: SubjectActionOffer = { offer_id: "notes.replace", title: "整理笔记", action: { capability_id: write.capability_id, version: mode === "retarget" ? 2 : 1, ...(mode === "cross" ? { provider_id: "another" } : {}) },
        input: mode === "invalid" ? { text: 12 } : { id: input.subject.id, expected_revision: revision, text: "revised by owner", request_id: input.request_id } };
      return { offers: mode === "duplicate" ? [offer, offer] : [offer] };
    } }] }; } });
  const repository = new MemoryPluginRuntimeRepository();
  const runtime = new PluginRuntime(repository, undefined, { actions: { registry: service, project_id: caller.project_id! } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: ["note:read", "note:write"] }).install;
  const input = { subject: { kind: "note", id: "note-1" }, request_id: "fixed-request" };
  const prepare = async (context = caller) => await service.invoke(context, homeOfferActions.offers, input) as HomeActionOffers;
  const request = (offer: HomeActionOffers["offers"][number]) => { const { availability, ...selected } = offer; return { ...input, offer: selected }; };
  try {
    await runtime.start(install.install_id);
    const choices = await service.invoke(caller, homeOfferActions.choices, {}) as { choices: Array<{ key: string; availability: { available: boolean }; source: { provider_id: string }; offer_id: string }> };
    assert.equal(choices.choices.length, 1); assert.equal(choices.choices[0]!.source.provider_id, install.install_id);
    assert.equal(choices.choices[0]!.offer_id, "notes.replace"); assert.equal(choices.choices[0]!.availability.available, true);
    assert.match(choices.choices[0]!.key, /^[a-z][a-z0-9_.]{0,63}$/); assert.equal(prepares, 0, "catalog discovery must not execute an object query");
    const prepared = await prepare();
    assert.equal(prepared.offers[0]!.recommendation_key, choices.choices[0]!.key, "the rule option and actual prepared action share the same pinned identity");
    assert.equal(prepared.offers[0]!.availability.available, true); assert.equal(prepared.sources[0]!.provider_id, install.install_id);
    const original = request(prepared.offers[0]!);
    await assert.rejects(service.invoke(caller, homeOfferActions.execute, { ...original, offer: { ...original.offer, recommendation_key: "offer." + "0".repeat(58) } }), { code: "actions.offer_changed" });
    await assert.rejects(service.invoke(caller, homeOfferActions.execute, { ...original, offer: { ...original.offer, input: { ...(original.offer.input as object), text: "tampered" } } }), { code: "actions.offer_changed" });
    assert.equal(writes, 0); assert.equal(saved, "original");
    assert.deepEqual(await service.invoke(caller, homeOfferActions.execute, original), { title: "整理笔记", result: { revision: 2, text: "revised by owner" } });
    assert.equal(writes, 1); assert.equal(saved, "revised by owner");
    await assert.rejects(service.invoke(caller, homeOfferActions.execute, original), { code: "actions.offer_changed" }); assert.equal(writes, 1);
    const denied = await prepare({ ...caller, permissions: ["home:read", "note:read"] });
    assert.equal(denied.offers[0]!.availability.available, false);
    const deniedChoices = await service.invoke({ ...caller, permissions: ["home:read", "note:read"] }, homeOfferActions.choices, {}) as typeof choices;
    assert.equal(deniedChoices.choices[0]!.key, choices.choices[0]!.key); assert.equal(deniedChoices.choices[0]!.availability.available, false);
    await assert.rejects(service.invoke({ ...caller, project_id: "foreign" }, homeOfferActions.execute, original));
    mode = "invalid"; assert.equal((await prepare()).offers[0]!.availability.available, false); assert.equal(writes, 1);
    for (const invalid of ["cross", "duplicate", "retarget"] as const) { mode = invalid; const result = await prepare(); assert.equal(result.offers.length, 0); assert.equal(result.sources.length, 0); assert.equal(result.issues.length, 1); }
    mode = "normal";
    const mcpCaller = { ...caller, audience: "mcp" as const };
    const ports = createActionMcpPorts({ service, context: () => mcpCaller, serverInfo: { name: "offers", version: "1" } });
    const choiceReply = await handleMcpMessage({ id: 0, method: "tools/call", params: { name: actionMcpToolName(homeOfferActions.choices), arguments: {} } }, ports);
    assert.deepEqual(JSON.parse((choiceReply!.result as { content: Array<{ text: string }> }).content[0]!.text), choices);
    const next = request((await prepare(mcpCaller)).offers[0]!);
    const response = await handleMcpMessage({ id: 1, method: "tools/call", params: { name: actionMcpToolName(homeOfferActions.execute), arguments: next } }, ports);
    assert.equal((response!.result as { isError: boolean }).isError, false); assert.equal(writes, 2);
    const beforeRevocation = request((await prepare()).offers[0]!);
    const revokeOnDispatch: ActionCallContext = { ...caller, validate_authority: reference => {
      if (reference.capability_id === write.capability_id) repository.save({ ...runtime.get(install.install_id), grants: ["note:write"] });
    } };
    await assert.rejects(service.invoke(revokeOnDispatch, homeOfferActions.execute, beforeRevocation), { code: "actions.offer_source_changed" });
    assert.equal(writes, 2);
    assert.equal(service.discover(caller).find(action => action.capability_id === write.capability_id)?.availability.available, true);
    repository.save({ ...runtime.get(install.install_id), grants: ["note:read", "note:write"] });
    await runtime.stop(install.install_id);
    assert.equal((await prepare()).sources.length, 0);
    assert.deepEqual(await service.invoke(caller, homeOfferActions.choices, {}), { choices: [] });
    await assert.rejects(service.invoke(caller, homeOfferActions.execute, next), { code: "actions.offer_source_changed" }); assert.equal(writes, 2);
    const stopReplacement = service.registerProvider({ provider: { provider_id: "replacement", title: "Replacement", kind: "plugin", project_id: caller.project_id! },
      definitions: [offers, write], handlers: [{ ...offers, handle: () => ({ offers: [] }) }, { ...write, handle: () => { throw new Error("must not execute during discovery"); } }] });
    const replacement = await service.invoke(caller, homeOfferActions.choices, {}) as typeof choices;
    assert.notEqual(replacement.choices[0]!.key, choices.choices[0]!.key, "a new provider cannot inherit another installation's saved option");
    await assert.rejects(service.invoke(caller, homeOfferActions.execute, next), { code: "actions.offer_source_changed" }); stopReplacement();
  } finally { if (runtime.get(install.install_id).state === "running") await runtime.stop(install.install_id); }
  const malformed = { ...offers, action: { ...offers.action, input_schema: { type: "object" } } };
  assert.throws(() => service.registerProvider({ provider: { provider_id: "malformed", title: "Malformed", kind: "plugin" }, definitions: [malformed], handlers: [{ ...malformed, handle: () => ({ offers: [] }) }] }), { code: "actions.definition_invalid" });
  for (const subject_offer_choices of [
    [...offers.action.subject_offer_choices!, ...offers.action.subject_offer_choices!],
    [{ ...offers.action.subject_offer_choices![0]!, subject_kinds: ["undeclared-kind"] }],
    [{ ...offers.action.subject_offer_choices![0]!, action: { ...write, provider_id: "someone-else" } }],
  ]) {
    const invalid = { ...offers, action: { ...offers.action, subject_offer_choices } };
    assert.throws(() => service.registerProvider({ provider: { provider_id: "invalid-choices", title: "Bad choices", kind: "plugin" }, definitions: [invalid], handlers: [{ ...invalid, handle: () => ({ offers: [] }) }] }), { code: "actions.definition_invalid" });
  }
});
