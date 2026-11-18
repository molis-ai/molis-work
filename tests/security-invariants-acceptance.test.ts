import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { HomeConsentLedger, LocalMcpServer, recoverAcceptanceCommits } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { ACCEPTANCE_DECIDE_PERMISSION, ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, acceptanceActions, acceptanceRequestId, type AcceptanceReadResult, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { openAcceptance } from "@molis-ai/molis-work-module-acceptance";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

/*
 * `system.acceptance` in a real Host (modules/acceptance; specs/proactive-assistant §7.3.1, specs/agent-approval APR-15, APR-16): the refusals
 * themselves and the protected trusted-decision entry. The project has no Goals in it; the object is a fixture plugin's or an Assistant work's.
 */

const ALL = [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, ACCEPTANCE_DECIDE_PERMISSION];
const SUBJECT = { provider_id: "plugin.homebg", subject: { kind: "homebg_task", id: "j1" } };
const code = (...expected: string[]) => (error: unknown) => error instanceof ActionError && expected.includes(error.code);
const person = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: [...ALL], ...change });
const agent = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "agent:fixture", audience: "agent", project_id: projectId, permissions: [...ALL], runtime_session_id: "session-1", ...change });
/** How the Host or the service turns a caller away before anything is written: not offered to that audience, no issued plugin identity, or not the person. */
const REFUSED = code("actions.forbidden", "actions.audience_denied", "actions.not_found", "host.plugin_caller_invalid", "acceptance.scope");
const REQUIREMENTS = [{ id: "r1", statement: "三档并排", requires_person: false }, { id: "r2", statement: "发布前给你看一眼", requires_person: true }];

async function rig(t: Parameters<typeof backgroundRig>[0]) {
  const built = await backgroundRig(t, backgroundPlugin(() => ({ source: { surface: "example", title: "示例", icon: "list" }, tasks: [] })), ["A", "B"]);
  const served = await serveTestHost(t, { home: built.home, host: built.host });
  const a = built.project("A"), b = built.project("B"), client = built.host.actionClient(a);
  const call = <T = AcceptanceView>(caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown) =>
    client.invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input) as Promise<T>;
  const read = async () => (await call<AcceptanceReadResult>(person(a.project_id), acceptanceActions.read, { subjects: [SUBJECT] })).views[0]!;
  return { ...built, served, a, b, client, call, read };
}

test("APR-16: recovery with no pending intent does not create the acceptance library", { timeout: 60_000 }, async t => {
  const { home, a, host } = await rig(t);
  assert.equal(existsSync(join(home, "acceptance", "acceptance.db")), false, "the fixture has not used acceptance yet");
  await recoverAcceptanceCommits(host, home, async id => id === a.project_id ? a : null, a.project_id);
  assert.equal(existsSync(join(home, "acceptance", "acceptance.db")), false, "recovery must not create a library when there is nothing to recover");
});

