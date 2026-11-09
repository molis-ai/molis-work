import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OwnedPresentationObject, PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription, SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Display data attached to the workbench HTTP response. The composition contract itself still carries references. */
export interface SurfaceHomeRowDisplay {
  owner: string;
  subject: ActionSubject;
  installation: SurfaceInstallationRef;
  declaration: OwnedPresentationObject;
  read: Pick<PresentationValueItem, "revision" | "state" | "values" | "read_at"> | { state: "unreadable" };
}
export interface SurfaceHomeDisplay extends SurfaceDescription {
  display: {
    owners: Record<string, PresentationFormValues["ownerDisplay"]>;
    rows: SurfaceHomeRowDisplay[];
  };
}
