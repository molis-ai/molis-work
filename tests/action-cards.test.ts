import assert from "node:assert/strict";
import test from "node:test";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { dismissActionCard, draftActionCard, runActionCard, sweepActionCard, type ActionCard, type ActionCardPorts, type CardAuthority } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-interaction-experience D26: the action card rules live once, in the plugin SDK, behind two ports; any keeper of
// cards (the Assistant now, Coding next) runs by them. These pin the rules with a keeper of nothing but memory.
const reference = { capability_id: "todo.items.update", version: 1, provider_id: "io.molis.work.todo" };
const view = (extra: Partial<ActionView> = {}): ActionView => ({ ...reference, operation: "command", provider: { provider_id: reference.provider_id, title: "Todo" },
  action: { title: "改待办", description: "", subject_kinds: ["todo_item"], permissions: [], audiences: ["agent"],
    input_schema: { type: "object", properties: { todo_item_id: { type: "string" }, title: { type: "string" }, due: { type: "string", format: "date" }, priority: { type: "number" } } } },
  availability: { available: true }, ...extra }) as never;
const refused = (reason: string) => (error: unknown) => (error as { reason?: string }).reason === reason;

function keeper(now = "2026-10-15T09:00:00Z", subjects: Record<string, string | "missing"> = { t1: "3" }) {
  const cards = new Map<string, ActionCard>();
  const invoked: unknown[] = [];
  let reply: () => Promise<unknown> = async () => ({ item: { title: "写周报" } });
  const authority: CardAuthority = { discover: async () => [current], check: (_view, input) => { if (typeof (input as { title?: unknown }).title !== "string") throw new Error("title 必填"); },
    invoke: async (_ref, input) => { invoked.push(input); return reply(); } };
  let current = view();
  const ports: ActionCardPorts = {
    store: { update: (card, expected, patch) => {
      const held = cards.get(card.card_id) ?? card;
      if (held.revision !== expected) throw new Error("conflict");
      const next = { ...held, ...patch, revision: held.revision + 1 };
      cards.set(card.card_id, next); return next;
    } },
    authority: async () => authority,
    readSubject: async subject => { const revision = subjects[subject.id]; return revision === "missing" ? "missing" : revision ? { subject, revision, title: "写周报" } as never : null; },
    now: () => new Date(now), timeZone: "UTC",
    refuse: (reason, message) => Object.assign(new Error(message), { reason }),
  };
  const draft = async (input: unknown, extra: object = {}) => {
    const card = await draftActionCard(`card-${cards.size + 1}`, { title: "改成明天", summary: "把「写周报」改到明天", reference, input, editable: ["due"], ...extra }, [current], { ...ports, check: authority.check });
    cards.set(card.card_id, card); return card;
  };
  return { cards, invoked, ports, draft, set view(next: ActionView) { current = next; }, set reply(next: () => Promise<unknown>) { reply = next; } };
}

test("D26: a suggestion becomes a card only for an action offered now, with a valid input, and remembers the object as it read", async () => {
  const k = keeper();
  const card = await k.draft({ todo_item_id: "t1", title: "写周报", due: "2026-10-16" });
  assert.equal(card.status, "ready");
  assert.deepEqual(card.target, { kind: "todo_item", id: "t1", revision: "3", title: "写周报" });
  assert.equal(card.effect, "write");
  await assert.rejects(k.draft({ todo_item_id: "t1" }), /title 必填/, "an input the action does not take is no card");
  assert.equal((await k.draft({ todo_item_id: "t1" }, { missing: [{ field: "title", question: "叫什么？" }] })).status, "needs-input", "a card still asking is checked when it runs");
  k.view = view({ availability: { available: false, reason: "off" } } as Partial<ActionView>);
  await assert.rejects(k.draft({ todo_item_id: "t1", title: "x" }), refused("revoked"));
});

