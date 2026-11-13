import type { ComposerMaterial } from "@molis-ai/molis-work-contracts/platform/composer";
import type { ComposerCommand, ComposerControl, ComposerHandle, ComposerOutcome } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { BridgedCommand, BridgedControl, ComposerCalls, ComposerDown, ComposerSnapshot, ComposerUp } from "./composer-bridge.js";
import type { FrameScope } from "./types.js";

const STYLE = "[data-composer-remote]{display:none!important}";

function control(item: ComposerControl): BridgedControl {
  if (item.kind === "select") return { kind: "select", id: item.id, label: item.label, value: item.value, options: item.options.map(({ value, label, disabled }) => ({ value, label, ...(disabled ? { disabled } : {}) })), ...(item.disabled ? { disabled: true } : {}) };
  if (item.kind === "toggle") return { kind: "toggle", id: item.id, label: item.label, on: item.on, ...(item.disabled ? { disabled: true } : {}) };
  return { kind: "button", id: item.id, label: item.label, ...(item.title ? { title: item.title } : {}), ...(item.disabled ? { disabled: true } : {}) };
}

function command(item: ComposerCommand): BridgedCommand {
  return { slash: item.slash, label: item.label, ...(item.hint ? { hint: item.hint } : {}), ...(item.keywords ? { keywords: [...item.keywords] } : {}),
    ...(item.icon ? { icon: item.icon } : {}), ...(item.add === false ? { add: false as const } : {}) };
}

/**
 * The page's own box and send, hidden, stand for the bar's. What the page writes into its box (typed, or set from script: a draft
 * another device saved, a receipt clearing it, which fires no input event) goes to the bar, and the bar's text comes back into it
 * (`mirror`). Putting the cursor in it (it cannot take focus, hidden) puts it in the bar's; pressing its send, by a click or by
 * `.click()` from script on the hidden, often disabled button (which fires no click), asks the bar to send. `release` puts the
 * page's own behaviour back and empties the box, as the composer itself does when it goes: the next mount's draft is its own.
 */
function standIn(root: HTMLElement, field: HTMLTextAreaElement | null, say: { text(text: string): void; focus(): void; send(): void }) {
  let heard = field?.value ?? "", echo = false;
  const mirror = (text: string) => {
    if (!field || field.value === text) return;
    echo = true; heard = text;
    try { field.value = text; field.dispatchEvent(new Event("input", { bubbles: true })); } finally { echo = false; }
  };
  const typed = () => { if (!echo && field && field.value !== heard) { heard = field.value; say.text(heard); } };
  field?.addEventListener("input", typed);
  const value = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  if (field && value?.get && value.set) Object.defineProperty(field, "value", { configurable: true, get() { return value.get!.call(this); }, set(text: string) { value.set!.call(this, text); typed(); } });
  if (field) field.focus = () => say.focus();
  const pressed = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-composer-send]")) return;
    event.preventDefault(); event.stopImmediatePropagation(); say.send();
  };
  root.addEventListener("click", pressed, true);
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-composer-send]")];
  for (const button of buttons) button.click = () => say.send();
  const release = () => {
    field?.removeEventListener("input", typed); root.removeEventListener("click", pressed, true);
    if (field) { Reflect.deleteProperty(field, "value"); field.value = ""; Reflect.deleteProperty(field, "focus"); }
    for (const button of buttons) Reflect.deleteProperty(button, "click");
  };
  return { mirror, release };
}

/**
 * The page's side of the one input (composer-bridge.ts): `window.molisComposer` for an AI composer becomes a receiver of the bar
 * when the frame is in a workbench pane with one. The page keeps its handle and its options; the root it gave stays hidden, its
 * text box a copy of the bar's. Every other composer (a comment's, one in a side view) is drawn in the page as before.
 */
