import type { Hono } from "hono";
import { ideaVersionParamsSchema } from "../../shared/contracts/idea.js";
import { IdeaActionError } from "../services/idea-card-actions.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerIdeaRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/ideas/:id/versions/:version", (context) => {
    const parsed = ideaVersionParamsSchema.safeParse(context.req.param());
    if (!parsed.success) {
      return context.json({ code: "IDEA_VERSION_NOT_FOUND", message: "没有找到这个 Idea 版本。" }, 404);
    }
    try {
      return context.json(
        dependencies.ideaCardActions.getIdeaVersionView(parsed.data.id, parsed.data.version),
      );
    } catch (error) {
      if (error instanceof IdeaActionError && error.code === "IDEA_VERSION_NOT_FOUND") {
        return context.json({ code: error.code, message: "没有找到这个 Idea 版本。" }, 404);
      }
      throw error;
    }
  });
}
