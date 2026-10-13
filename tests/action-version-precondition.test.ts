import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

const caller = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: "person", audience, project_id: "project", permissions: ["write"] });
function definition(field: string, shape: ActionSchema = { type: "integer", minimum: 0 }, options: { required?: boolean; capability?: string; operation?: "query" | "command" } = {}): ActionDefinition {
  const operation = options.operation ?? "command";
  return { capability_id: options.capability ?? `fixture.version.${field}`, version: 1, operation, action: {
    title: "保存版本", description: "按读到的版本保存", kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["agent", "mcp", "user", "workflow", "plugin"], permissions: ["write"], subject_kinds: [],
    input_schema: { type: "object", properties: { value: { type: "string" }, ids: { type: "array", items: { type: "string" } }, [field]: shape },
      required: options.required ? ["value", field] : ["value"], additionalProperties: false } } };
}
function fixture(action: ActionDefinition, handle?: (context: ActionExecutionContext, input: unknown) => unknown) {
  const service = new ActionService(); const facts: unknown[] = [];
  service.registerProvider({ provider: { provider_id: "fixture", title: "Fixture", kind: "system" }, definitions: [action],
    handlers: [{ ...action, handle: handle ?? ((_, input) => { facts.push(input); return { saved: true }; }) }] });
  return { service, facts };
}
const refuses = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code && error.kind === "invalid";

for (const audience of ["agent", "mcp"] as const) for (const field of ["expected_version", "expected_revision", "expected_revisions", "expected_updated_at", "updated_at"])
  test(`W3-09-3-01: ${audience} must supply ${field} before any production handler runs`, async () => {
    const map = field === "expected_revisions", shape: ActionSchema = map ? { type: "object", additionalProperties: { type: "integer", minimum: 0 } } : field.includes("at") ? { type: ["string", "null"], minLength: 1 } : { type: "integer", minimum: 0 };
    const action = definition(field, shape, { ...(field === "updated_at" ? { capability: "functions.authoring.update" } : {}) });
    const { service, facts } = fixture(action);
    await assert.rejects(service.invoke(caller(audience), action, { value: "原稿" }), refuses("actions.version_required"));
    assert.deepEqual(facts, []);
    const current = map ? { id: 2 } : field.includes("at") ? "2026-10-13T10:00:00Z" : 2;
    assert.deepEqual(await service.invoke(caller(audience), action, { value: "新稿", [field]: current }), { saved: true });
    assert.equal(facts.length, 1);
  });

for (const audience of ["user", "workflow", "plugin"] as const) test(`W3-09-3-01: ${audience} keeps its existing optional version contract`, async () => {
  const action = definition("expected_revision"), { service, facts } = fixture(action);
  await service.invoke(caller(audience), action, { value: "本人或原插件请求" }); assert.equal(facts.length, 1);
});

test("W3-09-3-01/02: missing required versions alone receive version_required; malformed values and other missing business fields remain input_invalid", async () => {
  const action = definition("expected_revision", { type: "integer", minimum: 0 }, { required: true }), { service, facts } = fixture(action);
  await assert.rejects(service.invoke(caller("mcp"), action, { value: "原稿" }), refuses("actions.version_required"));
  for (const input of [{}, { expected_revision: 1 }, { value: "原稿", expected_revision: null }, { value: "原稿", expected_revision: "1" }, { value: "原稿", expected_revision: 1, forged_nested: true }])
    await assert.rejects(service.invoke(caller("mcp"), action, input), refuses("actions.input_invalid"));
  assert.deepEqual(facts, []);
});

for (const field of ["expected_revisions", "expected_updated_at"]) test(`W3-09-3-01/02: ${field} covers every selected id, including absent, empty and partial maps`, async () => {
  const action = definition(field, { type: "object", additionalProperties: field === "expected_revisions" ? { type: "integer" } : { type: "string", minLength: 1 } });
  const { service, facts } = fixture(action), revision = field === "expected_revisions" ? 2 : "2026-10-13T10:00:00Z";
  for (const input of [{ value: "原稿", ids: ["a", "b"] }, { value: "原稿", ids: ["a", "b"], [field]: {} }, { value: "原稿", ids: ["a", "b"], [field]: { a: revision } }])
    await assert.rejects(service.invoke(caller("agent"), action, input), refuses("actions.version_required"));
  await assert.rejects(service.invoke(caller("agent"), action, { value: "原稿", ids: ["a", "b"], [field]: null }), refuses("actions.input_invalid"));
  assert.deepEqual(facts, []);
  await service.invoke(caller("agent"), action, { value: "新稿", ids: ["a", "b"], [field]: { a: revision, b: revision } }); assert.equal(facts.length, 1);
});

