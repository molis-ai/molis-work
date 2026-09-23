import { Hono } from "hono";
import { registerAnnotationRoutes } from "./api/annotation-routes.js";
import { registerBootstrapRoutes } from "./api/bootstrap-routes.js";
import { registerConversationRoutes } from "./api/conversation-routes.js";
import { registerDecisionRoutes } from "./api/decision-routes.js";
import type { ApiDependencies } from "./api/dependencies.js";
import { registerDirectionRoutes } from "./api/direction-routes.js";
import { registerExplorationRoutes } from "./api/exploration-routes.js";
import { registerIdeaCardRoutes } from "./api/idea-card-routes.js";
import { registerIdeaRoutes } from "./api/idea-routes.js";
import { registerJobRoutes } from "./api/job-routes.js";
import { registerMemoryRoutes } from "./api/memory-routes.js";
import { registerPulseRoutes } from "./api/pulse-routes.js";
import { registerResearchRoutes } from "./api/research-routes.js";
import { registerSettingsRoutes } from "./api/settings-routes.js";
import { registerWorkspaceRoutes } from "./api/workspace-routes.js";
import { localSessionGuard } from "./security/local-session.js";

export function createApp(dependencies?: ApiDependencies): Hono {
  const app = new Hono();

  if (dependencies?.localSecurity) {
    app.use("/api/*", localSessionGuard(dependencies.localSecurity));
  }

  app.get("/api/v1/health", (context) =>
    context.json({
      ok: true,
      service: "alchemist",
      apiVersion: 1,
    }),
  );

  if (dependencies) {
    registerAnnotationRoutes(app, dependencies);
    registerBootstrapRoutes(app, dependencies);
    registerConversationRoutes(app, dependencies);
    registerDirectionRoutes(app, dependencies);
    registerDecisionRoutes(app, dependencies);
    registerExplorationRoutes(app, dependencies);
    registerJobRoutes(app, dependencies);
    registerMemoryRoutes(app, dependencies);
    registerIdeaCardRoutes(app, dependencies);
    registerIdeaRoutes(app, dependencies);
    registerPulseRoutes(app, dependencies);
    registerResearchRoutes(app, dependencies);
    registerSettingsRoutes(app, dependencies);
    registerWorkspaceRoutes(app, dependencies);
    app.all("/api/*", (context) =>
      context.json({ code: "API_ROUTE_NOT_FOUND", message: "没有这个本地 API。" }, 404),
    );
  }

  return app;
}
