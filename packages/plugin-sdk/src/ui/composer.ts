import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { ComposerControl } from "../page-globals.js";
import { renderButton } from "./button.js";
import { renderStatusMark, type MwStatusTone } from "./feedback.js";
import { renderSelect } from "./field.js";
import { type AttrValue, escapeHtml, renderAttrs } from "./html.js";
import { icon } from "./icon.js";
import type { StateRingState } from "./state-ring-states.js";

/**
 * The unified input's first screen (specs/unified-input-voice/implementation-plan.md §3.1, slice K0c, UIC-13): the composer's
 * shell as a string, drawn in the page's first HTML so nothing jumps when the page's composer client (`molisComposer`, K2)
 * takes it over. The structure and class names are the board's `#composer` specimen (§3.6, "K1 定下的类名与结构"); the board
 * draws its specimens with this function, and the client draws its changes with it too, so none of the three can drift.
 *
 * What it does not draw is the client's: the attachment strip, the restored-draft line and the ▾ menu's items are put in by
 * the client as they happen (the ▾ menu's container is here, empty and hidden). Every word is the caller's, already in the
 * page's language; every word and the text are escaped here.
 */

/** The status line: a mark and its caption, the words, and at most one action. */
export interface MwComposerStatus {
  caption: string;
  text: string;
  /** A link-style button after the words ("重试", "查看"). */
  action?: string;
  /** Its hook (`data-composer-status-action="<actionId>"`), so the page or the client knows which action was pressed. */
  actionId?: string;
  /** Default: the state's own (sending and running in progress, failed blocked, unknown attention, unavailable on hold). */
  tone?: MwStatusTone;
  ring?: StateRingState;
}

/**
 * The editor layer's words, both kinds: one set for the first screen and the client (`molisComposer` takes the same object), so
 * a page writes them once. `{name}` and the like are filled by whoever draws them (`fillMessage`). The first screen draws the
 * first five; the rest are what the client says as things happen.
 */
export interface MwComposerLabels {
  /** The text area's accessible name: "发给 助理 的话", "评论". */
  input: string;
  /** The send button's name, and its tooltip with the key: "发送", "发送（⌘↵）". */
  send: string;
  sendTitle: string;
  /** The ＋ button: "添加文件与资料". */
  add: string;
  /** Scene controls folded away on a narrow box: "更多". */
  more: string;
  /** The ＋ menu: files from this machine, and its line ("文件与图片", "从这台电脑选，或直接拖进输入框"); a drag it does not take ("这里只收文件"). */
  files: string;
  filesHint: string;
  dropRefused: string;
  /** The page's own `/` commands' group: "命令". */
  commands: string;
  /** A source being searched, one that found nothing, one that cannot be used now ("{name} 现在用不了"). */
  searching: string;
  nothing: string;
  unavailable: string;
  /** An attachment strip row: "{name} 读取中", "移除 {name}". */
  reading: string;
  remove: string;
  /** Send stops while a row of the strip cannot go: "移除附不上的那一项再发". */
  blocked: string;
  /** The restored draft's line ("已恢复上次没发出的草稿 · {time}") and its button ("清空草稿"). */
  restored: string;
  clear: string;
  /** The draft could not be kept on this machine: "草稿没能保存在本机；字还在，照常能发". */
  unsaved: string;
  /** Said once, after Enter at the end of a line: "回车已改为换行。要发送请按 {keys}", and "知道了". */
  enterHint: string;
  enterHintDismiss: string;
  /** The status line's captions and words for what the client itself does. */
  notice: string;
  sending: string;
  sendingText: string;
  failed: string;
  retry: string;
  unknown: string;
  unknownText: string;
  check: string;
  notSent: string;
}

/** The words of one delivery (`AgentSteerMode`, keyed by mode, never by its words): GLOSSARY's 补充, 打断并改向, 下一轮再做. */
export interface MwComposerDeliveryWords {
  name: string;
  /** The name with its key, if it has one ("补充（⌘↵）"). */
  title: string;
  /** What choosing it does, under its name in the ▾ menu. */
  description: string;
}

