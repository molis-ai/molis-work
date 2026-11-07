import type { UiPageTaskGrants, UiTaskGrantsAreaState } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  TASK_GRANT_SUBJECT_KEY_PATTERN, type TaskGrantCategory, type TaskGrantCategoryReference, type TaskGrantCategoryState, type TaskGrantSetCategory,
} from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { FramedArea, FramedAreaRefusal, PageFramedAreas } from "./framed-area.js";
import { childPlaces } from "./over-frame.js";
import type { FrameScope, TaskGrantsDown, TaskGrantsUp, Translate } from "./types.js";

/**
 * The platform's 「能读的数据」 area on one of a page's own background tasks (specs/proactive-assistant/task-grants-platform-area.md):
 * the page gives an empty element and the task's key; the shell draws the categories and their switches outside the page, and
 * only a real, deliberate press there writes, as the person, through `agent.task_grants.set`.
 */

/** The one thing the page hears when an area cannot be shown, whatever the reason: the frame rejects with it, the shell sends it. */
export const TASK_GRANTS_UNAVAILABLE = "暂时不能显示";
/** The area's two heights (§3.1), by width alone; set on the component board's specimens so five categories need no scrolling. */
export const TASK_GRANTS_AREA_HEIGHTS = { narrow: 468, wide: 396 } as const;

type Status = TaskGrantCategoryState["status"] | "off";
interface Row { readonly ref: TaskGrantCategoryReference; readonly name: string; readonly title: string; readonly description: string; readonly status: Status }
interface Reads { readonly categories: readonly TaskGrantCategory[]; readonly subject: { readonly revision: string; readonly categories: readonly TaskGrantCategoryState[] } }
/** What the person did, as `set` takes it (§3.6) and what the line says after it. */
type Change = { readonly kind: "on" | "off" | "allow" | "remove" | "undo"; readonly row: Row; readonly categories: TaskGrantSetCategory[]; readonly undo?: (now: Reads["subject"]) => TaskGrantSetCategory[] };
/** What the area's one line says now; `act` is its one button. */
export type TaskGrantsLine = { readonly text: string; readonly act?: "undo" | "retry" | "read"; readonly tone?: "danger" };

const nameOf = (ref: TaskGrantCategoryReference) => ref.provider_id + "\n" + (ref.group_id ?? "");
const refOf = (ref: TaskGrantCategoryReference): TaskGrantSetCategory => ref.group_id === undefined ? { provider_id: ref.provider_id } : { provider_id: ref.provider_id, group_id: ref.group_id };

/**
 * A provider's words in the page's language, looked up as `LF` does: the shell's dictionary (where a built-in plugin's summary
 * and the platform's own categories have their English), then the plugin's own English (`ui.translations`), else as written.
 */
function providerWords(category: TaskGrantCategory, text: string): string {
  return globalThis.MOLIS_WORK_MESSAGES?.[text] ?? (category.plugin_id ? globalThis.MOLIS_WORK_PLUGIN_WORDS?.[category.plugin_id]?.[text] : undefined) ?? text;
}

/** One row per category: what this project offers, then what the task holds that is no longer offered (unavailable or removed). */
export function taskGrantRows(reads: Reads): Row[] {
  const held = new Map(reads.subject.categories.map(category => [nameOf(category), category]));
  const row = (category: TaskGrantCategory, status: Status): Row => ({ ref: refOf(category), name: nameOf(category), status,
    title: providerWords(category, category.title), description: providerWords(category, category.description) });
  const offered = reads.categories.map(category => row(category, held.get(nameOf(category))?.status ?? "off"));
  const seen = new Set(offered.map(item => item.name));
  return [...offered, ...reads.subject.categories.filter(category => !seen.has(nameOf(category))).map(category => row(category, category.status))];
}

/**
 * The `set` a change sends (§3.6): the base is every category the task holds records for, as read, whatever its status, so the
 * Host keeps those records as they are (R1); only the category changed is added, taken off or allowed again. Undo is given only
 * for turning a category on or turning a granted one off.
 */
