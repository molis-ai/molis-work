import type { Hono } from "hono";
import type { BootstrapDto } from "../../shared/contracts/bootstrap.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerBootstrapRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/bootstrap", (context) => {
    const body: BootstrapDto = {
      workspace: {
        id: dependencies.workspaceId,
        name: dependencies.workspaceName ?? "炼金术士",
      },
      actor: {
        id: dependencies.actorId,
        name: dependencies.actorName ?? "本地创始人",
      },
      directions: dependencies.directions.list(),
      explorations: dependencies.explorations.list(),
      ideas: dependencies.ideas.listIdeas().map((idea) => ({
        id: idea.id,
        directionId: idea.directionId,
        title: dependencies.ideas.getVersion(idea.id, idea.currentVersion)?.content.title ?? "未命名 Idea",
        lifecycle: idea.lifecycle,
        currentVersion: idea.currentVersion,
        updatedAt: idea.updatedAt,
      })),
    };
    return context.json(body);
  });
}
