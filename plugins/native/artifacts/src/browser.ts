import type {
  ArtifactConsumptionCompatibility, ArtifactConsumerType, ArtifactReference,
  ArtifactsQueryApi, ArtifactJsonValue, ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ARTIFACT_SUBJECT_KIND, artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { ActionError, subjectContext, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";

export interface ArtifactBrowserView {
  readonly versions: readonly ArtifactVersionRecord[];
  readonly selected: ArtifactVersionRecord | null;
  readonly requested: ArtifactReference | null;
  readonly compatibility: ArtifactConsumptionCompatibility | null;
}

export class ArtifactBrowserError extends Error {
  constructor(readonly status: 400 | 404, message: string) {
    super(message);
    this.name = "ArtifactBrowserError";
  }
}

export function readArtifactBrowser(
  query: ArtifactsQueryApi,
  boardId: string,
  reference: ArtifactReference | null = null,
  supportedTypes: ArtifactConsumerType[] = [],
): ArtifactBrowserView {
  return { versions: query.listArtifacts(boardId), ...readArtifactSelection(query, boardId, reference, supportedTypes) };
}

/** Shared exact selection for pages and embeds; embeds never load the Project directory. */
export function readArtifactSelection(
  query: ArtifactsQueryApi, boardId: string, reference: ArtifactReference | null,
  supportedTypes: ArtifactConsumerType[] = [],
): Omit<ArtifactBrowserView, "versions"> {
  const selected = reference ? query.getArtifactVersion(boardId, reference) : null;
  return {
    selected,
    requested: reference,
    compatibility: selected ? query.consumptionCompatibility(boardId,
      { artifact_id: selected.artifact_id, version: selected.version }, supportedTypes) : null,
  };
}

/** Called only after the original Action gate; this checks the owner's exact record, not grants. */
export function requireArtifactAnalysisRecord(
  record: ArtifactVersionRecord | null,
  access: { board_id: string; actor_id: string; reference: ArtifactReference },
): ArtifactVersionRecord {
  if (!record || record.board_id !== access.board_id || record.artifact_id !== access.reference.artifact_id
    || record.version !== access.reference.version) throw new ActionError("actions.subject_unavailable", "当前项目中找不到这个成果版本");
  if (record.scope === "personal" && record.owner_actor_id !== access.actor_id) {
    throw new ActionError("artifacts.forbidden", "不能读取其他用户的个人成果");
  }
  if (record.lifecycle_state !== "active" || record.availability !== "available") {
    throw new ActionError("actions.subject_unavailable", "这个成果版本已归档或不可用");
  }
  if (record.content_kind !== "inline" || record.payload === null) {
    throw new ActionError("actions.subject_unavailable", "这个成果版本没有可供分析的正文，请选择文本成果");
  }
  return record;
}

/** Provenance comes from immutable owner fields. Opaque payload metadata cannot replace it. */
export function artifactAnalysisContext(record: ArtifactVersionRecord, goalIds: string[] = []): ActionSubjectContext {
  const relatedGoals = [...new Set(goalIds)].sort();
  return subjectContext({
    subject: { kind: ARTIFACT_SUBJECT_KIND, id: artifactSubjectId(record) },
    revision: JSON.stringify([record.version, record.content_digest, relatedGoals]), title: artifactDisplayTitle(record),
    content: JSON.stringify({ artifact_id: record.artifact_id, version: record.version,
      artifact_type_id: record.artifact_type_id, schema_version: record.schema_version,
      producer: { plugin_id: record.producer_plugin_id, plugin_version: record.producer_plugin_version,
        binding_signature: record.producer_binding_signature },
      created_at: record.created_at, payload: record.payload, metadata: record.metadata }),
    goal_ids: relatedGoals, session_id: null,
  });
}

export type ArtifactBrowserRoute =
  | { readonly kind: "index"; readonly reference: null }
  | { readonly kind: "detail" | "export"; readonly reference: ArtifactReference };

const DISPLAY_TITLE_KEYS = ["title", "name", "text"] as const;

/** Directory and reading-card title. Exact identity stays on artifact_id. */
export function artifactDisplayTitle(artifact: Pick<ArtifactVersionRecord, "artifact_id" | "payload"> & Partial<Pick<ArtifactVersionRecord, "metadata">>): string {
  const line = payloadDisplayLine(artifact.payload);
  return line || payloadDisplayLine({ title: artifact.metadata?.title ?? null }) || artifact.artifact_id;
}

function payloadDisplayLine(payload: ArtifactJsonValue | null): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  for (const key of DISPLAY_TITLE_KEYS) {
    const value = payload[key];
    if (typeof value !== "string") continue;
    const line = value.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
    if (line) return line;
  }
  return "";
}

/** Routes require an exact producer-supplied version, never an implicit latest. */
export function matchArtifactBrowserRoute(pathname: string): ArtifactBrowserRoute | null {
  if (pathname === "/artifacts") return { kind: "index", reference: null };
  const match = pathname.match(/^\/(api\/)?artifacts\/([^/]+)\/versions\/([^/]+)(\/export)?$/);
  if (!match || (Boolean(match[1]) !== Boolean(match[4]))) return null;
  if (!/^[1-9]\d*$/.test(match[3]!) || !Number.isSafeInteger(Number(match[3]))) {
    throw new ArtifactBrowserError(400, "Artifact version 必须是正整数");
  }
  let id: string;
  try { id = decodeURIComponent(match[2]!); }
  catch { throw new ArtifactBrowserError(400, "Artifact ID 编码无效"); }
  return { kind: match[1] ? "export" : "detail", reference: { artifact_id: id, version: Number(match[3]) } };
}

export function artifactVersionPath(reference: ArtifactReference): string {
  return `/artifacts/${encodeURIComponent(reference.artifact_id)}/versions/${reference.version}`;
}

/** Read-only local interchange; no publication, registration or state change. */
export function exportArtifactVersion(query: ArtifactsQueryApi, boardId: string, reference: ArtifactReference): string {
  const artifact = query.getArtifactVersion(boardId, reference);
  if (!artifact) throw new ArtifactBrowserError(404, "当前项目中找不到这个 Artifact 版本");
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
