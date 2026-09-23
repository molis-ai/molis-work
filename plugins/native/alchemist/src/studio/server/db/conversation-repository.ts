import type { ConversationContext } from "../../domain/conversation/context.js";
import type { ConversationMessage } from "../../domain/conversation/message.js";
import type { SqliteDatabase } from "./open-database.js";

interface ConversationMessageRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  author: ConversationMessage["author"];
  body: string;
  context_json: string;
  response_state: ConversationMessage["responseState"];
  parent_message_id: string | null;
  runtime_label: string | null;
  created_at: string;
}

export class SqliteConversationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(message: ConversationMessage): ConversationMessage {
    this.database
      .prepare(
        `INSERT INTO conversation_messages (
          id, workspace_id, actor_id, author, body, context_json, response_state,
          parent_message_id, runtime_label, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.workspaceId,
        message.actorId,
        message.author,
        message.body,
        JSON.stringify(message.context),
        message.responseState,
        message.parentMessageId ?? null,
        message.runtimeLabel ?? null,
        message.createdAt,
      );
    return message;
  }

  list(workspaceId: string): ConversationMessage[] {
    return (
      this.database
        .prepare("SELECT * FROM conversation_messages WHERE workspace_id = ? ORDER BY created_at, rowid")
        .all(workspaceId) as ConversationMessageRow[]
    ).map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      actorId: row.actor_id,
      author: row.author,
      body: row.body,
      context: JSON.parse(row.context_json) as ConversationContext,
      responseState: row.response_state,
      ...(row.parent_message_id ? { parentMessageId: row.parent_message_id } : {}),
      ...(row.runtime_label ? { runtimeLabel: row.runtime_label } : {}),
      createdAt: row.created_at,
    }));
  }
}
