import type { TodoChange, TodoItem, TodoLink } from "../contract.js";
import { iconSvg, make } from "./dom.js";
import type { AssistantWork, TodoPage } from "./types.js";

const uiText = globalThis.t;

/** Where an original opens, when it says: a surface and an object id. */
interface Opens { readonly surface: string; readonly id: string }

const FIELD_KEYS: Record<string, string> = {
  title: "todo.field.title-name", notes: "todo.field.notes", due_date: "todo.field.due-date", due_time: "todo.field.due-time", planned_date: "todo.field.planned-date",
  remind_at: "todo.quick.remind", placement: "todo.field.placement", important: "todo.field.important", waiting: "todo.field.waiting", project_id: "todo.field.placement",
};
const WORK_STATE_KEYS: Record<string, string> = {
  idle: "todo.work.idle", running: "todo.status.doing", "waiting-input": "todo.work.waiting-input", "waiting-review": "todo.work.waiting-review", paused: "todo.work.paused",
  completed: "todo.status.done", failed: "todo.work.failed", stopped: "todo.work.stopped", "needs-check": "todo.work.needs-check",
};
const WORK_STATE_MARKS: Record<string, string> = {
  running: "running", completed: "round-ended", "waiting-input": "answer", "waiting-review": "approval", "needs-check": "verify", paused: "paused", failed: "failed", stopped: "stopped", idle: "idle",
};
const RESULT_STATE_KEYS: Record<string, string> = {
  changed: "todo.result.changed", missing: "todo.result.missing", unavailable: "todo.result.unavailable", moved: "todo.result.moved",
};
const SOURCE_KIND_KEYS: Record<string, string> = {
  manual: "todo.source.manual", material: "todo.source.material", assistant: "todo.source.assistant", onboarding: "todo.source.onboarding", lingguang: "todo.source.lingguang",
};
const RELATION_KEYS: Record<string, string> = {
  blocked_by: "todo.relation.blocked-by", blocks: "todo.relation.blocks", split_from: "todo.relation.split-from", merged: "todo.relation.merged", related: "todo.relation.related",
};

const opener = (name: HTMLElement, open: Opens, title: string) => {
  name.dataset.workbenchItemPlugin = open.surface;
  name.dataset.workbenchItemId = open.id;
  name.dataset.workbenchItemTitle = title;
};

/** The sources a todo came from; an original opens where it lives when the todo belongs to the project being looked at. */
export function renderSources(page: TodoPage, item: TodoItem): void {
  const sourceName = (kind: string) => (kind === "inbox" ? "Inbox" : SOURCE_KIND_KEYS[kind] ? uiText.text(SOURCE_KIND_KEYS[kind]) : "");
  const box = page.$("[data-todo-sources]");
  // The same version drawn again (the detail is often asked for twice as it opens) keeps its nodes, so a click already
  // under way on a source is not lost to a redraw.
  const drawn = `${item.id}@${item.revision}@${page.projectId()}`;
  if (box.dataset.drawn === drawn) return;
  box.dataset.drawn = drawn;
  box.replaceChildren();
  for (const source of item.sources) {
    const entry = make("div", "todo-source");
    const head = make("div", "todo-source-head");
    // The original opens where it lives, in the project the person is looking at: a todo of another project keeps its source as text,
    // and an unassigned todo (a fragment offer leaves placement to the person) opens it here. Where the source names only the object,
    // the workbench says which surface opens that kind of object; none or several, and it stays text.
    const { open, subject } = source, id = (open ?? subject)?.id, surface = open ? open.surface : subject && page.host.surfaceFor(subject.kind);
    const here = id && surface && page.projectId() && (!item.project_id || item.project_id === page.projectId()) ? { surface, id } : null;
    const name = here ? make("button", "mw-btn mw-btn--link", source.title) : make("strong", "", source.title);
    if (here && name instanceof HTMLButtonElement) {
      name.type = "button";
      opener(name, here, source.title);
      name.title = uiText.text("todo.source.open-original");
    }
    head.append(make("span", "todo-link-kind", sourceName(source.kind)), name, make("small", "", page.timeLabel(source.added_at)));
    entry.append(head);
    if (source.reason) entry.append(make("p", "", source.reason));
    if (source.excerpt) entry.append(make("blockquote", "", source.excerpt));
    box.append(entry);
  }
}

type WorkResult = NonNullable<AssistantWork["results"]>[number];

/** What a work produced (drafts, documents, notes), as the Assistant recorded them from their owners: the object's own kind and
 *  where it opens, so the todo shows the results without anyone retyping them. */