test("S-acceptance-person-decides APR-15: only the person's own page call accepts or returns a requirement; an Agent, a workflow, an MCP client, a plugin and a call a plugin handed on are refused even holding the permission, and nothing is recorded", { timeout: 60_000 }, async t => {
  const { home, catalog, served, a, b, host, call, read } = await rig(t);
  await call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: REQUIREMENTS });
  await call(agent(a.project_id), acceptanceActions.deliver, { subject: SUBJECT, version: "v1" });
  const selection = { subject: SUBJECT, version: "v1", accepts: [{ id: "r2", version: 1 }], returns: [{ id: "r1", version: 1, note: "还差截图" }] };

  for (const [name, caller] of Object.entries({
    agent: agent(a.project_id), "the Assistant's own round": agent(a.project_id, { skill_round: { consumer: "assistant" } as ActionCallContext["skill_round"] }),
    workflow: person(a.project_id, { audience: "workflow" }), mcp: person(a.project_id, { audience: "mcp" }), plugin: person(a.project_id, { audience: "plugin" }),
    "handed on by a plugin": person(a.project_id, { delegated_by: "plugin.homebg", delegated_audience: "agent" }),
    "a plugin's caller": person(a.project_id, { calling_plugin_id: "plugin.homebg" }),
    "person bypassing protected trusted-decision entry": person(a.project_id, { actor_kind: "user", user_action: { source: "web", conversation_ref: "forged", message_ref: "forged" } }),
  })) {
    await assert.rejects(call(caller, acceptanceActions.decide, selection), REFUSED, name);
  }
  await assert.rejects(call(person(a.project_id, { permissions: [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION] }), acceptanceActions.decide, selection), code("actions.forbidden"), "the person without the permission");
  const untouched = await read();
  assert.deepEqual(untouched.requirements.map(one => [one.person, one.decision]), [["pending", null], ["pending", null]], "no refused call left a decision");

  // Only the protected trusted-decision entry redeems `acceptance.decide@1`, recording both the item decisions and the platform's ProjectTrustedDecision.
  const management = new LocalMcpServer(withCatalog, "management", null,
    { homeDirectory: home, runtimeContext: { runtime_id: "acceptance-mgmt-fixture", stable_work_context_id: "acceptance-fixture", host_declares_stable: true } },
    host, served.origin, async () => undefined);
  t.after(() => management.close());
  const dbPath = catalog.find(row => row.project_id === a.project_id)!.database_path;
  const mcp = async <T>(name: string, input: object) => JSON.parse(await management.callTool(name, { database_path: dbPath, project_id: a.project_id, ...input })) as T;
  const prepared = await mcp<ReviewRequest>("molis_work_v1_review_request", {
    action: { capability_id: acceptanceActions.decide.capability_id, version: 1, provider_id: ACCEPTANCE_PROVIDER_ID },
    request_id: acceptanceRequestId(SUBJECT),
    draft: { version: "v1", accepts: selection.accepts, returns: selection.returns },
  });
  const committed = await mcp<{ record: ProjectTrustedDecision }>("molis_work_v1_review_decide", { reference: prepared.reference, choice_id: "apply", request_key: "person-selection-1" });
  const decided = await read();
  assert.deepEqual(decided.requirements.map(one => [one.id, one.person, one.decision?.actor_id, one.decision?.decision_id]), [
    ["r1", "returned", LOCAL_PERSON_ACTOR_ID, committed.record.decision_id],
    ["r2", "accepted", LOCAL_PERSON_ACTOR_ID, committed.record.decision_id],
  ]);
  const storedDecision = await host.withProject(a, ({ store }) => projectReviewDecisions(store.db, a.project_id).findCommitted(committed.record.decision_id));
  assert.equal(storedDecision?.actor_id, LOCAL_PERSON_ACTOR_ID);
  const noPendingIntent = openAcceptance(home);
  try { assert.equal(noPendingIntent.service.pendingCommitIntents(a.project_id).length, 0, "a successful acceptance commit removes its durable intent"); }
  finally { noPendingIntent.close(); }
  assert.equal(storedDecision?.source.entry.source, "management");
  // After a delivery only the person changes what is asked.
  await assert.rejects(call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: [{ ...REQUIREMENTS[0]!, statement: "随便" }, REQUIREMENTS[1]!] }), code("acceptance.requirements_fixed"));
  // The record is the project's: the same object read in another project has nothing, and a call outside a project is refused.
  const elsewhere = (await host.actionClient(b).invoke(person(b.project_id), { capability_id: acceptanceActions.read.capability_id, version: 1, provider_id: ACCEPTANCE_PROVIDER_ID }, { subjects: [SUBJECT] }) as AcceptanceReadResult).views[0]!;
  assert.deepEqual([elsewhere.requirements.length, elsewhere.version], [0, null]);
  await assert.rejects(call(person(a.project_id, { permissions: [] }), acceptanceActions.read, { subjects: [SUBJECT] }), code("actions.forbidden"));
});

