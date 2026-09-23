import type { Hono } from "hono";
import { z } from "zod";
import { createConversationMessageSchema } from "../../shared/contracts/conversation.js";
import type { ConversationContext } from "../../domain/conversation/context.js";
import { buildLensCompatibilityKey, marketLensCompatibilityKey } from "../../domain/research/lens.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerConversationRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/conversation/messages", (context) =>
    context.json({ messages: dependencies.conversations.list(dependencies.workspaceId) }),
  );

  app.post("/api/v1/conversation/messages", async (context) => {
    const body = await context.req.json().catch(() => undefined);
    const parsed = createConversationMessageSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        {
          code: "CONVERSATION_MESSAGE_INVALID",
          message: "消息或当前讨论上下文不完整。",
          recovery: "保留当前页面，重新输入消息后再发送。",
        },
        400,
      );
    }
    const object = resolveContext(parsed.data.context, dependencies);
    if (object === undefined) return context.json({ code: "CONVERSATION_CONTEXT_NOT_FOUND", message: "当前讨论对象已不可读取，请重新选择。" }, 404);
    const history = dependencies.conversations.list(dependencies.workspaceId)
      .filter(item => contextKey(item.context) === contextKey(parsed.data.context) && item.responseState === "complete")
      .slice(-20).map(item => ({ role: item.author, text: item.body }));
    const realRuntime = await dependencies.runtimeSettings.isRealEnabled();
    const message = dependencies.conversations.create({
      id: dependencies.idFactory.next("message"),
      workspaceId: dependencies.workspaceId,
      actorId: dependencies.actorId,
      author: "user",
      body: parsed.data.body,
      context: parsed.data.context,
      responseState: realRuntime ? "complete" : "runtime_unavailable",
      createdAt: dependencies.clock.now(),
    });
    if (realRuntime) {
      try {
        const schema = z.object({ reply: z.string().trim().min(1).max(8_000) }).strict();
        const result = await dependencies.runtimeSettings.generateStructured({
          operationId: dependencies.idFactory.next("conversation_generation"),
          purpose: "围绕当前 Direction、Idea 或报告与创始人继续讨论",
          systemPrompt:
            "你是炼金术士的 Founder Copilot。围绕给定对象正文与此前讨论直接回应用户，区分证据、推断与未知。Founder Taste 是有适用范围与例外的个人偏好，不是市场证据。不要静默修改业务对象或长期 Memory。",
          userPrompt: JSON.stringify({ context: parsed.data.context, object, history, message: parsed.data.body,
            founderTaste: dependencies.memory.listTasteRules(dependencies.workspaceId).filter(rule => rule.status === "active")
              .map(rule => ({ title: rule.title, statement: rule.statement, appliesTo: rule.appliesTo, exceptions: rule.exceptions })) }),
          jsonSchema: z.toJSONSchema(schema) as Record<string, unknown>,
          parse: (value) => schema.parse(value),
          signal: context.req.raw.signal,
        });
        const assistantMessage = dependencies.conversations.create({
          id: dependencies.idFactory.next("message"),
          workspaceId: dependencies.workspaceId,
          actorId: dependencies.actorId,
          author: "assistant",
          body: result.value.reply,
          context: parsed.data.context,
          responseState: "complete",
          parentMessageId: message.id,
          runtimeLabel: result.runtimeLabel,
          createdAt: dependencies.clock.now(),
        });
        return context.json({ message, assistantMessage }, 201);
      } catch {
        const assistantMessage = dependencies.conversations.create({
          id: dependencies.idFactory.next("message"),
          workspaceId: dependencies.workspaceId,
          actorId: dependencies.actorId,
          author: "assistant",
          body: "真实 AI 运行时暂时失败；你的消息和上下文已经保存，可以重试。",
          context: parsed.data.context,
          responseState: "failed",
          parentMessageId: message.id,
          createdAt: dependencies.clock.now(),
        });
        return context.json({ message, assistantMessage }, 201);
      }
    }
    return context.json(
      {
        message,
        assistant: {
          state: "runtime_unavailable",
          message: "真实 AI 运行时尚未接入；你的消息和上下文已经保存。",
        },
      },
      201,
    );
  });
}

function contextKey(context: ConversationContext): string {
  switch (context.kind) {
    case "direction": return `direction:${context.directionId}`;
    case "idea": return `idea:${context.ideaId}:${context.version}`;
    case "pulse": return `pulse:${context.pulseReportId}`;
    case "surface": return `surface:${context.surface}`;
  }
}

function resolveContext(context: ConversationContext, dependencies: ApiDependencies) {
  if (context.kind === "direction") {
    const direction = dependencies.directions.get(context.directionId);
    return direction ? { direction, exploration: dependencies.explorations.getLatestForDirection(direction.id) } : undefined;
  }
  if (context.kind === "idea") {
    if (context.version === "draft") return dependencies.ideas.getCard(context.ideaId);
    const idea = dependencies.ideas.getVersion(context.ideaId, context.version);
    if (!idea) return undefined;
    const scope = dependencies.research.getMvpScopeForIdeaVersion(context.ideaId, context.version);
    const reports = [dependencies.research.getLatestReport(marketLensCompatibilityKey(context.ideaId, context.version)),
      scope ? dependencies.research.getLatestReport(buildLensCompatibilityKey(context.ideaId, context.version, scope.version)) : undefined]
      .filter(report => report !== undefined).map(report => ({ report, evidence: dependencies.research.listEvidence(report.id) }));
    return { idea, reports, decision: dependencies.decisions.getForVersion(context.ideaId, context.version) };
  }
  if (context.kind === "pulse") {
    const report = dependencies.pulse.getReport(context.pulseReportId);
    return report ? { report, opportunities: dependencies.pulse.listOpportunities(report.id) } : undefined;
  }
  if (context.surface === "pulse") return { reports: dependencies.pulse.listReports().slice(0, 3), opportunities: dependencies.pulse.listOpportunities().slice(0, 12) };
  return { directions: dependencies.directions.list().slice(0, 8), ideas: dependencies.ideas.listIdeas().slice(0, 8).map(idea => ({
    idea, content: dependencies.ideas.getVersion(idea.id, idea.currentVersion)?.content,
    ...(context.surface === "decisions" ? { decision: dependencies.decisions.getForVersion(idea.id, idea.currentVersion) } : {}),
  })) };
}
