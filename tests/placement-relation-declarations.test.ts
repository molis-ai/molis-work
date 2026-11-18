import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { goalsActions, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { fakeGoalDirectory, pluginActions } from "./fixtures/plugin-actions.js";

/**
 * RAC-634 (PG-032), batch 44 C1 (contract-design §2.2, CD-02): what the SDK's declaration check says about the 「挂到…」 relation a plugin
 * declares on its attaching action (`attach.relation`), and about a background task's `task_serves` part.
 */

type Definition = ActionDefinition;
const parts = { list: goalsActions.attachList, bind: goalsActions.attachBind, release: goalsActions.attachRelease, candidates: goalsActions.attachCandidates,
  create: goalsActions.attachCreate } as Record<string, Definition>;
const all = () => Object.values(parts);
const problems = (definitions: unknown[]) => inspectActionDeclarations(definitions, undefined);
const bindAttach = parts.bind!.action.attach!;
/** The five parts, with the attaching one's `action` (or its `attach`) patched. */
const withBind = (action: Record<string, unknown> = {}, attach?: Record<string, unknown>): Definition[] =>
  all().map(definition => definition === parts.bind ? { ...definition, action: { ...definition.action, ...action, ...(attach ? { attach: { ...bindAttach, ...attach } } : {}) } } as Definition : definition);
const refused = (found: string[], pattern: RegExp, why: string) => assert.ok(found.some(problem => pattern.test(problem)), `${why}: ${found.join(" | ") || "nothing refused"}`);

test("RAC-634 CD-02 Goals' attaching action declares the Goal relation and names its four other parts; the check accepts the five", () => {
  const relation = bindAttach.relation!;
  assert.deepEqual(bindAttach.accepts, [{ kind: "object" }]);
  assert.equal(bindAttach.item_kind, "goal");
  assert.deepEqual([relation.list, relation.release, relation.candidates, relation.create],
    [parts.list, parts.release, parts.candidates, parts.create].map(definition => ({ capability_id: definition!.capability_id, version: definition!.version })));
  assert.deepEqual(relation.noun_text, { key: "goals.attach.noun" });
  assert.ok(all().every(definition => definition === parts.bind || definition.action.attach === undefined), "only the attaching part declares the relation");
  assert.deepEqual(problems(all()), []);
});

test("RAC-634 CD-02 the relation takes objects only, and writes none of the text attach's fields", () => {
  refused(problems(withBind({}, { accepts: [{ kind: "text" }] })), /必须 accepts: \[\{ kind: "object" \}\]/u, "a relation taking text");
  refused(problems(withBind({}, { accepts: undefined })), /必须 accepts/u, "a relation that says nothing of what it takes");
  for (const field of ["material_field", "positions", "prepare", "places"]) {
    refused(problems(withBind({}, { [field]: field === "material_field" ? "text" : field === "places" ? ["left"] : field === "prepare" ? parts.list : ["start"] })),
      /不写 material_field、positions、prepare、places/u, field);
  }
  const plain = { attach_id: "note", item_kind: "goal", title: "Goal", verb: "追加到 Goal", describe: "把选中的文字追加到目标。", material_field: "text" };
  refused(problems([...all(), { ...parts.bind!, capability_id: "goals.attach.text", action: { ...parts.bind!.action, input_type: undefined, output_type: undefined,
    attach: { ...plain, accepts: [{ kind: "object" }] } } }]), /收对象的只有「挂到…」关系/u, "an attach without a relation taking objects");
});

test("RAC-634 CD-02 the relation names the other end, list and release, and nothing else; every named part is the platform's shape in the same Manifest", () => {
  const relation = bindAttach.relation!;
  refused(problems(withBind({}, { relation: { ...relation, noun: "" } })), /「挂到…」关系无效/u, "no noun");
  refused(problems(withBind({}, { relation: { ...relation, release: undefined } })), /「挂到…」关系无效/u, "no release part");
  refused(problems(withBind({}, { relation: { ...relation, owner: "io.example" } })), /「挂到…」关系无效/u, "an unknown field");
  refused(problems(withBind({}, { relation: { ...relation, noun_text: { text: "Goal" } } })), /「挂到…」关系无效/u, "a noun text that is not a key");
  refused(problems(all().filter(definition => definition !== parts.release)), /goal 的 release 不是本插件里平台给这一部分形状的能力/u, "a part from no action of the Manifest");
  refused(problems(withBind({}, { relation: { ...relation, release: relation.list } })), /goal 的 release 不是本插件里平台给这一部分形状的能力/u, "a part in another part's shape");
  refused(problems([...all(), { ...parts.bind!, capability_id: "goals.attach.again" }]), /「挂到…」goal 在本插件里声明了不止一次/u, "one kind, two relations");
});

test("RAC-634 CD-02 a part keeps the platform's shape, operation and reach, and the relation is declared on the attaching part alone", () => {
  refused(problems(withBind({}, { relation: undefined, accepts: undefined })), /需要在 attach\.relation 里声明这个关系/u, "an attaching part with no relation");
  refused(problems(withBind({ input_schema: { ...parts.bind!.action.input_schema, required: ["target_id"] } })), /没有用平台给这一部分的输入输出结构/u, "a changed input");
  refused(problems(withBind({ scope: "home" })), /需要项目范围、对本机用户开放/u, "home scope");
  refused(problems(withBind({ audiences: ["agent"] })), /需要项目范围、对本机用户开放/u, "not open to the person");
  refused(problems([...all().filter(definition => definition !== parts.bind), { ...parts.bind!, operation: "query" }]), /与这一部分一致的查询\/命令/u, "the attaching part as a query");
  refused(problems([...all().filter(definition => definition !== parts.list), { ...parts.list!, action: { ...parts.list!.action, attach: bindAttach } }]),
    /只能声明在挂上部分（bind）/u, "a relation declared on the list part");
  refused(problems([...all(), { ...goalPluginActions.contract, action: { ...goalPluginActions.contract.action, attach: bindAttach } }]),
    /不是平台给挂上这一部分的形状/u, "a relation declared on an action of no part's shape");
  refused(problems(withBind({ input_type: "molis.placement.attach.v1.unknown.input" })), /不是平台给的任何一部分/u, "a part the platform does not have");
});

test("CD-02 a background task's `task_serves` names one of its four parts with that part's operation, in the project, and nothing else", () => {
  const [list, bind] = [goalsActions.attachList, goalsActions.attachBind];
  const serving = (definition: Definition, task_serves: unknown, patch: Record<string, unknown> = {}) => ({ ...definition, ...patch,
    action: { ...definition.action, input_type: undefined, output_type: undefined, attach: undefined, task_serves } });
  assert.deepEqual(problems([serving(list!, { role: "list" }), serving(bind!, { role: "bind" })]), []);
  for (const [why, definition] of [["an unknown role", serving(bind!, { role: "attach" })], ["an unknown field", serving(list!, { role: "list", target: { kind: "work_event" } })],
    ["bind as a query", serving(list!, { role: "bind" })], ["list as a command", serving(bind!, { role: "list" })],
    ["home scope", { ...serving(list!, { role: "list" }), action: { ...serving(list!, { role: "list" }).action, scope: "home" } }]] as const) {
    refused(problems([definition]), /任务归属声明无效/u, why);
  }
});

const caller: ActionCallContext = { actor_id: "directory-reader", project_id: "directory-project", audience: "user", permissions: ["goals:read"] };
const provider = { provider_id: "goals-manifest-proof", title: "Goals", kind: "system" as const };

test("RAC-634-MIG-01 the real Goals Manifest registers its one Goal relation and the parts it names through ActionService without invoking a handler", () => {
  const definitions = goalsManifest.actions!;
  assert.deepEqual(definitions.flatMap(definition => definition.action.attach?.relation ? [[definition.capability_id, definition.action.attach.item_kind]] : []), [["goals.attach.bind", "goal"]]);
  assert.deepEqual(inspectActionDeclarations(definitions, undefined), []);
  const service = new ActionService();
  let calls = 0;
  const dispose = service.registerProvider({ provider, definitions,
    handlers: definitions.map(definition => ({ ...definition, handle() { calls++; throw new Error("Registration does not execute Goals"); } })) });
  assert.deepEqual(service.inspect(caller).map(view => [view.capability_id, view.version]).sort(),
    definitions.filter(definition => definition.action.audiences.includes(caller.audience)).map(definition => [definition.capability_id, definition.version]).sort());
  assert.equal(calls, 0);
  dispose();
  assert.deepEqual(service.inspect(caller), []);
});

test("RAC-634-MIG-01 a provider whose relation names parts it does not offer is rejected before any action is registered or called", () => {
  const service = new ActionService();
  let calls = 0;
  assert.throws(() => service.registerProvider({ provider, definitions: [parts.bind!], handlers: [{ ...parts.bind!, handle() { calls++; return {}; } }] }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.definition_invalid" && /「挂到…」关系 goal 的 list 不是本插件里/u.test(error.message));
  assert.deepEqual(service.inspect(caller), []);
  assert.equal(calls, 0);
});

test("RAC-634-MIG-02 the read-only Goal directory keeps the public contract, pagination, titles and caller, and claims no 「挂到…」 relation", async () => {
  const seen: ActionCallContext[] = [], titles = { g1: "第一个目标", g2: "另一个目标" };
  const actions = fakeGoalDirectory(pluginActions({}, caller.project_id!), () => titles, 1, seen);
  assert.equal(fakeGoalDirectory(actions, () => { throw new Error("Repeated assembly must not replace the directory"); }), actions);
  const [view] = actions.client.inspect(caller);
  assert.ok(view);
  assert.deepEqual(actions.client.inspect(caller).map(action => [action.capability_id, action.version, action.operation]), [["goals.list", 1, "query"]]);
  assert.deepEqual(view.action, goalPluginActions.list.action, "the directory is Goals' own, unchanged");
  assert.equal(view.action.attach, undefined);
  const first = await actions.client.invoke(caller, goalPluginActions.list, { limit: 100 });
  assert.deepEqual(first.goals.map(goal => [goal.goal_id, goal.title]), [["g1", titles.g1]]);
  assert.equal(first.next_cursor, "1");
  const second = await actions.client.invoke(caller, goalPluginActions.list, { after_cursor: first.next_cursor!, limit: 100 });
  assert.deepEqual(second.goals.map(goal => [goal.goal_id, goal.title]), [["g2", titles.g2]]);
  assert.equal(second.next_cursor, null);
  assert.deepEqual(seen.map(context => [context.actor_id, context.project_id, context.audience, context.permissions]),
    Array.from({ length: 2 }, () => [caller.actor_id, caller.project_id, caller.audience, caller.permissions]));
});
