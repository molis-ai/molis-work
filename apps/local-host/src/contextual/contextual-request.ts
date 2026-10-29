import { FRAGMENT_GRANULARITIES, FRAGMENT_ROLES, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  SURFACE_LANDING_POSITIONS, SURFACE_PLACES, type ContextualJudgeRequest, type SurfaceActivity, type SurfaceFocus, type SurfaceFocusTarget,
  type SurfaceLanding, type SurfaceLandingPosition, type SurfacePlace,
} from "@molis-ai/molis-work-contracts/services/contextual";

/**
 * What a page may claim about the context, bounded before anything else reads it. A page's focus and landing are claims:
 * every string is capped, every set is closed, and what the Host does not need (the screen rectangle) is never read.
 */
/** Why a context request is refused: a claim of the page that does not hold (`invalid`), or one the directory has moved past (`conflict`). */
export const contextualErrors = defineErrorCodes("contextual", {
  input_invalid: "invalid", stale: "conflict", unavailable: "conflict", not_offered: "conflict", not_drafted: "conflict", empty: "conflict",
  reference_unavailable: "conflict",
});

export const invalid = (field: string) => contextualErrors.input_invalid(`情境请求的 ${field} 不合法`);
const ACTIVITIES: ReadonlySet<string> = new Set<SurfaceActivity>(["browsing", "selecting", "editing", "comparing", "completed"]);
const GRANULARITIES: ReadonlySet<string> = new Set(["page", "object", ...FRAGMENT_GRANULARITIES]);
const ROLES: ReadonlySet<string> = new Set(FRAGMENT_ROLES);
const PLACES: ReadonlySet<string> = new Set(SURFACE_PLACES);
const POSITIONS: ReadonlySet<string> = new Set(SURFACE_LANDING_POSITIONS);
const MAX_TARGETS = 24;
const MAX_LANDING_TARGETS = 4;
const MAX_TARGET_TEXT = 4_000;

/**
 * The limits count UTF-16 units, as `readString` does. A cut between the two halves of a character drops the lone half instead of
 * keeping it; text within the limit comes back as it was.
 */
export const cutHead = (text: string, max: number): string => text.length <= max ? text : text.slice(0, max).replace(/[\uD800-\uDBFF]$/u, "");
const cutTail = (text: string, max: number): string => text.length <= max ? text : text.slice(-max).replace(/^[\uDC00-\uDFFF]/u, "");

export function readString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value || value.length > max) throw invalid(field);
  return value;
}

function readRef(value: unknown, field: string): SurfaceFocus["object"] {
  if (!value || typeof value !== "object") throw invalid(field);
  const ref = value as Record<string, unknown>;
  const version = ref.version;
  if (version !== undefined && typeof version !== "string" && typeof version !== "number") throw invalid(`${field}.version`);
  return { kind: readString(ref.kind, `${field}.kind`, 80), id: readString(ref.id, `${field}.id`, 200),
    ...(version !== undefined ? { version } : {}), ...(typeof ref.title === "string" ? { title: cutHead(ref.title, 200) } : {}) };
}

const strings = (value: unknown, max: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, max).map(item => cutHead(item, 200)) : [];

function readTargets(raw: unknown, field: string, max: number): SurfaceFocusTarget[] {
  if (!Array.isArray(raw) || raw.length > max) throw invalid(field);
  return raw.map((item: unknown, index): SurfaceFocusTarget => {
    if (!item || typeof item !== "object") throw invalid(`${field}[${index}]`);
    const target = item as Record<string, unknown>;
    if (target.kind !== "text_range" && target.kind !== "block" && target.kind !== "object") throw invalid(`${field}[${index}].kind`);
    if (target.role !== undefined && !ROLES.has(String(target.role))) throw invalid(`${field}[${index}].role`);
    if (typeof target.text !== "string") throw invalid(`${field}[${index}].text`);
    const cut = target.text.length > MAX_TARGET_TEXT;
    return { kind: target.kind, ...(target.role !== undefined ? { role: target.role as SurfaceFocusTarget["role"] } : {}),
      ...(target.ref !== undefined ? { ref: readRef(target.ref, `${field}[${index}].ref`) } : {}),
      text: cutHead(target.text, MAX_TARGET_TEXT), ...(cut || target.truncated === true ? { truncated: true } : {}),
      ...(Number.isInteger(target.anchor) ? { anchor: target.anchor as number } : {}), ...(Number.isInteger(target.head) ? { head: target.head as number } : {}) };
  });
}

function readSurroundings(raw: unknown): SurfaceFocus["surroundings"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const around = raw as Record<string, unknown>;
  return { heading_path: strings(around.heading_path, 6),
    ...(typeof around.before === "string" ? { before: cutTail(around.before, 300) } : {}),
    ...(typeof around.after === "string" ? { after: cutHead(around.after, 300) } : {}) };
}

