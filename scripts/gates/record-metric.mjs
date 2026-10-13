// A per-key count that may only fall, for the structure gates (specs/repository-anti-corruption W1-05).
//
// scripts/check-health-gates.mjs owns the comparison (the working tree against the merge-base, measured by one definition on
// both sides); a gate module only says what to count. A key is "<file>#<what>" or another stable name; a key with no record
// at the reference starts at 0 (or at `newKeyAllowance` when the spec gives one), so a new file, a new plugin or a new
// entry has to arrive at 0. Renames between the reference and the head move records with the file.
//
// `helpers` is what the entry shares with its modules: { perFile, rekey, rekeyUnit, sumOf }.
export function recordMetric(helpers, spec) {
  const { id, recordKey, totalKey, title, summaryLabel, measure, message, newKeyAllowance, extraLines } = spec;
  // The headline number: the sum of the counts, or (when the values mix units) the number of entries.
  const totalOf = spec.totalOf ?? helpers.sumOf;
  const allowanceOf = (key) => (typeof newKeyAllowance === "function" ? newKeyAllowance(key) : 0);
  return {
    id,
    measure,
    toBaseline: (record) => ({ [totalKey]: totalOf(record), [recordKey]: record }),
    fromBaseline: (json) => helpers.perFile.fromBaseline(json, recordKey),
    grew(head, ref, { renames }) {
      const before = helpers.rekey(ref, renames, helpers.rekeyUnit);
      return Object.entries(head)
        .filter(([key, count]) => count > (before[key] ?? allowanceOf(key)))
        .map(([key, count]) => message(key, before[key] ?? allowanceOf(key), count, before[key] === undefined));
    },
    lowered: helpers.perFile.lowered,
    lines(head, ref, env) {
      const rows = Object.entries(head).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const out = [`${title}: ${totalOf(head)} in ${rows.length} entries`, `  ${"count".padStart(5)}${ref ? "   base" : ""}  entry`];
      for (const [key, count] of rows.slice(0, env.top)) out.push(`  ${String(count).padStart(5)}${ref ? String(ref[key] ?? "new").padStart(7) : ""}  ${key}`);
      if (env.top && rows.length > env.top) out.push(`  … ${rows.length - env.top} more (omit --top to see all)`);
      if (extraLines) out.push(...extraLines(head, ref));
      return out;
    },
    summary: (record) => `${totalOf(record)} ${summaryLabel}`,
  };
}

// The text a gate has to read from a snapshot besides source files: a gate module lists its files here, so that the
// merge-base side reads them from the object database too (the entry's `needsText`).
export const hasPath = (file, ...patterns) => patterns.some((pattern) => (typeof pattern === "string" ? file === pattern : pattern.test(file)));
