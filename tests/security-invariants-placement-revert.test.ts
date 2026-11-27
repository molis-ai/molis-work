import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { placementCallPorts } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  ActionError, bindObjectMoveHandler, defineObjectExportAction, defineObjectMoveAction, defineObjectPutAction, defineObjectRemoveAction, defineSubjectContextAction, sameCarriedRecord,
  subjectContext, type ActionCallContext, type ActionExecutionContext,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { CarrySettling, PlacementService, PLACEMENT_LEDGER_ACCESS, type PlacementPorts } from "@molis-ai/molis-work-service-placement";

// S-35: after a plugin has committed a cross-partition move and the round is then refused, the platform may put the object back
// (user decision 2026-10-17). The move-back goes only to where the object was, and not after the placement service has closed.
// BSH-04: these cases are the "committed move, then revoke/close" matrix; the object's fixed version stays with its owner (the
// artifact tests cover the fixed version), and a refused move-back writes no location edge.

const reader = defineSubjectContextAction("notes.subject.read", 1, "note", "笔记", ["notes:read"]);
const mover = defineObjectMoveAction("notes.placement.move", 1, ["note"], "笔记", ["notes:write"]);
const owner = (project_id: string | null): ActionCallContext => ({ actor_id: "web-user", project_id, audience: "user", permissions: ["notes:read", "notes:write"] });
const old = { kind: "note", id: "n1", project_id: "personal" };

function ledgerDatabase(db: DatabaseSync): ContextLedgerDatabase {
  const run = <T>(operation: () => T): T => {
    if (db.isTransaction) return operation();
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  return { exec: sql => db.exec(sql), prepare: sql => db.prepare(sql) as never, transaction: <T>(operation: () => T) => Object.assign(() => run(operation), { immediate: () => run(operation) }) };
}

/** A wait the test holds open: the call stops at `wait()` until `release()`; `reached` settles once it has stopped there. */
function pause() {
  let release!: () => void, reach!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const reached = new Promise<void>(resolve => { reach = resolve; });
  return { wait: () => { reach(); return released; }, reached, release: () => release() };
}

interface WorldOptions {
  /** Makes the move back land somewhere else. */
  lieTo?: string;
  /** Awaited while a partition opens. */
  opening?: (projectId: string | null) => Promise<void> | void;
  /** The partition caller's own authority check, awaited before the mover is entered. */
  authority?: (projectId: string | null) => Promise<void> | void;
  /** Awaited inside the mover before it takes its final check and commits, as a plugin that does work first would. */
  moving?: (to: string) => Promise<void> | void;
}

/** One note in the personal space, a mover in every partition, and the ports the Host wraps per call. */
function world({ lieTo, opening, authority, moving }: WorldOptions = {}) {
  const projects = ["personal", "q4", "interview"];
  const note = { project: "personal", version: 1 };
  const counts = { moves: 0, opened: 0 };
  const actions = new ActionService();
  for (const project of projects) {
    actions.registerProvider({ provider: { provider_id: "notes", plugin_id: "notes", title: "笔记", kind: "plugin", project_id: project }, definitions: [reader, mover],
      handlers: [
        { ...reader, handle: caller => {
          if (note.project !== caller.project_id) throw new ActionError("notes.not_found", "笔记不存在");
          return subjectContext({ subject: { kind: "note", id: "n1" }, revision: String(note.version), title: "检查清单", content: "", open: { surface: "notes", id: "n1" } });
        } },
        bindObjectMoveHandler(mover, async (input, caller) => {
          if (moving) { await moving(input.to_project_id); await caller.beforeEffect(); }
          counts.moves += 1;
          const to = lieTo && input.to_project_id === "personal" ? lieTo : input.to_project_id;
          note.project = to; note.version += 1;
          return { subject: input.subject, project_id: to, revision: String(note.version) };
        }),
      ] });
  }
  const ledger = createContextLedger(ledgerDatabase(new DatabaseSync(":memory:")), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id });
  const titles = new Map<string, string>();
  const ports: PlacementPorts = {
    ledger,
    spaces: async () => projects.map(id => ({ project_id: id, title: id, kind: id === "personal" ? "personal" as const : "project" as const })),
    scope: async projectId => {
      counts.opened += 1;
      await opening?.(projectId);
      return { client: actions, caller: { ...owner(projectId), ...(authority ? { validate_authority: () => authority(projectId) } : {}) } };
    },
    titles: { get: (kind, id) => titles.get(kind + ":" + id) ?? null, set: (kind, id, title) => { titles.set(kind + ":" + id, title); } },
  };
  // A lookup through the bare ports, so it does not depend on the call that was refused.
  const locate = (object: typeof old) => new PlacementService(ports).locate(object);
  return { note, counts, ports, locate };
}

