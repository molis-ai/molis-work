import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import {
  ActionError, bindHomeObjectMoveHandler, bindObjectCopyHandler, bindObjectMoveHandler, defineObjectCopyAction, defineObjectMoveAction,
  defineSubjectContextAction, subjectContext, type ActionCallContext, type ActionDefinition, type ActionReference, type PlacementRelationRole,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { PLACEMENT_LEDGER_ACCESS, PlacementService } from "@molis-ai/molis-work-service-placement";

const NOTE = { kind: "note", id: "n1", project_id: "q4" };
const FIVE: readonly PlacementRelationRole[] = ["list", "bind", "release", "candidates", "create"];
const READ = defineSubjectContextAction("notes.subject.read", "note", "笔记", ["notes:read"]);
interface RelationOwner { provider: string; prefix: string; roles?: readonly PlacementRelationRole[]; unavailable?: readonly PlacementRelationRole[]; disabled?: boolean; project?: string }
interface ToolOwner { provider: string; prefix: string; kind: "move" | "copy"; disabled?: boolean; home?: boolean; project?: string }
interface Note { title: string; body: string; project: string }

function database(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { exec: sql => db.exec(sql), prepare: sql => db.prepare(sql) as never,
    transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }) };
}

function relationDefinitions(owner: RelationOwner): ActionDefinition[] {
  return (owner.roles ?? FIVE).map(role => {
    const query = role === "list" || role === "candidates";
    return { capability_id: `${owner.prefix}.${role}`, version: 1, operation: query ? "query" : "command", action: {
      title: "话题", description: "管理对象和话题的关联", scope: "project", kind: query ? "query" : "operation", audiences: ["user"],
      permissions: [query ? "topics:read" : "topics:write"], subject_kinds: [], input_schema: { type: "object" },
      placement_relation: { relation: "topic", role, ...(role === "list" ? { target: { kind: "topic", noun: "话题" } } : {}) },
    } };
  });
}

