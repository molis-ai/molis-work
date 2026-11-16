import { conflictKey, type ConflictDraft } from "./editing.js";
import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { inFolder, request } from "./page.js";
import type { GitPage } from "./page.js";
import { operationLabel, prepare } from "./source.js";
import type { ConflictAnswer } from "./types.js";

const uiText = globalThis.t;

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
  const { s, conflictText } = page;
  const blocks = blocksOf(conflictText.value), left = conflictText.value.split("\n").some(isMark);
  const picks = s("[data-git-conflict-picks]");
  picks.replaceChildren();
  blocks.forEach((block, index) => {
    const row = document.createElement("div");
    row.className = "git-sc-pick";
    row.append(document.createTextNode(uiText.text("git.conflict.at", { index: index + 1, line: block.start + 1 })));
    const sides: [("ours" | "theirs" | "both"), string][] = [
      ["ours", uiText.text("git.conflict.use", { side: page.conflictSides.ours })],
      ["theirs", uiText.text("git.conflict.use", { side: page.conflictSides.theirs })],
      ["both", uiText.text("git.conflict.both")],
    ];
    for (const [side, label] of sides) {
      const pick = document.createElement("button");
      pick.type = "button"; pick.className = "mw-btn mw-btn--ghost"; pick.textContent = label;
      page.lifetime.listen(pick, "click", () => {
        const lines = conflictText.value.split("\n"), now = blocksOf(conflictText.value)[index];
        if (!now) return;
        lines.splice(now.start, now.end - now.start + 1, ...(side === "ours" ? now.ours : side === "theirs" ? now.theirs : [...now.ours, ...now.theirs]));
        conflictText.value = lines.join("\n");
        rememberConflict(page);
      });
      row.append(pick);
    }
    picks.append(row);
  });
  const stale = page.conflictDraft?.entry.value?.base !== page.conflictDraft?.disk;
  s("[data-git-conflict-current]").hidden = !stale;
  s<HTMLTextAreaElement>("[data-git-conflict-disk]").value = stale ? page.conflictDraft!.disk : "";
  s("[data-git-conflict-changed]").hidden = !stale;
  s("[data-git-conflict-state]").textContent = stale ? uiText.text("git.conflict.changed") : left ? uiText.text("git.conflict.marks-left") : uiText.text("git.conflict.marks-gone");
  s<HTMLButtonElement>("[data-git-conflict-resolve]").disabled = left || stale || !page.conflictDraft;
}

function rememberConflict(page: GitPage): void {
  const current = page.conflictDraft;
  if (!current?.entry.value) return;
  page.drafts!.edit(current.entry, { ...current.entry.value, text: page.conflictText.value });
  syncConflict(page);
}

