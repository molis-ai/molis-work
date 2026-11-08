import { defineErrorCodes } from "./action-errors.js";
import { inputSchemaFor } from "./action-input.js";
import { ACTION_SUBJECT_SCHEMA, type ActionSubject } from "./action-subjects.js";
import type { ActionSchema } from "./actions.js";
import { closedObjectSchema as closed } from "./closed-object-schema.js";
import { MATERIAL_REF_SCHEMA, type MaterialRef } from "./project-materials.js";

/**
 * A plugin's source for the unified input's `+` menu (specs/unified-input-voice/implementation-plan.md §3.3, slice K0): the one
 * extension that shows across plugins, so it is an action role like `search_source`. Everything else a mount page gives is its own
 * instance's options (the SDK's `page-globals`), never registered. The provider sees only what the pick schema lets in (`query`,
 * `limit`, and `near` when the mount page hands it over): no draft, receiver or other attachment (`S-composer-source-call`).
 */

/** Read from the directory; one per action, since `capability_id@version` already names the source. */
export interface ComposerSourceDeclaration {
  /** The group's name in the menu, translated as `SearchSourceKind.title` is. */
  readonly title: string;
  /** The kinds its items are: the action's own `subject_kinds`, each read back by an object reader of the same provider. */
  readonly subject_kinds: readonly string[];
  /** Which layer's composers list it. */
  readonly layers: readonly ("ai" | "plain")[];
}

export const COMPOSER_PICK_INPUT_TYPE = /* @version type.molis.composer.pick.query "molis.composer.pick.query.v{version}" */ "molis.composer.pick.query.v1";
export const COMPOSER_PICK_OUTPUT_TYPE = /* @version type.molis.composer.pick.items "molis.composer.pick.items.v{version}" */ "molis.composer.pick.items.v1";

export interface ComposerPickInput {
  query: string;
  limit: number;
  /** The object the mount page explicitly hands over as current; absent when it hands none. */
  near?: ActionSubject;
}
/** An object of the provider's own gives `pin: { mode: "current", read_revision }`; the target reads it again at send time. */
export interface ComposerPickItem { ref: MaterialRef; title: string; hint?: string }
export interface ComposerPickOutput { items: ComposerPickItem[] }

// Fixed by the platform: a declaration must carry these exactly, so a provider cannot widen the input under the same type name.
export const COMPOSER_PICK_INPUT_SCHEMA: ActionSchema = inputSchemaFor<ComposerPickInput>()(closed({
  query: { type: "string", maxLength: 200 },
  limit: { type: "integer", minimum: 1, maximum: 50 },
  near: ACTION_SUBJECT_SCHEMA,
}, ["query", "limit"]));
export const COMPOSER_PICK_OUTPUT_SCHEMA: ActionSchema = closed({
  items: { type: "array", maxItems: 50, items: closed({ ref: MATERIAL_REF_SCHEMA, title: { type: "string", minLength: 1, maxLength: 1000 }, hint: { type: "string", maxLength: 1000 } }, ["ref", "title"]) },
});

/** What a composer hands its mount page on send: an upload the page owns, or a picked reference. */
export type ComposerMaterial =
  | { kind: "attachment"; ref: string; title: string }
  /** `source` is for display only, as `AssistantMaterial.capability` is; the target authorizes by the reference's owner. */
  | { kind: "material"; ref: MaterialRef; title: string; source: { capability_id: string; version: number; provider_id: string } };

export const composerErrors = defineErrorCodes("composer", {
  /** A source the menu listed is off, uninstalled or no longer granted. */
  source_unavailable: "unavailable",
  /** The target cannot read a picked reference at send time; the send stops with the draft and the pick kept. */
  subject_unreadable: "not_found",
  /** The mount page's own required check names what is missing. */
  required_missing: "invalid",
});
