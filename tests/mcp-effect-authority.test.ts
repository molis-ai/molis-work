import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ActionError, bindActionClient, retainActionAuthority, type ActionDefinition, type RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";
import { recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { formActions } from "@molis-ai/molis-work-plugin-form";
import { openFormStore } from "./fixtures/plugin-home-stores.js";
import type { FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { openTestHome } from "./fixtures/test-home.js";

const peer: ActionDefinition = { capability_id: "fixture.form.peer", version: 1, operation: "query", action: {
  title: "Granted peer", description: "An independently granted action with the same permissions", kind: "query", scope: "project",
  audiences: ["mcp"], permissions: ["form:read", "form:write", "model:invoke"], subject_kinds: [],
  input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "boolean" },
} };
const wrapper: ActionDefinition = { ...peer, capability_id: "fixture.form.wrapper", operation: "command", action: {
  ...peer.action, title: "Generate through an originating action", kind: "operation", scheduling: "concurrent",
  output_schema: formActions.draft.action.output_schema,
} };

function facts(home: string, projectId: string, formId: string) {
  const store = openFormStore(home);
  try { return { form: store.get(formId, projectId), forms: store.list(projectId), submissions: store.listSubmissions(formId, projectId) }; }
  finally { store.close(); }
}

for (const additional of [false, true]) test(`ACA005-03/07 accepted MCP background ${additional ? "permission source" : "action"} keeps its original grant generation`,
  { timeout: 30_000 }, async t => {
    const home = await openTestHome(t), project = await home.createProject("Retained MCP grant");
    const accept: ActionDefinition = { ...wrapper, capability_id: "fixture.form.retain", action: {
      ...wrapper.action, permissions: ["form:read"], output_schema: { type: "null" },
    } };
    let retained: RetainedActionAuthority | undefined;
    const dispose = home.host.actionRegistry(project.reference).registerProvider({
      provider: { provider_id: "fixture.retained-grant", title: "Retained authority", kind: "system" }, definitions: [accept, peer],
      handlers: [{ ...accept, handle: caller => { retained = caller.retainBackgroundAuthority!(additional ? ["model:invoke"] : []); return null; } },
        { ...peer, handle: () => true }],
    });
    t.after(dispose);
    const clientId = "runtime:retained-generation";
    await home.grant(clientId, project.project_id, [accept, peer]);
    const mcp = await home.mcp(clientId, project.project_id);
    await mcp.client.invoke(mcp.caller, accept, {});
    assert.ok(retained); const original = retained;
    await original(); original.assertCurrent();
    const target = additional ? peer : accept;
    await home.revoke(clientId, project.project_id, [target]); await home.grant(clientId, project.project_id, [target]);
    const code = additional ? "mcp.permission_revoked" : "mcp.action_revoked";
    assert.throws(() => original.assertCurrent(), { code }); await assert.rejects(original(), { code });
    await mcp.client.invoke(mcp.caller, accept, {});
    assert.ok(retained); assert.notEqual(retained, original);
    await retained(); retained.assertCurrent();
    assert.throws(() => original.assertCurrent(), { code }, "a fresh accepted task never revives the old one");
  });

for (const nested of [false, true]) test(nested
  ? "W3-09-AUTH-03 real MCP bind/control and retained origin cannot borrow the nested Form action's grant"
  : "W3-09-AUTH-01/02 real MCP revocation after exact authorization cannot borrow a peer's permissions and regrant recovers", { timeout: 30_000 }, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let returnedFromModel = false, held = true, models = 0;
  const home = await openTestHome(t, { host: {
    completeText: async (_prompt, options) => {
      await options?.beforeDispatch?.();
      models++; returnedFromModel = true;
      return JSON.stringify({ status: "done", questions: [{ title: "Only a currently granted call may add this question", type: "text" }] });
    },
    actionAvailability: async (caller, action) => {
      // The authority/permission inspectors use the raw transport caller, without allowed_actions.
      // Hold only the real executing call's later Host policy, after its model has returned.
      if (held && returnedFromModel && action.capability_id === "form.questions.draft"
        && caller.allowed_actions?.some(reference => reference.capability_id === "form.questions.draft")) {
        entered.resolve(); await release.promise;
      }
      return { available: true };
    },
  } });
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  const project = await home.createProject("Exact effect authority", ["form"]);
  const { form } = await home.web.post<{ form: FormRecord }>(`/projects/${project.project_id}/api/plugins/io.molis.work.form/forms`, { title: "Original facts" });
  const input = { id: form.id, prompt: "One question", expected_version: form.version };
  const dispose = home.host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: "fixture.form-authority", title: "Grantable fixture actions", kind: "system", project_id: project.project_id },
    definitions: [peer, wrapper], handlers: [{ ...peer, handle: () => true }, { ...wrapper, handle: caller => {
      const retained = retainActionAuthority(caller, { ...wrapper, provider_id: "fixture.form-authority" }, caller.beforeEffect);
      return bindActionClient(home.host.actionClient(project.reference, true), () => retained).invoke(formActions.draft, input, caller);
    } }],
  });
  try {
    const clientId = "runtime:effect-authority", target = nested ? wrapper : formActions.draft;
    await home.grant(clientId, project.project_id, [...(nested ? [wrapper] : []), formActions.draft, peer]);
    const beforeGrants = (await readMcpToolPreference(home.home)).action_grants.filter(grant => grant.client_id === clientId && grant.project_id === project.project_id);
    const exact = beforeGrants.find(grant => grant.capability_id === target.capability_id);
    const other = beforeGrants.find(grant => grant.capability_id === peer.capability_id);
    assert.ok(exact?.enabled); assert.ok(other?.enabled);
    assert.deepEqual([...exact.permissions].sort(), ["form:read", "form:write", "model:invoke"].sort());
    assert.deepEqual([...other.permissions].sort(), [...exact.permissions].sort());
    const mcp = await home.mcp(clientId, project.project_id), callId = randomUUID();
    const before = facts(home.home, project.project_id, form.id);
    const pending = withCallId(callId, async () => {
      try { return { result: await mcp.client.invoke(mcp.caller, target, nested ? {} : input), error: undefined, recorded: recordedCallId() }; }
      catch (error) { return { result: undefined, error, recorded: recordedCallId() }; }
    });
    // A premature rejection/success cannot masquerade as entering the intended production interleaving.
    const settled = pending.then(() => { throw new Error("Operation settled before the later availability barrier"); });
    await Promise.race([entered.promise, settled]);
    await home.revoke(clientId, project.project_id, [target]);
    const afterGrants = (await readMcpToolPreference(home.home)).action_grants.filter(grant => grant.client_id === clientId && grant.project_id === project.project_id);
    assert.equal(afterGrants.find(grant => grant.capability_id === target.capability_id)?.enabled, false);
    assert.equal(afterGrants.find(grant => grant.capability_id === peer.capability_id)?.enabled, true);
    assert.equal(await mcp.client.invoke(mcp.caller, peer, {}), true, "B remains genuinely usable but cannot authorize A");
    held = false; release.resolve(); const outcome = await pending;
    assert.deepEqual(facts(home.home, project.project_id, form.id), before, "all original Form facts, including failure bookkeeping, remain unchanged");
    assert.ok(outcome.error instanceof ActionError, "the real MCP operation must refuse after revocation");
    assert.equal(outcome.error.code, "mcp.action_revoked");
    assert.equal(outcome.recorded, callId, "the returned number names an actual Host diagnostic row");
    assert.ok(home.host.callLog);
    const rows = home.host.callLog.find(callId);
    assert.deepEqual(rows.map(row => [row.capability_id, row.code, row.ok, row.refused] as const).sort(([a], [b]) => a.localeCompare(b)), nested
      ? [[wrapper.capability_id, "mcp.action_revoked", false, undefined], [formActions.draft.capability_id, "mcp.action_revoked", false, undefined]]
      : [[formActions.draft.capability_id, "mcp.action_revoked", false, undefined]]);
    assert.ok(rows.every(row => row.call_id === callId && row.actor_id === clientId && row.project_id === project.project_id && (row.path ?? "action") === "action"));
    await home.grant(clientId, project.project_id, [target]);
    const recovered = await mcp.client.invoke(mcp.caller, target, nested ? {} : input);
    assert.ok(recovered && typeof recovered === "object" && "form" in recovered);
    const after = facts(home.home, project.project_id, form.id);
    assert.deepEqual(after.form, recovered.form);
    assert.equal(after.form.version, before.form.version + 1);
    assert.equal(after.form.questions.length, before.form.questions.length + 1);
    assert.equal(after.form.questions.at(-1)?.title, "Only a currently granted call may add this question");
    assert.deepEqual(after.submissions, before.submissions); assert.equal(models, 2);
  } finally { held = false; release.resolve(); dispose(); }
});
