import type { FormKind } from "./presentation.js";

// The places a contribution opens for other plugins' content, published through the `platform/ui` subpath like `ui-text.ts`. A
// contribution lists them in `UiContributionDeclaration.slots`; the composition service reads what a slot takes (specs/surface-composition).

/**
 * A place a contribution opens for other plugins' content. Two kinds of content may come in: an embedded plugin's surface, drawn by that
 * plugin (`accepts`, its formats), and other plugins' objects, drawn by the platform in their presentation forms (`accepts_forms`). The
 * second is what specs/shared-sources-and-surfaces §5 called a mount: a mount is a slot with `accepts_forms`, never a second declaration
 * (`mounts` merged into `slots`, 统筹 2026-11-08). A slot without `accepts_forms` gets nothing from the platform (IUI-13).
 */
export interface UiSlotDescriptor {
  readonly slot_id: string;
  /** Surface formats (`declarative-html`) an embedded plugin's surface needs to be drawn here. */
  readonly accepts: readonly string[];
  /** The presentation forms the platform may draw other plugins' objects in here, simplest first as `PRESENTATION_FORM_KINDS`. */
  readonly accepts_forms?: readonly FormKind[];
  /** At most this many objects the platform puts here; left out, only the platform's own limits apply. With `accepts_forms` only. */
  readonly max?: number;
  /** Object kinds the platform never puts here, even when they are asked for. With `accepts_forms` only. */
  readonly refuse_kinds?: readonly string[];
}
