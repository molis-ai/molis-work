import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Goals relation UI preserves incoming direction, historical reading and reload", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, before, sessionId, command, evaluate, waitFor, click, reloadPage } = browser;
  const relationId = "legacy-inactive-extends-v1";
  const creationReason = 'historical incoming "extends" <preserved>';
  const deactivationReason = "Result no longer needs this relation";
  store.db.prepare(`
    INSERT INTO goal_relations (
      relation_id, board_id, from_goal_id, to_goal_id, type, state, reason, created_by, created_at, deactivated_at
    ) VALUES (?, ?, ?, ?, 'extends', 'inactive', ?, 'history-fixture', ?, ?)
  `).run(relationId, DEMO_BOARD_ID, "PLATFORM", "V1", creationReason, "2026-09-01T01:00:00.000Z", "2026-09-01T02:00:00.000Z");
  store.db.prepare(`
    INSERT INTO events (
      event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
    ) VALUES (?, ?, 'history-fixture', 'relation.deactivated', 'relation', ?, ?, ?, ?)
  `).run(
    "legacy-inactive-extends-v1-event",
    DEMO_BOARD_ID,
    relationId,
    deactivationReason,
    JSON.stringify({ from_goal_id: "PLATFORM", to_goal_id: "V1", type: "extends" }),
    "2026-09-01T02:00:00.000Z",
  );
  const seeded = store.snapshot(DEMO_BOARD_ID);
  const seededRelation = seeded.relations.find((relation) => relation.relation_id === relationId)!;
  assert.equal(seededRelation.from_goal_id, "PLATFORM");
  assert.equal(seededRelation.to_goal_id, "V1");
  assert.equal(seededRelation.type, "extends");
  assert.equal(seededRelation.state, "inactive");
  assert.equal(seededRelation.reason, creationReason);
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Page.navigate", { url: origin + "/goals/V1" }, sessionId);
  await command("Page.bringToFront", {}, sessionId);
  const incoming = seeded.relations.filter((relation) =>
    relation.to_goal_id === "V1" && relation.type === "part_of" && relation.state === "active");
  assert.ok(incoming.some((relation) => relation.from_goal_id === "PLATFORM"));
  const platform = seeded.goals.find((goal) => goal.goal_id === "PLATFORM")!;
  const panel = "#goal-factor-panel-relations-V1";
  const record = "#relation-" + relationId;
  async function openRelations() {
    await waitFor("document.readyState === 'complete' && document.querySelector('[data-goal-event-document]')");
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
    if (await evaluate("!document.querySelector('[data-event-panel=description]')?.hidden")) await click('.detail-toolbar [data-event-back]');
    await click('[data-event-reader="description"]');
    await waitFor("document.querySelector('[data-event-panel=\"description\"]') && document.querySelector('[data-event-panel=\"description\"]').hidden === false");
    await waitFor("document.querySelector('#goal-factor-tab-relations-V1')");
    await click("#goal-factor-tab-relations-V1");
    await waitFor("document.querySelector('#goal-factor-panel-relations-V1') && document.querySelector('#goal-factor-panel-relations-V1').hidden === false");
  }
  await openRelations();
  const panelText = await evaluate<string>("document.querySelector('#goal-factor-panel-relations-V1')?.textContent || ''");
  assert.match(panelText, new RegExp(platform.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(panelText, /包含/);
  const platformKind = await evaluate<string>(
    "document.querySelector('#goal-factor-panel-relations-V1 [data-select-goal=\"PLATFORM\"]')?.closest('.relation-record:not(.relation-record--inactive)')?.querySelector('.relation-kind')?.textContent || ''",
  );
  assert.equal(platformKind, "包含");
  await click(panel + " .relation-inactive-history > summary");
  await waitFor("document.querySelector(" + JSON.stringify(record) + ")");
  const inactiveText = await evaluate<string>("document.querySelector(" + JSON.stringify(record) + ")?.textContent || ''");
  assert.match(inactiveText, /Result no longer needs this relation/);
  assert.match(inactiveText, new RegExp(creationReason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(await evaluate("document.querySelector(" + JSON.stringify(record + " [data-relation-deactivate-open]") + ")"), null);
  assert.equal(await evaluate<string>("document.querySelector(" + JSON.stringify(record + " .relation-kind") + ")?.textContent || ''"), "由此扩展");
  const beforeRelations = seeded.relations.map((relation) => ({
    relation_id: relation.relation_id,
    from_goal_id: relation.from_goal_id,
    to_goal_id: relation.to_goal_id,
    type: relation.type,
    state: relation.state,
    reason: relation.reason,
    deactivated_at: relation.deactivated_at,
  }));
  await reloadPage();
  await openRelations();
  const afterKind = await evaluate<string>(
    "document.querySelector('#goal-factor-panel-relations-V1 [data-select-goal=\"PLATFORM\"]')?.closest('.relation-record:not(.relation-record--inactive)')?.querySelector('.relation-kind')?.textContent || ''",
  );
  assert.equal(afterKind, "包含");
  await click(panel + " .relation-inactive-history > summary");
  await waitFor("document.querySelector(" + JSON.stringify(record) + ")");
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(record) + ")?.textContent || ''"), /Result no longer needs this relation/);
  assert.equal(await evaluate<string>("document.querySelector(" + JSON.stringify(record + " .relation-kind") + ")?.textContent || ''"), "由此扩展");
  const after = store.snapshot(DEMO_BOARD_ID);
  assert.deepEqual(after.relations.map((relation) => ({
    relation_id: relation.relation_id,
    from_goal_id: relation.from_goal_id,
    to_goal_id: relation.to_goal_id,
    type: relation.type,
    state: relation.state,
    reason: relation.reason,
    deactivated_at: relation.deactivated_at,
  })), beforeRelations);
  assert.equal(after.relations.find((relation) => relation.relation_id === relationId)?.state, "inactive");
  assert.equal(before.relations.some((relation) => relation.relation_id === relationId), false);
});
