// Turns a counting rule into a health-gate metric (the shape check-health-gates.mjs expects of an entry in METRICS):
// a record { key: count } measured on a snapshot, written to baseline.json as that record plus its total, and compared
// with the reference (the merge-base) key by key. A key may only lose; a key with no record starts at 0.
//
// A rule is { id, baselineKey, totalKey, measure(snapshot), grewWhat, grewHint, title, summary(record), noReference?(ref), unit? }.
// `unit` ({ many, one }) says what the keys of the record are for --report ("root entries"/"root entry"); the default is files.
// `noReference(ref)` says the reference has nothing to compare with (the gate's own input did not exist there yet), in which
// case nothing counts as growth, exactly as limits.json is skipped when the merge-base has none. `kit` is the
// small set of helpers the entry already has (perFile, requireShape); passing them in keeps this file free of a second copy.
export const sumOf = (record) => Object.values(record).reduce((sum, count) => sum + count, 0);

export function countMetric(kit, rule) {
  const { perFile } = kit;
  return {
    id: rule.id,
    measure: rule.measure,
    toBaseline: (record) => ({ [rule.totalKey]: sumOf(record), [rule.baselineKey]: record }),
    fromBaseline: (json) => perFile.fromBaseline(json, rule.baselineKey),
    grew: (head, ref, env) => (rule.noReference?.(ref) ? [] : perFile.grew(rule.grewWhat, rule.grewHint)(head, ref, env)),
    lowered: perFile.lowered,
    lines: (head, ref, env) => perFile.lines(rule.title, head, ref, env, rule.unit),
    summary: rule.summary,
  };
}
