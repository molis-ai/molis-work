/**
 * What a round changed, in lines, as its one line in the conversation and the results panel say it (screen-polish §6.3, §6.5).
 * Shared by the page and its tests; it reads nothing itself.
 */

/** One file a round changed, with the lines the round added to it and removed from it. */
export interface FileTally { readonly path: string; readonly added: number; readonly removed: number }
/** What a round left on disk, in lines: the sum over its files, and each file's own count. */
export interface ChangeTally { readonly added: number; readonly removed: number; readonly files: readonly FileTally[] }

/** One write of a round as `GET …/changeset` answers it: the lines that write asked for, and whether it reached the disk. */
export interface RoundWrite { readonly path: string; readonly added_lines: number; readonly removed_lines: number; readonly review: { readonly execution: string } }
/** A file written several times, as the same answer sums it up: its net lines when the writes read as one change. */
export interface RoundNet { readonly path: string; readonly available: boolean; readonly added_lines?: number; readonly removed_lines?: number }

/**
 * What a round's writes left on disk, in lines, or null when that cannot be said exactly; the same rule the change reader
 * follows for its net view. A write that was turned down changed nothing and is left out. A file written once counts that
 * write. A file written several times counts its net change (the first write's original against the last write's result),
 * which the answer gives only when every write was approved and applied, each starting from the one before. A write that
 * failed or whose outcome is unknown, or several writes with no net change to offer, leave the whole round without a count:
 * a sum that may be wrong is not shown.
 */
export function codingRoundTally(writes: readonly RoundWrite[], nets: readonly RoundNet[]): ChangeTally | null {
  const files: FileTally[] = [];
  for (const path of new Set(writes.map(write => write.path))) {
    const own = writes.filter(write => write.path === path);
    if (own.some(write => !["applied", "not-applied"].includes(write.review.execution))) return null;
    const landed = own.filter(write => write.review.execution === "applied"), net = nets.find(group => group.path === path);
    if (landed.length === 1) files.push({ path, added: landed[0]!.added_lines, removed: landed[0]!.removed_lines });
    else if (landed.length > 1) {
      if (!net?.available || net.added_lines === undefined || net.removed_lines === undefined) return null;
      files.push({ path, added: net.added_lines, removed: net.removed_lines });
    }
  }
  return files.length ? { added: files.reduce((sum, file) => sum + file.added, 0), removed: files.reduce((sum, file) => sum + file.removed, 0), files } : null;
}
