/**
 * Browser side. One state object; every click turns it into a new one with the pure functions in ui-state.ts and the
 * stage is drawn again from it. The only things kept across a redraw are the scroll position, the focus and the text
 * being typed, so that a receipt changing under the reader never moves what they were reading.
 */
import type { Recording } from "./facts.ts";
import { renderTitlebar } from "./render-chrome.ts";
import { renderStage } from "./render.ts";
import { TREATMENT_SHORT } from "./labels.ts";
import * as U from "./ui-state.ts";

const json = (id: string): Recording => JSON.parse(document.getElementById(id)?.textContent ?? "{}") as Recording;
const recordings: Record<U.Layout, Recording> = { assistant: json("data-assistant"), coding: json("data-coding") };
const shell = (id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`the preview shell is missing #${id}`);
  return element;
};
const chrome = shell("chrome");
const stage = shell("stage");
const live = shell("live");

const rec = (): Recording => recordings[ui.layout];
const prefersDark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
/** `?layout=coding&scene=question&cp=asked&theme=dark` opens the page at a given place: for screenshots and the browser tests. */
function opening(): U.Ui {
  const query = new URLSearchParams(location.search);
  const layout: U.Layout = query.get("layout") === "coding" ? "coding" : "assistant";
  const theme = query.get("theme") === "dark" || (query.get("theme") === null && prefersDark) ? "dark" : "light";
  const base = U.initial(recordings[layout], layout, theme);
  const wanted = query.get("scene");
  if (wanted === null || !recordings[layout].scenes.some(one => one.id === wanted)) return base;
  const scene = U.sceneOf(recordings[layout], wanted);
  const cp = query.get("cp");
  return U.toScene(recordings[layout], base, wanted, cp !== null && scene.checkpoints.some(one => one.id === cp) ? cp : undefined);
}
let ui: U.Ui = opening();
let timer: number | undefined;
let composing = false;
let seen = new Map<string, string>();

/** Where focus was, by what it does rather than by node identity (the nodes are replaced). */
function focusKey(el: Element | null): string | undefined {
  if (!(el instanceof HTMLElement)) return undefined;
  if (el.matches("[data-composer-input]")) return "composer";
  if (el.matches("[data-draft-note]")) return "draft-note";
  const action = el.dataset["action"];
  if (action === undefined) return undefined;
  const target = el.dataset["id"] ?? el.dataset["mode"] ?? el.dataset["chip"] ?? el.dataset["scene"] ?? el.dataset["checkpoint"] ?? el.dataset["layout"] ?? el.dataset["n"] ?? el.dataset["kind"] ?? "";
  return `${action}|${target}`;
}
function findByKey(key: string): HTMLElement | null {
  if (key === "composer") return document.querySelector<HTMLElement>("[data-composer-input]");
  if (key === "draft-note") return document.querySelector<HTMLElement>("[data-draft-note]");
  for (const el of document.querySelectorAll<HTMLElement>("[data-action]")) if (focusKey(el) === key && !el.hasAttribute("disabled")) return el;
  return null;
}

function announce(next: ReadonlyMap<string, string>): void {
  const changed: string[] = [];
  for (const [id, text] of next) if (seen.get(id) !== text && seen.size > 0) changed.push(text);
  seen = new Map(next);
  if (changed.length === 0) return;
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = changed.join("；"); });
}

