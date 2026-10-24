import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createPptPlugin, openPptStore, pptActions } from "@molis-ai/molis-work-plugin-ppt";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { pluginActions } from "./fixtures/plugin-actions.js";

/**
 * Where the caller stops being current, counted in the authority waits of one promotion: the dispatcher's own (1), PPT's first
 * (2), the begin transaction's (3), the wait before publishing (4) and the complete transaction's (5). `during` fails inside
 * the wait, which the wait itself refuses; `after` fails once the wait has passed, before the effect it guards, which only the
 * service's own check refuses.
 */
const STAGES = {
  "after-begin-wait": { wait: 3, when: "after" },
  "before-publish": { wait: 4, when: "during" },
  "after-publish-wait": { wait: 4, when: "after" },
  "after-publish": { wait: 5, when: "during" },
  "after-complete-wait": { wait: 5, when: "after" },
} as const;
const FAILURES = ["revoke", "cancel", "replace"] as const;
type Stage = keyof typeof STAGES;
type Failure = typeof FAILURES[number];

/** PPT on the project platform the Host builds: the real library in the Home, the real 成果 module and the Kernel's call. */
async function promotion(stage: Stage | "none", failure: Failure) {
  const home = mkdtempSync(join(tmpdir(), `ppt-authority-${stage}-`));
  const file = join(home, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event),
    eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const artifacts = new ArtifactsModule(ports);
  const platform = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store, artifacts,
    processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory: home, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) } });
  const seed = openPptStore(home), deck = seed.create({ project_id: DEMO_PROJECT_ID, title: "Authority" });
  seed.close();
  try {
    assert.deepEqual((await platform.start([{ definition: createPptPlugin(), bundled: true }])).running, ["io.molis.work.ppt"]);
    const controller = new AbortController(), trigger = stage === "none" ? undefined : STAGES[stage];
    let revoked = false, replaced = false, waits = 0, armed = false, fired = false;
    const fail = () => { fired = true; if (failure === "cancel") controller.abort(); else if (failure === "replace") replaced = true; else revoked = true; };
    const caller: ActionCallContext = { actor_id: "owner", project_id: DEMO_PROJECT_ID, audience: "user",
      permissions: [...new Set([...pptActions.promote.action.permissions, "ppt:read"])], signal: controller.signal,
      validate_authority: async () => {
        waits += 1;
        if (waits !== trigger?.wait) return;
        if (trigger.when === "during") fail(); else armed = true;
      },
      assert_authority_current: () => {
        controller.signal.throwIfAborted();
        if (revoked) throw new ActionError("actions.forbidden", "the caller was revoked");
        if (replaced) throw new ActionError("actions.provider_changed", "the provider was replaced");
        // The wait's own final check has passed: fail before whatever it guards runs.
        if (armed) { armed = false; queueMicrotask(fail); }
      } };
    const outcome = await actions.client.invoke(caller, pptActions.promote, { id: deck.id }).then(() => "done", (error: unknown) => error);
    const after = openPptStore(home);
    try {
      return { outcome, fired, deck: after.get(deck.id, DEMO_PROJECT_ID), published: artifacts.query.listArtifacts(DEMO_PROJECT_ID).length };
    } finally { after.close(); }
  } finally {
    await platform.closeCoordination();
    for (const instance of platform.runtime.list()) if (instance.state === "running") await platform.runtime.stop(instance.install_id);
    store.close(); rmSync(home, { recursive: true, force: true });
  }
}

/** W5-01-PPT-07: PPT hands the platform no check of its own; the library and the 成果 service refuse a stale caller at each stage. */
test("W5-01-PPT-07: cancel, revoke or a replaced provider at each publication stage keeps only already-committed stages", async () => {
  for (const stage of Object.keys(STAGES) as Stage[]) for (const failure of FAILURES) {
    const { outcome, fired, deck, published } = await promotion(stage, failure);
    const label = `${stage} ${failure}`;
    assert.equal(fired, true, `${label}: the failure was injected`);
    if (failure === "cancel") assert.equal((outcome as { name?: string }).name, "AbortError", label);
    else assert.equal((outcome as { code?: string }).code, failure === "revoke" ? "actions.forbidden" : "actions.provider_changed", label);
    assert.equal(deck.artifact_version, 0, `${label}: the deck never records a pinned version`);
    if (stage === "after-begin-wait") {
      assert.equal(deck.publication_pending, undefined, `${label}: nothing begins once the caller is gone`);
      assert.equal(published, 0, label);
    } else {
      assert.equal(deck.publication_pending?.version, 1, `${label}: the committed intent stays for recovery`);
      assert.equal(published, stage === "after-publish" || stage === "after-complete-wait" ? 1 : 0, label);
    }
  }
  const { outcome, deck, published } = await promotion("none", "revoke");
  assert.equal(outcome, "done");
  assert.equal(deck.publication_pending, undefined); assert.equal(deck.artifact_version, 1); assert.equal(published, 1);
});
