import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionProviderRegistration, type ActionReference, type ActionClient,
  type ExactActionReference, type RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";

const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: "a", permissions: [] };
const owner = { provider_id: "source", title: "Source", kind: "system" as const, project_id: "a" };
function action(id: string, operation: "query" | "command" = "query"): ActionDefinition {
  return { capability_id: `fixture.${id}`, version: 1, operation, action: { title: id, description: id,
    kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "null" } } };
}
const read = action("read"), later = action("later"), write = action("write", "command");
const captureOne = (client: Pick<ActionClient, "captureSources">, context: ActionCallContext, references: readonly ExactActionReference[]) => client.captureSources!([{ context, references }]);
const exact = (definition = read, provider_id = owner.provider_id): ExactActionReference => ({ capability_id: definition.capability_id, version: definition.version, provider_id });
function registration(definition = read, sourceRevision?: ActionProviderRegistration["sourceRevision"]): ActionProviderRegistration {
  return { provider: owner, definitions: [definition], handlers: [{ ...definition, execution: "sync", handle: () => null }],
    ...(sourceRevision ? { sourceRevision } : {}) };
}

test("MEM-SYSTEM-SOURCE-CAPTURE: exact split registrations keep their original owner readers and receive only a frozen minimal scope", () => {
  const service = new ActionService(); let first = 0, second = 0;
  service.registerProvider(registration(read, scope => {
    assert.deepEqual(Object.keys(scope).sort(), ["actor_id", "project_id"]); assert.equal(Object.isFrozen(scope), true);
    assert.deepEqual(scope, { actor_id: "owner", project_id: "a" }); return first;
  }));
  service.registerProvider(registration(later, () => second));
  const early = captureOne(service, caller, [exact()]), late = captureOne(service, caller, [exact(later)]);
  first++; assert.throws(early, { code: "actions.conflict" }); late();
  const earlyAgain = captureOne(service, caller, [exact()]); second++; earlyAgain(); assert.throws(late, { code: "actions.conflict" });
});

for (const callback of ["authority", "availability", "host"] as const) test(`MEM-SYSTEM-SOURCE-CAPTURE: all ${callback} callbacks precede every owner comparison`, () => {
  let revision = 0, armed = false;
  const mutate = () => { if (armed) { armed = false; revision++; } };
  const service = new ActionService(undefined, { assertCurrent: (_context, reference) => { if (callback === "host" && reference.capability_id === later.capability_id) mutate(); } });
  service.registerProvider(registration(read, () => revision));
  service.registerProvider({ ...registration(later, () => 0), availability: () => {
    if (callback === "availability") mutate(); return { available: true };
  } });
  const context = { ...caller, assert_authority_current: (reference?: ActionReference) => {
    if (callback === "authority" && reference?.capability_id === later.capability_id) mutate();
  } };
  const guard = captureOne(service, context, [exact(), exact(later)]); armed = true;
  assert.throws(guard, { code: "actions.conflict" }); assert.equal(armed, false);
});

test("MEM-SYSTEM-SOURCE-CAPTURE: a later project's authority cannot change the earlier project's same action after its owner check", () => {
  const service = new ActionService(); let first = 0, armed = false;
  service.registerProvider(registration(read, () => first));
  service.registerProvider({ ...registration(read, scope => { assert.equal(scope.project_id, "b"); return 0; }), provider: { ...owner, project_id: "b" } });
  const other = { ...caller, project_id: "b", assert_authority_current: () => { if (armed) { armed = false; first++; } } };
  const guard = service.captureSources([{ context: caller, references: [exact()] }, { context: other, references: [exact()] }]);
  armed = true; assert.throws(guard, { code: "actions.conflict" }); assert.equal(armed, false);
});

for (const value of [NaN, Infinity, {}, Promise.resolve(0)]) test(`MEM-SYSTEM-SOURCE-CAPTURE: invalid owner result ${String(value)} is refused at capture and recheck`, () => {
  const service = new ActionService(); let current: unknown = 0;
  const source = registration(); Object.defineProperty(source, "sourceRevision", { value: () => current });
  service.registerProvider(source);
  const guard = captureOne(service, caller, [exact()]); current = value;
  assert.throws(guard, { code: value instanceof Promise ? "actions.async_required" : "actions.definition_invalid" });
  assert.throws(() => captureOne(service, caller, [exact()]), { code: value instanceof Promise ? "actions.async_required" : "actions.definition_invalid" });
});

