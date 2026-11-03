import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ActionError, bindActionClient, retainActionAuthority, type ActionDefinition, type ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { recordedCallId, subjectOfferChoices, withCallId } from "@molis-ai/molis-work-kernel";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { functionContextActions, publishedFunctionAction } from "@molis-ai/molis-work-module-judgment-rules";
import type { JudgmentRuleRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { openTestHome } from "./fixtures/test-home.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

// The time limit only catches a hang: 13-16 s on macOS, and Linux CI runs about 2.3-2.5 times slower (user, 2026-10-15).
test("W3-09-AUTH-03 a real published function cannot consume Home Dock after its independent scene permission is revoked", { timeout: 90_000 }, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let returned = false, scenePermissionsChecked = false, held = true, models = 0;
  const call: ActionDefinition = { capability_id: "fixture.home.consume", version: 1, operation: "command", action: {
    title: "Consume the configured Home judgment", description: "Call the real scene with an originating function permission", kind: "operation",
    scope: "project", scheduling: "concurrent", audiences: ["mcp"], permissions: ["functions:invoke"], subject_kinds: [],
    required_scene: { scene_id: "home.dock", version: 1 }, input_schema: { type: "object", additionalProperties: false },
  } };
  const home = await openTestHome(t, { host: {
    functions: { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: { async evaluate(_key, record) {
      models++; returned = true;
      return { primitive: record.primitive, choice: "finish", probabilities: { finish: 1, dismiss: 0 }, confidence: null, model: record.model, noul: null, score: null, legend: null };
    } } },
    actionAvailability: async (caller, action) => {
      // This is the real Home consumer's later directory/policy wait, after Kernel's scene permission check.
      // Raw MCP authority inspection has no allowed_actions and cannot enter this barrier.
      if (held && returned && scenePermissionsChecked && action.capability_id === call.capability_id
        && caller.allowed_actions?.some(reference => reference.capability_id === call.capability_id)) {
        entered.resolve(); await release.promise;
      }
      return { available: true };
    },
  } });
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  const project = await home.createProject("Home scene authority", ["feed", "inbox"]);
  const entry = await home.host.withProject(project.reference, runtime => {
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, project.project_id).register({ kind: "research_library", repository: "example/research", research_source: "effect-authority" }).source;
    const item = feed.ingestItem({ source, externalId: "home-scene-effect", title: "Actual inbox work", summary: "A real Home subject", body: "Original facts",
      occurredAt: new Date().toISOString(), attention: false }).item;
    return feed.ensureInboxEntryForFeedItem(project.project_id, item.item_id, "manual").entry;
  });
  let bindingId: string | undefined;
  const dispose = home.host.actionRegistry(project.reference).registerProvider({ provider: {
    provider_id: "fixture.home-authority", title: "Real scene caller", kind: "system", project_id: project.project_id,
  }, definitions: [call], handlers: [{ ...call, handle: caller => {
    assert.ok(bindingId);
    const origin = retainActionAuthority(caller, { ...call, provider_id: "fixture.home-authority" }, caller.beforeEffect);
    return home.host.sceneClient(project.reference).runScene({ ...origin, validate_permissions: async permissions => {
      await origin.validate_permissions?.(permissions);
      if (returned && permissions.includes("home:read")) scenePermissionsChecked = true;
    } }, { scene_id: "home.dock", version: 1 }, bindingId, { kind: "inbox_entry", id: entry.entry_id });
  } }] });
  try {
    const clientId = "runtime:home-scene-authority", directory = await home.inspect(clientId, project.project_id);
    const scenePermission = directory.find(view => view.capability_id === "home.judgment.evaluate");
    assert.ok(scenePermission);
    assert.deepEqual([...scenePermission.action.permissions].sort(), ["home:read", "model:invoke"].sort());
    const owners = ["feed.subject.read", "inbox.subject.read", "inbox.actions.prepare", "inbox.entry.status"];
    const ownerActions = directory.filter(view => owners.includes(view.capability_id) && view.action.audiences.includes("mcp"));
    assert.deepEqual(ownerActions.map(view => view.capability_id).sort(), owners.sort());
    assert.ok(ownerActions.every(view => !view.action.permissions.includes("home:read")));
    const { choices } = await home.web.post<{ choices: ReturnType<typeof subjectOfferChoices> }>(`/projects/${project.project_id}/api/home/actions/choices`, { subject_kind: "inbox_entry" });
    const choice = choices.find(value => value.offer_id === "inbox.done");
    assert.ok(choice?.availability.available);
    const dismiss = choices.find(value => value.offer_id === "inbox.dismiss");
    assert.ok(dismiss?.availability.available);
    // Prepare the real binding through protected owner HTTP first: a scene-dependent MCP grant cannot create that binding.
    const functionsPath = `/projects/${project.project_id}/api/functions`;
    const { function: draft } = await home.web.post<{ function: JudgmentRuleRecord }>(functionsPath, { primitive: "choice", function_key: "effect_home_scene", name: "Actual Home scene rule" });
    await home.web.post(`${functionsPath}/${draft.id}`, { instructions: "Recommend the available finish action", criteria: [{ key: "finish", description: "Finish this entry" }, { key: "dismiss", description: "Dismiss this entry" }],
      scene_id: "home.dock", scene_version: 1, scene_provider_id: "system.home", subject_kinds: ["inbox_entry"],
      scene_map: { finish: choice.key, dismiss: dismiss.key }, action_map: { finish: choice.action, dismiss: dismiss.action } });
    await home.web.post(`${functionsPath}/${draft.id}/preview`, { input: "Original inbox work" });
    const { function: rule } = await home.web.post<{ function: JudgmentRuleRecord }>(`${functionsPath}/${draft.id}/publish`, {});
    const judgment = publishedFunctionAction(rule);
    assert.deepEqual(judgment.action.permissions, ["functions:invoke"], "the judgment does not itself grant Home's independent permissions");
    const configured = await home.web.post<{ binding: ActionSceneBinding }>(`/projects/${project.project_id}/api/home/dock-judgment`, { function_key: rule.function_key });
    assert.ok(configured.binding.enabled); bindingId = configured.binding.binding_id;
    await home.grant(clientId, project.project_id, [...ownerActions, judgment, scenePermission, functionContextActions.history, call]);
    const mcp = await home.mcp(clientId, project.project_id), actions = bindActionClient(mcp.client, () => mcp.caller);
    const before = (await actions.invoke(functionContextActions.history, {})).judgments;
    const modelCount = models;
    returned = false; scenePermissionsChecked = false;
    const callId = randomUUID();
    const pending = withCallId(callId, async () => {
      try { return { result: await mcp.client.invoke(mcp.caller, call, {}), error: undefined, recorded: recordedCallId() }; }
      catch (error) { return { result: undefined, error, recorded: recordedCallId() }; }
    });
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Scene settled before its real consumer's later availability wait"); })]);
    await home.revoke(clientId, project.project_id, [scenePermission]);
    const current = (await readMcpToolPreference(home.home)).action_grants.filter(grant => grant.client_id === clientId && grant.enabled);
    assert.ok(current.some(grant => grant.capability_id === call.capability_id));
    assert.ok(current.some(grant => grant.capability_id === judgment.capability_id));
    assert.equal(current.some(grant => grant.permissions.includes("home:read")), false);
    held = false; release.resolve(); const outcome = await pending;
    assert.ok(outcome.error instanceof ActionError);
    assert.equal(outcome.error.code, "mcp.permission_revoked");
    // RAC-2671: across the MCP process hop the client reads it as a refusal (403, so `forbidden`), no longer as a mistake in its input (400).
    assert.equal(outcome.error.kind, "forbidden");
    assert.equal(outcome.recorded, callId);
    assert.deepEqual((await actions.invoke(functionContextActions.history, {})).judgments, before, "neither successful consumption nor failure bookkeeping was saved");
    await home.host.withProject(project.reference, runtime => assert.deepEqual(createLocalFeedApplication(runtime.store.db).getInboxEntry(project.project_id, entry.entry_id), entry));
    assert.deepEqual((await home.web.get<{ binding: ActionSceneBinding }>(`/projects/${project.project_id}/api/home/dock-judgment`)).binding, configured.binding);
    assert.ok(home.host.callLog);
    const rows = home.host.callLog.find(callId);
    assert.equal(rows.filter(row => row.capability_id === call.capability_id && row.code === "mcp.permission_revoked" && !row.ok && !row.refused).length, 1);
    assert.equal(rows.filter(row => row.capability_id === judgment.capability_id && row.ok).length, 1, "the lawful completed judgment is a diagnostic row, not a saved scene fact");
    await home.grant(clientId, project.project_id, [scenePermission]);
    await mcp.client.invoke(mcp.caller, call, {});
    const recovered = (await actions.invoke(functionContextActions.history, {})).judgments;
    assert.equal(recovered.length, before.length + 1);
    assert.equal(recovered.at(0)?.function_key, rule.function_key);
    assert.equal(models, modelCount + 2);
    await home.host.withProject(project.reference, runtime => assert.deepEqual(createLocalFeedApplication(runtime.store.db).getInboxEntry(project.project_id, entry.entry_id), entry));
  } finally { held = false; release.resolve(); dispose(); }
});