function fixture(t: TestContext, options: { relations?: RelationOwner[]; tools?: ToolOwner[]; readDisabled?: boolean; createFailure?: ActionError; beforeEffect?: () => void } = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const ledger = createContextLedger(database(db), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id });
  const calls: ActionReference[] = [], effects: string[] = [], titleWrites: string[] = [];
  const notes = new Map<string, Note>([["n1", { title: "私有标题", body: "私有正文", project: "q4" }]]);
  const caller: ActionCallContext = { actor_id: "web-user", project_id: "q4", audience: "user", permissions: ["notes:read", "notes:write", "topics:read", "topics:write"] };
  const actions = new ActionService();
  actions.registerProvider({ provider: { provider_id: "notes", title: "笔记", kind: "plugin" }, definitions: [READ], handlers: [{ ...READ,
    availability: () => options.readDisabled ? { available: false, code: "actions.plugin_disabled", reason: "未启用" } : { available: true },
    handle: (context, input) => {
      const id = (input as { subject_id: string }).subject_id, note = notes.get(id);
      if (!note || note.project !== context.project_id) throw new ActionError("notes.not_found", "笔记不存在");
      return subjectContext({ subject: { kind: "note", id }, revision: "1", title: note.title, content: note.body });
    },
  }] });
  for (const owner of options.relations ?? []) {
    const definitions = relationDefinitions(owner);
    actions.registerProvider({ provider: { provider_id: owner.provider, plugin_id: "io.example.topics", title: "话题", kind: "plugin", project_id: owner.project ?? "q4" }, definitions,
      availability: () => owner.disabled ? { available: false, code: "actions.plugin_disabled", reason: "未启用" } : { available: true },
      handlers: definitions.map(definition => ({ ...definition,
        availability: () => owner.unavailable?.includes(definition.action.placement_relation!.role)
          ? { available: false, code: "actions.plugin_disabled", reason: "角色未启用" } : { available: true },
        handle: () => {
          const role = definition.action.placement_relation!.role;
          effects.push(`${owner.provider}:${role}`);
          if (role === "list") return { bindings: [{ binding_id: "b1", goal_id: "t1", created_at: "2026-10-25T00:00:00.000Z" }] };
          if (role === "bind") return { binding: { binding_id: "b2" } };
          if (role === "release") return { released: true };
          if (role === "candidates") return { goals: [{ goal_id: "t1", title: "话题一" }], next_cursor: null };
          if (options.createFailure) throw options.createFailure;
          return { goal: { goal_id: "t2" } };
        },
      })),
    });
  }
  for (const owner of options.tools ?? []) {
    const move = defineObjectMoveAction(`${owner.prefix}.move`, ["note"], "笔记", ["notes:write"], owner.home ? "home" : "project");
    const copy = defineObjectCopyAction(`${owner.prefix}.copy`, ["note"], "笔记", ["notes:write"]);
    const moveNote = (input: { subject: { kind: string; id: string }; to_project_id: string }) => {
      effects.push(`${owner.provider}:move`);
      notes.get(input.subject.id)!.project = input.to_project_id;
      return { subject: input.subject, project_id: input.to_project_id, revision: "2" };
    };
    const handler = owner.kind === "move" ? owner.home ? bindHomeObjectMoveHandler(move, moveNote) : bindObjectMoveHandler(move, moveNote)
      : bindObjectCopyHandler(copy, input => {
        effects.push(`${owner.provider}:copy`);
        notes.set("copy", { ...notes.get(input.subject.id)!, project: input.to_project_id });
        return { subject: { kind: "note", id: "copy" }, project_id: input.to_project_id, revision: "1" };
      });
    actions.registerProvider({ provider: { provider_id: owner.provider, plugin_id: "io.example.notes", title: "笔记", kind: "plugin", ...(owner.project ? { project_id: owner.project } : {}) },
      definitions: [owner.kind === "move" ? move : copy], handlers: [handler],
      availability: () => owner.disabled ? { available: false, code: "actions.plugin_disabled", reason: "未启用" } : { available: true },
    });
  }
  let ledgerWrites = 0;
  const put = ledger.commands.put.bind(ledger.commands), remove = ledger.commands.remove.bind(ledger.commands);
  ledger.commands.put = (...args) => { ledgerWrites += 1; return put(...args); };
  ledger.commands.remove = (...args) => { ledgerWrites += 1; return remove(...args); };
  const client = { discover: actions.discover.bind(actions), invoke: async (context: ActionCallContext, reference: ActionReference, input: unknown) => {
    calls.push(reference); return actions.invoke(context, reference, input);
  } };
  const service = new PlacementService({ ledger, relation: "topic", beforeEffect: options.beforeEffect,
    spaces: async () => ["q4", "interview"].map(project_id => ({ project_id, title: project_id, kind: "project" as const })),
    scope: async project_id => ({ client, caller: { ...caller, project_id } }),
    titles: { get: () => null, set: (_kind, id) => { titleWrites.push(id); } },
  });
  return { service, actions, client, caller, notes, calls, effects, titleWrites, ledger, writes: () => ledgerWrites };
}

const RELATION_OPERATIONS = [
  { name: "describe", reads: 1, run: (service: PlacementService) => service.describe(NOTE) },
  { name: "goals", reads: 0, run: (service: PlacementService) => service.goals("q4") },
  { name: "bindGoal", reads: 1, run: (service: PlacementService) => service.bindGoal(NOTE, "q4", "t1") },
  { name: "unlink", reads: 0, run: (service: PlacementService) => service.unlink(JSON.stringify(["goal", "q4", "t1", "b1"])) },
  { name: "convert", reads: 1, run: (service: PlacementService) => service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "conversion" }) },
];

async function refused(f: ReturnType<typeof fixture>, run: () => Promise<unknown>, sourceReads: number, code = "placement.target_unavailable") {
  const failure: unknown = await run().then(() => null, error => error);
  assert.deepEqual({ code: failure instanceof ActionError ? failure.code : null,
    invoked: f.calls.map(ref => [ref.provider_id, ref.capability_id]), effects: f.effects,
    writes: f.writes(), edges: f.ledger.query.list(PLACEMENT_LEDGER_ACCESS).length, titleWrites: f.titleWrites, notes: [...f.notes],
  }, { code, invoked: Array.from({ length: sourceReads }, () => ["notes", READ.capability_id]),
    effects: [], writes: 0, edges: 0, titleWrites: Array.from({ length: sourceReads }, () => "n1"),
    notes: [["n1", { title: "私有标题", body: "私有正文", project: "q4" }]],
  });
  assert.ok(failure instanceof ActionError);
  return failure;
}