test("S-35 once the placement service has closed, a moved object is not put back: the move-back is refused and nothing moves", async () => {
  const w = world();
  let alive = true;
  // The service closes while the move waits on its last check, after the plugin has already moved the note.
  const origin: ActionExecutionContext = { ...owner("personal"), beforeEffect: async () => { if (w.note.project === "q4") alive = false; } };
  const service = new PlacementService(placementCallPorts(w.ports, origin, () => alive));
  await assert.rejects(service.move(old, "q4"), (error: unknown) => {
    assert.equal((error as ActionError).code, "actions.expired");
    assert.equal(((error as Error).cause as ActionError).code, "actions.expired", "the move-back itself was refused");
    return true;
  });
  assert.equal(w.note.project, "q4", "the plugin's own move stands; the closed service moved nothing back");
  assert.equal(w.counts.moves, 1, "the mover was asked once, for the move itself");
  assert.deepEqual(w.locate(old), { object: old, moved: false }, "no location edge was written");

  const opened = w.counts.opened;
  await assert.rejects(placementCallPorts(w.ports, origin, () => false).revert!("q4"), { code: "actions.expired", message: "原放置服务已关闭" });
  assert.equal(w.counts.opened, opened, "a refused move-back does not open the partition");
});

test("S-35 a move-back goes only to the object's own project: a plugin that reports another one is refused and no location edge is written", async () => {
  const w = world({ lieTo: "interview" });
  // The round is refused after the plugin moved the note to q4. The move back asks for personal; the plugin answers interview.
  const origin: ActionExecutionContext = { ...owner("personal"), beforeEffect: async () => { if (w.note.project === "q4") throw new Error("这一轮被取消"); } };
  const service = new PlacementService(placementCallPorts(w.ports, origin, () => true));
  await assert.rejects(service.move(old, "q4"), (error: unknown) => {
    assert.match((error as Error).message, /这一轮被取消/);
    assert.equal(((error as Error).cause as ActionError).code, "placement.result_mismatch");
    return true;
  });
  assert.equal(w.counts.moves, 2, "the move, then one move back that was not accepted");
  assert.deepEqual(w.locate(old), { object: old, moved: false }, "neither the place the plugin reported nor any other is recorded");
});

// The service closes after the move-back has started: it is refused at the final synchronous check before the mover commits,
// wherever the move-back was waiting when the service closed.
async function closesDuringMoveBack(options: (held: ReturnType<typeof pause>) => WorldOptions) {
  const held = pause();
  const w = world(options(held));
  let alive = true;
  // The round is refused after the plugin moved the note to q4, while the service is still open, so the move back begins.
  const origin: ActionExecutionContext = { ...owner("personal"), beforeEffect: async () => { if (w.note.project === "q4") throw new Error("这一轮被取消"); } };
  const moving = new PlacementService(placementCallPorts(w.ports, origin, () => alive)).move(old, "q4");
  await held.reached;
  alive = false;
  held.release();
  await assert.rejects(moving, (error: unknown) => {
    assert.match((error as Error).message, /这一轮被取消/);
    assert.equal(((error as Error).cause as ActionError | undefined)?.code, "actions.expired", "the move-back was refused because the service had closed");
    return true;
  });
  assert.equal(w.note.project, "q4", "the plugin's own move stands; the closed service moved nothing back");
  assert.equal(w.counts.moves, 1, "the mover committed once, for the move itself");
  assert.deepEqual(w.locate(old), { object: old, moved: false }, "no location edge was written");
}

test("S-35 a service that closes while the move-back opens the partition does not put the object back", async () => {
  // Only the move-back opens q4: the move itself runs in the note's own partition.
  await closesDuringMoveBack(held => ({ opening: projectId => projectId === "q4" ? held.wait() : undefined }));
});

test("S-35 a service that closes while the move-back's authority is awaited does not put the object back", async () => {
  await closesDuringMoveBack(held => ({ authority: projectId => projectId === "q4" ? held.wait() : undefined }));
});

