// The board's parts for the unified input (specs/unified-input-voice/implementation-plan.md §3.6, UIC-04): the multi-row
// composer shell `mw-composer` and the menu item's description line `mw-menu__desc` (the microphone glyph and its place in the
// bar come with K0c, which owns the SDK's icon names). Like the patterns in
// catalog-patterns.ts they live on the board first: the rules below are the board's own (not in the served sheets) and move into
// the page sheets with the component that first uses them (K2, together with the `mw-upload`, `mw-tag` and `mw-btn-group` rules
// the shell is built from). The shell holds only existing controls; it adds the box, its rows and its states.
import { escapeHtml, icon, renderButton, renderProgress, renderStatusMark, type MwStatusTone, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";

export type Say = (text: string, values?: Record<string, string | number>) => string;

/** The board without a page translator (tests, other consumers): the Chinese text with its `{name}` values filled in. */

/**
 * The shell, as the home bar's one-line capsule draws it (`--r-composer`, `--lift-1`, `--line-strong` on focus), grown to rows.
 * States are one attribute on `.mw-composer`, `data-state`: `sending`, `running`, `failed`, `unconfirmed` or `disabled`; none is
 * the ordinary state. Focus is `:focus-within`, never an attribute. Menus inside open upwards, from the bar they belong to.
 */
export const COMPOSER_BOARD_STYLES = `
  .mw-composer { display: grid; gap: 6px; width: min(640px, 100%); min-width: 0; container: mw-composer / inline-size; }
  .mw-composer__to { display: flex; align-items: center; gap: 6px; min-width: 0; padding-inline: 4px; color: var(--muted); font-size: 12px; white-space: nowrap; }
  .mw-composer__to .mw-tag { min-width: 0; max-width: min(100%, 320px); }
  .mw-composer__to .mw-tag > span { overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__box { position: relative; display: grid; min-width: 0; border-radius: var(--r-composer, 15px); background: var(--paper); box-shadow: 0 0 0 1px var(--line), var(--lift-1); transition: box-shadow var(--dur-hover) var(--ease-quint), background-color var(--dur-hover) var(--ease-quint); }
  .mw-composer__box:focus-within { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-composer__files { width: auto; padding: 6px 6px 0; }
  .mw-composer__restore { margin: 0; padding: 8px 12px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mw-composer__restore .mw-btn--link { min-height: 0; padding: 0; vertical-align: baseline; }
  .mw-composer__text { display: flex; padding: 10px 12px 0; }
  /* The page sheets style every bare textarea (a border and a field's fill); the field here is the box itself, so one id-weight
     \`:not\` takes those off, as the button group's joined corners do. */
  .mw-composer__text > .mw-composer__input:not(#mw-composer) { flex: 1; min-width: 0; min-height: 2lh; padding: 0; border: 0; border-radius: 0; outline: 0; background: transparent; box-shadow: none; color: var(--ink); font: inherit; font-size: 14px; line-height: 22px; }
  .mw-composer__input::placeholder { color: var(--muted); }
  .mw-composer__status { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding: 8px 12px 0; color: var(--ink-soft); font-size: 12px; line-height: 18px; text-wrap: pretty; }
  .mw-composer__status > .mw-status { flex: none; }
  .mw-composer__status > span:not(.mw-status) { flex: 1; min-width: 0; }
  .mw-composer__status .mw-btn--link { flex: none; min-height: 0; padding: 0; }
  /* In a narrow box the explanation is the part that must be read: it flows as one paragraph that starts beside the mark and
     wraps under it, with the action following its last words, instead of a thin column squeezed between the two. */
  @container mw-composer (max-width: 480px) {
    .mw-composer__status { display: block; }
    .mw-composer__status > .mw-status { margin-right: 8px; vertical-align: 1px; }
    .mw-composer__status .mw-btn--link { margin-left: 8px; vertical-align: baseline; }
  }
  .mw-composer__foot { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 6px 8px 8px; }
  .mw-composer__start, .mw-composer__end { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .mw-composer__start { flex: 1; }
  .mw-composer__end { flex: none; }
  /* The menu hangs from the input box's top right, not from the ▾ button, so it can be as wide as the box and never leave it. */
  .mw-composer__end .mw-compose__anchor { position: static; }
  /* While its menu is open the ▾ stays pressed, the same fill as the primary button's :active. */
  .mw-composer .mw-btn--primary[aria-expanded="true"]:not(:disabled) { background: color-mix(in srgb, var(--action) 82%, var(--action-ink)); }
  .mw-composer .mw-compose__menu { top: auto; right: 0; bottom: calc(100% + 6px); left: auto; width: min(340px, 100%); }
  .mw-composer .mw-compose__menu .mw-menu { width: 100%; min-width: 0; animation-name: craft-rise-from-bar; }
  .mw-composer[data-state="failed"] .mw-composer__box { box-shadow: 0 0 0 1px color-mix(in srgb, var(--red) 45%, transparent), var(--lift-1); }
  .mw-composer[data-state="disabled"] .mw-composer__box { background: var(--wash); box-shadow: 0 0 0 1px var(--line); }
  .mw-composer[data-state="disabled"] .mw-composer__input:not(#mw-composer) { color: var(--muted); cursor: not-allowed; }
  @media (prefers-reduced-motion: reduce) { .mw-composer__box { transition: none; } }
  @media (max-width: 600px), (pointer: coarse) {
    .mw-composer__text > .mw-composer__input:not(#mw-composer) { font-size: 16px; }
    .mw-composer__foot .mw-btn--sm, .mw-composer__foot .mw-btn--icon { min-height: 44px; }
    .mw-composer__foot .mw-btn--icon-only { width: 44px; min-width: 44px; }
  }

  .mw-catalog :is([data-primitive="composer"], [data-primitive="menu-desc"]) .mw-catalog__specimen { margin: 0; }
  .mw-catalog [data-primitive="composer"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  /* The specimen whose ▾ menu is open keeps room above itself for it, so the menu stays inside its own cell. */
  .mw-catalog [data-catalog-menu-room] { padding-top: var(--catalog-menu-room, 240px); }
  .mw-catalog [data-catalog-focus] .mw-composer__box { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-catalog [data-primitive="menu-desc"] .mw-menu { position: static; display: grid; width: min(340px, 100%); }
  .mw-catalog [data-primitive="menu-desc"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); align-items: start; }
`;

const ghostIcon = (label: string, name: Parameters<typeof icon>[0], attrs: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, attrs: { title: label, ...attrs } });