export function taskGrantChange(kind: "on" | "off" | "allow" | "remove", row: Row, subject: Reads["subject"]): Change {
  const base = subject.categories.map(refOf), without = base.filter(item => nameOf(item) !== row.name);
  if (kind === "on") return { kind, row, categories: [...without, refOf(row.ref)], undo: now => now.categories.map(refOf).filter(item => nameOf(item) !== row.name) };
  if (kind === "allow") return { kind, row, categories: base.map(item => nameOf(item) === row.name ? { ...item, confirm: true } : item) };
  const undo = kind === "off" && row.status === "granted"
    ? (now: Reads["subject"]) => [...now.categories.map(refOf).filter(item => nameOf(item) !== row.name), refOf(row.ref)] : undefined;
  return { kind, row, categories: without, ...(undo ? { undo } : {}) };
}

/** What the page may know after a write: two flags it could read from its own `agent.task_grants.list`. */
const summary = (subject: Reads["subject"]): UiTaskGrantsAreaState => ({
  granted: subject.categories.some(category => category.status === "granted"),
  attention: subject.categories.some(category => category.status === "needs_confirmation" || category.status === "removed"),
});

/** The area's markup: the platform's header, one row per category, and the one line that says what just happened. */
export function taskGrantsAreaHtml(t: Translate, owner: string, rows: readonly Row[], line: TaskGrantsLine, busy: boolean, fresh = false): string {
  const control = (name: string, label: string, act: string, extra = "") =>
    `<button type="button" class="mw-btn mw-btn--sm mw-btn--secondary" data-framed-control="${escape(act + ":" + name)}"${extra}>${escape(label)}</button>`;
  const status = (row: Row) => row.status === "needs_confirmation" ? t("有新的读取能力，允许之前读不到")
    : row.status === "unavailable" ? t("暂时读不到，授权还在") : row.status === "removed" ? t("这一类已不再提供") : "";
  const item = (row: Row) => {
    const note = status(row), on = row.status !== "off";
    const end = row.status === "removed" ? control(row.name, t("移除"), "remove")
      : `${row.status === "needs_confirmation" ? control(row.name, t("允许"), "allow") : ""}<span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch" aria-label="${escape(row.title)}"${on ? " checked" : ""} data-framed-control="${escape("switch:" + row.name)}"><span class="mw-switch__track" aria-hidden="true"></span></span>`;
    return `<li class="mw-item task-grants-area__row" data-task-grants-row="${escape(row.name)}" data-status="${row.status}"><span><strong title="${escape(row.title)}">${escape(row.title)}</strong><small title="${escape(row.description)}">${escape(row.description)}</small>${note ? `<em class="task-grants-area__note">${escape(note)}</em>` : ""}</span><span class="mw-item__end">${end}</span></li>`;
  };
  const list = rows.length ? `<ul class="mw-items task-grants-area__rows">${rows.map(item).join("")}</ul>`
    : `<p class="task-grants-area__empty">${escape(t("这个项目里还没有能读的插件数据。装了待办、日程、笔记一类的插件后，它们会出现在这里。"))}</p>`;
  const act = line.act ? `<button type="button" class="mw-toast__action" data-framed-control="${line.act}">${escape(line.act === "undo" ? t("撤销") : t("重试"))}</button>` : "";
  return `<header class="mw-platform-area__head" data-framed-area-head><span class="mw-platform-area__kicker"><svg aria-hidden="true"><use href="#icon-shield"></use></svg>${escape(t("Molis Work · 只有你能改"))}</span><span class="mw-platform-area__owner" title="${escape(owner)}">${escape(owner)}</span>`
    + `<p class="mw-platform-area__lead">${escape(t("只能读，不能改；只给这个任务；随时可以撤回"))}</p></header>`
    + `<div class="mw-platform-area__body" data-framed-scroll${busy ? ' aria-busy="true"' : ""}>${list}</div>`
    + `<footer class="mw-platform-area__foot" data-framed-area-foot><div class="mw-toast${line.tone === "danger" ? " is-error" : ""}${fresh ? " is-fresh" : ""}" role="status"><span title="${escape(line.text)}">${escape(line.text)}</span>${act}</div></footer>`;
}

