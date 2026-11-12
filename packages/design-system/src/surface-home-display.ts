import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FormKind, OwnedPresentationObject, PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceCorrectionInput, SurfaceDescription, SurfaceInstallationRef, SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Display data attached to the workbench HTTP response. The composition contract itself still carries references. */
export interface SurfaceHomeRowDisplay {
  owner: string;
  subject: ActionSubject;
  installation: SurfaceInstallationRef;
  declaration: OwnedPresentationObject;
  /** A title projected from the original reader for an object without a presentation declaration. */
  fallback?: true;
  read: Pick<PresentationValueItem, "revision" | "state" | "values" | "read_at"> | { state: "unreadable" };
}
/**
 * Which shown positions take their words from one exact source, by an opaque grant the shell reads only through the locale entry
 * (surface-composition §14.6). It is not a page, an action or a form credential.
 */
export interface SurfaceHomeText { ref: string; owner: string; positions: readonly string[] }
export interface SurfaceHomeDisplay extends SurfaceDescription {
  surface_text?: readonly SurfaceHomeText[];
  position?: { kind: SurfaceSlot["kind"]; forms: readonly FormKind[]; pin: boolean; reasons?: readonly (OwnedTextRef | null | undefined)[] };
  object_restore_available?: true;
  display: {
    owners: Record<string, PresentationFormValues["ownerDisplay"]>;
    rows: SurfaceHomeRowDisplay[];
  };
}

export type SurfaceDisplayCorrection = Omit<SurfaceCorrectionInput, "slot" | "position">;
