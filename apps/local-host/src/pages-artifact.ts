import {
  PAGES_ARTIFACT_SCHEMA_VERSION,
  PAGES_ARTIFACT_TYPE_ID,
} from "@molis-ai/molis-work-contracts/modules/pages";
import { PagesError, pagesManifest, parsePagesBody, PAGES_SUBJECT_KIND, type PagesLineHeadPort, type PagesPublishArtifactPort, type PagesReadArtifactPort } from "@molis-ai/molis-work-plugin-pages";
import type { GoalProjectApplication } from "./goal-project-application.js";
import { artifactLineHead } from "./artifact-line-head.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Recovery reads the immutable version already written. A pinned version belongs to the person whoever pinned it, so who
 * produced it is no reason to refuse reading it (its producer stays in `created_by`).
 */
export function readPagesArtifactVersion(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): PagesReadArtifactPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    const artifact = coordinator.artifacts.query.getArtifactVersion(projectId, { artifact_id: "pages-" + input.page_id, version: input.version });
    if (!artifact) return null;
    if (artifact.artifact_type_id !== PAGES_ARTIFACT_TYPE_ID || artifact.schema_version !== PAGES_ARTIFACT_SCHEMA_VERSION
      || artifact.producer_plugin_id !== pagesManifest.plugin_id || artifact.producer_binding_signature !== pagesManifest.publisher.signature
      || artifact.content_kind !== "inline") throw new PagesError("pages.publication_conflict", "成果的来源或类型不匹配，原记录已保留");
    const payload = artifact.payload as Record<string, unknown> | null;
    if (!payload || payload.page_id !== input.page_id || typeof payload.title !== "string" || typeof payload.goal_id !== "string" || !payload.body) {
      throw new PagesError("pages.publication_conflict", "成果的文稿内容不完整，原记录已保留");
    }
    return { title: payload.title, body: parsePagesBody(payload.body), goal_id: payload.goal_id };
  };
}

/** What the project's 成果库 holds of this document's line, for numbering its next pin. */
export function pagesArtifactLineHead(coordinator: GoalProjectApplication, projectId: string, expectedProjectId: string): PagesLineHeadPort {
  return input => {
    if (input.project_id !== expectedProjectId) throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    return artifactLineHead(coordinator, projectId, "pages-" + input.page_id);
  };
}

export function registerPagesArtifactVersion(
  coordinator: GoalProjectApplication,
  projectId: string,
  expectedProjectId = projectId,
  actorId = LOCAL_PERSON_ACTOR_ID,
): PagesPublishArtifactPort {
  // `actorId` produced the version (provenance, `created_by`); a pinned document belongs to the person.
  return (input) => {
    if (input.project_id !== expectedProjectId) {
      throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    }
    const result = coordinator.artifacts.commands.registerVersion({
      project_id: projectId,
      actor_id: actorId,
      owner_actor_id: LOCAL_PERSON_ACTOR_ID,
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
      // A pinned revision of the document (artifact-positioning A1).
      origin: { kind: "pinned", subject: { kind: PAGES_SUBJECT_KIND, id: input.page_id }, revision: String(input.source_version) },
      title: input.title, media_type: "application/json",
      scope: "personal",
      supersedes_version: input.version > 1 ? input.version - 1 : null,
    });
    return { artifact_id: result.artifact.artifact_id, version: result.artifact.version };
  };
}
