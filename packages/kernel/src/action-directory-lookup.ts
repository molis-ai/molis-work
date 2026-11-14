import type { ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

export function actionKey(reference: ActionReference): string {
  return `${reference.capability_id}@${reference.version}`;
}

/** First row by action identity in a single caller's directory. Visit each row at most once, on demand. */
export function actionDirectoryLookup(directory: readonly ActionView[]): (reference: ActionReference) => ActionView | undefined {
  const firstByKey = new Map<string, ActionView>();
  let next = 0;
  return reference => {
    const key = actionKey(reference);
    const known = firstByKey.get(key);
    if (known) return known;
    while (next < directory.length) {
      const row = directory[next++]!;
      const rowKey = actionKey(row);
      if (!firstByKey.has(rowKey)) firstByKey.set(rowKey, row);
      if (rowKey === key) return row;
    }
    return undefined;
  };
}
