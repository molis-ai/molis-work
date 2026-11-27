import { setImmediate as nextTurn } from "node:timers/promises";
import type { OverviewReadResult } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Follow the same partial-result contract as the UI. The deadline also works in tests using a mocked Date. */
export async function refreshedOverview(read: () => OverviewReadResult | Promise<OverviewReadResult>): Promise<OverviewReadResult> {
  const deadline = performance.now() + 10_000;
  for (;;) {
    const page = await read();
    if (!page.updating) return page;
    if (performance.now() >= deadline) throw new Error("Timed out waiting for overview source refresh");
    await nextTurn();
  }
}
