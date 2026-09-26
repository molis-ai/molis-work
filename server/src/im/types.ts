import type { IncomingMessage, ServerResponse } from "node:http";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ImMember } from "@molis-ai/molis-work-contracts/services/im";

export type ImDatabase = Pick<SqliteDatabase, "prepare" | "exec" | "transaction">;
export interface ImSession { id: string; member_id: string | null; expires_at: number }
export interface ImIdentity {
  member(session: ImSession): ImMember | null;
  name(session: ImSession, value: unknown): { member: ImMember };
  requireMember(session: ImSession): ImMember;
}
export interface ImEvents {
  /** Append synchronously to the same database and current transaction. */
  append(input: { scopeKind: "room" | "project"; scopeId: string; kind: string; entityId: string; threadId?: string }): number;
  /** Called only after the business transaction commits. */
  notify(): void;
}
export interface ImDomainOptions { db: ImDatabase; identity: ImIdentity; events: ImEvents }
export interface ImRequest {
  request: IncomingMessage;
  response: ServerResponse;
  /** A canonical, transport-validated URL, including the public origin. */
  url: URL;
  session: ImSession | null;
}
