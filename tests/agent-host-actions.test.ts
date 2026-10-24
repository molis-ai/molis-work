import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { LocalProjectDatabase, MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities as agent, type AgentRuntimeAdapter, type AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";

/*
 * R8 (PG-035, BL-364): the agent Host's letters between sessions and background commands are its actions. A plugin that consumes
 * one reaches it through its action client, in the project the Host started it in; nothing but plugins sees or calls them; and an
 * input their schemas refuse never reaches the Runtime.
 */

const RUNTIME = "fixture-letters", PROJECT = "project-a";
const SEVEN = [agent.readMessages, agent.prioritizeSession, agent.sendPeopleMessage, agent.actOnPeopleMessage, agent.cancelMessage, agent.readBackground, agent.stopBackground];
const letter = (message_id: string): AgentSessionMessage => ({ message_id, from_session: "s1", to_session: "s2", from_title: "一", to_title: "二", kind: "request", body: "补测试",
  state: "delivered", sent_at_ms: 1, audience: "people" });

/** A Runtime that carries letters and background commands, and records what reached it (the Runtime's method, then its arguments). */
function lettersRuntime(seen: Array<[string, unknown[]]>): AgentRuntimeAdapter {
  const unused = async (): Promise<never> => { throw new Error("Not used by this fixture"); };
  const answer = <T>(name: string, value: (args: unknown[]) => T) => async (...args: unknown[]) => { seen.push([name, args]); return value(args); };
  return {
    descriptor: { runtime_id: RUNTIME, display_name: "Letters fixture", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    createSession: unused, readSession: unused, start: unused, read: unused, control: unused, readCommandOutput: unused,
    observe() { throw new Error("Not used by this fixture"); },
    messages: {
      read: answer("read", () => [letter("m1")]),
      cancel: answer("cancel", () => undefined),
      prioritize: answer("prioritize", () => ({ notified: ["s2"], paths: ["src/x.ts"] })),
      sendForPeople: answer("send", () => letter("m2")),
      act: answer("act", args => letter(String(args[1]))),
    },
    background: { read: answer("background", () => []), stop: answer("stop", () => true) },
  } as AgentRuntimeAdapter;
}

async function lettersSetup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "agent-host-actions-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({ databasePath: join(directory, "project.db"), projectId: PROJECT });
  const composition = composeAgentHost({ localHost, workspaceFor: () => null });
  const seen: Array<[string, unknown[]]> = [];
  const runtime = lettersRuntime(seen);
  composition.agentHost.register(runtime);
  const store = new LocalProjectDatabase(join(directory, "plugins.sqlite"));
  const consumer = callerPlugin("letters", "project", {}, SEVEN.map(definition => definition.capability_id));
  const bystander = callerPlugin("bystander", "project");
  await startPlugin(localHost, reference, store, consumer);
  await startPlugin(localHost, reference, store, bystander);
  t.after(async () => { composition.dispose(); store.close(); await localHost.closeProject(reference); await localHost.close(); await rm(directory, { recursive: true, force: true }); });
  return { localHost, reference, seen, consumer, bystander, runtime };
}

const person = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: PROJECT, audience, permissions: [] });

