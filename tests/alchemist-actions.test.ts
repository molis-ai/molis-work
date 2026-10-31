import { alchemistOutput } from "./fixtures/alchemist-output.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { alchemistActions as a, alchemistManifest, ALCHEMIST_ACTION_PERMISSIONS, ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_EN, createAlchemistHttpApp } from "@molis-ai/molis-work-plugin-alchemist";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
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
  await assert.rejects(call(a.explorationStart, { id: direction.id }), { code: "alchemist.direction_archived" });
  await call(a.directionStatus, { id: direction.id, status: "active" });
  const receipt = await call(a.explorationStart, { id: direction.id }); await f.runtime.runPending();
  assert.equal((await call(a.explorationStart, { id: direction.id, reuseExisting: true })).runId, receipt.runId);
  const { exploration } = await call(a.explorationGet, { id: receipt.runId }); assert.equal(exploration.status, "completed");
  assert.equal((await call(a.cardGet, { id: exploration.cards[0]!.id })).kind, "candidate");
  const second = exploration.cards[1]!.id;
  assert.equal((await call(a.cardDiscard, { id: second })).card.status, "discarded");
  assert.equal((await call(a.cardRestore, { id: second })).card.status, "candidate");
  const kept = await call(a.cardKeep, { id: exploration.cards[0]!.id }), id = kept.idea.id;
  await assert.rejects(call(a.cardKeep, { id: exploration.cards[0]!.id }), { code: "alchemist.idea_card_already_kept", details: { recovery: "打开已有 Idea 继续查看。", ideaId: id } });
  assert.equal((await call(a.cardGet, { id: exploration.cards[0]!.id })).kind, "idea_redirect");
  assert.equal((await call(a.ideaGet, { id, version: 1 })).version.content.title, "证据卡");
  // What search lists can be read back (contextual-interaction plugin-read audit): the direction with its kept Ideas, and the Idea's current version.
  const directionContext = await call(a.directionContext, { subject_id: direction.id });
  assert.equal(directionContext.title, "修改后的方向");
  assert.match(directionContext.content, /让独立创始人整理访谈中的真实证据[\s\S]*已保留的 Idea：\n- 证据卡/);
  assert.deepEqual(directionContext.open, { surface: "alchemist", id: direction.id });
  const ideaContext = await call(a.ideaContext, { subject_id: id });
  assert.equal(ideaContext.title, "证据卡");
  assert.match(ideaContext.revision, /^1:/);
  assert.match(ideaContext.content, /第 1 版/);
  assert.deepEqual(ideaContext.open, { surface: "alchemist", id });
  await assert.rejects(call(a.directionContext, { subject_id: "missing" }), { code: "alchemist.direction_not_found" });
  await assert.rejects(call(a.ideaContext, { subject_id: "missing" }), { code: "alchemist.idea_not_found" });
  assert.equal((await call(a.models, {})).models[0]!.id, f.model.id);
  await call(a.settingsUpdate, { modelId: f.model.id, modelPolicy: "fixed", defaultBudgets: { marketSpace: { kind: "calls", limit: 3 }, buildCost: { kind: "calls", limit: 3 } } });
  assert.equal((await call(a.settingsVerify, {})).configured, true); assert.equal((await call(a.settingsGet, {})).modelId, f.model.id);
  // J5B-01/J5B-02: a blocked decision keeps its cause and creates no decision.
  assert.equal((await call(a.decisionGet, { id, version: 1 })).gate.ready, false);
  await assert.rejects(call(a.decisionCreate, { id, version: 1, outcome: "hold", reason: "等待材料" }), { code: "alchemist.decision_reports_incomplete", message: "两条兼容研究材料尚未齐全。" });
  for (const lens of ["market_space", "build_cost"] as const) {
    const { plan } = await call(a.researchPlan, { id, lens, ideaVersion: 1, modelPolicy: "fixed", modelId: f.model.id, budget: { kind: "calls", limit: 3 } });
    const { run } = await call(a.researchStart, { id, lens, planId: plan.id });
    await f.runtime.runPending();
    const events = await call(a.runEvents, { id: run.jobId }); assert.equal(events.status, "completed");
    assert.equal(events.events.at(-1)!.type, "completed");
    assert.deepEqual((await call(a.runEvents, { id: run.jobId, after: events.cursor })).events, []);
  }
  const research = await call(a.researchGet, { id, version: 1 });
  assert.equal(research.lenses.market_space.status, "completed"); assert.equal(research.lenses.build_cost.status, "completed");
  const report = research.lenses.market_space.report!;
  const { annotation } = await call(a.annotationCreate, { target: { kind: "lens_report", objectId: report.id, revision: report.revision, blockId: "summary" }, quotedSnapshot: report.summary, comment: "下次增加独立访谈" });
  assert.equal((await call(a.annotationsList, { kind: "lens_report", objectId: report.id, revision: 1 })).annotations[0]!.id, annotation.id);
  const { proposal } = await call(a.playbookPropose, { id: annotation.id, methodChange: "优先查找独立访谈", positiveExamples: ["直接用户反馈"], negativeExamples: ["推广软文"], scopeKind: "direction" });
  const applied = await call(a.proposalApply, { id: proposal.id }); assert.equal(applied.proposal.status, "applied");
  // J5A-01/J5A-03: the production action refuses a second application.
  await assert.rejects(call(a.proposalApply, { id: proposal.id }), { code: "alchemist.action_proposal_not_pending", message: "这条校准提案已经处理。" });
  assert.equal((await call(a.memoryGet, {})).playbook[0]!.id, applied.rule.id);
  await call(a.playbookDisable, { id: applied.rule.id });
  const other = await call(a.annotationCreate, { target: { kind: "idea_brief", objectId: id, revision: 1, blockId: "title" }, quotedSnapshot: "证据卡", comment: "已核对" });
  assert.equal((await call(a.annotationResolve, { id: other.annotation.id })).annotation.status, "resolved");
  await assert.rejects(call(a.annotationResolve, { id: other.annotation.id }), { code: "alchemist.annotation_already_resolved", message: "这条注释已经解决。" });
  const { rule } = await call(a.tasteCreate, { title: "单人产品", statement: "先满足单人使用", appliesTo: "产品构思", exceptions: [] });
  const conversation = await call(a.conversationSend, { body: "这个方向的风险是什么", context: { kind: "idea", label: "证据卡", ideaId: id, version: 1, panel: "brief" } });
  assert.ok("assistantMessage" in conversation); assert.equal(conversation.assistantMessage.responseState, "complete");
  assert.equal((await call(a.conversationList, {})).messages.length, 2);
  assert.equal(JSON.parse(f.requests.at(-1)!.userPrompt).founderTaste[0].statement, rule.statement);
  await call(a.tasteDisable, { id: rule.id });
  const { decision } = await call(a.decisionCreate, { id, version: 1, outcome: "hold", reason: "先补充用户访谈", revisitCondition: "三次独立访谈后" });
  assert.equal(decision.reportBindings.length, 2);
  assert.equal((await call(a.decisionGet, { id, version: 1 })).decision!.id, decision.id);
  await assert.rejects(call(a.decisionCreate, { id, version: 1, outcome: "hold", reason: "不得重复决定" }), { code: "alchemist.decision_already_exists", message: "这个 Idea 版本已经有正式决定。" });
  const decisions = await call(a.decisionsList, {}); assert.equal(decisions.log.length, 1); assert.equal(decisions.log[0]!.id, decision.id); assert.ok(decisions.activities.some(item => item.kind === "annotation.created"));
  assert.equal((await f.api(`/ideas/${id}/versions/1/decision`)).decision.id, decision.id);
});

