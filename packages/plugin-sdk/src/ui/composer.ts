import { renderButton } from "./button.js";
import { renderStatusMark, type MwStatusTone } from "./feedback.js";
import { type AttrValue, escapeHtml, renderAttrs } from "./html.js";
import { icon } from "./icon.js";
import type { StateRingState } from "./state-ring-states.js";

/**
 * The unified input's first screen (specs/unified-input-voice/implementation-plan.md §3.1, slice K0c, UIC-13): the composer's
 * shell as a string, drawn in the page's first HTML so nothing jumps when the page's composer client (`molisComposer`, K2)
 * takes it over. The structure and class names are the board's `#composer` specimen (§3.6, "K1 定下的类名与结构"); the board
 * draws its specimens with this function, so the two cannot drift.
 *
 * Until K2 the shell's rules are the board's own (`COMPOSER_BOARD_STYLES` in the design system), not in the page sheets the
 * host serves: a page that draws this before K2 gets unstyled markup. K2 moves them into the page sheets.
 *
 * What it does not draw is the client's: the attachment strip, the restored-draft line and the ▾ menu's items are put in by
 * the client as they happen (the ▾ menu's container is here, empty and hidden). Every word is the caller's, already in the
 * page's language; every word and the text are escaped here.
 */

/** The status line: a mark and its caption, the words, and at most one action. The mount page gives the words (§3.6). */
export interface MwComposerStatus {
  caption: string;
  text: string;
  /** A link-style button after the words ("重试", "查看"). */
  action?: string;
  /** Default: the state's own (sending and running in progress, failed blocked, unknown attention, unavailable on hold). */
  tone?: MwStatusTone;
  ring?: StateRingState;
}

/** The words on the editor layer's controls, both kinds. */
export interface MwComposerLabels {
  /** The text area's accessible name: "发给 助理 的话", "评论". */
  input: string;
  /** The send button's name, and its tooltip with the key: "发送", "发送（⌘↵）". */
  send: string;
  sendTitle: string;
  /** The ＋ button: "添加文件与资料". */
  add: string;
  /** The microphone's name, which says why it cannot be used yet: "语音输入（还没有接上）" (voice is batch 53). */
  voice: string;
}

/** The AI layer's words besides (`kind: "ai"`): the receiver row and, while a turn runs, stop and the delivery split button. */
export interface MwComposerAiLabels extends MwComposerLabels {
  /** Before the receiver's name: "发给：". */
  to: string;
  stop: string;
  /** The running send ("补充") and its tooltip with the key ("补充（⌘↵）"). */
  supplement: string;
  supplementTitle: string;
  /** The ▾ that opens the delivery menu ("选择送达方式"), and the group's name ("送达方式"). */
  delivery: string;
  deliveryGroup: string;
}

/**
 * `kind: "plain"` is the editor layer only; `"ai"` adds the receiver row and, while running, stop and the delivery split
 * button (§3.1). `state` is `.mw-composer[data-state]`; `disabled` takes its place and writes its reason in the status line,
 * so an unavailable composer always says why. `attrs` go on the root (the mount page's id or hooks).
 */
export type MwComposerOptions = {
  placeholder?: string;
  /** The text already written (a draft the page holds when it draws). */
  text?: string;
  status?: MwComposerStatus;
  disabled?: { caption: string; reason: string };
  attrs?: Record<string, AttrValue>;
} & (
  | { kind: "plain"; labels: MwComposerLabels; state?: "sending" | "failed" | "unknown" }
  | { kind: "ai"; labels: MwComposerAiLabels; receiver: { label: string; resetLabel?: string }; state?: "sending" | "running" | "failed" | "unknown" }
);

type ShellState = "sending" | "running" | "failed" | "unknown" | "disabled";

const STATE_LOOK: Record<ShellState, { tone: MwStatusTone; ring: StateRingState }> = {
  sending: { tone: "progress", ring: "starting" },
  running: { tone: "progress", ring: "running" },
  failed: { tone: "blocked", ring: "failed" },
  unknown: { tone: "attention", ring: "verify" },
  disabled: { tone: "hold", ring: "unavailable" },
};

