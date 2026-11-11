import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { pinnedArtifact } from "./fixtures/artifacts.js";

/*
 * The evidence contract on a real Host (batch 24-3, user decisions 2026-11-11): `goals.events.report` asks the 成果库 and the agent
 * Host, as its caller, about what a judgment's basis cites, before it saves anything. The agent Host's Runtime here is a fixture that
 * knows one session ("s-worker") with one round ("r-made"), which ran a command that passed and one that failed.
 */

const MAKER = "io.molis.work.pages", ARTIFACT = "evidence-report";
const V1 = { artifact_id: ARTIFACT, version: 1 }, V2 = { artifact_id: ARTIFACT, version: 2 };
const basis = (checked: typeof V1, calls: string[] = []) => ({ checked, method: "跑了项目的测试", observed: "全部通过", evidence: calls.map(call_id => ({ kind: "command_receipt", run_id: "r-made", call_id })) });

async function evidenceProject(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "goal-evidence-host-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "evidence", actor_id: "user" }));
  const project_id = project.project_id, ref = molisWorkHostProjectReference({ projectId: project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const composition = host.ensureAgentService(home, () => composeAgentHost({ localHost: host, homeDirectory: home, workspaceFor: () => null }));
  const unused = async (): Promise<never> => { throw new Error("Not used by this fixture"); };
  const lookups = { commands: 0 };
  composition.agentHost.register({
    descriptor: { runtime_id: "fixture-evidence", display_name: "Evidence fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    createSession: unused, start: unused, control: unused, observe() { throw new Error("Not used by this fixture"); },
    readSession: async (session: { runtime_id: string; session_id: string }) => {
      if (session.session_id === "s-broken") throw new Error("store unavailable");
      if (session.session_id !== "s-worker") throw new ActionError("agent.session_unknown", "找不到这条会话");
      return { session, owner: { project_id, plugin_id: MAKER, install_id: "installed", actor_id: LOCAL_PERSON_ACTOR_ID }, title: "Worker", runs: [{ session_id: "s-worker", run_id: "r-made" }] } as never;
    },
    read: async (run: unknown) => ({ ref: run, command_outputs: [{ call_id: "c-pass" }, { call_id: "c-fail" }],
      activity: [{ call_id: "w1", name: "edit", state: "completed", sequence: 1 }, { call_id: "c-fail", name: "command", state: "completed", sequence: 2 }, { call_id: "c-pass", name: "command", state: "completed", sequence: 3 }] }) as never,
    readCommandOutput: async (_session: unknown, output: { call_id: string }) => { lookups.commands += 1; return { ref: output, command: "node --test", exit_code: output.call_id === "c-pass" ? 0 : 1, stdout: "", stderr: "", truncated: false } as never; },
  } as AgentRuntimeAdapter);
  const store = new LocalProjectDatabase(project.database_path), library = openProjectVersionStores(store);
  t.after(async () => { store.close(); await host.close(); await rm(home, { recursive: true, force: true }); });
  // Two versions of one report, each fixed from the round "r-made" by the plugin that owns the worker's session.
  for (const version of [1, 2]) library.artifacts.commands.registerVersion({ project_id, actor_id: LOCAL_PERSON_ACTOR_ID, artifact_id: ARTIFACT, version,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1, producer: { plugin_id: MAKER, plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "报告", body: { type: "doc", content: [] } } }, ...pinnedArtifact("报告", { kind: "pages_document", id: ARTIFACT }, "r-made"),
    ...(version > 1 ? { supersedes_version: version - 1 } : {}) });
  const as = (context: Partial<ActionCallContext>) => bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:worker", audit_actor_id: "runtime:worker:session", actor_kind: "runtime",
    audience: "agent", project_id, permissions: ["goals:read", "goals:write", "attention:write", "artifacts:read"], ...context }) as ActionCallContext);
  const web = bindActionClient(host.actionClient(ref), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id,
    permissions: ["goals:read", "goals:write", "goals:decide", "attention:write", "context-ledger:write", "artifacts:read"], user_action: { source: "web", conversation_ref: "web:evidence", message_ref: "web:click" } }));
  const worker = as({ runtime_session_id: "s-worker" }), reviewer = as({ actor_id: "runtime:reviewer", audit_actor_id: "runtime:reviewer:session", runtime_session_id: "s-reviewer" });
  const goal = async (goal_id: string, requirements: Array<{ id: string; human?: boolean }>) => {
    await worker.invoke(goalsActions.create, { goal_id, title: goal_id, outcome: "结果可以检查", idempotency_key: `create-${goal_id}`,
      requirements: requirements.map(item => ({ requirement_id: item.id, statement: `要求 ${item.id}`, ...(item.human ? { human_decision_required: true } : {}) })) });
    await worker.invoke(goalsActions.configure, { goal_id, expected_version: 0, idempotency_key: `configure-${goal_id}`,
      types: [{ type_id: "work", version: 1, name: "交付", purpose: "保留事实", fields: [{ field_id: "body", name: "正文", purpose: "原文", format: "longtext", required: true }] }],
      requirement_bindings: requirements.map(item => ({ type_id: "work", requirement_id: item.id })) });
    await web.invoke(goalsActions.deliverablesAdd, { goal_id, reference: V1 });
  };
  let key = 0;
  const report = (client: typeof worker, goal_id: string, requirement_id: string, judgment: Record<string, unknown>) => client.invoke(goalsActions.report, { goal_id, idempotency_key: `report-${goal_id}-${key += 1}`,
    events: [{ type_id: "work", type_version: 1, title: "交付", fields: { body: "已交付" }, judgments: [{ requirement_id, verdict: "supports", ...judgment }] }] } as never);
  const state = async (goal_id: string, requirement_id: string) => (await worker.invoke(goalsActions.state, { goal_id })).requirements.find(item => item.requirement_id === requirement_id)!;
  return { as, web, worker, reviewer, goal, report, state, lookups };
}