test("Alchemist Pulse, cancellation and exports use real repositories and preserve compatibility HTTP statuses", async t => {
  const f = await fixture(t), call = f.call;
  assert.ok((await call(a.pulseSources, {})).sources.some(item => item.sourceId === "github"));
  await call(a.pulseSourceUpdate, { sourceId: "github", enabled: false });
  await assert.rejects(call(a.pulseStart, { sourceIds: ["github"] }), { code: "alchemist.pulse_no_enabled_sources", message: "请至少启用一个市场来源。" });
  const noSources = await f.runtime.app.request("http://localhost/api/v1/pulse/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceIds: ["github"] }) });
  assert.equal(noSources.status, 409);
  assert.deepEqual(await noSources.json(), { code: "alchemist.pulse_no_enabled_sources", message: "请至少启用一个市场来源。" });
  assert.equal((await call(a.pulseReports, {})).latestRun, undefined);
  const missingRun = await f.runtime.app.request("http://localhost/api/v1/runs/missing/cancel", { method: "POST" });
  assert.equal(missingRun.status, 404);
  // W5-01-ALC-RES11: one cancel action stops either kind of run, so a job that is neither is "not found" for both.
  assert.deepEqual(await missingRun.json(), { code: "alchemist.run_not_found", message: "没有找到这次研究或市场脉搏。" });
  await call(a.pulseSourceUpdate, { sourceId: "github", enabled: true });
  const pulse = await call(a.pulseStart, { sourceIds: ["github"] }); await f.runtime.runPending();
  assert.equal((await call(a.runEvents, { id: pulse.run.jobId })).status, "completed");
  const reports = await call(a.pulseReports, {}); assert.equal(reports.latestRun!.id, pulse.run.id); assert.ok(reports.reports[0]!.signals.length);
  const opportunity = reports.reports[0]!.opportunities[0]!;
  // ALCERR-01/ALCERR-03 (J5A-01/J5A-02): the domain refusal must survive the repository and operation adapters.
  const saved = (await call(a.opportunitySave, { id: opportunity.id })).opportunity;
  assert.equal(saved.status, "saved_for_later");
  await assert.rejects(call(a.opportunitySave, { id: opportunity.id }), { code: "alchemist.opportunity_cannot_be_saved", message: "这个机会当前无法执行该动作。" });
  const savedAgain = (await call(a.pulseReports, {})).reports[0]!.opportunities.find(item => item.id === opportunity.id);
  assert.deepEqual(savedAgain, saved, "a refused second save leaves the stored opportunity unchanged");
  const first = await f.runtime.app.request(`http://localhost/api/v1/opportunities/${opportunity.id}/convert`, { method: "POST" });
  assert.equal(first.status, 201); const converted = await first.json() as any;
  const reused = await call(a.opportunityConvert, { id: opportunity.id }); assert.equal(reused.created, false); assert.equal(reused.direction.id, converted.direction.id);
  assert.equal((await f.runtime.app.request(`http://localhost/api/v1/opportunities/${opportunity.id}/convert`, { method: "POST" })).status, 200);
  const receipt = await call(a.explorationStart, { id: reused.direction.id }); await f.runtime.runPending();
  const cards = (await call(a.explorationGet, { id: receipt.runId })).exploration.cards;
  const { idea } = await call(a.cardKeep, { id: cards[0]!.id });
  const { plan } = await call(a.researchPlan, { id: idea.id, lens: "market_space", ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 3 } });
  const { run } = await call(a.researchStart, { id: idea.id, lens: "market_space", planId: plan.id });
  const stopped = await call(a.runCancel, { id: run.jobId });
  assert.deepEqual([stopped.kind, stopped.run.status], ["lens", "cancelled"]);
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
  // W3-02-G1-05: the production operation executor rejects an unknown operation or version with the current platform code.
  const executor = f.runtime.actionsFor(f.caller.actor_id);
  for (const definition of [{ ...a.bootstrap, version: 2 }, { ...a.bootstrap, capability_id: "example.unregistered" }]) {
    await assert.rejects(executor.invoke(definition, {}), { code: "actions.missing", message: "没有这个炼金术士能力版本。" });
    // The existing injected invoker forwards the route into that real rejected executor, rather than manufacturing an error body.
    const app = createAlchemistHttpApp(undefined, { invoke: (reference, input, signal) => executor.invoke({ ...reference,
      capability_id: definition.capability_id, version: definition.version }, input, signal) });
    const denied = await app.request("http://localhost/api/v1/bootstrap");
    assert.equal(denied.status, 404);
    assert.deepEqual(await denied.json(), { code: "actions.missing", message: "没有这个炼金术士能力版本。" });
  }
  await assert.rejects(f.service.invoke({ ...f.caller, project_id: "b" }, a.directionCreate, { description: "不得创建到其他项目的方向" }));
  await assert.rejects(f.service.invoke({ ...f.caller, permissions: ["alchemist:read"] }, a.directionCreate, { description: "缺少写权限不能创建方向" }), { code: "actions.forbidden" });
  for (const input of [{ description: "有效方向描述但是带有伪造身份", actor_id: "other" }, { description: "短" }, { description: "有效方向描述", project_id: "b" }]) {
    await assert.rejects(f.call(a.directionCreate, input as never), { code: "actions.input_invalid" });
  }
  assert.equal((await f.call(a.bootstrap, {})).directions.length, 0);
  const { direction } = await f.call(a.directionCreate, { description: "一个用于验证路径覆盖防护的方向" });
  assert.equal((await f.runtime.app.request(`http://localhost/api/v1/directions/${direction.id}`, { method: "PATCH", body: JSON.stringify({ id: "another", description: "无法覆盖这个路径的方向" }) })).status, 400);
  await assert.rejects(f.call(a.researchPlan, { id: "missing", lens: "market_space", ideaVersion: 1, modelPolicy: "fixed", budget: { kind: "calls", limit: 3 } }), { code: "alchemist.research_plan_invalid" });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(f.service.invoke({ ...f.caller, signal: aborted.signal }, a.directionCreate, { description: "取消后不得产生新方向记录" }));
  assert.equal((await f.call(a.bootstrap, {})).directions.length, 1);
});

