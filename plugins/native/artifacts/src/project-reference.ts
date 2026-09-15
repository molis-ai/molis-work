import type { EvidenceQueryApi } from "@molis-ai/molis-work-contracts/modules/evidence-verification";

export interface ArtifactProjectReferencePorts {
  readonly evidence: Pick<EvidenceQueryApi, "getProjectReferenceSource">;
  /** Host supplies the existing bounded, project-contained text reader. */
  readonly readProjectReference: (projectRoot: string, reference: string) => {
    readonly content: Uint8Array;
    readonly fileName: string;
  };
}

export class ArtifactProjectReferenceError extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message);
    this.name = "ArtifactProjectReferenceError";
  }
}

/**
 * Opens an existing result locator; it does not register an Artifact version or
 * change Evidence. Recorded provenance wins over the current Web workspace.
 */
export function openArtifactProjectReference(
  ports: ArtifactProjectReferencePorts,
  input: {
    readonly boardId: string;
    readonly reference: string;
    readonly evidenceId?: string | null;
    readonly projectRoot?: string;
  },
): { readonly content: Uint8Array; readonly fileName: string } {
  let projectRoot = input.projectRoot;
  if (input.evidenceId) {
    const source = ports.evidence.getProjectReferenceSource(input.boardId, input.evidenceId);
    if (!source || source.locator !== input.reference) {
      throw new ArtifactProjectReferenceError(404, "找不到匹配的 Evidence 项目引用");
    }
    if (source.locator_status !== "verified") {
      throw new ArtifactProjectReferenceError(409, "只有已验证的项目内 Evidence 引用可以直接打开");
    }
    if (source.locator_workspace_root?.trim()) {
      projectRoot = source.locator_workspace_root;
    } else if (!projectRoot) {
      throw new ArtifactProjectReferenceError(409, "这条历史 Evidence 没有记录原始工作区；请提交新的验证记录并替代它");
    }
  }
  if (!projectRoot) {
    throw new ArtifactProjectReferenceError(409, "项目引用没有可确认的原始工作区");
  }
  const opened = ports.readProjectReference(projectRoot, input.reference);
  return { content: opened.content, fileName: opened.fileName };
}
