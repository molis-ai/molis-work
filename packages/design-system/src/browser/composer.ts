import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { ComposerHandle, ComposerOptions } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { renderComposer } from "@molis-ai/molis-work-plugin-sdk/ui";
import { COMPOSER_DRAFT_PREFIX, composerKey, composing, staleComposerDrafts, wantsEnterHint } from "../composer-rules.js";
import { composerDrafts, enterHint, type ComposerDrafts } from "./composer-drafts.js";
import { composerMenus, type ComposerMenus } from "./composer-menus.js";
import { composerSender, type ComposerSender } from "./composer-send.js";
import { composerBasics, composerState, mac, storage, type Composer } from "./composer-state.js";
import { firstScreen, paint } from "./composer-view.js";

/**
 * The unified input's one program per document (specs/unified-input-voice/implementation-plan.md §3.1–3.5, slice K2):
 * `window.molisComposer(root, options)` mounts one composer in `root` and gives its handle. The first screen is the SDK's
 * `renderComposer()` (a page may have drawn it already; it is kept, so the text area and its caret are never replaced); after that
 * composer-view.ts swaps only the parts that change, and puts in what only it knows: the attachment strip and the restored-draft
 * line. The menus are composer-menus.ts's, drafts composer-drafts.ts's, sending and uploads composer-send.ts's; the rules they
 * follow are composer-rules.ts's, shared with the node tests.
 *
 * - Keys and the input method: Enter breaks the line, ⌘/Ctrl+Enter sends (a supplement while a turn runs), ⌘/Ctrl+Shift+Enter is
 *   for the next turn; nothing happens while a composition is open. Esc closes this composer's own menu only.
 * - Every mount is a generation: mounting the same root again or `destroy` aborts the last one's signal, and whatever comes back
 *   for it later (an outcome, an upload, a pick, a draft read) is dropped. A page that takes the root away calls `destroy` first.
 * - A framed plugin page has no route to the sources (S-composer-source-call): its composer lists only its own files and commands.
 */

const instances = new WeakMap<HTMLElement, () => void>();
let count = 0;

interface Parts { drafts: ComposerDrafts; menus: ComposerMenus; sender: ComposerSender }

function mount(root: HTMLElement, options: ComposerOptions): ComposerHandle {
  instances.get(root)?.();
  const life = new AbortController(), basics = composerBasics(options);
  if (!root.querySelector(".mw-composer")) root.innerHTML = renderComposer(firstScreen(basics, ""));
  const shell = root.querySelector<HTMLElement>(".mw-composer")!;
  const c = composerState(basics, root, life.signal, shell.id ||= `mw-composer-${++count}`);
  c.paint = (controls) => paint(c, controls);
  const drafts = composerDrafts(c), menus = composerMenus(c), sender = composerSender(c, drafts, enterHint.done);
  drafts.load();

  const files = Object.assign(document.createElement("input"), { type: "file", multiple: true, hidden: true });
  if (options.attachments?.accept) files.accept = options.attachments.accept;
  shell.append(files);
  files.addEventListener("change", () => { void sender.upload([...files.files ?? []]); files.value = ""; }, { signal: c.signal });
  if (options.attachments) {
    window.molisDropZone?.(c.box, (on) => c.box.toggleAttribute("data-dropping", on), undefined, c.labels.dropRefused);
    c.box.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); }, { signal: c.signal });
    c.box.addEventListener("drop", (event) => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); void sender.upload([...event.dataTransfer.files]); }, { signal: c.signal });
    c.field.addEventListener("paste", (event) => { const pasted = [...event.clipboardData?.files ?? []]; if (pasted.length) { event.preventDefault(); void sender.upload(pasted); } }, { signal: c.signal });
  }
  wire(c, { drafts, menus, sender }, files);

  /** Lets go: every listener, the pending draft write, any open query; whatever comes back for this mount is dropped. */
  function release() {
    if (c.signal.aborted) return;
    c.close(); life.abort(); c.queries.end(); drafts.stop(); files.remove();
    if (instances.get(root) === release) instances.delete(root);
  }
  instances.set(root, release);
  c.paint(true);

  return {
    setRunning(next) { if (c.running !== next) { c.running = next; if (!next) c.note = undefined; c.paint(); } },
    refresh() { c.paint(true); },
    focus() { c.field.focus(); },
    insert(text) {
      c.field.setRangeText(text, c.field.selectionStart, c.field.selectionEnd, "end"); window.molisFit?.(c.field); drafts.save(); c.paint();
    },
    destroy: release,
  };
}

