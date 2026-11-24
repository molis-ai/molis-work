import { escapeHtml, renderStateRing, STATE_RING_FAMILIES, type StateRingFamily, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { resolveCatalogSay, type CatalogSay } from "./catalog-parts.js";

const RING_FAMILY_KEY: Record<StateRingFamily, string> = {
  idle: "workbench.catalog-board.ds.ring-fam-idle",
  connected: "workbench.catalog-board.ds.ring-fam-connected",
  running: "workbench.catalog-board.ds.ring-fam-running",
  done: "workbench.catalog-board.ds.ring-fam-done",
  waiting: "workbench.catalog-board.ds.ring-fam-waiting",
  answer: "workbench.catalog-board.ds.ring-fam-answer",
  paused: "workbench.catalog-board.ds.ring-fam-paused",
  blocked: "workbench.catalog-board.ds.ring-fam-blocked",
  syncing: "workbench.catalog-board.ds.ring-fam-syncing",
  retrying: "workbench.catalog-board.ds.ring-fam-retrying",
  failed: "workbench.catalog-board.ds.ring-fam-failed",
  partial: "workbench.catalog-board.ds.ring-fam-partial",
  interrupted: "workbench.catalog-board.ds.ring-fam-interrupted",
  verify: "workbench.catalog-board.ds.ring-fam-verify",
  stale: "workbench.catalog-board.ds.ring-fam-stale",
  disconnected: "workbench.catalog-board.ds.ring-fam-disconnected",
  unsaved: "workbench.catalog-board.ds.ring-fam-unsaved",
  unread: "workbench.catalog-board.ds.ring-fam-unread",
  read: "workbench.catalog-board.ds.ring-fam-read",
  archived: "workbench.catalog-board.ds.ring-fam-archived",
  trashed: "workbench.catalog-board.ds.ring-fam-trashed",
};

const RING_STATE_KEY: Record<StateRingState, string> = {
  idle: "workbench.catalog-board.ds.ring-state-idle",
  ready: "workbench.catalog-board.ds.ring-state-ready",
  doing: "workbench.catalog-board.ds.ring-state-doing",
  done: "workbench.catalog-board.ds.ring-state-done",
  stopped: "workbench.catalog-board.ds.ring-state-stopped",
  cancelled: "workbench.catalog-board.ds.ring-state-cancelled",
  queued: "workbench.catalog-board.ds.ring-state-queued",
  waiting: "workbench.catalog-board.ds.ring-state-waiting",
  answer: "workbench.catalog-board.ds.ring-state-answer",
  approval: "workbench.catalog-board.ds.ring-state-approval",
  paused: "workbench.catalog-board.ds.ring-state-paused",
  blocked: "workbench.catalog-board.ds.ring-state-blocked",
  starting: "workbench.catalog-board.ds.ring-state-starting",
  running: "workbench.catalog-board.ds.ring-state-running",
  generating: "workbench.catalog-board.ds.ring-state-generating",
  saving: "workbench.catalog-board.ds.ring-state-saving",
  syncing: "workbench.catalog-board.ds.ring-state-syncing",
  indexing: "workbench.catalog-board.ds.ring-state-indexing",
  retrying: "workbench.catalog-board.ds.ring-state-retrying",
  failed: "workbench.catalog-board.ds.ring-state-failed",
  interrupted: "workbench.catalog-board.ds.ring-state-interrupted",
  partial: "workbench.catalog-board.ds.ring-state-partial",
  verify: "workbench.catalog-board.ds.ring-state-verify",
  stale: "workbench.catalog-board.ds.ring-state-stale",
  conflict: "workbench.catalog-board.ds.ring-state-conflict",
  connected: "workbench.catalog-board.ds.ring-state-connected",
  disconnected: "workbench.catalog-board.ds.ring-state-disconnected",
  reauth: "workbench.catalog-board.ds.ring-state-reauth",
  unavailable: "workbench.catalog-board.ds.ring-state-unavailable",
  disabled: "workbench.catalog-board.ds.ring-state-disabled",
  quarantined: "workbench.catalog-board.ds.ring-state-quarantined",
  unsaved: "workbench.catalog-board.ds.ring-state-unsaved",
  saved: "workbench.catalog-board.ds.ring-state-saved",
  unread: "workbench.catalog-board.ds.ring-state-unread",
  read: "workbench.catalog-board.ds.ring-state-read",
  archived: "workbench.catalog-board.ds.ring-state-archived",
  trashed: "workbench.catalog-board.ds.ring-state-trashed",
  "round-ended": "workbench.catalog-board.ds.ring-state-round-ended",
  draft: "workbench.catalog-board.ds.ring-state-draft",
  material: "workbench.catalog-board.ds.ring-state-material",
  staged: "workbench.catalog-board.ds.ring-state-staged",
  unstaged: "workbench.catalog-board.ds.ring-state-unstaged",
  untracked: "workbench.catalog-board.ds.ring-state-untracked",
};

export function renderStateRingCatalog(say: CatalogSay = resolveCatalogSay()): string {
  const doneLabel = say("workbench.catalog-board.ds.ring-state-done");
  const choices = STATE_RING_FAMILIES.map(family => `<div class="mw-ring-catalog__family">${renderStateRing({ state: family.key, size: 28 })}<div><strong>${escapeHtml(say(RING_FAMILY_KEY[family.key]))}</strong><div class="mw-ring-catalog__aliases">${family.states.map(state => `<button type="button" class="mw-btn mw-btn--ghost" data-ring-choice="${state}" aria-pressed="${state === "done"}">${escapeHtml(say(RING_STATE_KEY[state]))}</button>`).join("")}</div></div></div>`).join("");
  return `<section class="mw-catalog__section" id="status-ring" data-primitive="status-ring"><h2>${escapeHtml(say("workbench.catalog-board.ds.ring-section-title"))}</h2>
    <div class="mw-ring-catalog__preview">
      <div class="mw-ring-catalog__hero">${renderStateRing({ state: "done", size: 64, label: doneLabel })}<strong data-ring-chosen>${escapeHtml(doneLabel)}</strong></div>
      <div class="mw-ring-catalog__row">${renderStateRing({ state: "done" })}<span>${escapeHtml(say("workbench.catalog-board.ds.ring-sample-row"))}</span><small data-ring-chosen>${escapeHtml(doneLabel)}</small></div>
      <div class="mw-ring-catalog__sizes">${[12, 16, 20, 32].map(size => `<span>${renderStateRing({ state: "done", size })}<small>${size}px</small></span>`).join("")}</div>
    </div>
    <p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-board.ds.ring-hint"))}</p>
    <div class="mw-ring-catalog__grid">${choices}</div>
    <style>
      #status-ring svg.mw-state-ring { width: var(--ring-size); height: var(--ring-size); }
      .mw-ring-catalog__preview { display: flex; flex-wrap: wrap; align-items: center; gap: 24px; padding: 24px 0; }
      .mw-ring-catalog__hero { display: grid; justify-items: center; gap: 8px; min-width: 120px; }
      .mw-ring-catalog__row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; min-width: 0; padding: 16px 0; }
      .mw-ring-catalog__row small { color: var(--muted); }
      .mw-ring-catalog__sizes { display: flex; align-items: center; gap: 20px; }
      .mw-ring-catalog__sizes > span { display: grid; justify-items: center; gap: 8px; }
      .mw-ring-catalog__sizes small { color: var(--muted); }
      .mw-ring-catalog__grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,280px),1fr)); gap: 0 24px; }
      .mw-ring-catalog__family { display: flex; align-items: flex-start; gap: 10px; padding: 16px 0; border-top: 1px solid var(--line); }
      .mw-ring-catalog__family > svg { margin-top: 2px; }
      .mw-ring-catalog__aliases { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0 0 -6px; }
      .mw-ring-catalog__aliases .mw-btn { font-size: 12px; padding: 0 6px; }
      .mw-ring-catalog__aliases [aria-pressed=true] { background: var(--nav-active); }
    </style>
    <script>
      document.getElementById('status-ring').addEventListener('click', event => {
        const choice = event.target.closest('[data-ring-choice]'); if (!choice) return;
        const root = choice.closest('#status-ring'), label = choice.textContent;
        root.querySelectorAll('[data-ring-choice]').forEach(button => button.setAttribute('aria-pressed', String(button === choice)));
        root.querySelectorAll('.mw-ring-catalog__preview [data-mw-state]').forEach(ring => {
          ring.dataset.mwState = choice.dataset.ringChoice;
          if (ring.hasAttribute('aria-label')) ring.setAttribute('aria-label', label);
        });
        root.querySelectorAll('[data-ring-chosen]').forEach(node => { node.textContent = label; });
      });
    </script>
  </section>`;
}