/**
 * The three ways a message reaches a running AI (GLOSSARY: 补充, 打断并改向, 下一轮再做), each with what choosing it does.
 * `interruptRefused` is why the receiver cannot take an interruption: the item stays, cannot be chosen and says why.
 */
function deliveryItems(say: Say, interruptRefused?: string): string {
  return renderMenuItem({ label: say("workbench.catalog-composer.supplement-default"), iconName: "message", description: say("workbench.catalog-composer.read-once-the-current-reply-or-tool"), shortcut: "⌘↵" })
    + renderMenuItem({ label: say("workbench.catalog-composer.interrupt-and-redirect"), iconName: "zap", description: interruptRefused ?? say("workbench.catalog-composer.drops-the-reply-in-progress-and-follows"), disabled: Boolean(interruptRefused) })
    + renderMenuItem({ label: say("workbench.catalog-composer.do-it-next-turn"), iconName: "clock", description: say("workbench.catalog-composer.waits-for-the-start-of-the-next"), shortcut: "⌘⇧↵" });
}

/** Every text is already in the page's language. */
interface ShellOptions {
  readonly state?: "sending" | "running" | "failed" | "unconfirmed" | "disabled";
  readonly text?: string;
  readonly placeholder?: string;
  readonly to?: string;
  readonly restored?: boolean;
  readonly files?: string;
  readonly status?: { readonly tone: MwStatusTone; readonly ring: StateRingState; readonly caption: string; readonly text: string; readonly action?: string };
  readonly focus?: boolean;
  /** The board opens this one's ▾ menu; keep room above it so the menu stays inside the specimen. */
  readonly menuRoom?: boolean;
}

