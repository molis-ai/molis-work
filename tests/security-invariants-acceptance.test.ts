import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { HomeConsentLedger, LocalMcpServer, composeAgentHost, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { BackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { ACCEPTANCE_DECIDE_PERMISSION, ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, acceptanceActions, acceptanceRequestId, type AcceptanceReadResult, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { pinnedArtifact } from "./fixtures/artifacts.js";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

/*
 * `system.acceptance` in a real Host (modules/acceptance; specs/proactive-assistant §7.3.1, specs/agent-approval APR-15, APR-16): the refusals
 * themselves and the protected trusted-decision entry. The project has no Goals in it; the object is a fixture plugin's or an Assistant work's.
 */

const ALL = [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, ACCEPTANCE_DECIDE_PERMISSION];
/** The fixture plugin's task; `rig` fills in the provider the Host registered the plugin's actions under. */
const SUBJECT = { provider_id: "", subject: { kind: "homebg_task", id: "j1" } };
const code = (...expected: string[]) => (error: unknown) => error instanceof ActionError && expected.includes(error.code);
const person = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: [...ALL, "homebg:read"], ...change });
/** An Agent that can read the fixture plugin's tasks (`homebg:read`), so it may deliver and report on one (S-acceptance-subject-owner). */
const agent = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "agent:fixture", audience: "agent", project_id: projectId, permissions: [...ALL, "homebg:read"], runtime_session_id: "session-1", ...change });
/** How the Host or the service turns a caller away before anything is written: not offered to that audience, no issued plugin identity, or not the person. */
const REFUSED = code("actions.forbidden", "actions.audience_denied", "actions.not_found", "host.plugin_caller_invalid", "acceptance.scope");
const REQUIREMENTS = [{ id: "r1", statement: "三档并排", requires_person: false }, { id: "r2", statement: "发布前给你看一眼", requires_person: true }];

async function rig(t: Parameters<typeof backgroundRig>[0]) {
  // The plugin reads its own tasks back, so an Agent that can read the task may deliver and report on it (S-acceptance-subject-owner).
  const built = await backgroundRig(t, backgroundPlugin(() => ({ source: { surface: "example", title: "示例", icon: "list" }, tasks: [] }), { reader: true }), ["A", "B"]);
  const served = await serveTestHost(t, { home: built.home, host: built.host });
  const a = built.project("A"), b = built.project("B"), client = built.host.actionClient(a);
  SUBJECT.provider_id = (await client.discover(agent(a.project_id))).find(view => view.capability_id === "homebg.task.read")!.provider.provider_id;
  const call = <T = AcceptanceView>(caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown) =>
    client.invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input) as Promise<T>;
  const read = async () => (await call<AcceptanceReadResult>(person(a.project_id), acceptanceActions.read, { subjects: [SUBJECT] })).views[0]!;
  return { ...built, served, a, b, client, call, read };
}

test("S-acceptance-person-decides APR-15: only the person's own page call accepts or returns a requirement; an Agent, a workflow, an MCP client, a plugin and a call a plugin handed on are refused even holding the permission, and nothing is recorded", { timeout: 60_000 }, async t => {
  const { home, catalog, served, a, b, host, call, read } = await rig(t);
  await call(person(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: REQUIREMENTS });
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
  assert.equal(storedDecision?.source.entry.source, "management");
  // An Agent is not the object's side, so it never changes what is asked (S-acceptance-subject-owner); after a delivery even the
  // object's own side cannot, only the person (the module's own test, acceptance.requirements_fixed).
  await assert.rejects(call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: [{ ...REQUIREMENTS[0]!, statement: "随便" }, REQUIREMENTS[1]!] }), code("acceptance.subject_unknown"));
  // The record is the project's: the same object read in another project has nothing, and a call outside a project is refused.
  const elsewhere = (await host.actionClient(b).invoke(person(b.project_id), { capability_id: acceptanceActions.read.capability_id, version: 1, provider_id: ACCEPTANCE_PROVIDER_ID }, { subjects: [SUBJECT] }) as AcceptanceReadResult).views[0]!;
  assert.deepEqual([elsewhere.requirements.length, elsewhere.version], [0, null]);
  await assert.rejects(call(person(a.project_id, { permissions: [] }), acceptanceActions.read, { subjects: [SUBJECT] }), code("actions.forbidden"));
});

