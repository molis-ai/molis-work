import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACCEPTANCE_DECIDE_PERMISSION, ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, acceptanceActions, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";

/*
 * `system.acceptance` in a real Host (modules/acceptance; specs/proactive-assistant §7.3.1, specs/agent-approval APR-15): the refusals
 * themselves. The project has no Goals in it; the object is a fixture plugin's.
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
  const a = built.project("A"), b = built.project("B"), client = built.host.actionClient(a);
  const call = <T = AcceptanceView>(caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown) =>
    client.invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input) as Promise<T>;
  const read = () => call(person(a.project_id), acceptanceActions.read, { subject: SUBJECT });
  return { ...built, a, b, client, call, read };
}

test("S-acceptance-person-decides APR-15: only the person's own page call accepts or returns a requirement; an Agent, a workflow, an MCP client, a plugin and a call a plugin handed on are refused even holding the permission, and nothing is recorded", { timeout: 60_000 }, async t => {
  const { a, b, host, call, read } = await rig(t);
  await call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: REQUIREMENTS });
  await call(agent(a.project_id), acceptanceActions.deliver, { subject: SUBJECT, version: "v1" });
  const selection = { subject: SUBJECT, version: "v1", accepts: [{ id: "r2", version: 1 }], returns: [{ id: "r1", version: 1, note: "还差截图" }] };

  for (const [name, caller] of Object.entries({
    agent: agent(a.project_id), "the Assistant's own round": agent(a.project_id, { skill_round: { consumer: "assistant" } as ActionCallContext["skill_round"] }),
    workflow: person(a.project_id, { audience: "workflow" }), mcp: person(a.project_id, { audience: "mcp" }), plugin: person(a.project_id, { audience: "plugin" }),
    "handed on by a plugin": person(a.project_id, { delegated_by: "plugin.homebg", delegated_audience: "agent" }),
    "a plugin's caller": person(a.project_id, { calling_plugin_id: "plugin.homebg" }),
  })) {
    await assert.rejects(call(caller, acceptanceActions.decide, selection), REFUSED, name);
  }
  await assert.rejects(call(person(a.project_id, { permissions: [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION] }), acceptanceActions.decide, selection), code("actions.forbidden"), "the person without the permission");
  const untouched = await read();
  assert.deepEqual(untouched.requirements.map(one => [one.person, one.decision]), [["pending", null], ["pending", null]], "no refused call left a decision");

  // The person's own call is the one that counts, and it is recorded as theirs.
  const decided = await call(person(a.project_id), acceptanceActions.decide, selection);
  assert.deepEqual(decided.requirements.map(one => [one.id, one.person, one.decision?.actor_id]), [["r1", "returned", LOCAL_PERSON_ACTOR_ID], ["r2", "accepted", LOCAL_PERSON_ACTOR_ID]]);
  // After a delivery only the person changes what is asked.
  await assert.rejects(call(agent(a.project_id), acceptanceActions.set, { subject: SUBJECT, requirements: [{ ...REQUIREMENTS[0]!, statement: "随便" }, REQUIREMENTS[1]!] }), code("acceptance.requirements_fixed"));
  // The record is the project's: the same object read in another project has nothing, and a call outside a project is refused.
  const elsewhere = await host.actionClient(b).invoke(person(b.project_id), { capability_id: acceptanceActions.read.capability_id, version: 1, provider_id: ACCEPTANCE_PROVIDER_ID }, { subject: SUBJECT }) as AcceptanceView;
  assert.deepEqual([elsewhere.requirements.length, elsewhere.version], [0, null]);
  await assert.rejects(call(person(a.project_id, { permissions: [] }), acceptanceActions.read, { subject: SUBJECT }), code("actions.forbidden"));
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