function workResultRow(_page: TodoPage, result: WorkResult): HTMLElement {
  const row = make("div", "todo-link todo-work-result");
  const reachable = result.open && !["missing", "moved"].includes(result.state ?? "") ? result.open : null;
  const name = reachable ? make("button", "mw-btn mw-btn--link", result.title) : make("span", "", result.title);
  if (reachable && name instanceof HTMLButtonElement) { name.type = "button"; opener(name, reachable, result.title); }
  row.append(make("span", "todo-link-kind", uiText.text("todo.work.output")), name);
  // Moved is not gone: say where it went, in the Assistant's words for the place.
  const resultKey = result.state ? RESULT_STATE_KEYS[result.state] : undefined;
  const note = result.state === "moved" && result.moved_to && result.moved_to.title ? uiText.text("todo.work.moved-to", { place: result.moved_to.title }) : resultKey ? uiText.text(resultKey) : "";
  if (note) row.append(make("small", "todo-muted", note));
  return row;
}

/** Progress lives with the Assistant's work; the todo shows where each one stands and continues it (no second record). */
export function renderWorks(page: TodoPage): void {
  const { state } = page;
  const box = page.$("[data-todo-works]");
  box.replaceChildren();
  page.$("[data-todo-works-section]").hidden = !state.works.length;
  for (const work of state.works) {
    const line = make("div", "todo-link");
    const go = make("button", "mw-btn mw-btn--link", uiText.text("todo.work.continue"));
    go.type = "button";
    go.dataset.todoContinueWork = work.work_id;
    const stateKey = WORK_STATE_KEYS[work.state];
    const mark = make("span", "todo-link-kind", stateKey ? uiText.text(stateKey) : work.state);
    mark.dataset.mwState = WORK_STATE_MARKS[work.state] || "idle";
    line.append(mark, make("span", "", work.title), go);
    box.append(line);
    for (const result of work.results || []) box.append(workResultRow(page, result));
  }
}

/** Looks for the Assistant's works on a todo, and keeps looking while one runs and this todo is open. */
export function installWorks(page: TodoPage): void {
  const { state } = page;
  page.loadWorks = async (item) => {
    // The action's output always carries `works`; unreadable (Assistant off, no grant) shows none.
    const found = await page.host.invokeAction<{ works: AssistantWork[] }>({ capability_id: "assistant.works.related", version: /* @version action.assistant.works.related */ 1 }, { kind: "todo_item", id: item.id })
      .then(read => read.works, () => []);
    // One work can relate to the todo more than once (where it started, and as material): list it once.
    const unique = found.filter((work, index) => found.findIndex((other) => other.work_id === work.work_id) === index);
    if (!state.selected || state.selected.id !== item.id) return;
    state.works = unique;
    renderWorks(page);
    // A round has no “finished” message for pages, so while one runs, look again now and then (only while this todo is open).
    clearTimeout(state.worksTimer);
    if (state.works.some((work) => work.state === "running") || Date.now() < state.watchWorksUntil) {
      state.worksTimer = window.setTimeout(() => { if (state.selected && state.selected.id === item.id && !document.hidden) void page.loadWorks(item); }, 4000);
    }
  };
  page.watchWorks = () => {
    const asked = state.selected;
    state.watchWorksUntil = Date.now() + 60000;
    window.setTimeout(() => { if (asked && state.selected && state.selected.id === asked.id) void page.loadWorks(asked); }, 1500);
  };
}

interface LinkRow { link?: TodoLink; text: string; target: string; detail: string }

function linkRow(page: TodoPage, item: TodoItem, entry: LinkRow): HTMLElement {
  const line = make("div", "todo-link");
  // A draft, a finished result or a material that says where it opens is reached from here, as a source is.
  const opens = !entry.target && entry.link?.open && page.projectId() && item.project_id === page.projectId() ? entry.link.open : null;
  const name = entry.target || opens ? make("button", "mw-btn mw-btn--link", entry.text) : make("span", "", entry.text);
  if (name instanceof HTMLButtonElement) {
    name.type = "button";
    if (entry.target) name.dataset.todoOpenLinked = entry.target;
    if (opens) opener(name, opens, entry.text);
  }
  line.append(make("span", "todo-link-kind", entry.detail), name);
  if (entry.link) {
    const remove = make("button", "mw-btn mw-btn--ghost mw-btn--icon-only");
    remove.type = "button";
    remove.dataset.todoUnlink = entry.link.link_id;
    remove.setAttribute("aria-label", uiText.text("todo.link.remove"));
    remove.innerHTML = iconSvg("x");
    line.append(remove);
  }
  return line;
}

