import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_PROJECT_ID, molisWorkHostProjectReference, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

test("QEA-114 returning to a Goal reads artifact and input owners even after its hidden collection acknowledged the platform cursor", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  assert.ok(b.localHost && b.projectId);
  await b.setViewport(1440, 1000);
  const prefix = `/projects/${b.projectId}`, library = openProjectVersionStores(b.store);
  const openDocument = async () => {
    await b.openGoalWork();
    if (await b.evaluate("document.querySelector('[data-goal-details-toggle]')?.getAttribute('aria-expanded') === 'false'")) await b.click('[data-goal-details-toggle]');
    await b.waitFor("document.querySelector('[data-document-pane] [data-work-surface=goals]')?.checkVisibility({visibilityProperty:true})");
  };
  const reference = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId: b.projectId });
  const actions = bindActionClient(b.localHost.actionClient(reference), () => ({ actor_id: "web-user", audience: "user", project_id: b.projectId!,
    permissions: ["goals:read", "goals:write", "context-ledger:write", "artifacts:read"] }));
  library.artifacts.commands.registerVersion({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", artifact_id: "projection-brief", version: 1,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "Projection brief", body: { type: "doc", content: [] } } },
    ...pinnedArtifact("Projection brief", { kind: "pages_document", id: "projection-brief" }, "1") });
  await b.web.post(prefix + "/api/plugins/io.molis.work.goals/goals/V1/artifact-inputs", { reference: { artifact_id: "projection-brief", version: 1 }, used: true });
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/goals/V1?desktop=1" }, b.sessionId));
  await openDocument();
  await b.waitFor("document.querySelector('[data-goal-input-fixed]')?.textContent.includes('Projection brief')");
  await b.click('[data-corner-home]');
  await b.waitFor("document.body.dataset.desktopSurface === 'home'");
  await b.evaluate("globalThis.__retainedGoalDocument = document.querySelector('[data-goal-event-document]')");
  const goalCursor = boardSnapshot(b.store, DEMO_PROJECT_ID).cursor;
  library.artifacts.commands.archiveVersion({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", artifact_id: "projection-brief", version: 1 });
  await actions.invoke(goalsActions.inputsConfirm, { goal_id: "V1", source: { kind: "feed_item", id: "projection-source" }, name: "Input confirmed while hidden",
    snapshot_digest: `sha256:${"a".repeat(64)}`, reason: "Keep the current input owner" });
  assert.equal(boardSnapshot(b.store, DEMO_PROJECT_ID).cursor, goalCursor, "these owners change without adding a Goal journal event");
  const current = await b.web.get<{ observed_event_cursor: number }>(prefix + "/api/board/cursor");
  await b.waitFor(`document.querySelector('#molis-work-data').boardCursor >= ${current.observed_event_cursor}`, 12_000);
  assert.equal(await b.evaluate("document.querySelector('[data-goal-event-document]') === globalThis.__retainedGoalDocument"), true);
  const after = boardSnapshot(b.store, DEMO_PROJECT_ID);
  await b.click('.tab-item[data-item-id="V1"] .tab-item-trigger');
  await openDocument();
  await b.waitFor("document.querySelector('[data-goal-input-fixed]')?.textContent.includes('归档') && document.querySelector('[data-goal-event-document]')?.textContent.includes('Input confirmed while hidden')", 12_000);
  assert.deepEqual(boardSnapshot(b.store, DEMO_PROJECT_ID), after, "returning does not write a new receipt or Goal event");
});
