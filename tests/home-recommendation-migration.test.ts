import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionService, subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";
import { openFunctionsStore, createFunctionsService } from "@molis-ai/molis-work-module-functions";
import { inboxActions, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { HOME_DOCK_SCENE_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { SystemFunctionsActions } from "../apps/local-host/src/functions-actions.js";
import { withFunctionsService } from "../apps/local-host/src/functions-host.js";

test("legacy Home references migrate to the original owner without rewriting conditions, bindings or history", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-choice-migration-"));
  const store = openFunctionsStore(home);
  const options = { env: { TYPESAFE_API_KEY: "fixture-only" } };
  try {
    const service = createFunctionsService({ store, secrets: { get: () => null, put() {}, delete: () => false }, ...options,
      provider: { async evaluate(_key, record) { return { primitive: "choice" as const, choice: "complete", probabilities: {}, confidence: null,
        noul: null, score: null, legend: null, model: record.model }; } } });
    const draft = service.createChoice({ name: "原用户条件", function_key: "original_home" });
    service.updateDraft(draft.id, { instructions: "保留用户原文", scene_id: HOME_DOCK_SCENE_ID, subject_kinds: ["inbox_entry"],
      criteria: [{ key: "complete", description: "用户的完成条件" }, { key: "ask", description: "用户的询问条件" }],
      scene_map: { complete: "inbox.done", ask: "home.ask" } });
    await service.preview(draft.id, "原试跑");
    const original = service.publish(draft.id);
    const binding = store.bindScene(HOME_DOCK_SCENE_ID, original.function_key, "board");
    const history = service.recordSceneJudgment({ function_key: original.function_key, function_version: 1,
      subject: { kind: "inbox_entry", id: "original", board_id: "board" }, scene_id: HOME_DOCK_SCENE_ID,
      outcome: "ok", suggested_behavior_ids: ["inbox.done"], error_code: null });
    const migrated = withFunctionsService(home, current => current.get(draft.id), options);
    const key = subjectOfferChoiceKey({ ...inboxActions.offers, provider_id: inboxManifest.plugin_id }, inboxActions.offers.action.subject_offer_choices![0]!);
    assert.deepEqual(migrated.scene_map, { complete: key, ask: "home.ask" });
    assert.deepEqual({ ...migrated, scene_map: original.scene_map }, original, "migration changes only the exact known reference");
    assert.deepEqual(withFunctionsService(home, current => current.sceneBinding(HOME_DOCK_SCENE_ID, "board"), options), binding);
    assert.deepEqual(withFunctionsService(home, current => current.listJudgments(), options), [history]);
    assert.deepEqual(withFunctionsService(home, current => current.get(draft.id), options), migrated, "reopening is idempotent");

    const registry = new ActionService();
    const registered = new SystemFunctionsActions(registry, home, options);
    const caller = { actor_id: "owner", project_id: null, audience: "user" as const, permissions: ["functions:invoke"] };
    const output = () => registry.discover(caller).find(action => action.capability_id === `functions.published.${original.function_key}`)!.action.output_schema;
    registered.refresh();
    const before = output();
    // A reference-only migration keeps the model hash; its public output contract must still refresh.
    store.migrateSceneReferences(HOME_DOCK_SCENE_ID, { "home.ask": "unresolved.original.ask" });
    registered.refresh();
    assert.notDeepEqual(output(), before);
    assert.equal(store.get(draft.id)!.config_hash, original.config_hash);
    assert.match(JSON.stringify(output()), /unresolved\.original\.ask/);
    registered.dispose();
  } finally { store.close(); await rm(home, { recursive: true, force: true }); }
});