/** The composer's listeners, all let go with its signal. */
function wire(c: Composer, { drafts, menus, sender }: Parts, files: HTMLInputElement) {
  const { shell, field, options, signal, labels } = c;
  shell.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLElement>("button, [role^=menuitem]");
    if (!target || !shell.contains(target) || target.matches(":disabled")) return;
    const data = target.dataset;
    if (data.composerAdd !== undefined) { c.typed = ""; return menus.openAdd(true, true); }
    if (data.composeMenuToggle !== undefined) return menus.toggleDelivery(target);
    if (data.composerDelivery) { c.close(); field.focus(); return void sender.send(data.composerDelivery as AgentSteerMode); }
    if (data.composerSend !== undefined || data.composerStatusAction === "retry") return void sender.send();
    if (data.composerStatusAction === "check") return void sender.confirm();
    if (data.composerStatusAction === "hint") { c.note = undefined; enterHint.done(); return c.paint(); }
    if (data.composerStop !== undefined && c.ai?.stop) {
      c.stopping = true; c.paint();
      return void c.ai.stop(signal).catch(() => undefined).finally(() => { if (!signal.aborted) { c.stopping = false; c.paint(); } });
    }
    if (data.composerClear !== undefined) { field.value = ""; window.molisFit?.(field); drafts.clear(); field.focus(); return c.paint(); }
    if (data.composerRemove) { c.items = c.items.filter((_, index) => index !== Number(data.composerRemove)); c.requestId = ""; c.paint(); return field.focus(); }
    if (data.composerFiles !== undefined) { c.close(); menus.untype(); return files.click(); }
    if (data.composerSource && Array.isArray(c.sources)) return menus.pick(c.sources[Number(data.composerSource)]!);
    if (data.composerPick && c.picking && Array.isArray(c.picking.found)) {
      const chosen = c.picking.found[Number(data.composerPick)]!, source = c.picking.source;
      c.items = [...c.items, { title: chosen.title, state: "attached", from: `${source.provider} · ${source.title}`,
        material: { kind: "material", ref: chosen.ref, title: chosen.title, source: { capability_id: source.capability_id, version: source.version, provider_id: source.provider_id } } }];
      menus.untype(); c.requestId = ""; c.close(); field.focus(); return c.paint();
    }
    if (data.composerCommand) { const command = options.commands?.[Number(data.composerCommand)]; menus.untype(); c.close(); field.focus(); return command?.run(); }
    if (data.composerMore !== undefined) return void target.setAttribute("aria-expanded", String(target.getAttribute("aria-expanded") !== "true"));
    if (data.composerControl) {
      const control = options.controls?.find((one) => one.id === data.composerControl);
      if (control?.kind === "toggle") { const on = target.getAttribute("aria-pressed") !== "true"; target.setAttribute("aria-pressed", String(on)); control.change?.(on); }
      if (control?.kind === "button") control.run();
    }
    if (data.tagRemove !== undefined) c.ai?.receiver?.()?.reset?.();
  }, { signal });
  shell.addEventListener("change", (event) => {
    const select = (event.target as Element).closest<HTMLSelectElement>("select[data-composer-control]");
    const control = options.controls?.find((one) => one.id === select?.dataset.composerControl);
    if (select && control?.kind === "select") control.change?.(select.value);
  }, { signal });
  shell.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && c.open) { event.preventDefault(); event.stopPropagation(); return c.close(true); }
    if (event.target !== field) return;
    const key = composerKey(event, options.submitKeys !== false);
    if (key) { event.preventDefault(); return void sender.send(key === "after-run" ? "after-run" : undefined, true); }
    if (options.submitKeys !== false && !composing(event) && !enterHint.shown() && wantsEnterHint(event, field.value, field.selectionStart)) {
      enterHint.done();
      c.note = { caption: labels.notice, text: c.fill(labels.enterHint, { keys: mac ? "⌘↵" : "Ctrl+↵" }), action: labels.enterHintDismiss, actionId: "hint" };
      c.paint();
    }
  }, { signal });
  field.addEventListener("input", (event) => {
    const data = (event as InputEvent).data;
    if (c.phase === "failed") { c.phase = ""; c.requestId = ""; } else if (c.phase !== "unknown") c.requestId = "";
    if (c.note && c.note.actionId !== "hint") c.note = undefined;
    c.restored = "";
    drafts.save();
    const before = field.value.slice(0, field.selectionStart);
    if (data === "/" && before === "/" && options.commands?.length) { c.typed = "/"; menus.openAdd(false); }
    else if (data === "@" && /(^|\s)@$/.test(before) && c.offersSources) { c.typed = "@"; menus.openAdd(false); }
    else if (c.typed) c.close();
    c.paint();
  }, { signal });
  document.addEventListener("pointerdown", (event) => { if (c.open && !shell.contains(event.target as Node)) c.close(); }, { capture: true, signal });
}

/** A project deleted or a plugin removed from it leaves no draft behind on this machine (UIC-10). */
function forget(gone: { project: string; install?: string }) {
  try {
    const store = storage(), keys = Array.from({ length: store.length }, (_, index) => store.key(index)!);
    for (const key of staleComposerDrafts(keys, gone)) store.removeItem(key);
    // A framed plugin's drafts live under its page's own prefix (`molis-plugin-page:<home>:<install>:<project>:`), the same key inside.
    for (const key of keys) {
      const inner = key.indexOf(COMPOSER_DRAFT_PREFIX);
      if (key.startsWith("molis-plugin-page:") && inner > 0 && staleComposerDrafts([key.slice(inner)], gone).length) store.removeItem(key);
    }
  } catch { /* storage refused: nothing of it can be read either */ }
}
document.addEventListener("molis-work:plugins-changed", (event) => {
  const project = document.body.dataset.projectId || "home";
  for (const install of (event as CustomEvent<{ gone?: string[] }>).detail?.gone ?? []) forget({ project, install });
});

window.molisComposer ??= mount;
(globalThis as { molisComposerForget?: typeof forget }).molisComposerForget ??= forget;
