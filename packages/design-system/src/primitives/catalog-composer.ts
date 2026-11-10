// The board's parts for the unified input (specs/unified-input-voice/implementation-plan.md §3.6, UIC-04): the multi-row
// composer shell `mw-composer`, the menu item's description line `mw-menu__desc` and the microphone glyph `mic` (a placeholder
// until voice input lands in batch 53). Like the patterns in
// catalog-patterns.ts they were on the board first; since K2 the shell's rules are served in the workbench sheet (`COMPOSER_STYLES`
// in composer-styles.ts, with the `mw-upload`, `mw-tag` and `mw-btn-group` rules it is built from) and the board reads the same
// constant. The shell holds only existing controls; it adds the box, its rows and its states. Its markup is the SDK's
// `renderComposer()` (K0c), the same first screen a plugin draws, and its menus are K2's own builders (composer-parts.ts), so the
// board, the SDK and the client cannot drift (UIC-13).
import { escapeHtml, icon, renderButton, renderComposer, renderProgress, type MwComposerAiLabels, type MwComposerStatus } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./overlay.js";
import { renderComposerDeliveryMenu } from "../composer-parts.js";
import { section, specimen } from "./catalog-parts.js";
import { composerRestRules, composerRestTouch } from "../composer-styles.js";

export type Say = (text: string, values?: Record<string, string | number>) => string;

/** The board's own layout for the three sections; the shell's look is `COMPOSER_STYLES` (composer-styles.ts), served to pages. */
export const COMPOSER_BOARD_STYLES = `
  .mw-catalog :is([data-primitive="composer"], [data-primitive="menu-desc"], [data-primitive="mic"]) .mw-catalog__specimen { margin: 0; }
  .mw-catalog [data-primitive="composer"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  /* The specimen whose ▾ menu is open keeps room above itself for it (the menu hangs from the whole composer), so it stays in its cell. */
  .mw-catalog [data-catalog-menu-room] { margin-top: var(--catalog-menu-room, 240px); }
  .mw-catalog [data-catalog-focus] .mw-composer__box { box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-catalog [data-primitive="menu-desc"] .mw-menu { position: static; display: grid; width: min(340px, 100%); }
  .mw-catalog [data-primitive="menu-desc"] .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); align-items: start; }
  .mw-catalog-mic { display: grid; justify-items: center; align-content: center; gap: 8px; min-width: 72px; min-height: 80px; padding: 12px; border-radius: var(--r-card, 12px); background: var(--surface-soft); color: var(--ink); }
  .mw-catalog-mic > svg { width: var(--mic-size); height: var(--mic-size); }
  .mw-catalog-mic > span { color: var(--muted); font-size: 12px; font-weight: 400; font-variant-numeric: tabular-nums; }
  /* At rest where height is scarce (user 11-08): the page sheet's one row, shown here under the board's own mark at a phone's
     width, with a finger's targets and with a mouse's (a short window). */
  .mw-catalog [data-catalog-compact] { display: grid; gap: 8px; max-width: 390px; }
  .mw-catalog [data-catalog-compact] > .mw-catalog__note { margin: 0; color: var(--muted); font-size: 12px; }${composerRestRules(".mw-catalog [data-catalog-compact] .mw-composer[data-rest]")}${composerRestTouch('.mw-catalog [data-catalog-compact="touch"] .mw-composer[data-rest]')}
  .mw-catalog [data-catalog-compact="touch"] .mw-composer__foot :is(.mw-btn--icon, .mw-btn--icon-only) { width: 44px; min-width: 44px; min-height: 44px; }
`;

const ghostIcon = (label: string, name: Parameters<typeof icon>[0], attrs: Record<string, string | boolean> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, attrs: { title: label, ...attrs } });

/**
 * The ▾ menu as K2's client draws it (`renderComposerDeliveryMenu`): the three ways a message reaches a running AI (GLOSSARY: 补充,
 * 打断并改向, 下一轮再做), each with what choosing it does. `interruptRefused` is why the receiver cannot take an interruption: the item
 * stays, cannot be chosen and says why. The board draws it three times, so each copy names its items (`<scope>-delivery-<mode>`).
 */