test("EVD-40: the reporter cannot say how far its own judgment is backed, and a basis must name a confirmed deliverable; a refused report saves nothing", async t => {
  const { worker, goal, report, state } = await evidenceProject(t);
  await goal("refused", [{ id: "r1" }]);
  const cursor = (await worker.invoke(goalsActions.state, { goal_id: "refused" })).goal_event_cursor;
  await assert.rejects(report(worker, "refused", "r1", { basis: basis(V1), tier: "machine_verified" }), { code: "actions.input_invalid" }, "a tier in the judgment");
  await assert.rejects(report(worker, "refused", "r1", { basis: { ...basis(V1), tier: "machine_verified" } }), { code: "actions.input_invalid" }, "a tier in the basis");
  await assert.rejects(worker.invoke(goalsActions.report, { goal_id: "refused", idempotency_key: "report-trusted", trusted: { reporter_session: "s-worker", assessments: {} },
    events: [{ type_id: "work", type_version: 1, title: "交付", fields: { body: "已交付" }, judgments: [{ requirement_id: "r1", verdict: "supports", basis: basis(V1) }] }] } as never), { code: "actions.input_invalid" }, "a trusted field beside the events");
  // Version 2 is in the 成果库 but the person has not confirmed it as this Goal's deliverable.
  await assert.rejects(report(worker, "refused", "r1", { basis: basis(V2, ["c-pass"]) }), { code: "goals.event_report.basis_not_deliverable" });
  assert.equal((await worker.invoke(goalsActions.state, { goal_id: "refused" })).goal_event_cursor, cursor);
  assert.equal((await state("refused", "r1")).current_report, null);
});

test("EVD-41: a command the platform ran in the round that made the delivered version meets the requirement; a failed command, a caller with no session and one that may not read the version do not", async t => {
  const { as, worker, goal, report, state } = await evidenceProject(t);
  await goal("verified", [{ id: "r1" }, { id: "r-human", human: true }]);
  const found = async (requirement = "r1") => { const now = await state("verified", requirement); return [now.current_report?.tier, now.current_report?.gap, now.currently_satisfied, now.satisfied_by]; };

  await report(as({}), "verified", "r1", { basis: basis(V1, ["c-pass"]) });
  assert.deepEqual(await found(), ["self_reported", "evidence_missing", false, null], "no session behind the call");
  await report(as({ runtime_session_id: "s-worker", permissions: ["goals:read", "goals:write", "attention:write"] }), "verified", "r1", { basis: basis(V1, ["c-pass"]) });
  assert.deepEqual(await found(), ["self_reported", "evidence_unreadable", false, null], "the caller may not read the 成果库");
  await report(worker, "verified", "r1", { basis: basis(V1, ["c-pass", "c-fail"]) });
  assert.deepEqual(await found(), ["self_reported", "check_failed", false, null], "one of the cited commands failed");
  await report(worker, "verified", "r1", { basis: basis(V1, ["c-never-ran"]) });
  assert.deepEqual(await found(), ["self_reported", "evidence_missing", false, null], "a command the round never ran");
  await report(as({ runtime_session_id: "s-reviewer" }), "verified", "r1", { basis: basis(V1, ["c-pass"]) });
  assert.deepEqual(await found(), ["self_reported", "subject_mismatch", false, null], "another session citing the worker's round");

  await report(worker, "verified", "r1", { basis: basis(V1, ["c-pass"]) });
  assert.deepEqual(await found(), ["machine_verified", null, true, "machine_verified"]);
  // The same proof does not stand in for the person where the requirement asks for them.
  await report(worker, "verified", "r-human", { basis: basis(V1, ["c-pass"]) });
  assert.deepEqual(await found("r-human"), ["machine_verified", null, false, null]);
});