/** Where the person can put what is in hand: the pane on the left, the object in it and the position, bounded like a focus. */
export function readLanding(raw: unknown): SurfaceLanding {
  if (!raw || typeof raw !== "object") throw invalid("landing");
  const landing = raw as Record<string, unknown>;
  const position = readString(landing.position, "landing.position", 20);
  if (!POSITIONS.has(position)) throw invalid("landing.position");
  const { kind, id, title } = readRef(landing.object, "landing.object");
  const version = landing.version;
  if (typeof version !== "string" && typeof version !== "number") throw invalid("landing.version");
  if (typeof version === "string" ? !version || version.length > 120 : !Number.isFinite(version)) throw invalid("landing.version");
  // A position inside an object says where: at least one part, and its editor positions. The object itself needs none.
  const targets = position === "object" ? [] : readTargets(landing.targets, "landing.targets", MAX_LANDING_TARGETS);
  if (position !== "object" && !targets.some(target => Number.isInteger(target.anchor) && Number.isInteger(target.head))) throw invalid("landing.targets");
  const surroundings = readSurroundings(landing.surroundings);
  return { pane_id: readString(landing.pane_id, "landing.pane_id", 80), plugin_id: readString(landing.plugin_id, "landing.plugin_id", 120),
    object: { kind, id, ...(title ? { title } : {}) }, position: position as SurfaceLandingPosition, ...(targets.length ? { targets } : {}),
    ...(surroundings ? { surroundings } : {}), version };
}

function readPlace(focus: Record<string, unknown>): { place?: SurfacePlace; side_tab?: string } {
  if (focus.place === undefined) return {};
  if (typeof focus.place !== "string" || !PLACES.has(focus.place)) throw invalid("focus.place");
  const place = focus.place as SurfacePlace;
  return { place, ...(place === "side" && focus.side_tab !== undefined ? { side_tab: readString(focus.side_tab, "focus.side_tab", 64) } : {}) };
}

/** A page's claim about what the person has in hand, bounded before anything else reads it. */
export function readJudgeRequest(body: Record<string, unknown>): Omit<ContextualJudgeRequest, "pane_id"> {
  const raw = body.focus;
  if (!raw || typeof raw !== "object") throw invalid("focus");
  const focus = raw as Record<string, unknown>;
  const activity = readString(focus.activity, "focus.activity", 20);
  const granularity = readString(focus.granularity, "focus.granularity", 20);
  if (!ACTIVITIES.has(activity)) throw invalid("focus.activity");
  if (!GRANULARITIES.has(granularity)) throw invalid("focus.granularity");
  const targets = readTargets(focus.targets, "focus.targets", MAX_TARGETS);
  const surroundings = readSurroundings(focus.surroundings);
  const goal = focus.goal && typeof focus.goal === "object" ? focus.goal as Record<string, unknown> : null;
  return {
    focus: {
      context_id: readString(focus.context_id, "focus.context_id", 240), plugin_id: readString(focus.plugin_id, "focus.plugin_id", 120),
      activity: activity as SurfaceActivity, granularity: granularity as SurfaceFocus["granularity"], object: readRef(focus.object, "focus.object"), targets,
      ...(surroundings ? { surroundings } : {}),
      ...(focus.unsaved === true ? { unsaved: true } : {}),
      ...(goal && typeof goal.id === "string" && typeof goal.title === "string" ? { goal: { id: cutHead(goal.id, 200), title: cutHead(goal.title, 200),
        ...(typeof goal.state === "string" ? { state: cutHead(goal.state, 40) } : {}) } } : {}),
      ...readPlace(focus),
    },
    ...(body.landing !== undefined ? { landing: readLanding(body.landing) } : {}),
    recent: strings(body.recent, 3),
    pinned: strings(body.pinned, 8),
    dismissed: strings(body.dismissed, 32),
    ...(body.previous && typeof body.previous === "object" && typeof (body.previous as Record<string, unknown>).context_id === "string"
      ? { previous: { context_id: cutHead(String((body.previous as Record<string, unknown>).context_id), 240), primary: strings((body.previous as Record<string, unknown>).primary, 8) } } : {}),
  };
}

/** The creation entry a sentence on a plugin's own page names: the action that creates, and which of its entries. */
export function readEntry(body: Record<string, unknown>): { readonly capability_id: string; readonly version: number; readonly provider_id?: string; readonly intake_id: string } {
  const raw = body.action;
  if (!raw || typeof raw !== "object") throw invalid("action");
  const reference = raw as Record<string, unknown>;
  const version = reference.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw invalid("action.version");
  return { capability_id: readString(reference.capability_id, "action.capability_id", 200), version,
    ...(reference.provider_id !== undefined ? { provider_id: readString(reference.provider_id, "action.provider_id", 200) } : {}),
    intake_id: readString(body.intake_id, "intake_id", 40) };
}
