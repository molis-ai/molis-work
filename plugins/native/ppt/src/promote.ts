import { nextPinnedVersion } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PPT_ARTIFACT_SCHEMA_VERSION, PPT_ARTIFACT_TYPE_ID, PPT_SUBJECT_KIND, type PptRecord } from "./contract.js";
import { assertPptVersion, fromRow } from "./store.js";
import { pptManifest } from "./manifest.js";
import { pptErrors } from "./error.js";

export async function promotePpt(database: PluginDatabase, artifacts: PluginArtifactClient, id: string, expectedVersion?: number):
  Promise<{ presentation: PptRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }> {
  if (!database.transactionProjectRow || !artifacts.join) throw pptErrors.unavailable("当前环境不能发出成果");
  const join = artifacts.join;
  return database.transactionProjectRow(id, row => {
    const source = row.read();
    if (!source) throw pptErrors.not_found("找不到这份演示稿");
    const current = fromRow(source as Parameters<typeof fromRow>[0]);
    assertPptVersion(current, expectedVersion);
    const artifactId = "ppt-" + id;
    return join(row, writer => {
      const head = ownLine(() => writer.head(artifactId));
      const written = Math.max(current.artifact_version, head?.version ?? 0);
      if (written > 0) checkPreviousPin(ownLine(() => artifacts.readOwn({ artifact_id: artifactId, version: written })), id);
      const version = nextPinnedVersion({ recorded: current.artifact_version, pending: null, head });
      const { title, description, color_primary, color_background, color_text, slides } = current;
      const changes = { updated_at: new Date().toISOString() };
      const { artifact: pinned } = writer.publish({ artifact_id: artifactId, version,
        artifact_type_id: PPT_ARTIFACT_TYPE_ID, schema_version: PPT_ARTIFACT_SCHEMA_VERSION,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify({ title, description, color_primary, color_background, color_text, slides })) },
        metadata: { presentation_id: id, title }, origin: { kind: "pinned", subject: { kind: PPT_SUBJECT_KIND, id }, revision: String(current.version) },
        title, media_type: "application/json", supersedes_version: version > 1 ? version - 1 : null });
      if (!row.compareAndSet(current.version, changes)) throw pptErrors.conflict("固定成果时演示稿已变化，请重新读取");
      const artifact = { artifact_id: pinned.artifact_id, version: pinned.version };
      return { presentation: { ...current, ...changes, artifact_id: artifact.artifact_id, artifact_version: artifact.version, version: current.version + 1 },
        artifact, recovered: false };
    });
  });
}

function ownLine<T>(read: () => T): T {
  try { return read(); }
  catch (error) {
    if ((error as { code?: string }).code === "artifacts.plugin_denied") throw pptErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
    throw error;
  }
}

function checkPreviousPin(artifact: ReturnType<PluginArtifactClient["readOwn"]>, id: string): void {
  if (!artifact) return;
  if (artifact.artifact_type_id !== PPT_ARTIFACT_TYPE_ID || artifact.schema_version !== PPT_ARTIFACT_SCHEMA_VERSION
    || artifact.producer_binding_signature !== pptManifest.publisher.signature || artifact.content_kind !== "inline"
    || artifact.origin.kind !== "pinned" || artifact.origin.subject.kind !== PPT_SUBJECT_KIND || artifact.origin.subject.id !== id)
    throw pptErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
  const snapshot = artifact.payload as Record<string, unknown> | null;
  if (!snapshot || typeof snapshot.title !== "string" || typeof snapshot.description !== "string" || !Array.isArray(snapshot.slides)
    || typeof snapshot.color_primary !== "string" || typeof snapshot.color_background !== "string" || typeof snapshot.color_text !== "string")
    throw pptErrors.publication_conflict("成果演示稿内容不完整，原记录已保留");
}