test("RAC-188 the seven are plugin-only actions needing no permission, and a consuming plugin reaches each in its own project", async t => {
  for (const definition of SEVEN as ActionDefinition[]) {
    assert.deepEqual([definition.action.scope, definition.action.audiences, definition.action.permissions], ["project", ["plugin"], []], definition.capability_id);
    assert.equal(definition.action.kind, definition.operation === "query" ? "query" : "operation", definition.capability_id);
  }
  const { seen, consumer } = await lettersSetup(t);
  const actions = consumer.actions(PROJECT);
  assert.deepEqual(await actions.invoke(agent.readMessages, [RUNTIME, "s1"]), [letter("m1")]);
  assert.deepEqual(await actions.invoke(agent.prioritizeSession, [RUNTIME, "s1"]), { notified: ["s2"], paths: ["src/x.ts"] });
  const sent = { from_session: "s1", to_session: "s2", kind: "request", body: "补测试", attachments: [{ kind: "artifact", id: "a1", version: 1 }], ttl_ms: 60_000, hops: 1 } as const;
  assert.equal((await actions.invoke(agent.sendPeopleMessage, [RUNTIME, sent])).message_id, "m2");
  assert.equal((await actions.invoke(agent.actOnPeopleMessage, [RUNTIME, "m2", "deliver", {}])).message_id, "m2");
  await actions.invoke(agent.cancelMessage, [RUNTIME, "m2"]);
  assert.deepEqual(await actions.invoke(agent.readBackground, [RUNTIME]), []);
  assert.equal(await actions.invoke(agent.stopBackground, [RUNTIME, "t1"]), true);
  assert.deepEqual(seen.map(([name]) => name), ["read", "prioritize", "send", "act", "cancel", "background", "stop"]);
  // The project is the one the Host started the plugin in; the input names none.
  assert.ok(seen.every(([, args]) => args[0] === PROJECT), "every call ran in the plugin's own project");
  assert.deepEqual(seen.find(([name]) => name === "send")![1][1], sent, "the letter reached the Runtime as sent");
});

test("RAC-189 a plugin that does not consume them, the person, the Agent, workflows and MCP clients neither see nor call them", async t => {
  const { localHost, reference, seen, bystander } = await lettersSetup(t);
  await assert.rejects(bystander.actions(PROJECT).invoke(agent.readMessages, [RUNTIME, "s1"]), { code: "actions.forbidden" });
  await assert.rejects(bystander.actions(PROJECT).invoke(agent.stopBackground, [RUNTIME, "t1"]), { code: "actions.forbidden" });
  const client = localHost.actionClient(reference);
  for (const audience of ["user", "agent", "workflow", "mcp"] as const) {
    const listed = await client.discover(person(audience));
    for (const definition of SEVEN) assert.ok(!listed.some(row => row.capability_id === definition.capability_id), `${audience} does not see ${definition.capability_id}`);
    await assert.rejects(client.invoke(person(audience), agent.cancelMessage, [RUNTIME, "m1"]), { code: "actions.forbidden" }, audience);
  }
  assert.deepEqual(seen, [], "no refused call reached the Runtime");
});

test("RAC-190 an input the schemas refuse never reaches the Runtime; the limits themselves are accepted", async t => {
  const { seen, consumer } = await lettersSetup(t);
  const actions = consumer.actions(PROJECT);
  const sent = { from_session: "s1", to_session: "s2", kind: "request", body: "补测试" };
  const refused: Array<[string, () => Promise<unknown>]> = [
    ["an empty Runtime id", () => actions.invoke(agent.readMessages, ["", "s1"])],
    ["a Runtime id over 200 characters", () => actions.invoke(agent.readBackground, ["r".repeat(201)])],
    ["a session missing", () => actions.invoke(agent.prioritizeSession, [RUNTIME] as never)],
    ["one more argument than declared", () => actions.invoke(agent.cancelMessage, [RUNTIME, "m1", "more"] as never)],
    ["a task id over 500 characters", () => actions.invoke(agent.stopBackground, [RUNTIME, "t".repeat(501)])],
    ["a sender named in the letter", () => actions.invoke(agent.sendPeopleMessage, [RUNTIME, { ...sent, actor_id: "someone-else" } as never])],
    ["an empty letter", () => actions.invoke(agent.sendPeopleMessage, [RUNTIME, { ...sent, body: "" }])],
    ["a kind only a Runtime sends", () => actions.invoke(agent.sendPeopleMessage, [RUNTIME, { ...sent, kind: "notice" } as never])],
    ["51 attachments", () => actions.invoke(agent.sendPeopleMessage, [RUNTIME, { ...sent, attachments: Array.from({ length: 51 }, (_, i) => ({ kind: "artifact", id: `a${i}` })) }])],
    ["a step the letter has not got", () => actions.invoke(agent.actOnPeopleMessage, [RUNTIME, "m1", "approve" as never, {}])],
    ["a note over 100,000 characters", () => actions.invoke(agent.actOnPeopleMessage, [RUNTIME, "m1", "record", { note: "字".repeat(100_001) }])],
    ["a field the step does not take", () => actions.invoke(agent.actOnPeopleMessage, [RUNTIME, "m1", "record", { by: "someone-else" } as never])],
  ];
  for (const [label, call] of refused) await assert.rejects(call(), { code: "actions.input_invalid" }, label);
  assert.deepEqual(seen, [], "no refused input reached the Runtime");
  await actions.invoke(agent.actOnPeopleMessage, [RUNTIME, "m1", "record", { note: "字".repeat(100_000) }]);
  await actions.invoke(agent.sendPeopleMessage, [RUNTIME, { ...sent, attachments: Array.from({ length: 50 }, (_, i) => ({ kind: "artifact", id: `a${i}` })) }]);
  assert.deepEqual(seen.map(([name]) => name), ["act", "send"], "the limits themselves are accepted");
});


