export interface ArtifactProjectReferencePorts {
  /** Host supplies the bounded, project-contained text reader. */
  readonly readProjectReference: (projectRoot: string, reference: string) => {
    readonly content: Uint8Array;
    readonly fileName: string;
  };
}

export class ArtifactProjectReferenceError extends Error {
  constructor(readonly status: 409, message: string) {
    super(message);
    this.name = "ArtifactProjectReferenceError";
  }
}

/** Opens a `project://` reference in the project's current workspace; it does not register an Artifact version. */
export function openArtifactProjectReference(
  ports: ArtifactProjectReferencePorts,
  input: { readonly reference: string; readonly projectRoot?: string },
): { readonly content: Uint8Array; readonly fileName: string } {
  if (!input.projectRoot) throw new ArtifactProjectReferenceError(409, "项目没有可确认的工作区");
  const opened = ports.readProjectReference(input.projectRoot, input.reference);
  return { content: opened.content, fileName: opened.fileName };
}