function draw(options: { follow?: boolean } = {}): void {
  const recording = rec();
  const thread = stage.querySelector<HTMLElement>("[data-thread]");
  const before = thread?.scrollTop ?? 0;
  const key = focusKey(document.activeElement);
  const field = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement ? document.activeElement : null;
  const caret = field === null ? null : [field.selectionStart, field.selectionEnd] as const;
  document.documentElement.dataset["theme"] = ui.theme;
  chrome.innerHTML = renderTitlebar(recording, ui);
  stage.innerHTML = renderStage(recording, ui);
  const next = stage.querySelector<HTMLElement>("[data-thread]");
  // Only playback and scene changes follow the end of the thread. Opening a detail or a menu keeps the reading position.
  if (next !== null) next.scrollTop = options.follow === true ? next.scrollHeight : before;
  if (key !== undefined) {
    const again = findByKey(key);
    again?.focus({ preventScroll: true });
    if (again instanceof HTMLInputElement || again instanceof HTMLTextAreaElement) if (caret !== null && caret[0] !== null && caret[1] !== null) again.setSelectionRange(caret[0], caret[1]);
  }
  const v = U.view(recording, ui);
  announce(new Map(v.rows.flatMap(row => (row.kind === "input" ? [[row.receipt.steerId, `#${String(row.n)}：${row.headline.text}`] as const] : []))));
}

function set(next: U.Ui, options: { follow?: boolean } = {}): void {
  ui = next;
  if (ui.playing && timer === undefined) timer = window.setInterval(tick, 750);
  if (!ui.playing && timer !== undefined) { clearInterval(timer); timer = undefined; }
  draw(options);
}
function tick(): void {
  if (U.atEnd(rec(), ui)) { set({ ...ui, playing: false }); return; }
  set(U.step(rec(), ui), { follow: true });
}

function rowIdFor(n: number): string | undefined {
  const row = U.view(rec(), ui).rows.find(one => one.kind === "input" && one.n === n);
  return row?.kind === "input" ? `${row.receipt.steerId}@${String(row.run)}` : undefined;
}

type Handler = (el: HTMLElement) => void;
const actions: Record<string, Handler> = {
  toggle: el => {
    const id = el.dataset["id"] ?? "";
    set({ ...ui, expanded: U.toggle(ui.expanded, id) });
    if (ui.expanded.includes(id)) document.getElementById(`detail-${id}`)?.scrollIntoView({ block: "nearest" });
  },
  tray: () => set({ ...ui, trayOpen: !ui.trayOpen }),
  "tray-open": () => set({ ...ui, trayOpen: true }),
  "open-input": el => {
    const id = rowIdFor(Number(el.dataset["n"]));
    if (id === undefined) return;
    set({ ...ui, trayOpen: false, expanded: ui.expanded.includes(id) ? ui.expanded : [...ui.expanded, id] });
    const target = document.getElementById(`in-${id}`);
    target?.scrollIntoView({ block: "nearest" });
    target?.querySelector<HTMLElement>(".rc-status")?.focus({ preventScroll: true });
  },
  correct: el => {
    set({ ...ui, correcting: ui.correcting === el.dataset["id"] ? null : (el.dataset["id"] ?? null), draft: U.DEFAULT_DRAFT });
    document.querySelector<HTMLElement>(".rc-correct")?.scrollIntoView({ block: "nearest" });
  },
  "draft-kind": el => set({ ...ui, draft: { ...ui.draft, kind: (el.dataset["kind"] as U.CorrectionKind | undefined) ?? "treatment" } }),
  "cancel-correction": () => set({ ...ui, correcting: null }),
  "submit-correction": el => {
    const id = (el.dataset["id"] ?? "").split("@")[0] ?? "";
    const treatment = TREATMENT_SHORT[ui.draft.treatment] ?? ui.draft.treatment;
    const note = ui.draft.note.trim();
    const summary = ui.draft.kind === "treatment" ? `${treatment}${note === "" ? "" : `（${note}）`}` : `补一句：${note === "" ? "（没写）" : note}`;
    set(U.addCorrection(ui, { inputId: id, kind: ui.draft.kind, summary, recorded: false }));
  },
  insist: () => { const next = U.insist(rec(), ui); if (next !== undefined) set(next, { follow: true }); },
  withdraw: el => set(U.withdrawRecorded(rec(), ui, el.dataset["id"] ?? "")),
  "send-menu": () => set({ ...ui, menu: ui.menu === "send" ? null : "send" }),
  "send-mode": el => set({ ...ui, sendMode: (el.dataset["mode"] as U.SendMode | undefined) ?? "next-boundary", menu: null }),
  chip: el => set({ ...ui, chip: (el.dataset["chip"] as "this-run" | "questionnaire" | undefined) ?? "this-run" }),
  answer: () => set(U.toCheckpoint(rec(), ui, "answered"), { follow: true }),
  carry: () => set(U.toCheckpoint(rec(), ui, "carried"), { follow: true }),
  "withdraw-all": () => set(U.toScene(rec(), ui, "stopped-withdraw", "withdrawn"), { follow: true }),
  recover: () => set(U.toCheckpoint(rec(), ui, "recovered"), { follow: true }),
  layout: el => {
    const layout = el.dataset["layout"] === "coding" ? "coding" : "assistant";
    seen = new Map();
    set(U.initial(recordings[layout], layout, ui.theme), { follow: true });
  },
  theme: () => set({ ...ui, theme: ui.theme === "dark" ? "light" : "dark" }),
  demo: () => set({ ...ui, menu: ui.menu === "demo" ? null : "demo" }),
  scene: el => { seen = new Map(); set({ ...U.toScene(rec(), ui, el.dataset["scene"] ?? "main"), menu: "demo" }, { follow: true }); },
  checkpoint: el => set({ ...U.toCheckpoint(rec(), ui, el.dataset["checkpoint"] ?? ""), menu: "demo" }, { follow: true }),
  restart: () => { seen = new Map(); set({ ...U.restart(ui), menu: "demo" }, { follow: true }); },
  play: () => set({ ...ui, playing: !ui.playing }),
  step: () => set(U.step(rec(), ui), { follow: true }),
};

