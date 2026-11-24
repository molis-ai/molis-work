import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentQueuedInput, AgentSteerReceipt } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";
import { codingToolResponse } from "./fixtures/coding-sdk-runtime.js";

const prefix = "/api/plugins/io.molis.work.coding";
type Host = Awaited<ReturnType<typeof codingProductHost>>;
async function material(f: Host, text: string) {
  const admitted = await f.call<{ item: { item_id: string } }>(f.project.project_id, "/api/platform/shelf/items", { filename: "selected.md", bytes_base64: Buffer.from(text).toString("base64") });
  assert.equal(admitted.status, 200, JSON.stringify(admitted.body));
  const path = `/api/platform/shelf/items/${admitted.body.item.item_id}/project-material`;
  const preview = await f.call<{ fingerprint: string }>(f.project.project_id, path);
  const pinned = await f.call<{ reference: ArtifactReference }>(f.project.project_id, path, { expected_fingerprint: preview.body.fingerprint });
  assert.equal(pinned.status, 200, JSON.stringify(pinned.body));
  return { ref: { subject: { kind: "artifact", id: artifactSubjectId(pinned.body.reference) }, pin: { mode: "fixed", version: pinned.body.reference } }, title: "材".repeat(1000) };
}

async function session(f: Host) {
  const created = await f.call<{ session: { session_id: string } }>(f.project.project_id, prefix + "/sessions", {});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const path = `${prefix}/sessions/${created.body.session.session_id}`;
  const start = async (extra: Record<string, unknown> = {}) => {
    const result = await f.call<{ run: { ref: AgentRunRef } }>(f.project.project_id, path + "/runs", {
      task: "核对所选材料", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model", ...extra,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.run.ref;
  };
  return { path, start, view: () => f.call<{ session: { queued_inputs: AgentQueuedInput[]; runtime_session_id: string | null; state: string; queued: { note?: string } | null }; runs: AgentRunView[] }>(f.project.project_id, path) };
}

for (const mode of ["next-boundary", "interrupt"] as const) test(`QEA-43: ${mode} reads the selected material before delivering one supplement to a real active Run`, { timeout: 60_000 }, async t => {
  const release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  const f = await codingProductHost(t, async (_request, turn) => {
    if (turn === 1) { await release.promise; return codingToolResponse("read", { path: "notes.md" }); }
    return cogniaModelResponse("已采用所选材料。");
  }, { loopbackProvider: true });
  await writeFile(join(f.directory, "notes.md"), "这一轮读取的工作区文件");
  const picked = await material(f, `实际 ${mode} 材料正文`), s = await session(f), run = await s.start();
  await untilSetup(async () => f.requests.length ? true : undefined, "the original model call is in flight");
  const text = "  本人补充原句，不是材料的作者。  ", id = randomUUID();
  const sent = await f.call<{ receipt: AgentSteerReceipt }>(f.project.project_id, s.path + "/control", { kind: "steer", run_id: run.run_id, text, mode, key: `send.${id}`, materials: [picked], original_input: { input_id: id, text, use: "supplement" } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body)); assert.equal(sent.body.receipt.delivered, "run");
  release.resolve(); const ended = await f.ended(run); assert.equal(ended.phase, "completed", ended.stop_reason);
  const supplements = ended.turns.filter(turn => turn.steer?.key === `send.${id}`);
  assert.equal(supplements.length, 1);
  assert.equal(supplements[0]!.steer!.source, "host");
  assert.deepEqual(supplements[0]!.steer!.original, { text, source: "person" });
  assert.ok(supplements[0]!.text.includes(`实际 ${mode} 材料正文`));
  assert.ok(JSON.stringify(f.requests.slice(1)).includes(`实际 ${mode} 材料正文`), "the material reached an actual subsequent SDK model request");
});

test("QEA-42 QEA-43: a selected fixed material and its 1000-character title reach a real first Run and an after-run supplement with one personal original", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("已核对。")), picked = await material(f, "共享来源的固定正文：青松与白鹭。"), s = await session(f);
  const first = await f.ended(await s.start({ materials: [picked] }));
  assert.equal(first.phase, "completed", first.stop_reason);
  assert.equal(first.frozen.text_materials[0]!.source_version, 1);
  assert.ok(JSON.stringify(f.requests).includes("青松与白鹭"));
  const raw = "  本人补充：请带上来源。\r\n保留这段原话。  ", inputId = randomUUID();
  const send = { kind: "steer", run_id: first.ref.run_id, text: raw, key: `send.${inputId}`, mode: "after-run", materials: [picked], original_input: { input_id: inputId, text: raw, use: "supplement" } };
  const accepted = await f.call<{ receipt: AgentSteerReceipt }>(f.project.project_id, s.path + "/control", send);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const adapter = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue"), ref = { session_id: first.ref.session_id, input_id: accepted.body.receipt.input_id };
  const queued = await adapter.inputs!.read!(ref);
  assert.ok(queued?.state === "queued");
  assert.equal(queued.input.source, "host");
  assert.deepEqual(queued.input.original, { text: raw, source: "person" });
  assert.ok(queued.input.text.includes("青松与白鹭"));
  const repeated = await f.call<{ receipt: AgentSteerReceipt }>(f.project.project_id, s.path + "/control", send);
  assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
  assert.equal(repeated.body.receipt.replayed, true);
  assert.equal(repeated.body.receipt.input_id, ref.input_id);
  assert.equal((await s.view()).body.session.queued_inputs.length, 1);
  const next = await f.ended(await s.start());
  assert.equal(next.phase, "completed", next.stop_reason);
  const delivered = await adapter.inputs!.read!(ref);
  assert.ok(delivered?.state === "run");
  assert.equal(delivered.run.run_id, next.ref.run_id);
  assert.deepEqual(delivered.receipt.original, { text: raw, source: "person" });
  const wire = JSON.stringify(f.requests.at(-1));
  assert.ok(wire.includes("青松与白鹭"));
  assert.equal(wire.split("本人补充：请带上来源").length - 1, 1, "raw original is evidence, not a second model message");
});

