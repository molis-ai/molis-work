// Stage 3e-0b of specs/ai-input-receipts: the parent that hands its children their own directories (Coding's writers) may
// say how it handles a supplement, and still holds no tool that writes or runs anything (statement 统筹 10-18).
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

function ended(): Response {
  const frames = [
    { type: "message_start", message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 20, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "好的。" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ];
  return new Response(frames.map(frame => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

test("RCPT-365, 3e-0b: the writers parent still cannot hold a tool that writes or runs; with acknowledge-inputs it starts", { timeout: 60_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-workspace-parent-"));
  const parent = join(root, "parent"), child = join(root, "a");
  for (const directory of [parent, child]) await mkdir(directory);
  let calls = 0, offered: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++; const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    offered = (body.tools ?? []).map((tool: { name: string }) => tool.name);
    return ended();
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.workspace-parent", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  t.after(async () => { await adapter.close?.(); await rm(root, { recursive: true, force: true }); });
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  const owner = { project_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: parent, realpath_verified: true };
  const request = async () => ({ ...owner, session: await adapter.createSession({ ...owner, directory, title: "Parallel" }), directory, role_id: "writers", task: "Two changes.",
    subagent_workspaces: [{ workspace_id: "writer-a", directory: { canonical_path: child, realpath_verified: true } }] });
  const authority = (manifest: typeof codingAgentManifest) => ({ manifest, prompts: codingPrompts, authorizedDirectories: [parent, child] });

  for (const tool of ["write", "run-command"]) {
    const manifest = structuredClone(codingAgentManifest), role = manifest.roles.find(one => one.role_id === "writers")!;
    role.host_tools = [...role.host_tools!, tool];
    await assert.rejects(host.start("prologue", await request(), authority(manifest)), `RCPT-365 a writers parent holding ${tool} is refused`);
  }
  assert.equal(calls, 0, "RCPT-365 refused before any model call");

  assert.ok(codingAgentManifest.roles.find(one => one.role_id === "writers")!.host_tools!.includes("acknowledge-inputs"), "the writers role lists it");
  const handle = await host.start("prologue", await request(), authority(codingAgentManifest));
  for (const deadline = Date.now() + 30_000; !["completed", "failed", "cancelled", "stopped"].includes((await adapter.read(handle.ref)).phase);) {
    assert.ok(Date.now() < deadline, "the round ends"); await new Promise(resolve => setTimeout(resolve, 25));
  }
  const view = await adapter.read(handle.ref);
  assert.equal(view.phase, "completed", JSON.stringify({ stop: view.stop_reason, error: (view as { error?: unknown }).error }));
  assert.ok(offered.includes("acknowledge-inputs"), `RCPT-365 the writers round is offered it: ${offered}`);
});
