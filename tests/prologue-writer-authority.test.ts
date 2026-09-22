import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));

function toolResponse(name?: string, input?: unknown) {
  const frames = [
    { type: "message_start", message: { id: "fixture", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 20, output_tokens: 0 } } },
    ...(name ? [{ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: `fixture-${name}`, name, input } }]
      : [{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Fixture run ended; inspect actual operation receipts." } }]),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: name ? "tool_use" : "end_turn" }, usage: { output_tokens: 10 } },
    { type: "message_stop" },
  ];
  return new Response(frames.map(frame => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } });
}

test("packed SDK read-only coordinator cannot invoke the write tools reserved for delegation", { timeout: 15_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-writer-authority-")), project = join(root, "parent");
  await mkdir(project); await writeFile(join(project, "sample.txt"), "ORIGINAL PARENT\n");
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)));
    return toolResponse("write", { path: "sample.txt", text: "UNAUTHORIZED PARENT WRITE\n" });
  });
  const runtime = await createRuntime({ app: { appId: "io.molis.work.writer-authority", appVersion: "1.0.0" },
    host: createNodeHost({ storageRoot: join(root, "runtime"), network: { model: true } }), network: { model: true },
    preset: "local-agent", posture: { sandbox: "workspace-write" },
    rules: [{ source: "user", effect: "allow", match: { what: "tool" } }],
  });
  try {
    const credential = await runtime.credentials.write({ label: "fixture", secret: { plaintext: new TextEncoder().encode("test-only") } });
    const authorized = await runtime.workspace.authorize({ path: project });
    const draft = runtime.characters.create({ id: "readonly-coordinator", version: 1, name: "Coordinator", tools: ["read", "dispatch-subagent", "await-subagents"] });
    const character = runtime.characters.publish(draft.ref);
    const started = await runtime.startAgentRun({ session: await runtime.sessions.create(), rootRef: authorized.ref,
      start: { protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credentialRef: credential.ref,
        messages: [{ role: "user", text: "Delegate changes. Do not write the parent workspace." }], budget: { maxTurns: 1 } },
      agent: { idempotencyKey: "parent-authority", mode: "build", characterRef: character.ref,
        toolNames: ["read", "write", "dispatch-subagent", "await-subagents"] },
    });
    const events: any[] = [];
    await new Promise<void>(resolve => started.run.subscribe((event: any) => {
      events.push(event); if (["completed", "failed", "cancelled"].includes(event.type)) resolve();
    }));
    assert.ok(requests.length >= 1);
    assert.ok(requests.every(request => !request.tools.some((tool: any) => tool.name === "write")));
    assert.equal(await readFile(join(project, "sample.txt"), "utf8"), "ORIGINAL PARENT\n");
    assert.equal(events.some(event => event.type === "tool-result" && event.name === "write" && !event.isError), false);
    assert.match(JSON.stringify(events), /MODEL_TOOL_NOT_DECLARED|TOOL_NOT_ALLOWED/u);
  } finally { await runtime.shutdown(); await rm(root, { recursive: true, force: true }); }
});