/** What the line says after a write, by what the person did (§3.6), and whether it offers undo. */
function doneLine(t: Translate, change: Change): TaskGrantsLine {
  const name = { name: change.row.title };
  if (change.kind === "undo") return { text: t("已撤销刚才的改动") };
  if (change.kind === "on") return { text: t("已允许读{name}，下一次运行起能读到", name), act: "undo" };
  if (change.kind === "allow") return { text: t("已允许{name}的新读取能力；不想要就关掉这一类", name) };
  if (change.kind === "remove") return { text: t("已移除{name}，这一类已不再提供", name) };
  if (change.row.status === "needs_confirmation") return { text: t("已撤回{name}；要再读它，重新打开开关，会按它现在的读取能力允许", name) };
  if (change.row.status === "unavailable") return { text: t("已撤回{name}；它的插件回来之后，重新打开开关才能再读", name) };
  return { text: t("已撤回{name}，下一次运行起读不到", name), act: "undo" };
}

interface Entry { readonly id: number; readonly key: string; readonly area: FramedArea; reads: Reads | null; line: TaskGrantsLine; busy: boolean;
  /** The last change, kept for its undo or for a retry after it failed. */ last: Change | null; drawn?: string }

/**
 * The trusted half (§2–§3). `owner` is the installation's name as the shell lists it. Every write is the person's own `set`
 * through the Host's page route, which takes the installation and project from the page's authority, never from here.
 */
