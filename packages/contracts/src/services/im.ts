/** Shared group chat DTOs. Runtime Sessions are a separate product. */
export interface ImMember {
  id: string;
  display_name: string;
}

export interface ImRoom {
  id: string;
  project_id: string | null;
  title: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  latest_message: string | null;
}

export interface ImMessage {
  id: string;
  sequence: number;
  room_id: string;
  thread_id: string | null;
  author: ImMember;
  body: string;
  created_at: string;
  quoted_message: null | { id: string; body: string; author: ImMember; thread_id: string | null };
  /** A group message sharing a real reply; original content is not copied. */
  shared_reply: null | {
    message_id: string;
    thread_id: string;
    thread_title: string;
    author: ImMember;
    body: string;
  };
}

export interface ImThread {
  id: string;
  room_id: string;
  title: string;
  source_message_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  reply_count: number;
  latest_reply: string | null;
}

export interface ImSessionState { member: ImMember | null }
export interface ImRoomList { rooms: ImRoom[] }
export interface ImRoomState { room: ImRoom; members: ImMember[]; threads: ImThread[] }
export interface ImThreadState { thread: ImThread; context: ImMessage[] }
export interface ImMessagePage { messages: ImMessage[]; has_more: boolean; next_before: number | null }
export interface ImSearchResult { messages: ImMessage[] }
export interface ImReadState { positions: Record<string, number>; unread: Record<string, boolean> }
/** Safe invitation state. The caller keeps the original token only in its current page's memory. */
export interface ImInviteState { room_id: string; token_hash: string | null }
export interface ImFailure { code: string; error: string }
export interface ImChange {
  cursor: number;
  room_id: string;
  kind: "member" | "message" | "thread" | "invite";
  entity_id: string;
  thread_id: string | null;
}

/** Each POST carries a fresh stable client_id, reused only for that exact operation. */
export interface ImMutation { client_id: string }
export interface ImMarkReadInput extends ImMutation { message_id: string }
export interface ImSessionInput extends ImMutation { display_name: string }
export interface ImCreateRoomInput extends ImMutation { title: string }
export interface ImJoinInput extends ImMutation { token: string }
/** One explicit generation/rotation intent. Reuse both fields after an uncertain response. */
export interface ImRotateInviteInput extends ImMutation { token: string }
export interface ImCreateThreadInput extends ImMutation { title: string; source_message_id?: string; body?: string }
export interface ImSendInput extends ImMutation { body: string; quote_id?: string }
export interface ImShareInput extends ImMutation { message_id: string; body?: string }

/**
 * All paths start with /im/api. GET /session first establishes an anonymous
 * HttpOnly cookie; POST /session names it. GET restores the resulting member.
 * GET /rooms -> ImRoomList; POST /rooms -> { room: ImRoom }.
 * POST /projects/:project/room -> { room: ImRoom }, creating the project's
 * unique main room if needed. Current project access is required on every read
 * and write; rooms created without a project keep their own membership.
 * POST /join -> { room: ImRoom }; GET /rooms/:room -> ImRoomState.
 * GET /rooms/:room/invite -> ImInviteState (owner only, no mutation).
 * POST .../invite/rotate accepts ImRotateInviteInput -> current ImInviteState.
 * The page generates a cryptographically random 32-byte token (64 lower-case hex
 * characters), keeps it only in memory and builds its link locally. The server
 * and receipts retain only its SHA-256. A replay rechecks current ownership and
 * returns the current hash; it never reactivates a token superseded later.
 * GET /rooms/:room/messages?before=sequence&limit=50 -> ImMessagePage.
 * POST /rooms/:room/messages -> { message: ImMessage }.
 * POST /rooms/:room/threads -> ImThreadState. Optional body creates the first
 * reply in the same transaction; it is required when source_message_id is absent.
 * A source supplies itself and at most three preceding group messages as context.
 * Message POSTs accept quote_id only for an existing message in the same room.
 * GET /rooms/:room/search?q=text -> { messages: ImMessage[] }, matching message
 * bodies or topic titles within this room (up to 80 newest results).
 * GET /rooms/:room/read -> { positions, unread }, keyed by thread id or an empty
 * string for the main room. POST with message_id advances only that message's
 * target cursor monotonically and returns the same shape.
 * GET /rooms/:room/threads/:thread -> ImThreadState.
 * GET/POST .../threads/:thread/messages have the same shapes as group messages.
 * POST .../threads/:thread/share -> { message: ImMessage } (new group message).
 * GET /rooms/:room/events is SSE: ready/reset { cursor }, change ImChange.
 * Reconnect using Last-Event-ID or ?since=cursor. Refetch the room and current
 * message views on ready/reset/change; events never substitute message history.
 * Errors return ImFailure. POST success status is 200, including replays.
 * Other mutation receipts replay their original result; invitation receipts
 * cannot report an old token as current, so that route rereads the safe state.
 */
export const servicesImContract = {
  contractId: "io.molis.work.service.im.v2",
  kind: "horizontal",
  schemaVersion: 2,
  maturity: "partial",
  ssot: "specs/archive/molis-work-im/spec.md",
} as const;
