import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { HomeConsentLedger, PLUGIN_CONSENT_PERMISSIONS, ensureProjectPlugins, pluginConsentActions } from "@molis-ai/molis-work-app-local-host";
import { createFilesPlugin } from "@molis-ai/molis-work-plugin-files";
import { consentSubject } from "@molis-ai/molis-work-plugin-runtime";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const GOALS = "io.molis.work.goals";
const SETTINGS = "/api/settings/plugin-consents/";
type Host = Awaited<ReturnType<typeof serveHomeRuntime>>;
const settings = (f: Host, action: "list" | "revoke", body: unknown) => f.request(SETTINGS + action, { method: "POST", body });

test("RAC-385-SETTINGS S-79 the real Host settings entry lists, revokes and preserves the first revocation timestamp", async t => {
  const f = await serveHomeRuntime(t);
  await f.host.homePlugins!.ready();
  const ledger = new HomeConsentLedger(f.home), original = ledger.consents(GOALS);
  const row = original.find(item => item.kind === "always_on")!;
  assert.ok(row);
  const listed = await settings(f, "list", { plugin_id: GOALS });
  assert.equal(listed.status, 200); assert.deepEqual((await listed.json()).consents, original);
  const unauthorized = await f.request(SETTINGS + "revoke", { method: "POST", body: { consent_id: row.consent_id }, authorized: false });
  assert.equal(unauthorized.status, 403); assert.deepEqual(ledger.consents(GOALS), original);
  const first = await settings(f, "revoke", { consent_id: row.consent_id });
  assert.equal(first.status, 200);
  const revoked = (await first.json()).consent as PluginConsentRecord;
  assert.ok(revoked.revoked_at); assert.deepEqual(revoked, { ...row, revoked_at: revoked.revoked_at });
  const second = await settings(f, "revoke", { consent_id: row.consent_id });
  assert.equal(second.status, 200); assert.deepEqual((await second.json()).consent, revoked);
  const again = await settings(f, "list", { plugin_id: GOALS });
  assert.equal(again.status, 200); assert.deepEqual((await again.json()).consents, ledger.consents(GOALS));
  const unknown = await settings(f, "revoke", { consent_id: "no-such-row" });
  assert.equal(unknown.status, 404); assert.equal((await unknown.json()).code, "plugin.consent_unknown");
  assert.deepEqual(ledger.consents(GOALS), original.map(item => item.consent_id === row.consent_id ? revoked : item));
});

interface Directive { mode: "own" | "invoke" | "query" | "delegate"; action: "list" | "revoke"; input: Record<string, string> }

function consentProbe() {
  const id = "io.molis.work.example.consententry", run = "consententry:run", seen: ActionExecutionContext[] = [];
  const permissions = [run, "actions:delegate", ...PLUGIN_CONSENT_PERMISSIONS];
  const action: ActionDefinition<Directive, unknown> = { capability_id: "consententry.run", version: 1, operation: "command", action: {
    scope: "home", title: "Check consent entry", description: "Exercise the real plugin action clients", kind: "operation", scheduling: "concurrent",
    audiences: ["user"], permissions: [run], subject_kinds: [], input_schema: { type: "object", additionalProperties: false, required: ["mode", "action", "input"],
      properties: { mode: { enum: ["own", "invoke", "query", "delegate"] }, action: { enum: ["list", "revoke"] }, input: { type: "object" } } },
  } };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "Consent entry probe", kind: "app",
    publisher: { publisher_id: "example", signature: "consent-entry-probe" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: true, reason: "Exercise an authorized plugin's clients" })),
    capabilities: { provides: [], consumes: Object.values(pluginConsentActions).map(item => item.capability_id) },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action],
    routes: [{ route_id: "run", method: "POST", path: "/run", permission: run }],
  }, async start(context) { return { kind: "app", routes: [bindPluginActionRoute(context, action, request => request.body as Directive, "run")],
    actions: [{ ...action, async handle(caller, raw) {
      seen.push(caller);
      const input = raw as Directive, target: ActionDefinition = pluginConsentActions[input.action];
      if (input.mode === "own") return { working: true };
      if (input.mode === "delegate") return context.services!.actions!.directory!.invoke(target, input.input, caller);
      if (input.mode === "query") return context.services!.actions!.invokeQuery(target, input.input);
      return context.services!.actions!.invoke(target, input.input, caller);
    } }] }; } };
  return { id, definition, seen, permissions };
}