test("W2-18-ALCHEMIST-EFFECT-01: cancelled discussion writes no reply; an abandoned event read leaves accepted jobs intact", async t => {
  const f = await fixture(t);
  const { direction } = await f.call(a.directionCreate, { description: "验证观察窗口关闭不会取消后台研究" });
  const receipt = await f.call(a.explorationStart, { id: direction.id });
  // Events are read by cursor through the action (there is no event-stream route): a reader that gives up half way is not a cancel.
  const first = await f.call(a.runEvents, { id: receipt.jobId! });
  assert.ok(first.events.some(event => event.type === "queued"));
  const observer = new AbortController(), abandoned = f.service.invoke({ ...f.caller, signal: observer.signal }, a.runEvents, { id: receipt.jobId!, after: first.cursor });
  observer.abort(); await Promise.allSettled([abandoned]);
  assert.equal((await f.call(a.runEvents, { id: receipt.jobId! })).status, "queued");
  await f.runtime.runPending();
  assert.equal((await f.call(a.runEvents, { id: receipt.jobId! })).status, "completed");
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController();
  f.ai.generate = async () => { entered.resolve(); await release.promise; return alchemistOutput('{"reply":"迟到的成功回复"}'); };
  const pending = f.service.invoke({ ...f.caller, signal: abort.signal }, a.conversationSend, { body: "这次讨论取消", context: { kind: "direction", label: direction.title, directionId: direction.id } });
  await entered.promise;
  const rejected = assert.rejects(pending); abort.abort(); release.resolve(); await rejected;
  const messages = (await f.call(a.conversationList, {})).messages;
  assert.equal(messages[0]!.body, "这次讨论取消"); assert.equal(messages.length, 1, "cancellation is not a fabricated failed assistant reply");
  assert.ok(messages.every(message => message.body !== "迟到的成功回复"));
});