export async function openConflict(page: GitPage, path: string): Promise<void> {
  const { s, conflictEditor, conflictText } = page;
  const workspace = page.workspace, signal = page.viewSignal, serial = ++page.conflictTicket;
  const current = () => page.lifetime.alive && page.lifetime.visible && page.viewSignal === signal && !signal?.aborted
    && page.workspace === workspace && page.conflictTicket === serial && page.conflictPath === path;
  // A summary refresh in the same directory does not cancel this file's read. Switching files, views or directories does.
  page.conflictDraft = null; page.conflictPath = path;
  conflictEditor.hidden = false; conflictText.value = ""; conflictText.disabled = true;
  s<HTMLButtonElement>("[data-git-conflict-resolve]").disabled = true;
  s("[data-git-conflict-changed]").hidden = true;
  s<HTMLDetailsElement>("[data-git-conflict-current]").hidden = true;
  s<HTMLDetailsElement>("[data-git-conflict-current]").open = false;
  s("[data-git-conflict-picks]").replaceChildren();
  s("[data-git-conflict-state]").textContent = uiText.text("git.conflict.reading", { path });
  try {
    const file = await request<ConflictAnswer>(page, inFolder(`/conflict?path=${encodeURIComponent(path)}`, workspace));
    if (!current()) return;
    if (file.outcome !== "conflict-file") throw new Error(file.message ? (file.message) : uiText.text("git.conflict.unreadable"));
    const key = await conflictKey(workspace, path), entry = await page.drafts!.read<ConflictDraft>(key, async () => {
      if (current()) await openConflict(page, path);
    });
    if (!current()) return;
    entry.value ??= { base: file.text, text: file.text };
    page.conflictDraft = { path, entry, disk: file.text, revision: file.revision };
    page.conflictPath = path;
    // The Host names the two sides in Chinese; the page says them in its own language.
    page.conflictSides = { ours: file.ours === "当前" ? uiText.text("git.conflict.ours") : file.ours, theirs: file.theirs === "合并进来的一方" ? uiText.text("git.conflict.theirs") : file.theirs };
    s("[data-git-conflict-file]").textContent = uiText.text("git.conflict.file", { path, count: file.conflicts, ours: page.conflictSides.ours, theirs: page.conflictSides.theirs });
    conflictText.value = entry.value.text; conflictText.disabled = false;
    syncConflict(page);
    conflictText.focus();
  } catch (error) {
    if (current()) s("[data-git-conflict-state]").textContent = (messageOf(error));
  }
}

/** Lists the files a merge stopped on, or hides the block when no merge is under way. */
export function renderConflicts(page: GitPage): void {
  const { s, conflicts } = page, summary = page.summary;
  const merging = Boolean(summary && (summary.merging || summary.conflicted.length));
  conflicts.hidden = !merging;
  const closeEditor = () => {
    page.conflictTicket++; page.conflictDraft = null; page.conflictPath = "";
    page.conflictEditor.hidden = true; page.conflictText.disabled = true;
  };
  if (!summary || !merging) { closeEditor(); return; }
  s("[data-git-conflict-note]").textContent = summary.conflicted.length ? uiText.text("git.conflict.merging", { count: summary.conflicted.length }) : uiText.text("git.conflict.all-resolved");
  s("[data-git-conflict-list]").replaceChildren(...summary.conflicted.map((path) => {
    const item = document.createElement("li"), button = document.createElement("button");
    button.type = "button"; button.className = "mw-btn mw-btn--ghost"; button.textContent = uiText.text("git.conflict.resolve-file", { path });
    page.lifetime.listen(button, "click", () => void openConflict(page, path));
    item.append(button);
    return item;
  }));
  if (page.conflictPath && !summary.conflicted.includes(page.conflictPath)) closeEditor();
}

export function installConflicts(page: GitPage): void {
  const { readText, s, conflictText, lifetime } = page;
  lifetime.listen(conflictText, "input", () => rememberConflict(page));
  for (const [selector, keep] of [["[data-git-conflict-keep-edit]", true], ["[data-git-conflict-use-disk]", false]] as const) {
    lifetime.listen(s(selector), "click", () => {
      const current = page.conflictDraft;
      if (!current?.entry.value) return;
      const text = keep ? conflictText.value : current.disk;
      page.drafts!.edit(current.entry, { base: current.disk, text }); conflictText.value = text; syncConflict(page);
    });
  }
  lifetime.listen(s("[data-git-conflict-resolve]"), "click", (event) => {
    const current = page.conflictDraft;
    if (!current?.entry.value || current.entry.value.base !== current.disk || conflictText.value.split("\n").some(isMark)) return;
    void prepare(page, { action: "resolve", path: current.path, content: conflictText.value }, uiText.text("git.op.resolve-file", { path: current.path }), event.currentTarget as HTMLElement, current.revision);
  });
  lifetime.listen(s("[data-git-merge-abort]"), "click", (event) => void prepare(page, { action: "merge-abort" }, operationLabel(readText, "merge-abort") ?? "", event.currentTarget as HTMLElement));
}
