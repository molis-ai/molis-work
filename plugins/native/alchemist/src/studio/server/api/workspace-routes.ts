import type { Hono } from "hono";
import type { ApiDependencies } from "./dependencies.js";

export function registerWorkspaceRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/v1/workspace/export", (context) => {
    const format = context.req.query("format");
    if (format !== "json" && format !== "zip") {
      return context.json({ code: "EXPORT_FORMAT_INVALID", message: "请选择 JSON 或 ZIP。" }, 400);
    }
    const result = dependencies.workspaceExport.create(format);
    return context.body(Uint8Array.from(result.body), 200, {
      "content-type": result.contentType,
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
    });
  });
}
