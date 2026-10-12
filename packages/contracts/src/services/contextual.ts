import type { FragmentApply, FragmentGranularity, FragmentIntent, FragmentTarget } from "../platform/action-fragments.js";

/**
 * Context-driven interaction (specs/archive/contextual-interaction). A surface declares what the person has in hand; the Host
 * ranks the actions the directory offers for it; the bar and the Assistant show them; a click runs one against the
 * context frozen at that moment. Everything here is a claim from the page until an owner reads the object again.
 */

/**
 * Raised by a surface, bubbling from its own root element, whenever its focus changes; `detail` is a `SurfaceFocus` or
 * `null` (nothing in hand). The row watches that element: once it is out of sight, what was in hand there is void.
 */
export const SURFACE_FOCUS_EVENT = "molis:surface-focus";
/**
 * Window event, cancelable: the person chose `key` for `context_id`. The surface that owns the context takes it by
 * calling `preventDefault()`, then `prepare()` for the provider's complete input, and shows a preview before writing.
 * Nobody taking it means no page here can run it; the Assistant then gets the words and the material, unsent.
 */
export const CONTEXT_ACTION_CHOSEN_EVENT = "molis:assistant-context-action-chosen";

/** `detail` of `CONTEXT_ACTION_CHOSEN_EVENT`. */
export interface ContextActionChosen {
  readonly plugin_id: string;
  readonly context_id: string;
  readonly key: string;
  readonly offer_id: string;
  readonly apply: FragmentApply;
  readonly intent: FragmentIntent;
  readonly title: string;
  /** `object`: it acts on the whole object, not on what is selected. */
  readonly scope?: "object";
  /** The object the context is about; with `scope: "object"` the page that has it open may take the choice without a selection. */
  readonly object?: SurfaceFocus["object"];
  /** The provider's complete input for this offer and exactly this context; rejects when it is no longer offered. */
  prepare(): Promise<{ readonly key: string; readonly apply: FragmentApply; readonly action: ContextualCandidate["action"]; readonly input: unknown }>;
}
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
  /**
   * Where the thing in hand is. The workbench sets it from the document that reported the focus (a plugin's own claim is
   * not taken); absent means the work area, `main`.
   */
  readonly place?: SurfacePlace;
  /** With `place: "side"`: which cell of the right panel (`shelf`, `discussion`, `plugin:<plugin>/<view>` …). */
  readonly side_tab?: string;
  /** Where the bar is drawn. Meaningful only in the document that reported it: it never goes to the Host or across frames. */
  readonly screen?: SurfaceScreenAnchor;
}

/** Where the thing in hand is: the work area on the left, a cell of the right panel, or the Assistant panel. */
export type SurfacePlace = "main" | "side" | "assistant";
export const SURFACE_PLACES: readonly SurfacePlace[] = ["main", "side", "assistant"];

/**
 * A rectangle in the reporting document's viewport coordinates, as it was when the surface reported, and the side of it
 * to draw on (default above, flipping when there is no room). Plain data: a surface that moves (scroll, a row that
 * reflows) reports again rather than handing over an element, so a focus can always be cloned and posted.
 */
export interface SurfaceScreenAnchor {
  readonly rect?: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly placement?: "above" | "below";
}

/** What a landing is inside its object. `object`: the object itself is where things go (a Goal, a Coding session). */
export type SurfaceLandingPosition = "cursor" | "selection" | "end" | "object";
export const SURFACE_LANDING_POSITIONS: readonly SurfaceLandingPosition[] = ["cursor", "selection", "end", "object"];

/**
 * Where the thing in hand can be put: what the focused pane on the left has open and where in it. Reported by the page that
 * owns the object, with the same standing as a `SurfaceFocus`: a claim until that owner reads the object again. The owner
 * checks `version` before it writes at a position, so a landing that went stale is refused rather than followed.
 */
export interface SurfaceLanding {
  readonly pane_id: string;
  readonly plugin_id: string;
  readonly object: { readonly kind: string; readonly id: string; readonly title?: string };
  readonly position: SurfaceLandingPosition;
  /**
   * `selection`: the text that would be replaced. `cursor` and `end`: one collapsed part (empty text) whose `anchor` and
   * `head` are that position. Editor positions are valid only for `version`. `object`: none.
   */
  readonly targets?: readonly SurfaceFocusTarget[];
  /** Bounded neighbourhood of the position, for the judgment and the preview. */
  readonly surroundings?: SurfaceFocus["surroundings"];
  /** Opaque to everyone but the owner: what it compares before writing at a position. */
  readonly version: string | number;
  readonly screen?: SurfaceScreenAnchor;
}

/** The context as it was when the person clicked; every preview and execution uses this, never the live selection. */
export interface FrozenFocus {
  readonly focus: SurfaceFocus;
  /** Where it was going to be put, frozen with it: the preview and the write both use this one. */
  readonly landing?: SurfaceLanding;
  /** Page-side handle to map the frozen anchors through later edits. */
  readonly token: string;
  readonly frozen_at: string;
}

