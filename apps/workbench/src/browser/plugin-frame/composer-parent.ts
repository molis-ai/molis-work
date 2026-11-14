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
const MODES = ["next-boundary", "interrupt", "after-run"] as const;

/*
 * What a page sends is rebuilt here from the parts the bar knows, never spread: a field of the wrong type drops the whole state
 * (S-composer-source-call item 5), so a page cannot slip markup or a shape the composer would throw on past the bar. An icon is
 * only a platform icon's name; any other is left out (it is only a glyph).
 */
const want = (ok: boolean): void => { if (!ok) throw new Error("Malformed composer state"); };
const text = (value: unknown, limit: number): string => { want(typeof value === "string"); return (value as string).slice(0, limit); };
const maybe = (value: unknown, limit: number) => value === undefined ? undefined : text(value, limit);
/** The line above the box as the page sent it: one of the two tones, its words and button label bounded. */
function noticeOf(value: unknown): ComposerSnapshot["notice"] {
  if (value === null || value === undefined) return null;
  const raw = record(value), action = raw.action === null || raw.action === undefined ? null : record(raw.action);
  want(raw.tone === "readonly" || raw.tone === "info");
  return { text: text(raw.text, 400), tone: raw.tone as "readonly" | "info", ...icon(raw.icon), action: action ? { label: text(action.label, 100) } : null };
}
const flag = (value: unknown) => { want(value === undefined || typeof value === "boolean"); return value === true; };
const icon = (value: unknown) => { want(value === undefined || typeof value === "string"); return typeof value === "string" && ICONS.has(value) ? { icon: value as PluginIconName } : {}; };
const list = (value: unknown, limit: number): unknown[] => { want(Array.isArray(value)); return (value as unknown[]).slice(0, limit); };
const record = (value: unknown): Record<string, unknown> => { want(Boolean(value) && typeof value === "object" && !Array.isArray(value)); return value as Record<string, unknown>; };
const optional = <T>(key: string, value: T | undefined) => value === undefined ? {} : { [key]: value };

function controlOf(raw: unknown): ComposerSnapshot["controls"][number] {
  const item = record(raw), base = { id: text(item.id, 80), label: text(item.label, 200), ...(flag(item.disabled) ? { disabled: true } : {}) };
  if (item.kind === "select") return { kind: "select", ...base, value: text(item.value, 400), options: list(item.options, 50).map(one => {
    const option = record(one);
    return { value: text(option.value, 400), label: text(option.label, 200), ...(flag(option.disabled) ? { disabled: true } : {}) };
  }) };
  if (item.kind === "toggle") { want(typeof item.on === "boolean"); return { kind: "toggle", ...base, on: item.on as boolean }; }
  want(item.kind === "button");
  return { kind: "button", ...base, ...optional("title", maybe(item.title, 200)) };
}

function commandOf(raw: unknown): ComposerSnapshot["commands"][number] {
  const item = record(raw);
  want(item.add === undefined || item.add === false);
  return { slash: text(item.slash, 80), label: text(item.label, 200), ...optional("hint", maybe(item.hint, 400)),
    ...(item.keywords === undefined ? {} : { keywords: list(item.keywords, 20).map(word => text(word, 80)) }), ...icon(item.icon), ...(item.add === false ? { add: false as const } : {}) };
}

function deliveryOf(raw: unknown): ComposerSnapshot["delivery"] {
  if (raw === null) return null;
  const item = record(raw), out: Record<string, { available: true } | { available: false; reason: string }> = {};
  for (const mode of MODES) {
    const one = record(item[mode]);
    if (one.available === true) out[mode] = { available: true };
    else { want(one.available === false); out[mode] = { available: false, reason: text(one.reason, 400) }; }
  }
  return out as ComposerSnapshot["delivery"];
}

