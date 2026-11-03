/**
 * The words of the change reader and a child's integration preview, which Coding draws with the SDK's comparison
 * (change-html.ts) and words through `codingText` (words.ts): a part of `CODING_MESSAGES`, which spreads it. They say what
 * Diff's say for the same comparison, so a change reads the same wherever it is drawn.
 */
export const CODING_CHANGE_MESSAGES = {
  "coding.change.reader.mismatch": { zh: "两侧来自不同的工作目录", en: "The two sides come from different working folders" },
  "coding.change.reader.partial": { zh: "这里只有改动的片段，不是整份文件", en: "Only the changed parts are here, not the whole file" },
  "coding.change.reader.coarse": { zh: "差异太大，只能整体列出删除和新增", en: "Too different to line up: listed as removed and added in full" },
  "coding.change.reader.created": { zh: "这个文件是新建的", en: "This file is new" },
  "coding.change.reader.removed": { zh: "这个文件被删除了", en: "This file was deleted" },
  "coding.change.reader.identical": { zh: "两侧完全相同", en: "Both sides are the same" },
  "coding.change.reader.comment-before": { zh: "评论修改前第 {number} 行", en: "Comment on line {number} before the change" },
  "coding.change.reader.comment-after": { zh: "评论修改后第 {number} 行", en: "Comment on line {number} after the change" },
  "coding.change.reader.insert": { zh: "新增", en: "Added" },
  "coding.change.reader.delete": { zh: "删除", en: "Removed" },
  "coding.change.reader.same": { zh: "未改变", en: "Unchanged" },
  "coding.change.reader.reveal": { zh: "展开 {count} 行未改变", en: "Show {count} unchanged lines" },
  "coding.change.reader.no-text-review": { zh: "这一轮没有可读取的文本审查；命令及外部操作请查看原回执", en: "This round has no text review to read. See the original receipt for commands and outside actions." },
  "coding.change.reader.no-files": { zh: "这一轮没有改动任何文件", en: "This round didn't change any files" },
  "coding.change.reader.unreadable-diff": { zh: "读不了这一轮的 diff", en: "Couldn't read this round's diff" },
  "coding.change.reader.run-again": { zh: "让 Coding 再跑一轮", en: "Have Coding run another round" },
  // Sentences written in Chinese where the fact was found, said again with their values (`diffViewText`): the reader's own, and
  // the three the SDK's `parseUnifiedDiff` refuses a round's diff with.
  "coding.change.reader.no-change-in": { zh: "这一轮没有改动 {path}", en: "This round didn't change {path}" },
  "coding.change.reader.hunk-count": { zh: "hunk 行数与 @@ 头不一致：声明 {declaredBefore}/{declaredAfter}，实际 {sawBefore}/{sawAfter}", en: "A hunk's line counts don't match its @@ header: declared {declaredBefore}/{declaredAfter}, found {sawBefore}/{sawAfter}" },
  "coding.change.reader.hunk-header": { zh: "读不懂的 hunk 头：{header}", en: "Can't read this hunk header: {header}" },
  "coding.change.reader.no-hunks": { zh: "这段 diff 里没有可读的 hunk", en: "There is no readable hunk in this diff" },
} as const;
