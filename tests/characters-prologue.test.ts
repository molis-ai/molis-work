import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, createPrologueNodeAdapter, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentFrozenCharacter, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

test("packed SDK consumes the Host-frozen Character instructions and narrowed tools, and restores the exact source after restart", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-character-sdk-")), requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    const events: string[] = [];
    const emit = (type: string, data: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
    emit("message_start", { message: { id: "msg_character", type: "message", role: "assistant", model: "fixture-model", content: [], stop_reason: null, usage: { input_tokens: 30, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Fixture complete." } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 8 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.character-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture-model", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  let adapter: Awaited<ReturnType<typeof make>> | undefined;
  try {
    adapter = await make(); const host = new AgentHost(); host.register(adapter);
    const owner = { board_id: "b", plugin_id: "caller", install_id: "i", actor_id: "u" }, directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Character freeze" });
    const original: AgentFrozenCharacter = { character_id: "profile", title: "Verifier", instructions: "CHARACTER_FIXED_V2: cite actual evidence.", host_tools: ["read-file"],
      source: { owner_actor_id: "u", draft_revision: 3 }, reference: { artifact_id: "character:b:profile", version: 2 }, board_id: "b", content_digest: "fixed",
      producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "official-characters-binding" }, published_at: "2026-09-22T00:00:00Z" };
    const expected = structuredClone(original);
    const authority: AgentStartAuthority = { manifest: { roles: [{ role_id: "reader", version: 1, name: "Reader", prompts: ["base", "reader"], host_tools: ["read-file", "search"] }],
      prompts: [{ prompt_id: "base", version: 1 }, { prompt_id: "reader", version: 1 }], characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["reader"] } },
      authorizedDirectories: [root], prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "BASE_MARKER" }, { prompt_id: "reader", version: 1, layer: "role", body: "ROLE_MARKER" }],
      project_prompts: [{ prompt_id: "project", version: 1, body: "PROJECT_MARKER" }], resolveCharacter: () => original };
    const task = "Inspect the repository without changing files.";
    const starting = host.start("prologue", { ...owner, session, directory, task, role_id: "reader", character: original.reference }, authority);
    original.instructions = "LATER_UNPUBLISHED_EDIT"; original.host_tools.push("search");
    const handle = await starting;
    const view = await new Promise<AgentRunView>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("fixture did not finish")), 10_000); let off = () => {};
      off = adapter!.observe(handle.ref, value => { if (["completed", "failed", "cancelled"].includes(value.phase)) { clearTimeout(timer); queueMicrotask(() => off()); resolve(value); } });
    });
    assert.equal(view.phase, "completed", view.stop_reason); assert.equal(requests.length, 1);
    const system = JSON.stringify(requests[0].system);
    assert.ok(system.includes(expected.instructions), system); assert.ok(!system.includes("LATER_UNPUBLISHED_EDIT"));
    assert.ok(system.indexOf("BASE_MARKER") < system.indexOf("ROLE_MARKER"));
    assert.ok(system.indexOf("ROLE_MARKER") < system.indexOf(expected.instructions));
    assert.ok(system.indexOf(expected.instructions) < system.indexOf("PROJECT_MARKER"));
    const names = (requests[0].tools ?? []).map((tool: { name: string }) => tool.name);
    assert.ok(names.includes("read"), JSON.stringify(names)); assert.ok(!names.includes("search"), JSON.stringify(names));
    assert.deepEqual(view.frozen.character, expected); assert.deepEqual(view.frozen.host_tools, ["read-file"]); assert.equal(view.turns[0]?.text, task);
    await adapter.close(); adapter = await make();
    assert.deepEqual((await adapter.readSession(session)).latest_run?.frozen.character, expected);
    assert.equal(requests.length, 1, "restoring history never asks the model to regenerate Character context");
  } finally { await adapter?.close(); await rm(root, { recursive: true, force: true }); }
});
