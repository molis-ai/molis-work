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