function deliveryMenu(say: Say, add: string, scope: string, interruptRefused?: string): string {
  const yes = { available: true } as const;
  return renderComposerDeliveryMenu(scope, composerLabelsIn(say, say("workbench.common.assistant"), add), { "next-boundary": yes, interrupt: interruptRefused ? { available: false, reason: interruptRefused } : yes, "after-run": yes }, true);
}

/** Every text is already in the page's language. */
interface ShellOptions {
  readonly state?: "sending" | "running" | "failed" | "unknown" | "disabled";
  readonly text?: string;
  readonly placeholder?: string;
  readonly to?: string;
  readonly restored?: boolean;
  readonly files?: string;
  readonly status?: MwComposerStatus;
  readonly focus?: boolean;
  /** The board opens this one's ▾ menu; keep room above it so the menu stays inside the specimen. */
  readonly menuRoom?: boolean;
}

/**
 * The words of the shell, in the board's language. `add` is the running send's name (补充, English Add), read by its stable key
 * (`workbench.composer.next-boundary`) where the board has the platform's words: by its Chinese alone it would meet the receipts'
 * 补充 (an input's kind, English Supplement).
 */
const composerLabelsIn = (say: Say, to: string, add: string): MwComposerAiLabels => ({
  input: say("workbench.catalog-composer.message-to-who", { who: to }), send: say("workbench.assistant-dock.send"), sendTitle: say("workbench.catalog-composer.send"), add: say("workbench.catalog-composer.add-files-and-materials"), more: say("workbench.context-toolbar.more"),
  files: say("workbench.catalog-composer.files-and-images"), filesHint: say("workbench.catalog-composer.pick-from-this-computer-or-drag-them"), dropRefused: say("workbench.catalog-composer.only-files-can-be-dropped-here"), commands: say("workbench.pane.command"),
  searching: say("workbench.catalog-composer.searching"), nothing: say("workbench.agent-question-card.no-matches"), unavailable: say("workbench.catalog-composer.name-cannot-be-used-right-now"), reading: say("workbench.assistant-context-strip.reading"), remove: say("workbench.catalog-composer.remove-name"), retryFile: say("workbench.catalog-composer.retry-name"),
  blocked: say("workbench.catalog-composer.remove-the-item-that-cannot-be-attached-then"), restored: say("workbench.catalog-composer.restored-your-unsent-draft-time"), clear: say("workbench.catalog-composer.clear-draft"), unsaved: say("workbench.catalog-composer.the-draft-could-not-be-saved-on-this"),
  enterHint: say("workbench.catalog-composer.return-now-starts-a-new-line-to-send"), enterHintDismiss: say("workbench.assistant-notice.dismiss"), notice: say("workbench.catalog-composer.note"), sending: say("workbench.catalog-composer.sending-2"), sendingText: say("workbench.catalog-composer.sending"),
  failed: say("workbench.catalog-composer.not-sent"), retry: say("common.control.retry"), unknown: say("workbench.catalog-composer.pending-confirmation"), unknownText: say("workbench.catalog-composer.could-not-confirm-it-arrived-don-t-send"), check: say("workbench.catalog-composer.check"),
  notSent: say("workbench.catalog-composer.checked-it-did-not-arrive-your-text-is"),
  to: say("workbench.catalog-composer.send-to"), stop: say("workbench.attention.stop"), stopTitle: say("workbench.catalog-composer.stop-this-turn"), delivery: say("workbench.catalog-composer.choose-how-it-is-delivered"), deliveryGroup: say("workbench.catalog-composer.how-it-is-delivered"),
  modes: {
    "next-boundary": { name: add, title: say("workbench.catalog-composer.add"), description: say("workbench.catalog-composer.read-once-the-current-reply-or-tool") },
    interrupt: { name: say("workbench.catalog-composer.interrupt-and-redirect"), title: say("workbench.catalog-composer.interrupt-and-redirect"), description: say("workbench.catalog-composer.drops-the-reply-in-progress-and-follows-this") },
    "after-run": { name: say("workbench.catalog-composer.do-it-next-turn"), title: say("workbench.catalog-composer.do-it-next-turn-2"), description: say("workbench.catalog-composer.waits-for-the-start-of-the-next") },
  },
  unsupported: say("workbench.catalog-composer.this-receiver-does-not-take-this-kind-of"), running: say("workbench.settings-plugins.running"), runningText: say("workbench.catalog-composer.working-on-this-turn-a-new-message"),
  queued: say("workbench.catalog-composer.this-turn-had-just-ended-it-waits-for"), replayed: say("workbench.catalog-composer.this-was-already-sent-it-was-not-sent"),
});

