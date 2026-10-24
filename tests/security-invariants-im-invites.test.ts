import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { inviteFixture } from "./fixtures/im-invites.js";

// The new invariant number follows the main/queue allocation at PR integration; RAC-100/101 stay stable.
type InviteState = { room_id: string; token_hash: string | null };
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const intent = () => ({ client_id: randomUUID(), token: randomBytes(32).toString("hex") });
const rotate = (room: string) => `/rooms/${room}/invite/rotate`;

test("RAC-100: invitations persist only hashes; safe GET never rotates and a hash is not a bearer credential", async t => {
  const f = await inviteFixture(t), alice = await f.person("Alice"), bob = await f.person("Bob"), room = await f.room(alice.cookie);
  const before = f.storage.db.prepare("SELECT total_changes() AS n").get();
  const empty = await f.call<InviteState>(alice.cookie, `/rooms/${room.id}/invite`);
  assert.equal(empty.status, 200); assert.deepEqual(empty.body, { room_id: room.id, token_hash: null });
  assert.deepEqual(f.storage.db.prepare("SELECT total_changes() AS n").get(), before, "opening invitations changes no business state");
  const first = intent(), result = await f.post<InviteState>(alice.cookie, rotate(room.id), first);
  assert.equal(result.status, 200); assert.deepEqual(result.body, { room_id: room.id, token_hash: digest(first.token) });
  assert.equal((await f.post(bob.cookie, "/join", { token: digest(first.token) })).status, 404);
  assert.equal((await f.post(bob.cookie, "/join", { token: first.token })).status, 200);
  for (const token of ["short", "g".repeat(64), " ".repeat(64)]) assert.equal((await f.post(alice.cookie, rotate(room.id), { token })).status, 400);
  const copy = join(f.home, "backup.sqlite"); await f.storage.db.backup(copy);
  for (const file of [f.storage.path, `${f.storage.path}-wal`, `${f.storage.path}-shm`, copy].filter(existsSync)) {
    assert.equal(readFileSync(file).includes(Buffer.from(first.token)), false, `no original invitation in ${file}`);
  }
  const receipts = f.storage.db.prepare("SELECT result_json FROM im_receipts").all();
  assert.equal(JSON.stringify(receipts).includes(first.token), false);
  await f.restart();
  assert.deepEqual((await f.call<InviteState>(alice.cookie, `/rooms/${room.id}/invite`)).body, result.body);
  assert.equal((await f.post(bob.cookie, "/join", { token: first.token })).status, 200);
});

test("RAC-101: every invitation replay rechecks the current owner, room membership and project restriction", async t => {
  const f = await inviteFixture(t), alice = await f.person("Alice"), bob = await f.person("Bob"), outside = await f.person("Outside"), room = await f.room(alice.cookie);
  const first = intent(); assert.equal((await f.post(alice.cookie, rotate(room.id), first)).status, 200);
  f.storage.db.prepare("INSERT INTO im_members VALUES (?,?,?)").run(room.id, bob.member.id, new Date().toISOString());
  const stable = () => ({ room: f.storage.db.prepare("SELECT * FROM im_rooms WHERE id=?").get(room.id),
    events: f.storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events").get(), receipts: f.storage.db.prepare("SELECT COUNT(*) AS n FROM im_receipts").get() });
  let before = stable();
  assert.equal((await f.post(bob.cookie, rotate(room.id), first)).status, 403);
  assert.equal((await f.call(outside.cookie, `/rooms/${room.id}/invite`)).status, 403);
  assert.deepEqual(stable(), before);
  f.storage.db.prepare("UPDATE im_rooms SET owner_id=? WHERE id=?").run(bob.member.id, room.id); before = stable();
  assert.equal((await f.post(alice.cookie, rotate(room.id), first)).status, 403, "a stored receipt cannot preserve an old owner's authority");
  assert.deepEqual(stable(), before);
  f.storage.db.prepare("DELETE FROM im_members WHERE room_id=? AND member_id=?").run(room.id, alice.member.id); before = stable();
  assert.equal((await f.post(alice.cookie, rotate(room.id), first)).status, 403);
  assert.deepEqual(stable(), before);
  f.storage.db.prepare("INSERT INTO mw_projects VALUES ('project','Project',?,'{}')").run(bob.member.id);
  f.storage.db.prepare("INSERT INTO mw_access VALUES ('project',?,'owner')").run(bob.member.id);
  f.storage.db.prepare("UPDATE im_rooms SET project_id='project' WHERE id=?").run(room.id); before = stable();
  assert.equal((await f.post(bob.cookie, rotate(room.id), intent())).status, 403);
  assert.equal((await f.call(bob.cookie, `/rooms/${room.id}/invite`)).status, 403);
  assert.deepEqual(stable(), before);
});

test("RAC-101: lost responses and restarts reuse one rotation; stale replays never reactivate a superseded token", async t => {
  const f = await inviteFixture(t), alice = await f.person("Alice"), bob = await f.person("Bob"), room = await f.room(alice.cookie);
  const first = intent(); await f.loseAnswer(alice.cookie, rotate(room.id), first);
  const count = () => f.storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events WHERE kind='invite'").get();
  const once = count(); await f.restart();
  const [a, b] = await Promise.all([f.post<InviteState>(alice.cookie, rotate(room.id), first), f.post<InviteState>(alice.cookie, rotate(room.id), first)]);
  assert.equal(a.status, 200); assert.deepEqual(a.body, b.body); assert.equal(a.body.token_hash, digest(first.token)); assert.deepEqual(count(), once);
  const second = intent(); assert.equal((await f.post(alice.cookie, rotate(room.id), second)).status, 200);
  const after = count(), replay = await f.post<InviteState>(alice.cookie, rotate(room.id), first);
  assert.equal(replay.status, 200); assert.equal(replay.body.token_hash, digest(second.token), "the response reports the current invitation, never the stale one");
  assert.deepEqual(count(), after);
  assert.equal((await f.post(bob.cookie, "/join", { token: first.token })).status, 404);
  assert.equal((await f.post(bob.cookie, "/join", { token: second.token })).status, 200);
  assert.equal((await f.post(alice.cookie, rotate(room.id), { ...first, token: second.token })).status, 409);
  assert.deepEqual(count(), after);
});

test("RAC-101: a failed invitation receipt rolls back the hash and event, then the same intent can recover", async t => {
  const f = await inviteFixture(t), alice = await f.person("Alice"), room = await f.room(alice.cookie);
  const first = intent(), next = intent(); await f.post(alice.cookie, rotate(room.id), first);
  const before = f.storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events").get();
  f.storage.db.exec("CREATE TRIGGER refuse_invite_receipt BEFORE INSERT ON im_receipts BEGIN SELECT RAISE(ABORT,'receipt denied'); END");
  assert.equal((await f.post(alice.cookie, rotate(room.id), next)).status, 500);
  assert.equal((await f.call<InviteState>(alice.cookie, `/rooms/${room.id}/invite`)).body.token_hash, digest(first.token));
  assert.deepEqual(f.storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events").get(), before);
  f.storage.db.exec("DROP TRIGGER refuse_invite_receipt");
  const recovered = await f.post<InviteState>(alice.cookie, rotate(room.id), next);
  assert.equal(recovered.status, 200); assert.equal(recovered.body.token_hash, digest(next.token));
});
