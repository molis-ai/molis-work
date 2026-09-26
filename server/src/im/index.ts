import type { ImDomainOptions, ImRequest, ImSession } from "./types.js";
import { ImError, integerQuery, textInput } from "./errors.js";
import { readImBody, imFailure, imJson } from "./http.js";
import { ImReads } from "./reads.js";
import { createImSchema } from "./schema.js";
import { ImWrites } from "./writes.js";

export type { ImDomainOptions, ImSession, ImIdentity, ImEvents, ImRequest, ImDatabase } from "./types.js";
export { ImError } from "./errors.js";

/** Identity/cookie/Origin/SSE lifecycle belongs to the shared server transport. */
export function createImDomain({ db, identity, events }: ImDomainOptions) {
  createImSchema(db);
  const reads = new ImReads(db), writes = new ImWrites(db, reads, events);
  const requireSession = (session: ImSession | null): ImSession => {
    if (!session || session.expires_at <= Date.now()) throw new ImError("im.unauthenticated", "请先设置你的名字", 401);
    return session;
  };

  async function handleImRequest({ request, response, url, session }: ImRequest): Promise<boolean> {
    if (url.pathname !== "/im/api" && !url.pathname.startsWith("/im/api/")) return false;
    if (request.method === "GET" && /^\/im\/api\/rooms\/[^/]+\/events$/.test(url.pathname)) return false;
    try {
      if (request.method !== "GET" && request.method !== "POST") throw new ImError("im.method_not_allowed", "不支持这个请求方法", 405);
      let parts: string[];
      try { parts = url.pathname.slice("/im/api/".length).split("/").map(decodeURIComponent); }
      catch { throw new ImError("im.invalid_path", "请求路径无效"); }
      if (parts.some(part => !/^[A-Za-z0-9_-]{1,128}$/.test(part))) throw new ImError("im.invalid_path", "请求路径无效");
      const current = requireSession(session);
      const body = request.method === "POST" ? await readImBody(request) : {};
      // Body reading yields. Recheck expiration before any domain operation.
      requireSession(current);
      const get = request.method === "GET";
      const mutation = <T>(operation: () => T): T => writes.mutate(current, parts.join("/"), body, operation);
      let result: unknown;
      if (parts.length === 1 && parts[0] === "session") {
        if (current.member_id) identity.requireMember(current);
        result = get ? { member: identity.member(current) } : mutation(() => {
          const named = identity.name(current, textInput(body.display_name, "名字", 40));
          writes.memberChanged(named.member.id);
          return named;
        });
      } else {
        const member = identity.requireMember(current);
        if (parts.length === 1 && parts[0] === "rooms") {
          result = get ? { rooms: reads.rooms(member.id) } : mutation(() => writes.createRoom(member.id, body.title));
        } else if (parts.length === 1 && parts[0] === "join" && !get) {
          result = mutation(() => writes.join(member.id, body.token));
        } else if (parts[0] === "rooms" && parts[1]) {
          const roomId = parts[1];
          reads.assertMember(roomId, member.id);
          const threadId = parts[2] === "threads" && parts[3] ? parts[3] : null;
          if (parts.length === 2 && get) result = reads.state(roomId);
          else if (parts.length === 3 && parts[2] === "invite" && get) result = writes.invite(roomId, member.id, url.origin);
          else if (parts.length === 4 && parts[2] === "invite" && parts[3] === "rotate" && !get) {
            result = mutation(() => writes.invite(roomId, member.id, url.origin, true));
          } else if (parts.length === 3 && parts[2] === "threads" && !get) {
            result = mutation(() => writes.createThread(roomId, member.id, body));
          } else if (parts.length === 4 && threadId && get) result = reads.threadState(roomId, threadId);
          else if ((parts.length === 3 && parts[2] === "messages") || (parts.length === 5 && threadId && parts[4] === "messages")) {
            result = get ? reads.messages(roomId, threadId, integerQuery(url.searchParams, "before", null), integerQuery(url.searchParams, "limit", 50, 100)!)
              : mutation(() => writes.send(roomId, threadId, member.id, body.body));
          } else if (parts.length === 5 && threadId && parts[4] === "share" && !get) {
            result = mutation(() => writes.share(roomId, threadId, member.id, body));
          } else throw new ImError("im.route_not_found", "找不到这个群聊操作", 404);
        } else throw new ImError("im.route_not_found", "找不到这个群聊操作", 404);
      }
      imJson(response, 200, result);
    } catch (error) { imFailure(response, error); }
    return true;
  }

  return { handleImRequest, assertRoomMember: (roomId: string, memberId: string): void => reads.assertMember(roomId, memberId) };
}