export function childComposer(port: MessagePort, scope: FrameScope, bar: boolean): void {
  const local = window.molisComposer;
  if (!bar || !local) return;
  let sequence = 0, live = 0;
  const send = (message: ComposerUp) => { if (scope.alive) port.postMessage(message); };
  const style = document.createElement("style"); style.textContent = STYLE; document.head.append(style);
  // Mounting the same root again lets the last one go first, as the composer itself does.
  const mounted = new WeakMap<HTMLElement, () => void>();

  window.molisComposer = (root, options) => {
    if (options.kind !== "ai" || options.draft && "conversation" in options.draft) return local(root, options);
    // One AI receiver per frame: the bar follows the latest mount (`live`); an earlier one on another root stays mounted but no longer
    // takes the bar.
    mounted.get(root)?.();
    const id = live = ++sequence, field = root.querySelector<HTMLTextAreaElement>(".mw-composer__input");
    const ai = options;
    const calls = new Map<number, AbortController>(), checks = new Map<number, () => Promise<"sent" | "not-sent" | "unknown">>();
    let running = false, hold: string | null = null, materials: readonly ComposerMaterial[] = [], gone = false, last = "", queued = false;
    root.dataset.composerRemote = "";
    // The box around the root (the page's conversation column): the bar stands over it.
    const column = () => {
      const box = root.parentElement?.getBoundingClientRect();
      return box && box.width > 0 ? { left: Math.round(box.left), width: Math.round(box.width) } : null;
    };
    const sizes = new ResizeObserver(() => changed());
    if (root.parentElement) sizes.observe(root.parentElement);
    const snapshot = (): ComposerSnapshot => {
      const receiver = ai.receiver?.() ?? null, pause = ai.pause?.() ?? null;
      return {
        entry: ai.entry, labels: { ...ai.labels }, placeholder: field?.placeholder ?? "",
        receiver: receiver ? { label: receiver.label, ...(receiver.icon ? { icon: receiver.icon } : {}), ...(receiver.detail ? { detail: receiver.detail } : {}),
          ...(receiver.others ? { others: receiver.others.map(one => ({ id: one.id, label: one.label, ...(one.detail ? { detail: one.detail } : {}) })) } : {}) } : null,
        delivery: ai.delivery?.() ?? null, pause: pause ? { label: pause.label, title: pause.title, ...(pause.busy ? { busy: true } : {}) } : null,
        stop: Boolean(ai.stop), controls: (ai.controls ?? []).map(control), commands: (ai.commands ?? []).map(command),
        mentions: Boolean(ai.mentions), attachments: ai.attachments ? { ...(ai.attachments.accept ? { accept: ai.attachments.accept } : {}) } : null,
        sources: ai.sources ?? true, near: ai.near?.() ?? null, ...(ai.voice ? { voice: ai.voice } : {}), required: ai.required?.() ?? null,
        submitKeys: ai.submitKeys !== false, draft: Boolean(ai.draft), column: column(), running, hold,
      };
    };
    // Every call of the handle may change what the bar shows: sent once per turn of the page's script, and only when it changed.
    const changed = () => {
      if (queued || gone) return;
      queued = true;
      queueMicrotask(() => {
        queued = false; if (gone || live !== id) return;
        let now: ComposerSnapshot, text: string;
        try { now = snapshot(); text = JSON.stringify(now); }
        catch {
          // A page handed a control, command or word of the wrong shape: the whole mount is let go, as the parent drops a
          // malformed state (S-composer-source-call item 5). The page's own script must not turn this into an uncaught error.
          destroy(); return;
        }
        if (text !== last) { last = text; send({ type: "composer-state", id, snapshot: now }); }
      });
    };
    const stand = standIn(root, field, {
      text: text => { if (live === id) send({ type: "composer-text", id, text }); },
      focus: () => send({ type: "composer-focus", id }), send: () => send({ type: "composer-send", id }),
    });
    const mirror = stand.mirror;
    const run = async <Op extends keyof ComposerCalls>(op: Op, arg: ComposerCalls[Op][0], signal: AbortSignal): Promise<ComposerCalls[Op][1]> => {
      const adapter = ai.draft && "adapter" in ai.draft ? ai.draft.adapter : null;
      switch (op) {
        case "draft-read": {
          const text = adapter ? await adapter.read(signal) : "";
          // The composer puts a draft back only into an empty box; the copy follows it.
          if (text && !field?.value.trim()) mirror(text);
          return text as ComposerCalls[Op][1];
        }
        case "draft-write": await adapter?.write(arg as string); return undefined as ComposerCalls[Op][1];
        case "draft-sent": mirror(""); await (adapter?.sent ? adapter.sent() : adapter?.write("")); return undefined as ComposerCalls[Op][1];
        case "stop": await ai.stop?.(signal); return undefined as ComposerCalls[Op][1];
        case "pause": await ai.pause?.()?.run(signal); return undefined as ComposerCalls[Op][1];
        case "mentions": return (ai.mentions ? [...await ai.mentions(arg as string, signal)] : []) as ComposerCalls[Op][1];
        case "upload": {
          if (!ai.attachments) throw new Error("No attachments here");
          return await ai.attachments.upload(arg as File, signal) as ComposerCalls[Op][1];
        }
        case "check": {
          const asked = checks.get(arg as number);
          if (!asked) return "unknown" as ComposerCalls[Op][1];
          const answer = await asked();
          if (answer !== "unknown") checks.delete(arg as number);
          return answer as ComposerCalls[Op][1];
        }
        case "submit": {
          // What is missing is the page's to say at the moment of sending, not as the bar last heard it.
          const missing = ai.required?.();
          if (missing) return { state: "failed", message: missing } as ComposerCalls[Op][1];
          const outcome: ComposerOutcome = await ai.submit(arg as ComposerCalls["submit"][0], signal);
          if (outcome.state !== "unknown") return { ...outcome, ...(outcome.state === "failed" && outcome.unreadable ? { unreadable: [...outcome.unreadable] } : {}) } as ComposerCalls[Op][1];
          const token = ++sequence; checks.set(token, outcome.check);
          return { state: "unknown", check: token } as ComposerCalls[Op][1];
        }
      }
      throw new Error("Unknown composer call");
    };
    const listen = (event: MessageEvent<ComposerDown>) => {
      const message = event.data;
      if (!message || message.id !== id || gone) return;
      if (message.type === "composer-text") { mirror(message.text); return; }
      if (message.type === "composer-materials") { materials = message.materials; ai.onMaterials?.(); return; }
      // The bar's input width: a page lines its conversation up with it through this one variable (§10.4).
      if (message.type === "composer-column") { if (Number.isFinite(message.width) && message.width > 0) document.documentElement.style.setProperty("--mw-bar-column", Math.round(message.width) + "px"); return; }
      if (message.type === "composer-abort") { calls.get(message.call)?.abort(); calls.delete(message.call); return; }
      if (message.type === "composer-act") {
        if (message.act === "command") ai.commands?.find(item => item.slash === message.key)?.run();
        else if (message.act === "receiver") {
          // Only one the page itself listed.
          const named = ai.receiver?.();
          if (named?.others?.some(one => one.id === message.key)) named.choose?.(message.key);
        } else {
          const item = ai.controls?.find(one => one.id === message.key);
          if (item?.kind === "select" && item.options.some(option => option.value === message.value && !option.disabled)) item.change?.(message.value!);
          else if (item?.kind === "toggle") item.change?.(message.value === "on");
          else if (item?.kind === "button") item.run();
        }
        changed(); return;
      }
      if (message.type !== "composer-call") return;
      const controller = new AbortController(); calls.set(message.call, controller);
      void run(message.op, message.arg as never, controller.signal).then(
        value => send({ type: "composer-answer", id, call: message.call, value }),
        error => send({ type: "composer-answer", id, call: message.call, error: error instanceof Error ? error.message : String(error) }),
      ).finally(() => { calls.delete(message.call); changed(); });
    };
    port.addEventListener("message", listen);
    function destroy() {
      if (gone) return;
      gone = true; sizes.disconnect(); port.removeEventListener("message", listen); stand.release();
      for (const controller of calls.values()) controller.abort();
      calls.clear(); checks.clear();
      if (live === id) send({ type: "composer-destroy", id });
    }
    scope.own(destroy); mounted.set(root, destroy);
    changed();
    const handle: ComposerHandle = {
      setRunning: (value) => { running = value; changed(); },
      hold: (reason) => { hold = reason; changed(); },
      refresh: changed,
      focus: () => send({ type: "composer-focus", id }),
      insert: (text) => send({ type: "composer-insert", id, text }),
      attach: (files) => send({ type: "composer-attach", id, files: [...files] }),
      materials: () => materials,
      destroy,
    };
    return handle;
  };
}
