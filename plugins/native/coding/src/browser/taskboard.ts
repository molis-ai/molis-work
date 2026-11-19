import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage, el, part } from "./dom.js";
import { svg } from "./taskboard-format.js";
import { drawOutlineRow } from "./taskboard-outline.js";
import { drawRow } from "./taskboard-rows.js";
import { activeLeafSteps, formatBoardProgressSummary, settled, skipped } from "./taskboard-steps.js";
import { buildTree } from "./taskboard-tree.js";
import type { BoardData, BoardGroup, BoardTarget, RowView, TaskboardPorts, TreeInput } from "./taskboard-types.js";
import { boardWords } from "./taskboard-words.js";

export interface Taskboard {
  /** A session was chosen (or none): the board waits for its read. */
  loading(id: string): void;
  /** The read of the session on show. */
  update(id: string, value: BoardData): void;
  fail(id: string, message: string): void;
  show(): void;
  hide(): void;
  showOutline(): void;
  hideOutline(): void;
  /** What is on show changed (a tab closed or reopened): draw the outline again from what it holds. */
  refreshOutline(): void;
}

/** What the board holds between drawings, and the parts of the page it draws into. */
interface State {
  readonly ports: TaskboardPorts;
  readonly input: (data: BoardData) => TreeInput;
  readonly view: RowView;
  readonly outline: HTMLElement | null;
  readonly list: HTMLElement;
  readonly notice: HTMLElement;
  readonly title: HTMLElement;
  readonly meta: HTMLElement;
  readonly empty: string;
  /** The outline's rows are redrawn whole; one listener on the list finds a row's target by its key. */
  readonly outlineTargets: Map<string, BoardTarget>;
  owner: string;
  data: BoardData | null;
  key: string;
  outlineKey: string;
  loadError: string;
}

/** What changes the drawing: the graphs, the rounds' phases and executors, the attention items and what is folded. */
function fingerprint(state: State, data: BoardData): string {
  return JSON.stringify([state.owner, data.plan, data.taskboard_plans, (data.runs || []).map(run => [run.ref.run_id, run.phase, run.frozen?.character?.title]), data.subagents, data.recovery_required, data.checkpoint_busy, [...state.view.collapsed]]);
}

/** The latest graph in one line: revision, steps done, and who the open steps wait on. */
function summary(_state: State, data: BoardData) {
  const latest = (data.taskboard_plans || []).filter(entry => entry.board).at(-1)?.board;
  const activeLeaves = latest ? activeLeafSteps(latest.nodes) : [];
  const unfinished = activeLeaves.filter(node => node.unknown_outcome || !["succeeded", "failed", "cancelled"].includes(node.state));
  const count = (kind: string) => unfinished.filter(node => node.owner?.kind === kind).length;
  const done = activeLeaves.filter(settled).length, total = activeLeaves.length;
  const plan = data.plan ? uiText.text("coding.board.plan-revision", { revision: data.plan.revision }) + " · " + (data.plan.confirmed ? uiText.text("coding.board.plan.confirmed") : uiText.text("coding.board.plan.unconfirmed")) : "";
  const weighted = formatBoardProgressSummary(latest?.progress_summary, latest?.nodes);
  const steps = latest ? uiText.text("coding.board.steps-done", { done, total }) + (latest.nodes.some(skipped) ? " · " + uiText.text("coding.board.steps-skipped", { count: latest.nodes.filter(skipped).length }) : "") : "";
  const text = [plan, weighted, steps, count("subtask") ? uiText.text("coding.board.steps-subtask", { count: count("subtask") }) : "", count("person") ? uiText.text("coding.board.steps-person", { count: count("person") }) : "", count("none") ? uiText.text("coding.board.steps-none", { count: count("none") }) : ""].filter(Boolean).join(" · ");
  return { latest, done, total, text };
}

