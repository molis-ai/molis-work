import type { Hono } from "hono";
import { createDirectionInputSchema, deriveDirectionTitle } from "../../shared/contracts/direction.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerDirectionRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/v1/directions", async (context) => {
    const body = await context.req.json().catch(() => undefined);
    const parsed = createDirectionInputSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        {
          code: "DIRECTION_INPUT_INVALID",
          message: "请更完整地描述你想探索的方向。",
          recovery: "补充目标用户、问题或使用场景中的任意一项后重试。",
        },
        400,
      );
    }
    const now = dependencies.clock.now();
    const direction = dependencies.directions.create({
      id: dependencies.idFactory.next("direction"),
      workspaceId: dependencies.workspaceId,
      title: parsed.data.title ?? deriveDirectionTitle(parsed.data.description),
      description: parsed.data.description,
      source: { kind: "user_input" },
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return context.json({ direction }, 201);
  });
}
