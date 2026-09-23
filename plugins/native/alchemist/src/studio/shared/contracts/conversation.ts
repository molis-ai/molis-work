import { z } from "zod";

const label = z.string().trim().min(1).max(160);
export const conversationContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("surface"), label, surface: z.enum(["ideas", "pulse", "decisions"]) }).strict(),
  z.object({ kind: z.literal("direction"), label, directionId: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("idea"),
      label,
      ideaId: z.string().min(1),
      version: z.union([z.coerce.number().int().positive(), z.literal("draft")]),
      panel: z.enum(["brief", "market", "cost", "decision"]),
    })
    .strict(),
  z.object({ kind: z.literal("pulse"), label, pulseReportId: z.string().min(1) }).strict(),
]);

export const createConversationMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(8_000),
    context: conversationContextSchema,
  })
  .strict();

export type ConversationContextDto = z.infer<typeof conversationContextSchema>;

export interface ConversationMessageDto {
  id: string;
  workspaceId: string;
  actorId: string;
  author: "user" | "assistant";
  body: string;
  context: ConversationContextDto;
  responseState: "complete" | "runtime_unavailable" | "failed";
  parentMessageId?: string;
  runtimeLabel?: string;
  createdAt: string;
}
