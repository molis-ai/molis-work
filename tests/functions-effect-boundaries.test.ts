import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TypeSafeProvider } from "@molis-ai/molis-work-contracts/modules/functions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { functionAuthoringActions as authoring, functionsActions, functionsActionProvider, publishedFunctionProvider, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { withFunctionsService, withFunctionsServiceAsync } from "../apps/local-host/src/functions-host.js";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";

const owner: ActionCallContext = { actor_id: "owner", project_id: null, audience: "user", permissions: ["functions:manage", "functions:invoke"] };

for (const operation of ["preview", "invoke", "published"] as const) {
  for (const reason of ["replaced", "revoked", "cancelled"] as const) test(`Functions ${operation} does not persist after ${reason} during model wait`, { timeout: 15_000 }, async () => {
    const home = await mkdtemp(join(tmpdir(), "functions-effect-"));
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let pause = false, allowed = true;
    const options = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
      async evaluate(_key, record) {
        if (pause) { entered.resolve(); await release.promise; }
        return { primitive: record.primitive, noul: .8, choice: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model };
      },
    } satisfies TypeSafeProvider };
    const service = new ActionService();
    const ports = { read: <T>(op: Parameters<typeof withFunctionsService<T>>[1]) => withFunctionsService(home, op, options),
      run: <T>(op: Parameters<typeof withFunctionsServiceAsync<T>>[1]) => withFunctionsServiceAsync(home, op, options), credentialAvailable: () => true };
    let dispose = service.registerProvider(functionsActionProvider(ports));
    const actions = bindActionClient(service, () => owner);
    try {
      let record = (await actions.invoke(authoring.create, { primitive: "noul" })).function;
      record = (await actions.invoke(authoring.update, { id: record.id, patch: { instructions: "Evaluate", criteria: { true_description: "Yes", false_description: "No" } } })).function;
      if (operation !== "preview") {
        await actions.invoke(authoring.preview, { id: record.id, input: "Initial" });
        record = (await actions.invoke(authoring.publish, { id: record.id })).function;
      }
      if (operation === "published") { dispose(); dispose = service.registerProvider(publishedFunctionProvider(record, ports)); }
      const before = ports.read(value => value.get(record.id));
      const history = ports.read(value => value.listJudgments());
      const controller = new AbortController();
      const caller = { ...owner, signal: controller.signal, validate_authority: async () => { if (!allowed) throw new ActionError("fixture.revoked", "Revoked"); } };
      pause = true;
      const ref = operation === "preview" ? authoring.preview : operation === "invoke" ? functionsActions.invoke : publishedFunctionAction(record);
      const input = operation === "preview" ? { id: record.id, input: "Pending" } : operation === "invoke" ? { function_key: record.function_key, input: "Pending" } : { content: "Pending" };
      const pending = service.invoke(caller, ref, input);
      const rejected = assert.rejects(pending);
      await entered.promise;
      if (reason === "replaced") { dispose(); dispose = service.registerProvider(operation === "published" ? publishedFunctionProvider(record, ports) : functionsActionProvider(ports)); }
      else if (reason === "revoked") allowed = false;
      else controller.abort();
      release.resolve(); await rejected;
      assert.deepEqual(ports.read(value => value.get(record.id)), before);
      assert.deepEqual(ports.read(value => value.listJudgments()), history);
      pause = false;
      await service.invoke(owner, ref, input);
      if (operation === "preview") assert.equal(ports.read(value => value.get(record.id)).last_preview?.input, "Pending");
      else assert.equal(ports.read(value => value.listJudgments()).length, history.length + 1);
    } finally { release.resolve(); dispose(); await rm(home, { recursive: true, force: true }); }
  });
}

test("Functions preview releases the Home queue and rejects edits made while the model waits", { timeout: 15_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "functions-preview-queue-"));
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) { entered.resolve(); await release.promise; return { primitive: record.primitive, noul: .8, choice: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; },
  } } });
  const actions = bindActionClient(host.homeActionClient(), () => owner);
  try {
    const { function: draft } = await actions.invoke(authoring.create, { primitive: "noul" });
    await actions.invoke(authoring.update, { id: draft.id, patch: { instructions: "Original", criteria: { true_description: "Yes", false_description: "No" } } });
    const pending = actions.invoke(authoring.preview, { id: draft.id, input: "Old input" });
    const rejected = assert.rejects(pending, { code: "functions.stale_preview" });
    await entered.promise;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([actions.invoke(authoring.update, { id: draft.id, patch: { instructions: "Edited while model waits" } }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Model wait blocked the Home queue")), 2000); })]);
    } finally { clearTimeout(timeout); release.resolve(); }
    await rejected;
    const current = (await actions.invoke(authoring.get, { id: draft.id })).function;
    assert.equal(current.instructions, "Edited while model waits");
    assert.equal(current.last_preview, null);
  } finally { release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
