import type { PluginImageTarget } from "./plugin-image-generation.js";

// What a plugin page may ask about the person's accounts (`UiPluginClientHost.connectionSlot` and `connectionNeed`), published
// through the `platform/ui` subpath. The account directory, credentials and every write stay with the trusted shell and Host.

/** Only the current or explicitly chosen account; the account directory stays in the trusted Host. */
export interface UiConnectionSlotChoice {
  readonly connection_id: string;
  readonly label: string;
  readonly auth_method: string;
  readonly state: string;
}

export type UiConnectionSlotRequest<Element = unknown> = {
  readonly slot_id: string;
  readonly record_key: string;
  readonly signal?: AbortSignal;
} & ({ readonly mode: "read" } | { readonly mode: "choose"; readonly anchor: Element });

/**
 * Where a page needs an account (specs/assistant-service-connections/spec.md §13.5). `slot`: one of this installation's Manifest
 * `connections.slots`, granted `connections:use`; a `per_record` slot names its record (`isPluginConnectionRecordKey`), an
 * installation slot names none. `image`: the image generation target of a plugin that declares `image_generation` and holds its
 * write permission; the card says the key goes only to the origin the shell derives from `base_url`. The service, installation,
 * project and every word on the card come from the Manifest, the page's authority and the shell, never from the page.
 */
export type UiConnectionNeedTarget =
  | { readonly kind: "slot"; readonly slot_id: string; readonly record_key?: string }
  | ({ readonly kind: "image" } & PluginImageTarget);

/**
 * What the page learns: the account's display name once an account is connected to the target and usable (never which connection,
 * its state or a credential; an image target can then be read with `inspect`), or that the person cancelled.
 */
export type UiConnectionNeedOutcome =
  | { readonly status: "connected"; readonly account: { readonly label: string } }
  | { readonly status: "cancelled" };

/** The card quotes a slot's Manifest `reason` as the plugin's words, cut to this many characters. */
export const UI_CONNECTION_NEED_REASON_MAX = 80;
