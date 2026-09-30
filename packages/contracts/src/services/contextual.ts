import type { FragmentApply, FragmentGranularity, FragmentIntent, FragmentTarget } from "../platform/action-fragments.js";

/**
 * Context-driven interaction (specs/contextual-interaction). A surface declares what the person has in hand; the Host
 * ranks the actions the directory offers for it; the bar and the Assistant show them; a click runs one against the
 * context frozen at that moment. Everything here is a claim from the page until an owner reads the object again.
 */

/** Window event a surface raises whenever its focus changes; `detail` is a `SurfaceFocus` or `null` (nothing in hand). */
export const SURFACE_FOCUS_EVENT = "molis:surface-focus";
/** Agreed with the bar owner (spec §6.3): the Host's ranked actions for the current context, and the person's choice. */
export const CONTEXT_ACTIONS_EVENT = "molis:assistant-context-actions";
export const CONTEXT_ACTION_CHOSEN_EVENT = "molis:assistant-context-action-chosen";
/** Raised by the navigation owner when the focused pane's place changes; any pending judgment for that pane is void. */
export const PLACE_CHANGED_EVENT = "molis-work:place-changed";

export type SurfaceActivity = "browsing" | "selecting" | "editing" | "comparing" | "completed";
export type SurfaceGranularity = "page" | "object" | FragmentGranularity;

export interface SurfaceFocusTarget extends FragmentTarget {
  /** Editor positions, valid only for `object.version` at the moment of the focus. */
  readonly anchor?: number;
  readonly head?: number;
}

export interface SurfaceFocus {
  /** Changes whenever what the person has in hand changes; a judgment for another id is stale. */
  readonly context_id: string;
  readonly plugin_id: string;
  readonly activity: SurfaceActivity;
  readonly granularity: SurfaceGranularity;
  readonly object: { readonly kind: string; readonly id: string; readonly version?: string | number; readonly title?: string };
  readonly targets: readonly SurfaceFocusTarget[];
  /** Bounded neighbourhood: the heading path, and at most 300 characters on each side. */
  readonly surroundings?: { readonly heading_path: readonly string[]; readonly before?: string; readonly after?: string };
  readonly unsaved?: boolean;
  /** The Goal the object belongs to, when the surface knows it. */
  readonly goal?: { readonly id: string; readonly title: string; readonly state?: string };
}

/** The context as it was when the person clicked; every preview and execution uses this, never the live selection. */
export interface FrozenFocus {
  readonly focus: SurfaceFocus;
  /** Page-side handle to map the frozen anchors through later edits. */
  readonly token: string;
  readonly frozen_at: string;
}

export interface ContextualCandidate {
  /** Stable judgment option key (≤ 64 characters): provider, query and declared offer; never the object. */
  readonly key: string;
  readonly offer_id: string;
  readonly title: string;
  readonly intent: FragmentIntent;
  readonly apply: FragmentApply;
  readonly hint: string;
  readonly source: { readonly capability_id: string; readonly version: number; readonly provider_id: string };
  readonly action: { readonly capability_id: string; readonly version: number; readonly provider_id: string };
  readonly provider_title: string;
  readonly available: boolean;
  readonly reason?: string;
}

export type AssistantForm = "none" | "suggest" | "options" | "preview" | "compare";
export const ASSISTANT_FORMS: readonly AssistantForm[] = ["none", "suggest", "options", "preview", "compare"];

/** What the judgment said, kept apart from what the layout policy did with it. */
export interface ContextualJudgment {
  /** `jev`: the real model; `replay`: recorded answers (a labelled stand-in); `rules`: no model. */
  readonly basis: "jev" | "replay" | "rules";
  readonly next: Readonly<Record<string, number>>;
  /** Per declared intent. Derived from `next` by each candidate's intent unless the model answered it directly. */
  readonly intent: Readonly<Record<string, number>>;
  readonly surface: AssistantForm;
  /** Probability of the chosen `surface`; the Assistant takes part only when it is high enough. */
  readonly surface_probability: number | null;
  /** Kept for recorded answers from the first question set; the current set does not ask it (spec §5.4). */
  readonly speak_up: number | null;
  readonly confidence: number | null;
  readonly model?: string;
  readonly latency_ms: number;
}

export interface ContextualLayoutPlan {
  readonly context_id: string;
  /** `rules` until a judgment for this very context arrives. */
  readonly basis: "rules" | "judgment";
  /** At most three keys, in display order. */
  readonly primary: readonly string[];
  /** One key the bar may emphasise, or none when the judgment is not sure enough. */
  readonly emphasis: string | null;
  /** The rest, grouped by declared intent, groups in the order the judgment ranks them. */
  readonly more: readonly { readonly intent: FragmentIntent; readonly title: string; readonly keys: readonly string[] }[];
  /** The Assistant takes part only when the judgment thinks it is worth it. */
  readonly assistant: null | { readonly form: Exclude<AssistantForm, "none">; readonly intent: FragmentIntent; readonly keys: readonly string[] };
  /** Every available action for this context, for “全部操作”; independent of any judgment. */
  readonly candidates: readonly ContextualCandidate[];
}

export interface ContextualJudgeRequest {
  readonly pane_id: string;
  readonly focus: SurfaceFocus;
  /** Titles of the person's last few actions here, without content. */
  readonly recent?: readonly string[];
  /** Keys under the pointer or keyboard focus right now: the plan keeps their positions. */
  readonly pinned?: readonly string[];
  /** The plan on screen, so a new one moves as little as possible. */
  readonly previous?: { readonly context_id: string; readonly primary: readonly string[] };
  /** Keys the person dismissed in this context. */
  readonly dismissed?: readonly string[];
}

export interface ContextualJudgeResponse {
  readonly plan: ContextualLayoutPlan;
  readonly judgment: ContextualJudgment | null;
  readonly receipt: {
    readonly context_id: string;
    /** Digest of what was sent to the model; the text itself is not kept. */
    readonly state_digest: string | null;
    readonly candidate_count: number;
    /** Why no judgment was used, when none was. */
    readonly fallback?: "unconfigured" | "failed" | "timeout" | "aborted" | "no_candidates";
    /** Parts left out or marked before anything reached the model (bounded, redacted, instruction-shaped). */
    readonly screened: readonly string[];
  };
}