const ghostIcon = (label: string, name: "plus" | "mic", disabled: boolean, attrs: Record<string, AttrValue> = {}) =>
  renderButton({ label, variant: "ghost", size: "icon", icon: name, iconOnly: true, disabled, attrs: { title: label, ...attrs } });

function receiverRow(labels: MwComposerAiLabels, receiver: { label: string; resetLabel?: string }): string {
  const reset = receiver.resetLabel
    ? `<button type="button" data-tag-remove aria-label="${escapeHtml(receiver.resetLabel)}" title="${escapeHtml(receiver.resetLabel)}">${icon("x")}</button>`
    : "";
  return `<div class="mw-composer__to"><span>${escapeHtml(labels.to)}</span><span class="mw-tag"><span>${escapeHtml(receiver.label)}</span>${reset}</span></div>`;
}

function statusRow(status: MwComposerStatus | undefined, state: ShellState | undefined): string {
  if (!status) return "";
  const look = state ? STATE_LOOK[state] : undefined;
  const ring = status.ring ?? look?.ring;
  return `<div class="mw-composer__status" role="status">${renderStatusMark({ label: status.caption, tone: status.tone ?? look?.tone ?? "quiet", ...(ring ? { state: ring } : {}) })}<span>${escapeHtml(status.text)}</span>${
    status.action ? renderButton({ label: status.action, variant: "link" }) : ""}</div>`;
}

/** Send, or while a turn runs the split button: 补充 and the ▾ whose menu the client fills when it opens. */
function sendControl(options: MwComposerOptions, state: ShellState | undefined, empty: boolean): string {
  if (options.kind === "ai" && state === "running") {
    const { labels } = options;
    const toggle = renderButton({
      label: labels.delivery, variant: "primary", size: "icon", icon: "chevron-down", iconOnly: true,
      attrs: { title: labels.delivery, "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" },
    });
    return `<div class="mw-btn-group" role="group" aria-label="${escapeHtml(labels.deliveryGroup)}">${
      renderButton({ label: labels.supplement, variant: "primary", size: "sm", disabled: empty, attrs: { title: labels.supplementTitle } })
    }<div class="mw-compose__anchor">${toggle}<div class="mw-compose__menu" data-compose-menu hidden></div></div></div>`;
  }
  const busy = state === "sending" || state === "unknown" || state === "disabled";
  return renderButton({ label: options.labels.send, variant: "primary", size: "icon", icon: "send", iconOnly: true, loading: state === "sending", disabled: empty || busy, attrs: { title: options.labels.sendTitle } });
}

/** The composer's first screen: who it goes to (AI only), the text, the status and the bottom bar. */
export function renderComposer(options: MwComposerOptions): string {
  const state: ShellState | undefined = options.disabled ? "disabled" : options.state;
  const disabled = state === "disabled";
  const status = options.disabled ? { caption: options.disabled.caption, text: options.disabled.reason } : options.status;
  const add = `<div class="mw-compose__anchor">${ghostIcon(options.labels.add, "plus", disabled, { "aria-haspopup": "menu", "aria-expanded": "false" })}</div>`;
  // The microphone holds its place before stop and send; voice input is not connected yet, so it is never available.
  const mic = ghostIcon(options.labels.voice, "mic", true);
  const stop = options.kind === "ai" && state === "running" ? renderButton({ label: options.labels.stop, variant: "danger-outline", size: "sm" }) : "";
  const textarea = `<textarea class="mw-composer__input" data-fit rows="1" aria-label="${escapeHtml(options.labels.input)}"${
    options.placeholder ? ` placeholder="${escapeHtml(options.placeholder)}"` : ""}${disabled ? " disabled" : ""}>${escapeHtml(options.text ?? "")}</textarea>`;
  return `<div class="mw-composer" data-slot="composer"${state ? ` data-state="${state}"` : ""}${renderAttrs(options.attrs)}>${
    options.kind === "ai" ? receiverRow(options.labels, options.receiver) : ""
  }<div class="mw-composer__box"><div class="mw-composer__text">${textarea}</div>${statusRow(status, state)}<div class="mw-composer__foot"><div class="mw-composer__start">${add}</div><div class="mw-composer__end">${mic}${stop}${sendControl(options, state, !options.text)}</div></div></div></div>`;
}
