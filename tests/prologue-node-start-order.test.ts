import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));

test("W4-06-01: refusing overlapping child directories leaves no durable plan or credential exchange", { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "molis-child-plan-refusal-")), parent = join(root, "parent"), storageRoot = join(root, "runtime");
  await mkdir(parent);
  const app = { appId: "io.molis.work.child-plan-refusal", appVersion: "1.0.0" };
  let credentialExchanges = 0;
  const adapter = await createPrologueNodeAdapter({ app, storageRoot, reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => { credentialExchanges++; return "test-only"; } });
  try {
    const host = new AgentHost(); host.register(adapter);
    const manifest = structuredClone(codingAgentManifest), role = manifest.roles.find(role => role.role_id === "coordinator")!;
    role.subagent_workspaces = "required"; role.execution = "read-only";
    role.host_tools = ["read-file", "dispatch-subagent", "await-subagents", "board-read", "board-report"];
    manifest.subagents!.roles = [{ role_id: "coding-writer", version: 3, name: "独立写入", execution: "text-edit", host_tools: ["read-file", "write"] }];
    const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: parent, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Refused plan" });
    const plan = { source: { artifact_id: "confirmed-plan", version: 1 }, title: "Confirmed plan", steps: [{ id: "step-1", title: "Inspect", acceptance: "Report the evidence" }] };
    await assert.rejects(host.start("prologue", { ...owner, session, directory, role_id: "coordinator", task: "Follow the confirmed plan.",
      execution_plan: plan, text_materials: [{ material_id: "plan", title: plan.title, source_artifact_id: plan.source.artifact_id, source_version: 1, text: JSON.stringify(plan) }],
      subagent_workspaces: [{ workspace_id: "outer", directory: { canonical_path: root, realpath_verified: true } }] },
    { manifest, prompts: codingPrompts, authorizedDirectories: [parent, root] }), /子任务目录必须与主目录及其他子目录互不包含/u);
    assert.equal(credentialExchanges, 0, "the refused launch never reaches model credential exchange");
    assert.deepEqual((await adapter.readSession(session)).runs, [], "no run is recorded for the refused launch");
    await adapter.close();
    const restored = await createRuntime({ app, host: createNodeHost({ storageRoot }), preset: "local-agent" });
    try {
      assert.deepEqual(restored.boards.assignedTo({ kind: "session", id: session.session_id, revision: 1 }), [], "reopening must not reveal a plan admitted before the refused child setup");
    } finally { await restored.shutdown(); }
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
