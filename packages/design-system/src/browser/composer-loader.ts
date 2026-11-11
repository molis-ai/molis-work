import { composerLocalDraft } from "./composer-storage.js";
import type { ComposerHandle, ComposerOptions } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { COMPOSER_ASSET, type ComposerMount } from "./composer-program.js";

/**
 * `window.molisComposer`, as every page has it (in `workbench.js` and in the plugin frame's own script): the composer's program is
 * one shared file, `/assets/molis-work-composer.js`, that the browser fetches once and keeps, on the first mount of a document.
 *
 * - The call gives its handle at once, as the SDK says. Until the program is in, the page's first screen (`renderComposer()`)
 *   stays as drawn and can already be typed into; `focus` acts now, the handle's other calls wait and then run in order, and
 *   `destroy` before then means it never mounts. Once the program is in, a mount is the program's own, with nothing in between.
 * - A program that cannot be fetched leaves the first screen and says so in its status line, with send held; the page goes on.
 *   The next mount tries again.
 */

let program: Promise<ComposerMount> | undefined;
const pending = new WeakMap<HTMLElement, () => void>();

function load(): Promise<ComposerMount> {
  return program ??= new Promise<ComposerMount>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(COMPOSER_ASSET, document.baseURI).href;
    script.onload = () => globalThis.molisComposerProgram ? resolve(globalThis.molisComposerProgram) : reject();
    script.onerror = () => reject();
    document.head.append(script);
  }).catch(() => { program = undefined; throw COMPOSER_ASSET; });
}

/** The first screen keeps its text; its status line says the composer cannot be used now, and send waits. */
function unavailable(root: HTMLElement, options: ComposerOptions) {
  const box = root.querySelector(".mw-composer__box") ?? root, line = document.createElement("div"), words = document.createElement("span");
  line.className = "mw-composer__status"; line.setAttribute("role", "status");
  words.textContent = options.labels.unavailable.replace("{name}", options.labels.input);
  line.append(words);
  box.querySelector(".mw-composer__status")?.remove();
  box.insertBefore(line, box.querySelector(".mw-composer__foot"));
  root.querySelectorAll<HTMLButtonElement>("[data-composer-send]").forEach((send) => { send.disabled = true; });
}

function molisComposer(root: HTMLElement, options: ComposerOptions): ComposerHandle {
  pending.get(root)?.();
  const ready = globalThis.molisComposerProgram;
  if (ready) return ready(root, options);
  let handle: ComposerHandle | null = null, gone = false, edited: string | undefined;
  const field = root.querySelector<HTMLTextAreaElement>(".mw-composer__input"), local = composerLocalDraft(root, options);
  const capture = () => { edited = field?.value; };
  field?.addEventListener("input", capture);
  const waiting: (() => void)[] = [];
  void load().then((mount) => {
    if (gone) return;
    field?.removeEventListener("input", capture); pending.delete(root);
    handle = mount(root, options);
    if (edited !== undefined && field) { field.value = edited; field.dispatchEvent(new Event("input", { bubbles: true })); }
    for (const call of waiting.splice(0)) call();
  }, () => { if (!gone) unavailable(root, options); });
  const later = <Name extends keyof ComposerHandle>(name: Name) => (...args: Parameters<ComposerHandle[Name]>) => {
    const run = () => (handle![name] as (...given: typeof args) => void)(...args);
    if (handle) run(); else waiting.push(run);
  };
  const destroy = () => {
    if (gone) return;
    gone = true;
    if (handle) { handle.destroy(); return; }
    waiting.length = 0; field?.removeEventListener("input", capture);
    if (pending.get(root) === destroy) pending.delete(root);
    if (edited !== undefined) {
      if ("adapter" in options.draft) void options.draft.adapter.write(edited).catch(() => { /* The old owner has no mounted status line. */ });
      else local?.write(edited);
    }
    if (field) field.value = "";
  };
  pending.set(root, destroy);
  return {
    setRunning: later("setRunning"), refresh: later("refresh"), insert: later("insert"), attach: later("attach"),
    materials: () => handle ? handle.materials() : [],
    focus: () => { if (handle) handle.focus(); else root.querySelector<HTMLElement>(".mw-composer__input")?.focus(); },
    destroy,
  };
}

window.molisComposer ??= molisComposer;