test("S-acceptance-evidence-tier PWA-144: the tier of a check is the platform's own finding; a report cannot carry one, the person cannot report, and evidence the Agent Host does not confirm as the caller's own round stays the reporter's word and satisfies nothing", { timeout: 60_000 }, async t => {
  const { a, call } = await rig(t);
  await call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: REQUIREMENTS });
  // A round the Agent Host does not know as this session's is not kept as where the version was made.
  await call(agent(a.project_id), acceptanceActions.deliver, { subject: SUBJECT, version: "v1", made_in: { run_id: "run-forged" } });
  const report = { requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "跑了测试", observed: "全过", evidence: [{ kind: "command_receipt", run_id: "run-forged", call_id: "c1" }] };
  for (const forged of [{ ...report, tier: "machine_checked" }, { ...report, gap: null }, { ...report, checked: { version: "v1", tier: "machine_checked" } }]) {
    await assert.rejects(call(agent(a.project_id), acceptanceActions.report, { subject: SUBJECT, reports: [forged] }), code("actions.input_invalid"), "a report that states its own tier is not a report");
  }
  await assert.rejects(call(agent(a.project_id), acceptanceActions.report, { subject: SUBJECT, reports: [report], trusted: { tier: "machine_checked" } }), code("actions.input_invalid"));
  await assert.rejects(call(person(a.project_id), acceptanceActions.report, { subject: SUBJECT, reports: [report] }), code("actions.forbidden", "actions.audience_denied", "actions.not_found"), "reporting is not the person's action");

  const view = await call(agent(a.project_id), acceptanceActions.report, { subject: SUBJECT, reports: [report] });
  const r1 = view.requirements[0]!;
  assert.deepEqual([r1.check?.tier, r1.verified, r1.satisfied, r1.person], ["self_reported", false, false, "pending"]);
  assert.ok(r1.gap && r1.gap !== "self_only", `a cited receipt that cannot be confirmed is a named gap (${r1.gap})`);
  // An outside client naming its own session is no platform session: the same report through MCP-shaped delegation backs nothing either.
  const outside = await call(agent(a.project_id, { audience: "workflow", runtime_session_id: "session-1" }), acceptanceActions.report, { subject: SUBJECT, reports: [{ ...report, requirement_id: "r2" }] });
  assert.deepEqual([outside.requirements[1]!.check?.tier, outside.requirements[1]!.gap, outside.complete], ["self_reported", "evidence_missing", false]);
});

