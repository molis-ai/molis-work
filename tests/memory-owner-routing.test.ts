import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, ensureSystemAgentService, molisWorkHostProjectReference, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { PLUGIN_DEFAULT_KINDS, pluginDefaultKinds } from "@molis-ai/molis-work-service-memory";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { grantMcpAction } from "@molis-ai/molis-work-test-kit/local-host-http";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";
import { isKnowledgeOrganize } from "./fixtures/knowledge-organize.js";
import { toolField, untilSetup } from "./fixtures/connector-assistant-model.js";
import { serveTestHost } from "./fixtures/test-home.js";

// These are engineering checks of the existing public owners, grants, reviews and final SDK requests.
// The loopback Provider deliberately chooses every tool. This does NOT measure a real model's routing,
// Skill authoring, subjective reply quality, MEM-41–44 scope, paid-model quality or user acceptance.
const RULE = "OWNER_RULE_PNPM：本项目始终使用 pnpm 安装依赖。";
const PREF = "OWNER_PREF_CONCISE：回答先给简短结论。";
const BACKGROUND = "OWNER_REF_STUDIO：项目主要服务小型设计工作室。";
const OLD_BACKGROUND = "OWNER_REF_STUDIO：项目主要服务独立设计师。";
const METHOD = "OWNER_METHOD_RESEARCH：竞品研究依次收集来源、核对、比较。";
const ONCE = "OWNER_ONCE_NPM：今天只试一次 npm。";
const goalsProvider = "io.molis.work.goals";
const coding = "/api/plugins/io.molis.work.coding";
type ModelRequest = CodingProviderRequest & { system?: unknown; tools?: Array<{ name: string; description?: string }> };
type ModelStep = (request: ModelRequest) => { name: string; input: unknown } | string | Promise<{ name: string; input: unknown } | string>;
const instructionText = (request: ModelRequest) => JSON.stringify(request.system ?? []);
const materialText = (request: ModelRequest) => JSON.stringify(request.messages);
const guidanceCall = (capability_id: string, input: unknown, write = false) => ({ name: write ? "change-capability" : "read-capability",
  input: { capability_id, version: 1, provider_id: goalsProvider, input } });
const addInput = (key: string) => ({ kind: "constraint" as const, content: RULE, reason: "项目持续协作约定", confirmation_summary: RULE,
  user_confirmed: true, idempotency_key: key });