test("EVD-42: another session's review meets the requirement once the worker has reported it done; the worker repeating itself does not", async t => {
  const { as, worker, reviewer, goal, report, state } = await evidenceProject(t);
  await goal("reviewed", [{ id: "r1" }]);
  const found = async () => { const now = await state("reviewed", "r1"); return [now.current_report?.tier, now.currently_satisfied, now.satisfied_by]; };
  // A reviewer who speaks before any worker has is nobody's reviewer yet.
  await report(reviewer, "reviewed", "r1", { basis: basis(V1) });
  assert.deepEqual(await found(), ["self_reported", false, null]);
  await report(worker, "reviewed", "r1", { basis: basis(V1) });
  await report(worker, "reviewed", "r1", { basis: basis(V1) });
  assert.deepEqual(await found(), ["self_reported", false, null], "the session that made the version, twice");
  // That first reviewer spoke on its own word, so it is one of the workers now; a third session is the review.
  await report(reviewer, "reviewed", "r1", { basis: basis(V1) });
  assert.deepEqual(await found(), ["self_reported", false, null]);
  // An external client that names a session for itself is not a platform session, whatever session it names (review M5).
  await report(as({ audience: "mcp", actor_id: "runtime:external", audit_actor_id: "runtime:external:s-external", runtime_session_id: "s-external" }), "reviewed", "r1", { basis: basis(V1) });
  assert.deepEqual([...await found(), (await state("reviewed", "r1")).current_report?.gap], ["self_reported", false, null, "evidence_missing"], "an MCP client naming its own session");
  // A session the platform could not read may be the worker's own: not answered, it is no review (review M2).
  await report(as({ actor_id: "runtime:broken", audit_actor_id: "runtime:broken:session", runtime_session_id: "s-broken" }), "reviewed", "r1", { basis: basis(V1) });
  assert.deepEqual([...await found(), (await state("reviewed", "r1")).current_report?.gap], ["self_reported", false, null, "evidence_unreadable"], "a session that could not be read");
  await report(as({ actor_id: "runtime:second", audit_actor_id: "runtime:second:session", runtime_session_id: "s-second-reviewer" }), "reviewed", "r1", { basis: basis(V1) });
  assert.deepEqual(await found(), ["peer_reviewed", true, "peer_reviewed"]);
});

test("EVD-18: a report repeated under its idempotency key is answered from its record: the evidence is not looked up again, and the same key with other content is still refused", async t => {
  const { worker, goal, state, lookups } = await evidenceProject(t);
  await goal("repeated", [{ id: "r1" }]);
  const events = (body: string) => [{ type_id: "work", type_version: 1, title: "交付", fields: { body }, judgments: [{ requirement_id: "r1", verdict: "supports", basis: basis(V1, ["c-pass"]) }] }];
  const first = await worker.invoke(goalsActions.report, { goal_id: "repeated", idempotency_key: "report-once", events: events("已交付") } as never);
  assert.equal(first.replayed, false);
  assert.equal((await state("repeated", "r1")).current_report?.tier, "machine_verified");
  const asked = lookups.commands;
  assert.ok(asked > 0, "the first report read the command's receipt");
  const again = await worker.invoke(goalsActions.report, { goal_id: "repeated", idempotency_key: "report-once", events: events("已交付") } as never);
  assert.equal(again.replayed, true);
  await assert.rejects(worker.invoke(goalsActions.report, { goal_id: "repeated", idempotency_key: "report-once", events: events("另一份内容") } as never), { code: "goals.request.idempotency_key_reused" });
  assert.equal(lookups.commands, asked, "neither repeat asked the platform about the commands again");
  assert.equal((await state("repeated", "r1")).current_report?.tier, "machine_verified");
});