test("S-acceptance-person-decides APR-15 APR-16: same ReviewReference across Assistant task and acceptance card, carry-over vs invalidation on re-delivery, expired request refusal, missing read permission refusal, and settled history reopen without Goals", { timeout: 90_000 }, async t => {
  let readerAvailable = true;
  const env = await openTestHome(t, {
    host: {
      actionAvailability: (_caller, view) => view.provider.plugin_id === "io.molis.work.todo" && !readerAvailable
        ? { available: false, code: "actions.forbidden", reason: "已收回原对象读取权限" }
        : { available: true },
    },
  });
  const project = await env.createProject("Acceptance APR-15/16", ["todo"]), pid = project.project_id, ref = project.reference;
  await env.host.homePlugins?.ready();
  const ledger = new HomeConsentLedger(env.home);
  const consent = ledger.consents("io.molis.work.goals").find(row => row.kind === "always_on" && row.revoked_at === null);
  if (consent) ledger.revoke(consent.consent_id, new Date().toISOString());
  await env.host.ensureWebCatalog(env.home).withCatalog({ homeDirectory: env.home },
    (catalog: { removeProjectPlugin(input: { project_id: string; plugin_id: string; actor_id: string }): unknown }) =>
      catalog.removeProjectPlugin({ project_id: pid, plugin_id: "goals", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const personCtx = await env.host.localPersonContext(ref);
  const preparedMetadata = await env.host.inspectPreparedActionMetadata(personCtx, ref) as ReadonlyArray<{ provider: { plugin_id?: string; project_id?: string | null; provider_id: string } }>;
  assert.equal(preparedMetadata.some(view => view.provider.plugin_id === "io.molis.work.goals" && view.provider.project_id === pid), false, "Goals is not active in this project");

  const management = new LocalMcpServer(withCatalog, "management", null,
    { homeDirectory: env.home, runtimeContext: { runtime_id: "apr-16-mgmt", stable_work_context_id: "apr-16-ctx", host_declares_stable: true } },
    env.host, env.origin, async () => undefined);
  t.after(() => management.close());
  const mcp = async <T>(name: string, input: object) => JSON.parse(await management.callTool(name, { database_path: project.database_path, project_id: pid, ...input })) as T;
  const decideAction = { capability_id: acceptanceActions.decide.capability_id, version: 1, provider_id: ACCEPTANCE_PROVIDER_ID };
  const agentCaller = agent(pid);
  const invoke = <T = AcceptanceView>(caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown) =>
    env.host.actionClient(ref).invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input) as Promise<T>;
  const approvalsPrefix = `/projects/${encodeURIComponent(pid)}/api/project-approvals`;
  const acceptancePrefix = `/projects/${encodeURIComponent(pid)}/api/acceptance`;
  const mainlinePrefix = `/projects/${encodeURIComponent(pid)}/api/mainline`;

  // 1. Same ReviewReference on Assistant background task AND acceptance card, redeemable from either door (APR-15, APR-16).
  await env.web.post(`/projects/${encodeURIComponent(pid)}/api/assistant/send`, {
    text: "整理定价对比表", request_id: "req-apr-16-work",
  }).catch(error => {
    if ((error as { code?: string })?.code !== "assistant.model_missing") throw error;
  });
  const listedWorks = await fetch(`${env.origin}/projects/${encodeURIComponent(pid)}/api/assistant/works`, {
    headers: { connection: "close", "x-molis-work-control-token": env.controlToken },
  }).then(res => res.json() as Promise<{ works: Array<{ work_id: string; main?: boolean }> }>);
  const workId = listedWorks.works.find(work => !work.main)!.work_id;
  const workSubject = { provider_id: "io.molis.work.assistant.rules", subject: { kind: "assistant_work", id: workId } };
  await invoke(agentCaller, acceptanceActions.set, { subject: workSubject, requirements: [
    { id: "r1", statement: "包含三档月付与年付", requires_person: true },
    { id: "r2", statement: "底部注明不含税", requires_person: true },
  ] });
  await invoke(agentCaller, acceptanceActions.deliver, { subject: workSubject, version: "v1" });
  await invoke(agentCaller, acceptanceActions.report, { subject: workSubject, reports: [
    { requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "自查", observed: "已对齐" },
  ] });

  const cardRead = await env.web.post<AcceptanceReadResult>(`${acceptancePrefix}/read`, { subjects: [workSubject] });
  const taskTable = await env.web.post<BackgroundTasksReadResult>(`${mainlinePrefix}/tasks`, {});
  const workLookup = { action: decideAction, request_id: acceptanceRequestId(workSubject) };
  const webReview = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, workLookup);
  const mcpReview = await mcp<ReviewRequest>("molis_work_v1_review_request", workLookup);
  const taskRow = taskTable.tasks.find(row => row.subject.kind === "assistant_work" && row.subject.id === workId);
  const taskDecision = taskRow?.decisions.find(dec => dec.id.startsWith(`acceptance:${workId}:`));
  assert.ok(taskDecision?.reference, "Assistant task row carries the acceptance ReviewReference");
  assert.deepEqual(cardRead.views[0]!.review_reference, webReview.reference, "acceptance card read carries the exact ReviewReference");
  assert.deepEqual(taskDecision!.reference, webReview.reference, "Assistant task decision carries the exact same ReviewReference");
  assert.deepEqual(mcpReview.reference, webReview.reference, "management MCP reads the exact same ReviewReference");

  // Forged direct call to `assistant.background.decide` with a synthesized `user_action` is refused.
  await assert.rejects(
    env.host.actionClient(ref).invoke(
      { ...personCtx, actor_kind: "user", audience: "user", user_action: { source: "web", conversation_ref: "forged", message_ref: "forged" } },
      { capability_id: "assistant.background.decide", version: 1, provider_id: "io.molis.work.assistant.rules" },
      { work_id: workId, review_id: `acceptance:${workId}`, version: webReview.reference.version, decision: "approve" },
    ),
    code("actions.forbidden"),
  );

  // Accept r1 via `/api/acceptance/decide`, then accept remaining r2 via Assistant task decision `/api/mainline/tasks/decide`.
  const afterR1 = await env.web.post<AcceptanceView>(`${acceptancePrefix}/decide`, { subject: workSubject, version: "v1", accepts: [{ id: "r1", version: 1 }], returns: [] });
  assert.equal(afterR1.requirements.find(item => item.id === "r1")?.person, "accepted");
  assert.equal(afterR1.requirements.find(item => item.id === "r2")?.person, "pending");
  assert.notEqual(afterR1.review_reference?.id, webReview.reference.id, "remaining open items get a fresh open ReviewReference");

  const nextTasks = await env.web.post<BackgroundTasksReadResult>(`${mainlinePrefix}/tasks`, {});
  const nextRow = nextTasks.tasks.find(row => row.subject.id === workId)!;
  const nextDecision = nextRow.decisions.find(dec => dec.id.startsWith(`acceptance:${workId}:`))!;
  assert.deepEqual(nextDecision.reference, afterR1.review_reference, "updated task decision and acceptance card stay on the same ReviewReference");
  await env.web.post(`${mainlinePrefix}/tasks/decide`, { source: nextRow.source, subject: nextRow.subject, decision: nextDecision.id, role: "approve" });
  const afterBoth = (await env.web.post<AcceptanceReadResult>(`${acceptancePrefix}/read`, { subjects: [workSubject] })).views[0]!;
  assert.deepEqual(afterBoth.requirements.map(item => item.person), ["accepted", "accepted"]);

  // 2. Re-delivery v1 -> v2 carry-over vs invalidation, expired request refusal, missing read permission refusal, and settled history reopen (APR-16).
  const gatedProvider = preparedMetadata.find(view => view.provider.plugin_id === "io.molis.work.todo")!.provider.provider_id;
  const gatedSubject = { provider_id: gatedProvider, subject: { kind: "todo_item", id: "todo-1" } };
  await invoke(agentCaller, acceptanceActions.set, { subject: gatedSubject, requirements: REQUIREMENTS });
  await invoke(agentCaller, acceptanceActions.deliver, { subject: gatedSubject, version: "v1" });
  const gatedLookup = { action: decideAction, request_id: acceptanceRequestId(gatedSubject) };
  const v1Gated = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, gatedLookup);
  const v1Committed = await env.web.post<{ record: ProjectTrustedDecision }>(`${approvalsPrefix}/decide`, {
    reference: v1Gated.reference, choice_id: "accept_all", request_key: "gated-v1-accept-all",
  });

  // Re-deliver v2 touching r2 only: r1 retains `person_accepted` pointing to v1's ReviewReference; r2's acceptance is invalidated.
  await invoke(agentCaller, acceptanceActions.deliver, { subject: gatedSubject, version: "v2", touches: ["r2"], summary: "重做 r2" });
  const v2Gated = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, gatedLookup);
  assert.deepEqual(v2Gated.requirements.find(req => req.id === "r1")?.evidence.find(ev => ev.tier === "person_accepted")?.decision, {
    reference: v1Gated.reference,
    decision_id: v1Committed.record.decision_id,
  });
  assert.equal(v2Gated.requirements.find(req => req.id === "r2")?.evidence.some(ev => ev.tier === "person_accepted"), false);
  assert.deepEqual(v2Gated.choices.filter(choice => choice.availability.available).map(choice => choice.id), ["accept_all", "accept:r2"]);

  // Expired decision request: disabled choices on read, refused with `actions.expired` on both Web and management MCP, zero writes.
  const expired = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, {
    ...gatedLookup,
    draft: { version: "v2", accepts: [{ id: "r2", version: 1 }], returns: [], expires_at: "2000-01-01T00:00:00.000Z" },
  });
  assert.deepEqual(expired.choices.map(choice => choice.availability), [
    { available: false, code: "actions.expired", reason: { literal: "原决定请求已过期" } },
  ]);
  assert.deepEqual(await mcp<ReviewRequest>("molis_work_v1_review_request", { reference: expired.reference }), expired);
  await assert.rejects(env.web.post(`${approvalsPrefix}/decide`, { reference: expired.reference, choice_id: "apply", request_key: "expired-web" }), { code: "actions.expired" });
  await assert.rejects(mcp("molis_work_v1_review_decide", { reference: expired.reference, choice_id: "apply", request_key: "expired-mcp" }), { code: "actions.expired" });

  // Caller without read permission on the underlying object or without `acceptance:read` is refused and gets zero requirement/evidence details.
  await assert.rejects(invoke(person(pid, { permissions: [] }), acceptanceActions.review, { request_id: gatedLookup.request_id }), code("actions.forbidden"));
  readerAvailable = false;
  try {
    await assert.rejects(env.web.post(`${approvalsPrefix}/request`, gatedLookup), { code: "actions.forbidden" });
    await assert.rejects(mcp("molis_work_v1_review_request", gatedLookup), { code: "actions.forbidden" });
  } finally {
    readerAvailable = true;
  }

  // Commit-stage refusal inside `projectReviewDecisions.commit` / `checkCommit` rolls back `acceptance.db` too (zero business records on either side).
  await env.host.withProject(ref, ({ store }) => {
    store.db.exec(`
      CREATE TRIGGER test_rule_change_mid_commit AFTER INSERT ON project_review_decisions
      BEGIN
        INSERT INTO project_approval_rules (id, project_id, scope_json, rule_order, requires_person, revision, state, created_by, created_at, reason, changed_by, changed_at, change_reason)
        VALUES ('mid-commit-rule', '${pid}', '{"kind":"project_default"}', 999, 1, 1, 'active', 'local:person', '2026-11-16T00:00:00.000Z', 'race', NULL, NULL, NULL);
      END
    `);
  });
  try {
    await assert.rejects(
      env.web.post(`${approvalsPrefix}/decide`, { reference: v2Gated.reference, choice_id: "accept:r2", request_key: "revoked-mid-commit" }),
      { code: "actions.conflict" },
    );
  } finally {
    await env.host.withProject(ref, ({ store }) => { store.db.exec("DROP TRIGGER IF EXISTS test_rule_change_mid_commit"); });
  }
  const afterRollback = (await env.web.post<AcceptanceReadResult>(`${acceptancePrefix}/read`, { subjects: [gatedSubject] })).views[0]!;
  assert.equal(afterRollback.requirements.find(item => item.id === "r2")?.person, "pending", "acceptance.db rolled back when projectReviewDecisions.commit rejected");
  assert.equal(await env.host.withProject(ref, ({ store }) => projectReviewDecisions(store.db, pid).forRequest(v2Gated.reference.id)), null);
  assert.equal(await env.host.withProject(ref, ({ store }) => projectApprovalRules(store.db, pid).read(false).rules.some(rule => rule.id === "mid-commit-rule")), false);

  // Applied decision history: settled v1 ReviewReference reopens frozen facts + decision receipt even after v2, and appears in authorization review history.
  const reopenedWeb = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, { reference: v1Gated.reference });
  const reopenedMcp = await mcp<ReviewRequest>("molis_work_v1_review_request", { reference: v1Gated.reference });
  assert.deepEqual(reopenedWeb, reopenedMcp);
  assert.deepEqual(reopenedWeb.decision, { reference: v1Gated.reference, decision_id: v1Committed.record.decision_id });
  assert.equal(reopenedWeb.choices.every(choice => !choice.availability.available), true);
  const historyRes = await fetch(`${env.origin}/api/settings/authorizations/reviews?project=${encodeURIComponent(pid)}`, {
    headers: { connection: "close", "x-molis-work-control-token": env.controlToken },
  });
  assert.equal(historyRes.status, 200);
  const historyRows = ((await historyRes.json()) as { rows: Array<{ id: string; person: string }> }).rows;
  assert.ok(historyRows.some(row => row.id === v1Committed.record.decision_id && row.person === LOCAL_PERSON_ACTOR_ID));
});

