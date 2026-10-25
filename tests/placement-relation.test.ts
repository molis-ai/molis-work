import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  ActionError, SUBJECT_CONTEXT_OUTPUT_SCHEMA, SUBJECT_CONTEXT_INPUT_SCHEMA, SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, subjectContext,
  type ActionAvailability, type ActionCallContext, type ActionClient, type ActionMetadata, type ActionReference, type ActionView, type PlacementRelationRole,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { PLACEMENT_LEDGER_ACCESS, PlacementService, type PlacementPorts } from "@molis-ai/molis-work-service-placement";

/**
 * PG-032: placement keeps the person's relation between an object and a target its owner keeps (a document's Goal) without knowing which
 * plugin owns it. The owner's actions say which part they play (`placement_relation`); placement finds them in the directory by that. These tests
 * run the real service over a hand-made directory, with a relation that is not Goals' (`topic`), so what they prove is that no plugin is named.
 */

const NOTE = { kind: "note", id: "n1", project_id: "q4" };
const caller: ActionCallContext = { actor_id: "web-user", project_id: "q4", audience: "user", permissions: [] };
const ROLE_ACTION: Record<PlacementRelationRole, string> = { list: "attached", bind: "attach", release: "detach", candidates: "pick", create: "make" };

const base = (title: string): Omit<ActionMetadata, "kind" | "subject_kinds" | "input_schema"> => ({ title, description: title, scope: "project", audiences: ["user"], permissions: [] });
const view = (provider: string, title: string, capability: string, operation: "query" | "command", action: ActionMetadata, availability: ActionAvailability = { available: true }): ActionView =>
  ({ capability_id: capability, version: 1, provider_id: provider, operation, action, provider: { provider_id: provider, plugin_id: provider, title, kind: "plugin" }, availability });

function reader(provider: string, kind: string, title = "笔记"): ActionView {
  return view(provider, title, `${provider}.read.${kind}`, "query", { ...base("读取"), kind: "query", subject_kinds: [kind], input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE,
    input_schema: SUBJECT_CONTEXT_INPUT_SCHEMA, output_schema: SUBJECT_CONTEXT_OUTPUT_SCHEMA });
}

/** A plugin that keeps `relation`, offering `roles` (with `unavailable` ones present but refused). Calls land in `calls` by capability id. */
function owner(provider: string, relation: string, roles: readonly PlacementRelationRole[], calls: string[], unavailable: readonly PlacementRelationRole[] = []): ActionView[] {
  return roles.map(role => view(provider, "话题", `${provider}.${ROLE_ACTION[role]}`, role === "list" || role === "candidates" ? "query" : "command", {
    ...base(ROLE_ACTION[role]), kind: role === "list" || role === "candidates" ? "query" : "operation", subject_kinds: [], input_schema: { type: "object" },
    placement_relation: { relation, role, ...(role === "list" ? { target: { kind: "topic", noun: "话题" } } : {}) },
  }, unavailable.includes(role) ? { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" } : { available: true }));
}

function directory(views: readonly ActionView[], calls: string[], notes: { goal_ids?: string[] } = {}): ActionClient {
  const reply = (reference: ActionReference, input: unknown): unknown => {
    const id = reference.capability_id;
    if (id.endsWith(".attached")) return { bindings: [{ binding_id: "b1", goal_id: "t1", created_at: "2026-10-25T00:00:00.000Z" }] };
    if (id.endsWith(".attach")) return { binding: { binding_id: "b2" } };
    if (id.endsWith(".detach")) return { released: true };
    if (id.endsWith(".pick")) return { goals: [{ goal_id: "t1", title: "第一个话题" }], next_cursor: null };
    if (id.endsWith(".make")) return { goal: { goal_id: "t9" } };
    const subject = (input as { subject_id: string }).subject_id;
    if (id.endsWith(".read.topic")) return subjectContext({ subject: { kind: "topic", id: subject }, revision: "1", title: "第一个话题", content: "" });
    return subjectContext({ subject: { kind: "note", id: subject }, revision: "1", title: "一份笔记", content: "正文", ...(notes.goal_ids ? { goal_ids: notes.goal_ids } : {}) });
  };
  return {
    discover: async () => views,
    invoke: async (_context, reference, input) => { calls.push(reference.capability_id); return reply(reference, input); },
  };
}

function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { exec: sql => db.exec(sql), prepare: sql => db.prepare(sql) as never, transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }) };
}

function serviceOver(t: { after(fn: () => void): void }, client: ActionClient, relation = "topic"): PlacementService {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const titles = new Map<string, string>();
  const ports: PlacementPorts = {
    ledger: createContextLedger(ledgerDatabase(db), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id }),
    spaces: async () => [{ project_id: "q4", title: "Q4", kind: "project" }],
    scope: async () => ({ client, caller }),
    titles: { get: (kind, id) => titles.get(`${kind}:${id}`) ?? null, set: (kind, id, title) => { titles.set(`${kind}:${id}`, title); } },
    relation,
  };
  return new PlacementService(ports);
}

const FIVE: readonly PlacementRelationRole[] = ["list", "bind", "release", "candidates", "create"];

