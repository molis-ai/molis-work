import { el, errorMessage } from "./dom.js";
import { hue, svg } from "./taskboard-format.js";
import { rowTools } from "./taskboard-tools.js";
import type { BoardRow, RowView, StateMark } from "./taskboard-types.js";
import type { Translate } from "./types.js";

function drawState(state: StateMark): HTMLElement {
  const [label, mark, tone] = state, node = el("span", "", "coding-board-state");
  node.dataset.tone = tone;
  node.dataset.mwState = mark;
  node.append(el("span", label));
  node.title = label;
  return node;
}

function drawProgress(L: Translate, progress: BoardRow["progress"]): HTMLElement {
  const node = el("span", "", "coding-board-progress");
  if (!progress) {
    node.classList.add("is-empty");
    return node;
  }
  const track = el("i"), fill = el("b");
  track.setAttribute("aria-hidden", "true");
  fill.style.setProperty("--board-progress", Math.round(progress.done / Math.max(1, progress.total) * 100) + "%");
  track.append(fill);
  node.append(el("span", progress.done + "/" + progress.total), track);
  node.setAttribute("aria-label", L("coding.board.progress", { done: progress.done, total: progress.total }));
  return node;
}

/** What the step waits on, folded: a count and whether any of it is blocked. A row without steps may carry a note instead. */
function drawDeps(L: Translate, row: BoardRow): HTMLElement {
  const deps = row.deps;
  if (!deps?.length) {
    const node = el("span", "", "coding-board-deps is-empty");
    if (row.note) {
      node.className = "coding-board-deps is-note";
      node.textContent = row.note;
      node.title = row.note;
    }
    return node;
  }
  const waiting = deps.filter(dep => !dep.ready), blocked = waiting.filter(dep => dep.blocked);
  const node = el("details", "", "coding-board-deps " + (blocked.length ? "is-blocked" : waiting.length ? "is-waiting" : "is-ready")), summary = el("summary");
  summary.textContent = L("coding.board.deps", { count: deps.length }) + " · " + (blocked.length ? L("coding.board.deps-blocked", { count: blocked.length }) : waiting.length ? L("coding.board.deps-waiting", { count: waiting.length }) : L("coding.board.deps-ready"));
  summary.setAttribute("aria-label", L("coding.board.deps-open", { count: deps.length }));
  node.append(summary);
  const box = el("div", "", "coding-board-dep-list");
  for (const dep of deps) {
    const item = el("p", "", "coding-board-dep " + (dep.ready ? "is-ready" : dep.blocked ? "is-blocked" : "is-waiting"));
    item.innerHTML = svg("link");
    item.append(el("strong", dep.title), el("em", dep.ready ? L("coding.board.dep.ready") : dep.blocked ? L("coding.board.dep.blocked") : L("coding.board.dep.waiting")));
    box.append(item);
  }
  node.append(box);
  return node;
}

/** The mark of whoever does the work: their first letter on a colour of their name, or the unknown mark. */
function drawAvatar(L: Translate, executor: NonNullable<BoardRow["executor"]> | null): HTMLElement {
  const avatar = el("span", "", "coding-board-avatar" + (executor && !executor.none ? "" : " is-unknown") + (executor?.person ? " is-person" : ""));
  if (executor?.none) {
    avatar.innerHTML = svg("user");
    avatar.title = executor.detail;
    avatar.setAttribute("aria-label", L("coding.board.unclaimed"));
  } else if (executor) {
    avatar.textContent = Array.from(executor.name)[0] || "?";
    avatar.style.setProperty("--board-avatar-hue", String(hue(executor.name)));
    avatar.title = L("coding.board.executor", { detail: executor.detail });
    avatar.setAttribute("aria-label", L("coding.board.executor-name", { name: executor.name }));
  }
  return avatar;
}

function drawMeta(L: Translate, row: BoardRow): HTMLElement {
  const node = el("span", "", "coding-board-meta"), executor = row.executor;
  const time = el("time", row.time?.text || "", "coding-board-time" + (row.time ? "" : " is-empty"));
  if (row.time) time.title = row.time.title;
  if (executor?.none) node.dataset.owner = "none";
  else if (executor?.person) node.dataset.owner = "person";
  const avatar = drawAvatar(L, executor), name = el("span", executor?.name || "", "coding-board-agent");
  if (executor) name.title = L("coding.board.executor", { detail: executor.detail });
  if (executor?.expired) {
    node.dataset.expired = "true";
    const flag = el("span", L("coding.board.expired"), "coding-board-expired");
    flag.title = executor.detail;
    node.append(time, name, flag, avatar);
    return node;
  }
  node.append(time, name, avatar);
  return node;
}

/** The fold toggle of a row with children, or the blank guide that keeps the columns. */
function drawLead(view: RowView, row: BoardRow, open: boolean): HTMLElement {
  const { ports, collapsed } = view, L = ports.translate, lead = el("span", "", "coding-board-lead");
  if (!row.children.length) {
    lead.append(el("span", "", "coding-board-guide"));
    return lead;
  }
  const toggle = el("button", "", "coding-board-toggle");
  toggle.type = "button";
  toggle.innerHTML = svg("chevron-down");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? L("coding.board.collapse", { title: row.title }) : L("coding.board.expand", { title: row.title }));
  ports.lifetime.listen(toggle, "click", () => {
    if (collapsed.has(row.key)) collapsed.delete(row.key);
    else collapsed.add(row.key);
    view.redraw();
  });
  lead.append(toggle);
  return lead;
}

/** One row of the board: its fold, key, title, receipt link, state, progress, prerequisites, who and when, and the tools of a step. */
export function drawRow(view: RowView, row: BoardRow, depth: number, owner: string): HTMLElement {
  const { ports, collapsed } = view, L = ports.translate, item = el("li", "", "coding-board-item");
  item.dataset.boardKey = row.key;
  item.style.setProperty("--board-depth", String(depth));
  const entry = el("div", "", "coding-board-entry"), open = !collapsed.has(row.key), lead = drawLead(view, row, open);
  const main = el("button", "", "coding-board-node");
  main.type = "button";
  if (row.hint) main.title = row.hint;
  if (row.label) main.append(el("span", row.label, "coding-board-key"));
  main.append(el("strong", row.title));
  ports.lifetime.listen(main, "click", () => void ports.navigate(owner, row.target).catch(error => ports.status(errorMessage(error), true)));
  lead.append(main);
  // A step a person added for a supplement links back to its receipt in the conversation.
  const source = row.node ? ports.from(row.node) : null;
  if (source) lead.append(source);
  entry.append(lead, drawState(row.state), drawProgress(L, row.progress), drawDeps(L, row), drawMeta(L, row));
  const controls = rowTools(view, row, entry);
  if (controls) entry.append(controls);
  item.append(entry);
  if (row.children.length && open) {
    const children = el("ul", "", "coding-board-children");
    for (const child of row.children) children.append(drawRow(view, child, depth + 1, owner));
    item.append(children);
  }
  return item;
}