for (const reverse of [false, true]) {
  for (const split of [false, true]) {
    test(`RAC-640 ${split ? "split" : "complete"} roles: real directory refuses both providers (reverse=${reverse})`, async t => {
      for (const operation of RELATION_OPERATIONS) await t.test(operation.name, async t => {
        const owners: RelationOwner[] = [
          { provider: "installation:one", prefix: reverse ? "z" : "a", ...(split ? { roles: ["list", "bind"] as const } : {}) },
          { provider: "installation:two", prefix: reverse ? "a" : "z", ...(split ? { roles: ["list", "release", "candidates", "create"] as const, unavailable: ["list"] as const } : {}) },
        ];
        const f = fixture(t, { relations: reverse ? owners.reverse() : owners });
        await refused(f, () => operation.run(f.service), operation.reads, "placement.relation_ambiguous");
      });
    });
  }
  for (const kind of ["move", "copy"] as const) {
    test(`RAC-641 competing ${kind} actions are refused (reverse=${reverse})`, async t => {
      for (const describe of [true, false]) await t.test(describe ? "describe" : kind, async t => {
        const tools: ToolOwner[] = [{ provider: "notes:one", prefix: reverse ? "z" : "a", kind }, { provider: "notes:two", prefix: reverse ? "a" : "z", kind }];
        const f = fixture(t, { tools: reverse ? tools.reverse() : tools });
        const failure = await refused(f, () => describe ? f.service.describe(NOTE) : kind === "move" ? f.service.move(NOTE, "interview") : f.service.copy(NOTE, "interview", "copy"), describe ? 1 : 0);
        assert.equal(failure.kind, "conflict");
        assert.equal(failure.details?.operation, kind);
        assert.equal(failure.details?.subject_kind, "note");
        const actions = failure.details?.actions as ActionReference[];
        assert.deepEqual(new Set(actions.map(action => JSON.stringify(action))),
          new Set(tools.map(owner => JSON.stringify({ capability_id: `${owner.prefix}.${kind}`, version: 1, provider_id: owner.provider }))));
      });
    });
  }
}

test("RAC-641 competing Home movers are refused before any move or placement write", async t => {
  const f = fixture(t, { tools: [{ provider: "notes:one", prefix: "a", kind: "move", home: true }, { provider: "notes:two", prefix: "z", kind: "move", home: true }] });
  await refused(f, () => f.service.move({ ...NOTE, project_id: null }, "interview"), 0);
});

test("RAC-641 two matching actions from the same provider also cannot be selected arbitrarily", async t => {
  for (const kind of ["move", "copy"] as const) await t.test(kind, async t => {
    const f = fixture(t, { tools: [{ provider: "one", prefix: "a", kind }, { provider: "one", prefix: "z", kind }] });
    await refused(f, () => kind === "move" ? f.service.move(NOTE, "interview") : f.service.copy(NOTE, "interview", "duplicate"), 0);
  });
});

test("RAC-643 a supplied payload does not cache its title before refusing ambiguous targets", async t => {
  const f = fixture(t, { readDisabled: true, relations: [{ provider: "one", prefix: "a" }, { provider: "two", prefix: "z" }] });
  await refused(f, () => f.service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "payload", payload: { title: "未读取的标题", body: "未读取的正文" } }), 0, "placement.relation_ambiguous");
});

test("RAC-643 payload titles are cached after a successful target creation, but not after its refusal", async t => {
  for (const fail of [false, true]) await t.test(fail ? "target refuses" : "target creates", async t => {
    const createFailure = new ActionError("topics.closed", "话题已关闭");
    const f = fixture(t, { readDisabled: true, relations: [{ provider: "one", prefix: "z" }], ...(fail ? { createFailure } : {}) });
    const pending = f.service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "payload", payload: { title: "标题", body: "正文" } });
    if (fail) await assert.rejects(pending, error => error === createFailure);
    else assert.equal((await pending).object.id, "t2");
    assert.deepEqual(f.effects, ["one:create"]);
    assert.deepEqual(f.titleWrites, fail ? [] : ["n1"]);
    assert.equal(f.writes(), fail ? 0 : 3);
  });
});

