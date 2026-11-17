import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";

import { MolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { trustedReviewActions, type ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { managementCaller, managementGoals } from "./goal-management-caller.js";
import { prepareGoalReview } from "./fixtures/project-review-entry.js";
import { createStandaloneProject } from "./fixtures/standalone-project.js";
import { currentCallId } from "@molis-ai/molis-work-kernel";

// N-12 / W3-07: the CLI is a management entry. A `molis-work v1` command calls one platform action as the person on this machine
// (origin management); it does not go through a typed Host capability that calls the action a second time. Its Goals commands were
// removed (specs/plugin-equal-standing PEQ-15): what is left is the protected review, which here reviews a Goals proposal that the
// test submits through the action itself.

const PROJECT = "cli-goals-actions";

/** A Home-backed Host that also keeps every caller the Host's action client was handed, so a test can read who a command acted as. */
class WatchedHost extends MolisWorkLocalHost {
  readonly callers: Array<{ capability_id: string; caller: ActionCallContext; prepared: boolean }> = [];
  override actionClient(reference: Parameters<MolisWorkLocalHost["actionClient"]>[0], preparePlugins = true) {
    const real = super.actionClient(reference, preparePlugins);
    return { ...real, invoke: (caller: ActionCallContext, action: Parameters<typeof real.invoke>[1], input: unknown) => {
      this.callers.push({ capability_id: action.capability_id, caller, prepared: preparePlugins });
      return real.invoke(caller, action, input);
    } } as typeof real;
  }
  /** The management callers made for one capability since `callers` was last emptied. */
  managed(capabilityId: string) {
    return this.callers.filter(entry => entry.capability_id === capabilityId && entry.caller.user_action?.source === "management").map(entry => entry.caller);
  }
  /** Whether any client a management call went through prepared the project's Runtime plugins first. */
  preparedManagementCalls() {
    return this.callers.filter(entry => entry.caller.user_action?.source === "management" && entry.prepared).map(entry => entry.capability_id);
  }
}

interface Settled { capability_id: string; operation: string; actor_id: string; audience: string | undefined; ok: boolean; call_id: string }

/** Every call this Home settles, with the number of the operation it belonged to. */
function watchCalls(host: WatchedHost): Settled[] {
  const seen: Settled[] = [];
  const log = host.callLog!;
  const record = log.record.bind(log);
  log.record = (caller, action, outcome) => {
    seen.push({ capability_id: action.capability_id, operation: action.operation,
      actor_id: caller.actor_id, audience: caller.audience, ok: outcome.ok, call_id: caller.call_id });
    record(caller, action, outcome);
  };
  return seen;
}

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "cli-goals-actions-"));
  const host = new WatchedHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, "cli", "project.db");
  await createStandaloneProject(databasePath, PROJECT);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: PROJECT });
  /** Runs one command and returns what it printed, as JSON. */
  const cli = async <Printed = unknown>(operation: string, input: object = { project_id: PROJECT }, ...extra: string[]): Promise<Printed> => {
    const lines: string[] = [];
    const printing = mock.method(console, "log", (...values: unknown[]) => { lines.push(values.map(String).join(" ")); });
    try {
      assert.equal(await runV1Cli([operation, "--db", databasePath, "--json", JSON.stringify(input), ...extra], { localHost: host }), 0);
      assert.match(lines.at(-1)!, /\n  "/, "JSON output remains indented");
      return JSON.parse(lines.at(-1)!) as Printed;
    } finally { printing.mock.restore(); }
  };
  const person = managementGoals(host.actionClient(reference), PROJECT);
  await person.invoke(goalsActions.initialize, { idempotency_key: "init" });
  await person.invoke(goalsActions.create, { goal_id: "root", title: "根目标", outcome: "可以由命令行继续", idempotency_key: "root" });
  /** A proposal, submitted as the person through the Goals action (the CLI no longer has a command for it). */
  const propose = async (key: string, overrides: Record<string, unknown> = {}) => {
    const { project_id: _project, ...input } = { ...proposal(key), ...overrides };
    return (await person.invoke(goalsActions.treeSubmit, input as never) as Proposed).proposal.proposal_id;
  };
  const decisions = async (proposal_id: string) =>
    (await person.invoke(goalsActions.treeRead, { proposal_id } as never) as Listed).proposals[0]!.decisions;
  return { home, host, reference, cli, person, propose, decisions, calls: watchCalls(host),
    done: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

const proposal = (key: string) => ({ project_id: PROJECT, root_goal_id: "root", summary: "新增一个子目标", idempotency_key: key,
  items: [{ item_id: "child", kind: "goal", operation: "create", payload: { goal_id: "child", title: "子目标", outcome: "结果" },
    source_refs: ["conversation://cli"], reason: "需要", confidence: 1, affected_objects: [{ object_type: "goal", object_id: "child" }] }] });
interface Proposed { proposal: { proposal_id: string } }
interface Listed { proposals: Array<{ decisions: Array<{ actor_id: string; authority_source: string; conversation_ref: string; message_ref: string }> }> }
const reviewed = (proposal_id: string, idempotency_key: string, whole = false, item_id = "child") => {
  const draft = { proposal_id, idempotency_key, reason: "确认",
    ...(whole ? { confirm_all_pending: true } : { decisions: [{ item_id, decision: "confirm" }] }) };
  return { project_id: PROJECT, ...prepareGoalReview(goalsActions.treeDecide, draft) };
};
const confirm = (reference: ReviewRequest["reference"], request_key: string) => ({ project_id: PROJECT, reference, choice_id: "apply", request_key });

test("a CLI review decision is one action call as the person on this machine: one row, its own call number, nothing beside it", async () => {
  const { host, cli, propose, calls, done } = await setup();
  try {
    const proposalId = await propose("propose");
    calls.length = 0;
    const request = await cli<ReviewRequest>("review-request", reviewed(proposalId, "decide"));
    const read = calls.splice(0);
    await cli("review-decide", confirm(request.reference, "decide"));
    // The person's decision through the platform's review action, and the Goals command it carried: one operation, nothing beside it.
    const writes = calls.filter(call => call.operation === "command");
    assert.deepEqual(writes.map(call => call.capability_id).sort(), [goalsActions.treeDecide.capability_id, trustedReviewActions.decide.capability_id].sort());
    for (const write of writes) assert.deepEqual([write.actor_id, write.audience, write.ok], [LOCAL_PERSON_ACTOR_ID, "user", true], `${write.capability_id}, as the person`);
    assert.ok(writes[0]!.call_id, "the command has a call number");
    assert.equal(new Set(writes.map(write => write.call_id)).size, 1, "the decision and the command it carried are one operation");
    for (const row of read) assert.notEqual(row.call_id, writes[0]!.call_id, "each command is its own operation");
    assert.equal(currentCallId(), undefined, "the number ends with the command");
    const kept = host.callLog!.list(PROJECT).filter(row => row.capability_id === goalsActions.treeDecide.capability_id);
    assert.equal(kept.length, 1, "the call log keeps the decision once");
  } finally { await done(); }
});

test("the CLI acts as the caller the management test helper builds, and keeps the stored provenance format", async () => {
  const { host, cli, propose, decisions, done } = await setup();
  try {
    const pick = (caller: ActionCallContext) => JSON.parse(JSON.stringify({ actor_id: caller.actor_id, actor_kind: caller.actor_kind, audience: caller.audience,
      project_id: caller.project_id, user_action: caller.user_action }));
    const proposalId = await propose("propose");
    host.callers.length = 0;
    const request = await cli<ReviewRequest>("review-request", reviewed(proposalId, "decide", true));
    const { record } = await cli<{ record: ProjectTrustedDecision }>("review-decide", confirm(request.reference, "decide"));
    const entry = record.source.entry;
    const decided = host.managed(goalsActions.treeDecide.capability_id);
    assert.deepEqual(decided.map(caller => pick(caller).user_action),
      [{ source: "management", conversation_ref: entry.conversation_ref, message_ref: entry.message_ref }]);
    assert.deepEqual({ ...pick(decided[0]!), user_action: undefined }, { ...pick(managementCaller(PROJECT, "decide")), user_action: undefined },
      "the same actor, kind, audience and project as the helper");
    assert.deepEqual(host.preparedManagementCalls().filter(id => id === goalsActions.treeDecide.capability_id), [goalsActions.treeDecide.capability_id],
      "a command goes through the project's client, which starts the project's Runtime plugins: Goals is one of them");
    assert.equal(entry.whole_confirmation_prompted, true);
    assert.equal(entry.prompted_subject_id, proposalId);

    const [stored] = await decisions(proposalId);
    assert.deepEqual([stored!.actor_id, stored!.authority_source, stored!.conversation_ref, stored!.message_ref], [LOCAL_PERSON_ACTOR_ID, "management", entry.conversation_ref, entry.message_ref]);

    // An individual choice also names the actual management entry.
    const second = await propose("propose-2", { items: [{ ...proposal("x").items[0], item_id: "other", payload: { goal_id: "other", title: "另一个", outcome: "结果" },
      affected_objects: [{ object_type: "goal", object_id: "other" }] }] });
    const next = await cli<ReviewRequest>("review-request", reviewed(second, "decide-2", false, "other"));
    const { record: secondRecord } = await cli<{ record: ProjectTrustedDecision }>("review-decide", confirm(next.reference, "decide-2"));
    const [individual] = await decisions(second);
    assert.deepEqual([individual!.actor_id, individual!.authority_source, individual!.conversation_ref, individual!.message_ref],
      [LOCAL_PERSON_ACTOR_ID, "management", `management:${PROJECT}`, secondRecord.source.entry.message_ref]);
    assert.match(individual!.message_ref, /^management:/u);
  } finally { await done(); }
});

test("the CLI keeps its wire: the payload's project must be the bound one, and identity is refused with the same codes and words", async () => {
  const { cli, propose, decisions, done } = await setup();
  try {
    // A payload that does not carry the project this command is bound to (here by --project-id) is refused, and nothing is written.
    for (const [operation, input] of [["review-request", { request_id: "p" }], ["review-decide", { request_key: "k" }]] as const) {
      await assert.rejects(cli(operation, input, "--project-id", PROJECT), { code: "actions.scope_mismatch" }, `${operation} without the bound project`);
    }
    const proposalId = await propose("propose");
    const contractSays = { code: "actions.input_invalid", message: /^输入不符合能力合同：/ };
    const request = await cli<ReviewRequest>("review-request", reviewed(proposalId, "decide"));
    const decide = confirm(request.reference, "decide");
    for (const [names, identity] of [[["runtime_actor_id"], { runtime_actor_id: "forged" }], [["audit_actor_id"], { audit_actor_id: "runtime:forged:session" }],
      [["actor_id", "actor_kind"], { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]] as const) {
      await assert.rejects(cli("review-decide", { ...decide, ...identity }), contractSays, `decide refuses ${names}`);
    }
    await assert.rejects(cli("review-decide", { ...decide, unknown_field: 1 }), contractSays, "decide refuses an unknown field, by its contract");
    for (const named of [{ actor_id: "someone-else" }, { authority_source: "web" }, { actor_kind: "runtime" }]) {
      await assert.rejects(cli("review-decide", { ...decide, authority: named }), contractSays, `decide refuses ${Object.keys(named)} in the authority`);
    }
    assert.deepEqual(await decisions(proposalId), [], "nothing was decided");
  } finally { await done(); }
});
