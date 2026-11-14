import type { StateRingState } from "./ui-state-rings.js";
import type { TextRef } from "./ui-text.js";

// The intelligent-surface declaration (specs/shared-sources-and-surfaces §5): how a plugin's objects are shown in the four basic forms,
// written in the Manifest's `presentation` field. The composition service (`services/surface-composition`) reads it, and so does a page
// that draws one form on its own (MLN-23). The checks an author and the platform both run are the SDK's (`/presentation`, `/ui`).

/** What a field is for. A form places a field by its role, never by its key (18 roles, D 轨 2026-11-04). */
export const PRESENTATION_FIELD_ROLES = ["title", "status", "summary", "excerpt", "media", "number", "progress", "due_at", "happened_at", "updated_at",
  "actor", "activity", "origin", "version", "relation", "children", "judgment", "held_in"] as const;
/**
 * `activity` is one sentence of what happened last, a `TextRef` the owner gives (a row's second line reads `actor`, `activity` and the time,
 * MLN-23). `judgment` is a `PresentationJudgment`, `held_in` a `PresentationHeldIn`. Other values are the owner's plain JSON.
 */
export type FieldRole = (typeof PRESENTATION_FIELD_ROLES)[number];

/** The four basic forms, simplest first: a form an object does not declare steps down to the one before it (IUI-03). `live` and `embed` come in the second slice; `page` is the plugin's own main area and is never declared. */
export const PRESENTATION_FORM_KINDS = ["chip", "row", "card", "peek"] as const;
export type FormKind = (typeof PRESENTATION_FORM_KINDS)[number];

/**
 * What the mark beside a state asks of the person. Display only: it colours the dot and the status tag and never makes an entry in 「等你」,
 * whose one owner is `modules/attention-resumption` (its `reason` says why something came in; this says what you are asked to do).
 */
export const PRESENTATION_ATTENTION_STATES = ["needs_decision", "needs_acceptance", "failed", "partial", "stale"] as const;
export type AttentionState = (typeof PRESENTATION_ATTENTION_STATES)[number];

/**
 * The places a composed surface is drawn (`services/surface-composition`), named here because an action's `when.slots` names them.
 * `plugin-slot` is a slot a plugin's contribution opens with `accepts_forms` (`UiSlotDescriptor`, `platform/ui`).
 */
export const SURFACE_SLOT_KINDS = ["plugin-slot", "conversation", "discussion", "attention", "home", "shelf", "search", "side", "text"] as const;
export type SurfaceSlotKind = (typeof SURFACE_SLOT_KINDS)[number];

export interface PresentationField {
  readonly key: string;
  readonly role: FieldRole;
  /** A key of the plugin's own words; a `literal` is refused, so no interface word is written past translation. */
  readonly label?: TextRef;
}

/** One of the plugin's own states on the state ring (`ring`, a family name or one of its aliases, as `renderStateRing` takes it). */
export interface PresentationStatusMapping {
  readonly ring: StateRingState;
  readonly attention?: AttentionState;
}

export interface PresentationObjectAction {
  /** `capability_id@version` of an action in the directory. The platform's own operations (open, peek, place, hand off) are never declared. */
  readonly ref: string;
  readonly primary?: boolean;
  readonly when?: { readonly status?: readonly string[]; readonly slots?: readonly SurfaceSlotKind[] };
  /** Input key → field key the input is prepared from. Prepared only: nothing is written until the person acts. */
  readonly input_from?: Readonly<Record<string, string>>;
  /** When both conditions are supplied, both must match. This notice takes the place of the original button. */
  readonly unavailable?: {
    readonly when: { readonly status?: readonly string[]; readonly codes?: readonly string[] };
    readonly reason: TextRef;
    /** The reference of another action of this object. Its own input mapping applies. */
    readonly next?: string;
  };
}

export interface PresentationObject {
  /** A search kind or an action's subject kind this plugin already declares; no new type of its own. */
  readonly kind: string;
  readonly fields: readonly PresentationField[];
  /** The plugin's own state, by the field that holds it, mapped onto the state ring and the attention mark. */
  readonly status?: { readonly field: string; readonly map: Readonly<Record<string, PresentationStatusMapping>> };
  /** The fields each form shows. A form left out is not used: the platform steps down to the next simpler one (IUI-03). */
  readonly forms: Readonly<Partial<Record<FormKind, { readonly fields: readonly string[] }>>>;
  readonly actions?: readonly PresentationObjectAction[];
  /** The text form for external Agents, terminals and notifications (IUI §4.5): one line per field key, from the same facts as the drawn forms. */
  readonly text?: { readonly lines: readonly string[] };
}

/** An object's declaration as the platform holds it: with the owning plugin it filled in from its trusted catalog. A declaration never names one. */
export type OwnedPresentationObject = PresentationObject & { readonly owner: string };

/** The plugin as a whole on the home page and the Shelf: one of its own query actions, defined with `definePresentationOverviewAction`. */
export interface PresentationOverviewDeclaration {
  readonly capability_id: string;
  readonly version: number;
  /** A sentence that does not change (Feed's 「同步来的资料不算你接下的工作」), so the action does not return it each time. */
  readonly note?: TextRef;
  /** Where the person may start from, at most 3, each one of this Manifest's own actions; the action's `start` only picks among these. */
  readonly start?: readonly { readonly capability_id: string; readonly version: number; readonly open?: PresentationStartForm }[];
}

/** An input form on this Manifest's own stage. The Host checks that the form is bound to the declared start action. */
export interface PresentationStartForm { readonly view_id: string; readonly panel: string }

/**
 * The Manifest's `presentation`. An object it does not declare is still shown, as its icon, name, owner and 「打开」 (IUI-02).
 * `parsePluginManifest` checks it with the SDK's `validatePresentationDeclaration`, the same check an author runs (SSC-06).
 */
export interface PresentationDeclaration {
  readonly objects: readonly PresentationObject[];
  readonly overview?: PresentationOverviewDeclaration;
}
