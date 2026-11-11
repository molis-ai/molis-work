import type { ComposerControl, ComposerHandle, ComposerOptions, ComposerOutcome } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { PLUGIN_ICON_NAMES, type MwComposerAiLabels, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { BarReceiver, BridgedOutcome, ComposerCalls, ComposerDown, ComposerOp, ComposerSnapshot, ComposerUp } from "./composer-bridge.js";
import type { FramePack, FrameScope } from "./types.js";

/* ─── The bar's receivers: one per framed page that gave an AI composer; the one in front takes the bar's input ─── */

const receivers = new Set<BarReceiver>();
let scheduled = 0, watching: MutationObserver | null = null;

/** Told once per frame, so a burst of changes (a tab switch hides one page and shows another) moves the bar once. */
function changed(): void {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => { scheduled = 0; globalThis.molisBarReceiverChanged?.(); globalThis.molisWorkBarPlace?.(); });
}

/** The page shown in the focused pane, if it takes words now (it names who they go to); else none, and the bar is the Assistant's. */
function front(): BarReceiver | null {
  const pane = document.querySelector<HTMLElement>(".tab-workspace-panes > [data-tab-pane].is-focused:not([hidden])");
  let found: BarReceiver | null = null;
  for (const receiver of receivers) if (receiver.root.isConnected && (!pane || pane.contains(receiver.root)) && receiver.visible() && receiver.options.kind === "ai" && receiver.options.receiver?.()) found = receiver;
  return found;
}

/** Which pane is focused changes on the panes themselves: watched while any page takes words. */
function watch(): void {
  const panes = document.querySelector(".tab-workspace-panes");
  if (receivers.size && panes && !watching) {
    watching = new MutationObserver(changed);
    watching.observe(panes, { attributes: true, subtree: true, attributeFilter: ["class", "hidden"] });
  } else if (!receivers.size && watching) { watching.disconnect(); watching = null; }
}

globalThis.molisBarReceivers = { front };

/** The bar takes a page's AI composer only for a page shown under it: not a side view, a directory, or a pane of its own document. */
export const barTakes = (side: boolean, slot: string | undefined): boolean =>
  typeof globalThis.molisBarReceiverChanged === "function" && !document.body.hasAttribute("data-pane-embedded") && !side && slot !== "workbench.directory";

/* ─── One framed page's receiver ─── */

const ICONS = new Set<string>(PLUGIN_ICON_NAMES);
const short = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : "";

/**
 * What the page says of itself is drawn by the bar's composer, which escapes every word; here it is only bounded and shaped, and
 * the page's object is always the frame's own plugin's (a page cannot name another owner's object for a source's `near`).
 */
function bounded(snapshot: ComposerSnapshot): ComposerSnapshot | null {
  try { if (JSON.stringify(snapshot).length > 256 * 1024) return null; } catch { return null; }
  if (!snapshot || typeof snapshot.entry !== "string" || !snapshot.labels || typeof snapshot.labels !== "object") return null;
  const icon = (value: unknown) => typeof value === "string" && ICONS.has(value) ? { icon: value as PluginIconName } : {};
  return {
    ...snapshot,
    labels: words(snapshot.labels),
    placeholder: short(snapshot.placeholder, 400),
    receiver: snapshot.receiver ? { label: short(snapshot.receiver.label, 200), ...icon(snapshot.receiver.icon), ...(typeof snapshot.receiver.detail === "string" ? { detail: short(snapshot.receiver.detail, 100) } : {}),
      ...(Array.isArray(snapshot.receiver.others) ? { others: snapshot.receiver.others.slice(0, 20).filter(one => one && typeof one.id === "string" && one.id.length <= 200)
        .map(one => ({ id: one.id, label: short(one.label, 200), ...(typeof one.detail === "string" ? { detail: short(one.detail, 100) } : {}) })) } : {}) } : null,
    controls: Array.isArray(snapshot.controls) ? snapshot.controls.slice(0, 12) : [],
    commands: Array.isArray(snapshot.commands) ? snapshot.commands.slice(0, 200).map(command => ({ ...command, ...icon(command.icon) })) : [],
    column: snapshot.column && Number.isFinite(snapshot.column.left) && Number.isFinite(snapshot.column.width) && snapshot.column.width > 0 ? { left: snapshot.column.left, width: snapshot.column.width } : null,
    near: snapshot.near && typeof snapshot.near.kind === "string" && typeof snapshot.near.id === "string" ? { kind: snapshot.near.kind, id: snapshot.near.id } : null,
    required: snapshot.required === null ? null : short(snapshot.required, 400),
    hold: snapshot.hold === null ? null : short(snapshot.hold, 400),
    running: snapshot.running === true,
  };
}

