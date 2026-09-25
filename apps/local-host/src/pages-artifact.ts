import {
  PAGES_ARTIFACT_SCHEMA_VERSION,
  PAGES_ARTIFACT_TYPE_ID,
} from "@molis-ai/molis-work-contracts/modules/pages";
import { PagesError, pagesManifest, parsePagesBody, type PagesPublishArtifactPort, type PagesReadArtifactPort } from "@molis-ai/molis-work-plugin-pages";
import type { GoalProjectApplication } from "./goal-project-application.js";

/** Recovery reads the immutable original owner record; it never impersonates its author. */
export function readPagesArtifactVersion(coordinator: GoalProjectApplication, boardId: string, expectedProjectId: string, actorId: string): PagesReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(boardId, { artifact_id: "pages-" + input.page_id, version: input.version });
    if (!artifact) return null;
    if (artifact.owner_actor_id !== actorId) throw new PagesError("pages.publication_owner", "此 Artifact 属于其他发起者，不能替换或代为恢复");
    if (artifact.artifact_type_id !== PAGES_ARTIFACT_TYPE_ID || artifact.schema_version !== PAGES_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== pagesManifest.plugin_id || artifact.producer_binding_signature !== pagesManifest.publisher.signature
      || artifact.content_kind !== "inline") throw new PagesError("pages.publication_conflict", "Artifact 的来源或类型不匹配，原记录已保留");
    const payload = artifact.payload as Record<string, unknown> | null;
    if (!payload || payload.page_id !== input.page_id || typeof payload.title !== "string" || typeof payload.goal_id !== "string" || !payload.body) {
      throw new PagesError("pages.publication_conflict", "Artifact 的文稿内容不完整，原记录已保留");
    }
    return { title: payload.title, body: parsePagesBody(payload.body), goal_id: payload.goal_id };
  };
}

export function registerPagesArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
  expectedProjectId = boardId,
  actorId = "web-user",
): PagesPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) {
      throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    }
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: actorId,
      artifact_id: "pages-" + input.page_id,
      version: input.version,
      artifact_type_id: PAGES_ARTIFACT_TYPE_ID,
      schema_version: PAGES_ARTIFACT_SCHEMA_VERSION,
      producer: {
        plugin_id: pagesManifest.plugin_id,
        plugin_version: pagesManifest.version,
        binding_signature: pagesManifest.publisher.signature,
      },
      content: {
        kind: "inline",
        payload: JSON.parse(JSON.stringify({
          title: input.title,
          page_id: input.page_id,
          goal_id: input.goal_id,
          body: input.body,
        })),
      },
      metadata: { page_id: input.page_id, goal_id: input.goal_id, title: input.title },
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}