/** One composer as K2 will draw it: who it goes to, files, the text, the status and the bar. */
function shell(say: Say, options: ShellOptions): string {
  const { state } = options;
  const disabled = state === "disabled", running = state === "running", busy = state === "sending" || state === "unconfirmed";
  const to = options.to ?? say("workbench.assistant-dock.assistant");
  const back = escapeHtml(say("workbench.catalog-composer.send-to-the-assistant-instead"));
  const receiver = `<div class="mw-composer__to"><span>${escapeHtml(say("workbench.catalog-composer.to"))}</span><span class="mw-tag"><span>${escapeHtml(to)}</span>${
    options.to ? `<button type="button" data-tag-remove aria-label="${back}" title="${back}">${icon("x")}</button>` : ""}</span></div>`;
  const restored = options.restored
    ? `<p class="mw-field__hint mw-composer__restore">${escapeHtml(say("workbench.catalog-composer.restored-your-unsent-draft-11-02-am"))} · ${renderButton({ label: say("workbench.catalog-composer.clear-draft"), variant: "link" })}</p>` : "";
  const status = options.status
    ? `<div class="mw-composer__status" role="status">${renderStatusMark({ label: options.status.caption, state: options.status.ring, tone: options.status.tone })}<span>${escapeHtml(options.status.text)}</span>${
      options.status.action ? renderButton({ label: options.status.action, variant: "link" }) : ""}</div>`
    : "";
  const empty = !options.text;
  const modes = say("workbench.catalog-composer.how-it-is-delivered");
  const send = running
    ? `<div class="mw-btn-group" role="group" aria-label="${escapeHtml(modes)}">${renderButton({ label: say("workbench.catalog-composer.supplement-2"), variant: "primary", size: "sm", disabled: empty, attrs: { title: say("workbench.catalog-composer.supplement") } })}<div class="mw-compose__anchor">${renderButton({
      label: say("workbench.catalog-composer.choose-how-it-is-delivered"), variant: "primary", size: "icon", icon: "chevron-down", iconOnly: true,
      attrs: { title: say("workbench.catalog-composer.choose-how-it-is-delivered"), "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" },
    })}<div class="mw-compose__menu" data-compose-menu hidden>${renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say) }) })}</div></div></div>`
    : renderButton({ label: say("workbench.assistant-dock.send"), variant: "primary", size: "icon", icon: "send", iconOnly: true, loading: state === "sending", disabled: empty || busy || disabled, attrs: { title: say("workbench.catalog-composer.send") } });
  const off: Record<string, boolean> = disabled ? { disabled: true } : {};
  const add = `<div class="mw-compose__anchor">${ghostIcon(say("workbench.catalog-composer.add-files-and-materials"), "plus", { "aria-haspopup": "menu", "aria-expanded": "false", ...off })}</div>`;
  const stop = running ? renderButton({ label: say("workbench.assistant-dock.stop"), variant: "danger-outline", size: "sm", attrs: { title: say("workbench.catalog-composer.stop-this-turn") } }) : "";
  return `<div class="mw-composer" data-slot="composer"${state ? ` data-state="${state}"` : ""}${options.focus ? " data-catalog-focus" : ""}${options.menuRoom ? " data-catalog-menu-room" : ""}>
    ${receiver}
    <div class="mw-composer__box">
      ${options.files ?? ""}${restored}
      <div class="mw-composer__text"><textarea class="mw-composer__input" data-fit rows="1" aria-label="${escapeHtml(say("workbench.catalog-composer.message-to-who", { who: to }))}" placeholder="${escapeHtml(options.placeholder ?? say("workbench.assistant-dock.ask-assistant-do-something"))}"${disabled ? " disabled" : ""}>${escapeHtml(options.text ?? "")}</textarea></div>
      ${status}
      <div class="mw-composer__foot"><div class="mw-composer__start">${add}</div><div class="mw-composer__end">${stop}${send}</div></div>
    </div>
  </div>`;
}

/** The attachment strip is the board's upload rows: one being read, one read, one refused with its reason. */
function files(say: Say): string {
  const row = (mark: Parameters<typeof icon>[0], name: string, body: string) =>
    `<li class="mw-upload"><span class="mw-mark">${icon(mark)}</span><span>${name}${body}</span>${ghostIcon(say("workbench.catalog-composer.remove-name", { name }), "x")}</li>`;
  return `<ul class="mw-uploads mw-composer__files">${
    row("note", "访谈记录.docx", renderProgress({ value: 60, label: say("workbench.catalog-composer.reading-name", { name: "访谈记录.docx" }) }))
    + row("image", "首页草图.png", "<small>820 KB</small>")
    + row("file", "年度报告.pdf", `<small class="is-failed">${escapeHtml(say("workbench.catalog-composer.too-large-2-1-gb-cannot-attach"))}</small>`)
  }</ul>`;
}