test("S-35 a service that closes while the mover itself waits before committing the move-back does not put the object back", async () => {
  await closesDuringMoveBack(held => ({ moving: to => to === "personal" ? held.wait() : undefined }));
});

// S-35, carried moves (batch 107): an object kept in its partition's own library is carried by placement itself, export → put → remove.
// A refused remove takes back the put; a refused location write carries it back; a cut between the put and the remove is recorded first
// and settled by what the two partitions hold, never by overwriting either.
const exporter = defineObjectExportAction("notes.placement.export", 1, ["note"], "笔记", ["notes:read"]);
const putter = defineObjectPutAction("notes.placement.put", 1, ["note"], "笔记", ["notes:write"]);
const remover = defineObjectRemoveAction("notes.placement.remove", 1, ["note"], "笔记", ["notes:write"]);

interface CarryOptions {
  /** Refuses the remove where the note was: a conflict, or a cut (the Host stops: neither the remove nor taking back the put happens). */
  remove?: (from: string) => "conflict" | "cut" | undefined;
  /** Awaited inside the put, before it writes. */
  putting?: () => Promise<void>;
}

function carryWorld({ remove, putting }: CarryOptions = {}) {
  const projects = ["personal", "q4", "interview"];
  const notes = new Map<string, { version: number; body: string }>([["personal", { version: 1, body: "检查清单" }]]);
  let cut = false, refusing = true;
  const exports = new Map<string, number>(), removes = new Map<string, number>();
  const actions = new ActionService();
  const record = (at: string) => { const note = notes.get(at)!; return { body: note.body, version: note.version }; };
  for (const project of projects) {
    actions.registerProvider({ provider: { provider_id: "notes", plugin_id: "notes", title: "笔记", kind: "plugin", project_id: project }, definitions: [reader, exporter, putter, remover],
      handlers: [
        { ...reader, handle: caller => {
          const note = notes.get(caller.project_id!);
          if (!note) throw new ActionError("notes.not_found", "笔记不存在", { kind: "not_found" });
          return subjectContext({ subject: { kind: "note", id: "n1" }, revision: String(note.version), title: note.body, content: "", open: { surface: "notes", id: "n1" } });
        } },
        { ...exporter, handle: caller => {
          exports.set(caller.project_id!, (exports.get(caller.project_id!) ?? 0) + 1);
          if (!notes.has(caller.project_id!)) throw new ActionError("notes.not_found", "笔记不存在", { kind: "not_found" });
          return { subject: { kind: "note", id: "n1" }, revision: String(notes.get(caller.project_id!)!.version), record: record(caller.project_id!) };
        } },
        { ...putter, handle: async (caller, input) => {
          await putting?.();
          const { record: carried } = input as { record: { body: string; version: number } };
          if (notes.has(caller.project_id!)) {
            if (!sameCarriedRecord(record(caller.project_id!), carried)) throw new ActionError("notes.conflict", "目标位置已经有这份笔记，而且内容不同", { kind: "conflict" });
          } else notes.set(caller.project_id!, { version: carried.version, body: carried.body });
          return { subject: { kind: "note", id: "n1" }, project_id: caller.project_id!, revision: String(notes.get(caller.project_id!)!.version) };
        } },
        { ...remover, handle: (caller, input) => {
          const at = caller.project_id!, { revision } = input as { revision: string };
          removes.set(at, (removes.get(at) ?? 0) + 1);
          const refusal = cut ? "cut" : refusing ? remove?.(at) : undefined;
          if (refusal === "cut") { cut = true; throw new Error("宿主停了"); }
          if (refusal === "conflict") throw new ActionError("notes.conflict", "笔记刚被修改", { kind: "conflict" });
          if (String(notes.get(at)?.version) !== revision) throw new ActionError("notes.conflict", "笔记刚被修改", { kind: "conflict" });
          notes.delete(at);
          return { subject: { kind: "note", id: "n1" }, removed: true };
        } },
      ] });
  }
  const ledger = createContextLedger(ledgerDatabase(new DatabaseSync(":memory:")), { authorize: access => access.actor_id === PLACEMENT_LEDGER_ACCESS.actor_id });
  const titles = new Map<string, string>();
  const ports: PlacementPorts = {
    ledger,
    spaces: async () => projects.map(id => ({ project_id: id, title: id, kind: id === "personal" ? "personal" as const : "project" as const })),
    scope: async projectId => ({ client: actions, caller: owner(projectId) }),
    titles: { get: (kind, id) => titles.get(kind + ":" + id) ?? null, set: (kind, id, title) => { titles.set(kind + ":" + id, title); } },
  };
  return { notes, ports, exports, removes, restart: () => { cut = false; refusing = false; }, service: () => new PlacementService(ports) };
}