function drawOutline(state: State) {
  const { outline, ports, data } = state, readText = ports.translate;
  if (!outline || outline.hidden) return;
  const rows = part(outline, "[data-coding-outline-list]"), note = part(outline, "[data-coding-outline-status]"), brief = part(outline, "[data-coding-outline-meta]");
  const expand = outline.querySelector<HTMLButtonElement>("[data-coding-board-expand]"), onShow = ports.onShow || (() => true);
  // No session on show (none chosen, or its tab closed): the outline says where to choose one, whatever it holds.
  if (!data || !onShow()) {
    rows.replaceChildren();
    brief.textContent = "";
    brief.hidden = true;
    if (expand) expand.disabled = true;
    state.outlineKey = "";
    note.textContent = state.loadError || (state.owner && onShow() ? uiText.text("coding.board.reading") : uiText.text("coding.board.outline-empty"));
    return;
  }
  const next = fingerprint(state, data);
  if (next === state.outlineKey) return;
  state.outlineKey = next;
  const groups = buildTree(state.input(data)), line = summary(state, data);
  brief.textContent = line.text;
  brief.hidden = !line.text;
  if (expand) expand.disabled = false;
  note.textContent = state.loadError || data.error || (groups.length ? uiText.text("coding.board.outline-note") : state.empty);
  rows.replaceChildren();
  state.outlineTargets.clear();
  for (const group of groups) {
    const heading = el("h2", group.label + " ", "mw-dir__heading");
    heading.append(el("small", group.count || String(group.items.length)));
    rows.append(heading);
    const tree = el("ul", "", "coding-outline-tree");
    for (const row of group.items) tree.append(drawOutlineRow(readText, state.outlineTargets, row, 0));
    rows.append(tree);
  }
}

/** One group of the board: a fold with its rows. */
function drawGroup(state: State, group: BoardGroup): HTMLElement {
  const { view, ports } = state, { collapsed } = view, fold = el("details", "", "coding-board-fold");
  fold.open = !collapsed.has("group:" + group.id);
  fold.dataset.boardGroup = group.id;
  const heading = el("summary");
  heading.innerHTML = '<span class="coding-board-caret">' + svg("chevron-down") + '</span><span class="coding-board-fold-mark">' + svg(group.mark) + "</span>";
  heading.append(el("strong", group.label), el("small", group.count || String(group.items.length)));
  ports.lifetime.listen(fold, "toggle", () => {
    if (fold.open) collapsed.delete("group:" + group.id);
    else collapsed.add("group:" + group.id);
  });
  const rows = el("ul", "", "coding-board-tree");
  for (const row of group.items) rows.append(drawRow(view, row, 0, state.owner));
  fold.append(heading, rows);
  return fold;
}

/** The board of a session with no plan and no subtask yet: what it is for, and where such work starts. */
function emptyBoard(state: State): HTMLElement {
  const box = el("div", "", "mw-empty coding-board-empty"), mark = el("span", "", "mw-empty__mark");
  box.dataset.slot = "empty";
  mark.innerHTML = svg("board");
  box.append(mark, el("h2", uiText.text("coding.board.empty-title")), el("p", state.empty));
  return box;
}

function drawBoard(state: State) {
  const { data, view } = state, { board } = view;
  if (board.hidden) return;
  if (!data) {
    state.list.replaceChildren();
    state.title.textContent = uiText.text("coding.face.taskboard");
    state.meta.textContent = "";
    state.notice.textContent = state.loadError || (state.owner ? uiText.text("coding.board.reading") : uiText.text("coding.board.pick-session"));
    return;
  }
  if (board.dataset.editing === "true" || board.dataset.busy === "true") return;
  const next = fingerprint(state, data);
  if (next === state.key) return;
  state.key = next;
  const scroll = board.scrollTop, groups = buildTree(state.input(data));
  const document = board.ownerDocument, active = document.hasFocus() ? document.activeElement : null;
  const focusedRow = active && state.list.contains(active) ? active.id : "";
  state.title.textContent = uiText.text("coding.face.taskboard");
  state.meta.textContent = summary(state, data).text;
  const problem = state.loadError || data.error;
  state.notice.textContent = problem || (groups.length ? uiText.text("coding.board.notice") : "");
  // Nothing planned yet is the shared empty state (screen-polish §6.6), not a footnote under an empty table.
  state.list.replaceChildren(...(groups.length || problem ? groups.map(group => drawGroup(state, group)) : [emptyBoard(state)]));
  board.scrollTop = scroll;
  // A late completion can redraw the row that just received focus back from the child conversation.
  if (focusedRow && document.activeElement === document.body) {
    const replacement = document.getElementById(focusedRow);
    if (replacement && state.list.contains(replacement)) replacement.focus({ preventScroll: true });
  }
}