test("RAC-643 payload conversion keeps both original invocation-control checks and writes no cache after refusal", async t => {
  for (const failAt of [1, 2]) await t.test(`refuse at check ${failAt}`, async t => {
    const refusal = new ActionError("actions.cancelled", "原调用已取消");
    let checks = 0;
    const f = fixture(t, { readDisabled: true, relations: [{ provider: "one", prefix: "z" }],
      beforeEffect: () => { if (++checks === failAt) throw refusal; },
    });
    await assert.rejects(f.service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "refused", payload: { title: "标题", body: "正文" } }), error => error === refusal);
    assert.equal(checks, failAt);
    assert.deepEqual(f.effects, failAt === 1 ? [] : ["one:create"]);
    assert.deepEqual(f.titleWrites, []);
    assert.equal(f.writes(), 0);
  });
});

test("RAC-642 only available relation owners in the current partition compete; a single owner still supports all five operations", async t => {
  const f = fixture(t, { relations: [{ provider: "disabled", prefix: "a", disabled: true }, { provider: "elsewhere", prefix: "b", project: "interview" }, { provider: "one", prefix: "z" }] });
  for (const operation of RELATION_OPERATIONS) await operation.run(f.service);
  assert.deepEqual(new Set(f.effects), new Set(FIVE.map(role => `one:${role}`)));
  assert.ok(f.writes() > 0);
});

test("RAC-642 unique move/copy actions still move the original, create a copy and record their positions", async t => {
  const f = fixture(t, { tools: [{ provider: "disabled", prefix: "a", kind: "move", disabled: true }, { provider: "one", prefix: "z", kind: "move" }, { provider: "one", prefix: "z", kind: "copy" }] });
  const copied = await f.service.copy(NOTE, "interview", "one-copy");
  assert.deepEqual(copied.object, { ...NOTE, id: "copy", project_id: "interview" });
  const moved = await f.service.move(NOTE, "interview");
  assert.deepEqual(moved.object, { ...NOTE, project_id: "interview" });
  assert.equal(f.notes.get("n1")?.project, "interview");
  assert.equal(f.notes.get("copy")?.project, "interview");
  assert.deepEqual(f.effects, ["one:copy", "one:move"]);
  assert.ok(f.ledger.query.list(PLACEMENT_LEDGER_ACCESS).some(edge => edge.type === "placement.copied_from"));
  assert.deepEqual(f.service.locate(NOTE).object, moved.object);
});

test("RAC-642 ambiguity in the other protocol does not block the unique move or copy requested", async t => {
  for (const kind of ["move", "copy"] as const) await t.test(kind, async t => {
    const other = kind === "move" ? "copy" : "move";
    const f = fixture(t, { tools: [{ provider: "one", prefix: "unique", kind }, { provider: "two", prefix: "a", kind: other }, { provider: "three", prefix: "z", kind: other }] });
    if (kind === "move") await f.service.move(NOTE, "interview");
    else await f.service.copy(NOTE, "interview", "unique");
    assert.deepEqual(f.effects, [`one:${kind}`]);
  });
});

test("RAC-642 disabling the competing provider lets the refused move or copy be retried with the remaining owner", async t => {
  for (const kind of ["move", "copy"] as const) await t.test(kind, async t => {
    const competing: ToolOwner = { provider: "two", prefix: "a", kind };
    const f = fixture(t, { tools: [competing, { provider: "one", prefix: "z", kind }] });
    await refused(f, () => kind === "move" ? f.service.move(NOTE, "interview") : f.service.copy(NOTE, "interview", "retry"), 0);
    competing.disabled = true;
    const result = kind === "move" ? await f.service.move(NOTE, "interview") : await f.service.copy(NOTE, "interview", "retry");
    assert.deepEqual(f.effects, [`one:${kind}`]);
    assert.equal(f.notes.get(result.object.id)?.project, "interview");
    assert.deepEqual((await f.service.describe(result.object)).object, result.object);
    assert.deepEqual(f.service.locate(result.object).object, result.object);
  });
});

