import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, installedPluginViews, pluginInstallActions, pluginInstallProvider, sandboxPluginManifest } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID } from "./fixtures/sandbox-package.js";

// PG-002, S-93 (docs/system/SECURITY-INVARIANTS.md): `plugins.permissions.set@1` is the person's own act in a project's settings. RAC-946 only the
// person's audience sees it; RAC-947 it needs the credential the project settings route itself issues, and no text a caller can write is that
// credential; RAC-948 the project and the installation come from the Host's context and the route, never from what the input says about itself;
// RAC-949 the installed list says which of the asked-for permissions are held. The route and the Runtime halves are in
// security-invariants-plugin-permissions-http.test.ts and plugin-regrant.test.ts.

const AT = "2026-10-25T00:00:00.000Z";
const NETWORK = "network:api.example.com";
const record = (grants: string[]): PluginInstanceRecord => ({
  install_id: "install-1", installation_generation: "g1", plugin_id: PACKAGE_PLUGIN_ID, version: "1.0.0", publisher_id: "example", publisher_signature: "ed25519:sha256:aa",
  manifest_digest: "digest", deployment: "local", selected_entrypoint: "./plugin.mjs", grants, execution: "sandbox", publisher_trust: "pinned", state: "running",
  recovery_count: 0, last_error_code: null, installed_at: AT, updated_at: AT, uninstalled_at: null, retain_private_data: false });

function fixture() {
  const manifest = sandboxPluginManifest({ pluginId: PACKAGE_PLUGIN_ID, version: "1.0.0", name: "Example notes", publisher: { publisher_id: "example", signature: "ed25519:sha256:aa" }, presentation: false });
  manifest.permissions = [...manifest.permissions, { permission: NETWORK, required: false, reason: "查询天气" }];
  const calls: unknown[][] = [];
  const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore("/nonexistent"), now: () => AT, install: async () => undefined,
    installed: async () => [{ record: record(["storage:private"]), manifest }], regrant: async (...args) => { calls.push(args); } });
  const actions = new ActionService();
  actions.registerProvider(pluginInstallProvider(service));
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: "project-one", permissions: PLUGIN_INSTALL_PERMISSIONS, ...extra });
  const target = { capability_id: pluginInstallActions.setPermission.capability_id, version: 1 };
  const input = { install_id: "install-1", permission: NETWORK, granted: true };
  return { actions, calls, caller, target, input, service };
}

const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

test("RAC-946 S-93 only the person's audience sees or calls the permission switch: agents, MCP, workflows and plugins do not", async () => {
  const { actions, calls, caller, target, input } = fixture();
  assert.equal((await actions.discover(caller())).some(view => view.capability_id === target.capability_id), true, "the person sees it");
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    assert.deepEqual((await actions.discover(caller({ audience }))).filter(view => view.capability_id === target.capability_id), [], `${audience} does not see it`);
    await assert.rejects(actions.invoke(caller({ audience, user_action: { source: "web", conversation_ref: "web:settings:plugin-permissions", message_ref: "m" } }), target, input),
      error => error instanceof ActionError, `${audience} cannot call it`);
  }
  assert.deepEqual(calls, [], "nothing reached the Runtime");
});

test("RAC-947 S-93 the switch needs the credential the project settings route issues: no user_action, a copy of its text, a delegate or a plugin's call is refused", async () => {
  const { actions, calls, caller, target, input } = fixture();
  const text = { source: "web", conversation_ref: "web:settings:plugin-permissions", message_ref: "web:request:forged" };
  const cases: Array<[string, Partial<ActionCallContext>]> = [
    ["no user_action", {}],
    ["the credential's text written by hand", { user_action: text }],
    ["the same text, frozen", { user_action: Object.freeze({ ...text }) }],
    ["an ordinary page request's user_action", { user_action: { source: "web", conversation_ref: "web:project-one", message_ref: "web:request:1" } }],
    ["a call made on the person's behalf", { delegated_by: "io.molis.work.example", user_action: text }],
    ["the Home's consent door text", { user_action: { source: "web", conversation_ref: "web:settings:plugin-consents", message_ref: "web:request:1" } }],
  ];
  for (const [label, extra] of cases) {
    await assert.rejects(actions.invoke(caller(extra), target, input), refused("actions.forbidden"), label);
  }
  await assert.rejects(actions.invoke(caller({ project_id: null, user_action: text }), target, input), error => error instanceof ActionError, "no project");
  assert.deepEqual(calls, [], "nothing reached the Runtime");
});

test("RAC-948 S-93 the project and the person come from the Host's context: an input that names either is not read", async () => {
  const { actions, calls, caller, target, input } = fixture();
  for (const extra of [{ project_id: "project-two" }, { user_action: { source: "web", conversation_ref: "a", message_ref: "b" } }, { actor_id: LOCAL_PERSON_ACTOR_ID }]) {
    await assert.rejects(actions.invoke(caller(), target, { ...input, ...extra }), refused("actions.input_invalid"), JSON.stringify(extra));
  }
  for (const missing of ["install_id", "permission", "granted"]) {
    const rest = Object.fromEntries(Object.entries(input).filter(([key]) => key !== missing));
    await assert.rejects(actions.invoke(caller(), target, rest), refused("actions.input_invalid"), `without ${missing}`);
  }
  await assert.rejects(actions.invoke(caller(), target, { ...input, granted: "yes" }), refused("actions.input_invalid"), "granted is a boolean");
  assert.deepEqual(calls, []);
});

test("RAC-949 the installed list says, for each permission the plugin asked for, whether this installation holds it", () => {
  const { service } = fixture();
  return service.installed("project-one").then(([view]) => {
    assert.deepEqual(view!.permissions.map(item => [item.permission, item.required, item.granted]), [["storage:private", true, true], [NETWORK, false, false]]);
  });
});

test("RAC-949 a Manifest permission the installation does not hold reads as not granted, one it holds as granted, in the helper the list and the switch share", () => {
  const manifest = sandboxPluginManifest({ pluginId: PACKAGE_PLUGIN_ID, version: "1.0.0", name: "Example notes", publisher: { publisher_id: "example", signature: "ed25519:sha256:aa" }, presentation: false });
  manifest.permissions = [...manifest.permissions, { permission: NETWORK, required: false, reason: "查询天气" }];
  const [view] = installedPluginViews([{ record: record(["storage:private", NETWORK]), manifest }], new MemoryPluginConsentLedger());
  assert.deepEqual(view!.permissions.map(item => [item.permission, item.granted]), [["storage:private", true], [NETWORK, true]]);
});
