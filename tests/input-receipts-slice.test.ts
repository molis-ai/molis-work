import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderPage } from "../scripts/input-receipts-slice/page.ts";
import { renderStage } from "../scripts/input-receipts-slice/render.ts";
import { checkpointAt, numbering, viewAt, type InputRow } from "../scripts/input-receipts-slice/scene-state.ts";
import * as U from "../scripts/input-receipts-slice/ui-state.ts";
import type { Ledger, Receipt, Recording, Scene } from "../scripts/input-receipts-slice/facts.ts";

const load = (flavor: "assistant" | "coding"): Recording =>
  JSON.parse(readFileSync(new URL(`../scripts/input-receipts-slice/recorded/${flavor}.json`, import.meta.url), "utf8")) as Recording;
const recordings = { assistant: load("assistant"), coding: load("coding") };
const both = Object.entries(recordings) as [("assistant" | "coding"), Recording][];

/** Every (scene, cursor) the page can be at: each prefix of each run of each scene. */
function* everyCursor(rec: Recording): Generator<{ scene: Scene; run: number; at: number }> {
  for (const scene of rec.scenes) for (const [run, one] of scene.runs.entries()) for (let at = 1; at <= one.events.length; at += 1) yield { scene, run, at };
}
const scene = (rec: Recording, id: string): Scene => U.sceneOf(rec, id);
const rowsAt = (rec: Recording, sceneId: string, checkpoint: string): InputRow[] => {
  const s = scene(rec, sceneId);
  const cp = checkpointAt(s, checkpoint);
  return viewAt(s, { run: cp.run, at: cp.at }, cp).rows.filter((row): row is InputRow => row.kind === "input");
};

test("RCPT-R0-08 the recordings say where they came from, and the page says it is not a real run", () => {
  for (const [flavor, rec] of both) {
    assert.match(rec.source.prologue, /^[0-9a-f]{40}$/, flavor);
    assert.equal(rec.source.script, "scripts/input-receipts-slice/record.mts");
    assert.deepEqual(rec.scenes.map(one => one.id), ["main", "stopped-carry", "stopped-withdraw", "question", "restart"]);
  }
  assert.equal(recordings.assistant.source.prologue, recordings.coding.source.prologue, "both flavours were recorded from one SDK build");
  const page = renderPage(recordings);
  assert.match(page, /id="data-assistant"/);
  assert.match(page, /id="data-coding"/);
  const titlebar = renderStage(recordings.assistant, U.initial(recordings.assistant, "assistant", "light"));
  assert.doesNotMatch(titlebar, /已生效/);
});

test("RCPT-R0-02 no state without a fact: every recorded receipt is backed by the events before it (checked independently of the projection)", () => {
  for (const [flavor, rec] of both) for (const one of rec.scenes) for (const [runIndex, run] of one.runs.entries()) {
    for (const projection of run.projections) {
      const prefix = run.events.slice(0, projection.at);
      const has = (type: string, test_: (event: Ledger) => boolean): boolean => prefix.some(event => event.type === type && test_(event));
      const terminal = prefix.some(event => event.type === "completed" || event.type === "failed" || event.type === "cancelled");
      for (const receipt of projection.receipts) {
        const where = `${flavor}/${one.id}/run ${String(runIndex)}@${String(projection.at)} ${receipt.steerId}`;
        assert.ok(has("prompt", event => event["steerId"] === receipt.steerId), `${where}: no prompt`);
        if (receipt.state === "read") assert.ok(has("steer-read", event => Array.isArray(event["steerIds"]) && event["steerIds"].includes(receipt.steerId)), `${where}: read without a steer-read`);
        if (receipt.state === "applied" || receipt.state === "read") assert.ok(has("steer-applied", event => event["steerId"] === receipt.steerId), `${where}: applied without steer-applied`);
        if (receipt.state === "withdrawn") assert.ok(has("steer-withdrawn", event => event["steerId"] === receipt.steerId), `${where}: withdrawn without the event`);
        if (receipt.state === "unread") assert.ok(terminal && receipt.endedBy !== undefined, `${where}: unread before the run ended`);
        if (receipt.handling !== undefined) {
          assert.equal(receipt.state, "read", `${where}: an acknowledgement on an input that was not read`);
          assert.ok(has("inputs-acknowledged", event => JSON.stringify(event["items"]).includes(receipt.steerId)), `${where}: handling without inputs-acknowledged`);
        }
      }
    }
  }
});

