import type { Run } from "@prologue/sdk";
import { agentErrors } from "../errors.js";

/** Cancellation closes dispatch immediately; the caller reports settlement only after the original Run is terminal. */
export async function stopSdkRun(run: Run): Promise<void> {
  await run.cancel();
  const live = () => run.state === "prepared" || run.state === "running";
  if (!live()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(agentErrors.pending_not_open("原轮次仍未收到停止回执")), 10_000);
      unsubscribe = run.subscribe(() => { if (!live()) resolve(); });
      if (!live()) resolve();
    });
  } finally { clearTimeout(timer); unsubscribe?.(); }
}
