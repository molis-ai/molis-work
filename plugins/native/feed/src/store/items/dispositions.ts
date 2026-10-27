import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import type { AttentionStatus } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FeedItemDisposition, FeedItemRecord } from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedRecords } from "./records.js";
import type { FeedAttentionPort } from "./types.js";

/** What happens to an item after it is in the Feed: its disposition, read mark, Goal link, and removal with its source. */
export class FeedDispositions {
  constructor(private readonly records: FeedRecords, private readonly attention: FeedAttentionPort) {}

  setDisposition(
    projectId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord {
    return this.records.db.transaction(() => {
      const current = this.records.get(projectId, itemId);
      if (expectedRevision != null && expectedRevision !== current.revision) {
        throw feedErrors.revision_conflict("这条 Item 已经变化，请刷新后重试");
      }
      if (current.disposition === disposition) {
        if (disposition === "inbox") this.openManualAttention(projectId, itemId);
        return this.records.get(projectId, itemId);
      }
      // An ignored item is brought back by restore, never by admitting it to the Inbox or by another disposition.
      if (current.disposition === "archived") {
        throw feedErrors.invalid_transition("请先恢复这条已忽略的 Feed Item");
      }
      if (disposition === "inbox") {
        this.openManualAttention(projectId, itemId);
        return this.records.get(projectId, itemId);
      }
      const at = this.records.now().toISOString();
      this.records.db.run(`
        UPDATE feed_items
        SET disposition = ?, revision = revision + 1, updated_at = ?
        WHERE project_id = ? AND item_id = ?
      `, disposition, at, projectId, itemId);
      settleActiveAttention(this.attention, projectId, itemId, disposition === "processing"
        ? "in_progress"
        : disposition === "archived"
          ? "dismissed"
          : "done");
      this.records.appendEvent(
        projectId,
        itemId,
        `feed_item.${disposition}`,
        `feed_item.${disposition}`,
        `Feed Item 已标记为 ${disposition}`,
        {},
        at,
      );
      return this.records.get(projectId, itemId);
    });
  }

  restore(projectId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    return this.records.db.transaction(() => {
      const current = this.records.get(projectId, itemId);
      if (expectedRevision != null && expectedRevision !== current.revision) {
        throw feedErrors.revision_conflict("这条 Item 已经变化，请刷新后重试");
      }
      if (current.disposition !== "archived") return current;
      const at = this.records.now().toISOString();
      this.records.db.run(`
        UPDATE feed_items
        SET disposition = 'inbox', revision = revision + 1, updated_at = ?
        WHERE project_id = ? AND item_id = ?
      `, at, projectId, itemId);
      settleActiveAttention(this.attention, projectId, itemId, "dismissed");
      this.records.appendEvent(
        projectId,
        itemId,
        "feed_item.restored",
        "feed_item.restored",
        "用户把 Feed Item 恢复为仅保留在 Feed",
        {},
        at,
      );
      return this.records.get(projectId, itemId);
    });
  }

  markRead(projectId: string, itemId: string): FeedItemRecord {
    return this.records.db.transaction(() => {
      const current = this.records.get(projectId, itemId);
      if (current.read_at) return current;
      const at = this.records.now().toISOString();
      this.records.db.run(`
        UPDATE feed_items SET read_at = ?, updated_at = ?
        WHERE project_id = ? AND item_id = ?
      `, at, at, projectId, itemId);
      this.records.appendEvent(
        projectId,
        itemId,
        "feed_item.read",
        "feed_item.read",
        "用户打开 Feed Item 详情",
        {},
        at,
      );
      return this.records.get(projectId, itemId);
    });
  }

  linkGoal(
    projectId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord {
    return this.records.db.transaction(() => {
      const current = this.records.get(projectId, itemId);
      if (current.disposition === "archived") {
        throw feedErrors.invalid_transition("请先恢复这条已忽略的 Feed Item");
      }
      if (current.linked_goal_id === goalId && current.disposition === disposition) return current;
      const at = this.records.now().toISOString();
      this.records.goalLinks.set(projectId, itemId, goalId, at);
      this.records.db.run(`
        UPDATE feed_items
        SET disposition = ?, revision = revision + 1, updated_at = ?
        WHERE project_id = ? AND item_id = ?
      `, disposition, at, projectId, itemId);
      settleActiveAttention(this.attention, projectId, itemId, disposition === "processing" ? "in_progress" : "done");
      this.records.appendEvent(
        projectId,
        itemId,
        disposition === "processing" ? "feed_item.processing" : "feed_item.promoted",
        disposition === "processing" ? "feed_item.processing_started" : "feed_item.promoted",
        disposition === "processing" ? "用户从 Feed Item 开始处理" : "用户把 Feed Item 升格为 Goal",
        { goal_id: goalId },
        at,
      );
      return this.records.get(projectId, itemId);
    });
  }

  deleteBySource(projectId: string, sourceId: string): string[] {
    const { db } = this.records;
    const itemIds = (db.all("SELECT item_id FROM feed_items WHERE project_id = ? AND source_id = ? ORDER BY item_id", projectId, sourceId) as Array<{ item_id: string }>).map((row) => row.item_id);
    if (itemIds.length === 0) return [];
    return db.transaction(() => {
      const at = this.records.now().toISOString();
      for (const itemId of itemIds) {
        this.records.goalLinks.remove(projectId, itemId);
        this.attention.commands.deleteSubject(projectId, "feed_item", itemId);
      }
      db.run("DELETE FROM feed_items WHERE project_id = ? AND source_id = ?", projectId, sourceId);
      for (const itemId of itemIds) {
        this.records.appendEvent(
          projectId,
          itemId,
          "feed_item.deleted",
          "feed_item.deleted",
          "来源本地历史已删除",
          { source_id: sourceId },
          at,
        );
      }
      return itemIds;
    });
  }

  private openManualAttention(projectId: string, itemId: string): void {
    const stored = this.attention.commands.ensureFeedItem(
      projectId,
      itemId,
      "manual",
      { added_by: "web_user" },
    );
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.attention.commands.setStatus(projectId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }
}

/**
 * An item can be in the Inbox for more than one reason at once (the person added it, a capture rule admitted it,
 * a capture-out failure). What happens to the item happens to all of those entries, in the item's transaction.
 */
function settleActiveAttention(attention: FeedAttentionPort, projectId: string, itemId: string, status: AttentionStatus): void {
  for (const entry of attention.query.findForSubject(projectId, "feed_item", itemId)) {
    if (entry.status === "open" || entry.status === "in_progress") {
      attention.commands.setStatus(projectId, entry.entry_id, status, entry.revision);
    }
  }
}
