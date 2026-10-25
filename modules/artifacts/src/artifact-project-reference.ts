import { artifactsErrors } from "./artifact-errors.js";

export interface ArtifactProjectReferencePorts {
  /** Host supplies the bounded, project-contained text reader. */
  readonly readProjectReference: (projectRoot: string, reference: string) => {
    readonly content: Uint8Array;
    readonly fileName: string;
  };
}

/** Opens a `project://` reference in the project's current workspace; it does not register an Artifact version. */
export function openArtifactProjectReference(
  ports: ArtifactProjectReferencePorts,
  input: { readonly reference: string; readonly projectRoot?: string },
): { readonly content: Uint8Array; readonly fileName: string } {
  if (!input.projectRoot) throw artifactsErrors.workspace_unconfirmed("项目没有可确认的工作区");
  const opened = ports.readProjectReference(input.projectRoot, input.reference);
  return { content: opened.content, fileName: opened.fileName };
}