function receiverOf(raw: unknown): ComposerSnapshot["receiver"] {
  if (raw === null) return null;
  const item = record(raw);
  return { label: text(item.label, 200), ...icon(item.icon), ...optional("detail", maybe(item.detail, 100)),
    ...(item.others === undefined ? {} : { others: list(item.others, 20).map(one => {
      const other = record(one), id = text(other.id, 1000);
      want(id.length > 0 && id.length <= 200);
      return { id, label: text(other.label, 200), ...optional("detail", maybe(other.detail, 100)) };
    }) }) };
}

/**
 * What the page says of itself is drawn by the bar's composer, which escapes every word; here it is bounded and rebuilt, and the
 * page's object is always the frame's own plugin's (a page cannot name another owner's object for a source's `near`).
 */
function bounded(snapshot: ComposerSnapshot): ComposerSnapshot | null {
  try {
    if (JSON.stringify(snapshot).length > 256 * 1024) return null;
    const raw = record(snapshot), pause = raw.pause === null ? null : record(raw.pause), attachments = raw.attachments === null ? null : record(raw.attachments);
    const column = raw.column === null ? null : record(raw.column), near = raw.near === null ? null : record(raw.near);
    want(typeof raw.stop === "boolean" && typeof raw.mentions === "boolean" && typeof raw.sources === "boolean" && typeof raw.submitKeys === "boolean" && typeof raw.draft === "boolean");
    return {
      entry: text(raw.entry, 80), labels: words(record(raw.labels)), placeholder: text(raw.placeholder, 400),
      receiver: receiverOf(raw.receiver), delivery: deliveryOf(raw.delivery),
      pause: pause ? { label: text(pause.label, 100), title: text(pause.title, 200), ...(flag(pause.busy) ? { busy: true } : {}) } : null,
      stop: raw.stop as boolean, mentions: raw.mentions as boolean, sources: raw.sources as boolean, submitKeys: raw.submitKeys as boolean, draft: raw.draft as boolean,
      controls: list(raw.controls, 12).map(controlOf), commands: list(raw.commands, 200).map(commandOf),
      attachments: attachments ? { ...optional("accept", maybe(attachments.accept, 400)) } : null,
      ...optional("voice", maybe(raw.voice, 80)),
      column: column && Number.isFinite(column.left) && Number.isFinite(column.width) && (column.width as number) > 0 ? { left: column.left as number, width: column.width as number } : null,
      near: near ? { kind: text(near.kind, 80), id: text(near.id, 200) } as ComposerSnapshot["near"] : null,
      required: raw.required === null ? null : text(raw.required, 400),
      notice: noticeOf(raw.notice),
      hold: raw.hold === null ? null : text(raw.hold, 400),
      running: raw.running === true,
    };
  } catch { return null; }
}

/** A page's `@` answer, kept only as the composer reads one: a title, a hint perhaps, and the words it puts in. */
const mentionsOf = (found: unknown) => Array.isArray(found) ? found.slice(0, 50).flatMap(one => {
  try { const item = record(one); return [{ title: text(item.title, 200), ...optional("hint", maybe(item.hint, 400)), insert: text(item.insert, 2000) }]; } catch { return []; }
}) : [];

/** A page's answer to a file it was given to read, as one of the two the composer knows; anything else did not go. */
const uploadOf = (raw: unknown): ComposerCalls["upload"][1] => {
  try {
    const item = record(raw);
    if (item.state === "attached") return { state: "attached", ref: text(item.ref, 400), title: text(item.title, 200) };
    if (item.state === "failed") return { state: "failed", reason: text(item.reason, 400) };
  } catch { /* falls through: the page's answer is not one the composer reads */ }
  return { state: "failed", reason: "" };
};

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
const shape = (snapshot: ComposerSnapshot) => JSON.stringify([snapshot.entry, snapshot.stop, snapshot.mentions, snapshot.attachments, snapshot.sources, snapshot.voice, snapshot.submitKeys, snapshot.draft]);

/**
 * The parent's side of the one input (composer-bridge.ts): the page's state becomes a receiver whose options the bar's composer
 * reads as any page's, each function a call to the page answered through the port. Only the receiver in front is bound to the bar.
 */
