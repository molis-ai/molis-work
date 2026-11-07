// A rule's `updated_at` is the version of its definition, and the version every write is checked against: it moves forward only when the
// definition changes, even when two such writes land in the same millisecond, so a writer still holding the version before the first is
// refused. A preview, a sample, publishing or a save that changes nothing leaves it where it is (AIC-09).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock, type TestContext } from "node:test";
import { createFunctionsService, type TypeSafeProvider } from "@molis-ai/molis-work-module-judgment-rules";

const stale = (error: unknown) => (error as { code?: string }).code === "functions.draft_stale";
const criteria = [{ key: "save", description: "Save the note" }, { key: "skip", description: "No change" }];

async function fixture(t: TestContext, name: string) {
  const home = await mkdtemp(join(tmpdir(), `functions-versions-${name}-`));
  const provider: TypeSafeProvider = { async evaluate() { return { primitive: "choice", choice: "save", noul: null, score: null, legend: null,
    probabilities: { save: 1 }, confidence: 1, model: "fixture" }; } };
  const store = createFunctionsService({ home, credential: () => null, env: { TYPESAFE_API_KEY: "fixture-only" }, provider });
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  return store;
}

test("AIC-09: two definition writes in the same millisecond: the first moves the version, the second still holding the old one is refused, and only definition writes move it", async (t) => {
  const store = await fixture(t, "same-millisecond");
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-16T08:00:00.000Z") });
  t.after(() => mock.timers.reset());

  const draft = store.create({ primitive: "choice" });
  const read = draft.updated_at;
  const first = store.updateDraft(draft.id, { instructions: "First writer", criteria }, read);
  assert.ok(first.updated_at > read, "the version moves although the clock did not");
  assert.throws(() => store.updateDraft(draft.id, { instructions: "Second writer" }, read), stale);
  assert.equal(store.get(draft.id).instructions, "First writer");

  // Samples are checked against the same version, and do not move it.
  const withSample = store.addSample(draft.id, { input: "Example" }, first.updated_at);
  assert.equal(withSample.updated_at, first.updated_at);
  const second = store.updateDraft(draft.id, { instructions: "Second writer" }, first.updated_at);
  assert.ok(second.updated_at > first.updated_at);
  assert.throws(() => store.addSample(draft.id, { input: "Stale" }, first.updated_at), stale);
  const sampleId = withSample.samples[0]!.id;
  assert.throws(() => store.removeSample(draft.id, sampleId, first.updated_at), stale);
  assert.equal(store.get(draft.id).samples.length, 1);
  const without = store.removeSample(draft.id, sampleId, second.updated_at);
  assert.equal(without.updated_at, second.updated_at);
  assert.deepEqual(store.get(draft.id).samples, []);

  // A saved preview and publishing are checked against the same version, and do not move it.
  await assert.rejects(store.preview(draft.id, "Example", first.updated_at), stale);
  const previewed = await store.preview(draft.id, "Example", second.updated_at);
  assert.equal(previewed.updated_at, second.updated_at);
  const renamed = store.updateDraft(draft.id, { name: "Renamed" }, second.updated_at);
  assert.ok(renamed.updated_at > second.updated_at);
  assert.ok(renamed.last_preview, "a name is not what the preview was for; it stays");
  assert.throws(() => store.publish(draft.id, second.updated_at), stale);
  assert.equal(store.get(draft.id).status, "draft");
  const published = store.publish(draft.id, renamed.updated_at);
  assert.equal(published.status, "published");
  assert.equal(published.updated_at, renamed.updated_at, "the published time is in published_at; updated_at stays the version that went out");
  assert.ok(published.published_at! > renamed.updated_at);
});

