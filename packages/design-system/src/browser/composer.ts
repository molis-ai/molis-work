import type { ComposerMaterial, ComposerPickItem } from "@molis-ai/molis-work-contracts/platform/composer";
import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { ComposerHandle, ComposerOptions, ComposerOutcome } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { formatMessage, renderComposer, type MwComposerOptions, type MwComposerStatus } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderComposerAddMenu, renderComposerDeliveryMenu, renderComposerPick, renderComposerRestore, renderComposerStrip, type ComposerMenuSource, type Fill } from "../composer-parts.js";
import {
  COMPOSER_DRAFT_PREFIX, ENTER_HINT_KEY, composerDeliveries, composerDraft, composerDraftKey, composerGenerations, composerKey, composing,
  pickComposerDelivery, staleComposerDrafts, wantsEnterHint,
} from "../composer-rules.js";

/**
 * The unified input's one program per document (specs/unified-input-voice/implementation-plan.md §3.1–3.5, slice K2):
 * `window.molisComposer(root, options)` mounts one composer in `root` and gives its handle. The first screen is the SDK's
 * `renderComposer()` (a page may have drawn it already; it is kept, so the text area and its caret are never replaced). After that
 * the program draws the parts again from the same function and swaps only those (the receiver row, the status line, the end of the
 * bar), and puts in what only it knows: the attachment strip, the restored-draft line and the menus (composer-parts.ts).
 *
 * - Keys and the input method are composer-rules.ts's: Enter breaks the line, ⌘/Ctrl+Enter sends (a supplement while a turn runs),
 *   ⌘/Ctrl+Shift+Enter is for the next turn; nothing happens while a composition is open. Esc closes this composer's own menu only.
 * - A send locks the button until it settles and carries one `request_id`, kept for a retry of the same text and dropped once the
 *   text changes. Only `sent` clears the box; `failed` keeps everything and marks the materials the target could not read; `unknown`
 *   offers 查一下 instead of another send.
 * - Every mount is a generation: mounting the same root again or `destroy` aborts the last one's signal, and whatever comes back
 *   for it later (an outcome, an upload, a pick, a draft read) is dropped. A page that takes the root away calls `destroy` first.
 * - A source in ＋ is called through the Workbench's own route, as the person (S-composer-source-call). A framed plugin page has no
 *   such route: its composer lists no sources, only its own files and commands.
 */

type Request = <T>(url: string, init: { body?: unknown; signal?: AbortSignal }) => Promise<T>;
type Item = { title: string; state: "reading" | "attached" | "failed"; reason?: string; material?: ComposerMaterial; from?: string };
type Source = ComposerMenuSource & { capability_id: string; version: number; provider_id: string };
type Status = MwComposerStatus | undefined;

const instances = new WeakMap<HTMLElement, () => void>();
const mac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
const framed = self !== top;
const http = () => (globalThis as { molisWorkRequest?: Request }).molisWorkRequest;
const route = (path: string) => (document.body.dataset.routePrefix || "") + path;
const storage = () => localStorage;
let count = 0;

function hint(): { shown(): boolean; done(): void } {
  return {
    shown: () => { try { return storage().getItem(ENTER_HINT_KEY) === "done"; } catch { return true; } },
    done: () => { try { storage().setItem(ENTER_HINT_KEY, "done"); } catch { /* the hint is a convenience: not shown again this page either way */ } },
  };
}

