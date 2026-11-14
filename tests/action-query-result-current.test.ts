import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

const query: ActionDefinition = { capability_id: "query.result", version: 1, operation: "query", action: {
  title: "Read", description: "Read bounded content", kind: "query", scope: "project", audiences: ["user"], permissions: ["fixture:read"], subject_kinds: [],
  input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" },
} };
const caller: ActionCallContext = { actor_id: "person", project_id: "project", audience: "user", permissions: ["fixture:read"] };

for (const change of ["replacement", "permission", "cancel"] as const) {
  test(`A4-K a plain async query with no effect rejects its result after ${change}`, { timeout: 5_000 }, async () => {
    const service = new ActionService(), started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), controller = new AbortController();
    let allowed = true;
    const register = () => service.registerProvider({ provider: { provider_id: "same-provider", plugin_id: "same-plugin", plugin_install_id: "same-install", project_id: "project", title: "Owner", kind: "plugin" },
      definitions: [query], handlers: [{ ...query, handle: async () => { started.resolve(); await release.promise; return "ORIGINAL_PRIVATE_BODY"; } }],
      availability: () => allowed ? { available: true } : { available: false, code: "actions.forbidden", reason: "withdrawn" },
    });
    let dispose = register();
    try {
      const pending = service.invoke({ ...caller, signal: controller.signal }, query, {});
      const refusal = assert.rejects(pending, { code: change === "replacement" ? "actions.provider_changed" : change === "permission" ? "actions.forbidden" : "actions.cancelled" });
      await started.promise;
      if (change === "replacement") { dispose(); dispose = register(); }
      if (change === "permission") allowed = false;
      if (change === "cancel") controller.abort(new ActionError("actions.cancelled", "cancelled"));
      release.resolve(); await refusal;
    } finally { release.resolve(); dispose(); }
  });
}

test("A4-K normal async and sync queries still return; a sync handler cannot replace its original registration and return old data", async () => {
  const service = new ActionService(); let replace = false;
  const register = () => service.registerProvider({ provider: { provider_id: "same-provider", title: "Owner", kind: "system" }, definitions: [query],
    handlers: [{ ...query, execution: "sync", handle: () => { if (replace) { replace = false; dispose(); dispose = register(); } return "CURRENT_BODY"; } }],
  });
  let dispose = register();
  try {
    assert.equal(await service.invoke(caller, query, {}), "CURRENT_BODY");
    assert.equal(service.invokeSync(caller, query, {}), "CURRENT_BODY");
    replace = true; assert.throws(() => service.invokeSync(caller, query, {}), { code: "actions.provider_changed" });
    assert.equal(service.invokeSync(caller, query, {}), "CURRENT_BODY", "the independently current registration is usable");
  } finally { dispose(); }
});

async function subjectFixture() {
  const { SUBJECT_REFERENCE_TYPE, SUBJECT_STATE_TYPE, SUBJECT_STATE_INPUT_SCHEMA, SUBJECT_STATE_OUTPUT_SCHEMA, defineSubjectContextAction, defineSearchEntriesAction } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const reader = defineSubjectContextAction("owner.read", 1, "document", "资料", ["fixture:read"]);
  const source = defineSearchEntriesAction("owner.entries", 1, [{ kind: "document", title: "资料", surface: "owner" }], "资料", ["fixture:read"]);
  const state: ActionDefinition = { ...reader, capability_id: "owner.state", version: 1, action: { ...reader.action, input_type: SUBJECT_REFERENCE_TYPE,
    output_type: SUBJECT_STATE_TYPE, input_schema: SUBJECT_STATE_INPUT_SCHEMA, output_schema: SUBJECT_STATE_OUTPUT_SCHEMA } };
  const exact = (ref: { capability_id: string; version: number }) => ({ ...ref, provider_id: "owner" });
  return { reader, source, state, exact, subject: { kind: "document", id: "one" }, service: new ActionService() };
}

test("A4-K subject current retains the exact original registration; a new registration cannot revive the old proof", async () => {
  const f = await subjectFixture();
  let archived = false, accepted: import("@molis-ai/molis-work-contracts/platform/actions").RetainedSubjectState | undefined;
  let late: import("@molis-ai/molis-work-contracts/platform/actions").ActionExecutionContext["provideSubjectState"];
  const register = () => f.service.registerProvider({ provider: { provider_id: "owner", plugin_id: "owner", plugin_install_id: "install", project_id: "project", title: "Owner", kind: "plugin" },
    definitions: [f.reader, f.source, f.state], handlers: [{ ...f.reader, handle: () => ({}) }, { ...f.source, handle: () => ({}) }, { ...f.state, handle: context => {
      late = context.provideSubjectState;
      context.provideSubjectState?.(() => ({ subject: f.subject, state: archived ? "archived" : "active", execution_session: null }));
      return { subject: f.subject, state: archived ? "archived" : "active" };
    } }] });
  let remove = register();
  const capture = { subject: f.subject, reader: f.exact(f.reader), source: f.exact(f.source), accept: (control: NonNullable<typeof accepted>) => { accepted = control; } };
  try {
    await f.service.invoke({ ...caller, subject_state_capture: capture }, f.exact(f.state), { subject_id: "one" });
    assert.ok(accepted); assert.equal(accepted.current().state, "active");
    archived = true; assert.equal(accepted.current().state, "archived");
    assert.throws(() => late!(() => ({ subject: f.subject, state: "active", execution_session: null })), { code: "actions.subject_mismatch" });
    const old = accepted; remove(); remove = register();
    assert.throws(() => old.current(), { code: "actions.provider_changed" });
    await f.service.invoke({ ...caller, subject_state_capture: capture }, f.exact(f.state), { subject_id: "one" });
    assert.equal(accepted.current().state, "archived");
  } finally { remove(); }
});

