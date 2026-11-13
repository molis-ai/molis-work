import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate as nextTurn } from "node:timers/promises";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { LocalProjectDatabase, MolisWorkLocalHost, PluginHostExecutor, composeAgentHost, hostDependencyCheck,
  molisWorkHostProjectReference, observeReviewSettlements } from "@molis-ai/molis-work-app-local-host";
import { writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

// BL-359 / S-50: a real Host-issued caller, reached through a plugin SDK, not an object forged to resemble one.
const root = await realpath(await mkdtemp(join(tmpdir(), "review-caller-gc-"))), repo = join(root, "repo");
await mkdir(repo); await writeFile(join(repo, "README.md"), "fixture\n");
const git = (...args) => execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args]);
git("init", "-q"); git("add", "README.md"); git("commit", "-q", "-m", "fixture");
const workspace = { workspace_id: "main", canonical_path: repo, display_name: "Fixture", realpath_verified: true };
const host = new MolisWorkLocalHost({ completeText: null });
const reference = molisWorkHostProjectReference({ databasePath: join(root, "project.sqlite"), projectId: "project" });
const composition = composeAgentHost({ localHost: host, homeDirectory: root, workspaceFor: () => workspace, workspacesFor: async () => [workspace],
  prologue: { storageRoot: join(root, "runtime"), resolveCredential: () => "fixture-only",
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "http://127.0.0.1:1/v1/messages", model: "fixture", credential_ref: "fixture" }) } });
const store = new LocalProjectDatabase(join(root, "plugins.sqlite"));
const registry = host.actionRegistry(reference), client = host.actionClient(reference);
let callerRef, actions;
const peek = { capability_id: "review.caller.peek", version: 1, operation: "query", action: { title: "Caller", description: "Observe the issued caller", kind: "query", scope: "project",
  audiences: ["plugin"], permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "null" } } };
registry.registerProvider({ provider: { provider_id: "platform", title: "Host", kind: "system" }, definitions: [peek],
  handlers: [{ ...peek, handle(context) { callerRef = new WeakRef(context.host_plugin); return null; } }] });
const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: { registry, client: { ...client, ...host.syncActionClient(reference) }, project_id: "project" },
  project_id: "project", actor_id: LOCAL_PERSON_ACTOR_ID, ui: new UiHost(), dependencyCheck: hostDependencyCheck(host.client(reference)),
  artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) }),
  processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: id => store.eventCursor(id) }),
  privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
}), { hostIds: new Set() });
const permission = "review:git-worktree", queue = composition.agentHost.reviews;
const { install } = runtime.install({ trust: { level: "unsigned" }, deployment: "local", grants: [permission], definition: {
  manifest: { schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.example.review-caller", version: "1.0.0", name: "Review caller", kind: "app",
    publisher: { publisher_id: "example", signature: "review-caller" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.js" }],
    permissions: [{ permission, required: true, reason: "Review a worktree" }], capabilities: { provides: [], consumes: [peek.capability_id, writerDirectoryCapabilities.prepare.capability_id] },
    artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
  async start(context) { actions = context.services.actions; return { kind: "app", stop() { actions = undefined; } }; },
} });
const events = [];
const unsubscribe = observeReviewSettlements(queue, "project", event => events.push(event));
try {
  await runtime.start(install.install_id);
  await actions.invoke(peek, {});
  const request = await actions.invoke(writerDirectoryCapabilities.prepare, { workspace_id: "main", operation_id: "gc-operation" });
  const presented = queue.get(request.review_id);
  // Block only provenance registration after Git has created the actual worktree.
  await writeFile(join(repo, ".git", "config.lock"), "held by fixture");
  await queue.respond({ review_id: request.review_id, version: presented.reference.version, decision: "approve", actor_id: "person" });
  assert.ok(queue.receipt(request.review_id).effect_uncertain, "a partial Git effect retains its original settlement provenance");
  await rm(join(repo, ".git", "config.lock"));
  assert.equal(events.at(-1).recipient.install_id, install.install_id);
  await runtime.stop(install.install_id, { preserve_enabled: true });
  actions = undefined;
  let collected = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    await nextTurn(); globalThis.gc();
    if (callerRef.deref() === undefined) { collected = true; break; }
  }
  assert.ok(collected, "an unknown effect keeps notification provenance without retaining the stopped caller");
  await runtime.start(install.install_id);
  queue.settle(request.review_id, { ok: false, error: "Owner verified no write" });
  assert.equal(events.at(-1).recipient, null, "the restarted installation does not inherit its old activation's notification");
  assert.equal(events.at(-1).payload.workspace_id, "main", "workspace invalidation still has its actual operation target");
  await composition.dispose();
  assert.throws(() => queue.request({ reference: { owner: { kind: "agent-review", project_id: "project", plugin_id: "test", install_id: "install" }, id: "after-host-close", version: "proposal-1" }, review_id: "after-host-close", project_id: "project", plugin_id: "test", run: { session_id: "s", run_id: "r" },
    kind: "text-edit", document: { kind: "text-edit", target_path: "note", exists: false, before_text: null, after_text: "new" },
    requested_at: new Date().toISOString(), expires_at: null }), { code: "agent.capability_unavailable" }, "final Host disposal closes its shared review queue");
} finally {
  unsubscribe(); await runtime.stop(install.install_id); await composition.dispose(); queue.close(); await host.close(); store.close(); await rm(root, { recursive: true, force: true });
}