/** One real product Home and loopback Provider, shared by Assistant/Coding; reopening replaces the actual Host. */
async function ownerFixture(t: TestContext) {
  const script: ModelStep[] = [], seen: ModelRequest[] = [];
  const f = await codingProductHost(t, async given => {
    const request = given as ModelRequest, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    // Automatic extraction has its own registered structured prompt; no incidental learning is scripted here.
    const last = request.messages.at(-1)?.content;
    const text = typeof last === "string" ? last : JSON.stringify(last ?? "");
    try {
      const data = JSON.parse(text.slice(text.lastIndexOf("\n\n") + 2));
      if (Array.isArray(data.sources) && Array.isArray(data.destinations)) return cogniaScriptedResponse(undefined, JSON.stringify({ drafts: [] }));
    } catch { /* Ordinary task messages are not extraction requests. */ }
    seen.push(request);
    const step = script.shift(); assert.ok(step, "only the declared main-task Provider calls may run");
    try {
      const next = await step(request);
      return cogniaScriptedResponse(typeof next === "string" ? undefined : next, typeof next === "string" ? next : "");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code) ? error.code : undefined;
      t.diagnostic(JSON.stringify({ provider_script_step: seen.length, error_type: error instanceof Error ? error.constructor.name : typeof error, code }));
      throw error;
    }
  }, { loopbackProvider: true });
  let host = f.host, web = f.web, closeReopened: (() => Promise<void>) | undefined;
  const reference = (project = f.project) => molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const person = (project = f.project) => bindActionClient(host.actionClient(reference(project)), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID,
    actor_kind: "user" as const, audience: "user" as const, project_id: project.project_id, permissions: [...MEMORY_PERMISSIONS, "goals:read", "goals:write"],
    user_action: { source: "management" as const, conversation_ref: "test://owner-routing", message_ref: randomUUID() } }));
  const assistant = async (text: string, steps: ModelStep[], options: { work_id?: string; project?: typeof f.project | null; decisions?: Array<"approve" | "reject">; expected_failure?: "MEMORY_SCOPE_DENIED" } = {}) => {
    assert.equal(script.length, 0); const before = seen.length; script.push(...steps);
    const project = options.project === undefined ? f.project : options.project;
    const prefix = project ? `/projects/${project.project_id}` : "";
    const sent = await web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text, request_id: randomUUID(),
      ...(options.work_id ? { work_id: options.work_id } : { scope: project ? { kind: "project", project_id: project.project_id } : { kind: "personal" } }) });
    if (options.work_id !== undefined) assert.equal(sent.work.work_id, options.work_id, "the public Send continues the requested Work");
    const decisions = [...(options.decisions ?? [])], decided = new Set<string>();
    let failedRun: AgentRunView | undefined;
    const view = await untilSetup(async () => {
      const current = await web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`);
      for (const review of current.reviews) if (!decided.has(review.review_id)) {
        const decision = decisions.shift(); assert.ok(decision, `unexpected review: ${review.summary}`); decided.add(review.review_id);
        await web.post(`${prefix}/api/assistant/works/${sent.work.work_id}/reviews/${review.review_id}`, { decision });
      }
      if (current.work.state === "failed" && options.expected_failure === "MEMORY_SCOPE_DENIED") {
        const round = current.rounds.at(-1); assert.ok(round && current.work.session_id);
        const system = ensureSystemAgentService(host, f.home); await system.ready;
        failedRun = await system.agentHost.adapter("prologue").read({ session_id: current.work.session_id, run_id: round.run_id });
        assert.equal(failedRun.phase, "failed"); assert.match(failedRun.stop_reason ?? "", /^MEMORY_SCOPE_DENIED:/);
        assert.match(round.stop_reason ?? "", /没有读取记忆的权限.*已完成的修改都保留/);
        return current;
      }
      assert.notEqual(current.work.state, "failed", JSON.stringify(current));
      if (current.work.state === "completed") assert.equal(options.expected_failure, undefined, "this exact revoked Context must fail, not dispatch another response");
      return current.work.state === "completed" ? current : undefined;
    }, "Assistant's real public work completes");
    assert.equal(script.length, 0); assert.equal(decisions.length, 0);
    return { view, requests: seen.slice(before), failedRun };
  };
  const codingRound = async (steps: ModelStep[], actions: Array<ActionReference & { provider_id: string }>, decisions: Array<"approve" | "reject"> = [], task = "核对项目长期说明与记忆参考资料。") => {
    assert.equal(script.length, 0); const before = seen.length; script.push(...steps);
    for (const action of actions) await grantMcpAction(web, { clientId: "agent:prologue", projectId: f.project.project_id, action });
    const prefix = `/projects/${f.project.project_id}`;
    const created = await web.post<{ session: { session_id: string } }>(prefix + coding + "/sessions", {});
    const started = await web.post<{ run: AgentRunView }>(`${prefix}${coding}/sessions/${created.session.session_id}/runs`, {
      task, intent: decisions.length ? "execute" : "discuss", workspace_id: f.workspaceId,
      provider_id: "fixture", model_id: "fixture-model", action_tools: actions,
    });
    const system = ensureSystemAgentService(host, f.home), adapter = system.agentHost.adapter("prologue");
    const pending = [...decisions], decided = new Set<string>();
    const view = await untilSetup(async () => {
      for (const review of system.agentHost.reviews.list(f.project.project_id, "pending")) if (!decided.has(review.review_id)) {
        const decision = pending.shift(); assert.ok(decision, "unexpected Coding write review"); decided.add(review.review_id);
        await system.agentHost.reviews.respond({ review_id: review.review_id, actor_id: LOCAL_PERSON_ACTOR_ID, decision });
      }
      const current = await adapter.read(started.run.ref);
      assert.ok(!["failed", "cancelled"].includes(current.phase), JSON.stringify(current));
      return current.phase === "completed" ? current : undefined;
    }, "Coding's real public Run completes");
    assert.equal(script.length, 0); assert.equal(pending.length, 0);
    return { view, requests: seen.slice(before) };
  };
  const reopen = async () => {
    assert.equal(script.length, 0); await f.close();
    let withCatalog: ReturnType<MolisWorkLocalHost["configurePersonalPlanning"]>;
    host = new MolisWorkLocalHost({ homeDirectory: f.home,
      workspacesFor: projectId => withCatalog({ homeDirectory: f.home }, catalog => catalog.listWorkspaceDirectory(projectId)),
      workspaceFor: projectId => withCatalog({ homeDirectory: f.home }, catalog => workspaceRefFor(catalog, projectId)),
    });
    withCatalog = host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog);
    const served = await serveTestHost(null, { home: f.home, host }); web = served.web;
    closeReopened = async () => { await served.close(); await host.close(); };
  };
  return { ...f, get host() { return host; }, get providerCalls() { return f.providerRequests.length; }, person, assistant, codingRound, reopen, closeCurrent: async () => { await closeReopened?.(); } };
}

/** Since the user's 2026-11-12 decision (BL-1073) every plugin reads the project's approved facts by default; no configuration is needed. */
async function allowCodingFacts(f: Awaited<ReturnType<typeof ownerFixture>>) {
  const manager = f.person(), prefs = (await manager.invoke(memoryActions.prefs, { scope: "project" })).prefs;
  assert.equal(prefs.plugins["io.molis.work.coding"], undefined, "the person set nothing for Coding");
  assert.ok(pluginDefaultKinds("project").includes("fact"), "a plugin's project default includes the project's approved facts");
  assert.equal(PLUGIN_DEFAULT_KINDS.includes("fact"), false, "personal facts stay out of every plugin's default");
}

/** A declared action is selected from the actual request's granted tool list, never from a guessed tool name. */
function actionTool(request: ModelRequest, title: string, input: unknown) {
  const tool = request.tools?.find(item => item.name.startsWith("molis-action-") && item.description?.includes(title));
  assert.ok(tool, `${title} is offered by the real Coding grant directory`); return { name: tool.name, input };
}

async function assertConsumption(f: Awaited<ReturnType<typeof ownerFixture>>, expectedReference: string, absentReference?: string) {
  const own = await f.assistant("核对本项目约定与参考资料。", [() => ({ name: "list-memories", input: {} }), request => {
    assert.match(instructionText(request), new RegExp(RULE));
    assert.ok(materialText(request).includes(expectedReference)); assert.ok(materialText(request).includes("memory-recall"));
    assert.ok(!materialText(request).includes(RULE), "project instructions have no live Memory duplicate");
    assert.ok(!instructionText(request).includes(expectedReference), "reference memory is data, never a project instruction");
    if (absentReference) assert.ok(!materialText(request).includes(absentReference));
    return "已核对当前项目规则和参考资料。";
  }]);
  assert.ok(own.view.rounds.at(-1)?.memories_used?.used.some(item => item.text === expectedReference));
  for (const project of [f.other, null]) await f.assistant("核对当前范围资料。", [() => ({ name: "list-memories", input: {} }), request => {
    assert.ok(!instructionText(request).includes(RULE)); assert.ok(!materialText(request).includes(RULE));
    // All references passed to this helper are project-scoped. Personal preferences are checked separately.
    assert.ok(!materialText(request).includes(expectedReference)); return "这个范围没有该项目的资料。";
  }], { project });
  const reference = (await f.person().invoke(memoryActions.list, { scope: "project" })).items.find(item => item.state === "active" && item.text === expectedReference);
  assert.ok(reference);
  // A real task asks about the topic, without supplying the stored answer, marker or ID. Coding's production recall supplies it.
  const task = "为本项目准备介绍，先核对服务对象与长期约定。";
  assert.doesNotMatch(task, /OWNER_/);
  for (const answer of [expectedReference, absentReference, reference.memory_id]) if (answer) assert.ok(!task.includes(answer));
  const codingRun = await f.codingRound([request => {
    assert.ok(instructionText(request).includes(RULE)); assert.ok(materialText(request).includes(expectedReference));
    assert.ok(!materialText(request).includes(RULE), "Coding receives rules only from the Goals project layer");
    assert.ok(materialText(request).includes("memory-recall")); assert.ok(!instructionText(request).includes(expectedReference));
    if (absentReference) assert.ok(!materialText(request).includes(absentReference));
    const recalled = request.messages.flatMap(message => {
      const texts = typeof message.content === "string" ? [message.content] : message.content.filter(block => block.type === "text").map(block => block.text ?? "");
      return texts.flatMap(text => text.split("\n").filter(line => line.startsWith('{"source":"memory-recall"')).map(line => JSON.parse(line)));
    }).filter(item => item.text === expectedReference);
    assert.equal(recalled.length, 1, "one canonical reference supplies this background fact");
    // This round has no Memory Action to address it with, so the value arrives without an identity (BL-1073); the receipts below
    // tie it to the canonical ID and version.
    assert.equal(recalled[0].memory, undefined, "a round that cannot address a memory is not sent its identity");
    return "已按长期说明核对记忆参考资料。";
  }], [], [], task);
  const receipt = codingRun.view.memory_recalled; assert.ok(receipt, "real Run retains a recall receipt");
  assert.ok(receipt.injected?.some(item => item.memory_id === reference.memory_id && item.version === reference.version));
  assert.ok(receipt.contexts?.some(context => context.status === "response-observed"
    && context.references.some(item => item.memory_id === reference.memory_id && item.version === reference.version)), "the final observed dispatch confirms the current canonical version");
}

test("existing owners: mixed Assistant save keeps candidate/confirmation/unavailable separate; Coding can select the same Goals write; reopen preserves data layers and scope", { timeout: 120_000 }, async t => {
  const f = await ownerFixture(t);
  try {
    const manager = f.person(), original = [PREF, RULE, ONCE, METHOD].join("\n"), input = addInput("owner-mixed-rule");
    await manager.invoke(memoryActions.savePrefs, { scope: "personal", preset: "reviewed" });
    await manager.invoke(memoryActions.savePrefs, { scope: "project", preset: "reviewed" });
    await allowCodingFacts(f);
    const catalog = await f.web.get<{ capabilities: Array<{ capability_id: string }> }>(`/projects/${f.project.project_id}/api/assistant/capabilities`);
    assert.ok(!catalog.capabilities.some(item => /skill.*(create|update)|method.*(create|update)/i.test(item.capability_id)), "this Home offers no public Skill author capability");
    let declinedInput = "";
    const declinedNote = "遵守拒绝：这条项目长期说明未保存，不改用其它存储绕过；继续查询方法能力。";
    const mixed = await f.assistant(original, [
      () => ({ name: "find-capabilities", input: { query: "Goals 长期说明" } }),
      () => guidanceCall("goals.guidance.read", {}),
      () => ({ name: "remember", input: { scope: "personal", text: PREF, said: original, kind: "preference" } }),
      request => { assert.equal(toolField(request.messages, "memory_id"), ""); assert.equal(typeof toolField(request.messages, "candidate_id"), "string"); return guidanceCall("goals.guidance.add", input, true); },
      request => {
        assert.equal(toolField(request.messages, "created"), undefined, "rejected confirmation has no save receipt");
        assert.ok(request.tools?.some(tool => tool.name === "acknowledge-inputs"), "the current request offers the public input receipt tool");
        const notices = request.messages.flatMap((message, index) => {
          if (!("role" in message) || message.role !== "user" || typeof message.content !== "string") return [];
          const above = request.messages[index - 1];
          if (!above || !("role" in above) || above.role !== "user" || typeof above.content !== "string"
            || !above.content.includes("用户拒绝了这次修改") || !above.content.includes(goalsActions.guidanceAdd.action.title)) return [];
          const id = message.content.match(/^\[input id\] The input just above has the id (steer-[0-9a-z]+-[0-9a-z]+)\. Use it to refer to that input in acknowledge-inputs\.$/)?.[1];
          return id ? [id] : [];
        });
        assert.equal(notices.length, 1, "one actual Context input-id record is paired with this Goals refusal, not an old tool result");
        declinedInput = notices[0]!;
        return { name: "acknowledge-inputs", input: { items: [{ input: declinedInput, treatment: "apply-now", kind: "constraint", impacts: ["constraint"], note: declinedNote }] } };
      },
      () => ({ name: "find-capabilities", input: { query: "Skill" } }),
      request => {
        assert.equal(typeof toolField(request.messages, "found"), "number", "the Skill query really returned a directory result");
        const capabilities = toolField(request.messages, "capabilities");
        if (Array.isArray(capabilities)) assert.ok(capabilities.every(item => !/skill.*(create|update)|method.*(create|update)/i.test(String(item.capability_id))));
        return "偏好待你认可；项目规则未保存（你拒绝了确认）；方法未保存（没有创作能力）；今天的要求只留本次会话。";
      },
    ], { decisions: ["reject"] });
    const refusal = mixed.view.rounds[0]!.turns.find(turn => turn.steer?.id === declinedInput)?.steer;
    assert.ok(refusal, "the completed Work retains the exact refusal input seen in the model Context");
    assert.equal(refusal.id, declinedInput); assert.equal(refusal.source, "host"); assert.equal(refusal.state, "read");
    assert.deepEqual([refusal.model_claim?.treatment, refusal.model_claim?.kind, refusal.model_claim?.impacts, refusal.model_claim?.note],
      ["apply-now", "constraint", ["constraint"], declinedNote], "the public acknowledgement is bound to the same refusal identity");
    assert.match(JSON.stringify(mixed.view.rounds), /偏好待你认可/);
    assert.deepEqual((await manager.invoke(goalsActions.guidanceRead, {})).entries, []);
    assert.deepEqual((await manager.invoke(memoryActions.list, {})).items, []);
    const pending = (await manager.invoke(memoryActions.candidates, {})).candidates;
    assert.equal(pending.length, 1); assert.equal(pending[0]!.text, PREF); assert.equal(pending[0]!.state, "pending");
    const accepted = await manager.invoke(memoryActions.accept, { candidate_id: pending[0]!.candidate_id, expected_version: pending[0]!.version });
    assert.equal(accepted.memory?.text, PREF);
    await f.assistant("确认将这条保存为本项目长期说明：" + RULE, [() => guidanceCall("goals.guidance.read", {}),
      () => guidanceCall("goals.guidance.add", input, true), request => {
        assert.equal(toolField(request.messages, "created"), true); return "已保存到 Goals 的本项目长期说明，可在项目设置查看和纠正。";
      }], { decisions: ["approve"] });
    const saved = await manager.invoke(goalsActions.guidanceRead, {}); assert.equal(saved.entries.length, 1);
    const write = { capability_id: goalsActions.guidanceAdd.capability_id, version: goalsActions.guidanceAdd.version, provider_id: goalsProvider };
    await f.codingRound([request => actionTool(request, goalsActions.guidanceAdd.action.title, input), request => {
      // Assistant acts for the person; Coding has its own actor. The same text deduplicates across actors, not their idempotency receipts.
      assert.equal(toolField(request.messages, "created"), false); assert.equal(toolField(request.messages, "replayed"), false);
      assert.deepEqual(toolField(request.messages, "entry"), saved.entries[0]);
      return "相同说明已在 Goals，没有重复新增。";
    }], [write], ["approve"]);
    assert.deepEqual(await manager.invoke(goalsActions.guidanceRead, {}), saved, "cross-actor text deduplication retains the original Goals entries, revisions and cursor");
    await manager.invoke(memoryActions.write, { scope: "project", kind: "fact", text: BACKGROUND, classification: { scenes: ["common"], lifecycle: "long-term" } });
    const all = (await manager.invoke(memoryActions.list, {})).items;
    assert.ok(all.every(item => ![RULE, ONCE, METHOD].includes(item.text)), "no fallback storage for rejected rules, methods or one-off choices");
    await f.reopen();
    assert.deepEqual(await f.person().invoke(goalsActions.guidanceRead, {}), saved);
    await assertConsumption(f, BACKGROUND);
    await f.assistant("显式查看我的偏好。", [() => ({ name: "list-memories", input: {} }), request => {
      assert.ok(materialText(request).includes(PREF)); assert.ok(!instructionText(request).includes(PREF)); return "个人偏好仍是参考资料。";
    }], { project: null });
  } finally { await f.closeCurrent(); }
});

test("existing owners: correction reports partial success, refuses revoked memory change, retries the original Goals request and leaves no active duplicate after reopen", { timeout: 120_000 }, async t => {
  const f = await ownerFixture(t);
  try {
    const manager = f.person();
    await manager.invoke(memoryActions.savePrefs, { scope: "project", preset: "reviewed" });
    await allowCodingFacts(f);
    const classification = { scenes: ["common"], lifecycle: "long-term" as const };
    const background = await manager.invoke(memoryActions.write, { scope: "project", kind: "fact", text: OLD_BACKGROUND, classification });
    const mistake = await manager.invoke(memoryActions.write, { scope: "project", kind: "convention", text: RULE, classification });
    assert.ok(background.memory && mistake.memory);
    const oldId = background.memory.memory_id, wrongId = mistake.memory.memory_id, input = addInput("owner-correction-original");
    const prefs = (await manager.invoke(memoryActions.prefs, { scope: "project" })).prefs;
    let callsAtRevocation = 0;
    const assertRevokedWindow = () => {
      assert.ok(callsAtRevocation > 0);
      let allowed = 0, withGoalsRule = 0;
      for (const raw of f.providerRequests.slice(callsAtRevocation)) {
        assert.ok(isKnowledgeOrganize(raw), "only the registered independent Knowledge request may follow Assistant Memory revocation");
        const body: unknown = JSON.parse(raw);
        const strings = (value: unknown): string[] => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
        const text = JSON.stringify(body) + "\n" + strings(body).join("\n");
        for (const marker of [OLD_BACKGROUND, oldId, wrongId]) assert.ok(!text.includes(marker), "Knowledge cannot carry revoked Memory text or identity");
        assert.ok(!/"source"\s*:\s*"memory-recall"|"memory"\s*:\s*\{/.test(text), "Knowledge cannot carry a Memory recall wrapper or reference");
        if (text.includes(RULE)) withGoalsRule++;
        allowed++;
      }
      assert.equal(f.providerCalls - callsAtRevocation, allowed, "the complete Provider total includes exactly the independently allowed requests");
      t.diagnostic(JSON.stringify({ provider_total: f.providerCalls, at_revocation: callsAtRevocation, allowed_knowledge: allowed, with_goals_rule: withGoalsRule }));
    };
    const partial = await f.assistant("纠正背景为：" + BACKGROUND + "\n将旧规矩移到项目长期说明，并停用记忆副本。", [
      () => ({ name: "list-memories", input: {} }), request => {
        assert.ok(materialText(request).includes(oldId) && materialText(request).includes(OLD_BACKGROUND));
        return { name: "remember", input: { scope: "project", text: BACKGROUND, said: "纠正背景为：" + BACKGROUND + "\n将旧规矩移到项目长期说明，并停用记忆副本。", kind: "fact", replaces: oldId } };
      },
      request => { assert.equal(typeof toolField(request.messages, "candidate_id"), "string"); return guidanceCall("goals.guidance.read", {}); },
      () => guidanceCall("goals.guidance.add", input, true),
      async request => {
        assert.equal(toolField(request.messages, "created"), true);
        // The person withdraws actual Assistant access after list/write but before the next tool is dispatched.
        await manager.invoke(memoryActions.savePrefs, { scope: "project", prefs: { consumers: { ...prefs.consumers, assistant: false } } });
        callsAtRevocation = f.providerCalls;
        return { name: "forget-memory", input: { memory_id: wrongId } };
      },
    ], { decisions: ["approve"], expected_failure: "MEMORY_SCOPE_DENIED" });
    assertRevokedWindow();
    const raw = partial.failedRun; assert.ok(raw);
    const forget = raw.activity.filter(item => item.name === "forget-memory"), remember = raw.activity.filter(item => item.name === "remember");
    assert.equal(forget.length, 1); assert.equal(remember.length, 1);
    assert.equal(forget[0]!.output_truncated, false); assert.ok(forget[0]!.output);
    assert.deepEqual(JSON.parse(forget[0]!.output), { forgotten: false });
    assert.equal(remember[0]!.output_truncated, false); assert.ok(remember[0]!.output);
    const held = JSON.parse(remember[0]!.output); assert.equal(held.memory_id, ""); assert.equal(typeof held.candidate_id, "string");
    const shown = partial.view.rounds[0]!.activity;
    assert.ok(shown.some(item => item.verb === "memory-suggest" && item.state === "completed" && item.target === ""));
    assert.ok(shown.some(item => item.verb === "memory-forget" && item.state === "failed" && item.detail?.includes("没有停用")));
    assert.ok(!shown.some(item => item.verb === "memory-keep" && item.state === "completed"));
    const beforeRetry = await manager.invoke(goalsActions.guidanceRead, {}); assert.equal(beforeRetry.entries.length, 1);
    assert.equal(beforeRetry.entries[0]!.content, RULE);
    const originals = (await manager.invoke(memoryActions.list, {})).items;
    const unchangedRule = originals.find(item => item.memory_id === wrongId), unchangedBackground = originals.find(item => item.memory_id === oldId);
    assert.ok(unchangedRule && unchangedBackground);
    assert.deepEqual([unchangedRule.state, unchangedRule.version, unchangedRule.text], ["active", mistake.memory.version, RULE]);
    assert.deepEqual([unchangedBackground.state, unchangedBackground.version, unchangedBackground.text], ["active", background.memory.version, OLD_BACKGROUND]);
    const candidate = (await manager.invoke(memoryActions.candidates, {})).candidates.find(item => item.candidate_id === held.candidate_id); assert.ok(candidate);
    assert.equal(candidate.text, BACKGROUND); assert.equal(candidate.state, "pending");
    assertRevokedWindow();
    const correction = await manager.invoke(memoryActions.accept, { candidate_id: candidate.candidate_id, expected_version: candidate.version });
    assert.equal(correction.memory?.text, BACKGROUND);
    assertRevokedWindow();
    await manager.invoke(memoryActions.savePrefs, { scope: "project", prefs: { consumers: prefs.consumers } });
    assertRevokedWindow();
    const retried = await f.assistant("保留已保存的项目说明，继续原请求，停用那份旧记忆。", [
      () => ({ name: "list-memories", input: {} }), request => {
        assert.ok(materialText(request).includes(wrongId) && materialText(request).includes(RULE)); return guidanceCall("goals.guidance.add", input, true);
      },
      request => { assert.equal(toolField(request.messages, "replayed"), true); return { name: "forget-memory", input: { memory_id: wrongId } }; },
      request => { assert.equal(toolField(request.messages, "forgotten"), true); return "规矩保留在 Goals，旧记忆已停用；背景更正已由你认可。可分别在项目长期说明和记忆设置纠正。"; },
    ], { decisions: ["approve"], work_id: partial.view.work.work_id });
    assert.equal(retried.view.work.work_id, partial.view.work.work_id);
    assert.equal(retried.view.work.session_id, partial.view.work.session_id);
    assert.equal(retried.view.rounds.length, partial.view.rounds.length + 1);
    assert.ok(!partial.view.rounds.some(round => round.run_id === retried.view.rounds.at(-1)!.run_id), "continuing the original Work starts a new Run in its original Session");
    assert.deepEqual(await manager.invoke(goalsActions.guidanceRead, {}), beforeRetry, "same idempotency key retains the original event and receipt");
    const entry = beforeRetry.entries[0]!;
    await assert.rejects(manager.invoke(goalsActions.guidanceUpdate, { guidance_id: entry.guidance_id, action: "edit", kind: "constraint", content: "不应保存的未确认修改",
      reason: "确认拒绝", confirmation_summary: "尚未确认", user_confirmed: false, idempotency_key: "owner-refused-edit" }), { code: "goals.project_guidance.user_confirmation_required" });
    assert.deepEqual(await manager.invoke(goalsActions.guidanceRead, {}), beforeRetry);
    const items = (await manager.invoke(memoryActions.list, {})).items;
    assert.equal(items.find(item => item.memory_id === wrongId)?.state, "disabled");
    assert.equal(items.filter(item => item.state === "active" && item.text === BACKGROUND).length, 1);
    assert.equal(items.filter(item => item.state === "active" && item.text === RULE).length, 0);
    await f.reopen();
    assert.deepEqual(await f.person().invoke(goalsActions.guidanceRead, {}), beforeRetry);
    assert.equal((await f.person().invoke(memoryActions.list, {})).items.find(item => item.memory_id === wrongId)?.state, "disabled");
    // Compare the actual repeated body, not RULE itself: RULE belongs exactly once in the project layer now.
    await assertConsumption(f, BACKGROUND, OLD_BACKGROUND);
  } finally { await f.closeCurrent(); }
});