test("APR-15: an acceptance decision whose project commit did not land is recovered once from its durable commit intent", { timeout: 60_000 }, async t => {
  const { home, a, host, call } = await rig(t);
  await call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: REQUIREMENTS });
  await call(agent(a.project_id), acceptanceActions.deliver, { subject: SUBJECT, version: "v1" });
  const owner = { kind: "system" as const, scope: "project" as const, project_id: a.project_id, provider_id: ACCEPTANCE_PROVIDER_ID };
  const record: ProjectTrustedDecision = {
    decision_id: "recovery-decision",
    reference: { owner: { ...owner, kind: "trusted-decision" as const }, id: "recovery-request", version: "v1" },
    decision: "accept:r1", note: null, decided_at: "2026-11-17T00:00:00.000Z", actor_id: LOCAL_PERSON_ACTOR_ID,
    source: { kind: "person", actor_id: LOCAL_PERSON_ACTOR_ID, entry: { source: "web", conversation_ref: "web:recovery", message_ref: "web:recovery" } },
    request_key: "recovery-key", choice_fingerprint: "a".repeat(64), publisher_signature: `system:${ACCEPTANCE_PROVIDER_ID}`,
    review: { target: { owner, subject: { kind: "acceptance_subject", id: "recovery" }, version: "v1" }, requirements: [] },
  };
  const opened = openAcceptance(home);
  try {
    opened.service.decide({ project_id: a.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, person: true, session: null },
      { subject: SUBJECT, version: "v1", accepts: [{ id: "r1", version: 1 }], returns: [] }, record.decision_id,
      (_view, recordIntent) => recordIntent(record));
    assert.equal(opened.service.pendingCommitIntents(a.project_id).length, 1, "the acceptance transaction keeps the platform record as an intent");
  } finally { opened.close(); }
  assert.equal(await host.withProject(a, ({ store }) => projectReviewDecisions(store.db, a.project_id).findCommitted(record.decision_id)), null,
    "the simulated project commit failure leaves the platform record missing");
  await recoverAcceptanceCommits(host, home, async id => id === a.project_id ? a : null, a.project_id);
  const restored = await host.withProject(a, ({ store }) => projectReviewDecisions(store.db, a.project_id).findCommitted(record.decision_id));
  assert.equal(restored?.decision_id, record.decision_id);
  const after = openAcceptance(home);
  try { assert.equal(after.service.pendingCommitIntents(a.project_id).length, 0, "the intent is removed after the idempotent restore"); }
  finally { after.close(); }
  await recoverAcceptanceCommits(host, home, async id => id === a.project_id ? a : null, a.project_id);
  assert.equal(await host.withProject(a, ({ store }) => projectReviewDecisions(store.db, a.project_id).count()), 1, "a second recovery does not duplicate the decision");
});