/** Only words: a string each (a mode's three words too); anything else is left out, and the bar puts its own in its place. */
function words(labels: unknown): ComposerSnapshot["labels"] {
  const kept: Record<string, unknown> = {};
  if (!labels || typeof labels !== "object") return kept as ComposerSnapshot["labels"];
  for (const [key, value] of Object.entries(labels)) {
    if (typeof value === "string") kept[key] = value.slice(0, 400);
    else if (key === "modes" && value && typeof value === "object") {
      const modes: Record<string, unknown> = {};
      for (const mode of ["next-boundary", "interrupt", "after-run"]) {
        const one = (value as Record<string, { name?: unknown; title?: unknown; description?: unknown }>)[mode];
        if (one && [one.name, one.title, one.description].every(part => typeof part === "string")) modes[mode] = { name: short(one.name, 100), title: short(one.title, 200), description: short(one.description, 400) };
      }
      kept.modes = modes;
    }
  }
  return kept as ComposerSnapshot["labels"];
}

/** The parts that decide what the composer is mounted with; a change mounts it anew rather than refreshing. */
const shape = (snapshot: ComposerSnapshot) => JSON.stringify([snapshot.entry, snapshot.labels, snapshot.stop, snapshot.mentions, snapshot.attachments, snapshot.sources, snapshot.voice, snapshot.submitKeys, snapshot.draft]);

/**
 * The parent's side of the one input (composer-bridge.ts): the page's state becomes a receiver whose options the bar's composer
 * reads as any page's, each function a call to the page answered through the port. Only the receiver in front is bound to the bar.
 */
