import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { ComposerHandle, ComposerOptions } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { renderComposer } from "@molis-ai/molis-work-plugin-sdk/ui";
import { composerKey, composing, wantsEnterHint } from "../composer-rules.js";
import { composerDrafts, enterHint, type ComposerDrafts } from "./composer-drafts.js";
import { retainComposer } from "./composer-retained.js";
import { composerMenus, type ComposerMenus } from "./composer-menus.js";
import { composerSender, type ComposerSender } from "./composer-send.js";
import "./composer-program.js";
import { attached, composerBasics, composerState, itemKey, letGo, mac, type Composer } from "./composer-state.js";
import { firstScreen, paint } from "./composer-view.js";

/**
 * The unified input's one program per document (specs/unified-input-voice/implementation-plan.md §3.1–3.5, slice K2), served
 * once as `/assets/molis-work-composer.js`: `window.molisComposer(root, options)` (composer-loader.ts, in every page's own
 * script) fetches it on a document's first mount and hands each mount to it; it mounts one composer in `root` and gives its
 * handle. The first screen is the SDK's `renderComposer()` (a page may have drawn it already; it is kept, so the text area and its caret are never replaced); after that
 * composer-view.ts swaps only the parts that change, and puts in what only it knows: the attachment strip and the restored-draft
 * line. The menus are composer-menus.ts's, drafts composer-drafts.ts's, sending and uploads composer-send.ts's; the rules they
 * follow are composer-rules.ts's, shared with the node tests.
 *
 * - Keys and the input method: Enter breaks the line, ⌘/Ctrl+Enter sends (a supplement while a turn runs), ⌘/Ctrl+Shift+Enter is
 *   for the next turn; nothing happens while a composition is open. Esc closes this composer's own menu only. While a menu opened
 *   by typing (`/`, `@`) is open, ↑ ↓ choose in it and Enter or Tab takes the row (composer-menus.ts).
 * - Every mount is a generation: mounting the same root again or `destroy` aborts the last one's signal, and whatever comes back
 *   for it later (an outcome, an upload, a pick, a draft read) is dropped. A page that takes the root away calls `destroy` first.
 * - A framed plugin page has no route to the sources (S-composer-source-call): its composer lists only its own files and commands.
 * - Drafts a deleted project or a removed plugin leaves are swept by composer-sweep.ts, in the Workbench document's own script.
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
  // What the strip carries, as last told to the page (`onMaterials`): told again only when it changed.
  let carried: readonly unknown[] = [];
  c.paint = (controls) => {
    paint(c, controls);
    const now = attached(c);
    if (now.length !== carried.length || now.some((one, index) => one !== carried[index])) { carried = now; options.onMaterials?.(); }
  };
  const retained = retainComposer(c), drafts = composerDrafts(c, retained), menus = composerMenus(c), sender = composerSender(c, drafts, enterHint.done, retained);
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

  /** Saves the last edit before letting go; the next conversation gets an empty, open field and none of this mount's late results. */
  function release() {
    if (c.signal.aborted) return;
    drafts.stop(); c.close(); life.abort(); retained.release(); c.queries.end(); files.remove(); c.field.value = "";
    // A hold is this mount's: the next mount starts open and holds again if its page says so.
    c.field.disabled = false;
    if (carried.length) { carried = []; options.onMaterials?.(); }
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
    attach(given) { if (given.length) void sender.upload(given); },
    hold(reason) {
      const now = reason ?? "";
      if (c.held === now || c.signal.aborted) return;
      c.held = now; c.field.disabled = Boolean(now);
      c.paint(true);
    },
    materials: () => attached(c),
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
    if (data.composerDelivery) { c.delivery = data.composerDelivery as AgentSteerMode; c.close(); field.focus(); return c.paint(); }
    if (data.composerSend !== undefined || data.composerStatusAction === "retry") return void sender.send();
    if (data.composerStatusAction === "check") return void sender.confirm();
    if (data.composerStatusAction === "hint") { c.note = undefined; enterHint.done(); return c.paint(); }
    if (data.composerStop !== undefined && c.ai?.stop) {
      c.stopping = true; c.paint();
      return void c.ai.stop(signal).catch(() => undefined).finally(() => { if (!signal.aborted) { c.stopping = false; c.paint(); } });
    }
    const pause = data.composerPause !== undefined ? c.ai?.pause?.() : null;
    if (pause) {
      c.pausing = true; c.paint();
      return void pause.run(signal).catch(() => undefined).finally(() => { if (!signal.aborted) { c.pausing = false; c.paint(); } });
    }
    if (data.composerClear !== undefined) { field.value = ""; window.molisFit?.(field); drafts.clear(); field.focus(); return c.paint(); }
    if (data.composerRemove) {
      letGo(c.items.filter((item) => item.key === data.composerRemove));
      c.items = c.items.filter((item) => item.key !== data.composerRemove); c.requestId = ""; c.paint(); return field.focus();
    }
    if (data.composerRetry) return void sender.retry(data.composerRetry);
    if (data.composerFiles !== undefined) { c.close(); menus.untype(); return files.click(); }
    if (data.composerSource && Array.isArray(c.sources)) return menus.pick(c.sources[Number(data.composerSource)]!);
    if (data.composerPick && c.picking && Array.isArray(c.picking.found)) {
      const chosen = c.picking.found[Number(data.composerPick)]!, source = c.picking.source;
      c.items = [...c.items, { key: itemKey(), title: chosen.title, state: "attached", from: `${source.provider} · ${source.title}`,
        material: { kind: "material", ref: chosen.ref, title: chosen.title, source: { capability_id: source.capability_id, version: source.version, provider_id: source.provider_id } } }];
      menus.untype(); c.requestId = ""; c.close(); field.focus(); return c.paint();
    }
    if (data.composerMention) {
      const hit = menus.mentioned(Number(data.composerMention));
      // The page's own reference is words in the text (Coding's `@path`); a search hit goes onto the strip, as a pick from ＋ does.
      if (hit && "insert" in hit) { field.setRangeText(`${hit.insert} `, field.selectionStart, field.selectionEnd, "end"); window.molisFit?.(field); }
      else if (hit) c.items = [...c.items, { key: itemKey(), title: hit.title, state: "attached", from: hit.plugin_title,
        material: { kind: "material", ref: { subject: hit.subject, pin: { mode: "current", read_revision: hit.revision } }, title: hit.title, source: hit.source, search: { hit_id: hit.hit_id, snippet: hit.snippet, plugin_id: hit.plugin_id, plugin_title: hit.plugin_title } } }];
      c.requestId = ""; drafts.save(); field.focus(); return c.paint();
    }
    if (data.composerCommand) { const command = options.commands?.[Number(data.composerCommand)]; menus.untype(); c.close(); field.focus(); return command?.run(); }
    if (data.composerMore !== undefined) return void target.setAttribute("aria-expanded", String(target.getAttribute("aria-expanded") !== "true"));
    if (data.composerControl) {
      const control = options.controls?.find((one) => one.id === data.composerControl);
      if (control?.kind === "toggle") { const on = target.getAttribute("aria-pressed") !== "true"; target.setAttribute("aria-pressed", String(on)); control.change?.(on); }
      if (control?.kind === "button") control.run();
    }
    if (data.composerNotice !== undefined) return options.notice?.()?.action?.run();
    if (data.composerReceiver !== undefined) c.ai?.receiver?.()?.open?.();
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
    const plain = !composing(event) && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (plain && (event.key === "ArrowDown" || event.key === "ArrowUp") && menus.step(event.key === "ArrowDown" ? 1 : -1)) return event.preventDefault();
    if (plain && !event.shiftKey && (event.key === "Enter" || event.key === "Tab") && menus.take()) return event.preventDefault();
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
    // Chinese punctuation mode types `、` for `/` and may type `＠` for `@`: both open the same menus.
    if ((data === "/" || data === "、") && before === data && options.commands?.length) { c.typed = before; menus.openAdd(false); }
    // `@` after a space looks up the words that follow it: the system search (§3.3) in every page that offers sources, or the page's own references.
    else if ((data === "@" || data === "＠") && /(^|\s)[@＠]$/u.test(before) && (options.mentions || c.offersSources)) menus.mention(before.length - 1);
    else if (c.mention) menus.mention();
    // The words after a `/` that opened the menu narrow its commands, until the line is left or the menu closed.
    else if (c.typed && c.open && /^[/、][^\n]{0,80}$/u.test(before)) { c.typed = before; menus.narrow(); }
    else if (c.typed) { c.close(); c.typed = ""; }
    c.paint();
  }, { signal });
  document.addEventListener("pointerdown", (event) => { if (c.open && !shell.contains(event.target as Node)) c.close(); }, { capture: true, signal });
}

globalThis.molisComposerProgram ??= mount;