test("RCPT-R0-02 every line on the page traces to a fact: no input row at any cursor is without evidence, and its sources are named", () => {
  let rows = 0;
  for (const [, rec] of both) for (const at of everyCursor(rec)) {
    const view = viewAt(at.scene, { run: at.run, at: at.at });
    for (const row of view.rows) {
      if (row.kind !== "input") continue;
      rows += 1;
      assert.ok(row.evidence.length > 0, `${at.scene.id}@${String(at.run)}:${String(at.at)} #${String(row.n)} has no evidence`);
      assert.ok(row.evidence.some(one => one.source === "ledger"), "at least one of the evidence items is a ledger event");
      for (const key of ["how", "where", "changed", "left"] as const) assert.ok(row.four[key].text.length > 0, `${key} is answered or says why not`);
      // "读到" only for a read fact, "AI 的理解" only for a statement by the model.
      if (/读到/.test(row.headline.text) && !/没读到|没读到就/.test(row.headline.text)) assert.ok(row.receipt.state === "read", row.headline.text);
      if (/AI 的理解/.test(row.headline.text)) assert.ok(row.receipt.handling !== undefined, row.headline.text);
    }
  }
  assert.ok(rows > 200, "the walk covered many cursors");
});

test("RCPT-R0-01 one input reads the same in both layouts, and a host notice has no receipt line", () => {
  for (const [, rec] of both) {
    const main = rowsAt(rec, "main", "settled");
    assert.deepEqual(main.map(row => row.headline.key), ["withdrawn", "explained:apply-now", "explained:new-task", "explained:not-adopted", "explained:later-step", "read", "explained:needs-clarification"]);
  }
  // The words follow the state, in both layouts and every scene (§3.3): one phrase per state, whatever else the line adds.
  const words: Record<string, RegExp> = { accepted: /已送达/, applied: /已放进上下文/, read: /AI 已读到 · 还没说明/, withdrawn: /已撤回/, unread: /没读到/ };
  let checked = 0;
  for (const [, rec] of both) for (const at of everyCursor(rec)) for (const row of viewAt(at.scene, { run: at.run, at: at.at }).rows) {
    if (row.kind !== "input") continue;
    const expected = words[row.headline.key];
    if (expected !== undefined) { assert.match(row.headline.text, expected, row.headline.key); checked += 1; }
    if (row.headline.key.startsWith("explained:")) assert.match(row.headline.text, /^(接续自上一轮 · )?AI 的理解：/);
  }
  assert.ok(checked > 100);
  const view = viewAt(scene(recordings.coding, "main"), { run: 0, at: checkpointAt(scene(recordings.coding, "main"), "settled").at });
  const host = view.rows.filter(row => row.kind === "host");
  assert.equal(host.length, 1);
  assert.equal(view.rows.filter(row => row.kind === "input").every(row => row.kind === "input" && row.receipt.source === "person"), true);
  const html = renderStage(recordings.coding, U.initial(recordings.coding, "coding", "light"));
  assert.match(html, /rc-host/);
  assert.equal((html.match(/class="rc-status"/g) ?? []).length, 7, "seven person inputs have a receipt line; the notice has none");
});

test("RCPT-R0-03 the tray counts the SDK's facts: the queue the SDK reported, plus read-without-explanation, pending, undecided and clarify", () => {
  for (const [, rec] of both) {
    const main = scene(rec, "main");
    const settled = checkpointAt(main, "settled");
    const tray = viewAt(main, { run: settled.run, at: settled.at }, settled).tray;
    const count = (key: string): number => tray.groups.find(group => group.key === key)?.entries.length ?? -1;
    assert.deepEqual([count("unread"), count("unexplained"), count("pending"), count("undecided"), count("clarify")], [0, 1, 2, 1, 1]);
    const stopped = scene(rec, "stopped-carry");
    const cp = checkpointAt(stopped, "stopped");
    const queued = cp.queue?.queued.length ?? 0;
    assert.equal(queued, 3, "two unread inputs of the run plus one the app queued itself");
    assert.equal(viewAt(stopped, { run: cp.run, at: cp.at }, cp).tray.groups.find(group => group.key === "unread")?.entries.length, queued);
    const carried = checkpointAt(stopped, "carried");
    assert.equal(carried.queue?.queued.length, 0, "carrying empties the queue the SDK reports");
    assert.deepEqual(carried.queue?.settled.map(one => one.outcome), ["carried", "carried", "carried"]);
    const withdrawn = checkpointAt(scene(rec, "stopped-withdraw"), "withdrawn");
    assert.deepEqual(withdrawn.queue?.settled.map(one => one.outcome), ["withdrawn", "withdrawn", "withdrawn"]);
    assert.equal(withdrawn.queue?.queued.length, 0);
  }
});

