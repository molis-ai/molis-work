// A draft's `updated_at` is also the version a write is checked against: every write moves it forward, even when two
// writes land in the same millisecond, so a writer still holding the version before the first is refused.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { mock } from "node:test";
import { createFunctionsService, type TypeSafeProvider } from "@molis-ai/molis-work-module-functions";

const conflict = (error: unknown) => (error as { code?: string }).code === "functions.conflict";

test("two writes in the same millisecond: the first moves the version, the second still holding the old one is refused", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "functions-versions-"));
  const provider: TypeSafeProvider = { async evaluate() { return { primitive: "choice", choice: "save", noul: null, score: null, legend: null,
    probabilities: { save: 1 }, confidence: 1, model: "fixture" }; } };
  const store = createFunctionsService({ home, credential: () => null, env: { TYPESAFE_API_KEY: "fixture-only" }, provider });
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-16T08:00:00.000Z") });
  t.after(() => mock.timers.reset());

  const draft = store.create({ primitive: "choice" });
  const read = draft.updated_at;
  const first = store.updateDraft(draft.id, { instructions: "First writer", criteria: [{ key: "save", description: "Save the note" }, { key: "skip", description: "No change" }] }, read);
  assert.ok(first.updated_at > read, "the version moves although the clock did not");
  assert.throws(() => store.updateDraft(draft.id, { instructions: "Second writer" }, read), conflict);
  assert.equal(store.get(draft.id).instructions, "First writer");

  // Samples are checked against the same version.
  const withSample = store.addSample(draft.id, { input: "Example" }, first.updated_at);
  assert.ok(withSample.updated_at > first.updated_at);
  assert.throws(() => store.addSample(draft.id, { input: "Stale" }, first.updated_at), conflict);
  const sampleId = withSample.samples[0]!.id;
  assert.throws(() => store.removeSample(draft.id, sampleId, first.updated_at), conflict);
  const without = store.removeSample(draft.id, sampleId, withSample.updated_at);
  assert.ok(without.updated_at > withSample.updated_at);
  assert.deepEqual(store.get(draft.id).samples, []);

  // A saved preview and publishing are checked against the same version.
  await assert.rejects(store.preview(draft.id, "Example", withSample.updated_at), conflict);
  const previewed = await store.preview(draft.id, "Example", without.updated_at);
  assert.ok(previewed.updated_at > without.updated_at);
  assert.throws(() => store.publish(draft.id, without.updated_at), conflict);
  assert.equal(store.get(draft.id).status, "draft");
  const published = store.publish(draft.id, previewed.updated_at);
  assert.equal(published.status, "published");
  assert.ok(published.updated_at > previewed.updated_at);
});