test("a carried object is offered to move and copy: its partition's exporter is what offers it, with no mover of the old kind (batch 107)", async () => {
  const described = await carryWorld().service().describe(old);
  assert.deepEqual([described.state, described.can.move, described.can.copy], ["ok", true, true]);
});

test("S-35 a carried move whose remove is refused takes back what it put: the note is only where it was, and no carry is left", async () => {
  const w = carryWorld({ remove: from => from === "personal" ? "conflict" : undefined });
  await assert.rejects(w.service().move(old, "q4"), { code: "notes.conflict" });
  assert.deepEqual([...w.notes.keys()], ["personal"], "the put in q4 was taken back");
  assert.equal(w.service().pendingCarries(), 0);
  assert.deepEqual(w.service().locate(old), { object: old, moved: false });
});

test("S-35 a carried move whose location write is refused is carried back to where it was", async () => {
  const w = carryWorld();
  const origin: ActionExecutionContext = { ...owner("personal"), beforeEffect: async () => { if (w.notes.has("q4") && !w.notes.has("personal")) throw new Error("这一轮被取消"); } };
  await assert.rejects(new PlacementService(placementCallPorts(w.ports, origin, () => true)).move(old, "q4"), /这一轮被取消/u);
  assert.deepEqual([...w.notes.keys()], ["personal"], "carried back: only in the personal space");
  assert.equal(w.service().pendingCarries(), 0);
  assert.deepEqual(w.service().locate(old), { object: old, moved: false });
});

test("S-35 a carry cut between its put and its remove is finished once the Host is back, even after the target was edited", async () => {
  const w = carryWorld({ remove: from => from === "personal" ? "cut" : undefined });
  await assert.rejects(w.service().move(old, "q4"), /宿主停了/u);
  assert.deepEqual([...w.notes.keys()].sort(), ["personal", "q4"], "cut: it is in both partitions");
  assert.equal(w.service().pendingCarries(), 1, "the carry was recorded before the put");
  w.restart();
  w.notes.set("q4", { version: 2, body: "改过的检查清单" });
  assert.equal(await w.service().settleCarries(), 0);
  assert.deepEqual([...w.notes.keys()], ["q4"], "the original went; what was written at the target is kept");
  assert.equal(w.notes.get("q4")!.body, "改过的检查清单");
  assert.deepEqual(w.service().locate(old), { object: { ...old, project_id: "q4" }, moved: true });
  assert.equal(w.service().pendingCarries(), 0);
});

test("S-35 a cut carry whose original changed since is taken back at the target; one changed in both places is kept in both and refuses the next move", async () => {
  const w = carryWorld({ remove: from => from === "personal" ? "cut" : undefined });
  await assert.rejects(w.service().move(old, "q4"), /宿主停了/u);
  w.restart();
  w.notes.set("personal", { version: 2, body: "原处改过" });
  assert.equal(await w.service().settleCarries(), 0);
  assert.deepEqual([...w.notes.keys()], ["personal"], "the put was taken back; the original with its change stays");
  assert.equal(w.notes.get("personal")!.body, "原处改过");

  const both = carryWorld({ remove: from => from === "personal" ? "cut" : undefined });
  await assert.rejects(both.service().move(old, "q4"), /宿主停了/u);
  both.restart();
  both.notes.set("personal", { version: 2, body: "原处改过" });
  both.notes.set("q4", { version: 2, body: "目标改过" });
  assert.equal(await both.service().settleCarries(), 1, "changed in both: nothing is decided for the person");
  assert.deepEqual([...both.notes.keys()].sort(), ["personal", "q4"]);
  await assert.rejects(both.service().move(old, "interview"), { code: "placement.carry_unsettled" });
  assert.equal(both.notes.get("q4")!.body, "目标改过", "nothing either side wrote was replaced");
});

