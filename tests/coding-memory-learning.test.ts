import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ensureSystemAgentService, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { AgentRunRef, AgentRunView, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
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
  const originals = new Map<string, string>();
  const originalIdentity = (view: AgentRunView) => JSON.stringify([view.original_input!.ref.session_id, view.original_input!.ref.input_id, view.original_input!.ref.version]);
  const start = async (text: string, input_id = randomUUID(), phase: "completed" | "failed" = "completed") => {
    const sent = await home.web.post<{ run: { ref: AgentRunRef } }>(coding + `/sessions/${business_session_id}/runs`, {
      task: text, original_input: { input_id, text }, intent: "discuss", workspace_id, provider_id: "fixture", model_id: "fixture",
    });
    const view = await untilSetup(async () => { const view = await adapter.read(sent.run.ref); return view.phase === phase ? view : undefined; }, "Coding completion");
    originals.set(view.ref.run_id, originalIdentity(view));
    return view;
  };
  const task = (view: AgentRunView) => {
    const matches = adapter.schedule!.list("memory.learn").filter(task => task.payload.kind === "coding"
      && typeof task.payload.run_id === "string" && originals.get(task.payload.run_id) === originalIdentity(view));
    assert.ok(matches.length <= 1, "one canonical original cannot acquire multiple accepted queue identities");
    return matches[0] ?? null;
  };
  const owner = async () => {
    const overview = await home.web.get<{ plugins: Array<{ plugin_id: string; install_id: string }> }>(prefix + "/api/plugin-trust/overview");
    const row = overview.plugins.find(item => item.plugin_id === "io.molis.work.coding"); assert.ok(row); return row;
  };
  const permission = async (granted: boolean) => home.web.post(prefix + "/api/plugin-trust/permissions/set", {
    install_id: (await owner()).install_id, permission: "memory:write", granted,
  });
  const overview = () => home.web.get<{ candidates: unknown[]; items: unknown[]; changes: unknown[] }>(prefix + "/api/memory/overview?scope=project");
  const candidates = async () => (await overview()).candidates;
  const archive = async () => {
    const path = coding + `/sessions/${business_session_id}`;
    const { archive_decision } = await home.web.get<{ archive_decision: unknown }>(path + "/archive-preview");
    const response = await fetch(home.origin + path, { method: "PATCH", headers: { origin: home.origin, "content-type": "application/json",
      "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify({ archive: true, archive_decision }) });
    assert.equal(response.status, 200, "the real Coding archive command succeeds"); await response.arrayBuffer();
  };
  const unarchive = async () => {
    const path = coding + `/sessions/${business_session_id}`;
    const { unarchive_decision } = await home.web.get<{ unarchive_decision: unknown }>(path + "/unarchive-preview");
    await home.web.post(path + "/unarchive", { unarchive_decision });
  };
  return { home, project, coding, business_session_id, adapter, start, task, permission, candidates, overview, archive, unarchive,
    failCoding: (value: boolean) => { codingFails = value; }, get learningCalls() { return learningCalls; } };
}

test("M2-CODING-01/02/06: actual Coding completion forms through the durable queue, duplicate originals and no-signal runs do not learn again", { timeout: 90_000 }, async t => {
  const f = await setup(t);
  await f.permission(true);
  const text = "以后本项目统一使用 pnpm", input = randomUUID();
  const first = await f.start(text, input);
  const task = await untilSetup(async () => { const task = f.task(first); return task?.state === "done" ? task : undefined; }, "Coding learning queue settled");
  assert.equal(f.learningCalls, 1); assert.equal((await f.candidates()).length, 1);
  assert.equal((task.payload as { kind: string }).kind, "coding");
  const canonical = await f.adapter.memory!.withCaller({ actor_id: "web-user", project_id: f.project.project_id,
    consumer: "ui", person: true, purpose: "management", current_scene: "common" }).candidates.list("project", f.project.project_id);
  assert.equal(canonical.length, 1); assert.equal(canonical[0]!.sources?.length, 1);
  assert.deepEqual(JSON.parse(canonical[0]!.sources![0]!.event_id.slice("molis-input:1:".length)),
    ["web-user", first.ref.session_id, "original", input], "SDK candidate retains the canonical Coding original identity");
  assert.equal(JSON.stringify(task.payload).includes(text), false, "durable queue carries references, never conversation text");
  const enqueue = f.adapter.schedule!.enqueue.bind(f.adapter.schedule);
  for (const mismatch of [{ project_id: "another-project" }, { plugin_id: "system.assistant" }, { install_id: "another-installation" },
    { business_session_id: "another-business-session" }, { session_id: "another-runtime-session" }, { run_id: "another-run" }]) {
    let captured: Parameters<typeof enqueue>[0] | undefined, accepted: AgentScheduledTask | undefined;
    const interception = t.mock.method(f.adapter.schedule!, "enqueue", async (input: Parameters<typeof enqueue>[0], control: Parameters<typeof enqueue>[1]) => {
      if (input.kind !== "memory.learn" || input.payload.kind !== "coding" || captured) return enqueue(input, control);
      captured = structuredClone(input);
      // Fault injection at the public Port: the true canonical key, top-level session and original live control stay intact.
      accepted = await enqueue({ ...input, payload: { ...input.payload, ...mismatch } }, control);
      return accepted;
    });
    try {
      await f.start("以后本项目统一使用 pnpm");
      const refused = await untilSetup(async () => {
        const row = accepted && f.adapter.schedule!.find(accepted.key); return row?.state === "failed" ? row : undefined;
      }, "the real memory.learn runner refuses the changed source identity");
      assert.ok(captured); assert.ok(accepted);
      assert.equal(refused.task_id, accepted.task_id); assert.equal(refused.key, captured.key);
      assert.equal(refused.session_id, captured.session_id, "the top-level queue session remains the authentic original");
      assert.deepEqual(refused.payload, { ...captured.payload, ...mismatch });
      assert.equal(f.learningCalls, 1, "project, plugin, installation, business session and Run are not interchangeable");
      assert.equal((await f.candidates()).length, 1, "each field refusal leaves the successful positive control unchanged");
    } finally { interception.mock.restore(); }
  }
  const retry = await f.start(text, input), plain = await f.start("解释一下 package.json");
  assert.notEqual(retry.ref.run_id, first.ref.run_id, "the repeated original really started a distinct direct Run");
  await new Promise(resolve => setTimeout(resolve, 6_000));
  assert.equal(f.task(retry)?.key, f.task(first)?.key, "same canonical original keeps one queue identity across Runs");
  assert.equal(f.task(retry)?.task_id, task.task_id, "same original is not independent evidence");
  assert.deepEqual(f.task(retry)?.payload, task.payload, "a retry cannot replace the accepted Run or its policy");
  assert.equal(f.task(plain), null, "no standing wish queues no extraction");
  assert.equal(f.learningCalls, 1); assert.equal((await f.candidates()).length, 1);
  assert.equal(f.task(first)?.task_id, task.task_id, "repeated observation keeps the original terminal key");
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
  await untilSetup(async () => f.task(first)?.state === "failed" ? true : undefined, "bounded queue attempts stop after revocation");
  assert.equal((await f.candidates()).length, 0);
  const plain = await f.start("以后本项目的文档统一使用中文"); assert.equal(plain.phase, "completed");
  await new Promise(resolve => setTimeout(resolve, 6_000));
  assert.equal(f.task(plain), null);
  assert.equal(f.learningCalls, 2, "optional learning permission never borrows model:invoke or affects dialogue");
});


test("M2-CODING-01: restart after a completed Coding round recovers the original through the same persisted queue", { timeout: 90_000 }, async t => {
  const f = await setup(t); await f.permission(true);
  const first = await f.start("以后本项目统一使用 pnpm");
  assert.equal(f.task(first), null, "restart before the first completion observation");
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
      while (adapter.schedule.list('memory.learn').find(task => task.payload.kind === 'coding' && task.payload.run_id === ${JSON.stringify(first.ref.run_id)})?.state !== 'done') {
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
  assert.equal(f.learningCalls, 0); assert.equal(f.task(failed), null);
  f.failCoding(false);
  const completed = await f.start(text, input);
  assert.notEqual(completed.ref.run_id, failed.ref.run_id, "the successful retry is a distinct direct Run");
  assert.deepEqual(completed.original_input!.ref, failed.original_input!.ref);
  const task = await untilSetup(async () => { const task = f.task(completed); return task?.state === "done" ? task : undefined; }, "first successful original formation");
  assert.equal(f.task(failed)?.task_id, task.task_id, "both Runs' canonical original resolves to the one actually accepted task");
  assert.equal(task.payload.run_id, completed.ref.run_id);
  assert.equal(f.learningCalls, 1); assert.equal((await f.candidates()).length, 1);
});

for (const stage of ["source", "model", "commit"] as const) {
  for (const withdrawal of ["permission", "close", "archive", "pending"] as const) {
    // The existing model test covers revoke/regrant; pending is a distinct pre-dispatch owner state.
    if (stage === "model" && withdrawal === "permission" || withdrawal === "pending" && stage !== "source") continue;
    test(`M2-CODING-03/04: ${withdrawal} while ${stage} is waiting rejects late work through the real owners`, { timeout: 90_000 }, async t => {
      const held = Promise.withResolvers<void>(), archiveHeld = Promise.withResolvers<void>();
      let entered = false, archiveEntered = false;
      t.after(() => { held.resolve(); archiveHeld.resolve(); });
      const f = await setup(t, stage === "model" ? async () => { entered = true; await held.promise; } : undefined);
      await f.permission(true);
      if (stage === "source") {
        const read = f.adapter.readOriginalInput!.bind(f.adapter);
        t.mock.method(f.adapter, "readOriginalInput", async (...args: Parameters<typeof read>) => {
          const result = await read(...args);
          if (!entered && f.adapter.schedule!.list("memory.learn").some(task => task.state === "running")) {
            entered = true; await held.promise;
          }
          return result;
        });
      }
      if (stage === "commit") {
        const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
        const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
        const storage = createNodeHost({ storageRoot: join(f.home.home, "storage-port-probe") }).storage;
        const read = storage.get;
        // RegistryStore reads the candidate's current row before its async preparation and synchronous commit fence.
        // Holding this public Host read does not delay an already-dispatched commit or change its returned data.
        t.mock.method(Object.getPrototypeOf(storage), "get", async function(this: unknown, request: { kind: string; id: string }) {
          const result = await read.call(this, request);
          if (!entered && f.learningCalls === 1 && request.kind.endsWith("memory-candidates")) {
            assert.equal(result, undefined, "the first candidate has not been committed"); entered = true; await held.promise;
          }
          return result;
        });
      }
      if (withdrawal === "pending") {
        const archive = f.adapter.sessionLifecycle!.archive.bind(f.adapter.sessionLifecycle);
        t.mock.method(f.adapter.sessionLifecycle!, "archive", async (...args: Parameters<typeof archive>) => {
          archiveEntered = true; await archiveHeld.promise; return archive(...args);
        });
      }
      const first = await f.start("以后本项目统一使用 pnpm");
      await untilSetup(async () => entered ? true : undefined, `actual ${stage} wait reached`);
      const before = f.learningCalls, task = f.task(first);
      assert.equal(before, stage === "source" ? 0 : 1);
      assert.equal(task?.state, "running", "the persisted queue accepted the original task before withdrawal");
      let closing: Promise<boolean> | undefined, archiving: Promise<void> | undefined;
      if (withdrawal === "permission") await f.permission(false);
      if (withdrawal === "close") {
        closing = f.home.host.closeProject(f.project.reference);
        await untilSetup(async () => f.home.host.projects().some(row => row.project_id === f.project.project_id && row.state === "closing") ? true : undefined, "project close started");
      }
      if (withdrawal === "archive") await f.archive();
      if (withdrawal === "pending") {
        archiving = f.archive(); archiving.catch(() => {});
        await untilSetup(async () => archiveEntered ? true : undefined, "Coding recorded its real pending archive before SDK handoff");
      }
      held.resolve();
      if (closing) assert.equal(await closing, true);
      await untilSetup(async () => f.task(first)?.state === "failed" ? true : undefined, "original bounded attempts refuse the withdrawn source");
      assert.equal(f.learningCalls, before, "withdrawal dispatches no additional extraction calls");
      if (archiving) { archiveHeld.resolve(); await archiving; }
      // Restore through the same owners only after both bounded attempts are terminal.
      if (withdrawal === "permission") await f.permission(true);
      if (withdrawal === "archive" || withdrawal === "pending") await f.unarchive();
      const overview = await f.overview(); // Reopens a closed project through its normal HTTP entry.
      assert.deepEqual(overview.candidates, []); assert.deepEqual(overview.items, []); assert.deepEqual(overview.changes, []);
      const settled = f.task(first);
      assert.equal(settled?.task_id, task!.task_id); assert.equal(settled?.state, "failed");
      assert.deepEqual(settled?.payload, task!.payload, "restoring authority cannot replace the accepted original or Run policy");
      if (stage === "source" && withdrawal === "permission") {
        const retry = await f.start("以后本项目统一使用 pnpm", first.original_input!.ref.input_id);
        assert.notEqual(retry.ref.run_id, first.ref.run_id);
        await new Promise(resolve => setTimeout(resolve, 6_000));
        assert.equal(f.learningCalls, 0); assert.equal(f.task(retry)?.state, "failed");
        assert.equal(f.task(retry)?.task_id, task!.task_id, "failed canonical key cannot revive through a new Run");
      }
    });
  }
}

test("M2-CODING-04: archive and restore during extraction cannot revive the old attempt", { timeout: 90_000 }, async t => {
  const firstResult = Promise.withResolvers<void>(), freshResult = Promise.withResolvers<void>();
  t.after(() => { firstResult.resolve(); freshResult.resolve(); });
  const f = await setup(t, attempt => attempt === 1 ? firstResult.promise : freshResult.promise);
  await f.permission(true);
  const first = await f.start("以后本项目统一使用 pnpm");
  await untilSetup(async () => f.learningCalls === 1 ? true : undefined, "first extraction reached the local server");
  await f.archive(); await f.unarchive(); firstResult.resolve();
  await untilSetup(async () => f.learningCalls === 2 ? true : undefined, "a fresh attempt may use the restored source");
  const overview = await f.overview();
  assert.deepEqual(overview.candidates, []); assert.deepEqual(overview.items, []); assert.deepEqual(overview.changes, []);
  await f.permission(false); freshResult.resolve();
  await untilSetup(async () => f.task(first)?.state === "failed" ? true : undefined, "fresh revoked attempt settles without writing");
  assert.equal(f.learningCalls, 2); assert.deepEqual((await f.overview()).candidates, []);
});

test("M2-CODING-03: reopening learning permission cannot widen the original Coding Run classification", { timeout: 90_000 }, async t => {
  const f = await setup(t); await f.permission(false);
  const restrictions = [{ selector: { consumer: "agent", current_scene: "coding" }, read: "inherit", form: "off" }];
  const prefs = (scope: string, class_restrictions: typeof restrictions) => f.home.web.post(`/projects/${f.project.project_id}/api/memory/prefs`,
    { scope, prefs: { class_restrictions } });
  for (const scope of ["personal", "project"]) await prefs(scope, restrictions);
  const first = await f.start("以后本项目统一使用 pnpm");
  assert.deepEqual(first.class_restrictions?.personal, restrictions); assert.deepEqual(first.class_restrictions?.project, restrictions);
  for (const scope of ["personal", "project"]) await prefs(scope, []);
  await f.permission(true);
  await new Promise(resolve => setTimeout(resolve, 6_000));
  assert.equal(f.task(first), null, "worthLearning refuses the frozen form-off Run before queue admission");
  assert.equal(f.learningCalls, 0); assert.deepEqual((await f.overview()).candidates, []);
  assert.deepEqual((await f.adapter.read(first.ref)).class_restrictions?.project, restrictions);
  const next = await f.start("以后本项目的文档统一使用中文");
  assert.notEqual(next.original_input!.ref.input_id, first.original_input!.ref.input_id, "the later permission applies to a genuinely new original");
  assert.deepEqual(next.class_restrictions?.project, []);
  await untilSetup(async () => f.task(next)?.state === "done" ? true : undefined, "new original uses its own current classification");
  assert.equal(f.learningCalls, 1); assert.equal((await f.overview()).candidates.length, 1);
  assert.equal(f.task(first), null, "the old Run was never accepted retroactively");
});
