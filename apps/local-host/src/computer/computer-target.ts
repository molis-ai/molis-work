import type { HostSurfaceExpectedTarget } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { refused } from "./computer-errors.js";

type Frame = readonly [number, number, number, number];

/** Facts emitted by the helper for one observed window. No titles, document paths or field values are needed on the wire. */
export interface ComputerWindowTarget {
  readonly bundle_id: string;
  readonly pid: number;
  readonly launch_time: number;
  readonly window_id: number;
  readonly frame: Frame;
  readonly title_hash: string;
  readonly document_hash?: string;
  readonly focus?: string;
}

export const NO_APP_SCOPE = "desktop:no-app";

function frameOf(value: unknown): value is Frame {
  return Array.isArray(value) && value.length === 4 && value.every(part => typeof part === "number" && Number.isFinite(part))
    && value[2] > 0 && value[3] > 0;
}

export function computerWindowTarget(value: unknown): ComputerWindowTarget {
  if (typeof value === "object" && value !== null && "bundle_id" in value && "pid" in value && "launch_time" in value
    && "window_id" in value && "frame" in value && typeof value.bundle_id === "string" && value.bundle_id
    && typeof value.pid === "number" && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.launch_time === "number" && Number.isFinite(value.launch_time) && value.launch_time > 0
    && typeof value.window_id === "number" && Number.isSafeInteger(value.window_id) && value.window_id > 0 && frameOf(value.frame)
    && "title_hash" in value && typeof value.title_hash === "string" && value.title_hash.length > 0
    && (!("document_hash" in value) || typeof value.document_hash === "string" && value.document_hash.length > 0)
    && (!("focus" in value) || typeof value.focus === "string" && value.focus.length > 0)) {
    return { bundle_id: value.bundle_id, pid: value.pid, launch_time: value.launch_time, window_id: value.window_id,
      frame: value.frame, title_hash: value.title_hash,
      ...("document_hash" in value && typeof value.document_hash === "string" ? { document_hash: value.document_hash } : {}),
      ...("focus" in value && typeof value.focus === "string" ? { focus: value.focus } : {}) };
  }
  throw refused("outside-target", "无法核对原应用窗口，请重新观察");
}

export function sameComputerWindow(original: ComputerWindowTarget, current: ComputerWindowTarget): boolean {
  return original.pid === current.pid && original.launch_time === current.launch_time
    && original.bundle_id === current.bundle_id && original.window_id === current.window_id
    && original.document_hash === current.document_hash;
}

export function expectedComputerWindow(expected: HostSurfaceExpectedTarget, takeovers: number): ComputerWindowTarget | null {
  let parsed: unknown;
  try { parsed = JSON.parse(expected.identity); }
  catch { throw refused("outside-target", "无法核对原应用窗口，请重新观察"); }
  if (!Array.isArray(parsed) || parsed[1] !== takeovers) throw refused("outside-target", "原电脑观察已失效，请重新观察");
  if (expected.scope === NO_APP_SCOPE && parsed[0] === null) return null;
  const window = computerWindowTarget(parsed[0]);
  if (window.bundle_id !== expected.scope) throw refused("outside-target", "原应用已变化，请重新观察");
  return window;
}
