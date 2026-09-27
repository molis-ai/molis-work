import type { ImReadState, ImSearchResult, ImMember, ImMessage, ImMessagePage, ImRoom, ImRoomState, ImThread, ImThreadState } from "@molis-ai/molis-work-contracts/services/im";
import type { ImDatabase } from "./types.js";
import { ImError } from "./errors.js";

type Row = Record<string, string | number | null>;
export class ImReads {
  constructor(readonly db: ImDatabase) {}

  readPositions(roomId: string, memberId: string): ImReadState {
    const rows = this.db.prepare('SELECT target,sequence FROM im_read_positions WHERE member_id=? AND room_id=?').all(memberId,roomId) as {target:string;sequence:number}[];
    const positions = Object.fromEntries(rows.map(row => [row.target,row.sequence]));
    const latest = this.db.prepare(`SELECT COALESCE(thread_id,'') AS target,MAX(sequence) AS sequence FROM im_messages WHERE room_id=? GROUP BY thread_id`).all(roomId) as {target:string;sequence:number}[];
    return { positions, unread: Object.fromEntries(latest.map(row => [row.target,row.sequence > (positions[row.target] ?? 0)])) };
  }

  searchMessages(roomId: string, query: string): ImSearchResult {
    if (!query.trim()) return { messages: [] };
    if (query.length > 200) throw new ImError('im.search_too_long','搜索词最多 200 字');
    const rows = this.db.prepare(`SELECT m.id FROM im_messages m LEFT JOIN im_threads t ON t.id=m.thread_id
      WHERE m.room_id=? AND (instr(lower(m.body),lower(?))>0 OR instr(lower(t.title),lower(?))>0)
      ORDER BY m.sequence DESC LIMIT 80`).all(roomId,query,query) as {id:string}[];
    return { messages: rows.map(row => this.message(roomId,row.id)) };
  }

  assertMember(roomId: string, memberId: string): void {
    const project = this.db.prepare("SELECT project_id FROM im_rooms WHERE id = ?").get(roomId) as { project_id: string | null } | undefined;
    const allowed = project?.project_id
      ? this.db.prepare("SELECT 1 FROM mw_access WHERE project_id = ? AND member_id = ?").get(project.project_id, memberId)
      : this.db.prepare("SELECT 1 FROM im_members WHERE room_id = ? AND member_id = ?").get(roomId, memberId);
    if (!allowed) {
      throw new ImError("im.forbidden", "你还不是这个群的成员", 403);
    }
  }

  room(roomId: string): ImRoom {
    const row = this.db.prepare(`SELECT r.*, CASE WHEN r.project_id IS NULL THEN (SELECT COUNT(*) FROM im_members WHERE room_id = r.id) ELSE (SELECT COUNT(*) FROM mw_access WHERE project_id = r.project_id) END AS member_count,
      (SELECT CASE WHEN m.body != '' THEN m.body ELSE shared.body END FROM im_messages m
        LEFT JOIN im_messages shared ON shared.id = m.shared_message_id
        WHERE m.room_id = r.id AND m.thread_id IS NULL ORDER BY m.sequence DESC LIMIT 1) AS latest_message
      FROM im_rooms r WHERE r.id = ?`).get(roomId) as unknown as Row | undefined;
    if (!row) throw new ImError("im.room_not_found", "找不到这个群", 404);
    return { id: String(row.id), project_id: row.project_id === null ? null : String(row.project_id), title: String(row.title), owner_id: String(row.owner_id),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      member_count: Number(row.member_count), latest_message: row.latest_message === null ? null : String(row.latest_message) };
  }

  rooms(memberId: string): ImRoom[] {
    return this.db.prepare<unknown[], { id: string }>(`SELECT r.id FROM im_rooms r WHERE
      (r.project_id IS NULL AND EXISTS(SELECT 1 FROM im_members m WHERE m.room_id=r.id AND m.member_id=?))
      OR (r.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM mw_access a WHERE a.project_id=r.project_id AND a.member_id=?))
      ORDER BY r.updated_at DESC, r.id`).all(memberId, memberId).map(row => this.room(String(row.id)));
  }