/** The AI layer's words besides (`kind: "ai"`): the receiver row and, while a turn runs, stop and the delivery split button. */
export interface MwComposerAiLabels extends MwComposerLabels {
  /** Before the receiver's name: "发给：". */
  to: string;
  /** Stop and its tooltip ("停止", "停止这一轮"). */
  stop: string;
  stopTitle: string;
  /** The ▾ that opens the delivery menu ("选择送达方式"), and the group's name ("送达方式"). */
  delivery: string;
  deliveryGroup: string;
  /** The running send is `modes["next-boundary"]`; a mode the receiver does not say it takes is `unsupported`. */
  modes: Readonly<Record<AgentSteerMode, MwComposerDeliveryWords>>;
  unsupported: string;
  /** While a turn runs: "运行中", "正在做这一轮 · 再发会作为补充". */
  running: string;
  runningText: string;
  /** What the receipt says of the send: it waits for the next turn ("这一轮刚结束，留到下一轮"), or it had gone already. */
  queued: string;
  replayed: string;
}

/**
 * `kind: "plain"` is the editor layer only; `"ai"` adds the receiver row (when there is a receiver) and, while running, stop
 * and the delivery split button (§3.1). `state` is `.mw-composer[data-state]`; `disabled` takes its place and writes its
 * reason in the status line, so an unavailable composer always says why. `attrs` go on the root (the mount page's id or hooks).
 */
export type MwComposerOptions = {
  placeholder?: string;
  /** The text already written (a draft the page holds when it draws). */
  text?: string;
  status?: MwComposerStatus;
  disabled?: { caption: string; reason: string };
  /** False when the page has nothing for ＋ (no attachments, sources or commands): the button is not drawn. */
  add?: boolean;
  /** Scene controls, the same ones the client is given, drawn in the bottom bar from the first paint. */
  controls?: readonly ComposerControl[];
  /** The microphone's name, given only by a page that takes voice (batch 53): without it nothing is drawn in its place. */
  voice?: string;
  attrs?: Record<string, AttrValue>;
} & (
  | { kind: "plain"; labels: MwComposerLabels; state?: "sending" | "failed" | "unknown" }
  | { kind: "ai"; labels: MwComposerAiLabels; receiver?: { label: string; resetLabel?: string }; state?: "sending" | "running" | "failed" | "unknown" }
);

type ShellState = "sending" | "running" | "failed" | "unknown" | "disabled";

