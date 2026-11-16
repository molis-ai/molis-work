import assert from "node:assert/strict";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { WORK_EVENTS_INPUT_TYPE, WORK_EVENTS_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BackgroundTasksReadResult, WaitingReadResult, WorkLineReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * Coding on the work line (specs/work-line §5, WLN-37, WLN-38): its sessions are events by the same registration any plugin uses, and
 * the rounds under way are rows of the task table that serve those same sessions. The workbench reads both through the mainline
 * service's own doors, as the person: nothing in the Host or the page names Coding.
 */

test("WLN-37 Coding registers its sessions as events with the event registry's two types, read-only, for the kinds it declares", () => {
  const declared = codingManifest.actions?.find(action => action.capability_id === "coding.events");
  assert.ok(declared, "Coding's Manifest declares the registration");
  assert.deepEqual([declared.operation, declared.action.scope, declared.action.input_type, declared.action.output_type, declared.action.subject_kinds],
    ["query", "project", WORK_EVENTS_INPUT_TYPE, WORK_EVENTS_OUTPUT_TYPE, ["coding_session"]]);
  assert.deepEqual(declared.action.permissions, ["artifact:read"], "it asks for nothing beyond reading");
});

test("WLN-37, WLN-38, WLN-39 the workbench's line shows Coding's sessions: one under way or waiting is beside now with its task behind it, one that ended today is behind now in its own state, an old one is not on the line; the waiting count and the panel agree", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Alpha", ["coding"]);
  await startProjectPlugins(home.host, project.reference);
  const now = Date.now(), at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const store = new LocalProjectDatabase(project.database_path), coding = codingSessions(store);
  try {
    for (const [id, state, when, steps] of [["s-run", "running", at(1), null], ["s-ask", "waiting-answer", at(2), null], ["s-done", "done", at(3), null], ["s-held", "done", at(4), { mine: 1, subtasks: 0, unowned: 0 }],
      ["s-old", "done", "2020-01-01T00:00:00.000Z", null]] as const) {
      await coding.create(noEffect, { project_id: project.project_id, session_id: id, title: `${id} 的会话`, runtime_id: "prologue", at: when });
      await coding.setState(noEffect, project.project_id, id, state as never, when);
      if (steps) await coding.setSteps(noEffect, project.project_id, id, steps);
    }
  } finally { store.close(); }
  const window = { from: at(-12 * 60), to: at(12 * 60), now: at(0) }, base = `/projects/${encodeURIComponent(project.project_id)}/api/mainline`;
  const line = await home.web.post<WorkLineReadResult>(`${base}/line`, window);
  assert.deepEqual(line.issues, []);
  const sessions = line.events.filter(event => event.subject.kind === "coding_session");
  assert.deepEqual(sessions.map(event => [event.subject.id, event.wing, event.line_state, event.waiting, event.tasks.running, event.tasks.waiting]), [
    ["s-done", "done", "round-ended", false, 0, 0],   // ended today: behind now, in its own state
    ["s-held", "now", "answer", true, 0, 1],          // ended, but the person holds a step: its task waits, so the event does
    ["s-ask", "now", "answer", true, 0, 1],
    ["s-run", "now", "running", false, 1, 0],
  ]);
  assert.ok(!line.events.some(event => event.subject.id === "s-old"), "a session that ended before the window is not on the line");
  const run = sessions.find(event => event.subject.id === "s-run")!;
  assert.deepEqual(run.tasks.refs, [{ kind: "coding_session", id: "s-run" }]);
  assert.deepEqual(run.open, { kind: "item", surface: "coding", id: "s-run", title: "s-run 的会话", label: "打开会话" });
  assert.deepEqual(run.origin, { surface: "coding", title: "Coding", icon: "code" });

  // The number at the head of the line and the panel's rows come from the same facts.
  const waiting = await home.web.post<WaitingReadResult>(`${base}/waiting`, window), table = await home.web.post<BackgroundTasksReadResult>(`${base}/tasks`, {});
  assert.deepEqual(waiting.items.filter(item => item.subject.kind === "coding_session").map(item => [item.subject.id, item.source]), [["s-held", "task"], ["s-ask", "task"]]);
  assert.deepEqual(table.tasks.filter(task => task.waiting).map(task => task.subject.id).sort(), ["s-ask", "s-held"]);
  assert.deepEqual(table.tasks.map(task => task.subject.id).sort(), ["s-ask", "s-held", "s-run"]);
});
