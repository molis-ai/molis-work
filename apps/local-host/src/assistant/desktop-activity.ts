import type { AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * Marks one activity as a desktop step. agent-host sets it on every call to the desk the round was given, from that fact
 * and not from what the receipt says. The panel strips it before the person reads the target.
 */
const DESKTOP_STEP = "\u0000desktop";

/** A browser verb that was really a desktop step, as the person should read it. */
export function desktopVerb(item: Pick<AgentToolActivity, "target">, verb: string): string {
  if (item.target !== DESKTOP_STEP || (verb !== "browser-look" && verb !== "browser-act" && verb !== "browser-list")) return verb;
  return verb === "browser-look" ? "computer-look" : verb === "browser-list" ? "computer-list" : "computer-act";
}

/** The marker is not a name the person should see. */
export function shownActivityTarget(target: string): string {
  return target === DESKTOP_STEP ? "" : target;
}