test("RCPT-R0-04 withdrawal is offered only where the ledger withdraws; a read input cannot be withdrawn; the insisted-on input is replaced, not erased", () => {
  const rec = recordings.coding;
  let ui = U.restart(U.initial(rec, "coding", "light"));
  let offered = 0;
  const main = scene(rec, "main");
  for (let guard = 0; guard < 80 && !U.atEnd(rec, ui); guard += 1) {
    const offer = U.offers(rec, ui);
    for (const id of offer.withdraw) {
      offered += 1;
      assert.ok(main.runs[0]?.events.slice(ui.cursor.at).some(event => event.type === "steer-withdrawn" && event["steerId"] === id));
      const after = U.withdrawRecorded(rec, ui, id);
      assert.equal(after.cursor.at, ui.cursor.at + 1);
      const row = viewAt(main, after.cursor).rows.find((one): one is InputRow => one.kind === "input" && one.receipt.steerId === id);
      assert.equal(row?.receipt.state, "withdrawn");
    }
    ui = U.step(rec, ui);
  }
  assert.equal(offered, 1, "exactly one recorded withdrawal in the main scene");
  assert.deepEqual(U.withdrawRecorded(rec, U.initial(rec, "coding", "light"), "nope"), U.initial(rec, "coding", "light"));
  const settledHtml = renderStage(rec, { ...U.initial(rec, "coding", "light"), expanded: rowsAt(rec, "main", "settled").filter(row => row.headline.key === "explained:apply-now").map(row => `${row.receipt.steerId}@0`) });
  assert.match(settledHtml, /已读到，不能撤回，可发更正/);
  const insisted = U.insist(rec, U.initial(rec, "coding", "light"));
  assert.ok(insisted !== undefined);
  const corrected = viewAt(main, insisted.cursor).rows.filter((row): row is InputRow => row.kind === "input");
  const notAdopted = corrected.find(row => row.receipt.handling?.treatment === "not-adopted");
  const correction = corrected.find(row => row.receipt.about !== undefined);
  assert.equal(notAdopted?.supersededBy, correction?.n);
  assert.equal(correction?.corrects, notAdopted?.n);
  assert.match(notAdopted?.headline.text ?? "", /已被你后来的纠正替代/);
});

test("RCPT-R0-05 the target chip shows only while a question waits; the supplement goes after the answer and reads as such", () => {
  const rec = recordings.coding;
  const asked = U.toScene(rec, U.initial(rec, "coding", "light"), "question", "asked");
  const html = renderStage(rec, asked);
  assert.match(html, /class="rc-chip"/);
  assert.match(html, /补充这一轮/);
  assert.match(html, /写进问卷：补充要求/);
  assert.match(html, /aria-pressed="true"[^>]*data-slot="button"[^>]*>|data-chip="this-run"[^>]*aria-pressed="true"/);
  const questionnaire = html.match(/<button[^>]*data-chip="questionnaire"[^>]*>/)?.[0] ?? "";
  assert.match(questionnaire, /disabled/, "the questionnaire half belongs to the interaction line");
  assert.doesNotMatch(renderStage(rec, U.initial(rec, "coding", "light")), /class="rc-chip"/, "no question is waiting in the main scene");
  const offer = U.offers(rec, asked);
  assert.equal(offer.send?.text, "顺便看下报告的格式");
  assert.equal(offer.answer, false, "the recorded order: the supplement first, then the answer");
  const sent = U.sendRecorded(rec, asked);
  const waiting = viewAt(U.sceneOf(rec, "question"), sent.cursor).rows.find((row): row is InputRow => row.kind === "input");
  assert.equal(waiting?.headline.key, "accepted");
  assert.match(waiting?.headline.text ?? "", /排在你回答问题之后/);
  assert.equal(U.offers(rec, sent).answer, true);
  const done = U.toCheckpoint(rec, sent, "answered");
  const read = viewAt(U.sceneOf(rec, "question"), done.cursor).rows.find((row): row is InputRow => row.kind === "input");
  assert.equal(read?.receipt.state, "read");
  assert.equal(read?.receipt.handling?.treatment, "noted");
});

