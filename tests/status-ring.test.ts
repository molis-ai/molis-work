import assert from "node:assert/strict";
import test from "node:test";
import { icon, renderSpinner, renderStateRing, renderStatusMark, STATE_RING_FAMILIES, stateRingFamily } from "@molis-ai/molis-work-plugin-sdk/ui";
import { STATE_RING_STYLES } from "@molis-ai/molis-work-design-system";
import { goalsRenderers } from "./goals-page-mount.js";

test("RING-01 aliases share presentation without replacing the caller's business meaning", () => {
  for (const state of ["done", "saved", "round-ended", "staged"] as const) {
    const html = renderStateRing({ state, label: state });
    assert.equal(stateRingFamily(state), "done");
    assert.match(html, new RegExp(`data-mw-state="${state}"`));
    assert.match(html, /data-ring-core d="M8.5 12l2.3 2.3 4.7-4.6"/);
  }
  assert.equal(stateRingFamily("doing"), stateRingFamily("running"));
  assert.equal(stateRingFamily("approval"), "answer");
  assert.equal(stateRingFamily("conflict"), "verify");
  const states = STATE_RING_FAMILIES.flatMap(family => [...family.states]);
  assert.equal(new Set(states).size, 43);
  assert.equal(states.length, 43);
  assert.equal(STATE_RING_FAMILIES.length, 21);
});

test("RING-02 real progress controls partial colors, interruption uses copper instead of red", () => {
  const colors = (state: "partial" | "interrupted", progress: number) => [...renderStateRing({ state, progress }).matchAll(/data-ring-tone="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(colors("partial", .25), [...Array(3).fill("success"), ...Array(9).fill("attention")]);
  assert.deepEqual(colors("interrupted", .75), [...Array(9).fill("neutral"), ...Array(3).fill("interruption")]);
  assert.deepEqual(colors("partial", 0), Array(12).fill("attention"));
  assert.deepEqual(colors("partial", 1), Array(12).fill("success"));
  assert.equal(colors("partial", .99).filter(color => color === "attention").length, 1);
  assert.equal(colors("partial", .01).filter(color => color === "success").length, 1);
  assert.doesNotMatch(renderStateRing({ state: "partial" }), /aria-valuenow|data-ring-progress/);
  assert.match(renderStateRing({ state: "verify" }), /data-ring-core d="M12 8.8v3.4M12 14.8h.01"/);
});

test("RING-02 RING-05 current status and loading entrypoints use one accessible renderer", () => {
  assert.match(icon("status-progress"), /data-mw-state="doing"/);
  assert.match(icon("status-done"), /data-mw-state="done"/);
  assert.match(renderSpinner({ label: "Loading" }), /role="status" aria-label="Loading"/);
  assert.match(renderSpinner(), /data-mw-state="running"/);
  const labelled = renderStateRing({ state: "failed", label: '<bad "result">' });
  assert.match(labelled, /aria-label="&lt;bad &quot;result&quot;&gt;"/);
  assert.match(labelled, /role="img"/);
  const mark = renderStatusMark({ state: "round-ended", label: "本轮结束，仍需验收" });
  assert.match(mark, /data-mw-state="round-ended"/);
  assert.match(mark, /本轮结束，仍需验收/);
  assert.doesNotMatch(mark, /role="img"/);
});

test("RING-05 Goals keep their labels while only real execution moves", () => {
  const renderer = goalsRenderers.status({ translate: text => text, escapeHtml: text => text, icon });
  const running = renderer.renderVisibleGoalStatus({ status: "executing", display_status: "in_progress", status_label: "正在检查实现" });
  const doing = renderer.renderVisibleGoalStatus({ status: "execution_pending", display_status: "in_progress", status_label: "进行中" });
  assert.match(running, /data-mw-state="running"/);
  assert.match(running, /正在检查实现/);
  assert.match(doing, /data-mw-state="doing"/);
  assert.match(doing, /进行中/);
  assert.match(renderer.renderStatus("invalidated"), /data-mw-state="cancelled"/);
  assert.match(renderer.renderVisibleGoalStatus({ status: "archived", display_status: "completed" }), /data-mw-state="archived"/);
  assert.match(renderer.renderActionStatus("completed"), /data-mw-state="done"/);
});

test("RING-08 common marks stand as tall as their words and stay legible while the catalog can demonstrate compact sizes", () => {
  // Without a size a ring follows its text (styles/state-ring.ts: 1em + 2px), and its stroke is at least 1.4 CSS px on
  // screen at the 13px it is drawn for, beside 11px words (user 2026-10-22, VUX-46).
  for (const html of [renderStateRing({ state: "idle" }), icon("status-done"), renderStatusMark({ state: "failed", label: "失败" }), renderSpinner()]) {
    assert.doesNotMatch(html, /<svg[^>]* width="/);
    assert.ok(Number(/--ring-stroke:([\d.]+)/.exec(html)![1]) * 13 / 24 >= 1.399);
  }
  assert.match(STATE_RING_STYLES, /width: var\(--ring-size, calc\(1em \+ 2px\)\); height: var\(--ring-size, calc\(1em \+ 2px\)\);/);
  assert.ok(Number(/--ring-stroke:([\d.]+)/.exec(renderStateRing({ state: "done", size: 20 }))![1]) * 20 / 24 >= 1.399);
  assert.match(renderStateRing({ state: "done", size: 12 }), /width="12" height="12"/);
  for (const state of ["idle", "read", "failed", "answer"] as const) {
    const opacity = [...renderStateRing({ state }).matchAll(/opacity="([\d.]+)"/g)].map(match => Number(match[1]));
    assert.ok(opacity.length === 12 && opacity.every(value => value >= (state === "failed" || state === "answer" ? .7 : .45)), `${state} does not fade below its readable baseline`);
  }
});
