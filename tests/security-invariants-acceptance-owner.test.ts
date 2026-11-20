import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACCEPTANCE_DECIDE_PERMISSION, ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, acceptanceActions,
  type AcceptanceReadResult, type AcceptanceSubject, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { BACKGROUND_PLUGIN_ID, backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";

/*
 * S-acceptance-subject-owner (contract-design §10.3): who may write to or read an object's requirements on the platform. `set` only the
 * object's own side — its provider plugin, the Host acting for it (`acting_for`), the person; `deliver`, `report` and `read` also anyone
 * who can read that very object through its owner's declared reader. A refused call writes nothing and says nothing of the object.
 * A Host's `acting_for` is never a plugin's to hand on. The person's own review and decision entries are in
 * `tests/security-invariants-acceptance.test.ts`.
 */

const ALL = [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, ACCEPTANCE_DECIDE_PERMISSION];
const code = (...expected: string[]) => (error: unknown) => error instanceof ActionError && expected.includes(error.code);
const UNKNOWN = code("acceptance.subject_unknown");
const person = (projectId: string): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: [...ALL, "homebg:read"] });
const agent = (projectId: string, change: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "agent:fixture", audience: "agent", project_id: projectId,
  permissions: [...ALL, "homebg:read"], runtime_session_id: "session-1", ...change });
const REQUIREMENTS = [{ id: "r1", statement: "三档并排", requires_person: false }];

async function rig(t: Parameters<typeof backgroundRig>[0], options: { reader: boolean; relay?: boolean }) {
  const built = await backgroundRig(t, backgroundPlugin(() => ({ source: { surface: "example", title: "示例", icon: "list" }, tasks: [] }), options), ["A"]);
  const a = built.project("A"), client = built.host.actionClient(a);
  const provider = (await client.discover(person(a.project_id))).find(view => view.provider.plugin_id === BACKGROUND_PLUGIN_ID)!.provider.provider_id;
  const subject: AcceptanceSubject = { provider_id: provider, subject: { kind: "homebg_task", id: "j1" } };
  const call = <T = AcceptanceView>(caller: ActionCallContext, action: { capability_id: string; version: number }, input: unknown, providerId = ACCEPTANCE_PROVIDER_ID) =>
    client.invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: providerId }, input) as Promise<T>;
  const read = async () => (await call<AcceptanceReadResult>(person(a.project_id), acceptanceActions.read, { subjects: [subject] })).views[0]!;
  return { a, provider, subject, call, read };
}

test("S-acceptance-subject-owner: only the object's own side sets its requirements; anyone else must read the very object, and a refusal writes nothing", { timeout: 90_000 }, async t => {
  const { a, subject, call, read } = await rig(t, { reader: true });
  const pid = a.project_id;
  // An Agent that can read the task is still not the task's side: it may not say what is asked.
  await assert.rejects(call(agent(pid), acceptanceActions.set, { subject, requirements: REQUIREMENTS }), UNKNOWN);
  assert.deepEqual((await read()).requirements, [], "nothing was written");
  // The Host acting for the task (as it does for an Assistant work's own round) is the task's side.
  await call(agent(pid, { acting_for: { provider_id: subject.provider_id, kind: subject.subject.kind, id: subject.subject.id } }), acceptanceActions.set, { subject, requirements: REQUIREMENTS });
  // acting_for names one object: another object of the same plugin is not this caller's to set.
  const other = { ...subject, subject: { ...subject.subject, id: "j2" } };
  await assert.rejects(call(agent(pid, { acting_for: { provider_id: subject.provider_id, kind: subject.subject.kind, id: "j1" } }), acceptanceActions.set, { subject: other, requirements: REQUIREMENTS }), UNKNOWN);

  // Without the plugin's read permission an Agent cannot read the task, so it can neither deliver, report on, nor read its requirements.
  const blind = agent(pid, { permissions: ALL });
  await assert.rejects(call(blind, acceptanceActions.deliver, { subject, version: "v1" }), UNKNOWN);
  await assert.rejects(call(blind, acceptanceActions.report, { subject, reports: [{ requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "看", observed: "对" }] }), UNKNOWN);
  await assert.rejects(call<AcceptanceReadResult>(blind, acceptanceActions.read, { subjects: [subject] }), UNKNOWN);
  assert.deepEqual([(await read()).round, (await read()).version], [0, null], "no delivery was recorded");
  // With it, the same Agent delivers and reports: it reads the object through the owner's declared reader.
  await call(agent(pid), acceptanceActions.deliver, { subject, version: "v1" });
  await call(agent(pid), acceptanceActions.report, { subject, reports: [{ requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "看", observed: "对" }] });
  assert.equal((await read()).round, 1);
});

test("S-acceptance-subject-owner: an owner that declares no reader for the kind lets no one else deliver or read; the person still reads", { timeout: 90_000 }, async t => {
  const { a, subject, call, read } = await rig(t, { reader: false });
  const pid = a.project_id;
  await call(person(pid), acceptanceActions.set, { subject, requirements: REQUIREMENTS });
  await assert.rejects(call(agent(pid), acceptanceActions.deliver, { subject, version: "v1" }), UNKNOWN);
  await assert.rejects(call<AcceptanceReadResult>(agent(pid), acceptanceActions.read, { subjects: [subject] }), UNKNOWN);
  assert.deepEqual([(await read()).requirements.map(item => item.id), (await read()).round], [["r1"], 0], "the person reads; nothing was delivered");
});

test("S-acceptance-subject-owner: a Host's acting_for does not travel with a plugin's onward call", { timeout: 90_000 }, async t => {
  const { a, provider, call } = await rig(t, { reader: true, relay: true });
  const pid = a.project_id;
  const work: AcceptanceSubject = { provider_id: "io.molis.work.assistant.rules", subject: { kind: "assistant_work", id: "w-1" } };
  const workRound = agent(pid, { acting_for: { provider_id: work.provider_id, kind: work.subject.kind, id: work.subject.id } });
  // The work's own round speaks for the work…
  await call(workRound, acceptanceActions.set, { subject: work, requirements: REQUIREMENTS });
  // …but a plugin it calls, handing the same request on, is only itself there: not the work's provider, and without the Host's grant.
  await assert.rejects(call(workRound, { capability_id: "homebg.relay.set", version: 1 }, { subject: work, requirements: [{ ...REQUIREMENTS[0]!, statement: "改掉" }] }, provider), UNKNOWN);
  const reread = (await call<AcceptanceReadResult>(person(pid), acceptanceActions.read, { subjects: [work] })).views[0]!;
  assert.deepEqual(reread.requirements.map(item => item.statement), ["三档并排"], "the work's requirements are as its own round set them");
});
