// A rule's `updated_at` is the version of its definition, and the version every write is checked against: it moves forward only when the
// definition changes, even when two such writes land in the same millisecond, so a writer still holding the version before the first is
// refused. A preview, a sample, publishing or a save that changes nothing leaves it where it is (AIC-09).
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { mock, type TestContext } from "node:test";
import { createFunctionsService, FUNCTIONS_HOME_STORE, judgmentConfigReplica, type TypeSafeProvider } from "@molis-ai/molis-work-module-judgment-rules";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

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

test("F-modules-server-05 judgmentConfigReplica protects published rules, accepts default model round-trip, rejects score+UI scene, and reports key_conflict", async (t) => {
  const homeA = await mkdtemp(join(tmpdir(), "functions-sync-a-"));
  const homeB = await mkdtemp(join(tmpdir(), "functions-sync-b-"));
  const provider: TypeSafeProvider = { async evaluate() { return { primitive: "choice", choice: "save", noul: null, score: null, legend: null, probabilities: { save: 1 }, confidence: 1, model: "fixture" }; } };
  const storeA = createFunctionsService({ home: homeA, credential: () => null, env: { TYPESAFE_API_KEY: "fixture-only" }, provider });
  const storeB = createFunctionsService({ home: homeB, credential: () => null, env: { TYPESAFE_API_KEY: "fixture-only" }, provider });
  const dbA = new DatabaseSync(homeSqlitePath(homeA, FUNCTIONS_HOME_STORE.path));
  const dbB = new DatabaseSync(homeSqlitePath(homeB, FUNCTIONS_HOME_STORE.path));
  t.after(async () => {
    dbA.close(); dbB.close(); storeA.close(); storeB.close();
    await rm(homeA, { recursive: true, force: true });
    await rm(homeB, { recursive: true, force: true });
  });
  const replicaA = judgmentConfigReplica(dbA, "space-1", () => {});
  const replicaB = judgmentConfigReplica(dbB, "space-1", () => {});

  // Published rule with FUNCTIONS_DEFAULT_MODEL ("jev-latest") round-trips cleanly.
  const draft = storeA.create({ primitive: "choice", name: "Sync Rule" });
  const ready = storeA.updateDraft(draft.id, { instructions: "Decide carefully", criteria }, draft.updated_at);
  await storeA.preview(draft.id, "Example", ready.updated_at);
  const published = storeA.publish(draft.id, ready.updated_at);
  const outgoing = replicaA.next()!;
  assert.ok(outgoing);
  replicaB.receive({ ...outgoing, revision: 1 });
  assert.equal(storeB.get(published.id).status, "published");

  // Exact idempotent replay succeeds, while delete, downgrade, or mutation of a published rule is refused.
  replicaB.receive({ ...outgoing, operationId: "replay-same", revision: 2 });
  assert.equal(storeB.get(published.id).status, "published");
  const deleteEvent = { ...outgoing, operationId: "del-pub", base: 2, revision: 3, value: null };
  replicaB.receive(deleteEvent);
  assert.throws(() => replicaB.resolve(deleteEvent.key, "remote"), { code: "functions.published_immutable" });
  const mutatedValue = structuredClone(outgoing.value as Record<string, unknown>);
  (mutatedValue.data as Record<string, unknown>).instructions = "Tampered";
  const mutateEvent = { ...outgoing, operationId: "mut-pub", base: 2, revision: 4, value: mutatedValue };
  replicaB.receive(mutateEvent);
  assert.throws(() => replicaB.resolve(mutateEvent.key, "remote"), { code: "functions.published_immutable" });
  assert.equal(storeB.get(published.id).instructions, "Decide carefully");

  // Cross-device function_key collision across different IDs raises functions.key_conflict.
  const collisionValue = structuredClone(outgoing.value as Record<string, unknown>);
  (collisionValue.data as Record<string, unknown>).status = "draft";
  (collisionValue.data as Record<string, unknown>).version = null;
  (collisionValue.data as Record<string, unknown>).published_at = null;
  const collideEvent = { key: "other-rule-id", operationId: "collide-key", base: 0, revision: 5, value: collisionValue };
  replicaB.receive(collideEvent);
  assert.throws(() => replicaB.resolve(collideEvent.key, "remote"), { code: "functions.key_conflict" });

  // Score primitive bound to a UI scene is rejected during sync.
  const badScoreValue = structuredClone(collisionValue);
  const badData = badScoreValue.data as Record<string, unknown>;
  badData.function_key = "score_scene_bad";
  badData.primitive = "score";
  badData.criteria = ["低", "高"];
  badData.scene_id = "feed.inbox.triage";
  badData.scene_version = 1;
  badData.scene_provider_id = "io.molis.work.feed";
  const badScoreEvent = { key: "bad-score-scene", operationId: "bad-score", base: 0, revision: 6, value: badScoreValue };
  replicaB.receive(badScoreEvent);
  assert.throws(() => replicaB.resolve(badScoreEvent.key, "remote"), { code: "functions.invalid" });
});
