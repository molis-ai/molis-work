import type { ActionReference } from "./actions.js";
import type { TextRef } from "./ui-text.js";
import type { ArtifactFileDeclaration } from "./plugin-manifest.js";
import type { IntakeStart } from "./intake-start.js";
import type { SurfacePlace } from "../services/contextual.js";

/**
 * Putting what the person has in hand somewhere (specs/context-program §3.3–§3.4, quick-create §4). Two declarations on a
 * provider's own write action, so a capability is still registered once and an undo is still the action's own `undo`:
 *
 * - `intake`: this action creates an Item. The workbench derives a candidate `intake.<provider>.<intake_id>` for what is in
 *   hand and a “✦ 一句话新建” entry for the plugin's page; nobody keeps a list of destinations.
 * - `attach`: this action puts material into an Item that already exists, at a position in it. The candidate is
 *   `attach.<provider>.<attach_id>`; when the open object on the left is of the declared kind, the landing is the target.
 *
 * Both are claims by the provider's own Manifest, checked when it registers (plugin SDK) and read by the kernel; they
 * grant nothing. The action still needs the person's authority to run.
 */

/** Where in the landing object an `attach` can put things; omitted, the landing is the object itself (a Goal, a session). */
export const ITEM_ATTACH_POSITIONS = ["cursor", "selection", "end"] as const;
export type ItemAttachPosition = (typeof ITEM_ATTACH_POSITIONS)[number];

/**
 * What each declared word may be, so a Manifest cannot make the bar wider than its own row. An id is 50 long: the platform names a
 * content station's intakes `<station>.receive` and `<station>.create`, and a station id is at most 41 (contract-design §2.1).
 */
export const ITEM_DECLARATION_LIMITS = { id: 50, title: 40, verb: 40, describe: 240, example: 120, examples: 3, start_title: 80, hint: 200 } as const;

interface DestinationDeclaration {
  /** The destination's name: 「待办」「灵光」. */
  readonly title: string;
  /** The button's words: 「记成待办」. */
  readonly verb: string;
  /** One sentence a judgment reads to tell this destination from the others: what it holds, what it does not. */
  readonly describe: string;
  /** The top-level field of this action's input that receives the selected text, when there is one. */
  readonly material_field?: string;
  /**
   * A fragment-offers query of the same provider (`defineFragmentOffersAction`) whose offer named like this declaration's id
   * computes this action's whole input from the selected text and its source, without a model. Today's “记成待办” offers
   * become the `prepare` of the matching `intake`.
   */
  readonly prepare?: Pick<ActionReference, "capability_id" | "version">;
  /** Narrows where the person must be holding something for this to be offered; omitted, anywhere. */
  readonly places?: readonly SurfacePlace[];
}

export type { IntakeStart } from "./intake-start.js";

/** This action creates an Item from what a person has in hand, or from nothing (`accepts: []`). */
export interface PersonIntake extends DestinationDeclaration {
  /** Stable and unique among this provider's intakes; lowercase letters, digits, `_`, `.` and `-`, at most 50. */
  readonly intake_id: string;
  /** The language key of `title`, where a list shows it to a person (「从目标新建…」); `title` stays the original. */
  readonly title_text?: TextRef;
  /** The kind of the Item it creates, as its owner names its objects. */
  readonly item_kind: string;
  /** One to three sentences a person might say, the first one the placeholder of the page's “✦”; may be empty only with `accepts: []`. */
  readonly examples: readonly string[];
  /** `proposes`: it only files a proposal that its owner confirms elsewhere (Goals); the person always sees a card first. */
  readonly effect?: "creates" | "proposes";
  /** One passage can become several Items; the person sees one card and can drop single ones. */
  readonly multiple?: boolean;
  /** What it takes; omitted, the selected text (contract-design §2.1); `[]` makes a blank one. */
  readonly accepts?: readonly PersonMaterial[];
  /** A starting point for making one from nothing (§2.4). */
  readonly start?: IntakeStart;
}

/**
 * This action takes what the platform delivers (contract-design §2.1): a workflow's hand-in, a notification, onboarding's materials.
 * No person picks it from a bar, so it has no words of its own; the platform shows the plugin's name when it asks who takes it. Its
 * input and output are the platform's shape for that material, exactly.
 */
export interface DeliveredIntake {
  readonly intake_id: string;
  readonly item_kind: string;
  readonly accepts: readonly [DeliveredMaterial];
}

export type ActionIntake = PersonIntake | DeliveredIntake;

/** What a person hands over: the selected text, or a 成果 version (「从这一版继续」). */
export type PersonMaterial =
  | { readonly kind: "text" }
  | { readonly kind: "artifact"; readonly artifact_types: readonly { readonly artifact_type_id: string; readonly schema_version: number }[]; readonly file?: ArtifactFileDeclaration };

/**
 * What the platform delivers. `handoff`: a workflow's content (a station's `receive`); `notification`: the platform's notifications;
 * `code_root`, `documents`, `drafts`: onboarding's (§2.5); `documents` also takes a project's automation report. `drafts` names its `get` and `keep` actions of the same Manifest.
 */
export type DeliveredMaterial =
  | { readonly kind: "handoff" } | { readonly kind: "notification" } | { readonly kind: "code_root" } | { readonly kind: "documents" }
  | { readonly kind: "drafts"; readonly get: Pick<ActionReference, "capability_id" | "version">; readonly keep: Pick<ActionReference, "capability_id" | "version"> };

/** What a declaration takes (contract-design §2.1). Omitted, it is `[{ kind: "text" }]`: what the person has selected. */
export type ItemMaterial = PersonMaterial | DeliveredMaterial;
export type DeliveredMaterialKind = DeliveredMaterial["kind"];
export const DELIVERED_MATERIAL_KINDS: readonly DeliveredMaterialKind[] = ["handoff", "notification", "code_root", "documents", "drafts"];

/** Whether an intake takes what the platform delivers (and so has no words for a person). */
export function isDeliveredIntake(intake: ActionIntake): intake is DeliveredIntake {
  return Array.isArray(intake.accepts) && intake.accepts.length === 1 && (DELIVERED_MATERIAL_KINDS as readonly string[]).includes(intake.accepts[0]!.kind);
}

/** The materials an intake takes, with the default made explicit: the selected text. */
export function intakeAccepts(intake: Pick<ActionIntake, "accepts">): readonly ItemMaterial[] {
  return intake.accepts ?? [{ kind: "text" }];
}

/** The one material of `kind` an intake takes, if it takes it. */
export function intakeMaterial<K extends ItemMaterial["kind"]>(intake: Pick<ActionIntake, "accepts"> | undefined, kind: K): Extract<ItemMaterial, { kind: K }> | undefined {
  return intake ? intakeAccepts(intake).find((material): material is Extract<ItemMaterial, { kind: K }> => material.kind === kind) : undefined;
}

/** A person's intake that takes the selected text: the only kind a page may draft by its id (§2.1). */
export function takesSelectedText(intake: ActionIntake): intake is PersonIntake {
  return !isDeliveredIntake(intake) && intakeAccepts(intake).some(material => material.kind === "text");
}

/** This action puts material into an existing Item of the provider's own kind. */
export interface ActionAttach extends DestinationDeclaration {
  /** Stable and unique among this provider's attaches; same alphabet and length as an intake id. */
  readonly attach_id: string;
  /** A kind the same provider owns (it has an object reader for it): nobody writes into another plugin's objects. */
  readonly item_kind: string;
  /** Cursor and selection need an `expected_version` in the input, so a write to a document that changed is refused. */
  readonly positions?: readonly ItemAttachPosition[];
}
