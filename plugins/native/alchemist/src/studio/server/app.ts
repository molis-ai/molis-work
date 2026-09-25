import { Hono } from "hono";
import type { ApiDependencies } from "./api/dependencies.js";
import { registerAlchemistActionRoutes } from "./api/action-routes.js";
import { createAlchemistOperationExecutor, type AlchemistActionInvoker } from "./services/action-operations.js";
import { localSessionGuard } from "./security/local-session.js";

export function createApp(dependencies?: ApiDependencies, actions?: AlchemistActionInvoker): Hono {
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

  if (dependencies || actions) {
    registerAlchemistActionRoutes(app, actions ?? createAlchemistOperationExecutor(dependencies!));
    app.all("/api/*", (context) =>
      context.json({ code: "API_ROUTE_NOT_FOUND", message: "没有这个本地 API。" }, 404),
    );
  }

  return app;
}
