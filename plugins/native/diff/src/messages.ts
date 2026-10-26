export const DIFF_MESSAGES = {
  "diff.sides.before": { zh: "对比前：{path} · v{version}", en: "Before: {path} · v{version}" },
  "diff.sides.after": { zh: "对比后：{path} · v{version}", en: "After: {path} · v{version}" },
  "diff.sides.pinned": { zh: "{workspace} · 固定内容", en: "{workspace} · pinned" },
  "diff.notice.mismatch": { zh: "两侧来自不同的工作目录", en: "The two sides come from different working folders" },
  "diff.notice.partial": { zh: "这里只有改动的片段，不是整份文件", en: "Only the changed parts are here, not the whole file" },
  "diff.notice.coarse": { zh: "差异太大，只能整体列出删除和新增", en: "Too different to line up: listed as removed and added in full" },
  "diff.notice.created": { zh: "这个文件是新建的", en: "This file is new" },
  "diff.notice.removed": { zh: "这个文件被删除了", en: "This file was deleted" },
  "diff.notice.identical": { zh: "两侧完全相同", en: "Both sides are the same" },
  "diff.line.comment-before": { zh: "评论修改前第 {number} 行", en: "Comment on line {number} before the change" },
  "diff.line.comment-after": { zh: "评论修改后第 {number} 行", en: "Comment on line {number} after the change" },
  "diff.sign.insert": { zh: "新增", en: "Added" },
  "diff.sign.delete": { zh: "删除", en: "Removed" },
  "diff.sign.same": { zh: "未改变", en: "Unchanged" },
  "diff.fold.reveal": { zh: "展开 {count} 行未改变", en: "Show {count} unchanged lines" },
  "diff.board.files": { zh: "一轮的文件行 · 增删行数与长路径", en: "A round's file rows · lines added and removed, long paths" },
  // The view's and the actions' own sentences are action output an Agent reads too, so they stay as written and are their
  // own keys here: the page shows them through the translator.
  // Sentences with a path or a count in them are written in Chinese by the producer (an Agent reads them too), so each is a
  // template here (`DIFF_TEMPLATES`): the SDK's `diffViewText` finds which template a sentence is, and the page says it with the
  // values in its own words. The three about a hunk are the sentences the SDK's `parseUnifiedDiff` refuses with.
  "diff.msg.no-change-in": { zh: "这一轮没有改动 {path}", en: "This round didn't change {path}" },
  "diff.msg.renamed": { zh: "重命名：{from} → {to}", en: "Renamed: {from} → {to}" },
  "diff.msg.hunk-count": { zh: "hunk 行数与 @@ 头不一致：声明 {declaredBefore}/{declaredAfter}，实际 {sawBefore}/{sawAfter}", en: "A hunk's line counts don't match its @@ header: declared {declaredBefore}/{declaredAfter}, found {sawBefore}/{sawAfter}" },
  "diff.msg.hunk-header": { zh: "读不懂的 hunk 头：{header}", en: "Can't read this hunk header: {header}" },
  "diff.stage.refresh": { zh: "刷新", en: "Refresh" },
  "diff.stage.open-files": { zh: "打开 Files", en: "Open Files" },
  "diff.stage.reading": { zh: "正在读取固定内容…", en: "Reading the pinned versions…" },
  "diff.stage.retry": { zh: "。请点击刷新重试。", en: ". Select Refresh to try again." },
  "diff.error.unreadable": { zh: "无法读取文件工作区", en: "Couldn't read the file workspace" },
  "diff.stage.add-files": { zh: "到插件市场添加 Files", en: "Add Files from the plugin market" },
} as const;

/** The keys above that are sentences with values in them. */
export const DIFF_TEMPLATES: readonly string[] = ["diff.msg.no-change-in", "diff.msg.renamed", "diff.msg.hunk-count", "diff.msg.hunk-header"];