/**
 * One composer as a page draws it: the SDK's first screen (`renderComposer`, the same function plugins call), with what K2's
 * client puts in as it happens (the attachment strip and the restored-draft line at the top of the box, the ▾ menu's items).
 */
function shell(say: Say, add: string, options: ShellOptions): string {
  const { state } = options;
  const to = options.to ?? say("workbench.common.assistant");
  const drawn = renderComposer({
    kind: "ai", labels: composerLabelsIn(say, to, add),
    receiver: { label: to, ...(options.to ? { resetLabel: say("workbench.catalog-composer.send-to-the-assistant-instead") } : {}) },
    placeholder: options.placeholder ?? say("workbench.catalog-composer.ask-the-assistant"),
    // The board shows the microphone's place; a product page draws it only once it takes voice (user 11-08).
    voice: say("workbench.catalog-composer.voice-input-not-connected-yet"),
    ...(options.text ? { text: options.text } : {}),
    ...(state === "disabled" && options.status ? { disabled: { caption: options.status.caption, reason: options.status.text } } : {}),
    ...(state && state !== "disabled" ? { state } : {}),
    ...(state !== "disabled" && options.status ? { status: options.status } : {}),
    attrs: { "data-catalog-focus": options.focus, "data-catalog-menu-room": options.menuRoom },
  });
  const restored = options.restored
    ? `<p class="mw-field__hint mw-composer__restore">${escapeHtml(say("workbench.catalog-composer.restored-your-unsent-draft-11-02-am"))} · ${renderButton({ label: say("workbench.catalog-composer.clear-draft"), variant: "link" })}</p>` : "";
  const menu = deliveryMenu(say, add, "catalog-composer-running");
  return drawn
    .replace('<div class="mw-composer__box">', (box) => `${box}${options.files ?? ""}${restored}`)
    // The ▾'s menu, not ＋'s (both are empty in the first screen).
    .replace(/(data-compose-menu-toggle[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>)<div class="mw-compose__menu" data-compose-menu hidden><\/div>/, (_, toggle: string) => `${toggle}<div class="mw-compose__menu" data-compose-menu hidden>${menu}</div>`);
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

export function composerSection(say: Say, add = say("workbench.composer.next-boundary")): string {
  const task = say("workbench.catalog-composer.add-the-tests-for-step-3");
  // A request well past the field's cap (about twice its 240px in either language), so the box plainly scrolls inside.
  const long = [
    say("workbench.catalog-composer.add-the-tests-for-step-3-the-sign"),
    say("workbench.catalog-composer.also-check-whether-coding-s-session-draft-comes"),
    say("workbench.catalog-composer.check-again-that-the-button-really-locks-while"),
    say("workbench.catalog-composer.for-attachments-a-file-over-the-limit-says"),
    say("workbench.catalog-composer.check-narrow-screens-too-at-390-wide-the"),
    say("workbench.catalog-composer.while-a-chinese-input-method-is-choosing-a"),
    say("workbench.catalog-composer.switch-to-another-session-and-back-and-the"),
    say("workbench.catalog-composer.finally-list-the-files-this-turn-changed-largest"),
    say("workbench.catalog-composer.if-anything-along-the-way-needs-my-decision"),
  ].join("\n\n");
  return section("composer", escapeHtml(say("workbench.catalog-composer.composer")), `<p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-composer.the-home-bar-s-one-line-capsule-grown"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-composer.empty")), shell(say, add, {}))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.at-rest-one-row-on-a-phone")), `<div data-catalog-compact="touch">${shell(say, add, {})}<p class="mw-catalog__note">${escapeHtml(say("workbench.catalog-composer.with-nothing-written-attached-or-reported-a-phone"))}</p></div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-composer.at-rest-one-row-in-a-short-window")), `<div data-catalog-compact>${shell(say, add, {})}<p class="mw-catalog__note">${escapeHtml(say("workbench.catalog-composer.a-short-window-560px-tall-or-less-with"))}</p></div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-composer.plain-editor-layer-only")), renderComposer({ kind: "plain", labels: { ...composerLabelsIn(say, say("workbench.common.assistant"), add), input: say("workbench.catalog-composer.comment") }, placeholder: say("workbench.catalog-composer.write-a-comment"), add: false }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.focus")), shell(say, add, { focus: true, text: task }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.draft-restored-line")), shell(say, add, { restored: true, text: say("workbench.catalog-composer.add-the-tests-for-step-3-then-look") }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.attachments-grown-to-the-cap-scrolls-inside")), shell(say, add, { to: say("workbench.catalog-composer.coding-sign-up-endpoint"), files: files(say), text: long }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.working-sending")), shell(say, add, { state: "sending", text: task, status: { caption: say("workbench.catalog-composer.sending-2"), text: say("workbench.catalog-composer.sending") } }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.working-running-delivery-menu")), shell(say, add, { state: "running", menuRoom: true, text: say("workbench.catalog-composer.attach-the-failure-screenshots-too"), status: { caption: say("workbench.settings-plugins.running"), text: say("workbench.catalog-composer.working-on-this-turn-a-new-message") } }))}
    ${specimen(escapeHtml(say("common.generated.failed")), shell(say, add, { state: "failed", text: task, status: { caption: say("common.generated.failed"), text: say("workbench.catalog-composer.not-sent-the-connection-was-reset-your"), action: say("common.control.retry") } }))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.pending-confirmation")), shell(say, add, { state: "unknown", text: task, status: { caption: say("workbench.catalog-composer.pending-confirmation"), text: say("workbench.catalog-composer.could-not-confirm-it-arrived-checking-now-don"), action: say("workbench.settings-sync-history.details") } }))}
    ${specimen(escapeHtml(say("workbench.context-bar.unavailable")), shell(say, add, { state: "disabled", placeholder: say("workbench.catalog-composer.this-session-has-ended"), status: { caption: say("workbench.context-bar.unavailable"), text: say("workbench.catalog-composer.the-session-has-ended-and-takes-no") } }))}
  </div>`);
}

export function menuDescSection(say: Say, delivery = say("workbench.composer.next-boundary")): string {
  const add = renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-composer.project-materials"), iconName: "book", description: say("workbench.catalog-composer.pick-from-the-materials-this-project-already") })
    + renderMenuItem({ label: say("workbench.catalog-composer.files-and-images"), iconName: "paperclip", description: say("workbench.catalog-composer.pick-from-this-computer-or-drag-them") })
    + renderMenuItem({ label: say("workbench.catalog-composer.todo-to-dos"), iconName: "package", description: say("workbench.catalog-composer.no-to-dos-to-pick-none-created"), disabled: true }) }) });
  return section("menu-desc", escapeHtml(say("workbench.catalog-composer.menu-description")), `<p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-composer.a-quiet-line-under-a-menu-item"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-composer.with-shortcuts-delivery")), deliveryMenu(say, delivery, "catalog-menu-desc"))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.cannot-be-chosen-with-the-reason")), deliveryMenu(say, delivery, "catalog-menu-desc-refused", say("workbench.catalog-composer.this-receiver-cannot-be-interrupted-it-always")))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.without-shortcuts-add")), add)}
    ${specimen(escapeHtml(say("workbench.catalog-composer.long-description-without-punctuation-wraps-inside")), renderMenu({ items: renderMenuGroup({ items: renderMenuItem({ label: say("workbench.catalog-composer.join-the-previous-message"), iconName: "message", description: say("workbench.catalog-composer.appends-this-to-your-previous-unread-message") }) }) }))}
  </div>`);
}

export function micSection(say: Say): string {
  const glyph = (size: 16 | 20) => `<span class="mw-catalog-mic" style="--mic-size: ${size}px">${icon("mic")}<span>${size}px</span></span>`;
  const voice = say("workbench.catalog-composer.voice-input-not-connected-yet");
  return section("mic", escapeHtml(say("workbench.catalog-composer.mic")), `<p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-composer.holds-the-place-only-voice-input-is-not"))}</p><div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-composer.two-sizes")), glyph(16) + glyph(20))}
    ${specimen(escapeHtml(say("workbench.catalog-composer.in-a-button-normal-and-unavailable")), ghostIcon(say("workbench.catalog-composer.voice-input"), "mic") + ghostIcon(voice, "mic", { disabled: true }) + renderButton({ label: say("workbench.catalog-composer.voice-input"), variant: "secondary", icon: "mic" }))}
  </div>`);
}
