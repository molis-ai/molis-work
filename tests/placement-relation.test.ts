import { fakeActionClient } from "@molis-ai/molis-work-test-kit";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ActionError, SUBJECT_CONTEXT_OUTPUT_SCHEMA, SUBJECT_CONTEXT_INPUT_SCHEMA, SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, definePlacementRelationAction, subjectContext,
  type ActionAvailability, type ActionCallContext, type ActionClient, type ActionMetadata, type ActionReference, type ActionSubject, type ActionView, type PlacementRelationRole,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { PLACEMENT_LEDGER_ACCESS, PlacementService, type PlacementPorts } from "@molis-ai/molis-work-service-placement";
import { pageText } from "./fixtures/page-text.js";

/**
 * PG-032, batch 44 C1: placement keeps the person's relation between an object and a target its owner keeps (a document's Goal) without
 * knowing which plugin owns it. Each part of the owner's relation declares its role (`placement_relation`) in the platform's shape
 * (`definePlacementRelationAction`); placement finds them in the directory by that. These tests run the real service over a hand-made
 * directory, with a relation that is not Goals' (onto `topic`), so what they prove is that no plugin is named.
 */

const NOTE = { kind: "note", id: "n1", project_id: "q4" };
const caller: ActionCallContext = { actor_id: "web-user", project_id: "q4", audience: "user", permissions: [] };
const PART_ACTION: Record<PlacementRelationRole, string> = { list: "attached", bind: "attach", release: "detach", candidates: "pick", create: "make" };
const keyOf = (target: string) => JSON.stringify(["attached", "q4", "topic", target, "note", "n1"]);

const view = (provider: string, title: string, capability: string, operation: "query" | "command", action: ActionMetadata, availability: ActionAvailability = { available: true }): ActionView =>
  ({ capability_id: capability, version: 1, provider_id: provider, operation, action, provider: { provider_id: provider, plugin_id: provider, title, kind: "plugin" }, availability });

function reader(provider: string, kind: string, title = "笔记"): ActionView {
  return view(provider, title, `${provider}.read.${kind}`, "query", { title: "读取", description: "读取", scope: "project", audiences: ["user"], permissions: [], kind: "query",
    subject_kinds: [kind], input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE, input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA });
}

/**
 * A plugin that keeps a relation onto `kind` (named `relation`, the kind by default): each part it offers declares its role, with
 * `unavailable` ones present but refused. Calls land in `calls` by capability id, and their inputs in `inputs`.
 */
function owner(provider: string, kind: string, parts: readonly PlacementRelationRole[], unavailable: readonly PlacementRelationRole[] = [], relation = kind): ActionView[] {
  return parts.map(role => {
    const definition = definePlacementRelationAction(relation, role, `${provider}.${PART_ACTION[role]}`, 1, { kinds: [], title: PART_ACTION[role], description: PART_ACTION[role],
      permissions: [], audiences: ["user"], ...(role === "list" ? { target: { kind, noun: "话题" } } : {}) });
    return view(provider, "话题", definition.capability_id, definition.operation, definition.action,
      unavailable.includes(role) ? { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" } : { available: true });
  });
}

function directory(views: readonly ActionView[], calls: string[], notes: { attached_to?: ActionSubject[] } = {}, inputs: Map<string, unknown> = new Map()): ActionClient {
  const t1 = { kind: "topic", id: "t1" };
  const reply = (reference: ActionReference, input: unknown): unknown => {
    const id = reference.capability_id;
    if (id.endsWith(".attached")) return { targets: [t1] };
    if (id.endsWith(".attach")) return { targets: [t1, (input as { target: ActionSubject }).target] };
    if (id.endsWith(".detach")) return { targets: [] };
    if (id.endsWith(".pick")) return { targets: [{ subject: t1, current: true }] };
    if (id.endsWith(".make")) return { targets: [{ kind: "topic", id: "t9" }, t1] };
    const subject = (input as { subject_id: string }).subject_id;
    if (id.endsWith(".read.topic")) return subjectContext({ subject: { kind: "topic", id: subject }, revision: "1", title: "第一个话题", content: "" });
    return subjectContext({ subject: { kind: "note", id: subject }, revision: "r7", title: "一份笔记", content: "正文", ...(notes.attached_to ? { attached_to: notes.attached_to } : {}) });
  };
  return fakeActionClient({
    discover: async () => views,
    invoke: async (_context, reference, input) => { calls.push(reference.capability_id); inputs.set(reference.capability_id, input); return reply(reference, input); },
  });
}

function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { exec: sql => db.exec(sql), prepare: sql => db.prepare(sql) as never, transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }) };
}

