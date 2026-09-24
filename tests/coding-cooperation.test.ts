import assert from "node:assert/strict";
import test from "node:test";
import { CodingCooperationStore, MAX_DELEGATION_HOPS } from "@molis-ai/molis-work-plugin-coding";

const memory = () => {
  const values = new Map<string, string>();
  return { values, get: (key: string) => values.get(key) ?? null, set: (key: string, value: string) => { values.set(key, value); },
    delete: (key: string) => values.delete(key),
    compareAndSet(key: string, expected: string | null, value: string) { if ((values.get(key) ?? null) !== expected) return false; values.set(key, value); return true; } };
};
const at = "2026-09-25T00:00:00.000Z";

test("委派按序推进，每一步留回执；不许跳级，结束之后的答复只记录", () => {
  const store = new CodingCooperationStore(memory());
  const created = store.create({ from_session: "A", title: "补测试", task: "为 longestStreak 补边界测试", materials: [], actor: "me", at });
  assert.equal(created.state, "received");
  store.bindTarget(created.delegation_id, "C");
  assert.throws(() => store.apply(created.delegation_id, created.revision, "accepted", "accepted", "me", at), /不能从「已收到，尚未送达」直接变成「对方已接受，尚未开始」/);
  const delivered = store.apply(created.delegation_id, created.revision, "delivered", "delivered", "me", at, item => { item.to_session = "C"; });
  assert.throws(() => store.apply(created.delegation_id, created.revision, "accepted", "accepted", "c-user", at), /刚刚变化/, "a stale revision is refused");
  const accepted = store.apply(created.delegation_id, delivered.revision, "accepted", "accepted", "c-user", at);
  const started = store.apply(created.delegation_id, accepted.revision, "started", "committing", "c-user", at);
  const sent = store.apply(created.delegation_id, started.revision, "delivery-sent", null, "c-user", at, item => {
    item.deliveries.push({ delivery_id: "d1", kind: "report", artifact: { artifact_id: "coding-report:C:r1", version: 1 }, run_id: "r1", title: "报告", note: "", state: "sent", sent_at: at }); });
  assert.equal(sent.state, "committing", "a delivery is not completion; the asking side decides");
  const done = store.apply(created.delegation_id, sent.revision, "delivery-accepted", "completed", "me", at);
  assert.deepEqual(done.receipts.map(receipt => receipt.event), ["submitted", "delivered", "accepted", "started", "delivery-sent", "delivery-accepted"]);
  assert.throws(() => store.apply(created.delegation_id, undefined, "cancelled", "cancelled", "me", at), /已经已完成；这次操作只记录/);
  const after = store.get(created.delegation_id)!;
  assert.equal(after.state, "completed", "a late answer never rewrites the outcome");
  assert.equal(after.receipts.at(-1)!.recorded_only, true);
  assert.deepEqual(store.forSession("A").outgoing.map(item => item.delegation_id), [created.delegation_id]);
  assert.equal(store.forSession("C").incoming?.delegation_id, created.delegation_id);
});

test("跳数有上限：委派出去的会话还能再委派，但不能无限转交", () => {
  const store = new CodingCooperationStore(memory());
  let from = "S0";
  for (let hop = 1; hop <= MAX_DELEGATION_HOPS; hop++) {
    const delegation = store.create({ from_session: from, title: `第 ${hop} 层`, task: "t", materials: [], actor: "me", at });
    assert.equal(delegation.hops, hop);
    store.bindTarget(delegation.delegation_id, `S${hop}`);
    from = `S${hop}`;
  }
  assert.throws(() => store.create({ from_session: from, title: "再转", task: "t", materials: [], actor: "me", at }), /最多转交 3 层/);
});

test("没有原子写入的宿主上不开放协作", () => {
  const { compareAndSet: _omit, ...plain } = memory();
  assert.throws(() => new CodingCooperationStore(plain).create({ from_session: "A", title: "t", task: "t", materials: [], actor: "me", at }), /需要宿主提供原子写入/);
});
