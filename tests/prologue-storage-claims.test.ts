import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

/**
 * The Home's execution service holds the runtime's storage owner lock for its whole life. A write claim the runtime's
 * store finds when it starts can then only be one a crashed owner left (killed inside a commit): the session's own index
 * record must stay writable after the restart instead of refusing every later round.
 */
test("a write claim left by a crashed owner does not lock a session's index after the restart", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-storage-claims-"));
  t.mock.method(globalThis, "fetch", async () => {
    const events: string[] = [], emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 5, output_tokens: 0 } } });
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done." } });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  const storageRoot = join(root, "runtime");
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.claims-test", appVersion: "1.0.0" }, storageRoot,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  const directory = { canonical_path: root, realpath_verified: true };
  const role = { role_id: "reader", version: 1, execution: "read-only" as const, host_tools: [], prompts: [] };
  let adapter = await make();
  try {
    const session = await adapter.createSession({ title: "Claims", project_id: "test", plugin_id: "io.molis.work.coding", install_id: "test", actor_id: "test", directory });
    await adapter.close();
    // What a kill inside the index commit leaves beside the record: the claim file, the record itself unchanged.
    const records = join(storageRoot, "records");
    const indexKind = readdirSync(records).find(kind => kind.startsWith("molis-agent-index-"))!;
    const claim = join(records, indexKind, `${session.session_id}.json.cas`);
    writeFileSync(claim, "");
    adapter = await make();
    assert.equal(existsSync(claim), false, "the restarted owner cleared the dead owner's claim");
    const handle = await adapter.start({ plugin_id: "io.molis.work.coding", project_id: "test", install_id: "test", actor_id: "test",
      session, directory, role_id: "reader", task: "Say done.", role } as never);
    for (const until = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
      const view = await adapter.read(handle.ref);
      if (view.phase === "completed") break;
      assert.ok(!["failed", "stopped", "cancelled"].includes(view.phase), `round ended as ${view.phase}: ${view.stop_reason}`);
      if (Date.now() > until) throw new Error("run did not finish");
    }
    assert.equal((await adapter.readSession(session)).recovery, undefined);
  } finally {
    await adapter.close();
    await rm(root, { recursive: true, force: true });
  }
});
