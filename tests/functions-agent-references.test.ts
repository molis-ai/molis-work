import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFunctionsService, openFunctionsStore, type TypeSafeProvider } from "@molis-ai/molis-work-module-functions";

const reference = { capability_id: "unknown.notes.save", version: 3, provider_id: "original-provider" };
const secrets = { put() {}, get() { return null; }, delete() {} };
const criteria = [{ key: "save", description: "Save the note" }, { key: "skip", description: "No change" }];

test("Choice returns only the selected precise recommendation and original history survives store reopening", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-references-"));
  let choice: string | null = "save";
  const provider: TypeSafeProvider = { async evaluate() { return { primitive: "choice", choice, noul: null, score: null, legend: null,
    probabilities: choice ? { [choice]: 1 } : {}, confidence: choice ? 1 : null, model: "jev-1.13.0" }; } };
  let store = openFunctionsStore(home);
  try {
    const service = createFunctionsService({ store, secrets, provider, env: { TYPESAFE_API_KEY: "fixture-only" } });
    const draft = service.create({ primitive: "choice" });
    service.updateDraft(draft.id, { scene_id: "agent.mcp", instructions: "Choose", criteria, action_map: { save: reference } });
    await service.preview(draft.id, "Example");
    const published = service.publish(draft.id);
    assert.deepEqual((await service.invokePublished(published.function_key, "Save")).recommended_actions, [reference]);
    choice = "skip";
    assert.deepEqual((await service.invokePublished(published.function_key, "Skip")).recommended_actions, []);
    choice = null;
    const uncertain = await service.invokePublished(published.function_key, "Unclear");
    assert.equal(uncertain.status, "needs_review"); assert.deepEqual(uncertain.recommended_actions, []);
    const history = store.listJudgments();
    assert.equal(history.length, 3); assert.deepEqual(history[2]?.recommended_actions, [reference]);
    store.close(); store = openFunctionsStore(home);
    assert.deepEqual(store.get(draft.id), published); assert.deepEqual(store.listJudgments(), history);
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});

test("Agent maps retain unavailable identities, reject incomplete references, and prune only removed output keys or an explicit purpose change", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-map-draft-"));
  const store = openFunctionsStore(home);
  try {
    const draft = store.create({ primitive: "choice" });
    store.updateDraft(draft.id, { scene_id: "agent.mcp", criteria, action_map: { save: reference } });
    assert.deepEqual(store.updateDraft(draft.id, { name: "Changed title" }).action_map, { save: reference });
    for (const bad of [{ capability_id: reference.capability_id, version: 1 }, { ...reference, version: 0 }, { ...reference, provider_id: "bad provider" }]) {
      assert.throws(() => store.updateDraft(draft.id, { action_map: { save: bad } as never }), { code: "functions.invalid" });
    }
    assert.deepEqual(store.get(draft.id)?.action_map, { save: reference });
    const replaced = store.updateDraft(draft.id, { criteria: [{ key: "read", description: "Read" }, criteria[1]!] });
    assert.deepEqual(replaced.action_map, {});
    store.updateDraft(draft.id, { criteria, action_map: { save: reference } });
    assert.deepEqual(store.updateDraft(draft.id, { scene_id: null }).action_map, {});
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});