export function pageTaskGrants(port: MessagePort, scope: FrameScope, areas: PageFramedAreas, pageId: string, route: (path: string) => string, t: Translate, owner: string) {
  const entries = new Map<number, Entry>(), pattern = new RegExp(TASK_GRANT_SUBJECT_KEY_PATTERN, "u");
  const send = (message: TaskGrantsDown) => { if (scope.alive) port.postMessage(message); };
  const request = <T>(entry: Entry, body: Record<string, unknown>) => molisWorkRequest<T>(route("/api/host/plugin-page-task-grants"),
    { body: { key: entry.key, ...body }, headers: { "x-molis-context-page": pageId }, scope });
  // The line comes in again only when what it says changes, so a write's busy state does not make it flicker.
  const draw = (entry: Entry) => {
    const fresh = entry.drawn !== undefined && entry.drawn !== entry.line.text;
    entry.drawn = entry.line.text;
    entry.area.redraw(taskGrantsAreaHtml(t, owner, entry.reads ? taskGrantRows(entry.reads) : [], entry.line, entry.busy, fresh));
  };
  const close = (id: number) => { entries.get(id)?.area.close(); entries.delete(id); };
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  const idle = (): TaskGrantsLine => ({ text: t("拨一下即生效，下一次运行起按新的范围读") });

  const read = async (entry: Entry) => {
    entry.reads = await request<Reads>(entry, { mode: "read" });
    scope.assertCurrent();
  };
  /** A change, sent once; the answer is the task's new state, shown as it is without reading again (§6). */
  const write = async (entry: Entry, change: Change) => {
    const subject = entry.reads!.subject;
    entry.busy = true; draw(entry);
    try {
      const answer = await request<{ subject: Reads["subject"] }>(entry, { mode: "set", categories: change.categories, expected_revision: subject.revision });
      if (entries.get(entry.id) !== entry) return;
      entry.reads = { categories: entry.reads!.categories, subject: answer.subject };
      entry.last = change.undo ? change : null; entry.line = doneLine(t, change);
      send({ type: "task-grants-changed", id: entry.id, state: summary(answer.subject) });
    } catch (error) {
      if (entries.get(entry.id) !== entry || !scope.alive) return;
      // Changed elsewhere (the same task open beside, or the grants page): read again, and the undo no longer applies.
      if ((error as { code?: string }).code === "actions.conflict") {
        entry.last = null; entry.line = { text: t("已在别处改动，已刷新") };
        try { await read(entry); } catch { entry.line = { text: t("暂时读不到这个任务能读什么"), act: "read", tone: "danger" }; }
      } else {
        // The switch goes back as it was; an undo that failed is spent (§3.6 「失败」).
        entry.last = change.kind === "undo" ? null : change;
        entry.line = { text: t("没能保存，原来的授权没变"), act: change.kind === "undo" ? undefined : "retry", tone: "danger" };
      }
    } finally {
      if (entries.get(entry.id) === entry) { entry.busy = false; draw(entry); }
    }
  };

  /** A press on one of the area's controls: the six checks of §3.3, then at most one write. */
  const press = (entry: Entry, event: MouseEvent) => {
    const control = (event.target as Element).closest<HTMLElement>("[data-framed-control]");
    if (!control || !entry.area.surface.contains(control)) return;
    // A switch shows the answer, not the press: the browser does not flip it.
    event.preventDefault();
    const refusal: FramedAreaRefusal | null = entry.area.gate(event, control);
    // ①⑤⑥ are said nowhere: a scripted press, a press while a write is under way, a page that has moved on.
    if (refusal?.reason === "silent" || entry.busy || !scope.alive || entries.get(entry.id) !== entry || !entry.reads) return;
    if (refusal) {
      entry.line = { text: refusal.reason === "moved" ? t("刚移动过，请再拨一次") : t("请先让这一块完整显示") };
      if (refusal.reason === "partial" && refusal.reveal) send({ type: "task-grants-reveal", id: entry.id });
      if (refusal.reason === "partial" && !refusal.reveal) control.closest("li")?.scrollIntoView({ block: "nearest", inline: "nearest" });
      draw(entry); return;
    }
    // A control's name is its act, then the category it is for: `switch:`, `allow:` or `remove:` and the row's name.
    const name = control.dataset.framedControl!, act = name.split(":", 1)[0], subject = entry.reads.subject;
    if (act === "read") { void reread(entry); return; }
    if (act === "undo" || act === "retry") {
      const last = entry.last; if (!last) return;
      void write(entry, act === "undo" && last.undo ? { kind: "undo", row: last.row, categories: last.undo(subject) } : taskGrantChange(last.kind as "on", last.row, subject));
      return;
    }
    // A switch turns its category the other way from what the task holds now; the drawn markup does not decide it.
    const switched = act === "switch", row = taskGrantRows(entry.reads).find(item => name === act + ":" + item.name);
    const fits = switched ? row?.status !== "removed" : act === "allow" ? row?.status === "needs_confirmation" : act === "remove" && row?.status === "removed";
    if (!row || !fits) return;
    void write(entry, taskGrantChange(switched ? (row.status === "off" ? "on" : "off") : act as "allow" | "remove", row, subject));
  };
  const reread = async (entry: Entry) => {
    entry.busy = true; draw(entry);
    try { await read(entry); entry.line = idle(); }
    catch { if (entries.get(entry.id) === entry) entry.line = { text: t("暂时读不到这个任务能读什么"), act: "read", tone: "danger" }; }
    finally { if (entries.get(entry.id) === entry) { entry.busy = false; draw(entry); } }
  };
  // Back in view, each area reads once (§3.6); nothing is read while the page is hidden.
  let shownOnce = false;
  scope.whenVisible(() => { if (shownOnce) for (const entry of entries.values()) if (entry.reads && !entry.busy) void reread(entry); shownOnce = true; });

  const open = async (message: Extract<TaskGrantsUp, { type: "task-grants-open" }>) => {
    // An open names an id and a key, nothing more: a category list, a state, an installation is not the page's to give.
    const valid = Object.keys(message).length === 3 && Number.isSafeInteger(message.id) && message.id > 0 && !entries.has(message.id)
      && typeof message.key === "string" && pattern.test(message.key) && scope.visible;
    const area = valid ? areas.open({ heights: TASK_GRANTS_AREA_HEIGHTS, onHeight: height => send({ type: "task-grants-size", id: message.id, height }) }) : null;
    if (!area) { if (Number.isSafeInteger(message.id) && !entries.has(message.id)) send({ type: "task-grants-shown", id: message.id, error: TASK_GRANTS_UNAVAILABLE }); return; }
    area.surface.className = "mw-platform-area task-grants-area";
    area.surface.setAttribute("aria-label", t("Molis Work · 只有你能改") + " · " + owner);
    area.surface.dataset.taskGrantsArea = "";
    const entry: Entry = { id: message.id, key: message.key, area, reads: null, line: idle(), busy: false, last: null };
    entries.set(entry.id, entry);
    area.surface.addEventListener("click", event => press(entry, event));
    try {
      await read(entry);
      if (entries.get(entry.id) !== entry) return;
      draw(entry); send({ type: "task-grants-shown", id: entry.id });
    } catch {
      close(entry.id); send({ type: "task-grants-shown", id: entry.id, error: TASK_GRANTS_UNAVAILABLE });
    }
  };
  return (message: TaskGrantsUp) => {
    if (!message || !Number.isSafeInteger(message.id) || message.id < 1) return;
    if (message.type === "task-grants-open") { void open(message); return; }
    if (message.type === "task-grants-close") { close(message.id); return; }
    if (message.type === "task-grants-layout") entries.get(message.id)?.area.layout(message.box);
  };
}

