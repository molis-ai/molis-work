import { nextPinnedVersion } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PAGES_ARTIFACT_SCHEMA_VERSION, PAGES_ARTIFACT_TYPE_ID, type PagesRecord } from "./contract.js";
import { PAGES_SUBJECT_KIND } from "./actions.js";
import { parsePagesBody } from "./document.js";
import { fromPageRow, normalizeGoalId } from "./store.js";
import { pagesManifest } from "./manifest.js";
import { pagesErrors } from "./error.js";

export async function promotePagesDocument(database: PluginDatabase, artifacts: PluginArtifactClient, id: string, expectedVersion?: number, goalId?: string):
  Promise<{ document: PagesRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }> {
  if (!database.transactionProjectRow || !artifacts.join) throw pagesErrors.unavailable("当前环境不能发出成果");
  const join = artifacts.join;
  return database.transactionProjectRow(id, row => {
    const source = row.read();
    if (!source) throw pagesErrors.not_found("找不到这篇文档");
    const current = fromPageRow(source);
    if (expectedVersion !== undefined && current.version !== expectedVersion) throw pagesErrors.conflict("文档已改变，请重新读取后保存成果");
    const artifactId = "pages-" + id;
    return join(row, writer => {
      const head = ownLine(() => writer.head(artifactId));
      const written = Math.max(current.artifact_version, head?.version ?? 0);
      if (written > 0) checkPreviousPin(ownLine(() => artifacts.readOwn({ artifact_id: artifactId, version: written })), id);
      const version = nextPinnedVersion({ recorded: current.artifact_version, pending: null, head });
      const { title, body } = current;
      const changes = { updated_at: new Date().toISOString(), goal_id: normalizeGoalId(goalId ?? current.goal_id) };
      const { artifact: pinned } = writer.publish({ artifact_id: artifactId, version,
        artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify({ title, page_id: id, goal_id: changes.goal_id, body })) },
        metadata: { page_id: id, goal_id: changes.goal_id, title }, origin: { kind: "pinned", subject: { kind: PAGES_SUBJECT_KIND, id }, revision: String(current.version) },
        title, media_type: "application/json", supersedes_version: version > 1 ? version - 1 : null });
      if (!row.compareAndSet(current.version, changes)) throw pagesErrors.conflict("固定成果时文稿已变化，请重新读取");
      const artifact = { artifact_id: pinned.artifact_id, version: pinned.version };
      return { document: { ...current, ...changes, artifact_id: artifact.artifact_id, artifact_version: artifact.version, version: current.version + 1 },
        artifact, recovered: false };
    });
  });
}

function ownLine<T>(read: () => T): T {
  try { return read(); }
  catch (error) {
    if ((error as { code?: string }).code === "artifacts.plugin_denied") throw pagesErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
    throw error;
  }
}

function checkPreviousPin(artifact: ReturnType<PluginArtifactClient["readOwn"]>, id: string): void {
  if (!artifact) return;
  if (artifact.artifact_type_id !== PAGES_ARTIFACT_TYPE_ID || artifact.schema_version !== PAGES_ARTIFACT_SCHEMA_VERSION
    || artifact.producer_binding_signature !== pagesManifest.publisher.signature || artifact.content_kind !== "inline"
    || artifact.origin.kind !== "pinned" || artifact.origin.subject.kind !== PAGES_SUBJECT_KIND || artifact.origin.subject.id !== id)
    throw pagesErrors.publication_conflict("成果来源或类型不一致，原记录已保留");
  const snapshot = artifact.payload as Record<string, unknown> | null;
  if (!snapshot || snapshot.page_id !== id || typeof snapshot.title !== "string" || typeof snapshot.goal_id !== "string" || !snapshot.body)
    throw pagesErrors.publication_conflict("成果文稿内容不完整，原记录已保留");
  parsePagesBody(snapshot.body);
}