for (const decision of ["approve", "reject", "stop", "bridge-failure", "escape", "restart-pending", "command"] as const) test(`parallel child ${decision}: original Host review targets only its authorized directory and survives restart`, { timeout: 35_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-child-writer-"));
  const parent = join(root, "parent"), childPath = join(root, "child");
  await mkdir(parent); await mkdir(childPath);
  await writeFile(join(parent, "sample.txt"), "PARENT\n"); await writeFile(join(childPath, "sample.txt"), "CHILD ORIGINAL\n");
  let parentCalls = 0, childCalls = 0, calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls++;
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const isChild = body.messages.some((message: any) => message.role === "user" && (typeof message.content === "string"
      ? message.content.startsWith("CHILD_WRITE") : message.content.some((block: any) => block.type === "text" && block.text.startsWith("CHILD_WRITE"))));
    if (isChild) {
      childCalls++;
      if (decision === "command") return childCalls === 1 ? toolResponse("run-command", { executable: "pwd", argv: [] }) : toolResponse();
      const target = decision === "escape" ? "../parent/sample.txt" : "sample.txt";
      if (childCalls === 1) return toolResponse("read", { path: target });
      return childCalls === 2 ? toolResponse("write", { path: target, text: "CHILD APPROVED\n" }) : toolResponse();
    }
    assert.equal(body.tools.some((tool: any) => tool.name === "write"), false, "the parent never receives a direct write tool");
    parentCalls++;
    if (parentCalls > 1) return toolResponse();
    const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@[0-9]+/)?.[0]; assert.ok(character);
    return toolResponse("dispatch-subagent", { instruction: "CHILD_WRITE: update sample.txt in your own root only.",
      tools: ["read", "write", ...(decision === "command" ? ["run-command"] : [])], workspace: "writer-a", character, idempotencyKey: "writer-a", maxTurns: 3 });
  });
  let queue = new AgentReviewQueue();
  if (decision === "bridge-failure") {
    const original = queue.request.bind(queue);
    t.mock.method(queue, "request", input => {
      if (input.kind === "text-edit") throw new Error("fixture review surface unavailable");
      return original(input);
    });
  }
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work.child-writer", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  let adapter = await make();
  try {
    const host = new AgentHost({ reviews: queue }); host.register(adapter);
    const manifest = structuredClone(codingAgentManifest), role = manifest.roles.find(role => role.role_id === "coordinator")!;
    role.subagent_workspaces = "required"; role.host_tools = ["read-file", "dispatch-subagent", "await-subagents"];
    manifest.subagents!.roles = [{ role_id: "coding-writer", version: 3, name: "独立写入", execution: decision === "command" ? "workspace-write" : "text-edit", host_tools: ["read-file", "write", ...(decision === "command" ? ["run-command"] : [])] }];
    const owner = { board_id: "b", plugin_id: "io.molis.work.coding", install_id: "i", actor_id: "user" }, directory = { canonical_path: parent, realpath_verified: true };
    const session = await adapter.createSession({ ...owner, directory, title: "Parent" });
    const request = { ...owner, session, directory, role_id: "coordinator", task: "Delegate an isolated write.",
      subagent_workspaces: [{ workspace_id: "writer-a", directory: { canonical_path: childPath, realpath_verified: true } }] };
    await assert.rejects(host.start("prologue", request, { manifest, prompts: codingPrompts, authorizedDirectories: [parent] }), /子任务目录未授权/u);
    if (decision === "approve") {
      const authority = { manifest, prompts: codingPrompts, authorizedDirectories: [parent, childPath, root] };
      await assert.rejects(host.start("prologue", { ...request, subagent_workspaces: [] }, authority), /独立的已授权目录/u);
      await assert.rejects(host.start("prologue", { ...request, subagent_workspaces: [{ workspace_id: "parent", directory }] }, authority), /指向主工作区/u);
      await assert.rejects(host.start("prologue", { ...request, subagent_workspaces: [...request.subagent_workspaces, ...request.subagent_workspaces] }, authority), /重复/u);
      await assert.rejects(host.start("prologue", { ...request, subagent_workspaces: [{ workspace_id: "outer", directory: { canonical_path: root, realpath_verified: true } }] }, authority), /互不包含/u);
    }
    assert.equal(calls, 0);
    const handle = await host.start("prologue", request, { manifest, prompts: codingPrompts, authorizedDirectories: [parent, childPath] });
    let writeReview: string | undefined;
    const decided = new Set<string>(), deadline = Date.now() + 20_000;
    polling: for (;;) {
      const view = await adapter.read(handle.ref);
      if (["completed", "failed", "cancelled", "stopped"].includes(view.phase)) { assert.equal(view.phase, "completed", JSON.stringify(view)); break; }
      if (Date.now() > deadline) throw new Error("Timed out: " + JSON.stringify({ view, reviews: queue.list("b"), childCalls }));
      for (const review of queue.list("b", "pending")) if (!decided.has(review.review_id)) {
        decided.add(review.review_id);
        assert.equal(await readFile(join(parent, "sample.txt"), "utf8"), "PARENT\n");
        assert.equal(await readFile(join(childPath, "sample.txt"), "utf8"), "CHILD ORIGINAL\n", "approval is required before writing");
        if (review.kind === "tool-operation") {
          assert.equal(childCalls, 0); await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
        } else if (decision === "command") {
          assert.equal(review.document.kind, "command");
          if (review.document.kind !== "command") throw new Error("wrong command review");
          assert.equal(review.document.command, "pwd");
          assert.equal(review.document.workspace_path, childPath); assert.equal(review.document.cwd, ".");
          writeReview = review.review_id;
          const result = await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" });
          assert.equal(result.delivery_error, undefined);
        } else {
          assert.equal(review.document.kind, "text-edit");
          if (review.document.kind !== "text-edit") throw new Error("wrong review");
          assert.equal(review.document.workspace_path, childPath); assert.equal(review.document.before_text, "CHILD ORIGINAL\n");
          assert.equal(review.document.after_text, "CHILD APPROVED\n"); assert.notEqual(review.run?.run_id, handle.ref.run_id);
          writeReview = review.review_id;
          if (decision === "restart-pending") {
            const count = calls;
            await adapter.close(); queue = new AgentReviewQueue(); adapter = await make();
            await queue.refresh("b");
            assert.equal(calls, count, "restart at pending cannot call the provider");
            await assert.rejects(queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "user" }));
            break polling;
          } else if (decision === "stop") { const [child] = await adapter.subagents!.list(handle.ref); await adapter.subagents!.cancel(handle.ref, child!.subagent_id, "user"); }
          else if (decision === "approve" || decision === "reject") { const result = await queue.respond({ review_id: review.review_id, decision, actor_id: "user" }); assert.equal(result.delivery_error, undefined); }
          else throw new Error("A rejected path or failed bridge must not create an actionable write review");
        }
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (decision !== "bridge-failure" && decision !== "escape") assert.ok(writeReview, JSON.stringify({ parent: await adapter.read(handle.ref), children: await adapter.subagents!.list(handle.ref), reviews: queue.list("b"), parentCalls, childCalls }));
    else assert.equal(writeReview, undefined);
    assert.equal(await readFile(join(parent, "sample.txt"), "utf8"), "PARENT\n");
    assert.equal(await readFile(join(childPath, "sample.txt"), "utf8"), decision === "approve" ? "CHILD APPROVED\n" : "CHILD ORIGINAL\n");
    await queue.refresh("b");
    const before = await adapter.subagents!.list(handle.ref);
    assert.equal(before[0]!.workspace_path, childPath); assert.match(before[0]!.task, /CHILD_WRITE/u);
    assert.equal(before[0]!.state, ["stop", "bridge-failure", "restart-pending"].includes(decision) ? "cancelled" : "completed");
    if (decision === "bridge-failure") assert.match(before[0]!.error!, /宿主审查或归属记录失败/u);
    if (decision === "escape") assert.ok(before[0]!.activity.some(item => item.name === "write" && item.state === "failed"));
    if (decision === "approve" || decision === "command") assert.equal(queue.receipt(writeReview!)?.effect_settled, true);
    const commandResult = decision === "command" ? await adapter.readCommandOutput({ runtime_id: "prologue", session_id: before[0]!.child_run.session_id }, { run_id: before[0]!.child_run.run_id, call_id: "fixture-run-command" }) : undefined;
    if (commandResult) assert.ok(JSON.stringify(commandResult).includes(childPath), "command result identifies the actual child cwd");
    const count = calls; await adapter.close(); queue = new AgentReviewQueue(); adapter = await make();
    assert.deepEqual(await adapter.subagents!.list(handle.ref), before); await queue.refresh("b");
    assert.equal(calls, count, "restoring children never replays model or file operations");
    if (writeReview) assert.equal(queue.get(writeReview)?.document.kind, decision === "command" ? "command" : "text-edit");
    if (decision === "approve" || decision === "command") assert.equal(queue.receipt(writeReview!)?.effect_settled, true);
    if (commandResult) assert.deepEqual(await adapter.readCommandOutput({ runtime_id: "prologue", session_id: before[0]!.child_run.session_id }, { run_id: before[0]!.child_run.run_id, call_id: "fixture-run-command" }), commandResult);
    if (writeReview) await assert.rejects(queue.respond({ review_id: writeReview, decision: "approve", actor_id: "user" }));
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
