import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase, MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent, type AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";

/*
 * `agent.evidence.check` (batch 24-3, the evidence contract): what another owner may learn of the commands a round ran, so a Goal's
 * report can cite them. It answers only about the session the Host bound the calling round to, with facts and no output, and runs nothing.
 */

const RUNTIME = "fixture-evidence", PROJECT = "project-a", OWNER_PLUGIN = "io.molis.work.coding";
type Activity = { call_id: string; name: string; state: string; sequence?: number };
interface Round { command_outputs: Array<{ call_id: string }>; activity: Activity[]; turn_changes?: Array<{ sequence: number }> }
const RECEIPTS: Record<string, { exit_code: number | null; timed_out?: boolean; cancelled?: boolean; stop_reason?: string } | "unreadable"> = {
  "c-pass": { exit_code: 0 }, "c-fail": { exit_code: 1 }, "c-slow": { exit_code: null, stop_reason: "timed-out" }, "c-stopped": { exit_code: null, cancelled: true }, "c-lost": "unreadable",
};

async function setup(t: TestContext, rounds: Record<string, Round>, sessionProject = PROJECT) {
  const directory = await mkdtemp(join(tmpdir(), "agent-evidence-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({ databasePath: join(directory, "project.db"), projectId: PROJECT });
  const composition = composeAgentHost({ localHost, workspaceFor: () => null });
  const seen: string[] = [];
  const unused = async (): Promise<never> => { throw new Error("Not used by this fixture"); };
  composition.agentHost.register({
    descriptor: { runtime_id: RUNTIME, display_name: "Evidence fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    createSession: unused, start: unused, control: unused,
    observe() { throw new Error("Not used by this fixture"); },
    // Only "s1" exists: asked for any other session the Runtime knows none.
    readSession: async (session: { runtime_id: string; session_id: string }) => {
      seen.push(`session:${session.session_id}`);
      if (session.session_id === "s-unreadable") throw new Error("store unavailable");
      // As the Prologue adapter says it of a session it cannot restore.
      if (session.session_id !== "s1") throw new ActionError("agent.session_unknown", "找不到这条会话");
      return { session, owner: { project_id: sessionProject, plugin_id: OWNER_PLUGIN, install_id: "installed", actor_id: "web-user" }, title: "Evidence",
        runs: Object.keys(rounds).map(run_id => ({ session_id: "s1", run_id })) } as never;
    },
    read: async (ref: { session_id: string; run_id: string }) => { seen.push(`run:${ref.run_id}`); return { ref, ...rounds[ref.run_id]! } as never; },
    readCommandOutput: async (_session: unknown, ref: { run_id: string; call_id: string }) => {
      seen.push(`receipt:${ref.call_id}`);
      const receipt = RECEIPTS[ref.call_id];
      if (!receipt || receipt === "unreadable") throw new Error("receipt unreadable");
      return { ref, command: "node --test", stdout: "SECRET OUTPUT", stderr: "", truncated: false, ...receipt } as never;
    },
  } as AgentRuntimeAdapter);
  const store = new LocalProjectDatabase(join(directory, "plugins.sqlite"));
  const plugin = callerPlugin("evidence-asker", "project", {}, [agent.checkEvidence.capability_id]);
  await startPlugin(localHost, reference, store, plugin, { actorId: "web-user" });
  t.after(async () => { composition.dispose(); store.close(); await localHost.closeProject(reference); await localHost.close(); await rm(directory, { recursive: true, force: true }); });
  const caller = (audience: ActionCallContext["audience"], session?: string, delegated?: ActionCallContext["audience"]): ActionCallContext =>
    ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: PROJECT, audience, permissions: [], ...(session ? { runtime_session_id: session } : {}), ...(delegated ? { delegated_by: OWNER_PLUGIN, delegated_audience: delegated } : {}) });
  const check = (as: ActionCallContext, run_id: string, command_call_ids: string[]) => localHost.actionClient(reference).invoke(as, agent.checkEvidence, { run_id, command_call_ids });
  return { check, caller, seen, plugin };
}

/** A session named in the input is not how the session is chosen: the schema has no such field. */
const other_input = (check: (as: ActionCallContext, run_id: string, ids: string[]) => Promise<unknown>, caller: (audience: ActionCallContext["audience"], session?: string, delegated?: ActionCallContext["audience"]) => ActionCallContext) =>
  check(caller("agent", "s1"), "r1", ["c-pass", "c-pass"]);

const command = (call_id: string, sequence?: number): Activity => ({ call_id, name: "command", state: "completed", ...(sequence === undefined ? {} : { sequence }) });
const wrote = (call_id: string, sequence: number, state = "completed", name = "edit"): Activity => ({ call_id, name, state, sequence });

test("EVD-30: a round's caller learns of its own session's commands how each ended and whether the round wrote after it, and never their output", async t => {
  const { check, caller } = await setup(t, { r1: {
    command_outputs: ["c-pass", "c-fail", "c-slow", "c-stopped", "c-lost", "c-early", "c-unplaced"].map(call_id => ({ call_id })),
    activity: [command("c-early", 1), wrote("w1", 2), command("c-fail", 3), wrote("w-failed", 4, "failed"), command("c-pass", 5), command("c-slow", 6), command("c-stopped", 7), command("c-lost", 8), command("c-unplaced")],
  } });
  const answer = await check(caller("agent", "s1"), "r1", ["c-pass", "c-fail", "c-slow", "c-stopped", "c-lost", "c-never-ran"]);
  assert.equal(answer.owner_plugin_id, OWNER_PLUGIN);
  assert.deepEqual(answer.run, { session_id: "s1", run_id: "r1" });
  assert.deepEqual(answer.commands, [
    // A failed write after it changed nothing.
    { call_id: "c-pass", recorded: true, exit_code: 0, timed_out: false, cancelled: false, changed_after: false },
    { call_id: "c-fail", recorded: true, exit_code: 1, timed_out: false, cancelled: false, changed_after: false },
    { call_id: "c-slow", recorded: true, exit_code: null, timed_out: true, cancelled: false, changed_after: false },
    { call_id: "c-stopped", recorded: true, exit_code: null, timed_out: false, cancelled: true, changed_after: false },
    // A receipt that cannot be read, and a command the round never ran: no fact is given, and neither is read as "nothing changed after".
    { call_id: "c-lost", recorded: false, exit_code: null, timed_out: false, cancelled: false, changed_after: true },
    { call_id: "c-never-ran", recorded: false, exit_code: null, timed_out: false, cancelled: false, changed_after: true },
  ]);
  assert.doesNotMatch(JSON.stringify(answer), /SECRET OUTPUT|node --test/u);
  // Asked about no command, it still says whether the round is the caller's own; so it does when a plugin hands the round's call on.
  assert.deepEqual((await check(caller("workflow", "s1", "agent"), "r1", [])).commands, []);
});

test("EVD-31: a write, an edit or a recorded change of the turn after the command means the command did not see what was left", async t => {
  const { check, caller } = await setup(t, {
    "r-edit": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1), wrote("w1", 2)] },
    "r-write": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1), wrote("w1", 2, "completed", "write")] },
    "r-change": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 3)], turn_changes: [{ sequence: 4 }] },
    "r-before": { command_outputs: [{ call_id: "c-pass" }], activity: [wrote("w1", 1), command("c-pass", 3)], turn_changes: [{ sequence: 2 }] },
    // Without the command's own place in the round nothing says what came after it.
    "r-unplaced": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass")] },
    // A command, a background command and a child's work may each write a file; what they ran is not known (review M3).
    "r-command": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1), wrote("x1", 2, "completed", "run-command")] },
    "r-background": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1), wrote("x1", 2, "completed", "start-command")] },
    "r-child": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1), wrote("x1", 2, "completed", "dispatch-subagent")] },
    // Reading, and a business capability (the report itself), change no file of the round's directory.
    "r-read": { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1), wrote("x1", 2, "completed", "read"), wrote("x2", 3, "completed", "capability-change")] },
    // The other cited commands are the check itself.
    "r-two": { command_outputs: [{ call_id: "c-pass" }, { call_id: "c-fail" }], activity: [wrote("c-pass", 1, "completed", "run-command"), wrote("c-fail", 2, "completed", "run-command")] },
  });
  const changed = async (run: string) => (await check(caller("agent", "s1"), run, ["c-pass"])).commands[0]!.changed_after;
  assert.deepEqual(await Promise.all(["r-edit", "r-write", "r-change", "r-before", "r-unplaced"].map(changed)), [true, true, true, false, true]);
  assert.deepEqual(await Promise.all(["r-command", "r-background", "r-child", "r-read"].map(changed)), [true, true, true, false]);
  assert.deepEqual((await check(caller("agent", "s1"), "r-two", ["c-pass", "c-fail"])).commands.map(item => item.changed_after), [false, false]);
  assert.equal((await check(caller("agent", "s1"), "r-two", ["c-pass"])).commands[0]!.changed_after, true, "a later command that is not cited counts");
});

