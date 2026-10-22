/**
 * The close picture of a desktop step when the accessibility tree was not enough (specs/computer-use §9, CU-G08). The
 * helper already captures a target window on demand; this asks for a 2x crop around the point the step touched, so a
 * dense control is readable instead of a whole window at 1x. Password fields refuse the capture as usual.
 */
import type { HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { refused } from "./computer-errors.js";
import { refuseCapture } from "./computer-policy.js";
import type { AppState, DeskContext } from "./computer-driver.js";

const CROP_WIDTH = 400;
const CROP_HEIGHT = 300;
const ZOOM_SCALE = 2;

/** Where the step landed in the window's points; null for steps that do not point at one spot. */
function actionPoint(action: HostSurfaceAction): { x: number; y: number } | null {
  switch (action.what) {
    case "pointer": case "scroll": case "hover": return { x: action.x, y: action.y };
    case "drag": return { x: action.to_x, y: action.to_y };
    default: return null;
  }
}

/** A 400×300 crop around the point, kept inside the window; a smaller window gives its own frame. */
function zoomRect(frame: readonly [number, number, number, number], point: { x: number; y: number }): [number, number, number, number] {
  const width = Math.min(CROP_WIDTH, frame[2]);
  const height = Math.min(CROP_HEIGHT, frame[3]);
  const left = Math.round(frame[0] + Math.max(0, Math.min(point.x - width / 2, frame[2] - width)));
  const top = Math.round(frame[1] + Math.max(0, Math.min(point.y - height / 2, frame[3] - height)));
  return [left, top, Math.round(width), Math.round(height)];
}

type Capture = Pick<DeskContext, "helper" | "rememberProduced">;

async function zoomCapture(ctx: Capture, state: AppState, action: HostSurfaceAction): Promise<Buffer | null> {
  const point = actionPoint(action);
  if (!point || !state.window) return null;
  const shot = await ctx.helper.call<{ png: string; included_pids?: number[]; password_fields?: number; masked?: number }>("observe.screenshot",
    { pid: state.pid, rect: zoomRect(state.window.frame, point), scale: ZOOM_SCALE });
  const why = refuseCapture({ targetPid: state.pid, includedPids: shot.included_pids, passwordFields: shot.password_fields, coveredFields: shot.masked });
  if (why) throw refused("outside-target", why);
  const png = Buffer.from(shot.png, "base64");
  ctx.rememberProduced(png);
  return png;
}

/** The picture to attach to a receipt when the tree was not enough: a close crop where possible, the full window otherwise. */
export async function modelPicture(ctx: Capture, state: AppState, action: HostSurfaceAction, full: Uint8Array | undefined, needed: boolean): Promise<Uint8Array | null> {
  if (!needed || !full) return null;
  if (!actionPoint(action)) return full;
  try { return await zoomCapture(ctx, state, action) ?? full; }
  catch { return null; }
}
