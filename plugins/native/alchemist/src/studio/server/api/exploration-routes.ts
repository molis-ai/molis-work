import type { Hono } from "hono";
import { directionIdParamsSchema } from "../../shared/contracts/direction.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerExplorationRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/v1/directions/:id/explorations", (context) => {
    const parsed = directionIdParamsSchema.safeParse(context.req.param());
    if (!parsed.success || !dependencies.directions.get(parsed.data.id)) {
      return context.json({ code: "DIRECTION_NOT_FOUND", message: "没有找到这个方向。" }, 404);
    }
    const receipt = dependencies.createExploration({
      directionId: parsed.data.id,
      reuseExisting: context.req.query("reuse") === "existing",
    });
    return context.json(receipt, 202);
  });

  app.get("/api/v1/explorations/:id", (context) => {
    const parsed = directionIdParamsSchema.safeParse(context.req.param());
    if (!parsed.success) {
      return context.json({ code: "EXPLORATION_NOT_FOUND", message: "没有找到这次炼化。" }, 404);
    }
    const exploration = dependencies.explorations.get(parsed.data.id);
    if (!exploration) {
      return context.json({ code: "EXPLORATION_NOT_FOUND", message: "没有找到这次炼化。" }, 404);
    }
    const direction = dependencies.directions.get(exploration.directionId);
    if (!direction) {
      return context.json({ code: "DIRECTION_NOT_FOUND", message: "这次炼化的来源方向已不可用。" }, 409);
    }
    return context.json({ direction, exploration });
  });
}
