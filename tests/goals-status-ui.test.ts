import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsStatusRenderer, createWorkbenchGoalsFactorsRenderer } from "@molis-ai/molis-work-app-workbench";
import { type GoalsFactorsPrimitives } from "@molis-ai/molis-work-plugin-goals";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { icon } from "@molis-ai/molis-work-design-system";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

test("public status mounts prefer collection state, retain hooks and escape translated attributes", () => {
  const renderer = createWorkbenchGoalsStatusRenderer({ translate: L, escapeHtml, icon });
  for (const [status, expectedIcon] of [["archived", "archive"], ["trashed", "archive"]] as const) {
    const item = { status, display_status: "continue" as const };
    assert.match(renderer.renderVisibleGoalStatus(item), new RegExp("goal-status--" + status));
    assert.equal(renderer.visibleGoalStatusIcon(item), icon(expectedIcon));
  }
  const visible = renderer.renderVisibleGoalStatus({ status: "executing", display_status: "waiting_user" }, 'data-state="current"', 'data-label="current"');
  assert.match(visible, /goal-status--waiting_user/);
  assert.match(visible, /data-state="current"/);
  assert.match(visible, /data-label="current"/);
  assert.match(visible, /等你/);
  assert.equal(renderer.visibleGoalStatusIcon({ status: "executing", display_status: "waiting_user" }), icon("user"));
  const untrusted = createWorkbenchGoalsStatusRenderer({ translate: () => 'Text "<unsafe>', escapeHtml, icon });
  const html = untrusted.renderStatus("waiting_for_human");
  assert.match(html, /title="Text &quot;&lt;unsafe&gt;"/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(runWithLocale("en", () => renderer.renderStatus("archived")), /Archived/);
});

test("factors contribution keeps owner content, live counts and accessible tab relationships", () => {
  let captured: Parameters<GoalsFactorsPrimitives["renderFocusSectionDeck"]>[0] = [];
  const renderer = createWorkbenchGoalsFactorsRenderer({ translate: L, escapeHtml, icon,
    renderFocusSectionDeck: cards => { captured = cards; return cards.map(card => card.body).join(""); } });
  const html = renderer({ goal: { goal_id: 'goal"<x>' },
    risks: ["open", "triggered", "resolved", "accepted", "expired"].map(state => ({ state })),
    impacts: [{ state: "active" }, { state: "inactive" }], relations: [{ state: "active" }, { state: "inactive" }],
  }, { relationsHtml: "<article>Relations + Decision history</article>", risksHtml: "<article>Risk owner</article>", impactsHtml: "<article>Impact owner</article>", policyHtml: "<article>Policy owner</article>" });
  assert.deepEqual(captured.map(card => [card.key, card.count]), [["relations", 1], ["risks", 2], ["impacts", 1], ["rules", undefined]]);
  for (const card of captured) {
    assert.ok(card.triggerAttributes?.includes('aria-controls="goal-factor-panel-' + card.key + '-goal&quot;&lt;x&gt;"'));
    assert.ok(card.bodyAttributes?.includes('aria-labelledby="goal-factor-tab-' + card.key + '-goal&quot;&lt;x&gt;"'));
    assert.ok(card.triggerAttributes?.includes('aria-selected="' + (card.key === "relations" ? "true" : "false") + '"'));
  }
  assert.match(captured[0]!.body, /Relations \+ Decision history/);
  assert.match(captured[1]!.body, /Risk owner/);
  assert.match(captured[2]!.body, /Impact owner/);
  assert.match(captured[3]!.body, /Policy owner/);
  assert.match(html, /关联与约束/);
});