test("RAC-190 Runtime message and background output errors are refused by the actual action dispatcher", async t => {
  const { consumer, runtime } = await lettersSetup(t), actions = consumer.actions(PROJECT);
  const malformed = [
    { ...letter("m1"), from_title: undefined },
    { ...letter("m1"), attachments: [{ kind: "artifact" }] },
    { ...letter("m1"), await_reply: false },
  ];
  for (const value of malformed) {
    runtime.messages!.read = async () => [value as never];
    await assert.rejects(actions.invoke(agent.readMessages, [RUNTIME, "s1"]), { code: "actions.output_invalid" });
  }
  runtime.messages!.sendForPeople = async () => ({ ...letter("m2"), kind: "other" } as never);
  await assert.rejects(actions.invoke(agent.sendPeopleMessage, [RUNTIME, { from_session: "s1", to_session: "s2", kind: "request", body: "Hi" }]), { code: "actions.output_invalid_after_effect" });
  runtime.messages!.act = async () => ({ ...letter("m2"), history: [{ event: "done", state: "completed" }] } as never);
  await assert.rejects(actions.invoke(agent.actOnPeopleMessage, [RUNTIME, "m2", "record", {}]), { code: "actions.output_invalid_after_effect" });
  runtime.background!.read = async () => [{ task_id: "t1", session_id: "s1", summary: "command", state: "done", started_at_ms: 1 } as never];
  await assert.rejects(actions.invoke(agent.readBackground, [RUNTIME]), { code: "actions.output_invalid" });
});

test("RAC-190 stored outputs include optional history and task fields without input size limits", async t => {
  const { consumer, runtime } = await lettersSetup(t), actions = consumer.actions(PROJECT);
  const stored: AgentSessionMessage = { ...letter("stored"), body: "x".repeat(1_000_001), in_reply_to: "m0", await_reply: true, hops: 2,
    attachments: [{ kind: "artifact", id: "a1", version: 3, title: "Saved" }],
    history: [{ event: "recorded", state: "delivered", at_ms: 2, by: "person", note: "saved note", attachments: [{ kind: "artifact", id: "a1" }], late: true }] };
  runtime.messages!.read = async () => [stored];
  assert.deepEqual(await actions.invoke(agent.readMessages, [RUNTIME]), [stored]);
  const task = { task_id: "t1", session_id: "s1", run_id: "r1", summary: "command", state: "succeeded" as const, exit_code: 0, started_at_ms: 1, ended_at_ms: 2 };
  runtime.background!.read = async () => [task];
  assert.deepEqual(await actions.invoke(agent.readBackground, [RUNTIME]), [task]);
  assert.equal(await actions.invoke(agent.cancelMessage, [RUNTIME, "m1"]), undefined, "cancel retains its void result");
});
