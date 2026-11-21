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

/**
 * Reads the lines of the newest round once it has ended with files written (screen-polish §6.3: the round's one line says
 * 「修改 3 个文件 +24 −6」). One read per round for the life of the page, never repeated and never polled; a round whose
 * changes cannot be read keeps saying how many files it wrote. A round still waiting for its interrupted writes to be checked
 * is not asked: its changes cannot be read until then, and it is asked once the check is done. `redraw` runs when the count
 * arrives for the round still on show.
 */
export function readChangeTally(page: Page, run: RunView, redraw: () => void): void {
  const sessionId = page.s.current, runId = run.ref.run_id, own = memory(page), id = key(sessionId, runId);
  if (!terminal(run.phase) || run.phase === "reconcile-required" || !editedPaths(run).length || own.tallies.has(id) || own.asked.has(id)) return;
  own.asked.add(id);
  void api<{ change: { files: readonly RoundWrite[] }; net_groups?: readonly RoundNet[] }>(page, sessionPath(sessionId, runId) + "/changeset").then(result => {
    if (noteChangeTally(page, sessionId, runId, result.change.files, result.net_groups ?? []) && page.lifetime.alive && page.s.current === sessionId) redraw();
  }, () => { /* unreadable changes (a receipt gone, the round read elsewhere): the card keeps its file count */ });
}