export function pageComposer(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement, pack: FramePack, visible: () => boolean) {
  let id = 0, snapshot: ComposerSnapshot | null = null, receiver: BarReceiver | null = null, bound: ComposerHandle | null = null, field: HTMLTextAreaElement | null = null;
  let retitle: (() => void) | undefined;
  let sequence = 0, shown = "", text = "", generation = 0;
  const answers = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const post = (message: ComposerDown) => port.postMessage(message);
  // The bar's text, as the page last heard it; sent again after anything that may have changed it without an input event.
  const down = () => { if (field && bound && field.value !== text) { text = field.value; post({ type: "composer-text", id, text }); } };
  const typed = (event: Event) => { if (event.target === field) down(); };
  // Each mount's calls go to that mount only: a bar composer let go after the page mounted anew (another session) flushes its last
  // edit into nothing, never into the next mount's draft.
  const call = <Op extends ComposerOp>(mine: number, op: Op, arg: ComposerCalls[Op][0], signal?: AbortSignal) => new Promise<ComposerCalls[Op][1]>((resolve, reject) => {
    const number = ++sequence;
    if (mine !== id) { reject(new Error("View closed")); return; }
    if (signal?.aborted) { reject(signal.reason); return; }
    answers.set(number, { resolve: value => resolve(value as ComposerCalls[Op][1]), reject });
    signal?.addEventListener("abort", () => { if (answers.delete(number)) { post({ type: "composer-abort", id: mine, call: number }); reject(signal.reason); } }, { once: true });
    post({ type: "composer-call", id: mine, call: number, op, ...(arg === undefined ? {} : { arg }) });
  }).finally(() => setTimeout(down, 0));
  const outcome = (mine: number, value: BridgedOutcome): ComposerOutcome => !value || typeof value !== "object" ? { state: "failed", message: "" }
    : value.state === "unknown"
    ? { state: "unknown", check: () => call(mine, "check", value.check).then(answer => answer === "sent" || answer === "not-sent" ? answer : "unknown") }
    : value.state === "failed" ? { state: "failed", message: short(value.message, 4000), ...(Array.isArray(value.unreadable) ? { unreadable: value.unreadable.slice(0, 50)
      .filter(one => one && Number.isInteger(one.index) && typeof one.reason === "string").map(one => ({ index: one.index, reason: short(one.reason, 400) })) } : {}) }
    : value.state === "sent" ? { state: "sent", ...(value.receipt && typeof value.receipt === "object" ? { receipt: value.receipt as never } : {}) }
    : { state: "failed", message: "" };
  const act = (mine: number, kind: "control" | "command" | "receiver" | "notice", key: string, value?: string) => { if (mine === id) post({ type: "composer-act", id, act: kind, key, ...(value === undefined ? {} : { value }) }); };
  const options = (): ComposerOptions => {
    // A mount let go keeps drawing what it last showed (the bar may read it once more while it unmounts); its calls are refused.
    const mine = id;
    let last = snapshot!;
    const now = () => (mine === id && snapshot ? (last = snapshot) : last);
    const control = (item: ComposerSnapshot["controls"][number]): ComposerControl => item.kind === "select" ? { ...item, change: (value: string) => act(mine, "control", item.id, value) }
      : item.kind === "toggle" ? { ...item, change: (on: boolean) => act(mine, "control", item.id, on ? "on" : "off") } : { ...item, run: () => act(mine, "control", item.id) };
    const draft = { read: (signal: AbortSignal) => call(mine, "draft-read", undefined, signal).then(value => typeof value === "string" ? value : ""),
      write: (value: string) => call(mine, "draft-write", value), sent: () => call(mine, "draft-sent", undefined) };
    const at = now();
    return {
      // A framed page lists no sources, in the bar as in its own box (S-composer-source-call item 5): what it asked is kept for the
      // batch that opens them to pages with their own review.
      kind: "ai", entry: at.entry, labels: at.labels as MwComposerAiLabels, sources: false, ...(at.voice ? { voice: at.voice } : {}),
      ...(at.submitKeys ? {} : { submitKeys: false as const }), ...(at.draft ? { draft: { adapter: draft } } : {}),
      receiver: () => { const named = now().receiver; return named ? { ...named, icon: named.icon as PluginIconName | undefined, choose: (key: string) => act(mine, "receiver", key) } : null; }, delivery: () => now().delivery ?? { "next-boundary": { available: true }, interrupt: { available: true }, "after-run": { available: true } },
      ...(at.stop ? { stop: (signal: AbortSignal) => call(mine, "stop", undefined, signal) } : {}),
      pause: () => { const pause = now().pause; return pause ? { ...pause, run: (signal: AbortSignal) => call(mine, "pause", undefined, signal) } : null; },
      get controls() { return now().controls.map(control); },
      get commands() { return now().commands.map(command => ({ ...command, icon: command.icon as PluginIconName | undefined, run: () => act(mine, "command", command.slash) })); },
      ...(at.mentions ? { mentions: (query: string, signal: AbortSignal) => call(mine, "mentions", query, signal).then(mentionsOf) } : {}),
      ...(at.attachments ? { attachments: { ...at.attachments, upload: (file: File, signal: AbortSignal) => call(mine, "upload", file, signal).then(uploadOf) } } : {}),
      onMaterials: () => { if (bound && mine === id) post({ type: "composer-materials", id, materials: [...bound.materials()] }); },
      near: () => { const near = now().near; return near ? { ...near, plugin_id: pack.plugin_id } : null; },
      required: () => now().required,
      notice: () => { const line = now().notice; return line ? { text: line.text, tone: line.tone, ...(line.icon ? { icon: line.icon as PluginIconName } : {}), ...(line.action ? { action: { label: line.action.label, run: () => act(mine, "notice", "") } } : {}) } : null; },
      submit: (input, signal) => call(mine, "submit", input, signal).then(value => outcome(mine, value)),
    };
  };
  let named = false, placed = "", width = 0;
  // While the bar is this page's, the page hears how wide its input stands, and lines its conversation up with it.
  const measure = new ResizeObserver(entries => {
    const now = Math.round(entries.at(-1)?.target.getBoundingClientRect().width ?? 0);
    if (now > 0 && now !== width && bound) { width = now; post({ type: "composer-column", id, width: now }); }
  });
  const apply = () => {
    const where = JSON.stringify(snapshot?.column ?? null);
    if (where !== placed) { placed = where; globalThis.molisWorkBarPlace?.(); }
    // A page that starts or stops naming a receiver (a session opened or closed) takes the bar or gives it back.
    if (Boolean(snapshot?.receiver) !== named) { named = !named; changed(); }
    if (!snapshot || !receiver) return;
    receiver.options.labels = snapshot.labels as MwComposerAiLabels;
    if (!bound) return;
    bound.setRunning(snapshot.running); bound.hold(snapshot.hold);
    if (field && field.placeholder !== snapshot.placeholder) field.placeholder = snapshot.placeholder;
    const drawn = JSON.stringify([snapshot.labels, snapshot.receiver, snapshot.delivery, snapshot.pause, snapshot.controls, snapshot.commands]);
    if (drawn !== shown) { shown = drawn; retitle?.(); bound.refresh(); }
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
      bind(handle, box, updateWords) {
        if (bound && box !== field) field?.removeEventListener("input", typed);
        bound = handle; field = handle ? box ?? null : null; retitle = updateWords; shown = ""; width = 0; measure.disconnect();
        if (!handle) return;
        field?.addEventListener("input", typed);
        const input = field?.closest<HTMLElement>(".mw-composer");
        if (input) measure.observe(input);
        text = field?.value ?? ""; apply();
      },
    };
    receivers.add(receiver); watch(); named = Boolean(at.receiver); changed();
  };
  const drop = () => {
    measure.disconnect();
    for (const pending of answers.values()) pending.reject(new Error("View closed"));
    answers.clear();
    if (receiver) { receivers.delete(receiver); receiver = null; watch(); changed(); }
    bound = null; field = null; snapshot = null; retitle = undefined;
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
