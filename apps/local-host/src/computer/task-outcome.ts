/** Facts a desktop task can be checked against. Window text is not one of them. */
export interface DesktopTaskFacts {
  readonly windowTitle?: string;
  readonly files?: readonly string[];
  readonly record?: readonly string[];
}

export interface DesktopTaskWanted {
  readonly windowTitle?: string;
  readonly file?: string;
  readonly record?: string;
}

/**
 * A task is done only when every fact it asked for is present. The model saying so does not fill a missing fact.
 */
export function desktopTaskComplete(wanted: DesktopTaskWanted, facts: DesktopTaskFacts, modelSaidDone: boolean): { complete: boolean; reason: string } {
  const checks = [
    ...(wanted.windowTitle === undefined ? [] : [facts.windowTitle === wanted.windowTitle]),
    ...(wanted.file === undefined ? [] : [(facts.files ?? []).includes(wanted.file)]),
    ...(wanted.record === undefined ? [] : [(facts.record ?? []).some(line => line.includes(wanted.record ?? ""))]),
  ];
  // Nothing named, nothing to check: not complete, and the reason says so rather than blaming facts that were never asked for.
  if (checks.length === 0) return { complete: false, reason: "目标没有写要核对的窗口、文件或记录，这一轮不算完成" };
  if (checks.every(Boolean)) return { complete: true, reason: "窗口标题、文件或操作记录里已经有要求的结果" };
  if (modelSaidDone) return { complete: false, reason: "模型说完成了，但窗口标题、文件和操作记录都还没有到" };
  return { complete: false, reason: "窗口标题、文件和操作记录都还没有到" };
}

const WANTED_LINE = /^\s*(窗口|文件|记录)\s*[:：]\s*(\S.*?)\s*$/u;

/** The facts a round's goal asked to see. Each labeled line is one requirement. A goal with none names nothing that could show it done. */
export function desktopTaskWanted(goal: string): DesktopTaskWanted {
  const wanted: { windowTitle?: string; file?: string; record?: string } = {};
  for (const line of goal.split("\n")) {
    const match = WANTED_LINE.exec(line);
    if (!match?.[2]) continue;
    if (match[1] === "窗口") wanted.windowTitle = match[2];
    else if (match[1] === "文件") wanted.file = match[2];
    else wanted.record = match[2];
  }
  return wanted;
}

/**
 * The record stored when a round ends, from how its run settled (`ended`). A run that ended is not itself completion:
 * `completed` is rewritten from the facts. A stopped or failed run keeps that outcome. Without `ended` (a Host that did not
 * say), the facts alone decide and nothing is said about what the model claimed.
 */
export function desktopRoundOutcome(
  goal: string,
  facts: DesktopTaskFacts,
  ended?: "completed" | "failed" | "stopped",
): { outcome: "completed" | "failed" | "stopped"; conclusion: string } {
  if (ended === "stopped") return { outcome: "stopped", conclusion: "这一轮被停下了" };
  if (ended === "failed") return { outcome: "failed", conclusion: "这一轮没有跑完就出错停下了" };
  const judged = desktopTaskComplete(desktopTaskWanted(goal), facts, ended === "completed");
  return { outcome: judged.complete ? "completed" : "failed", conclusion: judged.reason };
}
