import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createFunctionsService, createTypeSafeProvider, functionsActionProvider,
  functionsActions, publishedFunctionProvider } from "@molis-ai/molis-work-module-judgment-rules";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

test("W2-18-FUNCTION-CHOICE-01 raw out-of-enum answers cannot save a preview, publish, or persist a successful judgment", async () => {
  const home = mkdtempSync(join(tmpdir(), "function-choice-"));
  let choice: string | null = "outside", calls = 0;
  const service = createFunctionsService({ home, credential: () => "fixture", provider: createTypeSafeProvider(async request => {
    calls++; return { model: request.model, answers: { [Object.keys(request.questions)[0]!]: { type: "choice", choice, probabilities: {} } } };
  }) });
  const owner: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: ["functions:invoke", "functions:manage"] };
  const refused = (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "functions.provider_failed";
  try {
    const draft = service.createChoice({ name: "Choice" });
    service.updateDraft(draft.id, { instructions: "Choose", criteria: [{ key: "yes", description: "Yes" }, { key: "no", description: "No" }] });
    const before = service.get(draft.id);
    await assert.rejects(service.preview(draft.id, "input"), refused);
    assert.deepEqual(service.get(draft.id), before);
    assert.throws(() => service.publish(draft.id), { code: "functions.preview_required" });
    assert.deepEqual(service.listJudgments(), []);
    assert.equal(calls, 1, "a refused raw answer is not retried");
    choice = "yes"; await service.preview(draft.id, "valid");
    const record = service.publish(draft.id), exact = publishedFunctionProvider(record, {
      credentialAvailable: () => true, read: op => op(service), run: op => op(service),
    });
    const general = functionsActionProvider({ credentialAvailable: () => true, read: op => op(service), run: op => op(service) });
    const actions = new ActionService();
    const dispose = actions.registerProvider({ ...general, definitions: [...general.definitions, ...exact.definitions], handlers: [...general.handlers, ...exact.handlers] });
    try {
      choice = "outside";
      for (const [reference, input] of [[functionsActions.invoke, { function_key: record.function_key, input: "input" }],
        [exact.definitions[0]!, { content: "input" }]] as const) {
        await assert.rejects(actions.invoke(owner, reference, input), refused);
        assert.deepEqual(service.listJudgments(), [], "schema rejection must happen before the ok judgment write");
      }
      choice = null;
      assert.equal((await service.invokePublished(record.function_key, "uncertain")).status, "needs_review");
      choice = "no";
      const valid = await service.invokePublished(record.function_key, "valid");
      assert.equal(valid.status, "ok"); assert.equal(valid.data.choice, "no");
      assert.deepEqual(service.listJudgments().map(row => row.outcome).sort(), ["needs_review", "ok"]);
    } finally { dispose(); }
  } finally { service.close(); rmSync(home, { recursive: true, force: true }); }
});