/** The page's half: places an empty element, reports where it is, and keeps the element at the height the shell gives it. */
export function childTaskGrants(port: MessagePort, scope: FrameScope): UiPageTaskGrants<HTMLElement> {
  let sequence = 0;
  const entries = new Map<number, { element: HTMLElement; onChange?: (state: UiTaskGrantsAreaState) => void;
    pending?: { resolve(): void; reject(error: Error): void }; stop?: () => void }>();
  const send = (message: TaskGrantsUp) => port.postMessage(message);
  const close = (id: number, error: Error = new DOMException("Area closed", "AbortError")) => {
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); places.untrack(id); entry.stop?.(); entry.pending?.reject(error);
    entry.element.style.removeProperty("height"); send({ type: "task-grants-close", id });
  };
  const places = childPlaces(scope, (id, box) => send({ type: "task-grants-layout", id, box }), id => close(id));
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  port.addEventListener("message", (event: MessageEvent<TaskGrantsDown>) => {
    const message = event.data, entry = entries.get(message.id);
    if (!entry || !message.type.startsWith("task-grants-")) return;
    if (message.type === "task-grants-size") entry.element.style.height = Math.max(0, message.height) + "px";
    else if (message.type === "task-grants-reveal") entry.element.scrollIntoView({ block: "nearest" });
    else if (message.type === "task-grants-changed") entry.onChange?.({ granted: message.state.granted === true, attention: message.state.attention === true });
    else if (message.error) close(message.id, new Error(TASK_GRANTS_UNAVAILABLE));
    else { entry.pending?.resolve(); entry.pending = undefined; }
  });
  return {
    place(element, key, options = {}) {
      if (!scope.alive || !(element instanceof HTMLElement) || typeof key !== "string") return Promise.reject(new Error(TASK_GRANTS_UNAVAILABLE));
      if (options.signal?.aborted) return Promise.reject(new DOMException("Area closed", "AbortError"));
      // The same element placed again changes its key: its area closes first.
      for (const [id, entry] of entries) if (entry.element === element) close(id);
      const id = ++sequence, signal = options.signal;
      return new Promise<void>((resolve, reject) => {
        const entry = { element, onChange: options.onChange, pending: { resolve, reject }, stop: undefined as (() => void) | undefined };
        entries.set(id, entry);
        if (signal) { const abort = () => close(id); signal.addEventListener("abort", abort, { once: true }); entry.stop = () => signal.removeEventListener("abort", abort); }
        send({ type: "task-grants-open", id, key });
        places.track(id, element);
      });
    },
  };
}