test("QEA-44: a real overlapping round refuses unreadable materials before queue writes and rereads admitted materials when the wait ends", { timeout: 60_000 }, async t => {
  const release = Promise.withResolvers<void>(); t.after(() => release.resolve());
  const f = await codingProductHost(t, async (_request, turn) => { if (turn === 1) await release.promise; return cogniaModelResponse("完成 src/label.ts 核对。"); });
  const picked = await material(f, "等待时仍须有读取权限的材料。"), first = await session(f), waiting = await session(f);
  const active = await first.start({ task: "核对 src/label.ts 的格式" });
  await untilSetup(async () => f.requests.length ? true : undefined, "first real SDK round is waiting for its provider");
  const task = { task: "再核对 src/label.ts 的说明", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model", materials: [picked] };
  const overlaps = await f.call<{ overlaps: Array<{ work_id: string }> }>(f.project.project_id, waiting.path + "/scope-check", task);
  assert.equal(overlaps.status, 200, JSON.stringify(overlaps.body)); assert.equal(overlaps.body.overlaps.length, 1);
  const send = { ...task, wait_for: overlaps.body.overlaps[0]!.work_id };
  const adapter = ensureSystemAgentService(f.host, f.home).agentHost.adapter("prologue");
  const before = await waiting.view(), work = await adapter.projectWork!.read(f.project.project_id);
  assert.equal(before.body.session.runtime_session_id, null);
  assert.equal((await f.call(f.project.project_id, "/api/knowledge/exclude", { subject: picked.ref.subject, excluded: true })).status, 200);
  const refused = await f.call<{ code: string }>(f.project.project_id, waiting.path + "/runs", send);
  assert.equal(refused.status, 400, JSON.stringify(refused.body)); assert.equal(refused.body.code, "coding.material_unreadable");
  assert.deepEqual((await waiting.view()).body.session, before.body.session, "no runtime binding, title change, queue or state write on refused send");
  assert.deepEqual((await adapter.projectWork!.read(f.project.project_id)).items, work.items, "no SDK queue item");
  assert.equal(f.requests.length, 1);
  assert.equal((await f.call(f.project.project_id, "/api/knowledge/exclude", { subject: picked.ref.subject, excluded: false })).status, 200);
  const queued = await f.call(f.project.project_id, waiting.path + "/runs", send);
  assert.equal(queued.status, 200, JSON.stringify(queued.body));
  assert.equal((await waiting.view()).body.session.state, "queued");
  assert.equal((await adapter.projectWork!.read(f.project.project_id)).items.length, work.items.length + 1);
  // No cached successful read authorizes the later start.
  assert.equal((await f.call(f.project.project_id, "/api/knowledge/exclude", { subject: picked.ref.subject, excluded: true })).status, 200);
  release.resolve(); await f.ended(active);
  const stopped = await untilSetup(async () => { const view = await waiting.view(); return view.body.session.queued?.note ? view.body : undefined; }, "queued round reports its now-unreadable material");
  assert.equal(stopped.runs.length, 0);
  assert.equal(f.requests.length, 1, "revoked queued material starts no model");
  assert.equal((await f.call(f.project.project_id, waiting.path + "/queued", { action: "cancel" })).status, 200);
});

test("QEA-43: missing, excluded and oversize supplement materials write no runtime input or original and invoke no model", { timeout: 60_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("已核对。")), picked = await material(f, "正文已被本人从 Agent 可读范围排除。"), s = await session(f);
  const first = await f.ended(await s.start());
  const calls = f.requests.length, before = (await s.view()).body;
  const excluded = await f.call(f.project.project_id, "/api/knowledge/exclude", { subject: picked.ref.subject, excluded: true });
  assert.equal(excluded.status, 200, JSON.stringify(excluded.body));
  const commands = [
    { text: "读被排除材料", materials: [picked] },
    { text: "读不存在材料", materials: [{ ref: { subject: { kind: "todo.item", id: "missing" }, pin: { mode: "current", read_revision: "missing-revision" } }, title: "不存在" }] },
  ];
  for (const command of commands) {
    const id = randomUUID(), refused = await f.call<{ code: string }>(f.project.project_id, s.path + "/control", { kind: "steer", run_id: first.ref.run_id, key: `send.${id}`, mode: "after-run", ...command,
      original_input: { input_id: id, text: command.text, use: "supplement" } });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(refused.body.code, "coding.material_unreadable", JSON.stringify(refused.body));
  }
  assert.equal((await f.call(f.project.project_id, "/api/knowledge/exclude", { subject: picked.ref.subject, excluded: false })).status, 200);
  const text = "x".repeat(100_000), id = randomUUID();
  const oversize = await f.call(f.project.project_id, s.path + "/control", { kind: "steer", run_id: first.ref.run_id, text, key: `send.${id}`, mode: "after-run", materials: [picked], original_input: { input_id: id, text, use: "supplement" } });
  assert.equal(oversize.status, 400, JSON.stringify(oversize.body));
  const after = (await s.view()).body;
  assert.deepEqual(after.session.queued_inputs, before.session.queued_inputs);
  assert.deepEqual(after.runs, before.runs, "no refused supplement or claimed original enters the Run ledger");
  assert.equal(f.requests.length, calls);
});
