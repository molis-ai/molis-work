import type { ExactRef, Runtime } from "@prologue/sdk";

type SdkSession = NonNullable<Awaited<ReturnType<Runtime["sessions"]["open"]>>>;

/**
 * Load a run's recorded SDK events in one place: terminal runs replay from the sealed ledger, while non-terminal or
 * interrupted runs read committed progress (retrying `replay` if the run settled between `terminalRuns()` and
 * `readRunProgress()`).
 */
export async function readSdkRunEvents(
  session: Pick<SdkSession, "terminalRuns" | "replay" | "readRunProgress">,
  runId: string,
  terminalRuns?: readonly ExactRef<"run">[],
): Promise<Awaited<ReturnType<SdkSession["replay"]>>> {
  const terminals = terminalRuns ?? await session.terminalRuns();
  const terminal = terminals.find(run => run.id === runId);
  const ref: ExactRef<"run"> = terminal ?? { kind: "run", id: runId, revision: 1 };
  if (terminal) return session.replay(terminal);
  try {
    return await session.readRunProgress(ref);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "RUN_NOT_REPLAYABLE") throw error;
    return session.replay(ref);
  }
}