test("W3-09-3-02: the actual create-if-absent null contract is preserved while Functions updated_at null refuses AI writes", async () => {
  const create = definition("expected_revision", { type: ["string", "null"] }, { required: true }), a = fixture(create);
  await a.service.invoke(caller("agent"), create, { value: "首次绑定", expected_revision: null }); assert.equal(a.facts.length, 1);
  const update = definition("updated_at", { type: ["string", "null"] }, { capability: "functions.authoring.update" }), b = fixture(update);
  await assert.rejects(b.service.invoke(caller("agent"), update, { value: "覆盖草稿", updated_at: null }), refuses("actions.version_required")); assert.deepEqual(b.facts, []);
  await b.service.invoke(caller("user"), update, { value: "本人保存", updated_at: null }); assert.equal(b.facts.length, 1);
});

test("W3-09-3-03: only the dispatcher's active execution context exempts nested AI calls; a new top-level caller inside it still needs a version", async () => {
  const child = definition("expected_revision"), { service, facts } = fixture(child);
  const parent = definition("unused", {}, { capability: "fixture.parent" });
  let saved: ActionExecutionContext | undefined;
  service.registerProvider({ provider: { provider_id: "parent", title: "Parent", kind: "system" }, definitions: [parent], handlers: [{ ...parent, async handle(context) {
    saved = context;
    await assert.rejects(service.invoke(caller("agent"), child, { value: "独立顶层调用" }), refuses("actions.version_required"));
    await service.invoke({ ...context }, child, { value: "真实嵌套调用" });
    return { saved: true };
  } }] });
  await service.invoke(caller("agent"), parent, { value: "outer", unused: {} });
  assert.equal(facts.length, 1);
  assert.ok(saved);
  await assert.rejects(service.invoke({ ...saved, assert_authority_current: undefined }, child, { value: "原handler已经返回" }), refuses("actions.version_required"));
  assert.equal(facts.length, 1);
});

test("W3-09-3-03: a timed-out parent's still-pending promise cannot carry a nested version exemption", { timeout: 3_000 }, async () => {
  const child = definition("expected_revision"), { service, facts } = fixture(child), release = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>(), checked = Promise.withResolvers<void>();
  const original = definition("unused", {}, { capability: "fixture.timeout" }), parent = { ...original, action: { ...original.action, execution: { timeout_ms: 20 } } };
  service.registerProvider({ provider: { provider_id: "timeout", title: "Timeout", kind: "system" }, definitions: [parent], handlers: [{ ...parent, async handle(context) {
    entered.resolve(); await release.promise;
    try { await assert.rejects(service.invoke({ ...context, signal: undefined, assert_authority_current: undefined }, child, { value: "迟到的嵌套调用" }), refuses("actions.version_required")); checked.resolve(); }
    catch (error) { checked.reject(error); }
    return { saved: true };
  } }] });
  const pending = service.invoke(caller("agent"), parent, { value: "outer", unused: {} });
  const rejected = assert.rejects(pending, error => error instanceof ActionError && error.code === "actions.timeout");
  await entered.promise; await rejected; release.resolve(); await checked.promise; assert.deepEqual(facts, []);
});

test("W3-09-3-01: queries and independent creates without any declared version field keep their existing contracts", async () => {
  const query = definition("expected_revision", { type: "integer" }, { operation: "query" }), a = fixture(query);
  await a.service.invoke(caller("mcp"), query, { value: "read" }); assert.equal(a.facts.length, 1);
  const create = definition("title", { type: "string" }, { capability: "fixture.create" }), b = fixture(create);
  await b.service.invoke(caller("agent"), create, { value: "new", title: "独立创建" }); assert.equal(b.facts.length, 1);
});