export function composerSection(say: Say): string {
  const task = say("workbench.catalog-composer.add-the-tests-for-step-3");
  // A request long enough to pass the field's cap, so the box scrolls inside.
  const long = [
    say("workbench.catalog-composer.add-the-tests-for-step-3-the"),
    say("workbench.catalog-composer.also-check-whether-coding-s-session-draft"),
    say("workbench.catalog-composer.finally-list-the-files-this-turn-changed"),
    say("workbench.catalog-composer.if-anything-along-the-way-needs-my"),
  ].join("\n\n");
  return section("composer", escapeHtml(say("workbench.catalog-composer.composer")), `<p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-composer.the-home-bar-s-one-line-capsule"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-composer.empty")), shell(say, {}))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.focus")), shell(say, { focus: true, text: task }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.draft-restored-line")), shell(say, { restored: true, text: say("workbench.catalog-composer.add-the-tests-for-step-3-then") }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.attachments-grown-to-the-cap-scrolls-inside")), shell(say, { to: say("workbench.catalog-composer.coding-sign-up-endpoint"), files: files(say), text: long }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.working-sending")), shell(say, { state: "sending", text: task, status: { tone: "progress", ring: "starting", caption: say("workbench.catalog-composer.sending-2"), text: say("workbench.catalog-composer.sending") } }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.working-running-delivery-menu")), shell(say, { state: "running", menuRoom: true, text: say("workbench.catalog-composer.attach-the-failure-screenshots-too"), status: { tone: "progress", ring: "running", caption: say("workbench.settings-call-diagnostics.running"), text: say("workbench.catalog-composer.working-on-this-turn-a-new-message") } }))}
    ${specimen(escapeHtml(say("workbench.assistant-delivery.failed")), shell(say, { state: "failed", text: task, status: { tone: "blocked", ring: "failed", caption: say("workbench.assistant-delivery.failed"), text: say("workbench.catalog-composer.not-sent-the-connection-was-reset-your"), action: say("common.control.retry") } }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.pending-confirmation")), shell(say, { state: "unconfirmed", text: task, status: { tone: "attention", ring: "verify", caption: say("workbench.catalog-composer.pending-confirmation"), text: say("workbench.catalog-composer.could-not-confirm-it-arrived-checking-now"), action: say("workbench.settings-sync-history.details") } }))}
    ${specimen(escapeHtml(say("workbench.capabilities.unavailable")), shell(say, { state: "disabled", placeholder: say("workbench.catalog-composer.this-session-has-ended"), status: { tone: "hold", ring: "unavailable", caption: say("workbench.capabilities.unavailable"), text: say("workbench.catalog-composer.the-session-has-ended-and-takes-no") } }))}
  </div>`);
}

export function menuDescSection(say: Say): string {
  const modes = say("workbench.catalog-composer.how-it-is-delivered");
  const add = renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-composer.project-materials"), iconName: "book", description: say("workbench.catalog-composer.pick-from-the-materials-this-project-already") })
    + renderMenuItem({ label: say("workbench.catalog-composer.files-and-images"), iconName: "paperclip", description: say("workbench.catalog-composer.pick-from-this-computer-or-drag-them") })
    + renderMenuItem({ label: say("workbench.catalog-composer.todo-to-dos"), iconName: "package", description: say("workbench.catalog-composer.no-to-dos-to-pick-none-created"), disabled: true }) }) });
  return section("menu-desc", escapeHtml(say("workbench.catalog-composer.menu-description")), `<p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-composer.a-quiet-line-under-a-menu-item"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-composer.with-shortcuts-delivery")), renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say) }) }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.cannot-be-chosen-with-the-reason")), renderMenu({ items: renderMenuGroup({ label: modes, items: deliveryItems(say, say("workbench.catalog-composer.this-receiver-cannot-be-interrupted-it-always")) }) }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.without-shortcuts-add")), add)}
    ${specimen(escapeHtml(say("workbench.catalog-composer.long-description-without-punctuation-wraps-inside")), renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-composer.join-the-previous-message"), iconName: "message", description: say("workbench.catalog-composer.appends-this-to-your-previous-unread-message") }) }) }))}
  </div>`);
}