/** The links to other todos, outcomes and works, the todos waiting on this one, and the choices for a new link. */
export function renderLinks(page: TodoPage, item: TodoItem): void {
  const { state } = page;
  const linkDetail = (link: TodoLink) => {
    if (link.kind === "todo") return link.relation ? uiText.text(RELATION_KEYS[link.relation] ?? "todo.relation.related") : "";
    if (link.kind === "outcome") return link.outcome === "done" ? uiText.text("todo.link.outcome-done") : uiText.text("todo.link.outcome-draft");
    return link.kind === "goal" ? "Goal" : link.kind === "work" ? uiText.text("todo.link.work") : uiText.text("todo.source.material");
  };
  const backDetail = (relation: string | null) => (relation === "blocked_by" ? uiText.text("todo.relation.blocked-by-reverse") : relation === "blocks" ? uiText.text("todo.relation.blocked-by") : uiText.text("todo.relation.related"));
  const box = page.$("[data-todo-links]");
  const drawn = `${item.id}@${item.revision}@${state.backlinks.map((back) => `${back.item_id}:${back.relation}`).join(",")}@${state.linkPool.map((other) => `${other.id}:${other.title}`).join(",")}`;
  if (box.dataset.drawn === drawn) return;
  box.dataset.drawn = drawn;
  box.replaceChildren();
  const rows: LinkRow[] = [
    ...item.links.map((link) => ({ link, text: link.title, target: link.kind === "todo" ? link.subject.id : "", detail: linkDetail(link) })),
    ...state.backlinks.map((back) => ({ text: back.title, target: back.item_id, detail: backDetail(back.relation) })),
  ];
  if (!rows.length) box.append(make("p", "todo-muted", uiText.text("todo.link.none")));
  for (const entry of rows) box.append(linkRow(page, item, entry));
  const select = page.$<HTMLSelectElement>("[data-todo-link-target]");
  select.replaceChildren(new Option(uiText.text("todo.link.choose"), ""));
  // Any active todo can be linked, not only the ones in the current view.
  for (const other of state.linkPool) {
    if (other.id !== item.id && !item.links.some((link) => link.subject.id === other.id)) select.append(new Option(other.title, other.id));
  }
}

function describeChange(page: TodoPage, change: TodoChange): string {
  const after = change.after as { status?: string; link_added?: { title: string } };
  const actor = change.actor === "user" ? uiText.text("todo.actor.you") : change.actor === "assistant" ? uiText.text("todo.source.assistant") : uiText.text("todo.history.other");
  if (change.kind === "create") return actor + uiText.text("todo.history.created");
  if (change.kind === "status") return actor + uiText.text("todo.history.set-to") + page.statusName(after.status ?? "");
  if (change.kind === "archive") return actor + uiText.text("todo.action.archive");
  if (change.kind === "unarchive") return actor + uiText.text("todo.action.restore");
  if (change.kind === "link") return actor + (after.link_added ? uiText.text("todo.history.linked", { title: after.link_added.title }) : uiText.text("todo.history.unlinked"));
  if (change.kind === "revert") return actor + uiText.text("todo.history.reverted");
  const names = Object.keys(change.after).map((key) => (FIELD_KEYS[key] ? uiText.text(FIELD_KEYS[key]) : "")).filter(Boolean);
  return `${actor}${uiText.text("todo.history.changed")} ${[...new Set(names)].join(uiText.text("common.list.separator"))}`;
}

/** The change history, with undo on the latest change while it is still the todo's current version. */
export function renderHistory(page: TodoPage): void {
  const { state } = page;
  const box = page.$("[data-todo-history]");
  box.replaceChildren();
  const latest = state.history.find((change) => change.kind !== "revert");
  for (const change of state.history) {
    const entry = make("li", change.reverted_by ? "is-reverted" : "");
    entry.append(make("time", "", page.timeLabel(change.at)), make("span", "", describeChange(page, change) + (change.reverted_by ? uiText.text("todo.history.undone") : "")));
    if (change === latest && !change.reverted_by && state.selected && change.revision_after === state.selected.revision) {
      const button = make("button", "mw-btn mw-btn--link", change.kind === "create" ? uiText.text("todo.history.undo-create") : uiText.text("todo.action.undo"));
      button.type = "button";
      button.dataset.todoRevert = change.change_id;
      entry.append(button);
    }
    box.append(entry);
  }
}
