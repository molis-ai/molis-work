import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

/**
 * S-34 (docs/system/SECURITY-INVARIANTS.md): an Agent's command names a bare executable, and the Host finds it only through
 * PATH entries that are absolute and outside every authorized root. The model can write in the root, so a `.`, a relative
 * entry, the root itself or a link into it would run a file the model rewrote, not the one the person approved. The rule is
 * held in the SDK's two Hosts (Prologue #44); this asserts it against the vendored package, through the agent-host adapter.
 */

const until = async <T>(read: () => T | Promise<T>): Promise<NonNullable<T>> => {
  for (let i = 0; i < 400; i += 1) {
    const result = await read();
    if (result) return result as NonNullable<T>;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("the review or the run did not get there");
};

async function fakecheck(dir: string, says: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, "fakecheck");
  await writeFile(file, `#!/bin/sh\necho ${says}\n`);
  await chmod(file, 0o755);
}

/** The person approves `fakecheck` with the Host's PATH set to `path`; what the command's result told the model. */
async function approvedFakecheck(t: TestContext, path: (dirs: { project: string; outside: string }) => string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "molis-command-path-")));
  const project = join(root, "project"), outside = join(root, "outside");
  // Where the model can write: the root itself and a directory in it. Outside every root: one directory, and a link into the root.
  await fakecheck(project, "IN-ROOT");
  await fakecheck(join(project, "bin"), "IN-ROOT-BIN");
  await fakecheck(outside, "OUTSIDE");
  await symlink(join(project, "bin"), join(outside, "linked-bin"));
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const first = requests.length === 1, events: string[] = [];
    const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
    emit("message_start", { message: { id: `m${requests.length}`, type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } });
    if (first) {
      emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "command-1", name: "run-command", input: {} } });
      emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ executable: "fakecheck", argv: [] }) } });
    } else {
      emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done." } });
    }
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: first ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  const queue = new AgentReviewQueue();
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.command-path-test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  const saved = process.env.PATH;
  try {
    const owner = { project_id: "test", plugin_id: "io.molis.work.coding", install_id: "test", actor_id: "web-user" };
    const directory = { canonical_path: project, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Command path" });
    const handle = await adapter.start({ ...owner, directory, session, task: "Run the check.", role_id: "builder",
      role: { role_id: "builder", version: 1, execution: "workspace-write", prompts: [], host_tools: ["read-file", "run-command"] } } as never);
    const asked = await until(async () => {
      const review = queue.list("test", "pending")[0];
      const view = await adapter.read(handle.ref);
      if (!review && ["failed", "completed"].includes(view.phase)) throw new Error(JSON.stringify({ view, requests }));
      return review;
    });
    assert.equal(asked.document.kind, "command");
    assert.match(JSON.stringify(asked.document), /fakecheck/, "the person approves the bare name fakecheck");
    // The Host reads its PATH when it starts the command.
    process.env.PATH = path({ project, outside });
    await queue.respond({ review_id: asked.review_id, decision: "approve", actor_id: "web-user" });
    await until(async () => (await adapter.read(handle.ref)).phase === "completed");
    assert.equal(requests.length, 2, "the command's result went back to the model once");
    return requests[1]!;
  } finally {
    process.env.PATH = saved;
    await adapter.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("S-34 a command finds its bare name in an absolute directory outside the root, past `.`, a relative entry, the root, a directory in it and a link into it", { timeout: 30_000 }, async t => {
  // Every entry before `outside` would find a fakecheck the model can rewrite; the first one the Host kept would win.
  const sent = await approvedFakecheck(t, ({ project, outside }) => [".", "bin", project, join(project, "bin"), join(outside, "linked-bin"), outside, "/usr/bin", "/bin"].join(":"));
  assert.match(sent, /OUTSIDE/, "the command ran the fakecheck outside the root");
  assert.doesNotMatch(sent, /IN-ROOT/, "no fakecheck in the root ran");
});

test("S-34 when every PATH entry leads into the root, the command gets no PATH and nothing in the root runs", { timeout: 30_000 }, async t => {
  // No entry is left, so the Host gives no PATH; an empty one would be an empty entry, and an empty entry is the root.
  const sent = await approvedFakecheck(t, ({ project, outside }) => [".", "", "bin", project, join(project, "bin"), join(outside, "linked-bin")].join(":"));
  assert.doesNotMatch(sent, /IN-ROOT/, "no fakecheck in the root ran");
  assert.doesNotMatch(sent, /exit 0/, "the command did not run at all");
});