test("W2-18-ALCHEMIST-EFFECT-02: a genuine model failure remains explained and an explicit new discussion can recover", async t => {
  const f = await fixture(t);
  const { direction } = await f.call(a.directionCreate, { description: "正常模型失败后可以继续讨论并保留原文" });
  const context = { kind: "direction" as const, label: direction.title, directionId: direction.id };
  const generate = f.ai.generate;
  f.ai.generate = async () => { throw new Error("model unavailable during dispatch"); };
  const failed = await f.call(a.conversationSend, { body: "保留这条合法消息", context });
  assert.ok("assistantMessage" in failed); assert.equal(failed.assistantMessage.responseState, "failed");
  f.ai.generate = generate;
  const recovered = await f.call(a.conversationSend, { body: "再次明确讨论", context });
  assert.ok("assistantMessage" in recovered); assert.equal(recovered.assistantMessage.responseState, "complete");
  assert.deepEqual((await f.call(a.conversationList, {})).messages.map(row => [row.author, row.responseState]),
    [["user", "complete"], ["assistant", "failed"], ["user", "complete"], ["assistant", "complete"]]);
});

test("W5-01-ALC-LIFE-09: a job's events are read by cursor through the action; there is no event-stream route", async t => {
  const f = await fixture(t);
  const { direction } = await f.call(a.directionCreate, { description: "事件只经动作按游标读取，不再有事件流路由" });
  const receipt = await f.call(a.explorationStart, { id: direction.id });
  const stream = await f.runtime.app.request(`http://localhost/api/v1/runs/${receipt.jobId}/events`);
  assert.equal(stream.status, 404);
  assert.notEqual(stream.headers.get("content-type")?.split(";")[0], "text/event-stream");
  await f.runtime.runPending();
  const read = await f.call(a.runEvents, { id: receipt.jobId! });
  assert.equal(read.status, "completed"); assert.equal(read.events.at(-1)!.type, "completed");
  assert.deepEqual((await f.call(a.runEvents, { id: receipt.jobId!, after: read.cursor })).events, []);
});