test("RCPT-R0-06 a killed host: before the restart one input is in the context and one is queued; after it both are unread with RUN_INTERRUPTED, and no new run started", () => {
  for (const [, rec] of both) {
    const restart = scene(rec, "restart");
    const killed = checkpointAt(restart, "killed");
    const before = viewAt(restart, { run: killed.run, at: killed.at }, killed).rows.filter((row): row is InputRow => row.kind === "input");
    assert.deepEqual(before.map(row => row.receipt.state), ["applied", "accepted"]);
    const recovered = checkpointAt(restart, "recovered");
    const after = viewAt(restart, { run: recovered.run, at: recovered.at }, recovered).rows.filter((row): row is InputRow => row.kind === "input");
    assert.deepEqual(after.map(row => row.receipt.state), ["unread", "unread"]);
    assert.deepEqual(after.map(row => row.receipt.endedBy?.code), ["RUN_INTERRUPTED", "RUN_INTERRUPTED"]);
    assert.deepEqual(recovered.queue?.queued.map(item => item.from?.endedBy.code), ["RUN_INTERRUPTED", "RUN_INTERRUPTED"]);
    assert.equal(restart.runs.length, 1, "recovery did not start a run");
    assert.match(renderStage(rec, U.toScene(rec, U.initial(rec, "coding", "light"), "restart", "killed")), /重启并核对/);
  }
});

test("numbers are stable over a scene: an input keeps its number at every cursor and through the queue", () => {
  const rec = recordings.assistant;
  const stopped = scene(rec, "stopped-carry");
  const numbers = numbering(stopped);
  const before = checkpointAt(stopped, "stopped");
  const after = checkpointAt(stopped, "carried");
  const first = viewAt(stopped, { run: before.run, at: before.at }, before).tray.groups[0]?.entries.map(entry => entry.n);
  const carried = viewAt(stopped, { run: after.run, at: after.at }, after).rows.filter((row): row is InputRow => row.kind === "input" && row.run === 1).map(row => row.n);
  assert.deepEqual(first, [1, 2, 3]);
  assert.deepEqual(carried, [1, 2, 3]);
  assert.equal(numbers.size, 3);
});

test("the recorded receipts are SDK-shaped: only SDK states and treatments appear", () => {
  const states = new Set(["accepted", "applied", "read", "withdrawn", "unread"]);
  const treatments = new Set(["apply-now", "later-step", "new-task", "needs-clarification", "not-adopted", "answered", "noted", "merged"]);
  for (const [, rec] of both) for (const one of rec.scenes) for (const run of one.runs) for (const projection of run.projections) for (const receipt of projection.receipts as readonly Receipt[]) {
    assert.ok(states.has(receipt.state), receipt.state);
    if (receipt.handling !== undefined) assert.ok(treatments.has(receipt.handling.treatment), receipt.handling.treatment);
  }
});

test("RCPT-R0-03 two checkpoints that share one place in the ledger (the queue changed, the ledger did not) are told apart by the one jumped to", () => {
  for (const [flavor, rec] of both) {
    const stopped = U.toScene(rec, U.initial(rec, "assistant", "light"), "stopped-withdraw", "stopped");
    const waiting = U.view(rec, stopped).queue;
    assert.ok(waiting !== undefined && waiting.queued.length > 0, `${flavor}: stopped leaves inputs waiting in the session queue`);
    const withdrawn = U.toCheckpoint(rec, stopped, "withdrawn");
    assert.deepEqual(withdrawn.cursor, stopped.cursor, `${flavor}: the two checkpoints sit at the same cursor`);
    const queue = U.view(rec, withdrawn).queue;
    assert.equal(queue?.queued.length, 0, `${flavor}: after the withdrawal nothing waits`);
    assert.ok(queue !== undefined && queue.settled.length > 0 && queue.settled.every(one => one.outcome === "withdrawn"), `${flavor}: the settled items say withdrawn`);
    assert.equal(U.view(rec, U.restart(withdrawn)).queue, undefined, `${flavor}: playing from the start forgets the jump`);
  }
});