test("RAC-642 moving and copying keep the caller's user audience and write permission requirements", async t => {
  for (const audience of ["agent", "workflow", "user"] as const) await t.test(audience, async t => {
    const f = fixture(t, { tools: [{ provider: "one", prefix: "z", kind: "move" }, { provider: "one", prefix: "z", kind: "copy" }] });
    Object.assign(f.caller, { audience, ...(audience === "user" ? { permissions: ["notes:read"] } : {}) });
    await assert.rejects(f.service.move(NOTE, "interview"), { code: "placement.not_movable" });
    await assert.rejects(f.service.copy(NOTE, "interview", "refused"), { code: "placement.not_copyable" });
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.effects, []);
    assert.equal(f.writes(), 0);
  });
});

test("RAC-642 directory failure keeps the existing unavailable description and absent-tool behavior", async t => {
  const f = fixture(t), failure = new Error("目录暂时读不到");
  f.client.discover = () => { throw failure; };
  const described = await f.service.describe(NOTE);
  assert.equal(described.state, "unavailable");
  assert.equal(described.reason, failure.message);
  assert.deepEqual(described.can, { move: false, copy: false, use_in_project: false });
  await assert.rejects(f.service.goals("q4"), error => error === failure);
  await assert.rejects(f.service.move(NOTE, "interview"), { code: "placement.not_movable" });
  await assert.rejects(f.service.copy(NOTE, "interview", "unavailable"), { code: "placement.not_copyable" });
  assert.deepEqual(f.calls, []);
  assert.equal(f.writes(), 0);
});

test("RAC-645 a missing or unavailable role is not borrowed from a disabled owner", async t => {
  const f = fixture(t, { relations: [{ provider: "disabled", prefix: "a", disabled: true }, { provider: "one", prefix: "z", roles: ["list", "candidates", "release"], unavailable: ["release"] }] });
  await assert.rejects(f.service.bindGoal(NOTE, "q4", "t1"), { code: "placement.target_unavailable" });
  await assert.rejects(f.service.unlink(JSON.stringify(["goal", "q4", "t1", "b1"])), { code: "placement.target_unavailable" });
  await assert.rejects(f.service.convert({ source: NOTE, to: { goal: true }, to_project_id: "q4", request_id: "missing" }), { code: "placement.target_unavailable" });
  assert.deepEqual(await f.service.goals("q4"), [{ goal_id: "t1", title: "话题一" }]);
  assert.deepEqual(f.effects, ["one:candidates"]);
  assert.equal(f.writes(), 0);
});

test("RAC-645 absent read roles still list no candidates or bindings", async t => {
  const f = fixture(t, { relations: [{ provider: "one", prefix: "z", roles: ["list"], unavailable: ["list"] }] });
  assert.deepEqual(await f.service.goals("q4"), []);
  assert.deepEqual((await f.service.describe(NOTE)).associations, []);
  assert.deepEqual(f.effects, []);
  assert.equal(f.writes(), 0);
});

test("RAC-644 an ambiguous rollback never calls a destination mover or pretends the initial move was undone", async t => {
  const refusal = new ActionError("actions.cancelled", "原调用已取消");
  const f = fixture(t, { beforeEffect: () => { throw refusal; }, tools: [
    { provider: "source", prefix: "source", kind: "move", project: "q4" },
    { provider: "destination:one", prefix: "a", kind: "move", project: "interview" },
    { provider: "destination:two", prefix: "z", kind: "move", project: "interview" },
  ] });
  const failure: unknown = await f.service.move(NOTE, "interview").then(() => null, error => error);
  assert.deepEqual({ originalRefusal: failure === refusal, rollbackCode: refusal.cause instanceof ActionError ? refusal.cause.code : null,
    effects: f.effects, invoked: f.calls.map(ref => ref.provider_id), project: f.notes.get("n1")?.project, writes: f.writes(),
  }, { originalRefusal: true, rollbackCode: "placement.target_unavailable", effects: ["source:move"], invoked: ["source"], project: "interview", writes: 0 },
  "the original move committed before rollback became ambiguous; no destination provider may be picked to undo it");
});
