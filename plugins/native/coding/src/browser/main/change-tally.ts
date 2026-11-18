import { terminal } from "./composer-state.js";
import { api, sessionPath } from "./request.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

/** One file a round wrote, with the lines its writes added and removed. */
export interface FileTally { readonly path: string; readonly added: number; readonly removed: number }
/** What a round changed, in lines: the sum over its files, and each file's own count. */
export interface ChangeTally { readonly added: number; readonly removed: number; readonly files: readonly FileTally[] }

/** A file of a round's changes as `GET …/changeset` answers it: one entry per write. */
interface WrittenFile { readonly path: string; readonly added_lines: number; readonly removed_lines: number }

/** Per page: the rounds whose lines are known, and the rounds already asked about (so none is asked twice). */
const known = new WeakMap<Page, { tallies: Map<string, ChangeTally>; asked: Set<string> }>();
const memory = (page: Page) => {
  let own = known.get(page);
  if (!own) known.set(page, own = { tallies: new Map(), asked: new Set() });
  return own;
};
const key = (sessionId: string, runId: string) => sessionId + "\n" + runId;

/** The files a round wrote, each once, in the order they were first written. */
export function editedPaths(run: Pick<RunView, "activity">): string[] {
  return [...new Set(run.activity.filter(item => ["edit", "write"].includes(item.name) && item.state === "completed" && item.target).map(item => item.target as string))];
}

/** A round's lines on this page's current session, or null while they have not been read. */
export function changeTally(page: Page, runId: string): ChangeTally | null {
  return memory(page).tallies.get(key(page.s.current, runId)) ?? null;
}

/** Keeps what a read of a round's changes says of its lines: several writes to one file count together. */
export function noteChangeTally(page: Page, sessionId: string, runId: string, written: readonly WrittenFile[]): void {
  const files = new Map<string, FileTally>();
  for (const file of written) {
    const before = files.get(file.path);
    files.set(file.path, { path: file.path, added: (before?.added ?? 0) + file.added_lines, removed: (before?.removed ?? 0) + file.removed_lines });
  }
  const list = [...files.values()];
  memory(page).tallies.set(key(sessionId, runId), { added: list.reduce((sum, file) => sum + file.added, 0), removed: list.reduce((sum, file) => sum + file.removed, 0), files: list });
}

/**
 * Reads the lines of the newest round once it has ended with files written (screen-polish §6.3: the round's one line says
 * 「修改 3 个文件 +24 −6」). One read per round for the life of the page, never repeated and never polled; a round whose
 * changes cannot be read keeps saying how many files it wrote. `redraw` runs when the count arrives for the round still on show.
 */
export function readChangeTally(page: Page, run: RunView, redraw: () => void): void {
  const sessionId = page.s.current, runId = run.ref.run_id, own = memory(page), id = key(sessionId, runId);
  if (!terminal(run.phase) || !editedPaths(run).length || own.tallies.has(id) || own.asked.has(id)) return;
  own.asked.add(id);
  void api<{ change: { files: readonly WrittenFile[] } }>(page, sessionPath(sessionId, runId) + "/changeset").then(result => {
    noteChangeTally(page, sessionId, runId, result.change.files);
    if (page.lifetime.alive && page.s.current === sessionId) redraw();
  }, () => { /* unreadable changes (a write still undecided, a receipt gone): the card keeps its file count */ });
}