test("EVD-32: refused without a session the Host bound the call to, for a plugin, for another session's round and for another project's session; the Runtime is asked nothing it need not be", async t => {
  const rounds = { r1: { command_outputs: [{ call_id: "c-pass" }], activity: [command("c-pass", 1)] } };
  const { check, caller, seen, plugin } = await setup(t, rounds);
  // A person, an MCP client, a workflow of its own: no round, so no session to answer about.
  for (const audience of ["agent", "workflow"] as const) await assert.rejects(check(caller(audience), "r1", ["c-pass"]), { code: "agent.session_unknown" }, `${audience} with no session`);
  for (const audience of ["user", "mcp"] as const) await assert.rejects(check(caller(audience, "s1"), "r1", ["c-pass"]), { code: "actions.forbidden" }, audience);
  await assert.rejects(plugin.actions(PROJECT).invoke(agent.checkEvidence, { run_id: "r1", command_call_ids: ["c-pass"] }), { code: "actions.dependency_missing" }, "a plugin: the action is not there for plugins at all");
  // A session an external client names for itself is not one the Host bound: not over MCP handed on by a plugin, not a workflow's own (review M5).
  for (const [audience, delegated] of [["workflow", "mcp"], ["workflow", "user"], ["workflow", undefined]] as const) {
    await assert.rejects(check(caller(audience, "s1", delegated), "r1", ["c-pass"]), { code: "agent.session_unknown" }, `${audience} for ${delegated}`);
  }
  assert.deepEqual(seen, [], "no refused caller reached the Runtime");
  // A round of another session, and a session the Runtime does not know: said the same way, with no receipt read.
  await assert.rejects(check(caller("agent", "s1"), "r-elsewhere", ["c-pass"]), { code: "agent.run_unknown" });
  await assert.rejects(check(caller("agent", "s-other"), "r1", ["c-pass"]), { code: "agent.run_unknown" });
  assert.ok(!seen.some(entry => entry.startsWith("receipt:") || entry.startsWith("run:")), JSON.stringify(seen));
  // A session that could not be read is not answered as "not this session's round": that would read as another worker's (review M2).
  await assert.rejects(check(caller("agent", "s-unreadable"), "r1", ["c-pass"]), { code: "agent.capability_unavailable" });
  // The input names no session and no identity, and at most eight commands.
  await assert.rejects(check(caller("agent", "s1"), "r1", Array.from({ length: 9 }, (_, index) => `c-${index}`)), { code: "actions.input_invalid" });
  await assert.rejects(other_input(check, caller), { code: "actions.input_invalid" });
  const other = await setup(t, rounds, "project-b");
  await assert.rejects(other.check(other.caller("agent", "s1"), "r1", ["c-pass"]), { code: "agent.run_unknown" }, "a session of another project");
});
