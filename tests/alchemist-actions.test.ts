import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { alchemistActions as a } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";

async function fixture(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "alchemist-actions-")), f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const api = async (path: string, method = "GET", body?: unknown) => {
    const response = await f.runtime.app.request(`http://localhost/api/v1${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
    const value = await response.json(); assert.ok(response.ok, `${response.status}: ${JSON.stringify(value)}`); return value as any;
  };
  return { ...f, home, api, call: f.bound.invoke.bind(f.bound) };
}

test("Alchemist unified operations preserve direction → cards → research → decision and calibration; HTTP sees the same data", async t => {
  const f = await fixture(t), call = f.call;
  assert.equal((await f.bound.discover()).length, Object.keys(a).length);
  assert.equal(f.requests.length, 0);
  assert.deepEqual((await call(a.bootstrap, {})).directions, []);
  const { direction } = await call(a.directionCreate, { title: "访谈证据", description: "让独立创始人整理访谈中的真实证据" });
  assert.equal((await f.api("/bootstrap")).directions[0].id, direction.id);
  await f.api(`/directions/${direction.id}`, "PATCH", { title: "修改后的方向", description: "让独立创始人整理访谈中的真实证据" });
  assert.equal((await call(a.bootstrap, {})).directions[0]!.title, "修改后的方向");
  await call(a.directionStatus, { id: direction.id, status: "archived" });
  await assert.rejects(call(a.explorationStart, { id: direction.id }), { code: "DIRECTION_ARCHIVED" });
  await call(a.directionStatus, { id: direction.id, status: "active" });
  const receipt = await call(a.explorationStart, { id: direction.id }); await f.runtime.runPending();
  assert.equal((await call(a.explorationStart, { id: direction.id, reuseExisting: true })).runId, receipt.runId);
  const { exploration } = await call(a.explorationGet, { id: receipt.runId }); assert.equal(exploration.status, "completed");
  assert.equal((await call(a.cardGet, { id: exploration.cards[0]!.id })).kind, "candidate");
  const second = exploration.cards[1]!.id;
  assert.equal((await call(a.cardDiscard, { id: second })).card.status, "discarded");
  assert.equal((await call(a.cardRestore, { id: second })).card.status, "candidate");
  const kept = await call(a.cardKeep, { id: exploration.cards[0]!.id }), id = kept.idea.id;
  await assert.rejects(call(a.cardKeep, { id: exploration.cards[0]!.id }), { code: "IDEA_CARD_ALREADY_KEPT", details: { recovery: "打开已有 Idea 继续查看。", ideaId: id } });
  assert.equal((await call(a.cardGet, { id: exploration.cards[0]!.id })).kind, "idea_redirect");
  assert.equal((await call(a.ideaGet, { id, version: 1 })).version.content.title, "证据卡");
  assert.equal((await call(a.models, {})).models[0]!.id, f.model.id);
  await call(a.settingsUpdate, { modelId: f.model.id, modelPolicy: "fixed", defaultBudgets: { marketSpace: { kind: "calls", limit: 3 }, buildCost: { kind: "calls", limit: 3 } } });
  assert.equal((await call(a.settingsVerify, {})).configured, true); assert.equal((await call(a.settingsGet, {})).modelId, f.model.id);
  assert.equal((await call(a.decisionGet, { id, version: 1 })).gate.ready, false);
  await assert.rejects(call(a.decisionCreate, { id, version: 1, outcome: "hold", reason: "等待材料" }), { code: "DECISION_REPORTS_INCOMPLETE" });
  for (const lens of ["market_space", "build_cost"] as const) {
    const { plan } = await call(a.researchPlan, { id, lens, ideaVersion: 1, modelPolicy: "fixed", modelId: f.model.id, budget: { kind: "calls", limit: 3 } });
    const { run } = await call(a.researchStart, { id, lens, planId: plan.id });
    await f.runtime.runPending();
    const events = await call(a.runEvents, { id: run.jobId }); assert.equal(events.status, "completed");
    assert.equal(events.events.at(-1)!.type, "completed");
    assert.deepEqual((await call(a.runEvents, { id: run.jobId, after: events.cursor })).events, []);
    const stream = await f.runtime.app.request(`http://localhost/api/v1/runs/${run.jobId}/events`);
    assert.match(await stream.text(), /event: completed/);
  }
  const research = await call(a.researchGet, { id, version: 1 });
  assert.equal(research.lenses.market_space.status, "completed"); assert.equal(research.lenses.build_cost.status, "completed");
  const report = research.lenses.market_space.report!;
  const { annotation } = await call(a.annotationCreate, { target: { kind: "lens_report", objectId: report.id, revision: report.revision, blockId: "summary" }, quotedSnapshot: report.summary, comment: "下次增加独立访谈" });
  assert.equal((await call(a.annotationsList, { kind: "lens_report", objectId: report.id, revision: 1 })).annotations[0]!.id, annotation.id);
  const { proposal } = await call(a.playbookPropose, { id: annotation.id, methodChange: "优先查找独立访谈", positiveExamples: ["直接用户反馈"], negativeExamples: ["推广软文"], scopeKind: "direction" });
  const applied = await call(a.proposalApply, { id: proposal.id }); assert.equal(applied.proposal.status, "applied");
  await assert.rejects(call(a.proposalApply, { id: proposal.id }), { code: "ACTION_PROPOSAL_NOT_PENDING" });
  assert.equal((await call(a.memoryGet, {})).playbook[0]!.id, applied.rule.id);
  await call(a.playbookDisable, { id: applied.rule.id });
  const other = await call(a.annotationCreate, { target: { kind: "idea_brief", objectId: id, revision: 1, blockId: "title" }, quotedSnapshot: "证据卡", comment: "已核对" });
  assert.equal((await call(a.annotationResolve, { id: other.annotation.id })).annotation.status, "resolved");
  const { rule } = await call(a.tasteCreate, { title: "单人产品", statement: "先满足单人使用", appliesTo: "产品构思", exceptions: [] });
  const conversation = await call(a.conversationSend, { body: "这个方向的风险是什么", context: { kind: "idea", label: "证据卡", ideaId: id, version: 1, panel: "brief" } });
  assert.ok("assistantMessage" in conversation); assert.equal(conversation.assistantMessage.responseState, "complete");
  assert.equal((await call(a.conversationList, {})).messages.length, 2);
  assert.equal(JSON.parse(f.requests.at(-1)!.userPrompt).founderTaste[0].statement, rule.statement);
  await call(a.tasteDisable, { id: rule.id });
  const { decision } = await call(a.decisionCreate, { id, version: 1, outcome: "hold", reason: "先补充用户访谈", revisitCondition: "三次独立访谈后" });
  assert.equal(decision.reportBindings.length, 2);
  assert.equal((await call(a.decisionGet, { id, version: 1 })).decision!.id, decision.id);
  const decisions = await call(a.decisionsList, {}); assert.equal(decisions.log[0]!.id, decision.id); assert.ok(decisions.activities.some(item => item.kind === "annotation.created"));
  assert.equal((await f.api(`/ideas/${id}/versions/1/decision`)).decision.id, decision.id);
});