test("AIC-09: a save that changes nothing once normalized writes nothing; one that changes a definition field moves the version", async (t) => {
  const store = await fixture(t, "no-change");
  const draft = store.create({ primitive: "choice", name: "Rule" });
  const saved = store.updateDraft(draft.id, { instructions: "Decide", criteria, subject_kinds: ["note"] }, draft.updated_at);
  const previewed = await store.preview(draft.id, "Example", saved.updated_at);
  // The whole form again, the way the editor sends it before a trial: whitespace and nulls the normalization folds away.
  const same = store.updateDraft(draft.id, { name: "  Rule  ", function_key: previewed.function_key, instructions: " Decide ", criteria: criteria.map(row => ({ ...row, description: ` ${row.description} ` })),
    scene_id: null, scene_version: null, scene_provider_id: null, subject_kinds: ["note"], scene_map: {}, action_map: {} }, previewed.updated_at);
  assert.deepEqual(same, previewed, "no field of the record changes, the trial result and samples included");
  assert.ok(store.updateDraft(draft.id, { name: "Renamed" }, same.updated_at).updated_at > same.updated_at);
});

test("AIC-09: another window's trial, with the save the editor does before it, does not get in the way of this window's save", async (t) => {
  const store = await fixture(t, "other-window");
  const draft = store.create({ primitive: "choice" });
  const here = store.updateDraft(draft.id, { instructions: "Decide", criteria }, draft.updated_at);
  const there = store.updateDraft(draft.id, { instructions: "Decide", criteria }, here.updated_at);
  await store.preview(draft.id, "Tried elsewhere", there.updated_at);
  store.addSample(draft.id, { input: "Kept elsewhere" }, there.updated_at);
  const saved = store.updateDraft(draft.id, { instructions: "Decide better" }, here.updated_at);
  assert.equal(saved.instructions, "Decide better");
  assert.equal(saved.samples.length, 1, "this window's save leaves the sample alone");
  assert.equal(saved.last_preview, null, "the trial was for the old content; the definition changed, so it is gone");
});

test("AIC-07: two saves in a row each name the version the previous one returned", async (t) => {
  const store = await fixture(t, "in-a-row");
  const draft = store.create({ primitive: "choice" });
  const first = store.updateDraft(draft.id, { name: "One" }, draft.updated_at);
  const second = store.updateDraft(draft.id, { name: "Two" }, first.updated_at);
  assert.equal(second.name, "Two");
  assert.throws(() => store.updateDraft(draft.id, { name: "Three" }, first.updated_at), stale);
  assert.equal(store.get(draft.id).name, "Two");
});

test("AIC-09: the list keeps its order through trials and samples; publishing brings a rule to the front", async (t) => {
  const store = await fixture(t, "order");
  const clock = Date.parse("2026-10-16T08:00:00.000Z");
  mock.timers.enable({ apis: ["Date"], now: clock });
  t.after(() => mock.timers.reset());
  const names = () => store.list().map(row => row.name);
  const older = store.create({ primitive: "choice", name: "Older" });
  mock.timers.tick(2000);
  const newer = store.create({ primitive: "choice", name: "Newer" });
  mock.timers.tick(2000);
  const ready = store.updateDraft(older.id, { instructions: "Decide", criteria }, older.updated_at);
  assert.deepEqual(names(), ["Older", "Newer"], "a definition edit still moves a rule up");
  store.updateDraft(newer.id, { instructions: "Decide", criteria }, newer.updated_at);
  mock.timers.tick(2000);
  store.updateDraft(ready.id, { name: "Older" }, ready.updated_at);
  const middle = store.get(newer.id);
  mock.timers.tick(2000);
  store.updateDraft(newer.id, { name: "Newer again" }, middle.updated_at);
  assert.deepEqual(names(), ["Newer again", "Older"]);
  mock.timers.tick(2000);
  const trial = await store.preview(older.id, "Example", ready.updated_at);
  store.addSample(older.id, { input: "Example" }, trial.updated_at);
  assert.deepEqual(names(), ["Newer again", "Older"], "a trial or a sample does not bring a rule to the front");
  mock.timers.tick(2000);
  store.publish(older.id, trial.updated_at);
  assert.deepEqual(names(), ["Older", "Newer again"], "publishing does");
});
