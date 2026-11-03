import { messageOf } from "./dom.js";
import { active, request } from "./page.js";
import type { GitPage } from "./page.js";
import { operationLabel, prepare } from "./source.js";
import type { ConflictAnswer } from "./types.js";

// Merge conflicts: each conflicted file opens with its markers; pick a side per conflict or edit it, then resolve it
// through a Host review. Resolving is refused while any marker is left; the commit then finishes the merge.
const MARKS = ["<<<<<<<", "|||||||", "=======", ">>>>>>>"];
const isMark = (line: string): boolean => MARKS.some((mark) => line === mark || line.startsWith(`${mark} `));

interface Block { start: number; end: number; ours: string[]; base: string[]; theirs: string[] }

/** The conflicts in a file's text: where each starts and ends, and the lines of each side. */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let block: Block | null = null, part: "ours" | "base" | "theirs" = "ours";
  text.split("\n").forEach((line, index) => {
    if (line.startsWith("<<<<<<<")) { block = { start: index, end: index, ours: [], base: [], theirs: [] }; part = "ours"; return; }
    if (!block) return;
    if (line.startsWith("|||||||")) { part = "base"; return; }
    if (line.startsWith("=======")) { part = "theirs"; return; }
    if (line.startsWith(">>>>>>>")) { block.end = index; blocks.push(block); block = null; return; }
    block[part].push(line);
  });
  return blocks;
}

/** Draws the pick buttons of each conflict left in the editor, and whether the file may be resolved yet. */
function syncConflict(page: GitPage): void {
  const { L, s, conflictText } = page;
  const blocks = blocksOf(conflictText.value), left = conflictText.value.split("\n").some(isMark);
  const picks = s("[data-git-conflict-picks]");
  picks.replaceChildren();
  blocks.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = "git-sc-pick";
    row.append(document.createTextNode(L("git.conflict.at", { index: index + 1, line: block.start + 1 })));
    const sides: [("ours" | "theirs" | "both"), string][] = [
      ["ours", L("git.conflict.use", { side: page.conflictSides.ours })],
      ["theirs", L("git.conflict.use", { side: page.conflictSides.theirs })],
      ["both", L("git.conflict.both")],
    ];
    for (const [side, label] of sides) {
      const pick = document.createElement("button");
      pick.type = "button"; pick.className = "mw-btn mw-btn--ghost"; pick.textContent = label;
      page.lifetime.listen(pick, "click", () => {
        const lines = conflictText.value.split("\n"), now = blocksOf(conflictText.value)[index];
        if (!now) return;
        lines.splice(now.start, now.end - now.start + 1, ...(side === "ours" ? now.ours : side === "theirs" ? now.theirs : [...now.ours, ...now.theirs]));
        conflictText.value = lines.join("\n");
        syncConflict(page);
      });
      row.append(pick);
    }
    picks.append(row);
  });
  s("[data-git-conflict-state]").textContent = left ? L("git.conflict.marks-left") : L("git.conflict.marks-gone");
  s<HTMLButtonElement>("[data-git-conflict-resolve]").disabled = left;
}

async function openConflict(page: GitPage, path: string): Promise<void> {
  const { L, S, s, conflictEditor, conflictText } = page;
  const epoch = page.generation, serial = ++page.conflictTicket;
  conflictEditor.hidden = false;
  s("[data-git-conflict-state]").textContent = L("git.conflict.reading", { path });
  try {
    const file = await request<ConflictAnswer>(page, `/conflict?path=${encodeURIComponent(path)}`);
    if (!active(page, epoch) || serial !== page.conflictTicket) return;
    if (file.outcome !== "conflict-file") throw new Error(file.message ? S(file.message) : L("git.conflict.unreadable"));
    page.conflictPath = path;
    // The Host names the two sides in Chinese; the page says them in its own language.
    page.conflictSides = { ours: file.ours === "当前" ? L("git.conflict.ours") : file.ours, theirs: file.theirs === "合并进来的一方" ? L("git.conflict.theirs") : file.theirs };
    s("[data-git-conflict-file]").textContent = L("git.conflict.file", { path, count: file.conflicts, ours: page.conflictSides.ours, theirs: page.conflictSides.theirs });
    conflictText.value = file.text;
    syncConflict(page);
    conflictText.focus();
  } catch (error) {
    if (active(page, epoch) && serial === page.conflictTicket) s("[data-git-conflict-state]").textContent = S(messageOf(error));
  }
}

/** Lists the files a merge stopped on, or hides the block when no merge is under way. */
export function renderConflicts(page: GitPage): void {
  const { L, s, conflicts, conflictEditor } = page, summary = page.summary;
  const merging = Boolean(summary && (summary.merging || summary.conflicted.length));
  conflicts.hidden = !merging;
  if (!summary || !merging) { conflictEditor.hidden = true; page.conflictPath = ""; return; }
  s("[data-git-conflict-note]").textContent = summary.conflicted.length ? L("git.conflict.merging", { count: summary.conflicted.length }) : L("git.conflict.all-resolved");
  s("[data-git-conflict-list]").replaceChildren(...summary.conflicted.map((path) => {
    const item = document.createElement("li"), button = document.createElement("button");
    button.type = "button"; button.className = "mw-btn mw-btn--ghost"; button.textContent = L("git.conflict.resolve-file", { path });
    page.lifetime.listen(button, "click", () => void openConflict(page, path));
    item.append(button);
    return item;
  }));
  if (page.conflictPath && !summary.conflicted.includes(page.conflictPath)) { conflictEditor.hidden = true; page.conflictPath = ""; }
}

export function installConflicts(page: GitPage): void {
  const { L, s, conflictText, lifetime } = page;
  lifetime.listen(conflictText, "input", () => syncConflict(page));
  lifetime.listen(s("[data-git-conflict-resolve]"), "click", (event) => {
    if (!page.conflictPath || conflictText.value.split("\n").some(isMark)) return;
    void prepare(page, { action: "resolve", path: page.conflictPath, content: conflictText.value }, L("git.op.resolve-file", { path: page.conflictPath }), event.currentTarget as HTMLElement);
  });
  lifetime.listen(s("[data-git-merge-abort]"), "click", (event) => void prepare(page, { action: "merge-abort" }, operationLabel(L, "merge-abort") ?? "", event.currentTarget as HTMLElement));
}