test("S-acceptance-evidence-tier PWA-144: the tier of a check is the platform's own finding; a report cannot carry one, the person cannot report, and evidence the Agent Host does not confirm as the caller's own round stays the reporter's word and satisfies nothing", { timeout: 60_000 }, async t => {
  const { a, call } = await rig(t);
  await call(person(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: REQUIREMENTS });
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
  const workSubject = { provider_id: "system.assistant.rules", subject: { kind: "assistant_work", id: workId } };
  await invoke(person(pid), acceptanceActions.set, { subject: workSubject, requirements: [
    { id: "r1", statement: "包含三档月付与年付", requires_person: true },
    { id: "r2", statement: "底部注明不含税", requires_person: true },
  ] });
  // The Assistant's own round speaks for its work (the Host sets `acting_for` there, as `assistantActionContext` does).
  const workCaller = { ...agentCaller, acting_for: { provider_id: workSubject.provider_id, kind: workSubject.subject.kind, id: workId } };
  await invoke(workCaller, acceptanceActions.deliver, { subject: workSubject, version: "v1" });
  await invoke(workCaller, acceptanceActions.report, { subject: workSubject, reports: [
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
      { capability_id: "assistant.background.decide", version: 1, provider_id: "system.assistant.rules" },
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
  // The person here holds the todo reader's grant too, as the person on this machine does.
  const todoPerson = person(pid, { permissions: [...ALL, "todo:read"] });
  await invoke(todoPerson, acceptanceActions.set, { subject: gatedSubject, requirements: REQUIREMENTS });
  // The person delivers here: the item is never created, so only the person's check (the reader is available) passes.
  await invoke(todoPerson, acceptanceActions.deliver, { subject: gatedSubject, version: "v1" });
  const gatedLookup = { action: decideAction, request_id: acceptanceRequestId(gatedSubject) };
  const v1Gated = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, gatedLookup);
  const v1Committed = await env.web.post<{ record: ProjectTrustedDecision }>(`${approvalsPrefix}/decide`, {
    reference: v1Gated.reference, choice_id: "accept_all", request_key: "gated-v1-accept-all",
  });

  // Re-deliver v2 touching r2 only: r1 retains `person_accepted` pointing to v1's ReviewReference; r2's acceptance is invalidated.
  await invoke(todoPerson, acceptanceActions.deliver, { subject: gatedSubject, version: "v2", touches: ["r2"], summary: "重做 r2" });
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

  // Commit-stage refusal inside `projectReviewDecisions.commit` / `checkCommit` rolls back the acceptance rows too: they are in the same project library and the same transaction (zero business records).
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
  assert.equal(afterRollback.requirements.find(item => item.id === "r2")?.person, "pending", "the acceptance rows rolled back when projectReviewDecisions.commit rejected");
  assert.equal(await env.host.withProject(ref, ({ store }) => projectReviewDecisions(store.db, pid).forRequest(v2Gated.reference.id)), null);
  assert.equal(await env.host.withProject(ref, ({ store }) => projectApprovalRules(store.db, pid).read(false).rules.some(rule => rule.id === "mid-commit-rule")), false);

  // QEA-84: the second database's final COMMIT must not leave acceptance committed on its own.
  await env.host.withProject(ref, ({ store }) => {
    store.db.exec(`
      CREATE TABLE qea_acceptance_parent (id INTEGER PRIMARY KEY);
      CREATE TABLE qea_acceptance_child (parent_id INTEGER REFERENCES qea_acceptance_parent(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER qea_acceptance_final_commit AFTER INSERT ON project_review_decisions
      BEGIN INSERT INTO qea_acceptance_child(parent_id) VALUES (1); END;
    `);
  });
  const commitRequest = { reference: v2Gated.reference, choice_id: "accept:r2", request_key: "qea-final-commit" };
  try {
    await assert.rejects(env.web.post(`${approvalsPrefix}/decide`, commitRequest));
  } finally {
    await env.host.withProject(ref, ({ store }) => { store.db.exec("DROP TRIGGER qea_acceptance_final_commit; DROP TABLE qea_acceptance_child; DROP TABLE qea_acceptance_parent;"); });
  }
  const afterCommitRefusal = (await env.web.post<AcceptanceReadResult>(`${acceptancePrefix}/read`, { subjects: [gatedSubject] })).views[0]!;
  assert.equal(afterCommitRefusal.requirements.find(item => item.id === "r2")?.person, "pending", "final project COMMIT refusal must roll back the acceptance decision");
  assert.equal(await env.host.withProject(ref, ({ store }) => projectReviewDecisions(store.db, pid).forRequest(v2Gated.reference.id)), null);
  // QEA-85: the decision and its record commit in one library, so nothing runs after the COMMIT that could fail it; an answer lost after it
  // is the same-key retry, which reads the committed decision back and writes no second one.
  const recovered = await env.web.post<{ record: ProjectTrustedDecision; replayed: boolean }>(`${approvalsPrefix}/decide`, commitRequest);
  const repeated = await env.web.post<{ record: ProjectTrustedDecision; replayed: boolean }>(`${approvalsPrefix}/decide`, commitRequest);
  assert.equal(repeated.replayed, true, "a same-key retry reads back the committed decision");
  await env.host.withProject(ref, ({ store }) => {
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM acceptance_decisions WHERE decision_id=? AND requirement_id='r2'").get(recovered.record.decision_id)?.n, 1,
      "the same-key replay does not append another item decision");
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM project_review_decisions WHERE decision_id=?").get(recovered.record.decision_id)?.n, 1);
  });
  assert.equal(repeated.record.decision_id, recovered.record.decision_id, "same-key retry retains the original decision");
  const afterCommitRetry = (await env.web.post<AcceptanceReadResult>(`${acceptancePrefix}/read`, { subjects: [gatedSubject] })).views[0]!;
  assert.equal(afterCommitRetry.requirements.find(item => item.id === "r2")?.person, "accepted");
  assert.equal(afterCommitRetry.requirements.find(item => item.id === "r2")?.decision?.decision_id, recovered.record.decision_id);

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

test("S-acceptance-person-decides concurrent same-request_key decide commits one decision without ghost rows", { timeout: 60_000 }, async t => {
  const env = await openTestHome(t);
  const project = await env.createProject("Concurrent Decide", ["todo"]), pid = project.project_id, ref = project.reference;
  const todoPerson = person(pid, { permissions: [...ALL, "todo:read"] });
  const preparedMetadata = await env.host.inspectPreparedActionMetadata(todoPerson, ref) as ReadonlyArray<{ provider: { plugin_id?: string; provider_id: string } }>;
  const providerId = preparedMetadata.find(view => view.provider.plugin_id === "io.molis.work.todo")!.provider.provider_id;
  const subject = { provider_id: providerId, subject: { kind: "todo_item", id: "todo-concurrent-1" } };
  const invoke = <T = AcceptanceView>(caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown) =>
    env.host.actionClient(ref).invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input) as Promise<T>;
  await invoke(todoPerson, acceptanceActions.set, { subject, requirements: [{ id: "r1", statement: "并发不写幽灵行", requires_person: true }] });
  await invoke(todoPerson, acceptanceActions.deliver, { subject, version: "v1" });

  const approvalsPrefix = `/projects/${encodeURIComponent(pid)}/api/project-approvals`;
  const acceptancePrefix = `/projects/${encodeURIComponent(pid)}/api/acceptance`;
  const prepared = await env.web.post<ReviewRequest>(`${approvalsPrefix}/request`, {
    action: { capability_id: acceptanceActions.decide.capability_id, version: 1, provider_id: ACCEPTANCE_PROVIDER_ID },
    request_id: acceptanceRequestId(subject),
  });
  const payload = { reference: prepared.reference, choice_id: "accept:r1", request_key: "concurrent-same-key-race" };
  const [first, second] = await Promise.all([
    env.web.post<{ record: ProjectTrustedDecision; replayed: boolean }>(`${approvalsPrefix}/decide`, payload),
    env.web.post<{ record: ProjectTrustedDecision; replayed: boolean }>(`${approvalsPrefix}/decide`, payload),
  ]);
  assert.equal(first.record.decision_id, second.record.decision_id, "both concurrent responses converge on the same committed decision");
  assert.equal([first.replayed, second.replayed].filter(Boolean).length, 1, "exactly one call committed and the other replayed");
  await env.host.withProject(ref, ({ store }) => {
    const itemRows = store.db.prepare("SELECT decision_id FROM acceptance_decisions").all() as Array<{ decision_id: string }>;
    const voucherRows = store.db.prepare("SELECT decision_id FROM project_review_decisions").all() as Array<{ decision_id: string }>;
    assert.deepEqual(itemRows.map(r => r.decision_id), [first.record.decision_id], "no unvouched ghost row in acceptance_decisions");
    assert.deepEqual(voucherRows.map(r => r.decision_id), [first.record.decision_id]);
  });
  const after = (await env.web.post<AcceptanceReadResult>(`${acceptancePrefix}/read`, { subjects: [subject] })).views[0]!;
  assert.deepEqual([after.requirements[0]!.person, after.requirements[0]!.awaiting_voucher, after.requirements[0]!.satisfied], ["accepted", false, true]);
});

test("S-acceptance-evidence-tier EVD-14 EVD-41 EVD-42: real AgentHost weighs machine_checked, peer_reviewed, and evidence_unreadable; mid-flight revoke and abort write nothing", { timeout: 60_000 }, async t => {
  const { home, a, host, call, read } = await rig(t);
  const composition = host.ensureAgentService(home, () => composeAgentHost({ localHost: host, homeDirectory: home, workspaceFor: () => null }));
  let onCheckRun: (() => Promise<void> | void) | undefined;
  const unused = async (): Promise<never> => { throw new Error("Not used by this fixture"); };
  composition.agentHost.register({
    descriptor: { runtime_id: "fixture-evidence", display_name: "Evidence fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    createSession: unused, start: unused, control: unused, observe() { throw new Error("Not used by this fixture"); },
    readSession: async (session: { runtime_id: string; session_id: string }) => {
      if (session.session_id === "s-broken") throw new Error("store unavailable");
      if (session.session_id !== "s-worker") throw new ActionError("agent.session_unknown", "找不到这条会话");
      return { session, owner: { project_id: a.project_id, plugin_id: "io.molis.work.pages", install_id: "installed", actor_id: LOCAL_PERSON_ACTOR_ID }, title: "Worker", runs: [{ session_id: "s-worker", run_id: "r-made" }] } as never;
    },
    read: async (run: unknown) => {
      await onCheckRun?.();
      return { ref: run, command_outputs: [{ call_id: "c-pass" }, { call_id: "c-fail" }],
        activity: [{ call_id: "w1", name: "edit", state: "completed", sequence: 1 }, { call_id: "c-fail", name: "command", state: "completed", sequence: 2 }, { call_id: "c-pass", name: "command", state: "completed", sequence: 3 }] } as never;
    },
    readCommandOutput: async (_session: unknown, output: { call_id: string }) =>
      ({ ref: output, command: "node --test", exit_code: output.call_id === "c-pass" ? 0 : 1, stdout: "", stderr: "", truncated: false }) as never,
  } as AgentRuntimeAdapter);
  await host.withProject(a, ({ store }) => {
    openProjectVersionStores(store).artifacts.commands.registerVersion({
      project_id: a.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, artifact_id: "art-evd", version: 1,
      artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
      producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
      content: { kind: "inline", payload: { title: "报告", body: { type: "doc", content: [] } } },
      ...pinnedArtifact("报告", { kind: "document", id: "art-evd" }),
    });
  });

  const worker = (extra: Partial<ActionCallContext> = {}) => agent(a.project_id, {
    permissions: [...ALL, "homebg:read", "artifacts:read", "agent:evidence:read"],
    runtime_session_id: "s-worker", agent_runtime_id: "fixture-evidence", ...extra,
  });
  const reviewer = (extra: Partial<ActionCallContext> = {}) => agent(a.project_id, {
    permissions: [...ALL, "homebg:read", "artifacts:read", "agent:evidence:read"],
    runtime_session_id: "s-reviewer", agent_runtime_id: "fixture-evidence", ...extra,
  });
  await call(person(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: [
    { id: "r-machine", statement: "机器核验通过", requires_person: false },
    { id: "r-peer", statement: "同行复核通过", requires_person: false },
  ] });
  await call(worker(), acceptanceActions.deliver, { subject: SUBJECT, version: "v1", made_in: { run_id: "r-made" } });

  // EVD-14 & mid-flight revocation during async checkRun: abort or revoke after lookup writes nothing.
  const abortController = new AbortController();
  onCheckRun = () => { abortController.abort(new ActionError("actions.cancelled", "已中止")); };
  await assert.rejects(call(worker({ signal: abortController.signal }), acceptanceActions.report, {
    subject: SUBJECT,
    reports: [{ requirement_id: "r-machine", verdict: "supports", checked: { version: "v1" }, method: "test", observed: "ok", evidence: [{ kind: "command_receipt", run_id: "r-made", call_id: "c-pass" }] }],
  }), code("actions.cancelled"));
  assert.equal((await read()).requirements[0]!.check, null, "EVD-14: aborted report writes nothing");

  let revokedMidFlight = false;
  onCheckRun = () => { revokedMidFlight = true; };
  await assert.rejects(call(worker({
    assert_authority_current: () => { if (revokedMidFlight) throw new ActionError("actions.forbidden", "权限已中途撤回"); },
  }), acceptanceActions.report, {
    subject: SUBJECT,
    reports: [{ requirement_id: "r-machine", verdict: "supports", checked: { version: "v1" }, method: "test", observed: "ok", evidence: [{ kind: "command_receipt", run_id: "r-made", call_id: "c-pass" }] }],
  }), code("actions.forbidden"));
  assert.equal((await read()).requirements[0]!.check, null, "mid-flight revoked report writes nothing");

  // EVD-41: real AgentHost verifies command receipt -> machine_checked; failed command -> check_failed.
  onCheckRun = undefined;
  const failedCmd = await call(worker(), acceptanceActions.report, {
    subject: SUBJECT,
    reports: [{ requirement_id: "r-machine", verdict: "supports", checked: { version: "v1" }, method: "test", observed: "fail", evidence: [{ kind: "command_receipt", run_id: "r-made", call_id: "c-fail" }] }],
  });
  assert.deepEqual([failedCmd.requirements[0]!.check?.tier, failedCmd.requirements[0]!.check?.gap, failedCmd.requirements[0]!.verified], ["self_reported", "check_failed", false]);

  const machineOk = await call(worker(), acceptanceActions.report, {
    subject: SUBJECT,
    reports: [{ requirement_id: "r-machine", verdict: "supports", checked: { version: "v1" }, method: "test", observed: "pass", evidence: [{ kind: "command_receipt", run_id: "r-made", call_id: "c-pass" }] }],
  });
  assert.deepEqual([machineOk.requirements[0]!.check?.tier, machineOk.requirements[0]!.check?.gap, machineOk.requirements[0]!.verified, machineOk.requirements[0]!.satisfied], ["machine_checked", null, true, true]);

  // EVD-42: unreadable artifact -> evidence_unreadable; another platform session with readable artifact -> peer_reviewed.
  const unreadableArt = await call(reviewer(), acceptanceActions.report, {
    subject: SUBJECT,
    reports: [{ requirement_id: "r-peer", verdict: "supports", checked: { version: "v1" }, method: "review", observed: "missing", evidence: [{ kind: "artifact_version", artifact_id: "art-nonexistent", version: 1 }] }],
  });
  assert.deepEqual([unreadableArt.requirements[1]!.check?.tier, unreadableArt.requirements[1]!.check?.gap, unreadableArt.requirements[1]!.verified], ["self_reported", "evidence_unreadable", false]);

  const artCheck = await host.actionClient(a).invoke(reviewer(), { capability_id: "artifacts.read", version: 1 }, { reference: { artifact_id: "art-evd", version: 1 } }) as { selected: unknown };
  assert.ok(artCheck.selected, "reviewer can read the registered artifact");
  const peerOk = await call(reviewer(), acceptanceActions.report, {
    subject: SUBJECT,
    reports: [{ requirement_id: "r-peer", verdict: "supports", checked: { version: "v1" }, method: "review", observed: "good", evidence: [{ kind: "artifact_version", artifact_id: "art-evd", version: 1 }] }],
  });
  assert.deepEqual([peerOk.requirements[1]!.check?.tier, peerOk.requirements[1]!.check?.gap, peerOk.requirements[1]!.verified, peerOk.requirements[1]!.satisfied], ["peer_reviewed", null, true, true]);
});