/** Limits on what a plugin publishes as tools (`ContextTools`); anything beyond them is dropped. */
export const CONTEXT_TOOL_LIMITS = { groups: 6, items: 24, label: 24 } as const;

/** Letters a tool may show as its face, besides an icon name from the design system. */
export type ContextToolGlyph = "B" | "I" | "U" | "S" | "H1" | "H2" | "H3" | "A";

/**
 * One command a plugin runs on the content it has open (bold, a heading, a list). Not an action: nothing here is in the
 * directory, no agent calls it, and the plugin keeps its own undo. Plain data, so it clones across frames.
 */
export interface ContextToolItem {
  /** Unique and stable within its group. */
  readonly id: string;
  /** The accessible name and the tooltip, already translated. */
  readonly label: string;
  readonly icon?: string;
  readonly glyph?: ContextToolGlyph;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  /** Clicking opens a panel the plugin draws under the bar (a link's address, a comment). */
  readonly opens?: "panel";
}

export interface ContextToolGroup {
  readonly id: string;
  readonly items: readonly ContextToolItem[];
  /** `overflow`: the group may fold into one menu when the bar is narrow. */
  readonly collapse?: "never" | "overflow";
}

/** What the plugin has to offer for the context `context_id`; one for another context is stale and dropped. */
export interface ContextTools {
  readonly context_id: string;
  readonly groups: readonly ContextToolGroup[];
}

/** `detail` of the bar's request that a tool run: the plugin runs it and publishes its tools again. */
export interface ContextToolInvoke {
  readonly context_id: string;
  readonly group: string;
  readonly id: string;
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
  /** `object`: a whole-object action (整篇) offered while only part of the object is in hand; it acts on all of it. */
  readonly scope?: "object";
  /**
   * Where the candidate was declared. Absent: fragment offers (`frag.` keys). `subject`: the object's subject offers,
   * which the Home / Dock rules also choose from; their keys stay `offer.` so saved rules and bindings keep working.
   * `intake`: a command that creates an Item (`intake.` keys). `attach`: a command that puts the thing in hand into the
   * object open on the left (`attach.` keys). The last two are destinations: they only ever take a recommended slot.
   */
  readonly origin?: "subject" | "intake" | "attach";
  /** For `attach`: where in the landing object it would put the thing, as the landing reported it. */
  readonly position?: SurfaceLandingPosition;
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
  /** Groups by declared intent, then `whole` (整篇): the whole-object actions, last and never in `primary`. */
  readonly more: readonly { readonly intent: FragmentIntent | "whole"; readonly title: string; readonly keys: readonly string[] }[];
  /** The Assistant takes part only when the judgment thinks it is worth it. */
  readonly assistant: null | { readonly form: Exclude<AssistantForm, "none">; readonly intent: FragmentIntent; readonly keys: readonly string[] };
  /** Every available action for this context, for “全部操作”; independent of any judgment. */
  readonly candidates: readonly ContextualCandidate[];
}

export interface ContextualJudgeRequest {
  readonly pane_id: string;
  readonly focus: SurfaceFocus;
  /** Where it can be put, when the thing in hand is not on the left and the pane there has a landing. */
  readonly landing?: SurfaceLanding;
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

/** The most a person's own sentence can add to a draft, and the most of a passage a draft keeps. */
export const CONTEXTUAL_DRAFT_LIMITS = { said: 600, kept: 10_000 } as const;

/**
 * A creation entry's input, drafted for the thing in hand or for a sentence the person wrote (context-program §6,
 * quick-create §5). Drafting writes nothing: this is the complete input of the entry's own action as far as it could be
 * filled, with what it could not fill named, and the words it was made from kept as they were.
 */
export interface ContextualDraft {
  /** The candidate's key when drafted for what is in hand; absent for a sentence written on the plugin's own page. */
  readonly key?: string;
  readonly intake_id: string;
  /** The declared verb, as the button says it: 「记成待办」. */
  readonly title: string;
  readonly action: ContextualCandidate["action"];
  readonly provider_title: string;
  readonly input: Readonly<Record<string, unknown>>;
  /** `prepared`: the provider computed it without a model. `model`: a model filled it. `rules`: only what needs no model. */
  readonly basis: "prepared" | "model" | "rules";
  /** Required fields the draft did not fill: marked on the card, never asked back. */
  readonly missing: readonly string[];
  /** The fields the person may change before it is created. */
  readonly editable: readonly string[];
  readonly summary?: string;
  /** The passage or sentence the draft was made from, exactly as given: a failed draft never loses it. */
  readonly kept: string;
  /** The extra sentence the person added to a passage, when they did. */
  readonly said?: string;
  /** Why a model did not fill it, when one was wanted: the draft is then what needs no model. */
  readonly fallback?: { readonly reason: "unconfigured" | "failed" | "invalid"; readonly message: string };
  /** What was removed or marked before the material reached a model. */
  readonly notes: readonly string[];
  readonly model?: string;
}
