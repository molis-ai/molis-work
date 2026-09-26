import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions, type AlchemistOperationName } from "../../shared/contracts/actions.js";
import { AlchemistOperationError, type AlchemistActionInvoker } from "../services/action-operations.js";

/** Transport mappings only. All business checks and side effects are owned by the plugin operations. */
export function registerAlchemistActionRoutes(app: Hono, actions: AlchemistActionInvoker): void {
  const route = (method: string, path: string, name: AlchemistOperationName, input: (c: Context) => unknown | Promise<unknown>, status: 200 | 201 | 202 = 200) => {
    app.on(method, `/api/v1${path}`, async context => {
      try { return context.json(await actions.invoke(alchemistActions[name] as ActionDefinition, await input(context), context.req.raw.signal) as object, status); }
      catch (error) { return problem(context, error); }
    });
  };
  const none = () => ({}), identity = (c: Context) => ({ id: c.req.param("id") });
  const version = (c: Context) => ({ ...identity(c), version: Number(c.req.param("version")) });
  const lens = (c: Context) => ({ ...identity(c), lens: c.req.param("lens") });
  route("GET", "/reuse/methods/:id/context", "playbookContext", c => ({ subject_id: c.req.param("id") }));
  route("POST", "/reuse/candidates", "reuseCandidates", body);
  route("POST", "/reuse/assess", "reuseAssess", body);
  route("POST", "/reuse/publish", "reusePublish", body);
  route("GET", "/reuse/receipts/:id", "reuseReceipt", c => ({ planId: c.req.param("id") }));
  route("POST", "/reuse/receipts/:id/reconcile", "reuseReconcile", c => ({ planId: c.req.param("id") }));
  route("POST", "/reuse/feedback", "reuseFeedback", body);
  route("POST", "/memory/playbook/:id/revise", "playbookRevise", c => body(c, identity(c)));
  route("GET", "/bootstrap", "bootstrap", none);
  route("POST", "/directions", "directionCreate", body, 201);
  route("PATCH", "/directions/:id", "directionUpdate", c => body(c, identity(c)));
  route("PATCH", "/directions/:id/status", "directionStatus", c => body(c, identity(c)));
  route("POST", "/directions/:id/explorations", "explorationStart", c => ({ ...identity(c), reuseExisting: c.req.query("reuse") === "existing" }), 202);
  route("GET", "/explorations/:id", "explorationGet", identity);
  route("GET", "/idea-cards/:id", "cardGet", identity);
  route("POST", "/idea-cards/:id/keep", "cardKeep", identity, 201);
  route("POST", "/idea-cards/:id/discard", "cardDiscard", identity);
  route("POST", "/idea-cards/:id/restore", "cardRestore", identity);
  route("GET", "/ideas/:id/versions/:version", "ideaGet", version);
  route("GET", "/runtime/models", "models", none);
  route("GET", "/ideas/:id/versions/:version/research", "researchGet", version);
  route("POST", "/ideas/:id/lenses/:lens/plans", "researchPlan", c => body(c, lens(c)), 201);
  route("POST", "/ideas/:id/lenses/:lens/runs", "researchStart", c => body(c, lens(c)), 202);
  route("POST", "/runs/:id/cancel", "runCancel", identity);
  route("GET", "/settings/runtime", "settingsGet", none);
  route("PUT", "/settings/runtime", "settingsUpdate", body);
  route("POST", "/settings/runtime/verify", "settingsVerify", none);
  route("GET", "/conversation/messages", "conversationList", none);
  route("POST", "/conversation/messages", "conversationSend", body, 201);
  route("GET", "/decisions", "decisionsList", none);
  route("GET", "/ideas/:id/versions/:version/decision", "decisionGet", version);
  route("POST", "/ideas/:id/versions/:version/decision", "decisionCreate", c => body(c, version(c)), 201);
  route("GET", "/annotations", "annotationsList", c => ({ ...c.req.query(), revision: Number(c.req.query("revision")) }));
  route("POST", "/annotations", "annotationCreate", body, 201);
  route("POST", "/annotations/:id/resolve", "annotationResolve", identity);
  route("GET", "/memory", "memoryGet", none);
  route("POST", "/annotations/:id/playbook-proposals", "playbookPropose", c => body(c, identity(c)), 201);
  route("GET", "/action-proposals/pending", "proposalList", none);
  route("POST", "/action-proposals/:id/reject", "proposalReject", identity);
  route("POST", "/action-proposals/:id/apply", "proposalApply", identity);
  route("POST", "/memory/taste", "tasteCreate", body, 201);
  route("POST", "/memory/taste/:id/disable", "tasteDisable", identity);
  route("POST", "/memory/playbook/:id/disable", "playbookDisable", identity);
  route("GET", "/pulse/reports", "pulseReports", none);
  route("GET", "/pulse/sources", "pulseSources", none);
  route("PATCH", "/pulse/sources/:sourceId", "pulseSourceUpdate", c => body(c, { sourceId: c.req.param("sourceId") }));
  route("POST", "/pulse/runs", "pulseStart", c => body(c, {}, true), 202);
  route("POST", "/opportunities/:id/save", "opportunitySave", identity);
  app.post("/api/v1/opportunities/:id/convert", async context => {
    try {
      const { created, ...result } = await actions.invoke(alchemistActions.opportunityConvert, { id: context.req.param("id") }, context.req.raw.signal);
      return context.json(result, created ? 201 : 200);
    } catch (error) { return problem(context, error); }
  });

  app.get("/api/v1/runs/:id/events", async context => {
    const id = context.req.param("id");
    const after = Number(context.req.query("after") ?? 0);
    try {
      const first = await actions.invoke(alchemistActions.runEvents, { id, after }, context.req.raw.signal);
      return streamSSE(context, async stream => {
        let batch = first;
        while (!stream.aborted && !context.req.raw.signal.aborted) {
          for (const event of batch.events) await stream.writeSSE({ id: String(event.sequence), event: event.type, data: JSON.stringify(event) });
          if (["completed", "partial", "failed", "cancelled", "interrupted"].includes(batch.status)) return;
          await stream.sleep(150);
          if (stream.aborted || context.req.raw.signal.aborted) return;
          batch = await actions.invoke(alchemistActions.runEvents, { id, after: batch.cursor }, context.req.raw.signal);
        }
      });
    } catch (error) { return problem(context, error); }
  });
  app.post("/api/v1/workspace/export", async context => {
    try {
      const result = await actions.invoke(alchemistActions.workspaceExport, { format: context.req.query("format") as "json" | "zip" }, context.req.raw.signal);
      return context.body(Uint8Array.from(Buffer.from(result.content, "base64")), 200, {
        "content-type": result.mimeType, "content-disposition": `attachment; filename="${result.filename}"`, "cache-control": "no-store",
      });
    } catch (error) { return problem(context, error); }
  });
}

async function body(context: Context, params: Record<string, unknown> = {}, allowEmpty = false): Promise<unknown> {
  const raw = await context.req.text();
  let value: unknown;
  try { value = allowEmpty && raw.length === 0 ? {} : JSON.parse(raw); } catch { return undefined; }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  if (Object.keys(params).some(key => key in value)) throw new AlchemistOperationError("ALCHEMIST_INPUT_INVALID", "请求正文不能覆盖路径参数。", 400);
  return { ...value, ...params };
}

function problem(context: Context, error: unknown): Response {
  if (error instanceof AlchemistOperationError) return context.json({ ...error.details, code: error.code, message: error.message }, error.status);
  if (error instanceof ActionError) {
    const status = error.code === "actions.not_found" ? 404 : error.code === "actions.forbidden" ? 403 : error.code === "actions.input_invalid" ? 400 : 409;
    return context.json({ code: error.code, message: error.message }, status);
  }
  return context.json({ code: "ALCHEMIST_OPERATION_FAILED", message: "操作暂时失败，请刷新后重试。" }, 500);
}