test("MEM-SYSTEM-SOURCE-CAPTURE: owner exceptions, missing project-data reader and untrusted reader registrations fail closed", () => {
  const service = new ActionService(); let fail = false;
  service.registerProvider(registration(read, () => { if (fail) throw new ActionError("actions.conflict", "Owner unavailable"); return "stable"; }));
  const guard = captureOne(service, caller, [exact()]); fail = true;
  assert.throws(guard, { code: "actions.conflict" }); assert.throws(() => captureOne(service, caller, [exact()]), { code: "actions.conflict" });
  const missing = new ActionService(); missing.registerProvider({ ...registration(), provider: { ...owner, project_data_instance_id: "data-a" } });
  assert.throws(() => captureOne(missing, caller, [exact()]), { code: "actions.unavailable" });
  const plugin = new ActionService();
  assert.throws(() => plugin.registerProvider({ ...registration(read, () => 0), provider: { ...owner, kind: "plugin" } }), { code: "actions.provider_invalid" });
  plugin.registerProvider({ ...registration(), provider: { ...owner, kind: "plugin" } });
  captureOne(plugin, caller, [exact()])();
});

test("MEM-SYSTEM-SOURCE-CAPTURE: later authorization cannot replace an earlier registration or redirect to its new reader", () => {
  const service = new ActionService(); let armed = false, replacementReads = 0;
  let remove = service.registerProvider(registration(read, () => 0));
  service.registerProvider(registration(later, () => 0));
  const context = { ...caller, assert_authority_current: (reference?: ActionReference) => {
    if (armed && reference?.capability_id === later.capability_id) {
      armed = false; remove(); remove = service.registerProvider(registration(read, () => { replacementReads++; return 0; }));
    }
  } };
  const guard = captureOne(service, context, [exact(), exact(later)]); armed = true;
  assert.throws(guard, { code: "actions.provider_changed" }); assert.equal(replacementReads, 0);
});

for (const change of ["cancel", "replace"] as const) test(`MEM-SYSTEM-SOURCE-CAPTURE: an owner reader's ${change} is caught by the pure tail`, () => {
  const service = new ActionService(), controller = new AbortController(); let armed = false, remove!: () => void;
  remove = service.registerProvider(registration(read, () => {
    if (armed) { armed = false; if (change === "cancel") controller.abort(); else { remove(); remove = service.registerProvider(registration(read, () => 0)); } }
    return 0;
  }));
  const guard = captureOne(service, { ...caller, signal: controller.signal }, [exact()]); armed = true;
  assert.throws(guard, change === "cancel" ? { name: "AbortError" } : { code: "actions.provider_changed" });
});

test("MEM-SYSTEM-SOURCE-CAPTURE: raw command activity invalidates capture; read queries and their diagnostic logs do not", async () => {
  let logs = 0;
  const service = new ActionService(undefined, { settled: () => { logs++; } });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  service.registerProvider(registration(read, () => 0));
  service.registerProvider({ ...registration(write), handlers: [{ ...write, handle: async () => { entered.resolve(); await release.promise; return null; } }] });
  const guard = captureOne(service, caller, [exact()]);
  service.invokeSync(caller, read, {}); guard(); assert.equal(logs, 1);
  const running = service.invoke(caller, write, {}); await entered.promise;
  try {
    assert.throws(guard, { code: "actions.conflict" }); assert.throws(() => captureOne(service, caller, [exact()]), { code: "actions.conflict" });
  } finally { release.resolve(); await running; }
  assert.throws(guard, { code: "actions.conflict" }); captureOne(service, caller, [exact()])();
});