export function pageComposer(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement, pack: FramePack, visible: () => boolean) {
  let id = 0, snapshot: ComposerSnapshot | null = null, receiver: BarReceiver | null = null, bound: ComposerHandle | null = null, field: HTMLTextAreaElement | null = null;
  let sequence = 0, shown = "", text = "", generation = 0;
  const answers = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const post = (message: ComposerDown) => port.postMessage(message);
  // The bar's text, as the page last heard it; sent again after anything that may have changed it without an input event.
  const down = () => { if (field && bound && field.value !== text) { text = field.value; post({ type: "composer-text", id, text }); } };
  const typed = (event: Event) => { if (event.target === field) down(); };
  const call = <Op extends ComposerOp>(op: Op, arg: ComposerCalls[Op][0], signal?: AbortSignal) => new Promise<ComposerCalls[Op][1]>((resolve, reject) => {
    const mine = id, number = ++sequence;
    if (signal?.aborted) { reject(signal.reason); return; }
    answers.set(number, { resolve: value => resolve(value as ComposerCalls[Op][1]), reject });
    signal?.addEventListener("abort", () => { if (answers.delete(number)) { post({ type: "composer-abort", id: mine, call: number }); reject(signal.reason); } }, { once: true });
    post({ type: "composer-call", id: mine, call: number, op, ...(arg === undefined ? {} : { arg }) });
  }).finally(() => setTimeout(down, 0));
  const outcome = (value: BridgedOutcome): ComposerOutcome => value.state === "unknown"
    ? { state: "unknown", check: () => call("check", value.check) }
    : value.state === "failed" ? { state: "failed", message: short(value.message, 4000), ...(Array.isArray(value.unreadable) ? { unreadable: value.unreadable } : {}) }
    : { state: "sent", ...(value.receipt && typeof value.receipt === "object" ? { receipt: value.receipt as never } : {}) };
  const act = (kind: "control" | "command" | "receiver", key: string, value?: string) => post({ type: "composer-act", id, act: kind, key, ...(value === undefined ? {} : { value }) });
  const control = (item: ComposerSnapshot["controls"][number]): ComposerControl => item.kind === "select" ? { ...item, change: (value: string) => act("control", item.id, value) }
    : item.kind === "toggle" ? { ...item, change: (on: boolean) => act("control", item.id, on ? "on" : "off") } : { ...item, run: () => act("control", item.id) };
  const options = (): ComposerOptions => {
    const now = () => snapshot!;
    const draft = { read: (signal: AbortSignal) => call("draft-read", undefined, signal).then(value => typeof value === "string" ? value : ""),
      write: (value: string) => call("draft-write", value), sent: () => call("draft-sent", undefined) };
    const at = now();
    return {
      // A framed page lists no sources, in the bar as in its own box (S-composer-source-call item 5): what it asked is kept for the
      // batch that opens them to pages with their own review.
      kind: "ai", entry: at.entry, labels: at.labels as MwComposerAiLabels, sources: false, ...(at.voice ? { voice: at.voice } : {}),
      ...(at.submitKeys ? {} : { submitKeys: false as const }), ...(at.draft ? { draft: { adapter: draft } } : {}),
      receiver: () => { const named = now().receiver; return named ? { ...named, icon: named.icon as PluginIconName | undefined, choose: (key: string) => act("receiver", key) } : null; }, delivery: () => now().delivery ?? { "next-boundary": { available: true }, interrupt: { available: true }, "after-run": { available: true } },
      ...(at.stop ? { stop: (signal: AbortSignal) => call("stop", undefined, signal) } : {}),
      pause: () => { const pause = now().pause; return pause ? { ...pause, run: (signal: AbortSignal) => call("pause", undefined, signal) } : null; },
      get controls() { return now().controls.map(control); },
      get commands() { return now().commands.map(command => ({ ...command, icon: command.icon as PluginIconName | undefined, run: () => act("command", command.slash) })); },
      ...(at.mentions ? { mentions: (query: string, signal: AbortSignal) => call("mentions", query, signal).then(found => Array.isArray(found) ? found.slice(0, 50) : []) } : {}),
      ...(at.attachments ? { attachments: { ...at.attachments, upload: (file: File, signal: AbortSignal) => call("upload", file, signal) } } : {}),
      onMaterials: () => { if (bound) post({ type: "composer-materials", id, materials: [...bound.materials()] }); },
      near: () => { const near = now().near; return near ? { ...near, plugin_id: pack.plugin_id } : null; },
      required: () => now().required,
      submit: (input, signal) => call("submit", input, signal).then(outcome),
    };
  };
  let named = false, placed = "";
  const apply = () => {
    const where = JSON.stringify(snapshot?.column ?? null);
    if (where !== placed) { placed = where; globalThis.molisWorkBarPlace?.(); }
    // A page that starts or stops naming a receiver (a session opened or closed) takes the bar or gives it back.
    if (Boolean(snapshot?.receiver) !== named) { named = !named; changed(); }
    if (!bound || !snapshot) return;
    bound.setRunning(snapshot.running); bound.hold(snapshot.hold);
    if (field && field.placeholder !== snapshot.placeholder) field.placeholder = snapshot.placeholder;
    const drawn = JSON.stringify([snapshot.receiver, snapshot.delivery, snapshot.pause, snapshot.controls, snapshot.commands]);
    if (drawn !== shown) { shown = drawn; bound.refresh(); }
  };
  const make = () => {
    const at = snapshot!, key = pack.plugin_id + ":" + id + ":" + ++generation;
    if (receiver) receivers.delete(receiver);
    receiver = {
      key, root, visible, placeholder: at.placeholder, options: options(),
      column: () => {
        const column = snapshot?.column, box = frame.getBoundingClientRect();
        return column && box.width > 0 ? { left: box.left + Math.max(0, column.left), width: Math.min(column.width, box.width) } : null;
      },
      bind(handle, box) {
        if (bound && box !== field) field?.removeEventListener("input", typed);
        bound = handle; field = handle ? box ?? null : null; shown = "";
        if (!handle) return;
        field?.addEventListener("input", typed);
        text = field?.value ?? ""; apply();
      },
    };
    receivers.add(receiver); watch(); named = Boolean(at.receiver); changed();
  };
  const drop = () => {
    for (const pending of answers.values()) pending.reject(new Error("View closed"));
    answers.clear();
    if (receiver) { receivers.delete(receiver); receiver = null; watch(); changed(); }
    bound = null; field = null; snapshot = null;
  };
  scope.own(drop);
  // Shown or hidden (another tab, another pane), the bar may have to change hands.
  scope.whenVisible(() => { changed(); return changed; });
  return (message: ComposerUp) => {
    if (!Number.isSafeInteger(message.id) || message.id <= 0) return;
    if (message.type === "composer-state") {
      const next = bounded(message.snapshot);
      if (!next) return;
      if (message.id !== id) { drop(); id = message.id; }
      const remount = !snapshot || shape(snapshot) !== shape(next);
      snapshot = next;
      if (remount) make(); else apply();
      return;
    }
    if (message.id !== id) return;
    if (message.type === "composer-destroy") { drop(); id = 0; return; }
    if (message.type === "composer-answer") {
      const pending = answers.get(message.call); answers.delete(message.call);
      if (message.error !== undefined) pending?.reject(new Error(short(message.error, 4000))); else pending?.resolve(message.value);
      return;
    }
    // What the page does to the bar's box acts only while the bar is its own and the page is in sight.
    if (!bound || !field || !visible()) return;
    if (message.type === "composer-text" && typeof message.text === "string" && message.text.length <= 1024 * 1024) {
      if (field.value === message.text) return;
      text = field.value = message.text; window.molisFit?.(field); field.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (message.type === "composer-insert" && typeof message.text === "string" && message.text.length <= 1024 * 1024) bound.insert(message.text);
    else if (message.type === "composer-focus") bound.focus();
    else if (message.type === "composer-attach" && Array.isArray(message.files) && message.files.every(file => file instanceof File)) bound.attach(message.files.slice(0, 20));
    else if (message.type === "composer-send") field.closest(".mw-composer")?.querySelector<HTMLButtonElement>("[data-composer-send]")?.click();
  };
}
