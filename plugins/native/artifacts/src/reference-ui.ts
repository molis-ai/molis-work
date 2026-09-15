import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";

export const ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID = "io.molis.work.native.artifacts.reference.v1";

export interface ArtifactReferenceUiPrimitives {
  escape(value: string): string;
  icon(name: "external" | "copy"): string;
  text(value: string): string;
}

export interface ArtifactReferenceUiModel {
  readonly value: string;
  readonly label: string;
  readonly evidenceId?: string;
  readonly primitives: ArtifactReferenceUiPrimitives;
}

/** Presentation classification only; the host reader remains the security boundary. */
export function isProjectReference(value: string): boolean {
  const reference = value.trim();
  if (!reference || /^https?:\/\//i.test(reference)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(reference) && !reference.startsWith("project://")) return false;
  const projectPath = reference.startsWith("project://")
    ? reference.slice("project://".length)
    : reference;
  if (!projectPath || /^[\\/]/.test(projectPath)) return false;
  if (projectPath.split(/[\\/]+/).some((segment) => segment === "..")) return false;
  return /[./\\]/.test(reference);
}

export const artifactReferenceUiContribution: UiContribution<ArtifactReferenceUiModel> = {
  descriptor: {
    contribution_id: ARTIFACT_REFERENCE_UI_CONTRIBUTION_ID,
    plugin_id: "io.molis.work.native.artifacts",
    kind: "embedded",
    label: "Artifact reference",
    surfaces: [{ surface_id: "reference", target_slot_id: "workbench.main", format: "declarative-html" }],
    slots: [],
  },
  render({ model: { value, label, evidenceId, primitives: p } }): string {
    if (/^https?:\/\//i.test(value)) {
      return `<a class="inline-ref" href="${p.escape(value)}" target="_blank" rel="noreferrer">${p.icon("external")}<span>${p.escape(label)}</span></a>`;
    }
    if (isProjectReference(value)) {
      const evidenceQuery = evidenceId ? `?evidence_id=${encodeURIComponent(evidenceId)}` : "";
      return `<a class="inline-ref" href="/api/project-references/${encodeURIComponent(value)}${evidenceQuery}" target="_blank" rel="noreferrer" data-project-reference>${p.icon("external")}<span>${p.escape(label)}</span></a>`;
    }
    return `<button class="inline-ref" type="button" data-copy-value="${p.escape(value)}" title="${p.escape(p.text("复制引用"))}">${p.icon("copy")}<span>${p.escape(label)}</span></button>`;
  },
};
