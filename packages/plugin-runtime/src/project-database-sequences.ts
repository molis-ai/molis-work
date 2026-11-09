/** SQLite 3.51.3's compiler-generated AUTOINCREMENT bookkeeping, hoisted out of a trigger into the main program. */
export interface PluginSqlStep { readonly addr: number; readonly opcode: string; readonly p1: number; readonly p2: number; readonly p3: number; readonly p4: unknown; readonly p5: number }

const same = (step: PluginSqlStep | undefined, opcode: string, p1: number, p2: number, p3 = 0, p4: unknown = null, p5 = 0) =>
  step?.opcode === opcode && step.p1 === p1 && step.p2 === p2 && step.p3 === p3 && step.p4 === p4 && step.p5 === p5;

/**
 * Only the exact compiler prologue/epilogue for tables inserted by validated Host triggers. This is not permission to access
 * sqlite_sequence: an explicit query, subquery, update, or a different bytecode layout remains outside these certified steps.
 * Unknown SQLite layouts fail closed (the caller pins the SQLite version). Trigger bodies are still independently checked.
 */
export function trustedSequenceSteps(steps: readonly PluginSqlStep[], trusted: ReadonlySet<string>, sequencePage: number | undefined): ReadonlySet<PluginSqlStep> {
  const allowed = new Set<PluginSqlStep>();
  if (!sequencePage || !trusted.size) return allowed;
  const boundary = steps.findIndex((step, i) => i > 0 && step.addr === 0);
  if (boundary < 0) return allowed;
  const main = steps.slice(0, boundary), inserted = new Set<string>();
  let owner = false;
  for (const step of steps.slice(boundary)) {
    if (step.addr === 0) owner = typeof step.p4 === 'string' && step.p4.startsWith('-- TRIGGER ') && trusted.has(step.p4.slice(11));
    if (owner && step.opcode === 'Insert' && typeof step.p4 === 'string') inserted.add(step.p4);
  }
  const start = main[0]?.p2;
  if (start === undefined || main[start]?.opcode !== 'Transaction' || !same(main[start - 1], 'Halt', 0, 0)) return allowed;
  const reads: Array<{ step: PluginSqlStep; register: number }> = [];
  for (let i = start + 1; i < main.length; i++) {
    const open = main[i]!;
    if (open.opcode !== 'OpenRead' || open.p2 !== sequencePage) continue;
    const c = open.p1, n = main[i + 1]?.p2 ?? -1;
    if (!same(open, 'OpenRead', c, sequencePage, 0, '2') || !inserted.has(String(main[i + 1]?.p4))
      || !same(main[i + 1], 'String8', 0, n, 0, main[i + 1]?.p4)
      || !same(main[i + 2], 'Null', 0, n + 1, n + 3)
      || !same(main[i + 3], 'Rewind', c, i + 12)
      || !same(main[i + 4], 'Column', c, 0, n + 1)
      || !same(main[i + 5], 'Ne', n, i + 11, n + 1, null, 16)
      || !same(main[i + 6], 'Rowid', c, n + 2)
      || !same(main[i + 7], 'Column', c, 1, n + 1)
      || !same(main[i + 8], 'AddImm', n + 1, 0)
      || !same(main[i + 9], 'Copy', n + 1, n + 3)
      || !same(main[i + 10], 'Goto', 0, i + 13)
      || !same(main[i + 11], 'Next', c, i + 4)
      || !same(main[i + 12], 'Integer', 0, n + 1)
      || !same(main[i + 13], 'Close', c, 0)) return allowed;
    reads.push({ step: open, register: n });
  }
  const first = start - 1 - 7 * reads.length;
  if (!reads.length || first < 1) return allowed;
  const used = new Set<number>(), writes: PluginSqlStep[] = [];
  for (let i = first; i < start - 1; i += 7) {
    const n = main[i]!.p3 - 1, c = main[i + 1]!.p1, record = main[i + 4]!.p3;
    if (used.has(n) || !reads.some(read => read.register === n)
      || !same(main[i], 'Le', n + 3, i + 7, n + 1)
      || !same(main[i + 1], 'OpenWrite', c, sequencePage, 0, '2')
      || !same(main[i + 2], 'NotNull', n + 2, i + 4)
      || !same(main[i + 3], 'NewRowid', c, n + 2)
      || !same(main[i + 4], 'MakeRecord', n, 2, record)
      || !same(main[i + 5], 'Insert', c, record, n + 2, null, 8)
      || !same(main[i + 6], 'Close', c, 0)) return allowed;
    // Each 7-opcode block starts with Le; its target is the next block or the terminal Halt.
    used.add(n); writes.push(main[i + 1]!);
  }
  for (const read of reads) allowed.add(read.step);
  for (const write of writes) allowed.add(write);
  return allowed;
}