test("D26 / D27: a card runs once, exactly as shown at its revision, with only the fields it lets the person change", async () => {
  const k = keeper();
  const card = await k.draft({ todo_item_id: "t1", title: "写周报", due: "2026-10-16" });
  await assert.rejects(runActionCard(card, { revision: 2, values: {} }, k.ports), refused("conflict"), "a revision the person did not see is refused");
  await assert.rejects(runActionCard(card, { revision: 1, values: { title: "别的" } }, k.ports), refused("invalid"), "a field it does not let change is refused");
  const ran = await runActionCard(card, { revision: 1, values: { due: "2026-10-17" } }, k.ports);
  assert.equal(ran.status, "done");
  assert.equal(ran.outcome, "「写周报」");
  assert.deepEqual(k.invoked, [{ todo_item_id: "t1", title: "写周报", due: "2026-10-17" }]);
  assert.equal(await runActionCard(ran, { revision: ran.revision, values: {} }, k.ports), ran, "a card that ran does not run again");
  await assert.rejects(runActionCard(card, { revision: 1, values: {} }, k.ports), /conflict/, "nor does a second click on the card as it was: the claim is taken");
  assert.equal(k.invoked.length, 1);
});

test("D27: a card whose object moved on, whose moment passed, or whose action is no longer offered does not run", async () => {
  const moved = keeper(undefined, { t1: "3" });
  const card = await moved.draft({ todo_item_id: "t1", title: "写周报" });
  const changedSince = keeper(undefined, { t1: "4" });
  assert.equal((await runActionCard(card, { revision: 1, values: {} }, changedSince.ports)).status, "stale");
  assert.equal((await runActionCard(card, { revision: 1, values: {} }, keeper(undefined, { t1: "missing" }).ports)).status, "stale");
  const late = keeper("2026-10-20T09:00:00Z");
  const due = await late.draft({ todo_item_id: "t1", title: "写周报", due: "2026-10-18" });
  due.created_at = "2026-10-15T09:00:00Z";
  assert.match((await runActionCard(due, { revision: 1, values: {} }, late.ports)).outcome ?? "", /已经过去/);
  const off = keeper();
  const offered = await off.draft({ todo_item_id: "t1", title: "写周报" });
  off.view = view({ availability: { available: false, reason: "已对助理关闭" } } as Partial<ActionView>);
  const stale = await runActionCard(offered, { revision: 1, values: {} }, off.ports);
  assert.deepEqual([stale.status, stale.outcome], ["stale", "已对助理关闭"]);
  for (const k of [moved, changedSince, late, off]) assert.equal(k.invoked.length, 0, "nothing ran");
});

test("D26: how a run that threw reads — unknown is never a plain retry, data that moved on is stale, the rest failed", async () => {
  for (const [error, status] of [[Object.assign(new Error("送达未确认"), { code: "actions.outcome_unknown" }), "unknown"], [Object.assign(new Error("版本已变化"), { code: "todo.conflict" }), "stale"], [new Error("磁盘满"), "failed"]] as const) {
    const k = keeper();
    const card = await k.draft({ todo_item_id: "t1", title: "写周报" });
    k.reply = async () => { throw error; };
    assert.equal((await runActionCard(card, { revision: 1, values: {} }, k.ports)).status, status, error.message);
  }
});

test("D26: a dismissed card stays put; a sweep marks a suggestion whose object changed by hand, and leaves one already running", async () => {
  const k = keeper();
  const card = await k.draft({ todo_item_id: "t1", title: "写周报" });
  assert.equal(dismissActionCard(card, k.ports.store).status, "dismissed");
  const other = await k.draft({ todo_item_id: "t1", title: "写周报" });
  const changed = keeper(undefined, { t1: "9" });
  changed.cards.set(other.card_id, other);
  assert.equal((await sweepActionCard(other, changed.ports)).status, "stale");
  const running = { ...other, status: "running" as const };
  assert.equal(await sweepActionCard(running, changed.ports), running);
});