document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target : null;
  const el = target?.closest<HTMLElement>("[data-action]") ?? null;
  if (el === null || el.hasAttribute("disabled") || el instanceof HTMLInputElement) return;
  const handler = actions[el.dataset["action"] ?? ""];
  if (handler === undefined) return;
  handler(el);
});
document.addEventListener("click", event => {
  // Click outside an open menu closes it.
  if (ui.menu === null) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".rc-mode, .pv-demo") === null) set({ ...ui, menu: null });
});
document.addEventListener("change", event => {
  const el = event.target instanceof HTMLInputElement ? event.target : null;
  if (el?.dataset["action"] === "draft-treatment") ui = { ...ui, draft: { ...ui.draft, treatment: el.value } };
});
document.addEventListener("input", event => {
  const el = event.target;
  if (el instanceof HTMLTextAreaElement && el.matches("[data-draft-note]")) ui = { ...ui, draft: { ...ui.draft, note: el.value } };
  if (el instanceof HTMLInputElement && el.matches("[data-composer-input]")) ui = { ...ui, note: el.value };
});
document.addEventListener("compositionstart", () => { composing = true; });
document.addEventListener("compositionend", () => { setTimeout(() => { composing = false; }, 0); });
document.addEventListener("submit", event => {
  event.preventDefault();
  // Enter that confirms Chinese input must not send.
  if (composing || (event as SubmitEvent & { isComposing?: boolean }).isComposing === true) return;
  set({ ...U.sendRecorded(rec(), ui), note: "" }, { follow: true });
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || composing) return;
  if (ui.menu !== null) {
    const opener = ui.menu === "send" ? "send-menu|" : "demo|";
    set({ ...ui, menu: null });
    findByKey(opener)?.focus();
    return;
  }
  if (ui.correcting !== null) { set({ ...ui, correcting: null }); return; }
  const open = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>(".rc-input") : null;
  const id = open?.id.slice(3);
  if (id !== undefined && ui.expanded.includes(id)) {
    set({ ...ui, expanded: U.toggle(ui.expanded, id) });
    document.getElementById(`in-${id}`)?.querySelector<HTMLElement>(".rc-status")?.focus();
    return;
  }
  if (ui.trayOpen) { set({ ...ui, trayOpen: false }); findByKey("tray|")?.focus(); }
});

draw({ follow: true });
