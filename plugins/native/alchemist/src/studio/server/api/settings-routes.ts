import type { Context, Hono } from "hono";
import { updateRuntimeSettingsSchema } from "../../shared/contracts/settings.js";
import type { ApiDependencies } from "./dependencies.js";
export function registerSettingsRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/settings/runtime", async (context) => context.json(await dependencies.runtimeSettings.getPublicSettings()));
  app.put("/api/v1/settings/runtime", async (context) => {
    const parsed = updateRuntimeSettingsSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!parsed.success) return context.json({ code: "RUNTIME_SETTINGS_INVALID", message: "模型选择或调用上限不完整。" }, 400);
    try { return context.json(await dependencies.runtimeSettings.update(parsed.data)); }
    catch (error) { return runtimeProblem(context, error); }
  });
  app.post("/api/v1/settings/runtime/verify", async (context) => {
    try { return context.json(await dependencies.runtimeSettings.verifyAndEnable()); }
    catch (error) { return runtimeProblem(context, error); }
  });
}
function runtimeProblem(context: Context, error: unknown) {
  const known = error instanceof Error && ["RUNTIME_MODEL_UNAVAILABLE", "RUNTIME_NOT_CONFIGURED"].includes(error.message);
  const code = known ? (error as Error).message : "RUNTIME_SETTINGS_FAILED";
  return context.json({ code, message: code === "RUNTIME_MODEL_UNAVAILABLE" ? "所选模型已不可用，请重新选择；系统不会自动换模型。" : "请在 Molis Work 全局设置中配置模型，再回来重试。" }, 409);
}
