import {
  PAGES_ARTIFACT_SCHEMA_VERSION,
  PAGES_ARTIFACT_TYPE_ID,
} from "@molis-ai/molis-work-contracts/modules/pages";
import { PagesError, pagesManifest, type PagesPublishArtifactPort } from "@molis-ai/molis-work-plugin-pages";
import type { GoalProjectApplication } from "./goal-project-application.js";

export function registerPagesArtifactVersion(
  coordinator: GoalProjectApplication,
  boardId: string,
  expectedProjectId = boardId,
): PagesPublishArtifactPort {
  return (input) => {
    if (input.project_id !== expectedProjectId) {
      throw new PagesError("pages.invalid", "文档项目与当前项目不一致");
    }
    const result = coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: "web-user",
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
