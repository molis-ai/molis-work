import assert from "node:assert/strict";
import test from "node:test";
import { goalsRenderers } from "./goals-page-mount.js";
import { type GoalsFactorsPrimitives } from "@molis-ai/molis-work-plugin-goals";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { icon, renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";

const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

test("public status mounts prefer collection state, retain hooks and escape translated attributes", () => {
  const renderer = goalsRenderers.status({ translate: L, escapeHtml, icon });
  for (const status of ["archived", "trashed"] as const) {
    const item = { status, display_status: "continue" as const };
    assert.match(renderer.renderVisibleGoalStatus(item), new RegExp("goal-status--" + status));
    assert.equal(renderer.visibleGoalStatusIcon(item), renderStateRing({ state: status }));
  }
  const visible = renderer.renderVisibleGoalStatus({ status: "executing", display_status: "waiting_user" }, 'data-state="current"', 'data-label="current"');
  assert.match(visible, /goal-status--waiting_user/);
  assert.match(visible, /data-state="current"/);
  assert.match(visible, /data-label="current"/);
  assert.match(visible, /等你/);
  // RING-05: an answer is needed; this is not a running or completed Goal. RING-08: the ring is as tall as its words, so it
  // carries no size of its own.
  assert.equal(renderer.visibleGoalStatusIcon({ status: "executing", display_status: "waiting_user" }), renderStateRing({ state: "answer" }));
  const untrusted = goalsRenderers.status({ translate: () => 'Text "<unsafe>', escapeHtml, icon });
  const html = untrusted.renderStatus("waiting_for_human");
  assert.match(html, /title="Text &quot;&lt;unsafe&gt;"/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(runWithLocale("en", () => renderer.renderStatus("archived")), /Archived/);
});

test("factors contribution keeps owner content, live counts and accessible tab relationships", () => {
  let captured: Parameters<GoalsFactorsPrimitives["renderFocusSectionDeck"]>[0] = [];
  const renderer = goalsRenderers.factors({ translate: L, escapeHtml, icon,
    renderFocusSectionDeck: cards => { captured = cards; return cards.map(card => card.body).join(""); } });
  const html = renderer({ goal: { goal_id: 'goal"<x>' },
    relations: [{ state: "active" }, { state: "inactive" }],
  }, { relationsHtml: "<article>Relations + Decision history</article>", policyHtml: "<article>Policy owner</article>" });
  assert.deepEqual(captured.map(card => [card.key, card.count]), [["relations", 1], ["rules", undefined]]);
  for (const card of captured) {
    assert.ok(card.triggerAttributes?.includes('aria-controls="goal-factor-panel-' + card.key + '-goal&quot;&lt;x&gt;"'));
    assert.ok(card.bodyAttributes?.includes('aria-labelledby="goal-factor-tab-' + card.key + '-goal&quot;&lt;x&gt;"'));
    assert.ok(card.triggerAttributes?.includes('aria-selected="' + (card.key === "relations" ? "true" : "false") + '"'));
  }
  assert.match(captured[0]!.body, /Relations \+ Decision history/);
  assert.match(captured[1]!.body, /Policy owner/);
  assert.match(html, /关联与约束/);
});
