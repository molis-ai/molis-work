/// <reference lib="dom" />
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";

/** What the browser's `t` and `say` produced, as plain text with the reference it came from; at most `limit`, the oldest leaves first. */
export interface ProducedLog {
  record(output: string, ref: OwnedTextRef): void;
  find(output: string, node: Text | Attr): OwnedTextRef | undefined;
  remember(node: Text | Attr, output: string, ref?: OwnedTextRef): void;
}

export function createProducedLog(limit = 2000): ProducedLog {
  const entries = new Map<string, OwnedTextRef>();
  const retitled = new WeakMap<Text | Attr, { output: string; ref: OwnedTextRef }>();
  return {
    record(output, ref) {
      entries.delete(output);
      entries.set(output, ref);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
    },
    find(output, node) {
      const known = retitled.get(node);
      return known?.output === output ? known.ref : entries.get(output);
    },
    remember(node, output, ref) {
      if (ref) retitled.set(node, { output, ref });
      else retitled.delete(node);
    },
  };
}