test("S-35 a cut carry is not settled while either partition's owner cannot be reached: the record stays, both copies stay, and it is settled once the owner is back", async () => {
  for (const unreachable of ["personal", "q4"] as const) {
    const w = carryWorld({ remove: from => from === "personal" ? "cut" : undefined });
    await assert.rejects(w.service().move(old, "q4"), /宿主停了/u);
    w.restart();
    // The partition's directory offers no carry actions right now (the plugin taken out there, switched off, or not starting), or cannot be read.
    for (const discover of [async () => [], async () => { throw new Error("目录读不出"); }]) {
      const ports: PlacementPorts = { ...w.ports, scope: async id => {
        const opened = await w.ports.scope(id);
        return id === unreachable ? { ...opened, client: { ...opened.client, invoke: opened.client.invoke.bind(opened.client), discover } as never } : opened;
      } };
      assert.equal(await new PlacementService(ports).settleCarries(), 1, `${unreachable} unreachable: still unsettled`);
      assert.equal(new PlacementService(ports).pendingCarries(), 1, "the record stays");
      assert.deepEqual([...w.notes.keys()].sort(), ["personal", "q4"], "neither copy is touched");
      assert.deepEqual(new PlacementService(ports).locate(old), { object: old, moved: false });
    }
    assert.equal(await w.service().settleCarries(), 0, "the owner is back: settled");
    assert.deepEqual([...w.notes.keys()], ["q4"]);
  }
});

test("S-35 a carry left unsettled is not tried again on every call: the background pass waits for a new carry or the retry interval", async () => {
  const w = carryWorld({ remove: from => from === "personal" ? "cut" : undefined });
  await assert.rejects(w.service().move(old, "q4"), /宿主停了/u);
  w.restart();
  w.notes.set("personal", { version: 2, body: "原处改过" });
  w.notes.set("q4", { version: 2, body: "目标改过" });
  w.exports.clear();
  let now = 0;
  const passes: Array<{ pending: number; left: number; failed: boolean }> = [];
  const settling = new CarrySettling(w.service(), { now: () => now, retryMs: 1000, settled: ({ pending, left, failed }) => passes.push({ pending, left, failed }) });
  for (let call = 0; call < 5; call++) { settling.kick(); await settling.idle(); }
  assert.deepEqual(passes, [{ pending: 1, left: 1, failed: false }], "one pass, told for the work records with what it found and left (batch 108)");
  assert.deepEqual(Object.fromEntries(w.exports), { personal: 1, q4: 1 }, "changed in both: one pass reads each side once, then waits");
  assert.equal(w.service().pendingCarries(), 1, "and the record stays");
  now = 1500;
  settling.kick(); await settling.idle();
  assert.deepEqual(Object.fromEntries(w.exports), { personal: 2, q4: 2 }, "tried again once the interval has passed");
});

test("S-35 a move under way is not settled from outside: a background pass started between its put and its remove leaves it to finish", async () => {
  const put = pause();
  const w = carryWorld({ putting: () => put.wait() });
  const settling = new CarrySettling(w.service());
  const moving = w.service().move(old, "q4");
  await put.reached;
  assert.equal(w.service().pendingCarries(), 1, "the move has written its record");
  settling.kick(); await settling.idle();
  await assert.rejects(w.service().move(old, "interview"), { code: "placement.carry_in_progress" }, "a second move of it waits for the first");
  put.release();
  await moving;
  settling.kick(); await settling.idle();
  assert.deepEqual([...w.notes.keys()], ["q4"], "only at the target");
  assert.equal(w.service().pendingCarries(), 0);
  assert.deepEqual(w.service().locate(old), { object: { ...old, project_id: "q4" }, moved: true });
  assert.deepEqual(Object.fromEntries(w.removes), { personal: 1 }, "removed once where it was, and the target's copy never");
});

test("S-35 a put onto an object already at the target accepts only the same record again: a retried put is a replay, an edited target is a conflict", async () => {
  const w = carryWorld();
  const q4 = { client: (await w.ports.scope("q4")).client, caller: owner("q4") };
  const put = (body: string, version: number) => q4.client.invoke(q4.caller, { capability_id: putter.capability_id, version: putter.version },
    { kind: "note", record: { body, version }, request_id: "r1", target_id: "n1" });
  await put("检查清单", 1);
  await put("检查清单", 1);
  w.notes.set("q4", { version: 2, body: "目标改过" });
  await assert.rejects(put("检查清单", 1), { code: "notes.conflict" });
  assert.equal(w.notes.get("q4")!.body, "目标改过");
});

