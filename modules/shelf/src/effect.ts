import type { ShelfExecutionControl } from "./contract.js";

export async function beforeShelfEffect(control?: ShelfExecutionControl): Promise<void> {
  await control?.beforeEffect?.();
  control?.signal?.throwIfAborted();
}
