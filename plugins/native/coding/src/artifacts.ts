/**
 * The three Artifact types Coding produces.
 *
 * Every one of them carries the run it came from, so a reader can always get
 * back to how it was made. They are typed payloads rather than opaque blobs:
 * a consumer reads fields, never parses a document.
 */

export const CODING_CHANGESET_TYPE = "coding.changeset.v1";
export const CODING_REPORT_TYPE = "coding.report.v1";
export const CODING_DIAGRAM_TYPE = "coding.diagram.v1";

export const CODING_ARTIFACT_TYPES = [
  CODING_CHANGESET_TYPE,
  CODING_REPORT_TYPE,
  CODING_DIAGRAM_TYPE,
] as const;

export type CodingArtifactType = (typeof CODING_ARTIFACT_TYPES)[number];

/**
 * Which facts a change set describes.
 *
 * These are different things and the UI must never merge them: one is what this
 * run proposed and is frozen, the other is what the working tree looks like now
 * and moves under your feet.
 */
export type CodingChangeScope = "run-frozen" | "workspace-current";

export type CodingFileChangeKind = "added" | "modified" | "deleted";

export interface CodingFileChange {
  /** Workspace-relative. Never absolute: the path outside the root is a Host fact. */
  path: string;
  kind: CodingFileChangeKind;
  added_lines: number;
  removed_lines: number;
  /** Unified diff for this file alone. */
  diff: string;
}

export interface CodingChangeSet {
  scope: CodingChangeScope;
  run_id: string;
  files: CodingFileChange[];
  /**
   * Whether these changes are on disk.
   *
   * False until a Host-approved write actually happened. A run that finished,
   * or an approval that was granted, does not make this true on its own —
   * approval is not the same event as the write.
   */
  applied: boolean;
}

export interface CodingReport {
  title: string;
  /** Markdown body. Rendered with the shared reading rules, not raw HTML. */
  body_markdown: string;
  run_id: string;
}

/**
 * A diagram the run drew, as structure rather than as markup.
 *
 * The run does **not** emit SVG. If it did, model output would become markup in
 * the app's own DOM, and the only thing standing between that and script
 * execution would be a sanitiser — which is exactly the kind of allowlist that
 * gets bypassed. Instead the run describes nodes and edges, the Host draws
 * them, and every label goes in as a text node.
 */
export interface CodingDiagramNode {
  node_id: string;
  label: string;
  /** Optional second line, e.g. the next step this node implies. */
  detail?: string;
  /** Layout intent, not pixels. The Host decides the geometry. */
  column: number;
  row: number;
  tone?: "default" | "accent" | "warning";
}

export interface CodingDiagramEdge {
  from: string;
  to: string;
  kind: "solid" | "dashed";
  label?: string;
}

export interface CodingDiagram {
  title: string;
  nodes: CodingDiagramNode[];
  edges: CodingDiagramEdge[];
  run_id: string;
}

export class CodingDiagramError extends Error {
  constructor(readonly code: "diagram.unknown_node" | "diagram.duplicate_node", message: string) {
    super(message);
    this.name = "CodingDiagramError";
  }
}

/**
 * Check a diagram refers only to nodes it declares.
 *
 * A run can name an edge endpoint that does not exist; drawing that silently
 * would show a graph that is not the one the run meant.
 */
export function inspectDiagram(diagram: CodingDiagram): CodingDiagramError[] {
  const errors: CodingDiagramError[] = [];
  const seen = new Set<string>();
  for (const node of diagram.nodes) {
    if (seen.has(node.node_id)) {
      errors.push(new CodingDiagramError(
        "diagram.duplicate_node",
        `节点 id 重复：${node.node_id}`,
      ));
    }
    seen.add(node.node_id);
  }
  for (const edge of diagram.edges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (!seen.has(endpoint)) {
        errors.push(new CodingDiagramError(
          "diagram.unknown_node",
          `连线指向不存在的节点：${endpoint}`,
        ));
      }
    }
  }
  return errors;
}