test("Alchemist Pulse, cancellation and exports use real repositories and preserve compatibility HTTP statuses", async t => {
  const f = await fixture(t), call = f.call;
  assert.ok((await call(a.pulseSources, {})).sources.some(item => item.sourceId === "github"));
  await call(a.pulseSourceUpdate, { sourceId: "github", enabled: false });
  await assert.rejects(call(a.pulseStart, { sourceIds: ["github"] }), { code: "PULSE_NO_ENABLED_SOURCES" });
  await call(a.pulseSourceUpdate, { sourceId: "github", enabled: true });
  const pulse = await call(a.pulseStart, { sourceIds: ["github"] }); await f.runtime.runPending();
  assert.equal((await call(a.runEvents, { id: pulse.run.jobId })).status, "completed");
  const reports = await call(a.pulseReports, {}); assert.equal(reports.latestRun!.id, pulse.run.id); assert.ok(reports.reports[0]!.signals.length);
  const opportunity = reports.reports[0]!.opportunities[0]!;
  assert.equal((await call(a.opportunitySave, { id: opportunity.id })).opportunity.status, "saved_for_later");
  const first = await f.runtime.app.request(`http://localhost/api/v1/opportunities/${opportunity.id}/convert`, { method: "POST" });
  assert.equal(first.status, 201); const converted = await first.json() as any;
  const reused = await call(a.opportunityConvert, { id: opportunity.id }); assert.equal(reused.created, false); assert.equal(reused.direction.id, converted.direction.id);
  assert.equal((await f.runtime.app.request(`http://localhost/api/v1/opportunities/${opportunity.id}/convert`, { method: "POST" })).status, 200);
  const receipt = await call(a.explorationStart, { id: reused.direction.id }); await f.runtime.runPending();
  const cards = (await call(a.explorationGet, { id: receipt.runId })).exploration.cards;
  const { idea } = await call(a.cardKeep, { id: cards[0]!.id });
  const { plan } = await call(a.researchPlan, { id: idea.id, lens: "market_space", ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 3 } });
  const { run } = await call(a.researchStart, { id: idea.id, lens: "market_space", planId: plan.id });
  assert.equal((await call(a.runCancel, { id: run.jobId })).run.status, "cancelled");
  const callsBefore = f.requests.length; await f.runtime.runPending(); assert.equal(f.requests.length, callsBefore);
  assert.equal((await call(a.runEvents, { id: run.jobId })).status, "cancelled");
  const exported = await call(a.workspaceExport, { format: "json" });
  const data = JSON.parse(Buffer.from(exported.content, "base64").toString());
  assert.equal(data.data.directions[0].id, reused.direction.id); assert.equal(data.data.decisions.length, 0);
  assert.ok(data.data.activity_events.some((item: any) => item.kind === "workspace.exported"));
  const zip = await f.runtime.app.request("http://localhost/api/v1/workspace/export?format=zip", { method: "POST" });
  assert.equal(zip.headers.get("content-type"), "application/zip"); assert.match(zip.headers.get("content-disposition")!, /\.zip/);
  const bytes = Buffer.from(await zip.arrayBuffer()); assert.equal(bytes.readUInt32LE(0), 0x04034b50); assert.ok(bytes.includes(Buffer.from(reused.direction.id)));
});

