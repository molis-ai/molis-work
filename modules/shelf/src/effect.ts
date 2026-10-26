import type { ShelfExecutionControl } from "@molis-ai/molis-work-contracts/modules/shelf";

export async function beforeShelfEffect(control?: ShelfExecutionControl): Promise<void> {
  await control?.beforeEffect?.();
  control?.signal?.throwIfAborted();
}