test("A4-K subject capture rejects mismatched controls, Promise readers and forged JSON before accepting anything", async () => {
  const f = await subjectFixture(); let handled = 0, accepted = 0, mode = "normal";
  const remove = f.service.registerProvider({ provider: { provider_id: "owner", plugin_id: "owner", plugin_install_id: "install", project_id: "project", title: "Owner", kind: "plugin" },
    definitions: [f.reader, f.source, f.state], handlers: [{ ...f.reader, handle: () => ({}) }, { ...f.source, handle: () => ({}) }, { ...f.state, handle: context => {
      handled++;
      if (mode === "promise") Reflect.apply(context.provideSubjectState!, undefined, [() => Promise.resolve({ subject: f.subject, state: "active", execution_session: null })]);
      else context.provideSubjectState?.(() => ({ subject: f.subject, state: mode === "mismatch" ? "archived" : "active", execution_session: null }));
      return { subject: f.subject, state: "active", ...(mode === "forged" ? { current: "pretend" } : {}) };
    } }] });
  const capture = { subject: f.subject, reader: f.exact(f.reader), source: f.exact(f.source), accept: () => { accepted++; } };
  try {
    await assert.rejects(f.service.invoke({ ...caller, subject_state_capture: { ...capture, reader: { ...capture.reader, provider_id: "" } } }, f.exact(f.state), { subject_id: "one" }), { code: "actions.subject_mismatch" });
    assert.equal(handled, 0);
    for (const value of ["promise", "mismatch", "forged"]) {
      mode = value;
      await assert.rejects(f.service.invoke({ ...caller, subject_state_capture: capture }, f.exact(f.state), { subject_id: "one" }));
      assert.equal(accepted, 0, value + " cannot hand out an owner control");
    }
    mode = "normal";
    await assert.rejects(f.service.invoke(caller, f.exact(f.state), { subject_id: "one", subject_state_capture: {} }), { code: "actions.input_invalid" });
    await f.service.invoke(caller, f.exact(f.state), { subject_id: "one" });
    assert.equal(accepted, 0, "ordinary state JSON grants no retained current control");
  } finally { remove(); }
});

test("A4-K capture cannot combine two installations that happen to use the same provider id", async () => {
  const f = await subjectFixture(); let accepted = false, handled = false;
  const own = { provider_id: "owner", plugin_id: "owner", plugin_install_id: "original", project_id: "project", title: "Owner", kind: "plugin" as const };
  const stopState = f.service.registerProvider({ provider: own, definitions: [f.reader, f.state], handlers: [{ ...f.reader, handle: () => ({}) }, { ...f.state, handle: () => { handled = true; return { subject: f.subject, state: "active" }; } }] });
  const stopSource = f.service.registerProvider({ provider: { ...own, plugin_install_id: "different-install" }, definitions: [f.source], handlers: [{ ...f.source, handle: () => ({}) }] });
  try {
    await assert.rejects(f.service.invoke({ ...caller, subject_state_capture: { subject: f.subject, reader: f.exact(f.reader), source: f.exact(f.source), accept: () => { accepted = true; } } }, f.exact(f.state), { subject_id: "one" }), { code: "actions.subject_mismatch" });
    assert.equal(handled, false); assert.equal(accepted, false);
  } finally { stopState(); stopSource(); }
});

test("A4-K query current rejection still precedes invalid output, while a completed command reports invalid_after_effect", async () => {
  const service = new ActionService();
  let remove = () => {};
  remove = service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system" }, definitions: [query], handlers: [{ ...query, handle: () => { remove(); return { invalid: true }; } }] });
  await assert.rejects(service.invoke(caller, query, {}), { code: "actions.provider_changed" });
  const command: ActionDefinition = { ...query, capability_id: "owner.write", operation: "command", action: { ...query.action, kind: "operation" } };
  let writes = 0;
  const stop = service.registerProvider({ provider: { provider_id: "owner", title: "Owner", kind: "system" }, definitions: [command], handlers: [{ ...command, handle: async context => { await context.beforeEffect(); writes++; return { invalid: true }; } }] });
  try { await assert.rejects(service.invoke(caller, command, {}), { code: "actions.output_invalid_after_effect" }); assert.equal(writes, 1); }
  finally { stop(); }
});
