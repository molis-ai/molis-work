import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { placementCallPorts } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  ActionError, bindObjectMoveHandler, defineObjectMoveAction, defineSubjectContextAction, subjectContext, type ActionCallContext, type ActionExecutionContext,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { createContextLedger, type ContextLedgerDatabase } from "@molis-ai/molis-work-module-context-ledger";
import { PlacementService, PLACEMENT_LEDGER_ACCESS, type PlacementPorts } from "@molis-ai/molis-work-service-placement";

// S-35: after a plugin has committed a cross-partition move and the round is then refused, the platform may put the object back
// (user decision 2026-10-17). The move-back goes only to where the object was, and not after the placement service has closed.

const reader = defineSubjectContextAction("notes.subject.read", "note", "笔记", ["notes:read"]);
const mover = defineObjectMoveAction("notes.placement.move", ["note"], "笔记", ["notes:write"]);
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
          return subjectContext({ subject: { kind: "note", id: "n1" }, revision: String(note.version), title: "检查清单", content: "", goal_ids: [], open: { surface: "notes", id: "n1" } });
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