test("AP-07 CarrySettling.close suppresses post-close DB reads and unhandled rejections when placement.db closes during settleCarries", async () => {
  const gate = pause();
  let dbClosed = false;
  let settledCalls = 0;
  let unhandled = 0;
  const onUnhandled = () => { unhandled += 1; };
  process.on("unhandledRejection", onUnhandled);
  try {
    const fakeService = {
      pendingCarryRecords: () => {
        if (dbClosed) throw new Error("ERR_SQLITE_ERROR: database is not open");
        return ["carrying:note:n1"];
      },
      settleCarries: async () => {
        await gate.wait();
        return 0;
      },
    };
    const settling = new CarrySettling(fakeService, {
      isClosed: () => dbClosed,
      settled: () => { settledCalls += 1; },
    });
    settling.kick();
    await gate.reached;
    dbClosed = true;
    settling.close();
    gate.release();
    await settling.idle();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settledCalls, 0, "closed CarrySettling does not emit settled after close");
    assert.equal(unhandled, 0, "no unhandled rejection when DB closes during in-flight settleCarries");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("AP-12 carryMove checks beforeEffect before noteCarrying, clears carrying edge on definite pre-effect refusal, and settleCarry checks beforeEffect before carry_not_put", async () => {
  // 1. Cancelled call before noteCarrying writes no carrying edge and never calls put.
  {
    const w = carryWorld();
    let exportCalls = 0;
    let cancelled = false;
    const origin: ActionExecutionContext = {
      ...owner("personal"),
      beforeEffect: async () => {
        if (cancelled) throw new ActionError("actions.cancelled", "已取消");
      },
    };
    const wrappedPorts = placementCallPorts(w.ports, origin, () => true);
    const originalScope = wrappedPorts.scope;
    wrappedPorts.scope = async projectId => {
      const scope = await originalScope(projectId);
      if (projectId === "personal") {
        const origInvoke = scope.client.invoke.bind(scope.client);
        return {
          ...scope,
          client: {
            ...scope.client,
            discover: scope.client.discover.bind(scope.client),
            invoke: async (caller, ref, input) => {
              const result = await origInvoke(caller, ref, input);
              if (ref.capability_id === exporter.capability_id) { exportCalls += 1; cancelled = true; }
              return result;
            },
          } as never,
        };
      }
      return scope;
    };
    await assert.rejects(new PlacementService(wrappedPorts).move(old, "q4"), { code: "actions.cancelled" });
    assert.equal(exportCalls, 1);
    assert.equal(w.service().pendingCarries(), 0, "cancelled move writes no carrying edge");
    assert.equal(w.notes.has("q4"), false);
  }

  // 2. Definite pre-effect forbidden refusal from target put clears the carrying edge immediately.
  {
    const w = carryWorld({ putting: async () => { throw new ActionError("actions.forbidden", "目标禁止写入"); } });
    await assert.rejects(w.service().move(old, "q4"), { code: "actions.forbidden" });
    assert.equal(w.service().pendingCarries(), 0, "definite pre-effect forbidden refusal clears carrying edge");
  }

  // 3. settleCarry calls beforeEffect before removing a carry_not_put edge.
  {
    const w = carryWorld({ putting: async () => { throw new Error("ambiguous IO failure"); } });
    await assert.rejects(w.service().move(old, "q4"), /ambiguous IO failure/u);
    assert.equal(w.service().pendingCarries(), 1, "ambiguous failure keeps carrying edge for settlement");
    const blocked = new PlacementService({ ...w.ports, beforeEffect: async () => { throw new ActionError("actions.cancelled", "已取消"); } });
    assert.equal(await blocked.settleCarries(), 1, "cancelled beforeEffect keeps carry_not_put unsettled");
    assert.equal(w.service().pendingCarries(), 1, "cancelled settleCarry does not mutate ledger on carry_not_put");
    await assert.rejects(blocked.move(old, "q4"), { code: "actions.cancelled" }, "move propagates cancelled settleCarry beforeEffect");
    assert.equal(w.service().pendingCarries(), 1, "carry_not_put edge remains until an authorized settlement runs");
    assert.equal(await w.service().settleCarries(), 0, "valid settleCarry clears carry_not_put");
  }
});
