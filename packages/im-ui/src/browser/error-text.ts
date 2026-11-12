import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ApiError } from "./types.js";

/** The discussion chooses visible feedback from the service's existing codes. Response diagnostics stay with the response. */
const WORDS: Readonly<Record<string, string>> = {
  "im.unauthenticated": "im-ui.status.session-expired",
  "im.identity.unauthenticated": "im-ui.status.session-expired",
  "im.forbidden": "im-ui.error.room-forbidden",
  "im.project_forbidden": "im-ui.error.project-connection-required",
  "im.identity.forbidden": "im-ui.error.project-forbidden",
  "im.project_invite": "im-ui.error.project-invitation-required",
  "im.owner_required": "im-ui.error.invitation-owner-required",
  "im.invite_not_found": "im-ui.error.invitation-expired",
  "im.invite.invalid_token": "im-ui.error.invitation-token-invalid",
  "im.invite.token_conflict": "im-ui.error.invitation-token-used",
  "im.client_id_conflict": "im-ui.error.submission-key-used",
  "im.invalid_input": "im-ui.error.invalid-input",
  "im.room_not_found": "im-ui.error.room-missing",
  "im.thread_not_found": "im-ui.error.thread-missing",
  "im.message_not_found": "im-ui.error.message-missing",
  "im.empty_thread": "im-ui.error.thread-needs-message",
  "im.invalid_source": "im-ui.error.thread-needs-group-source",
  "im.invalid_reply": "im-ui.error.reply-outside-thread",
  "im.search_too_long": "im-ui.error.search-too-long",
  "im.internal": "im-ui.error.request-unavailable",
  "im.stopping": "im-ui.error.host-closing",
  "im.server.catalog_unavailable": "im-ui.error.project-list-unavailable",
};

export function imFailureText(cause: unknown): string {
  const error = cause as ApiError | null | undefined, code = error?.code;
  const word = code && Object.hasOwn(WORDS, code) ? WORDS[code] : error?.word;
  return uiText.text(word ?? "im-ui.transport.try-again");
}
