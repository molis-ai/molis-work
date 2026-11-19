import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { el } from "../dom.js";
import { changeTally, editedPaths } from "./change-tally.js";
import { terminal } from "./composer-state.js";
import type { Page } from "./page.js";

/**
 * The first thing the results panel says (screen-polish §6.5): the files the newest round wrote, each with the lines it
 * added and removed once they are known. A row opens the round's changes, like the round's own 「看改动」; so does the
 * count on the header's 「结果与审查」. A round still under way lists nothing: its changes can be read only once it ends.
 */
export function renderChanged(page: Page): void {
  const { q, s } = page, section = q("[data-coding-changed]"), list = q("[data-coding-changed-list]"), count = q("[data-coding-results-count]");
  const run = s.lastRun, paths = run && terminal(run.phase) ? editedPaths(run) : [];
  count.hidden = !paths.length;
  count.textContent = paths.length ? String(paths.length) : "";
  section.hidden = !paths.length;
  if (!run || !paths.length) { list.replaceChildren(); delete list.dataset.content; return; }
  const tally = changeTally(page, run.ref.run_id), lines = new Map(tally?.files.map(file => [file.path, file]));
  const content = JSON.stringify([run.ref.run_id, paths, tally]);
  if (list.dataset.content === content) return;
  list.dataset.content = content;
  q("[data-coding-changed-round]").textContent = uiText.text("coding.turn.number", { number: s.allRuns.length });
  list.replaceChildren(...paths.map(path => {
    const row = el("button", "", "coding-changed-file"), cut = path.lastIndexOf("/"), name = el("span", "", "coding-change-path"), file = lines.get(path);
    row.type = "button";
    row.dataset.codingChangeOpen = run.ref.run_id;
    row.title = path;
    if (cut >= 0) name.append(el("span", path.slice(0, cut + 1), "coding-change-dir"));
    name.append(el("b", path.slice(cut + 1)));
    row.append(name);
    if (file) {
      const counts = el("span", "", "coding-change-counts");
      counts.append(el("ins", "+" + file.added), el("del", "−" + file.removed));
      row.append(counts);
    }
    return row;
  }));
}
