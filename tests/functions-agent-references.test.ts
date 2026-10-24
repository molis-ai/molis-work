import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFunctionsService, type TypeSafeProvider } from "@molis-ai/molis-work-module-functions";

const reference = { capability_id: "unknown.notes.save", version: 3, provider_id: "original-provider" };
const criteria = [{ key: "save", description: "Save the note" }, { key: "skip", description: "No change" }];

test("Choice returns only the selected precise recommendation and original history survives store reopening", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-references-"));
  let choice: string | null = "save";
  const provider: TypeSafeProvider = { async evaluate() { return { primitive: "choice", choice, noul: null, score: null, legend: null,
    probabilities: choice ? { [choice]: 1 } : {}, confidence: choice ? 1 : null, model: "jev-1.13.0" }; } };
  const open = () => createFunctionsService({ home, credential: () => null, provider, env: { TYPESAFE_API_KEY: "fixture-only" } });
  let service = open();
  try {
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
    const history = service.listJudgments();
    assert.equal(history.length, 3); assert.deepEqual(history[2]?.recommended_actions, [reference]);
    service.close(); service = open();
    assert.deepEqual(service.get(draft.id), published); assert.deepEqual(service.listJudgments(), history);
  } finally { service.close(); await rm(home, { recursive: true, force: true }); }
});

test("Agent maps retain unavailable identities, reject incomplete references, and prune only removed output keys or an explicit purpose change", async () => {
  const home = await mkdtemp(join(tmpdir(), "agent-map-draft-"));
  const service = createFunctionsService({ home, credential: () => null });
  try {
    const draft = service.create({ primitive: "choice" });
    service.updateDraft(draft.id, { scene_id: "agent.mcp", criteria, action_map: { save: reference } });
    assert.deepEqual(service.updateDraft(draft.id, { name: "Changed title" }).action_map, { save: reference });
    for (const bad of [{ capability_id: reference.capability_id, version: 1 }, { ...reference, version: 0 }, { ...reference, provider_id: "bad provider" }]) {
      assert.throws(() => service.updateDraft(draft.id, { action_map: { save: bad } as never }), { code: "functions.invalid" });
    }
    assert.deepEqual(service.get(draft.id).action_map, { save: reference });
    const replaced = service.updateDraft(draft.id, { criteria: [{ key: "read", description: "Read" }, criteria[1]!] });
    assert.deepEqual(replaced.action_map, {});
    service.updateDraft(draft.id, { criteria, action_map: { save: reference } });
    assert.deepEqual(service.updateDraft(draft.id, { scene_id: null }).action_map, {});
  } finally { service.close(); await rm(home, { recursive: true, force: true }); }
});
