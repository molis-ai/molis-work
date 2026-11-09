import type { FormKind, OwnedPresentationObject } from "@molis-ai/molis-work-contracts/platform/presentation";
import { escapeHtml, renderButton, renderPopover, renderPresentationForm, renderSheet, say, type PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";
import { presentationOwnerHue } from "../styles/presentation.js";
import { section } from "./catalog-parts.js";

const title = "Mobile pricing table · review the third column on narrow windows, split panes and long customer names";
const declaration: OwnedPresentationObject = {
  owner: "io.molis.work.inbox",
  kind: "inbox_item",
  fields: [
    { key: "title", role: "title" }, { key: "status", role: "status" },
    { key: "summary", role: "summary" }, { key: "excerpt", role: "excerpt" },
    { key: "updated", role: "updated_at" }, { key: "actor", role: "actor" },
    { key: "progress", role: "progress" }, { key: "where", role: "held_in" },
  ],
  status: { field: "status", map: {
    review: { ring: "answer", attention: "needs_decision" },
    acceptance: { ring: "verify", attention: "needs_acceptance" },
    running: { ring: "running" },
    failed: { ring: "failed", attention: "failed" },
    partial: { ring: "partial", attention: "partial" },
    done: { ring: "done" },
  } },
  forms: {
    chip: { fields: ["title"] },
    row: { fields: ["title", "updated", "actor", "where"] },
    card: { fields: ["title", "summary", "updated", "progress"] },
    peek: { fields: ["title", "summary", "excerpt", "updated", "actor", "progress", "where"] },
  },
};

const owner = (id: string, name: string, icon: PresentationFormValues["ownerDisplay"]["icon"]) =>
  ({ id, display: { name, icon, hue: presentationOwnerHue(id) } });
const inbox = owner(declaration.owner, "Inbox", "inbox");
const goals = owner("io.molis.work.goals", "Goals", "target");
const coding = owner("io.molis.work.coding", "Coding", "code");
const at = "2026-11-08T17:40:00Z";

export function presentationSection(locale: string): string {
  const text = (key: string) => say.text({ owner: "workbench", key }, { locale });
  const peekLabel = text("common.presentation.peek");
  const closeLabel = text("common.presentation.close");
  const sample = {
    title, status: "review", summary: "The third column wraps on phones. The reply draft and a retry of the preview export are ready for review.",
    excerpt: "Thanks for reporting this. The corrected layout keeps prices on the same line at narrow widths.",
    updated: at, actor: "Lin", progress: 60, where: "project",
  };
  const draw = (form: FormKind, read: PresentationFormValues["read"], plugin = inbox, actions?: PresentationFormValues["actions"]) =>
    renderPresentationForm({ ...declaration, owner: plugin.id }, form, { locale, ownerDisplay: plugin.display, read, actions });
  const current = { state: "ok", values: sample } as const;
  const message = { key: "review-message", label: text("workbench.presentation.send"), primary: true, consequence: ["external", "irreversible"] } as const;
  const retry = { key: "review-retry", label: text("workbench.presentation.retry"), consequence: ["cost"] } as const;
  const chip = draw("chip", current);
  const peek = draw("peek", current, inbox, [
    { key: "show-card", label: message.label, primary: true }, { key: "close-peek", label: closeLabel },
  ]);
  const popover = renderPopover({ body: '<div data-presentation-peek-body></div>', className: "mw-presentation-board__popover",
    attrs: { id: "presentation-popover", role: "dialog", "aria-label": peekLabel } });
  const sheet = renderSheet({ labelledBy: "presentation-sheet-title", title: peekLabel, body: '<div data-presentation-peek-body></div>',
    footer: "", closeLabel, className: "mw-presentation-board__sheet", attrs: { id: "presentation-sheet" } });
  const variants = [
    ["acceptance", "Check the revised mobile layout", goals],
    ["running", "Check the layout against long customer names", coding],
    ["failed", "Export the mobile preview", coding],
    ["partial", "Verify the three pricing breakpoints", coding],
    ["done", "Record the layout requirements", goals],
  ] as const;
  return section("presentation-forms", escapeHtml(text("workbench.presentation.forms")), `<div class="mw-presentation-board">
    <div class="mw-presentation-board__chip"><div id="presentation-board-chip-label">${chip}</div>${renderButton({
      label: peekLabel, variant: "ghost", iconOnly: true, className: "mw-presentation-board__trigger",
      attrs: { "data-presentation-peek": true, "aria-haspopup": "dialog", "aria-expanded": "false", "aria-describedby": "presentation-board-chip-label" },
    })}</div>
    ${draw("row", current, inbox, [message, retry])}
    <div data-presentation-card tabindex="-1">${draw("card", current, inbox, [message, retry])}</div>
    <template data-presentation-peek-template>${peek}</template>${popover}${sheet}
    ${variants.map(([status, title, display]) => draw("row", { state: "ok", values: { ...sample, title, status } }, display)).join("")}
    ${draw("row", { state: "stale", values: { ...sample, title: "Review the last saved draft", where: "personal" }, read_at: at }, goals)}
    ${draw("row", { state: "unreadable" }, goals)}
    ${draw("row", { state: "forbidden" })}
    ${draw("row", { state: "deleted" }, coding)}
  </div>`);
}

export const PRESENTATION_BOARD_STYLES = `
  .mw-presentation-board { display: grid; grid-template-columns: minmax(0, 1fr); gap: .7em; min-inline-size: 0; max-inline-size: 50rem; }
  .mw-presentation-board__chip { position: relative; justify-self: start; max-inline-size: 100%; }
  .mw-presentation-board__trigger.mw-btn { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; border-radius: var(--sk-r-slot); }
  .mw-presentation-board__trigger.mw-btn:is(:hover, :focus-visible, :active) { background: transparent; }
  @media (max-width: 650px), (pointer: coarse) {
    .mw-presentation-board__chip { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; min-block-size: var(--control-h, 44px); }
  }
  .mw-presentation-board__anchor { anchor-name: --catalog-presentation-peek; }
  .mw-catalog .mw-presentation-board__popover:not(:popover-open) { display: none; }
  .mw-catalog .mw-presentation-board__popover:popover-open {
    position: fixed; inset: auto; margin: 0; overflow: auto;
    position-anchor: --catalog-presentation-peek; top: calc(anchor(bottom) + .4em); left: anchor(left);
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    inline-size: min(27rem, calc(100vw - 2em)); max-block-size: min(28rem, calc(100dvh - 2em));
  }
  dialog.mw-presentation-board__sheet:not([open]) { display: none; }
  dialog.mw-presentation-board__sheet {
    inset: auto 0 0; inline-size: 100%; block-size: auto; max-block-size: 90dvh;
    border-radius: var(--sk-r-card) var(--sk-r-card) 0 0;
  }
  .mw-presentation-board__sheet .mw-form__body { overflow: auto; overscroll-behavior: contain; }
  .mw-presentation-board__sheet .mw-form__footer:empty { display: none; }
`;
