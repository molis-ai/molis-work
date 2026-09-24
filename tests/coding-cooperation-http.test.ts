import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("委派与交付：只由对应一方推进，发送即开始，交付可退回再交，收下后成为下一轮材料；结束后的答复只记录；重启后回执不变", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-cooperation-http-")), dbPath = join(root, "board.db");
  seedDemoBoard(dbPath); let store = new LocalProjectDatabase(dbPath);
  new CodingSessionStore(store.db).create({ board_id: DEMO_BOARD_ID, session_id: "A", title: "发起的会话", runtime_id: "prologue", at: new Date().toISOString() });
  const at = new Date().toISOString(), runs = new Map<string, { ref: { session_id: string; run_id: string } }>();
  const view = (ref: { session_id: string; run_id: string }) => ({ ref, phase: "completed", started_at: at, ended_at: at,
    frozen: { role_id: "builder", role_version: 1, execution: "workspace-write", model_id: "m", prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null, directory: { canonical_path: root, realpath_verified: true } },
    turns: [{ turn_id: "u", kind: "user", text: "补测试", at }, { turn_id: "a", kind: "assistant", text: "三个测试已补，全部通过。", at }],
    activity: [], usage: { tokens: { input: 10, output: 5 } }, awaiting_input: [], command_outputs: [] });
  const host = () => ({ store, boardId: DEMO_BOARD_ID, actorId: "web-user", goalTitle: () => undefined,
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    execution: { ready: async () => {}, models: async () => [{ provider_id: "p", model_id: "m", label: "fixture" }] },
    capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      const input = args as any[];
      if (definition.capability_id === projectsCapabilities.listWorkspaces.capability_id) return [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as Output;
      if (definition.capability_id === agent.availableRoles.capability_id) return [{ role_id: "builder", available: true }] as Output;
      if (definition.capability_id === agent.createSession.capability_id) return { runtime_id: "prologue", session_id: "sdk-C" } as Output;
      if (definition.capability_id === agent.startRun.capability_id) { const ref = { session_id: "sdk-C", run_id: `r${runs.size + 1}` }; runs.set(ref.run_id, { ref }); return { ref, frozen: view(ref).frozen } as Output; }
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [...runs.values()].map(run => run.ref) } as Output;
      if (definition.capability_id === agent.readRun.capability_id) return view(input[1]) as Output;
      if (definition.capability_id === agent.listSubagents.capability_id) return [] as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } });
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://localhost"), host()).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const call = async (path: string, method = "GET", body?: unknown) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${path}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    return { status: result.status, body: await result.json() };
  };
  try {
    const configuration = { intent: "execute", provider_id: "p", model_id: "m", workspace_id: "w" };
    assert.equal((await call("/sessions/A", "PATCH", { configuration })).status, 200);
    const made = await call("/sessions/A/delegations", "POST", { title: "补测试", task: "为 checkInCount 补三个边界测试" });
    assert.equal(made.status, 200, JSON.stringify(made.body));
    const id = made.body.delegation.delegation_id, C = made.body.session.session_id;
    assert.equal(made.body.delegation.state, "delivered");
    const target = (await call(`/sessions/${C}`)).body;
    assert.equal(target.draft, "为 checkInCount 补三个边界测试", "the task waits as a draft; nothing runs");
    assert.deepEqual(target.configuration, configuration, "the work happens where the asking session works");
    assert.equal(runs.size, 0);

    assert.equal((await call(`/sessions/A/delegations/${id}`, "POST", { action: "accept" })).status, 400, "only the receiving session accepts");
    assert.equal((await call(`/sessions/${C}/delegations/${id}`, "POST", { action: "cancel" })).status, 400, "only the asking session cancels");
    assert.equal((await call(`/sessions/${C}/delegations/${id}`, "POST", { action: "reject" })).status, 400, "a refusal says why");
    assert.equal((await call(`/sessions/${C}/delegations/${id}/deliveries`, "POST", { run_id: "r1", kind: "report" })).status, 400, "nothing to deliver before a round ran");

    const started = await call(`/sessions/${C}/runs`, "POST", { task: target.draft, intent: "execute", provider_id: "p", model_id: "m", workspace_id: "w" });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    let seen = (await call(`/sessions/A/delegations`)).body.outgoing[0];
    assert.equal(seen.state, "committing");
    assert.deepEqual(seen.receipts.map((receipt: { event: string }) => receipt.event), ["submitted", "delivered", "accepted", "started"]);
    assert.equal(seen.receipts[2].note, "发送第一轮即视为接受");

    const first = await call(`/sessions/${C}/delegations/${id}/deliveries`, "POST", { run_id: "r1", kind: "report", note: "已补三个测试" });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const delivery = first.body.delegation.deliveries[0];
    assert.equal(delivery.artifact.artifact_id, `coding-report:${encodeURIComponent(C)}:r1`, "the round's report was fixed and handed over");
    assert.equal((await call(`/sessions/A/delegations/${id}/deliveries/${delivery.delivery_id}`, "POST", { decision: "reject" })).status, 400);
    const back = await call(`/sessions/A/delegations/${id}/deliveries/${delivery.delivery_id}`, "POST", { decision: "reject", reason: "缺少跨习惯的用例" });
    assert.equal(back.body.delegation.state, "committing", "a returned delivery leaves the work with the other session");
    const incoming = (await call(`/sessions/${C}/delegations`)).body.incoming;
    assert.equal(incoming.deliveries[0].reason, "缺少跨习惯的用例", "the receiving side sees why");

    await call(`/sessions/${C}/runs`, "POST", { task: "补上跨习惯的用例", intent: "execute", provider_id: "p", model_id: "m", workspace_id: "w" });
    const second = await call(`/sessions/${C}/delegations/${id}/deliveries`, "POST", { run_id: "r2", kind: "report", note: "补了跨习惯" });
    const again = second.body.delegation.deliveries[1];
    const taken = await call(`/sessions/A/delegations/${id}/deliveries/${again.delivery_id}`, "POST", { decision: "accept" });
    assert.equal(taken.status, 200, JSON.stringify(taken.body));
    assert.equal(taken.body.delegation.state, "completed");
    const materials = (await call("/sessions/A")).body.materials;
    assert.deepEqual(materials, [again.artifact], "what was taken is attached to the next round, at its fixed version");
    const choices = (await call("/sessions/A/materials")).body.materials;
    const cited = choices.find((choice: { reference: { artifact_id: string } }) => choice.reference.artifact_id === again.artifact.artifact_id);
    assert.match(cited.title, /^会话「委派：补测试」 \/ 报告 \//);
    assert.match(cited.text, /只读引用固定版本/);

    const late = await call(`/sessions/A/delegations/${id}`, "POST", { action: "cancel" });
    assert.equal(late.status, 400); assert.match(late.body.error, /这次操作只记录，不改变结果/);

    await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); store = new LocalProjectDatabase(dbPath);
    seen = (await call(`/sessions/A/delegations`)).body.outgoing[0];
    assert.equal(seen.state, "completed", "state survives a restart");
    assert.deepEqual(seen.receipts.map((receipt: { event: string; recorded_only?: boolean }) => receipt.event + (receipt.recorded_only ? "*" : "")),
      ["submitted", "delivered", "accepted", "started", "delivery-sent", "delivery-rejected", "delivery-sent", "delivery-accepted", "cancelled*"]);
    const related = (await call(`/sessions/A/delegations`)).body.related;
    assert.deepEqual(related.map((item: { session_id: string; relation: string[] }) => [item.session_id, item.relation]), [[C, ["你委派给它", "你引用了它的成果"]]]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
