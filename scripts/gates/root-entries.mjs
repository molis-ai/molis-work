// Gate: the repository root holds only what tooling/gates/root-allowlist.json names (specs/repository-anti-corruption §4.12,
// decision 22: introduction pages, outputs/ and personal tool folders move out of the repository).
//
// A root entry is the first path segment of a tracked file: a file at the root, or a folder with everything below it. An
// entry outside the allow-list is a stray. Strays are counted per entry (a folder counts its tracked files) and may only
// fall, compared with the merge-base like every health number, so nothing new can land at the root and what is there
// leaves. Putting a new name at the root on purpose means adding it to the allow-list with a reason, in the open.
import { ROOT_ALLOWLIST, readAllowlist } from "./allowlist.mjs";

export { ROOT_ALLOWLIST };

/** Every root entry of the snapshot with the number of tracked files in it. */
export function rootEntries(files) {
  const entries = {};
  for (const file of files) {
    const name = file.split("/")[0];
    entries[name] = (entries[name] ?? 0) + 1;
  }
  return entries;
}

const MISSING = `(${ROOT_ALLOWLIST} is missing)`;

/**
 * Strays: root entries the allow-list does not name. A repository with no allow-list at all (a merge-base from before this
 * gate, or a scratch repository) has one stray, "the list is missing"; a head that loses a list the merge-base had grows
 * that count from 0 to 1 and fails, so the list cannot be deleted to get around the rule.
 */
function measure(snapshot) {
  const { allowed } = readAllowlist(snapshot);
  if (!allowed) return snapshot.read(ROOT_ALLOWLIST) === null ? { [MISSING]: 1 } : { [`(${ROOT_ALLOWLIST} is not valid)`]: 1 };
  const strays = {};
  for (const [name, count] of Object.entries(rootEntries(snapshot.files))) if (allowed[name] === undefined) strays[name] = count;
  return strays;
}

/** The allow-list itself, when there is one: valid, every entry with a reason, no entry for something that is not at the root any more. */
export function rootAllowlistProblems(snapshot) {
  if (snapshot.read(ROOT_ALLOWLIST) === null) return [];
  const { allowed, error } = readAllowlist(snapshot);
  if (!allowed) return [error];
  const present = rootEntries(snapshot.files);
  const problems = [];
  for (const [name, reason] of Object.entries(allowed)) {
    if (typeof reason !== "string" || !reason.trim()) problems.push(`${ROOT_ALLOWLIST}: "${name}" needs a reason`);
    if (present[name] === undefined) problems.push(`${ROOT_ALLOWLIST}: "${name}" is not at the repository root any more; delete the entry`);
  }
  return problems;
}

export const rootStrays = {
  id: "rootStrays",
  baselineKey: "rootStrays",
  totalKey: "rootStrayTotal",
  measure,
  noReference: (ref) => ref[MISSING] !== undefined,
  grewWhat: "tracked files at the repository root outside the allow-list",
  grewHint: `move it into docs/, specs/, tooling/ or another home, or name it in ${ROOT_ALLOWLIST} with a reason`,
  title: "Root entries outside the allow-list (tracked files)",
  summary: (strays) => `${Object.keys(strays).length} root strays`,
};