function serviceOver(t: { after(fn: () => void): void }, client: ActionClient): PlacementService {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const titles = new Map<string, string>();
  const ports: PlacementPorts = {
    ledger: createContextLedger(ledgerDatabase(db), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id }),
    spaces: async () => [{ project_id: "q4", title: "Q4", kind: "project" }],
    scope: async () => ({ client, caller }),
    titles: { get: (kind, id) => titles.get(`${kind}:${id}`) ?? null, set: (kind, id, title) => { titles.set(`${kind}:${id}`, title); } },
    text: pageText("zh"),
  };
  return new PlacementService(ports);
}

const FIVE: readonly PlacementRelationRole[] = ["list", "bind", "release", "candidates", "create"];
const TOPIC = { kind: "topic", id: "t1" };
const makeTopic = (request_id: string) => ({ source: NOTE, to: { attach_kind: "topic" }, to_project_id: "q4", request_id, payload: { title: "一个话题", body: "内容" } });

test("RAC-630 placement's source names no Goals capability id", () => {
  for (const file of ["index.ts", "subject-reader.ts"]) {
    const source = readFileSync(new URL(`../horizontal/placement/src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]goals\./, file);
  }
});

test("RAC-631 a relation another plugin keeps is listed, attached, released, offered and created by the same code, and the provider is whoever declares it", async t => {
  const calls: string[] = [], inputs = new Map<string, unknown>();
  const first = [...owner("io.example.topics", "topic", FIVE), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  const service = serviceOver(t, directory(first, calls, {}, inputs));

  const described = await service.describe(NOTE);
  const attached = described.associations.find(item => item.type === "attached");
  assert.deepEqual([attached?.label, attached?.removable, attached?.key], ["话题「第一个话题」", true, keyOf("t1")]);
  assert.deepEqual(attached?.target, { kind: "attached", project_id: "q4", object: TOPIC, noun: "话题", title: "第一个话题" });
  assert.deepEqual(await service.attachTargets("q4", NOTE), [{ kind: "topic", noun: "话题", targets: [{ id: "t1", title: "第一个话题", current: true }] }]);
  assert.deepEqual(inputs.get("io.example.topics.pick"), { subject: { kind: "note", id: "n1" } }, "the candidates are asked for the object in hand");
  const other = { kind: "topic", id: "t2" };
  assert.deepEqual(await service.attach(NOTE, "q4", other, "r7"), { key: keyOf("t2") });
  assert.deepEqual(inputs.get("io.example.topics.attach"), { subject: { kind: "note", id: "n1" }, target: other, read: { title: "一份笔记", revision: "r7" } },
    "what the person read goes with it, so the owner can name it and tell later whether it changed");
  assert.deepEqual(await service.unlink(keyOf("t2")), { removed: true });
  assert.deepEqual(inputs.get("io.example.topics.detach"), { subject: { kind: "note", id: "n1" }, target: other });
  const made = await service.convert(makeTopic("r1"));
  assert.deepEqual([made.object.kind, made.object.id, made.noun], ["topic", "t9", "话题"], "what is made is the target the owner names first, of the kind the declaration names, with its noun");
  assert.deepEqual(inputs.get("io.example.topics.make"), { subject: { kind: "note", id: "n1" }, name: "一个话题", request_id: "placement:r1",
    read: { title: "一份笔记", revision: "r7", excerpt: "内容" } });
  assert.ok(["attached", "attach", "detach", "pick", "make"].every(action => calls.includes(`io.example.topics.${action}`)), calls.join());

  // Another plugin takes the relation over: the old provider is no longer asked anything.
  const after: string[] = [];
  const second = [...owner("io.example.themes", "topic", FIVE), reader("io.example.notes", "note"), reader("io.example.themes", "topic", "主题")];
  const replaced = serviceOver(t, directory(second, after));
  await replaced.describe(NOTE); await replaced.attachTargets("q4", NOTE); await replaced.attach(NOTE, "q4", TOPIC);
  assert.ok(after.some(id => id.startsWith("io.example.themes.")) && !after.some(id => id.startsWith("io.example.topics.")), after.join());
});

test("RAC-632 a relation whose provider lacks a part, or has it refused, answers target_unavailable for that part and never calls another", async t => {
  const calls: string[] = [];
  // Releasing is refused here and nothing is offered for creating: attaching still works, the other two do not.
  const views = [...owner("io.example.topics", "topic", ["list", "bind", "candidates", "release"], ["release"]), reader("io.example.notes", "note")];
  const service = serviceOver(t, directory(views, calls));
  await assert.rejects(service.unlink(keyOf("t1")), { code: "placement.target_unavailable" });
  await assert.rejects(service.convert(makeTopic("r2")), { code: "placement.target_unavailable" });
  assert.deepEqual(calls.filter(id => /\.(detach|make)$/.test(id)), [], "the parts that were refused or not offered were never called");
  assert.deepEqual(await service.attach(NOTE, "q4", TOPIC), { key: keyOf("t1") });
  // Attaching itself is refused: nothing can be attached or offered, while what is attached can still be taken off.
  const refusedBind = serviceOver(t, directory([...owner("io.example.topics", "topic", FIVE, ["bind"]), reader("io.example.notes", "note")], calls));
  await assert.rejects(refusedBind.attach(NOTE, "q4", TOPIC), { code: "placement.target_unavailable" });
  assert.deepEqual(await refusedBind.attachTargets("q4", NOTE), [], "with no attaching part there is nothing to choose");
  assert.deepEqual(await refusedBind.unlink(keyOf("t1")), { removed: true });
  // Its list part is refused: the relation says neither what it ends on nor what is attached, so every part of it is unavailable.
  const refusedList = serviceOver(t, directory([...owner("io.example.topics", "topic", FIVE, ["list"]), reader("io.example.notes", "note")], calls));
  for (const operation of [refusedList.attach(NOTE, "q4", TOPIC), refusedList.unlink(keyOf("t1")), refusedList.convert(makeTopic("r2b"))]) {
    await assert.rejects(operation, { code: "placement.target_unavailable" });
  }
  // A relation kept in another shape (a background task's `serves`, which the mainline service calls itself) is not placement's to offer.
  const otherShape = owner("io.example.topics", "topic", FIVE).map(entry => ({ ...entry, action: { ...entry.action, input_type: undefined, output_type: undefined } }));
  const foreign: string[] = [];
  const unshaped = serviceOver(t, directory([...otherShape, reader("io.example.notes", "note")], foreign));
  assert.deepEqual(await unshaped.attachTargets("q4", NOTE), []);
  await assert.rejects(unshaped.attach(NOTE, "q4", TOPIC), { code: "placement.target_unavailable" });
  assert.deepEqual(foreign.filter(id => id.startsWith("io.example.topics.")), []);
  // Nobody declares the relation at all: nothing is listed, nothing is offered.
  const none = serviceOver(t, directory([reader("io.example.notes", "note")], []));
  assert.deepEqual(await none.attachTargets("q4", NOTE), []);
  assert.deepEqual((await none.describe(NOTE)).associations.filter(item => item.type === "attached"), []);
});

test("RAC-633 a reader that leaves attached_to out is described as usual; one that gives them still shows the link it keeps itself", async t => {
  const views = [...owner("io.example.topics", "topic", FIVE), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  const without = await serviceOver(t, directory(views, [])).describe(NOTE);
  assert.equal(without.state, "ok");
  assert.deepEqual(without.associations.filter(item => !item.removable), []);
  const kept = await serviceOver(t, directory(views, [], { attached_to: [{ kind: "topic", id: "t2" }] })).describe(NOTE);
  const own = kept.associations.filter(item => item.type === "attached" && !item.removable);
  assert.equal(own.length, 1);
  assert.match(own[0]!.label, /^话题「.*」 · .*里挂接$/);
  assert.equal(own[0]!.key, null);
});

test("RAC-632 a failing owner does not hide the refusal: the error is the owner's own", async t => {
  const calls: string[] = [];
  const views = owner("io.example.topics", "topic", FIVE);
  const refusing: ActionClient = fakeActionClient({ discover: async () => [...views, reader("io.example.notes", "note")], invoke: async (_context, reference, input) => {
    if (reference.capability_id.endsWith(".attach")) throw new ActionError("topics.closed", "话题已关闭");
    return await directory(views, calls).invoke(caller, reference, input);
  } });
  await assert.rejects(serviceOver(t, refusing).attach(NOTE, "q4", TOPIC), { code: "topics.closed" });
});

test("RAC-639 two providers declaring a relation onto the same kind in one directory is refused by every operation, and none of their actions is called", async t => {
  const calls: string[] = [];
  const both = [...owner("io.example.topics", "topic", FIVE), ...owner("io.example.themes", "topic", FIVE), reader("io.example.notes", "note")];
  const partial = [...owner("io.example.topics", "topic", ["list", "bind", "candidates"]), ...owner("io.example.themes", "topic", ["bind", "release", "create"]), reader("io.example.notes", "note")];
  for (const views of [both, partial]) {
    const service = serviceOver(t, directory(views, calls));
    const refused = { code: "placement.relation_ambiguous", kind: "conflict" };
    await assert.rejects(service.describe(NOTE), refused);
    await assert.rejects(service.attachTargets("q4", NOTE), refused);
    await assert.rejects(service.attach(NOTE, "q4", TOPIC), refused);
    await assert.rejects(service.unlink(keyOf("t1")), refused);
    await assert.rejects(service.convert(makeTopic("r-ambiguous")), refused);
  }
  assert.deepEqual(calls.filter(id => /^io\.example\.(topics|themes)\./.test(id)), [], "neither provider was asked anything");
  // The refusal names the two, so the person knows which to turn off.
  await assert.rejects(serviceOver(t, directory(both, calls)).attachTargets("q4", NOTE), (error: ActionError) => error.message.includes("io.example.topics") && error.message.includes("io.example.themes") && error.details?.relation === "topic");
  // A second provider that is not enabled here is not a competitor: the enabled one keeps the relation alone.
  const disabled = [...owner("io.example.topics", "topic", FIVE), ...owner("io.example.themes", "topic", FIVE, FIVE), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  assert.deepEqual(await serviceOver(t, directory(disabled, calls)).attachTargets("q4", NOTE), [{ kind: "topic", noun: "话题", targets: [{ id: "t1", title: "第一个话题", current: true }] }]);
  assert.ok(calls.includes("io.example.topics.pick") && !calls.some(id => id.startsWith("io.example.themes.")), calls.join());
  // Two relations, of two names, ending on the same kind: which keeps a binding would be a guess, so that is refused too.
  const twoNames: string[] = [];
  const named = [...owner("io.example.topics", "topic", FIVE), ...owner("io.example.themes", "topic", FIVE, [], "theme"), reader("io.example.notes", "note")];
  await assert.rejects(serviceOver(t, directory(named, twoNames)).attachTargets("q4", NOTE), { code: "placement.relation_ambiguous" });
  assert.deepEqual(twoNames.filter(id => /^io\.example\.(topics|themes)\./.test(id)), []);
});

test("RAC-638 what a conversion made says which plugin keeps it, from the owner's reader; with no reader to say, it says nothing and names no kind", async t => {
  const calls: string[] = [];
  const views = [...owner("io.example.topics", "topic", FIVE), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  const service = serviceOver(t, directory(views, calls));
  await service.convert(makeTopic("r3"));
  const into = () => ((async () => (await service.describe(NOTE)).associations.find(item => item.type === "derived_into"))());
  const kept = await into();
  assert.equal(kept?.target.kind, "object");
  assert.deepEqual(kept?.target.kind === "object" ? kept.target.plugin : undefined, { plugin_id: "io.example.topics", title: "话题" });
  assert.match(kept?.label ?? "", /^已建成 话题《第一个话题》/);
  // The keeper is gone (a disabled plugin): the end still shows, with no plugin to name.
  views.splice(views.findIndex(entry => entry.capability_id === "io.example.topics.read.topic"), 1);
  const gone = await into();
  assert.equal(gone?.target.kind === "object" ? gone.target.plugin : undefined, null);
});

test("RAC-638 Lingguang names where a spark went from the owner placement reports, and carries no other plugin's object kind", () => {
  const list = readFileSync(new URL("../plugins/native/lingguang/src/browser/list.ts", import.meta.url), "utf8");
  const fate = list.slice(list.indexOf("const fateLabel"), list.indexOf("const annotateFates"));
  assert.ok(fate.includes("target.plugin"), "the label reads the keeper placement reports");
  assert.doesNotMatch(fate, /["'`](goal|todo|page|document|jelly)["'`]/, "no other plugin's kind is named");
  const messages = readFileSync(new URL("../plugins/native/lingguang/locales/zh.json", import.meta.url), "utf8");
  assert.doesNotMatch(messages, /lingguang\.fate\.(goal|todo|page|jelly)\b/);
  assert.match(messages, /lingguang\.fate\.into/);
});
