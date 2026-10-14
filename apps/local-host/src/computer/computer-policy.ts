/**
 * The decisions the desktop driver applies before a look or a click (specs/computer-use).
 * Window text is data from the screen. It never changes one of these answers.
 */
import { LOOK_AND_CLICK_ACTIONS, showsMolis, tierOf, type AppIdentity } from "./app-tiers.js";

/** How long after the Assistant's own click a confirm on that same round is still the click, not the person. */
export const SELF_APPROVAL_QUIET_MS = 1500;

export function confirmArrivedTooSoon(injectedAt: number, answeredAt: number): boolean {
  return answeredAt - injectedAt < SELF_APPROVAL_QUIET_MS;
}

/** The round that currently holds the computer, read from its record. `projectId` empty means no project was selected. */
export interface ComputerRoundHolder {
  readonly sessionId: string;
  readonly projectId: string | null;
  readonly lastInjectAt: number | null;
}

/**
 * A confirm card is for the round that holds the computer when that round is the one being asked about.
 * Any other request stays on the project in the URL.
 */
export function reviewProjectFor(openProjectId: string, runSessionId: string | null, holder: ComputerRoundHolder | null): string {
  if (runSessionId && holder && holder.sessionId === runSessionId && holder.projectId) return holder.projectId;
  return openProjectId;
}

/** Forbidden apps, and any window that shows Molis Work: the Assistant cannot approve itself. */
export function refuseSelfApproval(app: AppIdentity, windowTitle: string, userForbidden: readonly string[] = []): string | null {
  const verdict = tierOf(app, userForbidden);
  if (verdict.tier === "forbidden") return `禁区：${verdict.reason}`;
  if (showsMolis(windowTitle)) return "禁区：这个窗口显示着 Molis Work，助理不能操作自己的确认卡";
  return null;
}

export interface LandingProbe {
  readonly window?: { readonly pid?: number; readonly title?: string };
  readonly element?: { readonly pid?: number; readonly window_title?: string };
}

/** The pointer is on another app's window, or on a window that shows Molis Work. */
export function refuseLanding(probe: LandingProbe, targetPid: number): string | null {
  if (showsMolis(probe.element?.window_title ?? "") || showsMolis(probe.window?.title ?? "")) {
    return "落点在显示着 Molis Work 的窗口上：助理不能操作自己的确认卡";
  }
  if (probe.window?.pid !== undefined && probe.window.pid !== targetPid) return "落点不在目标应用上：那里的窗口不是这一步要操作的应用";
  if (probe.element?.pid !== undefined && probe.element.pid !== targetPid) return "落点不在目标应用上：那里的控件属于别的程序";
  return null;
}

export interface CaptureFacts {
  readonly targetPid: number;
  /** Apps whose windows are in the image. Omitted means the helper captured only the target, as it does today. */
  readonly includedPids?: readonly number[];
  /** Password fields the helper saw. Omitted means it is the same count the helper says it covered. */
  readonly passwordFields?: number;
  /** Password fields painted over before the bytes left the helper. */
  readonly coveredFields?: number;
}

/** Another app is in the image, or a password field was seen and not painted over. */
export function refuseCapture(facts: CaptureFacts): string | null {
  const included = facts.includedPids ?? [facts.targetPid];
  if (included.some(pid => pid !== facts.targetPid)) return "截图会带出别的应用";
  const covered = facts.coveredFields ?? 0;
  const password = facts.passwordFields ?? covered;
  if (password > covered) return "截图会带出没有涂黑的密码框";
  return null;
}

/**
 * What the window itself says (`windowText`) is not an instruction. The tier still comes from the app and the
 * window title, so a page that says "type this" cannot make a terminal accept typing or open a forbidden app.
 */
export function refuseDespiteWindowText(input: {
  readonly app: AppIdentity;
  readonly windowTitle: string;
  readonly windowText: string;
  readonly action?: string;
  readonly userForbidden?: readonly string[];
}): string | null {
  const forbidden = input.userForbidden ?? [];
  const self = refuseSelfApproval(input.app, input.windowTitle, forbidden);
  if (self) return self;
  const verdict = tierOf(input.app, forbidden);
  if (verdict.tier === "look-and-click" && input.action && !LOOK_AND_CLICK_ACTIONS.has(input.action)) {
    return `「${input.app.name}」只能看和点：助理不能在这里输入或按键（命令走 Coding）`;
  }
  return null;
}