test("MEM-SYSTEM-SOURCE-CAPTURE: opt-in retain uses the same owner stamps; default and accepted background guards keep their existing contract", async () => {
  const service = new ActionService(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(); let revision = 0;
  let strict!: RetainedActionAuthority, ordinary!: RetainedActionAuthority, background!: RetainedActionAuthority;
  service.registerProvider(registration(read, () => revision));
  const origin = action("origin");
  service.registerProvider({ ...registration(origin, () => revision), provider: { ...owner, provider_id: "origin" }, handlers: [{ ...origin, handle: async context => {
    strict = context.retainAuthority!([exact()], { providerCommands: "unchanged" }); ordinary = context.retainAuthority!([exact()]);
    background = context.retainBackgroundAuthority!(); entered.resolve(); await release.promise; return null;
  } }] });
  const running = service.invoke(caller, exact(origin, "origin"), {}); await entered.promise;
  try {
    strict.assertCurrent(); revision++;
    assert.throws(() => strict.assertCurrent(), { code: "actions.conflict" }); await assert.rejects(strict(), { code: "actions.conflict" });
    ordinary.assertCurrent(); background.assertCurrent(); await ordinary(); await background();
  } finally { release.resolve(); await running; }
  ordinary.assertCurrent(); background.assertCurrent(); assert.throws(() => strict.assertCurrent(), { code: "actions.expired" });
});

test("MEM-SYSTEM-SOURCE-CAPTURE: opt-in retain checks every later authorization before the earlier owner stamp", async () => {
  const service = new ActionService(), entered = Promise.withResolvers<RetainedActionAuthority>(), release = Promise.withResolvers<void>();
  let revision = 0, armed = false;
  service.registerProvider(registration(read, () => revision)); service.registerProvider(registration(later, () => 0));
  const origin = action("retained_origin");
  service.registerProvider({ ...registration(origin), provider: { ...owner, provider_id: "origin" }, handlers: [{ ...origin, handle: async context => {
    entered.resolve(context.retainAuthority!([exact(), exact(later)], { providerCommands: "unchanged" })); await release.promise; return null;
  } }] });
  const running = service.invoke({ ...caller, assert_authority_current: reference => {
    if (armed && reference?.capability_id === later.capability_id) { armed = false; revision++; }
  } }, exact(origin, "origin"), {});
  try { const guard = await entered.promise; armed = true; assert.throws(() => guard.assertCurrent(), { code: "actions.conflict" }); }
  finally { release.resolve(); await running; }
});

test("MEM-SYSTEM-SOURCE-CAPTURE: a pure Host lifecycle tail rejects closure triggered by the final owner reader", async () => {
  let running = true, armed = false;
  const service = new ActionService(undefined, { sourceCurrent: () => running });
  service.registerProvider(registration(read, () => { if (armed) running = false; return 0; }));
  const entered = Promise.withResolvers<RetainedActionAuthority>(), release = Promise.withResolvers<void>(), origin = action("lifecycle_origin");
  service.registerProvider({ ...registration(origin), provider: { ...owner, provider_id: "origin" }, handlers: [{ ...origin, handle: async context => {
    entered.resolve(context.retainAuthority!([exact()], { providerCommands: "unchanged" })); await release.promise; return null;
  } }] });
  const invocation = service.invoke(caller, exact(origin, "origin"), {});
  try {
    const retained = await entered.promise, capture = captureOne(service, caller, [exact()]); armed = true;
    assert.throws(capture, { code: "actions.host_closed" }); running = true;
    assert.throws(() => retained.assertCurrent(), { code: "actions.host_closed" });
  } finally { release.resolve(); await invocation; }
});

test("MEM-SYSTEM-SOURCE-CAPTURE: LocalHost capture does not open a runtime and never follows a closed project's same-name replacement", async () => {
  let opens = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => { opens++; return {}; }, close: () => {} } });
  const project = { project_id: "a", storage_key: "memory:a" }, client = host.actionClient(project);
  try {
    assert.throws(() => captureOne(client, caller, [exact()]), { code: "host.project_closing" }); assert.equal(opens, 0);
    await host.withRuntime(project, () => undefined);
    host.actionRegistry(project).registerProvider(registration(read, () => 0));
    const guard = captureOne(client, caller, [exact()]); guard();
    await host.closeProject(project);
    await host.withRuntime(project, () => undefined);
    host.actionRegistry(project).registerProvider(registration(read, () => 0));
    assert.throws(guard, { code: "actions.provider_changed" }); assert.equal(opens, 2);
    const current = captureOne(client, caller, [exact()]); await host.close(); assert.throws(current);
  } finally { await host.close(); }
});

