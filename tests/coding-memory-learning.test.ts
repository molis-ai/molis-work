import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureSystemAgentService, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingMemoryLearningKey, withCodingMemoryLearningSources, type CodingMemoryLearningPayload } from "../apps/local-host/dist/memory/memory-coding-learning.js";
import { openTestHome } from "./fixtures/test-home.js";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

async function setup(t: test.TestContext, formation?: (attempt: number) => Promise<void>) {
  let learningCalls = 0, codingFails = false;
  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const content = body.messages.at(-1)?.content;
    const prompt = typeof content === "string" ? content : (content ?? []).filter((part: { type: string }) => part.type === "text").map((part: { text: string }) => part.text).join("\n");
    let response: Response;
    if (prompt.includes('"destinations"') && prompt.includes('"sources"')) {
      learningCalls++; await formation?.(learningCalls);
      const data = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2));
      const slot = data.destinations.find((item: { scope: string; replacement?: string }) => item.scope === "project" && !item.replacement)?.slots.convention?.[0];
      assert.ok(slot, "the original Coding policy permits a project convention");
      const source = data.sources.at(-1);
      response = cogniaScriptedResponse(undefined, JSON.stringify({ drafts: [{ slot_id: slot, text: source.text, suggested_basis: "explicit",
        evidence: [{ source_id: source.id, quote: source.text }] }] }));
    } else if (codingFails) response = new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "Local fixture refusal" } }), { status: 400 });
    else response = cogniaScriptedResponse(undefined, endingReviewAnswer(body, () => []) ?? "完成。");
    reply.writeHead(response.status, { "content-type": "text/event-stream" }); reply.end(await response.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const home = await openTestHome(t, { host: { completeText: undefined } });
  const base = `http://127.0.0.1:${address.port}`;
  await runWithMolisWorkHome(home.home, () => withMolisWorkProjectCatalog({ homeDirectory: home.home }, catalog => {
    const connection = withConnectorConnections(home.home, store => {
      const row = store.createToken({ serviceId: "model-api", displayName: "Local formation", token: "local-test-only" });
      store.assertTarget(row.connection_id, "model-api", base); return row;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "fixture", display_name: "Local formation", base_url: base,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
  }));
  const project = await home.createProject("Coding 自动形成", ["coding"]);
  const prefix = `/projects/${project.project_id}`, coding = prefix + "/api/plugins/io.molis.work.coding";
  const directory = join(home.home, "workspace"); await mkdir(directory);
  await home.web.post(prefix + "/api/workspaces", { workspace_path: directory, user_confirmed: true });
  const { workspaces } = await home.web.get<{ workspaces: Array<{ workspace_id: string }> }>(prefix + "/api/project-settings/workspaces");
  const workspace_id = workspaces[0]!.workspace_id;
  await home.web.post(prefix + "/api/project-settings/workspaces", { workspace_id });
  const created = await home.web.post<{ session: { session_id: string } }>(coding + "/sessions", {});
  const business_session_id = created.session.session_id;
  const system = ensureSystemAgentService(home.host, home.home); await system.ready;
  const adapter = system.agentHost.adapter("prologue");
  const start = async (text: string, input_id = randomUUID(), phase: "completed" | "failed" = "completed") => {
    const sent = await home.web.post<{ run: { ref: AgentRunRef } }>(coding + `/sessions/${business_session_id}/runs`, {
      task: text, original_input: { input_id, text }, intent: "discuss", workspace_id, provider_id: "fixture", model_id: "fixture",
    });
    const view = await untilSetup(async () => { const view = await adapter.read(sent.run.ref); return view.phase === phase ? view : undefined; }, "Coding completion");
    return view;
  };
  const key = (view: AgentRunView) => codingMemoryLearningKey(project.project_id, { business_session_id, runtime_id: "prologue" }, view.original_input!.ref);
  const owner = async () => {
    const overview = await home.web.get<{ plugins: Array<{ plugin_id: string; install_id: string }> }>(prefix + "/api/plugin-trust/overview");
    const row = overview.plugins.find(item => item.plugin_id === "io.molis.work.coding"); assert.ok(row); return row;
  };
  const permission = async (granted: boolean) => home.web.post(prefix + "/api/plugin-trust/permissions/set", {
    install_id: (await owner()).install_id, permission: "memory:write", granted,
  });
  const candidates = async () => (await home.web.get<{ candidates: unknown[] }>(prefix + "/api/memory/overview?scope=project")).candidates;
  return { home, project, coding, business_session_id, adapter, start, key, permission, candidates, failCoding: (value: boolean) => { codingFails = value; }, get learningCalls() { return learningCalls; } };
}

test("M2-CODING-01/02/06: actual Coding completion forms through the durable queue, duplicate originals and no-signal runs do not learn again", { timeout: 90_000 }, async t => {
  const f = await setup(t);
  await f.permission(true);
  const text = "以后本项目统一使用 pnpm", input = randomUUID();
  const first = await f.start(text, input);
  const task = await untilSetup(async () => { const task = f.adapter.schedule!.find(f.key(first)); return task?.state === "done" ? task : undefined; }, "Coding learning queue settled");
  assert.equal(f.learningCalls, 1); assert.equal((await f.candidates()).length, 1);
  assert.equal((task.payload as { kind: string }).kind, "coding");
  const canonical = await f.adapter.memory!.withCaller({ actor_id: "web-user", project_id: f.project.project_id,
    consumer: "ui", person: true, purpose: "management", current_scene: "common" }).candidates.list("project", f.project.project_id);
  assert.equal(canonical.length, 1); assert.equal(canonical[0]!.sources?.length, 1);
  assert.deepEqual(JSON.parse(canonical[0]!.sources![0]!.event_id.slice("molis-input:1:".length)),
    ["web-user", first.ref.session_id, "original", input], "SDK candidate retains the canonical Coding original identity");
  assert.equal(JSON.stringify(task.payload).includes(text), false, "durable queue carries references, never conversation text");
  for (const mismatch of [{ project_id: "another-project" }, { plugin_id: "system.assistant" }, { install_id: "another-installation" },
    { business_session_id: "another-business-session" }, { session_id: "another-runtime-session" }, { run_id: "another-run" }]) {
    const payload = { ...task.payload, ...mismatch } as CodingMemoryLearningPayload;
    let used = false;
    try {
      await withCodingMemoryLearningSources(f.home.host, f.adapter, { session_id: payload.session_id,
        key: task.key, payload }, () => true, async () => { used = true; });
    } catch (error) { assert.ok(error instanceof Error && "code" in error, "mismatched current authority is an explicit coded refusal"); }
    assert.equal(used, false, "project, plugin, installation, business session and Run are never interchangeable");
  }
  const retry = await f.start(text, input), plain = await f.start("解释一下 package.json");
  assert.notEqual(retry.ref.run_id, first.ref.run_id, "the repeated original really started a distinct direct Run");
  await new Promise(resolve => setTimeout(resolve, 6_000));
  assert.equal(f.key(retry), f.key(first), "same canonical original keeps one queue identity across Runs");
  assert.equal(f.adapter.schedule!.find(f.key(retry))?.task_id, task.task_id, "same original is not independent evidence");
  assert.deepEqual(f.adapter.schedule!.find(f.key(retry))?.payload, task.payload, "a retry cannot replace the accepted Run or its policy");
  assert.equal(f.adapter.schedule!.find(f.key(plain)), null, "no standing wish queues no extraction");
  assert.equal(f.learningCalls, 1); assert.equal((await f.candidates()).length, 1);
  assert.equal(f.adapter.schedule!.find(f.key(first))?.task_id, task.task_id, "repeated observation keeps the original terminal key");
});

test("M2-CODING-04/06: revoke and regrant during actual extraction cannot revive the old attempt, and ordinary Coding still runs", { timeout: 90_000 }, async t => {
  const held = Promise.withResolvers<void>(), next = Promise.withResolvers<void>(); t.after(() => { held.resolve(); next.resolve(); });
  const f = await setup(t, attempt => attempt === 1 ? held.promise : next.promise); await f.permission(true);
  const first = await f.start("以后本项目统一使用 pnpm");
  await untilSetup(async () => f.learningCalls === 1 ? true : undefined, "formation dispatch reached local server");
  await f.permission(false); await f.permission(true); held.resolve();
  await untilSetup(async () => f.learningCalls === 2 ? true : undefined, "a fresh permitted queue attempt reaches extraction");
  assert.equal((await f.candidates()).length, 0, "the old attempt cannot write after regrant; the newly authorized attempt is still held");
  await f.permission(false); next.resolve();
  await untilSetup(async () => f.adapter.schedule!.find(f.key(first))?.state === "failed" ? true : undefined, "bounded queue attempts stop after revocation");
  assert.equal((await f.candidates()).length, 0);
  const plain = await f.start("以后本项目的文档统一使用中文"); assert.equal(plain.phase, "completed");
  await new Promise(resolve => setTimeout(resolve, 6_000));
  assert.equal(f.adapter.schedule!.find(f.key(plain)), null);
  assert.equal(f.learningCalls, 2, "optional learning permission never borrows model:invoke or affects dialogue");
});


test("M2-CODING-01: restart after a completed Coding round recovers the original through the same persisted queue", { timeout: 90_000 }, async t => {
  const f = await setup(t); await f.permission(true);
  const first = await f.start("以后本项目统一使用 pnpm");
  assert.equal(f.adapter.schedule!.find(f.key(first)), null, "restart before the first completion observation");
  await f.home.close(); await f.home.host.close();
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    import { ensureSystemAgentService, MolisWorkLocalHost, projectActionAvailability } from '@molis-ai/molis-work-app-local-host';
    import { withMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
    import { serveTestHost } from ${JSON.stringify(new URL("./fixtures/test-home.ts", import.meta.url).href)};
    const home = ${JSON.stringify(f.home.home)}, coding = ${JSON.stringify(f.coding)}, projectId = ${JSON.stringify(f.project.project_id)};
    const host = new MolisWorkLocalHost({ homeDirectory: home,
      workspacesFor: id => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(id)),
      actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home) });
    const web = await serveTestHost(null, { home, host });
    try {
      await web.web.get(coding + '/state');
      const system = ensureSystemAgentService(host, home); await system.ready;
      const adapter = system.agentHost.adapter('prologue'), deadline = Date.now() + 30000;
      while (adapter.schedule.find(${JSON.stringify(f.key(first))})?.state !== 'done') {
        assert.ok(Date.now() < deadline, 'restarted completion observation must settle the original task');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const result = await web.web.get('/projects/' + projectId + '/api/memory/overview?scope=project');
      assert.equal(result.candidates.length, 1);
      const original = await adapter.read(${JSON.stringify(first.ref)});
      assert.equal(original.original_input.ref.input_id, ${JSON.stringify(first.original_input!.ref.input_id)});
      await new Promise(resolve => process.send({ pid: process.pid, candidates: result.candidates.length }, resolve));
    } finally { await web.close(); await host.close(); process.disconnect(); }
  `], { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe", "ipc"], signal: t.signal });
  let stderr = "", result: { pid: number; candidates: number } | undefined;
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.on("message", message => { result = message as typeof result; });
  const exited = new Promise<number | null>((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  try {
    assert.equal(await exited, 0, stderr); assert.ok(result); assert.notEqual(result.pid, process.pid);
    assert.equal(result.candidates, 1); assert.equal(f.learningCalls, 1);
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited.catch(() => {}); } }

});


test("M2-CODING-02: a first failed Run without accepted learning can form once after a direct retry succeeds", { timeout: 90_000 }, async t => {
  const f = await setup(t); await f.permission(true);
  const text = "以后本项目统一使用 pnpm", input = randomUUID();
  f.failCoding(true);
  const failed = await f.start(text, input, "failed");
  await new Promise(resolve => setTimeout(resolve, 6000));
  assert.equal(f.learningCalls, 0); assert.equal(f.adapter.schedule!.find(f.key(failed)), null);
  f.failCoding(false);
  const completed = await f.start(text, input);
  assert.notEqual(completed.ref.run_id, failed.ref.run_id, "the successful retry is a distinct direct Run");
  assert.equal(f.key(completed), f.key(failed));
  const task = await untilSetup(async () => { const task = f.adapter.schedule!.find(f.key(completed)); return task?.state === "done" ? task : undefined; }, "first successful original formation");
  assert.equal((task.payload as CodingMemoryLearningPayload).run_id, completed.ref.run_id);
  assert.equal(f.learningCalls, 1); assert.equal((await f.candidates()).length, 1);
});
