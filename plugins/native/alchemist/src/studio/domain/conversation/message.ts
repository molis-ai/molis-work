import type { ConversationContext } from "./context.js";

export interface ConversationMessage {
  id: string;
  workspaceId: string;
  actorId: string;
  author: "user" | "assistant";
  body: string;
  context: ConversationContext;
  responseState: "complete" | "runtime_unavailable" | "failed";
  parentMessageId?: string;
  runtimeLabel?: string;
  createdAt: string;
}
