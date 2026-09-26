import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createImDomain, ImError, type ImSession, type ImEvents, type ImIdentity } from "../server/src/im/index.js";
import type { ImMember, ImMessagePage, ImMessage, ImRoom, ImThreadState, ImInvite } from "@molis-ai/molis-work-contracts/services/im";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "molis-im-domain-"));
  let db: Database.Database, domain: ReturnType<typeof createImDomain>, server: http.Server, origin = "";
  let failAppend = false, failNotify = false, notifications = 0;
  const boot = async () => {
    db = new Database(join(directory, "server.sqlite"));
    db.pragma("foreign_keys = ON");
    db.exec(`CREATE TABLE IF NOT EXISTS mw_members(id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mw_sessions(id TEXT PRIMARY KEY, member_id TEXT REFERENCES mw_members(id), expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS mw_events(cursor INTEGER PRIMARY KEY AUTOINCREMENT, scope_kind TEXT NOT NULL,
        scope_id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, thread_id TEXT);`);
    const active = (session: ImSession) => {
      const current = db.prepare("SELECT * FROM mw_sessions WHERE id = ? AND revoked = 0 AND expires_at > ?").get(session.id, Date.now()) as ImSession | undefined;
      if (!current || current.member_id !== session.member_id) throw new ImError("identity.unauthenticated", "会话失效", 401);
    };
    const identity: ImIdentity = {
      member: session => session.member_id ? db.prepare("SELECT id, display_name FROM mw_members WHERE id = ?").get(session.member_id) as ImMember : null,
      requireMember(session) { active(session); const member = this.member(session); if (!member) throw new ImError("identity.unauthenticated", "请设置名字", 401); return member; },
      name(session, value) {
        active(session);
        // The real shared Identity uses its own better-sqlite3 transaction.
        // This exercises nested SAVEPOINT behavior rather than a no-op stub.
        return db.transaction(() => {
          const member = this.member(session) ?? { id: randomUUID(), display_name: String(value) };
          db.prepare("INSERT INTO mw_members(id, display_name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name").run(member.id, value);
          db.prepare("UPDATE mw_sessions SET member_id = ? WHERE id = ?").run(member.id, session.id);
          return { member: { ...member, display_name: String(value) } };
        }).immediate();
      },
    };
    const events: ImEvents = {
      append(event) {
        assert.equal(db.inTransaction, true, "event append shares the business transaction");
        const row = db.prepare("INSERT INTO mw_events(scope_kind, scope_id, kind, entity_id, thread_id) VALUES (?, ?, ?, ?, ?)")
          .run(event.scopeKind, event.scopeId, event.kind, event.entityId, event.threadId ?? null);
        if (failAppend) throw new Error("event failure after insertion");
        return Number(row.lastInsertRowid);
      },
      notify() { assert.equal(db.inTransaction, false, "notification follows commit"); notifications++; if (failNotify) throw new Error("disconnected notifier"); },
    };
    domain = createImDomain({ db, identity, events });
    server = http.createServer(async (request, response) => {
      const sessionId = request.headers["x-test-session"];
      const session = typeof sessionId === "string" ? db.prepare("SELECT id, member_id, expires_at FROM mw_sessions WHERE id = ?").get(sessionId) as ImSession : null;
      try {
        if (!await domain.handleImRequest({ request, response, url: new URL(request.url!, origin), session })) { response.writeHead(404); response.end(); }
      } catch { response.writeHead(500); response.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  };
  await boot();
  const stop = async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); db.close(); };
  const call = async (session: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${origin}/im/api${path}`, { method, headers: {
      ...(session ? { "x-test-session": session } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.text();
    return { status: response.status, body: result ? JSON.parse(result) : null, headers: response.headers };
  };
  const post = (session: string, path: string, body: Record<string, unknown> = {}) => call(session, "POST", path, { client_id: randomUUID(), ...body });
  const anonymous = () => {
    const id = randomUUID(); db.prepare("INSERT INTO mw_sessions(id, member_id, expires_at) VALUES (?, NULL, ?)").run(id, Date.now() + 3600_000); return id;
  };
  const person = async (name: string) => {
    const session = anonymous(), response = await post(session, "/session", { display_name: name });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return { session, member: response.body.member as ImMember };
  };
  return { call, post, person, anonymous, get db() { return db; }, get domain() { return domain; }, get origin() { return origin; },
    get notifications() { return notifications; }, set failAppend(value: boolean) { failAppend = value; }, set failNotify(value: boolean) { failNotify = value; },
    restart: async () => { await stop(); await boot(); }, close: async () => { await stop(); await rm(directory, { recursive: true, force: true }); } };
}

test("IM uses shared members, enforces room membership, and only an owner controls invitations", async () => {
  const f = await fixture();
  try {
    const alice = await f.person("一骏"), bob = await f.person("小林"), stranger = await f.person("访客");
    assert.equal((await f.call(null, "GET", "/rooms")).status, 401);
    assert.deepEqual((await f.call(alice.session, "GET", "/session")).body.member, alice.member);
    assert.deepEqual((await f.call(alice.session, "GET", "/rooms")).body.rooms, []);
    const created = await f.post(alice.session, "/rooms", { title: "产品讨论" }); assert.equal(created.status, 200);
    const room = created.body.room as ImRoom;
    assert.equal(room.member_count, 1); assert.equal(room.latest_message, null);
    const invite = (await f.call(alice.session, "GET", `/rooms/${room.id}/invite`)).body as ImInvite;
    assert.equal(invite.url, `${f.origin}${invite.path}`);
    assert.equal((await f.post(bob.session, "/join", { token: invite.token })).status, 200);
    assert.equal((await f.post(bob.session, "/join", { token: invite.token })).body.room.member_count, 2, "rejoining never duplicates a member");
    for (const suffix of ["", "/messages", "/threads/arbitrary", "/invite"]) assert.equal((await f.call(stranger.session, "GET", `/rooms/${room.id}${suffix}`)).status, 403);
    for (const suffix of ["/messages", "/threads", "/threads/arbitrary/messages", "/threads/arbitrary/share", "/invite/rotate"]) {
      assert.equal((await f.post(stranger.session, `/rooms/${room.id}${suffix}`, { body: "forged" })).status, 403);
    }
    assert.throws(() => f.domain.assertRoomMember(room.id, stranger.member.id), { code: "im.forbidden" });
    assert.equal((await f.call(bob.session, "GET", `/rooms/${room.id}/invite`)).status, 403);
    assert.equal((await f.post(bob.session, `/rooms/${room.id}/invite/rotate`)).status, 403);
    const rotated = (await f.post(alice.session, `/rooms/${room.id}/invite/rotate`)).body as ImInvite;
    assert.notEqual(rotated.token, invite.token);
    assert.equal((await f.post(stranger.session, "/join", { token: invite.token })).status, 404);
    assert.equal((await f.post(stranger.session, "/join", { token: rotated.token })).status, 200);
    const state = (await f.call(bob.session, "GET", `/rooms/${room.id}`)).body;
    assert.deepEqual(state.members.map((m: ImMember) => m.display_name).sort(), ["一骏", "小林", "访客"].sort());
    assert.equal((await f.call(bob.session, "GET", `/rooms/${room.id}/events`)).status, 404, "SSE is left to the shared host");
    const tables = f.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{name:string}>;
    assert.equal(tables.some(t => ["im_people", "im_sessions", "im_events"].includes(t.name)), false, "no shadow identity or event tables");
  } finally { await f.close(); }
});

test("IM shares original group context, isolates Threads, shares replies with backlinks, and paginates after restart", async () => {
  const f = await fixture();
  try {
    const alice = await f.person("Alice"), bob = await f.person("Bob");
    const room = (await f.post(alice.session, "/rooms", { title: "群一" })).body.room as ImRoom;
    const other = (await f.post(alice.session, "/rooms", { title: "群二" })).body.room as ImRoom;
    const invite = (await f.call(alice.session, "GET", `/rooms/${room.id}/invite`)).body as ImInvite;
    await f.post(bob.session, "/join", { token: invite.token });
    const originals: ImMessage[] = [];
    for (let i = 0; i < 7; i++) originals.push((await f.post(alice.session, `/rooms/${room.id}/messages`, { body: `原文 ${i}`, author_id: bob.member.id })).body.message);
    assert.equal(originals[0]!.author.id, alice.member.id, "body author cannot impersonate another member");
    const one = (await f.post(bob.session, `/rooms/${room.id}/threads`, { title: "具体怎么做", source_message_id: originals[4]!.id })).body as ImThreadState;
    const two = (await f.post(alice.session, `/rooms/${room.id}/threads`, { title: "另一条讨论", source_message_id: originals[6]!.id })).body as ImThreadState;
    assert.deepEqual(one.context.map(m => m.id), originals.slice(1, 5).map(m => m.id));
    assert.deepEqual(one.context.map(m => m.body), ["原文 1", "原文 2", "原文 3", "原文 4"]);
    const stored = f.db.prepare("SELECT message_id FROM im_thread_context WHERE thread_id=? ORDER BY position").all(one.thread.id) as Array<{ message_id: string }>;
    assert.deepEqual(stored.map(row => row.message_id), originals.slice(1, 5).map(m => m.id));
    const reply = (await f.post(bob.session, `/rooms/${room.id}/threads/${one.thread.id}/messages`, { body: "先试一版" })).body.message as ImMessage;
    await f.post(alice.session, `/rooms/${room.id}/threads/${two.thread.id}/messages`, { body: "另一条的回复" });
    assert.deepEqual((await f.call(alice.session, "GET", `/rooms/${room.id}/threads/${one.thread.id}/messages`)).body.messages.map((m: ImMessage) => m.body), ["先试一版"]);
    assert.equal((await f.post(alice.session, `/rooms/${other.id}/threads`, { title: "非法跨群", source_message_id: originals[0]!.id })).status, 404);
    assert.equal((await f.post(alice.session, `/rooms/${room.id}/threads`, { title: "不能嵌套", source_message_id: reply.id })).status, 400);
    assert.equal((await f.call(alice.session, "GET", `/rooms/${other.id}/threads/${one.thread.id}`)).status, 404);
    assert.equal((await f.post(alice.session, `/rooms/${other.id}/threads/${one.thread.id}/messages`, { body: "跨群" })).status, 404);
    assert.equal((await f.post(alice.session, `/rooms/${room.id}/threads/${two.thread.id}/share`, { message_id: reply.id })).status, 400);
    const shared = (await f.post(alice.session, `/rooms/${room.id}/threads/${one.thread.id}/share`, { message_id: reply.id, body: "我们先按这个试" })).body.message as ImMessage;
    assert.equal(shared.thread_id, null); assert.equal(shared.shared_reply!.message_id, reply.id);
    assert.equal(shared.shared_reply!.thread_id, one.thread.id); assert.equal(shared.shared_reply!.body, "先试一版");
    const latest = (await f.call(bob.session, "GET", `/rooms/${room.id}/messages?limit=3`)).body as ImMessagePage;
    assert.deepEqual(latest.messages.map(m => m.id), [originals[5]!.id, originals[6]!.id, shared.id]);
    assert.equal(latest.has_more, true);
    const earlier = (await f.call(bob.session, "GET", `/rooms/${room.id}/messages?limit=3&before=${latest.next_before}`)).body as ImMessagePage;
    assert.deepEqual(earlier.messages.map(m => m.body), ["原文 2", "原文 3", "原文 4"]);
    await f.restart();
    assert.equal((await f.call(bob.session, "GET", "/session")).body.member.id, bob.member.id);
    assert.deepEqual((await f.call(bob.session, "GET", `/rooms/${room.id}/threads/${one.thread.id}`)).body.context.map((m: ImMessage) => m.id), one.context.map(m => m.id));
    const oldest = (await f.call(bob.session, "GET", `/rooms/${room.id}/messages?limit=3&before=${earlier.next_before}`)).body as ImMessagePage;
    assert.deepEqual(oldest.messages.map(m => m.body), ["原文 0", "原文 1"]); assert.equal(oldest.has_more, false); assert.equal(oldest.next_before, null);
    const state = (await f.call(bob.session, "GET", `/rooms/${room.id}`)).body;
    assert.equal(state.threads.length, 2); assert.ok(state.threads.every((t: { reply_count: number }) => t.reply_count === 1));
  } finally { await f.close(); }
});

test("IM commits messages, receipts and common events atomically; retries survive restart without duplicate side effects", async () => {
  const f = await fixture();
  try {
    const person = await f.person("Author"), room = (await f.post(person.session, "/rooms", { title: "幂等群" })).body.room as ImRoom;
    const body = { client_id: randomUUID(), body: "只发一次" }, route = `/rooms/${room.id}/messages`;
    const eventsBefore = (f.db.prepare("SELECT COUNT(*) AS n FROM mw_events").get() as {n:number}).n;
    const notifyBefore = f.notifications;
    const [first, replay] = await Promise.all([f.post(person.session, route, body), f.post(person.session, route, body)]);
    assert.equal(first.status, 200); assert.deepEqual(replay.body, first.body);
    assert.equal(f.notifications, notifyBefore + 1);
    assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM mw_events").get() as {n:number}).n, eventsBefore + 1);
    assert.equal((await f.post(person.session, route, { ...body, body: "换了内容" })).status, 409);
    assert.equal((await f.post(person.session, "/rooms", { client_id: body.client_id, title: "不能复用" })).status, 409);
    await f.restart();
    assert.deepEqual((await f.post(person.session, route, body)).body, first.body);
    assert.equal((await f.call(person.session, "GET", route)).body.messages.length, 1);
    const failed = { client_id: randomUUID(), body: "事件失败不能半提交" };
    f.failAppend = true;
    const beforeFailure = f.notifications;
    assert.equal((await f.post(person.session, route, failed)).status, 500);
    assert.equal(f.notifications, beforeFailure);
    assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM im_receipts WHERE client_id=?").get(failed.client_id) as {n:number}).n, 0);
    assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM mw_events").get() as {n:number}).n, eventsBefore + 1);
    assert.equal((await f.call(person.session, "GET", route)).body.messages.length, 1);
    f.failAppend = false; f.failNotify = true;
    assert.equal((await f.post(person.session, route, failed)).status, 200, "notification failure cannot turn a durable success into rollback");
    assert.equal((await f.call(person.session, "GET", route)).body.messages.length, 2);
    assert.equal((await f.post(person.session, route, failed)).status, 200);
    assert.equal((await f.call(person.session, "GET", route)).body.messages.length, 2);
  } finally { await f.close(); }
});

test("IM input validation rejects arrays, malformed pagination, oversize bodies and expired or revoked sessions", async () => {
  const f = await fixture();
  try {
    const person = await f.person("测试"), room = (await f.post(person.session, "/rooms", { title: "验证群" })).body.room as ImRoom;
    const route = `/rooms/${room.id}/messages`;
    for (const body of [[], null, "text", 2]) assert.equal((await f.call(person.session, "POST", route, body)).status, 400);
    for (const body of ["", " ", 2, [], { text: "正文" }, "x".repeat(12001)]) assert.equal((await f.post(person.session, route, { body })).status, 400);
    assert.equal((await f.call(person.session, "POST", route, { body: "没有client_id" })).status, 400);
    assert.equal((await f.post(person.session, route, { body: "中".repeat(25000) })).status, 413);
    assert.equal((await f.call(person.session, "POST", route, {}, { "content-type": "text/plain" })).status, 415);
    for (const query of ["before=0", "before=-1", "before=1.5", "before=9007199254740992", "before=a", "limit=101", "limit=0", "limit=2&limit=3"]) {
      assert.equal((await f.call(person.session, "GET", `${route}?${query}`)).status, 400, query);
    }
    assert.equal((await f.call(person.session, "PUT", route)).status, 405);
    assert.equal((await f.call(person.session, "GET", "/rooms/%2F/messages")).status, 400);
    const response = await f.call(person.session, "GET", route);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    f.db.prepare("UPDATE mw_sessions SET revoked=1 WHERE id=?").run(person.session);
    assert.equal((await f.post(person.session, route, { body: "被撤销" })).status, 401);
    assert.equal((await f.call(person.session, "GET", "/session")).status, 401);
    f.db.prepare("UPDATE mw_sessions SET revoked=0,expires_at=0 WHERE id=?").run(person.session);
    assert.equal((await f.call(person.session, "GET", "/session")).status, 401);
  } finally { await f.close(); }
});

test("IM naming and its receipt roll back together even when the shared identity owns a nested transaction", async () => {
  const f = await fixture();
  try {
    const anonymous = f.anonymous(), key = randomUUID();
    f.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON im_receipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END");
    assert.equal((await f.post(anonymous, "/session", { client_id: key, display_name: "未提交姓名" })).status, 500);
    assert.equal((await f.call(anonymous, "GET", "/session")).body.member, null);
    assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM mw_members").get() as {n:number}).n, 0);
    f.db.exec("DROP TRIGGER fail_receipt");
    const first = await f.post(anonymous, "/session", { client_id: key, display_name: "未提交姓名" });
    assert.equal(first.status, 200);
    assert.deepEqual((await f.post(anonymous, "/session", { client_id: key, display_name: "未提交姓名" })).body, first.body);
    assert.equal((f.db.prepare("SELECT COUNT(*) AS n FROM mw_members").get() as {n:number}).n, 1);
    assert.equal((await f.post(anonymous, "/session", { client_id: key, display_name: "不同名字" })).status, 409);
  } finally { await f.close(); }
});