const STATE_LOOK: Record<ShellState, { tone: MwStatusTone; ring: StateRingState }> = {
  sending: { tone: "progress", ring: "starting" },
  running: { tone: "progress", ring: "running" },
  failed: { tone: "blocked", ring: "failed" },
  unknown: { tone: "attention", ring: "verify" },
  disabled: { tone: "hold", ring: "unavailable" },
};

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
    status.action ? renderButton({ label: status.action, variant: "link", attrs: { "data-composer-status-action": status.actionId ?? "" } }) : ""}</div>`;
}

/** A scene control, drawn with the board's own: a small select, a pressed-or-not button, or a plain one. */
function control(item: ComposerControl, disabled: boolean): string {
  const hook = { "data-composer-control": item.id };
  if (item.kind === "select") {
    const options = item.options.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === item.value ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
    return renderSelect({ disabled, optionsHtml: options, attrs: { ...hook, "aria-label": item.label, title: item.label } });
  }
  return renderButton({ label: item.label, variant: "ghost", size: "sm", disabled, attrs: { ...hook, ...(item.kind === "toggle" ? { "aria-pressed": item.on ? "true" : "false" } : {}) } });
}

/** ＋ first, then the controls; on a narrow box they fold behind "更多" (the client opens it; the rules are the page sheets'). */
function startGroup(options: MwComposerOptions, disabled: boolean): string {
  const add = options.add === false ? "" : `<div class="mw-compose__anchor">${renderButton({
    label: options.labels.add, variant: "ghost", size: "icon", icon: "plus", iconOnly: true, disabled,
    attrs: { title: options.labels.add, "data-composer-add": "", "aria-haspopup": "menu", "aria-expanded": "false" } })}<div class="mw-compose__menu" data-compose-menu hidden></div></div>`;
  const controls = options.controls?.length ? `<div class="mw-composer__more">${renderButton({
    label: options.labels.more, variant: "ghost", size: "icon", icon: "more", iconOnly: true, disabled,
    attrs: { title: options.labels.more, "data-composer-more": "", "aria-expanded": "false" } })}</div><div class="mw-composer__controls" data-composer-controls>${
    options.controls.map((item) => control(item, disabled)).join("")}</div>` : "";
  return `<div class="mw-composer__start">${add}${controls}</div>`;
}

/** Send, or while a turn runs the split button: 补充 and the ▾ whose menu the client fills when it opens. */
function sendControl(options: MwComposerOptions, state: ShellState | undefined, empty: boolean): string {
  if (options.kind === "ai" && state === "running") {
    const { labels } = options;
    const toggle = renderButton({
      label: labels.delivery, variant: "primary", size: "icon", icon: "chevron-down", iconOnly: true,
      attrs: { title: labels.delivery, "data-compose-menu-toggle": "", "aria-expanded": "false", "aria-haspopup": "menu" },
    });
    const supplement = labels.modes["next-boundary"];
    return `<div class="mw-btn-group" role="group" aria-label="${escapeHtml(labels.deliveryGroup)}">${
      renderButton({ label: supplement.name, variant: "primary", size: "sm", disabled: empty, attrs: { title: supplement.title, "data-composer-send": "" } })
    }<div class="mw-compose__anchor">${toggle}<div class="mw-compose__menu" data-compose-menu hidden></div></div></div>`;
  }
  const busy = state === "sending" || state === "unknown" || state === "disabled";
  return renderButton({ label: options.labels.send, variant: "primary", size: "icon", icon: "send", iconOnly: true, loading: state === "sending", disabled: empty || busy, attrs: { title: options.labels.sendTitle, "data-composer-send": "" } });
}

/**
 * Stop and send at the end. The microphone's place is first, before them: a page that takes voice gives its name and it is drawn
 * there, `aria-disabled` (so it keeps its focus stop and tooltip) until voice input is connected; without it nothing is drawn.
 */
function endGroup(options: MwComposerOptions, state: ShellState | undefined): string {
  const mic = options.voice ? renderButton({ label: options.voice, variant: "ghost", size: "icon", icon: "mic", iconOnly: true,
    attrs: { title: options.voice, "aria-disabled": "true", "data-composer-voice": "" } }) : "";
  const stop = options.kind === "ai" && state === "running"
    ? renderButton({ label: options.labels.stop, variant: "danger-outline", size: "sm", attrs: { title: options.labels.stopTitle, "data-composer-stop": "" } }) : "";
  return `<div class="mw-composer__end">${mic}${stop}${sendControl(options, state, !options.text?.trim())}</div>`;
}

/** The composer's first screen: who it goes to (AI only), the text, the status and the bottom bar. */
export function renderComposer(options: MwComposerOptions): string {
  const state: ShellState | undefined = options.disabled ? "disabled" : options.state;
  const disabled = state === "disabled";
  const status = options.disabled ? { caption: options.disabled.caption, text: options.disabled.reason } : options.status;
  const textarea = `<textarea class="mw-composer__input" data-fit rows="1" aria-label="${escapeHtml(options.labels.input)}"${
    options.placeholder ? ` placeholder="${escapeHtml(options.placeholder)}"` : ""}${disabled ? " disabled" : ""}>${escapeHtml(options.text ?? "")}</textarea>`;
  return `<div class="mw-composer" data-slot="composer"${state ? ` data-state="${state}"` : ""}${renderAttrs(options.attrs)}>${
    options.kind === "ai" && options.receiver ? receiverRow(options.labels, options.receiver) : ""
  }<div class="mw-composer__box"><div class="mw-composer__text">${textarea}</div>${statusRow(status, state)}<div class="mw-composer__foot">${startGroup(options, disabled)}${endGroup(options, state)}</div></div></div>`;
}