test("W5-01-ALC-RES-AUTH-04: exactly the four model actions declare model:invoke beside alchemist:generate; without it only they are refused", async t => {
  const modelActions = [a.reuseAssess, a.conversationSend, a.explorationStart, a.researchStart];
  for (const definition of modelActions) {
    assert.ok(definition.action.permissions.includes("model:invoke") && definition.action.permissions.includes("alchemist:generate"), definition.capability_id);
    assert.equal(definition.action.execution?.cost, "metered", definition.capability_id);
    assert.equal(definition.action.scheduling, "concurrent", definition.capability_id);
    assert.equal(definition.version, 1, definition.capability_id);
  }
  assert.deepEqual(Object.values(a).filter(definition => definition.action.permissions.includes("model:invoke")).map(definition => definition.capability_id).sort(), modelActions.map(definition => definition.capability_id).sort(),
    "the Pulse collects sources and runs no model: it does not carry it");
  // The Manifest asks for it as an optional permission (switching it off takes only those four actions away); the person's own page is granted it with the rest.
  assert.equal(alchemistManifest.permissions.find(entry => entry.permission === "model:invoke")?.required, false);
  assert.ok(alchemistManifest.permissions.filter(entry => entry.permission !== "model:invoke").every(entry => entry.required));
  assert.ok(ALCHEMIST_ACTION_PERMISSIONS.includes("model:invoke"));
  const home = await mkdtemp(join(tmpdir(), "alchemist-model-grant-")), f = alchemistFixture(home, "a", ALCHEMIST_ACTION_PERMISSIONS.filter(permission => permission !== "model:invoke"));
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "没有系统模型授权时只有四个模型动作被拒绝" });
  await assert.rejects(f.bound.invoke(a.explorationStart, { id: direction.id }), { code: "actions.forbidden" });
  await assert.rejects(f.bound.invoke(a.conversationSend, { body: "如何验证", context: { kind: "direction", label: "方向", directionId: direction.id } }), { code: "actions.forbidden" });
  assert.equal(f.requests.length, 0);
  assert.equal((await f.bound.invoke(a.bootstrap, {})).directions[0]!.id, direction.id);
  await f.bound.invoke(a.runList, {});
});

test("RAC-2723: a lens job refused for material over the prompt's data position tells the page the material-too-long reason", async t => {
  // The Host port refuses with alchemist.prompt_too_long. The lens job must keep that reason (not the generic research_runtime_failed)
  // in the run the page reads; the page then shows the localized material-too-long text (the character excess gets a dedicated
  // error-detail field in a later change, so it is not carried in the code).
  const home = await mkdtemp(join(tmpdir(), "alchemist-prompt-too-long-")), f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const original = f.ai.generate;
  f.ai.generate = async input => {
    const fields = (input.jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
    if (fields.summary || fields.judgments) throw new ActionError("alchemist.prompt_too_long",
      "任务材料转成提示后 200267 字，超过提示上限 200100 字，多 167 个字；请减少材料或缩短任务后重试");
    return original(input);
  };
  const { direction } = await f.bound.invoke(f.actions.directionCreate, { title: "超长材料", description: "研究材料超过提示的数据位" });
  const receipt = await f.bound.invoke(f.actions.explorationStart, { id: direction.id }); await f.runtime.runPending();
  const exploration = (await f.bound.invoke(f.actions.explorationGet, { id: receipt.runId })).exploration;
  const { idea } = await f.bound.invoke(f.actions.cardKeep, { id: exploration.cards[0]!.id });
  const { plan } = await f.bound.invoke(f.actions.researchPlan, { id: idea.id, ideaVersion: 1, lens: "market_space", modelPolicy: "auto", budget: { kind: "calls", limit: 3 } });
  const { run } = await f.bound.invoke(f.actions.researchStart, { id: idea.id, lens: "market_space", planId: plan.id });
  await f.runtime.runPending();
  const lens = (await f.bound.invoke(f.actions.researchGet, { id: idea.id, version: 1 })).lenses.market_space;
  assert.equal(lens.status, "failed", "the lens run fails rather than presenting a partial report");
  assert.equal(lens.run?.errorCode, "alchemist.prompt_too_long", "the page reads the material-too-long reason, not the generic runtime failure");
  assert.equal(lens.run?.jobId, run.jobId);
  // The page renders the reason: this code has its own sentence (and its English pair), so deleting the branch or the dictionary line fails here.
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /alchemist\.prompt_too_long/u, "the page knows this code");
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /材料太长，请减少材料或缩短任务后重试。/u, "and shows the material-too-long sentence for it");
  assert.ok(ALCHEMIST_EN["材料太长，请减少材料或缩短任务后重试。"], "the sentence has its English line");
  assert.match(ALCHEMIST_EN["材料太长，请减少材料或缩短任务后重试。"] ?? "", /Too much material/u, "the English says the material is too long");
});
