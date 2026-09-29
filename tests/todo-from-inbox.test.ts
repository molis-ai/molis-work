import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { renderInboxWorkbench, type InboxUiEntry } from "@molis-ai/molis-work-plugin-inbox";
import { LINGGUANG_CLIENT_FACTORY_SCRIPT, renderLingguangWorkbench } from "@molis-ai/molis-work-plugin-lingguang";
import { TODO_ACTION_PERMISSIONS, createTodoActionHandlers, openTodoStore, todoActions, todoManifest } from "@molis-ai/molis-work-plugin-todo";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/gu, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const entry = (status: InboxUiEntry["status"]): InboxUiEntry => ({
  entry_id: "entry-1", revision: 3, subject_type: "feed_item", subject_id: "item-1", reason: "manual", status, kind_label: "Inbox", source_label: "研究库",
  title: "回复\"供应商\"报价", reason_label: "你手工加入", relation_label: "研究库", next_action: "查看原消息", status_label: "待处理", updated_at: "2026-09-28T10:00:00Z",
  available: true, open: { kind: "feed", item_id: "item-1" }, attention_rank: 1, suggested_behavior_ids: [],
} as InboxUiEntry);

test("an Inbox entry offers 转为待办 whether or not it is handled, carrying what the todo keeps; the status line is where the result shows", () => {
  for (const status of ["open", "done"] as const) {
    const html = renderInboxWorkbench({ route_prefix: "", entries: [entry(status)], filter: "active" as never,
      primitives: { escape, icon: () => "", text: value => value, formatDate: value => value } });
    const button = /<button[^>]*data-make-todo="inbox"[^>]*>/u.exec(html)?.[0] ?? "";
    assert.ok(button, status);
    assert.match(button, /data-make-todo-id="entry-1"/u);
    assert.match(button, /data-make-todo-subject="inbox_entry"/u);
    assert.match(button, /data-make-todo-surface="inbox"/u);
    assert.match(button, /data-make-todo-title="回复&quot;供应商&quot;报价"/u, "标题转义后放进属性");
    assert.match(button, /data-make-todo-reason="你从 Inbox 转为待办"/u);
    assert.match(html, /data-inbox-detail="entry-1"[^>]*data-make-todo-scope/u);
    assert.match(html, /data-inbox-action-status data-make-todo-status/u);
  }
});

test("灵光 offers 转为待办 from its editor; its client script parses (the button is filled from what is on screen)", () => {
  const html = renderLingguangWorkbench({ primitives: { escape, text: value => value } });
  assert.match(html, /data-make-todo-scope/u);
  assert.match(html, /<button[^>]*data-lingguang-todo data-make-todo="lingguang" data-make-todo-subject="spark" data-make-todo-surface="lingguang" data-make-todo-reason="你从灵光转为待办">转为待办<\/button>/u);
  assert.match(html, /data-lingguang-note data-make-todo-status/u);
  assert.doesNotThrow(() => new Function(`return (${LINGGUANG_CLIENT_FACTORY_SCRIPT});`));
});

test("a todo made from an Inbox entry or a 灵光 keeps it as its source; converting the same one again finds that todo; unknown kinds are refused", async t => {
  const home = mkdtempSync(join(tmpdir(), "todo-from-inbox-"));
  const store = openTodoStore(home);
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ withStore: run => run(store) }) });
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  const inA = bindActionClient(service, () => ({ actor_id: "web-user", project_id: "project-a", audience: "user", permissions: TODO_ACTION_PERMISSIONS }));
  const fromInbox = { title: "回复供应商报价", placement: "project" as const, request_id: "inbox:entry-1",
    sources: [{ kind: "inbox" as const, title: "回复供应商报价", reason: "你从 Inbox 转为待办", subject: { kind: "inbox_entry", id: "entry-1" }, open: { surface: "inbox", id: "entry-1" } }] };
  const first = await inA.invoke(todoActions.create, fromInbox);
  assert.equal(first.replayed, false);
  assert.deepEqual([first.item.project_id, first.item.sources[0]!.kind, first.item.sources[0]!.open], ["project-a", "inbox", { surface: "inbox", id: "entry-1" }]);
  const again = await inA.invoke(todoActions.create, fromInbox);
  assert.deepEqual([again.replayed, again.item.id], [true, first.item.id], "同一条再转一次找到原来的待办");
  const spark = await inA.invoke(todoActions.create, { title: "给新人写一页入门", placement: "project", request_id: "lingguang:spark-1",
    sources: [{ kind: "lingguang", title: "给新人写一页入门", excerpt: "先列常见问题", reason: "你从灵光转为待办", subject: { kind: "spark", id: "spark-1" }, open: { surface: "lingguang", id: "spark-1" } }] });
  assert.equal(spark.item.sources[0]!.kind, "lingguang");
  await assert.rejects(inA.invoke(todoActions.create, { title: "x", sources: [{ kind: "mail" as never, title: "x" }] }));
  // Deleting it lets the entry be converted afresh.
  await inA.invoke(todoActions.remove, { id: first.item.id, expected_revision: first.item.revision });
  const afresh = await inA.invoke(todoActions.create, fromInbox);
  assert.equal(afresh.replayed, false);
  assert.notEqual(afresh.item.id, first.item.id);
});
