import type { Context, Hono } from "hono";
import { ideaCardParamsSchema } from "../../shared/contracts/idea.js";
import { IdeaActionError } from "../services/idea-card-actions.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerIdeaCardRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/idea-cards/:id", (context) =>
    withIdeaErrors(context, () => {
      const id = parseCardId(context);
      return context.json(dependencies.ideaCardActions.getCandidateBrief(id));
    }),
  );

  app.post("/api/v1/idea-cards/:id/keep", (context) =>
    withIdeaErrors(context, () => context.json(dependencies.ideaCardActions.keep(parseCardId(context)), 201)),
  );
  app.post("/api/v1/idea-cards/:id/discard", (context) =>
    withIdeaErrors(context, () =>
      context.json({ card: dependencies.ideaCardActions.discard(parseCardId(context)) }),
    ),
  );
  app.post("/api/v1/idea-cards/:id/restore", (context) =>
    withIdeaErrors(context, () =>
      context.json({ card: dependencies.ideaCardActions.restore(parseCardId(context)) }),
    ),
  );
}

function parseCardId(context: Context): string {
  const parsed = ideaCardParamsSchema.safeParse(context.req.param());
  if (!parsed.success) throw new IdeaActionError("IDEA_CARD_NOT_FOUND");
  return parsed.data.id;
}

function withIdeaErrors(context: Context, action: () => Response): Response {
  try {
    return action();
  } catch (error) {
    if (!(error instanceof IdeaActionError)) throw error;
    if (error.code === "IDEA_CARD_ALREADY_KEPT") {
      return context.json(
        {
          code: error.code,
          message: "这张候选牌已经形成 Idea，不会重复创建版本。",
          recovery: "打开已有 Idea 继续查看。",
          ideaId: error.ideaId,
        },
        409,
      );
    }
    if (error.code === "IDEA_CARD_NOT_CANDIDATE" || error.code === "IDEA_CARD_NOT_DISCARDED") {
      return context.json({ code: error.code, message: "这张牌的状态已经改变，请刷新后重试。" }, 409);
    }
    return context.json({ code: error.code, message: "没有找到这张候选牌。" }, 404);
  }
}
