import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// A Goal progress record may carry the saved evidence it rests on: a source with an artifact id, a version, a title and the item it
// came from. `parseGoalProgressSource` (plugins/native/goals/src/module/event-system-payload.ts) is the one place that judges a
// source: the write refuses one that does not hold up (`goals.event_progress.invalid_source`), and both reads (the state's progress
// summary, the event's payload) drop one that does not. Its limit on the three texts (the artifact id, the title, the origin's item
// id) is 1000 characters, and one character may take two UTF-16 units. This file drives it through the public application, the
// way tests/goal-event-write-rules.test.ts does, so it adds no import of the Goals package.

const BOARD = "board-progress-source";
const PAIR = "\u{1F600}"; // one character, two UTF-16 units (U+D83D U+DE00)
const INVALID_SOURCE = "goals.event_progress.invalid_source";

type Source = { artifact_id: string; version: number; title: string; origin: { plugin_id: string; item_id: string } };
type Field = "artifact_id" | "title" | "item_id";
const FIELDS: readonly Field[] = ["artifact_id", "title", "item_id"];

/** A source that holds up, with `text` in the one field under test. */
function sourceWith(field: Field, text: string): Source {
  return {
    artifact_id: field === "artifact_id" ? text : "artifact-1",
    version: 1,
    title: field === "title" ? text : "一份固定成果",
    origin: { plugin_id: "coding", item_id: field === "item_id" ? text : "item-1" },
  };
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-progress-source-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: BOARD, actor_id: "user-1", idempotency_key: "init" });
  return { directory, store, app };
}

type Data = ReturnType<typeof fixture>;

function close(data: Data) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

const runtime = { actor_id: "runtime-1", actor_kind: "runtime" as const };

function isRefused(error: unknown): boolean {
  return error instanceof ActionError && error.code === INVALID_SOURCE;
}

/** A goal with one note on it: the note's cursor is what a progress record is based on. */
function goalWithNote(data: Data) {
  const created = data.app.goalEvents.createIntent({ project_id: BOARD, title: "目标", outcome: "一段结果", ...runtime, idempotency_key: "intent" });
  const goalId = created.goal.goal_id;
  const note = data.app.goalEvents.recordNote({ project_id: BOARD, goal_id: goalId, ...runtime, idempotency_key: "note", body: "先有一条记录" });
  return { goalId, cursor: note.observed_event_cursor };
}

type Goal = ReturnType<typeof goalWithNote>;

function progressInput(goal: Goal, source: Source) {
  return { project_id: BOARD, goal_id: goal.goalId, ...runtime, idempotency_key: "progress", based_on_cursor: goal.cursor, summary: "已有可接续的成果", source };
}

/** The source is recorded, and the record, the state read and the event read all give it back whole. */
function assertKeptWhole(data: Data, goal: Goal, source: Source) {
  const recorded = data.app.goalEvents.recordProgress(progressInput(goal, source));
  assert.deepEqual(recorded.progress_summary.source, source, "the record carries it");
  assert.deepEqual(data.app.goalEvents.readState(BOARD, goal.goalId).progress_summary?.source, source, "the state read keeps it");
  const event = data.app.goalEvents.readEvent(BOARD, goal.goalId, recorded.event_id);
  assert.equal(event.kind, "system");
  assert.deepEqual((event.payload as { source?: unknown }).source, source, "the event read keeps it");
}

/** The source is refused with `goals.event_progress.invalid_source`, and nothing is recorded. */
function assertRefused(data: Data, goal: Goal, source: Source) {
  const eventsBefore = data.store.readEventsDescending(BOARD);
  assert.throws(() => data.app.goalEvents.recordProgress(progressInput(goal, source)), isRefused);
  assert.deepEqual(data.store.readEventsDescending(BOARD), eventsBefore, "a refused write leaves no event behind");
  assert.equal(data.app.goalEvents.readState(BOARD, goal.goalId).progress_summary, null);
}

/** Runs `body` on a fresh project library with one goal that has a note, and closes the library after. */
function withGoal(body: (data: Data, goal: Goal) => void) {
  const data = fixture();
  try {
    body(data, goalWithNote(data));
  } finally {
    close(data);
  }
}