test("RAC-630 placement's source names no Goals capability id", () => {
  for (const file of ["index.ts", "subject-reader.ts"]) {
    const source = readFileSync(new URL(`../horizontal/placement/src/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]goals\./, file);
  }
});

test("RAC-631 a relation another plugin keeps is listed, bound, released, offered and created by the same code, and the provider is whoever declares it", async t => {
  const calls: string[] = [];
  const first = [...owner("io.example.topics", "topic", FIVE, calls), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  const service = serviceOver(t, directory(first, calls));

  const described = await service.describe(NOTE);
  const attached = described.associations.find(item => item.type === "goal");
  assert.deepEqual([attached?.label, attached?.removable, attached?.key], ["话题「第一个话题」", true, JSON.stringify(["goal", "q4", "t1", "b1"])]);
  assert.deepEqual(await service.goals("q4"), [{ goal_id: "t1", title: "第一个话题" }]);
  assert.deepEqual(await service.bindGoal(NOTE, "q4", "t1"), { key: JSON.stringify(["goal", "q4", "t1", "b2"]) });
  assert.deepEqual(await service.unlink(JSON.stringify(["goal", "q4", "t1", "b2"])), { removed: true });
  const made = await service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "r1", payload: { title: "一个话题", body: "内容" } });
  assert.deepEqual([made.object.kind, made.object.id], ["topic", "t9"], "what is made is of the kind the declaration names");
  assert.ok(["attached", "attach", "detach", "pick", "make"].every(action => calls.includes(`io.example.topics.${action}`)), calls.join());

  // Another plugin takes the relation over: the old provider is no longer asked anything.
  const after: string[] = [];
  const second = [...owner("io.example.themes", "topic", FIVE, after), reader("io.example.notes", "note"), reader("io.example.themes", "topic", "主题")];
  const replaced = serviceOver(t, directory(second, after));
  await replaced.describe(NOTE); await replaced.goals("q4"); await replaced.bindGoal(NOTE, "q4", "t1");
  assert.ok(after.some(id => id.startsWith("io.example.themes.")) && !after.some(id => id.startsWith("io.example.topics.")), after.join());
});

test("RAC-632 a relation whose provider lacks a part, or has it refused, answers target_unavailable for that part and never calls another", async t => {
  const calls: string[] = [];
  const views = [...owner("io.example.topics", "topic", ["list", "candidates", "release"], calls, ["release"]), reader("io.example.notes", "note")];
  const service = serviceOver(t, directory(views, calls));
  await assert.rejects(service.bindGoal(NOTE, "q4", "t1"), { code: "placement.target_unavailable" });
  await assert.rejects(service.unlink(JSON.stringify(["goal", "q4", "t1", "b1"])), { code: "placement.target_unavailable" });
  await assert.rejects(service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "r2", payload: { title: "一个话题", body: "内容" } }), { code: "placement.target_unavailable" });
  assert.deepEqual(calls.filter(id => /\.(attach|detach|make)$/.test(id)), [], "the parts that were refused were never called");
  // Nobody declares the relation at all: nothing is listed, nothing is offered.
  const none = serviceOver(t, directory([reader("io.example.notes", "note")], []));
  assert.deepEqual(await none.goals("q4"), []);
  assert.deepEqual((await none.describe(NOTE)).associations.filter(item => item.type === "goal"), []);
});

test("RAC-633 a reader that leaves goal_ids out is described as usual; one that gives them still shows the link it keeps itself", async t => {
  const views = [...owner("io.example.topics", "topic", FIVE, []), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  const without = await serviceOver(t, directory(views, [])).describe(NOTE);
  assert.equal(without.state, "ok");
  assert.deepEqual(without.associations.filter(item => !item.removable), []);
  const kept = await serviceOver(t, directory(views, [], { goal_ids: ["t2"] })).describe(NOTE);
  const own = kept.associations.filter(item => item.type === "goal" && !item.removable);
  assert.equal(own.length, 1);
  assert.match(own[0]!.label, /^话题「.*」 · .*里挂接$/);
  assert.equal(own[0]!.key, null);
});

test("RAC-632 a failing owner does not hide the refusal: the error is the owner's own", async t => {
  const calls: string[] = [];
  const views = owner("io.example.topics", "topic", FIVE, calls);
  const refusing: ActionClient = { discover: async () => [...views, reader("io.example.notes", "note")], invoke: async (_context, reference, input) => {
    if (reference.capability_id.endsWith(".attach")) throw new ActionError("topics.closed", "话题已关闭");
    return await directory(views, calls).invoke(caller, reference, input);
  } };
  await assert.rejects(serviceOver(t, refusing).bindGoal(NOTE, "q4", "t1"), { code: "topics.closed" });
});

test("RAC-638 what a conversion made says which plugin keeps it, from the owner's reader; with no reader to say, it says nothing and names no kind", async t => {
  const calls: string[] = [];
  const views = [...owner("io.example.topics", "topic", FIVE, calls), reader("io.example.notes", "note"), reader("io.example.topics", "topic", "话题")];
  const service = serviceOver(t, directory(views, calls));
  await service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "r3", payload: { title: "一个话题", body: "内容" } });
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
  const messages = readFileSync(new URL("../plugins/native/lingguang/src/messages.ts", import.meta.url), "utf8");
  assert.doesNotMatch(messages, /lingguang\.fate\.(goal|todo|page|jelly)\b/);
  assert.match(messages, /lingguang\.fate\.into/);
});