function render(state: State) {
  const line = state.data && !state.loadError ? summary(state, state.data) : null;
  state.ports.progress?.(line?.latest ? line.done + "/" + line.total : "");
  drawBoard(state);
  drawOutline(state);
}

/** A session is chosen, or not: the board forgets the last one's folds and place. */
function forget(state: State) {
  state.key = "";
  state.outlineKey = "";
  state.view.collapsed.clear();
  state.view.board.scrollTop = 0;
}

/**
 * The TaskBoard: the session's plan and every round that ran one, as a list in the Goal list's grammar — one row per
 * task, indented under what it belongs to, with its state, progress, prerequisites, who is doing it and when it last
 * moved. Every state comes from the execution record (the step graph, subagent records and reviews), never from what
 * the model said. A step's "who" is its holder on the graph: this session, the subtask it was handed to, you, or no one.
 * Clicking a row opens it; a live plan keeps its controls to reorder, skip, insert or unblock a step, and to take a
 * step on yourself, hand it back, or record your own result on it.
 *
 * The same tree also draws the directory column's outline (ports.outline): one compact row per task with its state
 * mark, key, title and who is on it, no columns and no controls. It is the "find" view of the session's work; the
 * board in the main area is where the work is changed. ports.progress receives "done/total" of the latest graph
 * for the main area's view switch.
 */
export function taskboard(ports: TaskboardPorts): Taskboard {
  const { lifetime, board, translate: readText, current, status } = ports, words = boardWords(readText), outline = ports.outline || null;
  const view: RowView = { ports, words, board, list: part(board, "[data-coding-board-list]"), collapsed: new Set(), redraw: () => { state.key = ""; render(state); } };
  const state: State = {
    ports, view, outline, list: view.list, notice: part(board, "[data-coding-board-status]"), title: part(board, "[data-coding-board-title]"), meta: part(board, "[data-coding-board-meta]"),
    empty: uiText.text("coding.board.empty"), outlineTargets: new Map(), owner: "", data: null, key: "", outlineKey: "", loadError: "",
    input: data => ({ data, translate: readText, words, ports }),
  };
  if (outline) {
    lifetime.listen(outline, "click", event => {
      const row = event.target instanceof Element ? event.target.closest<HTMLElement>(".coding-outline-row") : null, target = row?.dataset.boardKey ? state.outlineTargets.get(row.dataset.boardKey) : undefined;
      if (target) void ports.navigate(state.owner, target).catch(error => status(errorMessage(error), true));
    });
  }
  return {
    loading(id) {
      if (id !== state.owner) {
        state.owner = id;
        state.data = null;
        state.loadError = "";
        forget(state);
      }
      render(state);
    },
    update(id, value) {
      if (id !== current()) return;
      if (id !== state.owner) forget(state);
      state.owner = id;
      state.data = value;
      state.loadError = "";
      render(state);
    },
    fail(id, message) {
      if (id !== state.owner) return;
      state.loadError = uiText.text("coding.board.unreadable", { reason: message });
      state.key = "";
      state.outlineKey = "";
      render(state);
    },
    show() {
      board.hidden = false;
      state.key = "";
      render(state);
    },
    hide() {
      board.hidden = true;
    },
    showOutline() {
      if (!outline) return;
      outline.hidden = false;
      state.outlineKey = "";
      render(state);
    },
    hideOutline() {
      if (outline) outline.hidden = true;
    },
    refreshOutline() {
      state.outlineKey = "";
      render(state);
    },
  };
}
