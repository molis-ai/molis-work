import type { AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Marks one activity as a desktop step. The panel strips it before the person reads the target. */
const DESKTOP_STEP = "\u0000desktop";

/** Wording that only a desktop step produces. A successful click's receipt is the same text as the browser's. */
const DESKTOP_TEXT = /应用：|还没有选定要操作的应用|坐标以这个窗口的左上角|桌面应用没有 DOM|落点不在目标应用|电脑正被另一项工作|用户已接手电脑|助理不操作电脑|助理不能操作自己的确认卡|只能看和点/;

/** A browser verb that was really a desktop step, as the person should read it. */
export function desktopVerb(item: Pick<AgentToolActivity, "target" | "summary" | "output">, verb: string): string {
  const desktop = item.target === DESKTOP_STEP || DESKTOP_TEXT.test(`${item.summary} ${item.output ?? ""}`);
  if (!desktop || (verb !== "browser-look" && verb !== "browser-act" && verb !== "browser-list")) return verb;
  return verb === "browser-look" ? "computer-look" : verb === "browser-list" ? "computer-list" : "computer-act";
}

/** The marker is not a name the person should see. */
export function shownActivityTarget(target: string): string {
  return target === DESKTOP_STEP ? "" : target;
}