test("Alchemist Kernel validates authority and schemas before side effects; HTTP cannot bypass the injected invoker", async t => {
  const f = await fixture(t);
  await assert.rejects(f.service.invoke({ ...f.caller, project_id: "b" }, a.directionCreate, { description: "不得创建到其他项目的方向" }));
  await assert.rejects(f.service.invoke({ ...f.caller, permissions: ["alchemist:read"] }, a.directionCreate, { description: "缺少写权限不能创建方向" }), { code: "actions.forbidden" });
  for (const input of [{ description: "有效方向描述但是带有伪造身份", actor_id: "other" }, { description: "短" }, { description: "有效方向描述", project_id: "b" }]) {
    await assert.rejects(f.call(a.directionCreate, input as never), { code: "actions.input_invalid" });
  }
  assert.equal((await f.call(a.bootstrap, {})).directions.length, 0);
  const { direction } = await f.call(a.directionCreate, { description: "一个用于验证路径覆盖防护的方向" });
  assert.equal((await f.runtime.app.request(`http://localhost/api/v1/directions/${direction.id}`, { method: "PATCH", body: JSON.stringify({ id: "another", description: "无法覆盖这个路径的方向" }) })).status, 400);
  await assert.rejects(f.call(a.researchPlan, { id: "missing", lens: "market_space", ideaVersion: 1, modelPolicy: "fixed", budget: { kind: "calls", limit: 3 } }), { code: "RESEARCH_PLAN_INVALID" });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(f.service.invoke({ ...f.caller, signal: aborted.signal }, a.directionCreate, { description: "取消后不得产生新方向记录" }));
  assert.equal((await f.call(a.bootstrap, {})).directions.length, 1);
});

test("Alchemist aborting an event observer leaves its job intact; cancelled conversation cannot publish a late model answer", async t => {
  const f = await fixture(t);
  const { direction } = await f.call(a.directionCreate, { description: "验证观察窗口关闭不会取消后台研究" });
  const receipt = await f.call(a.explorationStart, { id: direction.id });
  const observer = new AbortController();
  const response = await f.runtime.app.request(`http://localhost/api/v1/runs/${receipt.jobId}/events`, { signal: observer.signal });
  const reader = response.body!.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: queued/);
  observer.abort(); await reader.cancel();
  assert.equal((await f.call(a.runEvents, { id: receipt.jobId! })).status, "queued");
  await f.runtime.runPending();
  assert.equal((await f.call(a.runEvents, { id: receipt.jobId! })).status, "completed");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController();
  f.ai.generate = async () => { entered.resolve(); await release.promise; return { text: '{"reply":"迟到的成功回复"}', runtimeLabel: "fixture" }; };
  const pending = f.service.invoke({ ...f.caller, signal: abort.signal }, a.conversationSend, { body: "这次讨论取消", context: { kind: "direction", label: direction.title, directionId: direction.id } });
  await entered.promise;
  abort.abort(); release.resolve(); await pending;
  const messages = (await f.call(a.conversationList, {})).messages;
  assert.equal(messages[0]!.body, "这次讨论取消"); assert.equal(messages[1]!.responseState, "failed");
  assert.ok(messages.every(message => message.body !== "迟到的成功回复"));
});
