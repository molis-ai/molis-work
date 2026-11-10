import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { openServerDatabase } from "@molis-ai/molis-work-server";
import type { ImMessage, ImMessagePage, ImRoom, ImThreadState } from "@molis-ai/molis-work-contracts/services/im";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

async function json<T>(response: Response, status = 200): Promise<T> {
  const value = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value;
}

test("IUI-03 IUI-10 IUI-21 ordered discussion objects belong to the original message and require both current authorities", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Discussion references"), prefix = "/projects/" + project.project_id;
  const http = (...args: Parameters<typeof f.request>) => f.request(...args).catch(cause => {
    throw new Error("Transport refused " + (args[1]?.method ?? "GET") + " " + args[0], { cause });
  });
  assert.equal((await http(prefix + "/")).status, 200);
  const names = Array.from({ length: 8 }, (_, index) => "Discussion object " + index);
  const subjects = [];
  for (const title of names) {
    const { goal } = await json<{ goal: { goal_id: string } }>(await http(prefix + "/api/plugins/io.molis.work.goals/goals",
      { method: "POST", body: { title, outcome: title, idempotency_key: randomUUID() } }), 201);
    subjects.push({ kind: "goal", id: goal.goal_id });
  }
  const openSession = async (name: string) => {
    const session = await http("/im/api/session", { authorized: false });
    const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
    const response = await http("/im/api/session", { method: "POST", authorized: false, headers: { cookie }, body: { client_id: randomUUID(), display_name: name } });
    const { member } = await json<{ member: { id: string } }>(response);
    return { cookie, id: member.id };
  };
  const owner = await openSession("Owner"), guest = await openSession("Guest");
  const post = (path: string, body: unknown, cookie = owner.cookie, authorized = true) => http(path, { method: "POST", body, headers: { cookie, connection: "close" }, authorized });
  const get = (path: string, cookie = owner.cookie) => http(path, { headers: { cookie, connection: "close" }, authorized: false });
  await json(await post(prefix + "/api/im/connect", {}));
  const { room } = await json<{ room: ImRoom }>(await post("/im/api" + prefix + "/room", {}, owner.cookie, false));
  const base = "/im/api/rooms/" + room.id, messages = base + "/messages", surfaces = base + "/surfaces";
  // An invited participant keeps normal chat access, even when their request also carries the local workbench credential.
  const db = openServerDatabase(join(f.home, "server"));
  t.after(() => db.close());
  db.db.prepare("INSERT INTO mw_access VALUES (?,?,'editor')").run(project.project_id, guest.id);
  const request = { client_id: randomUUID(), body: "", subjects };
  await json(await post(messages, request, owner.cookie, false), 403);
  await json(await post(messages, request, guest.cookie), 403);
  await json(await post(messages, { ...request, subjects: [...subjects, subjects[0]] }), 400);
  await json(await post(messages, { ...request, subjects: [{ ...subjects[0], title: "forged" }] }), 400);
  await json(await post(messages, { ...request, subjects: [subjects[0], { kind: "goal", id: "not-readable" }] }), 404);
  assert.equal(db.db.prepare("SELECT count(*) AS n FROM im_messages").get()?.n, 0, "invalid objects cannot leave a partially written message");
  const send = (body: unknown, path = messages) => post(path, body).then(response => json<{ message: ImMessage }>(response));
  const { message } = await send(request);
  const replay = await send(request);
  assert.equal(replay.message.id, message.id);
  await json(await post(messages, { ...request, subjects: [...subjects].reverse() }), 409);
  await json(await post(messages, { ...request, body: "changed" }), 409);
  assert.equal(message.body, "");
  assert.equal(Object.hasOwn(message, "subjects"), false);

  const duplicate = await send({ client_id: randomUUID(), body: "ordered words", subjects: [subjects[4], subjects[1], subjects[4]] });
  const quote = await send({ client_id: randomUUID(), body: "a quote", quote_id: message.id });
  const thread = await json<ImThreadState>(await post(base + "/threads", { client_id: randomUUID(), title: "A real topic", body: "", subjects: [subjects[2]] }));
  const replies = await json<ImMessagePage>(await get(base + "/threads/" + thread.thread.id + "/messages"));
  assert.equal(replies.messages.length, 1);
  const share = await send({ client_id: randomUUID(), message_id: replies.messages[0]!.id }, base + "/threads/" + thread.thread.id + "/share");
  assert.equal(quote.message.quoted_message?.id, message.id);
  assert.equal(share.message.shared_reply?.message_id, replies.messages[0]!.id);
  const facts = db.db.prepare<[string], { subjects_json: string }>("SELECT subjects_json FROM im_messages WHERE id=?");
  assert.deepEqual(JSON.parse(facts.get(duplicate.message.id)!.subjects_json), [subjects[4], subjects[1]]);
  assert.equal(facts.get(quote.message.id)?.subjects_json, "[]");
  assert.equal(facts.get(share.message.id)?.subjects_json, "[]");
  const history = await json<ImMessagePage>(await get(messages + "?limit=2", guest.cookie));
  assert.equal(history.has_more, true);
  assert.equal(JSON.stringify(history).includes(subjects[0]!.id), false);
  const search = await json<ImMessagePage>(await get(base + "/search?q=ordered", guest.cookie));
  assert.equal(search.messages[0]?.id, duplicate.message.id);
  assert.equal(JSON.stringify(search).includes(subjects[4]!.id), false);

  const ask = { views: [{ message_id: message.id, part: "message" }, { message_id: quote.message.id, part: "quote", expanded: true },
    { message_id: share.message.id, part: "share" }, { message_id: duplicate.message.id, part: "message" }] };
  await json(await post(surfaces, ask, owner.cookie, false), 403);
  await json(await post(surfaces, ask, guest.cookie), 403);
  const display = await json<SurfaceHomeDisplay>(await post(surfaces, ask));
  assert.deepEqual(display.groups[0]?.items.map(item => item.subject), subjects.slice(0, 6));
  assert.equal(display.groups[0]?.overflow?.count, 2);
  assert.deepEqual(display.groups[1]?.items.map(item => item.subject), subjects);
  assert.deepEqual(display.groups[2]?.items.map(item => item.subject), [subjects[2]]);
  assert.deepEqual(display.groups[3]?.items.map(item => item.subject), [subjects[4], subjects[1]]);
  assert.equal(display.display.rows.length, 8, "shared display fields are returned once per object in the whole batch");
  assert.deepEqual(display.display.rows.map(row => row.read.state === "ok" && row.read.values?.title), names);
  const record = display.display.rows[0]!;
  const click = { views: [ask.views[0]], click: { owner_plugin_id: record.owner, target: { kind: "object", subject: record.subject, installation: record.installation } } };
  const opened = await json<{ item_id: string }>(await post(surfaces, click));
  assert.equal(opened.item_id, subjects[0]!.id);
  await json(await post(surfaces, { ...click, views: [{ message_id: duplicate.message.id, part: "quote" }] }), 409);

  const reopened = openServerDatabase(join(f.home, "server"));
  try {
    assert.deepEqual(JSON.parse(reopened.db.prepare("SELECT subjects_json FROM im_messages WHERE id=?").get(message.id)!.subjects_json as string), subjects);
    assert.equal(reopened.db.prepare("PRAGMA user_version").get()?.user_version, 1);
  } finally { reopened.close(); }
  const log = f.host.callLog!, original = log.record;
  let withdrawn = false;
  log.record = function (caller, action, outcome) {
    if (!withdrawn && action.capability_id === "goals.presentation.values" && outcome.ok) {
      withdrawn = true;
      db.db.prepare("DELETE FROM mw_access WHERE project_id=? AND member_id=?").run(project.project_id, owner.id);
    }
    return original.call(this, caller, action, outcome);
  };
  try {
    const count = db.db.prepare("SELECT count(*) AS n FROM im_messages").get()?.n;
    const refused = await post(messages, { client_id: randomUUID(), body: "", subjects: [subjects[0]] });
    assert.ok(withdrawn);
    assert.ok(!refused.ok, await refused.text());
    assert.equal(db.db.prepare("SELECT count(*) AS n FROM im_messages").get()?.n, count, "withdrawal during owner values stops the original message transaction");
  } finally { log.record = original; }

  db.db.prepare("INSERT INTO mw_access VALUES (?,?,'owner')").run(project.project_id, owner.id);
  const surface = f.host.surfacePosition;
  const pauseDisplay = () => {
    const entered = deferred(), release = deferred();
    const paused: typeof surface = (reference, request, prefix, signal, source, use, discussion, slot) =>
      surface(reference, request, prefix, signal, source, async position => {
        entered.resolve(); await release.promise;
        return use(position);
      }, discussion, slot);
    Object.defineProperty(f.host, "surfacePosition", { value: paused, configurable: true });
    return { ready: entered.promise, resume() { Object.defineProperty(f.host, "surfacePosition", { value: surface }); release.resolve(); } };
  };
  const webPage = await http(prefix + "/", { authorized: false, headers: { connection: "close" } });
  assert.equal(webPage.status, 200);
  const proof = /<meta name="molis-work-page-session" content="([^"]+)"/.exec(await webPage.text())?.[1];
  const webCookie = webPage.headers.getSetCookie().find(cookie => cookie.startsWith("molis-work-web-"))?.split(";")[0];
  assert.ok(proof && webCookie);
  const browserHeaders = { cookie: owner.cookie + "; " + webCookie, "x-molis-work-page-session": proof, connection: "close" };
  assert.equal((await http(surfaces, { method: "POST", headers: browserHeaders, authorized: false, body: ask })).status, 200);
  const webPause = pauseDisplay();
  const lateWeb = http(surfaces, { method: "POST", headers: browserHeaders, authorized: false, body: ask });
  // The existing browser session owner actively closes a response that has not finished when this session is revoked.
  const nothingSent = assert.rejects(lateWeb, error => {
    const transport = error instanceof Error && error.cause instanceof Error ? error.cause.cause : null;
    return !!transport && typeof transport === "object" && "code" in transport && transport.code === "UND_ERR_SOCKET"
      && "socket" in transport && !!transport.socket && typeof transport.socket === "object" && "bytesRead" in transport.socket && transport.socket.bytesRead === 0;
  });
  try {
    await webPause.ready;
    await json(await http("/api/web-session", { method: "DELETE", headers: browserHeaders, authorized: false }));
  } finally { webPause.resume(); }
  await nothingSent;
  const refusedProof = await http(surfaces, { method: "POST", headers: browserHeaders, authorized: false, body: ask });
  assert.equal(refusedProof.status, 403);
  assert.ok(!(await refusedProof.text()).includes(names[0]!));
  assert.ok(db.db.prepare("SELECT 1 FROM mw_access WHERE project_id=? AND member_id=?").get(project.project_id, owner.id), "the IM owner is still authorized");

  const originalPause = pauseDisplay();
  const lateOriginal = post(surfaces, { views: [{ message_id: duplicate.message.id, part: "message" }] });
  try {
    await originalPause.ready;
    db.db.prepare("DELETE FROM im_messages WHERE id=?").run(duplicate.message.id);
  } finally { originalPause.resume(); }
  const disappeared = await lateOriginal;
  assert.equal(disappeared.status, 404);
  assert.ok(!(await disappeared.text()).includes(names[4]!));

  const relationPause = pauseDisplay();
  const lateRelation = post(surfaces, { views: [{ message_id: quote.message.id, part: "quote" }] });
  try {
    await relationPause.ready;
    db.db.prepare("UPDATE im_messages SET quote_id=? WHERE id=?").run(share.message.id, quote.message.id);
  } finally { relationPause.resume(); }
  const changedQuote = await lateRelation;
  assert.equal(changedQuote.status, 404);
  assert.ok(!(await changedQuote.text()).includes(names[0]!));
});
