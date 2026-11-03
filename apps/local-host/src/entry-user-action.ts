import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { ActionUserAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { requestHeader } from "./web-http.js";

/** Which of this machine's entries a person's call came through: the page, or a management entry (the command line, the management MCP). */
export type EntrySource = "web" | "management";

/** The request header only a page's "confirm the whole proposal" control sends. */
export const WHOLE_CONFIRMATION_HEADER = "x-molis-work-whole-confirmation";

/** What an entry knows about the one thing the person did. Never the action's own input: only the entry can say where an act came from. */
export interface EntryMessage {
  /** Names the message: a page's one-time key for the request, a management command's idempotency key. A retry of the same act carries the same one. */
  readonly id: string;
  /** Where the act was said, when the entry was told (a management command's evidence); the entry names itself otherwise. */
  readonly conversation_ref?: string;
  readonly message_ref?: string;
  /** The person was asked, naming it, to confirm the whole of one thing, and did. */
  readonly whole_confirmation_prompted?: boolean;
  readonly prompted_subject_id?: string;
}

/** The provenance an entry gives a call it makes as the person (PG-029): audit locators that grant nothing, the same for every action. */
export function entryUserAction(source: EntrySource, scope: string, message: EntryMessage): ActionUserAction {
  return { source, conversation_ref: message.conversation_ref ?? `${source}:${scope}`, message_ref: message.message_ref ?? `${source}:${message.id}`,
    ...(message.whole_confirmation_prompted ? { whole_confirmation_prompted: true } : {}),
    ...(message.prompted_subject_id ? { prompted_subject_id: message.prompted_subject_id } : {}) };
}

/**
 * What one page request says about the act it carries: the key the transport already asks of every change (a retry of the same act
 * reuses it), and the header only the page's whole-confirmation control sends. A request with no key (a read) gets a name of its own.
 */
export function webEntryMessage(request: IncomingMessage): EntryMessage {
  return { id: requestHeader(request, "x-molis-work-idempotency-key") || randomUUID(), whole_confirmation_prompted: requestHeader(request, WHOLE_CONFIRMATION_HEADER) === "1" };
}