test("RAC-393-PAGE RAC-393-DELEGATE S-79 a real plugin page with user_action and an actions:delegate action cannot list or revoke", async t => {
  const probe = consentProbe(), f = await serveHomeRuntime(t, { pluginFixtures: { home: [probe.definition] } });
  const platform = await f.host.homePlugins!.ready(), install = f.host.homePlugins!.installation(probe.id)!;
  assert.equal(install.state, "running");
  await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, probe.permissions); await platform.supervisor.restart(probe.id);
  assert.ok(f.host.homePlugins!.installation(probe.id)!.grants.includes("actions:delegate"));
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: probe.id } });
  assert.equal(opened.status, 200);
  const headers = { "x-molis-plugin-page": (await opened.json()).page_id as string };
  const ledger = new HomeConsentLedger(f.home), before = ledger.consents(GOALS), row = before.find(item => item.kind === "always_on")!;
  assert.ok(row);
  const own = await f.request(`/api/plugins/${probe.id}/run`, { method: "POST", headers, body: { mode: "own", action: "list", input: {} } });
  assert.equal(own.status, 200); assert.deepEqual(await own.json(), { working: true });
  for (const mode of ["invoke", "query", "delegate"] as const) for (const action of ["list", "revoke"] as const) {
    const input = action === "list" ? { plugin_id: GOALS } : { consent_id: row.consent_id };
    const response = await f.request(`/api/plugins/${probe.id}/run`, { method: "POST", headers, body: { mode, action, input } });
    const failure = await response.json();
    assert.equal(response.status, 403, `${mode} ${action}: ${JSON.stringify(failure)}`); assert.equal(failure.code, "actions.forbidden", `${mode} ${action}`);
    assert.ok(probe.seen.at(-1)!.user_action, "the real page route gave the plugin a user_action");
    assert.equal(probe.seen.at(-1)!.audience, "user");
    assert.deepEqual(ledger.consents(GOALS), before, `${mode} ${action} leaves the entire ledger unchanged`);
    const settingsCall = await f.request(SETTINGS + action, { method: "POST", headers, body: input });
    assert.equal(settingsCall.status, 403); assert.equal((await settingsCall.json()).code, "actions.forbidden");
    assert.deepEqual(ledger.consents(GOALS), before);
  }
  const legitimate = await settings(f, "revoke", { consent_id: row.consent_id });
  assert.equal(legitimate.status, 200, "the Host settings entry still succeeds after refusing the plugin");
});

test("RAC-390-LIVE S-79 a running Host reconciles a revoked default on the next project request and never rebinds it", async t => {
  const id = "io.molis.work.example.consentreader", signature = "consent-reader", source = { plugin_id: "io.molis.work.files", port: "before" };
  const reader: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "Consent reader", kind: "app",
    publisher: { publisher_id: "example", signature }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [{ permission: "artifact:read", required: true, reason: "Read the explicitly agreed snapshot input" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [{ artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION }] },
    ui: { contributions: [] }, ports: { outputs: [], inputs: [{ port: "text", artifact_type_id: FILE_SNAPSHOT_TYPE, schema_version: FILE_SNAPSHOT_SCHEMA_VERSION, optional: true, default_source: source }] },
  }, async start() { return { kind: "app", views: [] }; } };
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: [reader] } });
  await f.host.homePlugins!.ready();
  const ledger = new HomeConsentLedger(f.home);
  const row = ledger.record({ plugin_id: id, publisher_signature: signature, manifest_digest: "reader-digest", granted_by: "user", at: "2026-10-25T00:00:00.000Z",
    grants: [{ kind: "default_wiring", subject: consentSubject.defaultWiring("text", source, createFilesPlugin().manifest.publisher.signature) }] })[0]!;
  const project = await f.project("Consent live reconciliation"), path = `/projects/${project.project_id}/api/board`;
  const enabled = await f.request(`/api/settings/projects/${project.project_id}/plugins`, { method: "POST", body: { plugin_id: "files" } });
  assert.equal(enabled.status, 200);
  assert.equal((await f.request(path)).status, 200);
  const state = await f.host.withProject(project.reference, runtime => ensureProjectPlugins({ store: runtime.store, artifacts: runtime.artifacts, processItems: runtime.processItems,
    projectId: project.project_id, actorId: LOCAL_PERSON_ACTOR_ID, homeDirectory: f.home,
    actions: { registry: f.host.actionRegistry(project.reference), client: f.host.actionClient(project.reference), project_id: project.project_id } }));
  assert.ok(state.platform, state.error);
  const port = () => state.platform!.wiring.view().plugins.find(item => item.plugin_id === id)!.ports.find(item => item.port === "text")!;
  assert.deepEqual(port().source, { source_plugin_id: source.plugin_id, source_port: source.port }); assert.equal(port().origin, "default");
  const revoked = await settings(f, "revoke", { consent_id: row.consent_id });
  assert.equal(revoked.status, 200); assert.ok(ledger.consents(id)[0]!.revoked_at);
  assert.ok(port().source, "revoking alone keeps the agreed next-request timing; no synchronous broadcast was added");
  for (let round = 0; round < 2; round += 1) {
    assert.equal((await f.request(path)).status, 200);
    assert.equal(port().source, undefined, `project request ${round + 1}: the revoked default is off and stays off`);
  }
});
