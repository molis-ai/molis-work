import { codingRoundTally, type ChangeTally, type RoundNet, type RoundWrite } from "../../round-tally.js";
import { editedPaths } from "../../timeline.js";
import { terminal } from "./composer-state.js";
import { api, sessionPath } from "./request.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

/** Per page: the rounds whose lines are known, and the rounds already asked about (so none is asked twice). */
const known = new WeakMap<Page, { tallies: Map<string, ChangeTally>; asked: Set<string> }>();
const memory = (page: Page) => {
  let own = known.get(page);
  if (!own) known.set(page, own = { tallies: new Map(), asked: new Set() });
  return own;
};
const key = (sessionId: string, runId: string) => sessionId + "\n" + runId;

/** A round's lines on this page's current session, or null while they have not been read or cannot be said exactly. */
export function changeTally(page: Page, runId: string): ChangeTally | null {
  return memory(page).tallies.get(key(page.s.current, runId)) ?? null;
}

/** Keeps what a read of a round's changes says of its lines; answers whether that changed what the page knew. */
export function noteChangeTally(page: Page, sessionId: string, runId: string, writes: readonly RoundWrite[], nets: readonly RoundNet[]): boolean {
  const { tallies } = memory(page), id = key(sessionId, runId), before = tallies.get(id), next = codingRoundTally(writes, nets);
  if (next) tallies.set(id, next); else tallies.delete(id);
  return JSON.stringify(before ?? null) !== JSON.stringify(next);
}

/** What the stats-only read of a round's changes answers (`coding.changesets.read` with `stats`): lines per file, no text. */
interface RoundStats { readonly added_lines: number; readonly removed_lines: number; readonly files: readonly { readonly path: string; readonly added_lines: number; readonly removed_lines: number }[] }

/**
 * Reads the lines of the newest round once it has ended with files written (screen-polish §6.3: the round's one line says
 * 「修改 3 个文件 +24 −6」). The read asks for the lines alone (`?stats=1`, 方案乙): the service counts them by the same rule as
 * the change reader's net view and sends no text of any file. One read per round for the life of the page, never repeated and
 * never polled; a round whose changes cannot be read, or whose lines cannot be said exactly, keeps saying how many files it
 * wrote. A round still waiting for its interrupted writes to be checked is not asked: its changes cannot be read until then,
 * and it is asked once the check is done. `redraw` runs when the count arrives for the round still on show.
 */
export function readChangeTally(page: Page, run: RunView, redraw: () => void): void {
  const sessionId = page.s.current, runId = run.ref.run_id, own = memory(page), id = key(sessionId, runId);
  if (!terminal(run.phase) || run.phase === "reconcile-required" || !editedPaths(run).length || own.tallies.has(id) || own.asked.has(id)) return;
  own.asked.add(id);
  const signal = page.s.viewSignal;
  void api<{ stats: RoundStats | null }>(page, sessionPath(sessionId, runId) + "/changeset?stats=1").then(({ stats }) => {
    // No count to show: it cannot be said exactly (null), or nothing reached the disk (no files).
    if (!stats?.files.length) return;
    own.tallies.set(id, { added: stats.added_lines, removed: stats.removed_lines, files: stats.files.map(file => ({ path: file.path, added: file.added_lines, removed: file.removed_lines })) });
    if (page.lifetime.alive && page.s.current === sessionId) redraw();
  }, error => {
    // Switching sessions or hiding the tab aborts the read: clear asked so returning to this session asks once.
    if (signal?.aborted || page.s.current !== sessionId || (error instanceof Error && error.name === "AbortError")) own.asked.delete(id);
  });
}
