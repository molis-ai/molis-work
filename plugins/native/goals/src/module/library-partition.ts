import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

const partitions = new WeakMap<object, string | (() => string)>();

/**
 * The partition this library holds: Goals keeps no partition in its own rows (U3, batch 109) and stamps this on the records it hands out.
 * The plugin binds it once, at start, from its trusted start context (`context.project_id`) to the connection every repository reads
 * through; it never reads the platform's root table for it. A test that composes Goals over a library it made binds a reader instead.
 */
export function bindLibraryPartition(db: object, partition: string | (() => string)): void {
  if (!partition) throw new ActionError("actions.unredeemed", "Goals 的库需要所在分区");
  partitions.set(db, partition);
}

/** The partition bound to this connection; a connection Goals was not started over has none. */
export function libraryPartition(db: object): string {
  const bound = partitions.get(db), partition = typeof bound === "function" ? bound() : bound;
  if (!partition) throw new ActionError("actions.unredeemed", "Goals 的库还没有绑定所在分区");
  return partition;
}
