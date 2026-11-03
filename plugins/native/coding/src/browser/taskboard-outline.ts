import { el } from "./dom.js";
import { hue, svg } from "./taskboard-format.js";
import type { BoardRow, BoardTarget } from "./taskboard-types.js";
import type { Translate } from "./types.js";

/** The mark of whoever is on a row of the outline. */
function drawAvatar(L: Translate, executor: NonNullable<BoardRow["executor"]>): HTMLElement {
  const avatar = el("span", "", "coding-board-avatar" + (executor.none ? " is-unknown" : "") + (executor.person ? " is-person" : ""));
  if (executor.none) {
    avatar.innerHTML = svg("user");
  } else {
    avatar.textContent = Array.from(executor.name)[0] || "?";
    avatar.style.setProperty("--board-avatar-hue", String(hue(executor.name)));
  }
  avatar.title = executor.none ? executor.detail : L("coding.board.executor", { detail: executor.detail });
  return avatar;
}

/**
 * One compact row of the outline: state mark, key, title, children's count, and who is on it. No controls here; the row's
 * target is found by its key (`targets`), because one listener on the list opens it.
 */
export function drawOutlineRow(L: Translate, targets: Map<string, BoardTarget>, row: BoardRow, depth: number): HTMLElement {
  const item = el("li", "", "coding-outline-item");
  item.style.setProperty("--board-depth", String(depth));
  const node = el("button", "", "coding-outline-row");
  node.type = "button";
  node.dataset.boardKey = row.key;
  if (row.hint) node.title = row.hint;
  const [label, mark, tone] = row.state, state = el("span", "", "coding-outline-mark");
  state.dataset.tone = tone;
  state.dataset.mwState = mark;
  state.title = label;
  node.append(state);
  if (row.label) node.append(el("span", row.label, "coding-board-key"));
  node.append(el("strong", row.title));
  node.setAttribute("aria-label", row.label ? row.label + " " + row.title + "：" + label : row.title + "：" + label);
  if (row.progress && row.children.length) node.append(el("span", row.progress.done + "/" + row.progress.total, "coding-outline-count"));
  if (row.executor) node.append(drawAvatar(L, row.executor));
  targets.set(row.key, row.target);
  item.append(node);
  if (row.children.length) {
    const children = el("ul", "", "coding-outline-children");
    for (const child of row.children) children.append(drawOutlineRow(L, targets, child, depth + 1));
    item.append(children);
  }
  return item;
}