function mount(root: HTMLElement, options: ComposerOptions): ComposerHandle {
  instances.get(root)?.();
  const life = new AbortController(), queries = composerGenerations(), labels = options.labels;
  const ai = options.kind === "ai" ? options : null;
  const lang = document.documentElement.lang || undefined;
  const fill: Fill = (text, values) => formatMessage(text, Object.entries(values).map(([name, value]) => ({ name, kind: "text", text: value })), lang);
  const first = (): MwComposerOptions => {
    const common = { text: field?.value ?? "", add: Boolean(options.attachments || options.commands?.length || offersSources), ...(options.controls ? { controls: options.controls } : {}),
      ...(options.voice ? { voice: options.voice } : {}) };
    if (!ai) return { kind: "plain", labels, ...common };
    const receiver = ai.receiver?.();
    return { kind: "ai", labels: ai.labels, ...common, ...(receiver ? { receiver: { label: receiver.label, ...(receiver.reset ? { resetLabel: receiver.resetLabel ?? fill(labels.remove, { name: receiver.label }) } : {}) } } : {}) };
  };
  const offersSources = !framed && (options.sources ?? Boolean(ai));
  let field: HTMLTextAreaElement | null = null;
  if (!root.querySelector(".mw-composer")) root.innerHTML = renderComposer(first());
  const shell = root.querySelector<HTMLElement>(".mw-composer")!, box = shell.querySelector<HTMLElement>(".mw-composer__box")!;
  field = shell.querySelector<HTMLTextAreaElement>(".mw-composer__input")!;
  const id = shell.id ||= `mw-composer-${++count}`;
  const once = hint(), signal = life.signal;

  // What the composer knows now.
  let running = false, phase: "" | "sending" | "failed" | "unknown" = "", failure = "", check: (() => Promise<"sent" | "not-sent" | "unknown">) | null = null;
  let requestId = "", items: Item[] = [], note: Status, unsaved = false, restored = "", stopping = false;
  let sources: Source[] | "unavailable" | undefined, picking: { source: Source; query: string; found?: ComposerPickItem[] | string } | null = null, typed = "";
  let open: HTMLElement | null = null, painted = "";

  const draftKey = "conversation" in options.draft ? composerDraftKey({ project: document.body.dataset.projectId || "home",
    install: root.closest<HTMLElement>("[data-plugin-owner]")?.dataset.pluginOwner || document.body.dataset.pluginId || "workbench",
    entry: options.entry, conversation: options.draft.conversation }) : "";
  const local = draftKey ? composerDraft(storage, draftKey) : null;
  const adapter = "adapter" in options.draft ? options.draft.adapter : null;

  const attached = () => items.filter((item) => item.state === "attached" && item.material).map((item) => item.material!);
  const blocked = () => items.some((item) => item.state !== "attached");
  const busy = () => phase === "sending" || phase === "unknown";
  const sendable = () => !busy() && !blocked() && (field!.value.trim() !== "" || attached().length > 0);

  const status = (): Status => {
    if (phase === "sending") return { caption: labels.sending, text: labels.sendingText };
    if (phase === "failed") return { caption: labels.failed, text: failure, action: labels.retry, actionId: "retry" };
    if (phase === "unknown") return { caption: labels.unknown, text: labels.unknownText, action: labels.check, actionId: "check" };
    if (items.some((item) => item.state === "failed")) return { caption: labels.notice, text: labels.blocked, tone: "blocked" };
    if (note) return note;
    if (unsaved) return { caption: labels.notice, text: labels.unsaved, tone: "attention" };
    if (ai && running) return { caption: ai.labels.running, text: ai.labels.runningText };
    return undefined;
  };

  /** Draws the parts again from the first screen's function; the text area and an open menu stay as they are. */
  function paint(controls = false) {
    if (signal.aborted) return;
    const state = phase === "failed" || busy() ? phase : ai && running ? "running" : undefined;
    const now = status(), drawn = { ...first(), ...(state ? { state } : {}), ...(now ? { status: now } : {}) } as MwComposerOptions;
    const fresh = document.createElement("template");
    fresh.innerHTML = renderComposer(drawn);
    const next = fresh.content.firstElementChild as HTMLElement;
    state ? shell.dataset.state = state : delete shell.dataset.state;
    const swap = (selector: string, after: Element) => {
      const old = shell.querySelector(selector), part = next.querySelector(selector);
      if (part) old ? old.replaceWith(part) : after.after(part); else old?.remove();
    };
    swap(".mw-composer__status", shell.querySelector(".mw-composer__text")!);
    const to = next.querySelector(".mw-composer__to"), had = shell.querySelector(".mw-composer__to");
    if (to) had ? had.replaceWith(to) : shell.prepend(to); else had?.remove();
    const end = next.querySelector<HTMLElement>(".mw-composer__end")!;
    for (const button of end.querySelectorAll<HTMLButtonElement>("[data-composer-send]")) button.disabled = !sendable();
    end.querySelector<HTMLButtonElement>("[data-composer-stop]")?.toggleAttribute("disabled", stopping);
    if (end.outerHTML !== painted) { if (open && shell.querySelector(".mw-composer__end")?.contains(open)) close(); painted = end.outerHTML; shell.querySelector(".mw-composer__end")!.replaceWith(end); }
    if (controls) { close(); shell.querySelector(".mw-composer__start")!.replaceWith(next.querySelector(".mw-composer__start")!); }
    strip();
  }
  function strip() {
    box.querySelector(".mw-composer__files")?.remove();
    box.querySelector(".mw-composer__restore")?.remove();
    const html = renderComposerStrip(labels, items, fill) + (restored ? renderComposerRestore(labels, restored, fill) : "");
    if (html) box.insertAdjacentHTML("afterbegin", html);
  }

  // Drafts: the platform's on this machine, throttled, or the owner's own through its adapter.
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (signal.aborted) return;
      const text = field!.value;
      if (local) { const ok = local.write(text); if (ok === unsaved) { unsaved = !ok; paint(); } }
      else adapter?.write(text).then(() => { if (unsaved && !signal.aborted) { unsaved = false; paint(); } }, () => { if (!signal.aborted && !unsaved) { unsaved = true; paint(); } });
    }, 500);
  };
  const restore = (text: string, at?: string) => {
    if (signal.aborted || !text.trim() || field!.value.trim()) return;
    field!.value = text;
    window.molisFit?.(field!);
    restored = at ? formatMessage("{time}", [{ name: "time", kind: "date", at, style: "relative" }], lang) : "";
    paint();
  };
  if (local) { const draft = local.read(); if (draft === false) unsaved = true; else if (draft) restore(draft.text, draft.at); }
  else adapter?.read(signal).then((text) => restore(text), () => { if (!signal.aborted) { unsaved = true; paint(); } });

  // Menus: ＋ (files, sources, commands) and the delivery ▾. One is open at a time; Esc and a click elsewhere close it.
  function show(menu: HTMLElement, html: string, focus = true) {
    if (open !== menu) close();
    menu.innerHTML = html;
    menu.hidden = false; open = menu;
    menu.parentElement?.querySelector("[aria-expanded]")?.setAttribute("aria-expanded", "true");
    if (focus) menu.querySelector<HTMLElement>("[data-composer-query], [role^=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
  }
  function close(refocus = false) {
    if (!open) return;
    const menu = open; open = null; picking = null; queries.end();
    const opener = menu.parentElement?.querySelector<HTMLElement>("[aria-expanded]");
    opener?.setAttribute("aria-expanded", "false");
    const inside = menu.contains(document.activeElement);
    menu.hidden = true; menu.replaceChildren();
    if (refocus || inside) (typed ? field : opener)?.focus({ preventScroll: true });
  }
  const addMenu = () => shell.querySelector<HTMLElement>(".mw-composer__start [data-compose-menu]");
  function drawAdd(focus = true) {
    const menu = addMenu();
    if (!menu) return;
    if (picking) return show(menu, renderComposerPick(labels, picking.source, picking.query, picking.found), focus);
    show(menu, renderComposerAddMenu(labels, { files: Boolean(options.attachments), ...(offersSources ? sources === undefined ? {} : { sources } : { sources: "unavailable" as const }),
      commands: options.commands ?? [] }), focus);
  }
  function openAdd(focus = true) {
    drawAdd(focus);
    if (!offersSources || sources !== undefined) return;
    http()?.<{ sources: Source[] }>(route("/api/composer/sources"), { body: { layer: options.kind }, signal })
      .then((found) => { sources = found.sources; }, () => { sources = "unavailable"; })
      .then(() => { if (!signal.aborted && !picking && open === addMenu()) drawAdd(false); });
  }
  function pick(source: Source, query: string) {
    picking = { source, query };
    drawAdd();
    let timer = 0;
    const ask = (words: string) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => queries.latest(
        (aborted) => http()!<{ items: ComposerPickItem[] }>(route("/api/composer/pick"), { signal: aborted, body: {
          layer: options.kind, capability_id: source.capability_id, version: source.version, provider_id: source.provider_id, query: words, limit: 20,
          ...(options.near?.() ? { near: options.near()! } : {}) } }),
        (found) => { if (picking?.source === source) { picking.found = found.items; redrawPick(); } },
        () => { if (picking?.source === source) { picking.found = fill(labels.unavailable, { name: `${source.provider} · ${source.title}` }); redrawPick(); } },
      ), words === query ? 0 : 250);
    };
    const redrawPick = () => {
      const list = open?.querySelector(".mw-menu__group");
      const fresh = document.createElement("template");
      fresh.innerHTML = renderComposerPick(labels, source, picking!.query, picking!.found);
      const group = fresh.content.querySelector(".mw-menu__group");
      if (list && group) list.replaceWith(group);
    };
    ask(query);
    open?.querySelector<HTMLInputElement>("[data-composer-query]")?.addEventListener("input", (event) => {
      if (!picking) return;
      picking.query = (event.target as HTMLInputElement).value; picking.found = undefined; redrawPick(); ask(picking.query);
    }, { signal });
  }
  /** A trigger typed into the text (`/` on an empty line, `@` after a space) is taken out once its menu chose something. */
  const untype = () => {
    if (!typed) return;
    const at = field!.selectionStart, before = field!.value.slice(0, at);
    if (before.endsWith(typed)) { field!.value = before.slice(0, -typed.length) + field!.value.slice(at); field!.setSelectionRange(at - typed.length, at - typed.length); }
    typed = "";
  };

  // Attachments: picked, pasted or dropped files go to the page's own upload; each row says how it went.
  const files = Object.assign(document.createElement("input"), { type: "file", multiple: true, hidden: true });
  if (options.attachments?.accept) files.accept = options.attachments.accept;
  shell.append(files);
  async function upload(list: Iterable<File>) {
    const take = options.attachments;
    if (!take) return;
    for (const file of list) {
      const item: Item = { title: file.name, state: "reading" };
      items = [...items, item]; requestId = ""; paint();
      let done: Awaited<ReturnType<typeof take.upload>>;
      try { done = await take.upload(file, signal); } catch (error) { done = { state: "failed", reason: error instanceof Error ? error.message : String(error) }; }
      if (signal.aborted || !items.includes(item)) return;
      Object.assign(item, done.state === "attached" ? { state: "attached", title: done.title, material: { kind: "attachment", ref: done.ref, title: done.title } } : { state: "failed", reason: done.reason });
      paint();
    }
  }
  files.addEventListener("change", () => { void upload([...files.files ?? []]); files.value = ""; }, { signal });
  if (options.attachments) {
    window.molisDropZone?.(box, (on) => box.toggleAttribute("data-dropping", on), undefined, labels.dropRefused);
    box.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); }, { signal });
    box.addEventListener("drop", (event) => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); void upload([...event.dataTransfer.files]); }, { signal });
    field.addEventListener("paste", (event) => { const pasted = [...event.clipboardData?.files ?? []]; if (pasted.length) { event.preventDefault(); void upload(pasted); } }, { signal });
  }

  const values = () => Object.fromEntries((options.controls ?? []).flatMap((control) => {
    const node = shell.querySelector<HTMLElement>(`[data-composer-control="${CSS.escape(control.id)}"]`);
    if (control.kind === "select") return [[control.id, (node as HTMLSelectElement | null)?.value ?? control.value]];
    if (control.kind === "toggle") return [[control.id, (node?.getAttribute("aria-pressed") ?? String(control.on)) === "true" ? "on" : "off"]];
    return [];
  }));

  async function send(mode?: AgentSteerMode, key = false) {
    if (signal.aborted || busy()) return;
    note = undefined;
    if (blocked()) return paint();
    if (!sendable()) return;
    const missing = options.required?.();
    if (missing) { note = { caption: labels.notice, text: missing, tone: "attention" }; return paint(); }
    let delivery: AgentSteerMode | undefined;
    if (ai && running) {
      const chosen = pickComposerDelivery(mode ?? "next-boundary", composerDeliveries(true, ai.delivery?.(), ai.labels.unsupported));
      if ("refused" in chosen) { note = { caption: labels.notice, text: chosen.refused, tone: "attention" }; return paint(); }
      delivery = chosen.mode;
    } else if (mode && mode !== "next-boundary") return;
    requestId ||= crypto.randomUUID();
    const text = field!.value, materials = attached();
    phase = "sending"; close(); paint();
    let outcome: ComposerOutcome;
    try { outcome = await options.submit({ text, materials, ...(delivery ? { delivery } : {}), controls: values(), request_id: requestId }, signal); }
    catch (error) { outcome = { state: "failed", message: error instanceof Error ? error.message : String(error) }; }
    if (signal.aborted) return;
    if (key) once.done();
    settle(outcome);
  }
  function settle(outcome: ComposerOutcome) {
    phase = ""; check = null;
    if (outcome.state === "sent") {
      field!.value = ""; window.molisFit?.(field!); items = []; requestId = ""; restored = ""; clearTimeout(saveTimer);
      if (local) unsaved = !local.write(""); else void adapter?.write("").catch(() => undefined);
      const receipt = outcome.receipt;
      note = receipt && ai ? receipt.replayed ? { caption: labels.notice, text: ai.labels.replayed } : receipt.delivered === "queued" ? { caption: labels.notice, text: ai.labels.queued } : undefined : undefined;
    } else if (outcome.state === "failed") {
      phase = "failed"; failure = outcome.message;
      const listed = attached();
      for (const { index, reason } of outcome.unreadable ?? []) {
        const item = items.find((one) => one.material === listed[index]);
        if (item) Object.assign(item, { state: "failed", reason });
      }
      if (outcome.unreadable?.length) phase = "";
    } else { phase = "unknown"; check = outcome.check; }
    paint();
  }
  async function confirm() {
    if (!check) return;
    const asked = check; phase = "sending"; paint();
    let answer: "sent" | "not-sent" | "unknown";
    try { answer = await asked(); } catch { answer = "unknown"; }
    if (signal.aborted) return;
    if (answer === "sent") settle({ state: "sent" });
    else if (answer === "not-sent") { phase = ""; check = null; note = { caption: labels.notice, text: labels.notSent }; paint(); }
    else { phase = "unknown"; check = asked; paint(); }
  }

  shell.addEventListener("click", (event) => {
    const target = (event.target as Element).closest<HTMLElement>("button, [role^=menuitem]");
    if (!target || !shell.contains(target) || target.matches(":disabled")) return;
    const data = target.dataset;
    if (data.composerAdd !== undefined) { typed = ""; return open === addMenu() ? close(true) : openAdd(); }
    if (data.composeMenuToggle !== undefined && ai) {
      const menu = target.parentElement!.querySelector<HTMLElement>("[data-compose-menu]")!;
      return open === menu ? close(true) : show(menu, renderComposerDeliveryMenu(id, ai.labels, composerDeliveries(running, ai.delivery?.(), ai.labels.unsupported), mac));
    }
    if (data.composerDelivery) { const mode = data.composerDelivery as AgentSteerMode; close(); field!.focus(); return void send(mode); }
    if (data.composerSend !== undefined) return void send();
    if (data.composerStop !== undefined && ai?.stop) {
      stopping = true; paint();
      return void ai.stop(signal).catch(() => undefined).finally(() => { if (!signal.aborted) { stopping = false; paint(); } });
    }
    if (data.composerStatusAction === "retry") return void send();
    if (data.composerStatusAction === "check") return void confirm();
    if (data.composerStatusAction === "hint") { note = undefined; once.done(); return paint(); }
    if (data.composerClear !== undefined) { field!.value = ""; restored = ""; window.molisFit?.(field!); local?.write(""); void adapter?.write("").catch(() => undefined); field!.focus(); return paint(); }
    if (data.composerRemove) { items = items.filter((_, index) => index !== Number(data.composerRemove)); requestId = ""; paint(); return field!.focus(); }
    if (data.composerFiles !== undefined) { close(); untype(); return files.click(); }
    if (data.composerSource && Array.isArray(sources)) return pick(sources[Number(data.composerSource)]!, "");
    if (data.composerPick && picking && Array.isArray(picking.found)) {
      const chosen = picking.found[Number(data.composerPick)]!, source = picking.source;
      items = [...items, { title: chosen.title, state: "attached", from: `${source.provider} · ${source.title}`,
        material: { kind: "material", ref: chosen.ref, title: chosen.title, source: { capability_id: source.capability_id, version: source.version, provider_id: source.provider_id } } }];
      untype(); requestId = ""; close(); field!.focus(); return paint();
    }
    if (data.composerCommand) { const command = options.commands?.[Number(data.composerCommand)]; untype(); close(); field!.focus(); return command?.run(); }
    if (data.composerMore !== undefined) return void target.setAttribute("aria-expanded", String(target.getAttribute("aria-expanded") !== "true"));
    if (data.composerControl) {
      const control = options.controls?.find((one) => one.id === data.composerControl);
      if (control?.kind === "toggle") { const on = target.getAttribute("aria-pressed") !== "true"; target.setAttribute("aria-pressed", String(on)); control.change?.(on); }
      if (control?.kind === "button") control.run();
    }
    if (data.tagRemove !== undefined && ai) ai.receiver?.()?.reset?.();
  }, { signal });
  shell.addEventListener("change", (event) => {
    const select = (event.target as Element).closest<HTMLSelectElement>("select[data-composer-control]");
    const control = options.controls?.find((one) => one.id === select?.dataset.composerControl);
    if (select && control?.kind === "select") control.change?.(select.value);
  }, { signal });
  shell.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); return close(true); }
    if (event.target !== field) return;
    const key = composerKey(event, options.submitKeys !== false);
    if (key) { event.preventDefault(); return void send(key === "after-run" ? "after-run" : undefined, true); }
    if (options.submitKeys !== false && !composing(event) && !once.shown() && wantsEnterHint(event, field.value, field.selectionStart)) {
      once.done();
      note = { caption: labels.notice, text: fill(labels.enterHint, { keys: mac ? "⌘↵" : "Ctrl+↵" }), action: labels.enterHintDismiss, actionId: "hint" };
      paint();
    }
  }, { signal });
  field.addEventListener("input", (event) => {
    const data = (event as InputEvent).data;
    if (phase === "failed") { phase = ""; requestId = ""; } else if (phase !== "unknown") requestId = "";
    if (note && note.actionId !== "hint") note = undefined;
    restored = "";
    save();
    const before = field!.value.slice(0, field!.selectionStart);
    if (data === "/" && before === "/" && options.commands?.length) { typed = "/"; openAdd(false); }
    else if (data === "@" && /(^|\s)@$/.test(before) && offersSources) { typed = "@"; openAdd(false); }
    else if (typed) close();
    paint();
  }, { signal });
  const outside = (event: Event) => { if (open && !shell.contains(event.target as Node)) close(); };
  document.addEventListener("pointerdown", outside, { capture: true, signal });

  /** Lets go: every listener, the pending draft write, any open query; whatever comes back for this mount is dropped. */
  function release() {
    if (signal.aborted) return;
    close(); life.abort(); queries.end(); clearTimeout(saveTimer); files.remove();
    if (instances.get(root) === release) instances.delete(root);
  }
  instances.set(root, release);
  paint(true);

  return {
    setRunning(next) { if (running !== next) { running = next; if (!next) note = undefined; paint(); } },
    refresh() { paint(true); },
    focus() { field!.focus(); },
    insert(text) {
      const at = field!.selectionStart, end = field!.selectionEnd;
      field!.setRangeText(text, at, end, "end"); window.molisFit?.(field!); save(); paint();
    },
    destroy: release,
  };
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