  thread(roomId: string, threadId: string): ImThread {
    const row = this.db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM im_messages WHERE thread_id = t.id) AS reply_count,
      (SELECT body FROM im_messages WHERE thread_id = t.id ORDER BY sequence DESC LIMIT 1) AS latest_reply
      FROM im_threads t WHERE t.id = ? AND t.room_id = ?`).get(threadId, roomId) as unknown as Row | undefined;
    if (!row) throw new ImError("im.thread_not_found", "找不到这个群里的 Thread", 404);
    return { id: String(row.id), room_id: String(row.room_id), title: String(row.title),
      source_message_id: row.source_message_id === null ? null : String(row.source_message_id), created_by: String(row.created_by),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      reply_count: Number(row.reply_count), latest_reply: row.latest_reply === null ? null : String(row.latest_reply) };
  }

  state(roomId: string): ImRoomState {
    const room = this.room(roomId);
    const members = room.project_id ? this.db.prepare(`SELECT m.id, m.display_name FROM mw_members m JOIN mw_access a ON a.member_id=m.id WHERE a.project_id=? ORDER BY a.rowid`).all(room.project_id) as unknown as ImMember[] : this.db.prepare(`SELECT p.id, p.display_name FROM mw_members p JOIN im_members m ON m.member_id = p.id
      WHERE m.room_id = ? ORDER BY m.joined_at, p.id`).all(roomId) as unknown as ImMember[];
    const threads = this.db.prepare<unknown[], { id: string }>("SELECT id FROM im_threads WHERE room_id = ? ORDER BY created_at, id")
      .all(roomId).map(row => this.thread(roomId, String(row.id)));
    return { room: this.room(roomId), members, threads };
  }

  threadState(roomId: string, threadId: string): ImThreadState {
    const thread = this.thread(roomId, threadId);
    const context = this.db.prepare<unknown[], { message_id: string }>("SELECT message_id FROM im_thread_context WHERE thread_id = ? ORDER BY position")
      .all(threadId).map(row => this.message(roomId, String(row.message_id)));
    return { thread, context };
  }

  message(roomId: string, messageId: string): ImMessage {
    const row = this.db.prepare(`SELECT m.*, p.display_name FROM im_messages m JOIN mw_members p ON p.id = m.author_id
      WHERE m.id = ? AND m.room_id = ?`).get(messageId, roomId) as unknown as Row | undefined;
    if (!row) throw new ImError("im.message_not_found", "找不到这个群里的消息", 404);
    let shared_reply: ImMessage["shared_reply"] = null;
    if (row.shared_message_id) {
      const shared = this.db.prepare(`SELECT m.id, m.body, m.author_id, m.thread_id, p.display_name, t.title
        FROM im_messages m JOIN mw_members p ON p.id = m.author_id JOIN im_threads t ON t.id = m.thread_id
        WHERE m.id = ? AND m.room_id = ?`).get(row.shared_message_id, roomId) as unknown as Row;
      shared_reply = { message_id: String(shared.id), thread_id: String(shared.thread_id), thread_title: String(shared.title),
        author: { id: String(shared.author_id), display_name: String(shared.display_name) }, body: String(shared.body) };
    }
    return { id: String(row.id), sequence: Number(row.sequence), room_id: roomId,
      thread_id: row.thread_id === null ? null : String(row.thread_id),
      author: { id: String(row.author_id), display_name: String(row.display_name) }, body: String(row.body),
      created_at: String(row.created_at), shared_reply,
      quoted_message: row.quote_id ? (() => {
        const quoted = this.db.prepare(`SELECT m.id,m.body,m.thread_id,p.id AS author_id,p.display_name FROM im_messages m JOIN mw_members p ON p.id=m.author_id WHERE m.id=? AND m.room_id=?`).get(row.quote_id,roomId) as Row;
        return { id: String(quoted.id), body: String(quoted.body), thread_id: quoted.thread_id === null ? null : String(quoted.thread_id), author: { id: String(quoted.author_id), display_name: String(quoted.display_name) } };
      })() : null };
  }

  messages(roomId: string, threadId: string | null, before: number | null, limit: number): ImMessagePage {
    if (threadId) this.thread(roomId, threadId);
    const rows = this.db.prepare<unknown[], { id: string }>(`SELECT id FROM im_messages WHERE room_id = ? AND thread_id IS ?
      AND (? IS NULL OR sequence < ?) ORDER BY sequence DESC LIMIT ?`).all(roomId, threadId, before, before, limit + 1);
    const has_more = rows.length > limit;
    const messages = rows.slice(0, limit).reverse().map(row => this.message(roomId, String(row.id)));
    return { messages, has_more, next_before: has_more ? messages[0]!.sequence : null };
  }

}