test("MEM-SYSTEM-SOURCE-CAPTURE: LocalHost uses current Host policy and refuses asynchronous policy without executing the source", async () => {
  let allowed = true, asynchronous = false, writes = 0;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionAvailability: () => asynchronous ? Promise.resolve({ available: true })
    : allowed ? { available: true } : { available: false, code: "actions.forbidden", reason: "Revoked" } });
  const project = { project_id: "a", storage_key: "memory:a" };
  try {
    await host.withRuntime(project, () => undefined);
    host.actionRegistry(project).registerProvider({ ...registration(read, () => 0), handlers: [{ ...read, handle: () => { writes++; return null; } }] });
    const guard = captureOne(host.actionClient(project), caller, [exact()]); guard();
    allowed = false; assert.throws(guard, { code: "actions.forbidden" });
    allowed = true; asynchronous = true; assert.throws(guard, { code: "actions.async_required" }); assert.equal(writes, 0);
  } finally { await host.close(); }
});

test("MEM-SYSTEM-SOURCE-CAPTURE: LocalHost combines independently authorized ready projects without preparing a missing scope", async () => {
  let opens = 0, revision = 0, armed = false;
  const host = new LocalHost({ runtimeFactory: { open: () => { opens++; return {}; }, close: () => {} } });
  const a = { project_id: "a", storage_key: "memory:a" }, b = { project_id: "b", storage_key: "memory:b" };
  const other = { ...caller, project_id: "b", assert_authority_current: () => { if (armed) { armed = false; revision++; } } };
  try {
    await host.withRuntime(a, () => undefined);
    host.actionRegistry(a).registerProvider(registration(read, () => revision));
    const client = host.actionClient(a), scopes = [{ context: caller, references: [exact()] }, { context: other, references: [exact()] }];
    assert.throws(() => client.captureSources!(scopes), { code: "host.project_closing" }); assert.equal(opens, 1);
    await host.withRuntime(b, () => undefined);
    host.actionRegistry(b).registerProvider({ ...registration(read, () => 0), provider: { ...owner, project_id: "b" } });
    const guard = client.captureSources!(scopes); armed = true;
    assert.throws(guard, { code: "actions.conflict" }); assert.equal(opens, 2);
    const fresh = client.captureSources!(scopes); await host.closeProject(b);
    await host.withRuntime(b, () => undefined);
    host.actionRegistry(b).registerProvider({ ...registration(read, () => 0), provider: { ...owner, project_id: "b" } });
    assert.throws(fresh); assert.equal(opens, 3);
  } finally { await host.close(); }
});

test("MEM-SOURCE-CAPTURE: trusted plugin command guard supplements live registration checks without granting past asynchronous Catalog refusal", async () => {
  let policyCalls = 0, handled = 0, available = true;
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} }, actionAvailability: async () => {
    policyCalls++; return { available: false, code: "actions.forbidden", reason: "Catalog denied this plugin" };
  } });
  const project = { project_id: "a", storage_key: "memory:a" };
  const plugin = { ...owner, kind: "plugin" as const, plugin_id: "fixture.plugin", plugin_install_id: "install-a", plugin_installation_generation: "generation-a" };
  try {
    await host.withRuntime(project, () => undefined);
    const source = { ...registration(), provider: plugin, availability: () => available ? { available: true as const }
      : { available: false as const, code: "actions.plugin_permission", reason: "Runtime grant withdrawn" },
      handlers: [{ ...read, execution: "sync" as const, handle: () => { handled++; return null; } }] };
    let remove = host.actionRegistry(project).registerProvider(source);
    const client = host.actionClient(project), guard = captureOne(client, caller, [exact()]); guard();
    assert.equal(policyCalls, 0, "the supplemental synchronous guard neither invokes nor ignores a Promise from Catalog policy");
    await assert.rejects(client.invoke(caller, exact(), {}), { code: "actions.forbidden" });
    assert.ok(policyCalls > 0, "the original async invoke policy still actually runs"); assert.equal(handled, 0);
    available = false; assert.throws(guard, { code: "actions.plugin_permission" });
    available = true; remove(); remove = host.actionRegistry(project).registerProvider(source);
    assert.throws(guard, { code: "actions.provider_changed" }); remove();
  } finally { await host.close(); }
});
