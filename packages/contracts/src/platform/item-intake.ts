import type { ActionReference } from "./actions.js";
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

/** What each declared word may be, so a Manifest cannot make the bar wider than its own row. */
export const ITEM_DECLARATION_LIMITS = { id: 40, title: 40, verb: 40, describe: 240, example: 120, examples: 3 } as const;

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

/** This action creates an Item. */
export interface ActionIntake extends DestinationDeclaration {
  /** Stable and unique among this provider's intakes; lowercase letters, digits, `_`, `.` and `-`, at most 40. */
  readonly intake_id: string;
  /** The kind of the Item it creates, as its owner names its objects. */
  readonly item_kind: string;
  /** One to three sentences a person might say, the first one the placeholder of the page's “✦”. */
  readonly examples: readonly string[];
  /** `proposes`: it only files a proposal that its owner confirms elsewhere (Goals); the person always sees a card first. */
  readonly effect?: "creates" | "proposes";
  /** One passage can become several Items; the person sees one card and can drop single ones. */
  readonly multiple?: boolean;
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
