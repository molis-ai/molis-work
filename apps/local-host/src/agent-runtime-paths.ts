import path from "node:path";

/** The directory of the Home's Agent runtime (Prologue's storage root), whose one owner process holds the Home's memory. */
export function agentRuntimeDirectory(home: string): string {
  return path.join(path.resolve(home), "agent-runtime");
}
