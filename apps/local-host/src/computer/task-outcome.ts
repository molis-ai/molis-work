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
  if (checks.length > 0 && checks.every(Boolean)) return { complete: true, reason: "窗口标题、文件或操作记录里已经有要求的结果" };
  if (modelSaidDone) return { complete: false, reason: "模型说完成了，但窗口标题、文件和操作记录都还没有到" };
  return { complete: false, reason: "窗口标题、文件和操作记录都还没有到" };
}

const WANTED_LINE = /^\s*(窗口|文件|记录)\s*[:：]\s*(\S.*?)\s*$/u;

/** The facts a round's goal asked to see. Each labeled line is one requirement. A goal with none has nothing to satisfy. */
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
 * The record stored when a round ends. A model run that ends is not itself completion.
 * An explicit failed or stopped outcome is kept. Completed, or no outcome, is rewritten from the facts.
 */
export function desktopRoundOutcome(
  goal: string,
  facts: DesktopTaskFacts,
  outcome?: { readonly outcome: "completed" | "failed" | "stopped"; readonly conclusion: string },
): { outcome: "completed" | "failed" | "stopped"; conclusion: string } {
  const modelSaidDone = outcome === undefined || outcome.outcome === "completed";
  const judged = desktopTaskComplete(desktopTaskWanted(goal), facts, modelSaidDone);
  if (outcome && outcome.outcome !== "completed") return { outcome: outcome.outcome, conclusion: outcome.conclusion || judged.reason };
  return { outcome: judged.complete ? "completed" : "failed", conclusion: judged.reason };
}
