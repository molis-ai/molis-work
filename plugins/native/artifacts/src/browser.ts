import type {
  ArtifactConsumptionCompatibility, ArtifactConsumerType, ArtifactReference,
  ArtifactsQueryApi, ArtifactJsonValue, ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

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
    compatibility: selected ? query.consumptionCompatibility(boardId, selected, supportedTypes) : null,
  };
}

export type ArtifactBrowserRoute =
  | { readonly kind: "index"; readonly reference: null }
  | { readonly kind: "detail" | "export"; readonly reference: ArtifactReference };

const DISPLAY_TITLE_KEYS = ["title", "name", "text"] as const;

/** Directory and reading-card title. Exact identity stays on artifact_id. */
export function artifactDisplayTitle(artifact: Pick<ArtifactVersionRecord, "artifact_id" | "payload">): string {
  const line = payloadDisplayLine(artifact.payload);
  return line || artifact.artifact_id;
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