for (const { name, text } of [
  { name: "1000 two-unit characters (2000 units)", text: PAIR.repeat(1000) },
  { name: "999 plain characters and one two-unit character (1001 units)", text: "a".repeat(999) + PAIR },
  { name: "600 two-unit characters (1200 units)", text: PAIR.repeat(600) },
  { name: "1000 plain characters (1000 units)", text: "a".repeat(1000) },
]) {
  for (const field of FIELDS) {
    test(`RAC-1960 the ${field} of ${name} is accepted and kept whole`, () => {
      withGoal((data, goal) => assertKeptWhole(data, goal, sourceWith(field, text)));
    });
  }
}

for (const { name, text } of [
  { name: "1001 two-unit characters (2002 units)", text: PAIR.repeat(1001) },
  { name: "1000 plain characters and one two-unit character (1002 units)", text: "a".repeat(1000) + PAIR },
  { name: "1001 plain characters (1001 units)", text: "a".repeat(1001) },
  { name: "1500 plain characters (1500 units)", text: "a".repeat(1500) },
]) {
  for (const field of FIELDS) {
    test(`RAC-1961 the ${field} of ${name} is refused`, () => {
      withGoal((data, goal) => assertRefused(data, goal, sourceWith(field, text)));
    });
  }
}

// A text of more than 2000 UTF-16 units holds more than 1000 characters, so it is refused before anything is counted. The string
// iterator is wrapped around the write: it counts the strings of more than 2000 units that anything spreads or iterates.
function longStringsIterated(write: () => void): { failure: unknown; iterated: number } {
  const original = String.prototype[Symbol.iterator];
  let iterated = 0;
  String.prototype[Symbol.iterator] = function (this: string) {
    if (String(this).length > 2000) iterated += 1;
    return original.call(this);
  };
  let failure: unknown;
  try {
    write();
  } catch (error) {
    failure = error;
  } finally {
    String.prototype[Symbol.iterator] = original;
  }
  return { failure, iterated };
}

for (const { name, text } of [
  { name: "2002 units, the shortest one over the bound", text: PAIR.repeat(1001) },
  { name: "5000 units", text: "a".repeat(5000) },
  { name: "2000000 units", text: "a".repeat(2_000_000) },
]) {
  for (const field of FIELDS) {
    test(`RAC-1962 the ${field} of ${name} is refused without being spread`, () => {
      withGoal((data, goal) => {
        const input = progressInput(goal, sourceWith(field, text));
        const { failure, iterated } = longStringsIterated(() => { data.app.goalEvents.recordProgress(input); });
        assert.ok(isRefused(failure), "it is refused with goals.event_progress.invalid_source");
        assert.equal(iterated, 0, "the long text is not spread or iterated");
      });
    });
  }
}

/** A source with one rule broken: `patch` overwrites fields, so a value may be of a type the interface does not allow. */
const broken = (patch: Record<string, unknown>): Source => Object.assign(sourceWith("title", "一份固定成果"), patch);

for (const { name, source } of [
  { name: "a blank artifact_id", source: sourceWith("artifact_id", "   ") },
  { name: "a blank title", source: sourceWith("title", "   ") },
  { name: "a blank item_id", source: sourceWith("item_id", "   ") },
  { name: "an artifact_id that is not a string", source: broken({ artifact_id: 5 }) },
  { name: "version 0", source: broken({ version: 0 }) },
  { name: "version 1.5", source: broken({ version: 1.5 }) },
  { name: "a plugin_id with a capital letter", source: broken({ origin: { plugin_id: "Coding", item_id: "item-1" } }) },
  { name: "a plugin_id of 101 characters", source: broken({ origin: { plugin_id: "a".repeat(101), item_id: "item-1" } }) },
]) {
  test(`RAC-1963 a source with ${name} is still refused`, () => {
    withGoal((data, goal) => assertRefused(data, goal, source));
  });
}

test("RAC-1963 an ordinary source is still accepted and kept whole", () => {
  withGoal((data, goal) => assertKeptWhole(data, goal, sourceWith("title", "一份固定成果")));
});
