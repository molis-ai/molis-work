import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { WORK_RECORDS_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";

// OCL-07, OCL-10 (specs/observation-collection/spec.md; design §4「工作台界面行为」, §9 D3; contract-design §4, §9): the shell records which
// object the focused pane shows, the time spent on it per object per minute, and the stages of a list it presents and of finding what was
// chosen, joined by that one interaction; clicking is not adopting. The shipped page script runs on a bare page with its clock in hand, and
// what it sends goes through the Host's own project route, so the records are the shell's, in that project.

interface Sent { readonly url: string; readonly body: { facts: Array<Record<string, unknown>> }; readonly keepalive: boolean }

function page() {
  const sent: Sent[] = [], timers: Array<() => void> = [];
  let interval: (() => void) | undefined;
  const document = Object.assign(new EventTarget(), { visibilityState: "visible", hasFocus: () => true });
  const window = new EventTarget();
  const context = vm.createContext({ document, crypto: globalThis.crypto, Date, console,
    addEventListener: window.addEventListener.bind(window),
    setInterval: (run: () => void) => { interval = run; return 1; },
    setTimeout: (run: () => void) => { timers.push(run); return timers.length; }, clearTimeout: () => undefined,
    molisWorkRequest: (url: string, init: { body: Sent["body"]; keepalive?: boolean }) => { sent.push({ url, body: init.body, keepalive: init.keepalive === true }); return Promise.resolve({}); } });
  vm.runInContext(`globalThis.shown = null;`, context);
  const records = vm.runInContext(`(${WORK_RECORDS_FACTORY_SCRIPT})({ route: (path) => "/projects/p1" + path, current: () => globalThis.shown })`, context) as {
    interaction(list: string): { presented(items: unknown[], detail: object): void; chosen(item: unknown, index: number): void; dismissed(): void;
      locate(stage: string, item: unknown, outcome?: string, detail?: object): void };
    subject(kind: string, id: string, version?: string): unknown };
  return {
    sent, records, document,
    show: (value: { surface: string; id: string } | null) => { vm.runInContext(`globalThis.shown = ${JSON.stringify(value)};`, context); },
    second: () => interval!(),
    scroll: () => document.dispatchEvent(new Event("scroll")),
    timers: () => { for (const run of timers.splice(0)) run(); },
    hide: () => { document.visibilityState = "hidden"; document.dispatchEvent(new Event("visibilitychange")); },
  };
}

test("OCL-07 OCL-10: what is shown, time on it per minute, and one search's stages are recorded by the shell in its project; reports wait two seconds, or leave at once when hidden", { timeout: 60_000 }, async t => {
  const p = page();
  p.show({ surface: "pages", id: "doc-1" });
  p.second(); p.scroll(); p.second(); p.second();
  assert.equal(p.sent.length, 0, "nothing is sent before the two seconds are up");
  p.timers();
  assert.equal(p.sent.length, 1);
  assert.equal(p.sent[0]!.url, "/projects/p1/api/observation/ui");
  assert.equal(p.sent[0]!.keepalive, false);

  const search = p.records.interaction("search");
  const a = p.records.subject("pages_document", "doc-2", "7"), b = p.records.subject("todo", "task-9");
  search.presented([a, b], { scope: "all", more: false });
  search.chosen(b, 1);
  search.locate("requested", b, undefined, { away: false });
  search.locate("visible", b, undefined, { surface: "todo" });
  search.locate("highlighted", b, undefined, { surface: "todo" });
  const left = p.records.interaction("search");
  left.presented([a], { scope: "project", more: false });
  left.dismissed();
  p.show({ surface: "todo", id: "task-9" });
  p.second();
  p.hide();
  assert.equal(p.sent.at(-1)!.keepalive, true, "a hidden page sends what it holds at once");

  const served = await openTestHome(t, { catalogPolicy: false });
  const project = await served.createProject("Shell stages", []);
  for (const report of p.sent) {
    const response = await fetch(served.origin + report.url.replace("/projects/p1/", `/projects/${project.project_id}/`), { method: "POST", body: JSON.stringify(report.body),
      headers: { origin: served.origin, "content-type": "application/json", "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() } });
    const result = await response.json() as { accepted?: number; rejected?: unknown[] };
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual([result.accepted, result.rejected], [report.body.facts.length, []]);
  }
  const layer = served.host.observation!.layer; layer.flush();
  const records = readRecords(layer.writer.database()!.db, { limit: 5000 }).filter(record => record.fact.startsWith("ui."));
  assert.ok(records.every(record => record.owner.kind === "shell" && record.entry === "workbench" && record.project_id === project.project_id), "the shell's, in the project it reported from");
  const line = (record: (typeof records)[number]) => `${record.fact}:${record.stage}:${record.outcome}:${record.subjects.map(item => item.id).join(",")}`;
  assert.deepEqual(records.map(line), [
    "ui.open:shown:succeeded:doc-1",
    "ui.candidates:presented:succeeded:doc-2,task-9", "ui.candidates:chosen:succeeded:task-9",
    "ui.locate:requested:succeeded:task-9", "ui.locate:visible:succeeded:task-9", "ui.locate:highlighted:succeeded:task-9",
    "ui.candidates:presented:succeeded:doc-2", "ui.candidates:dismissed:no_action:",
    "ui.dwell:minute:succeeded:doc-1", "ui.open:shown:succeeded:task-9", "ui.dwell:minute:succeeded:task-9",
  ]);
  const dwell = records.filter(record => record.fact === "ui.dwell");
  assert.deepEqual(dwell.map(record => record.detail), [{ seconds: 3, scrolled_seconds: 1 }, { seconds: 1, scrolled_seconds: 0 }], "summed per object per minute (D3)");
  assert.ok(dwell.every(record => record.occurred_at.endsWith(":00.000Z")), "a minute's sum is dated at its minute");
  const [first, second] = [records.slice(1, 6), records.slice(6, 8)];
  assert.equal(new Set(first.map(record => record.work.work_ref)).size, 1, "a search's stages share one interaction");
  assert.notEqual(first[0]!.work.work_ref, second[0]!.work.work_ref, "another opening of the palette is another interaction");
  assert.deepEqual(first[0]!.subjects[0], { kind: "pages_document", id: "doc-2", version: "7" }, "candidates in the order shown, at the version shown");
  assert.equal(first[1]!.detail.index, 1);
  assert.ok(!records.some(record => /adopt|read/u.test(record.stage ?? "")), "choosing is not adopting or reading");
});
