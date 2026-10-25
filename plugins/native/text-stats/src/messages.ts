export const TEXT_STATS_MESSAGES = {
  "text-stats.empty.waiting-detail": { zh: "统计 Files 中固定为对比前的文本快照。重新固定后更新，磁盘变化不会改写已保存的内容。", en: "Counts the text snapshot pinned as before in Files. Pin again to update; changes on disk don't rewrite what was saved." },
  "text-stats.count.characters": { zh: "字符", en: "Characters" },
  "text-stats.count.bytes": { zh: "UTF-8 字节", en: "UTF-8 bytes" },
  "text-stats.count.lines": { zh: "行", en: "Lines" },
  // The view's and the actions' own sentences are action output an Agent reads too, so they stay as written and are their
  // own keys here: the page shows them through the translator.
  "固定一份文件快照后，这里会显示该版本的文本统计": { zh: "固定一份文件快照后，这里会显示该版本的文本统计", en: "Pin a file snapshot and its text stats show here" },
  "捕获的快照已经不在了": { zh: "捕获的快照已经不在了", en: "The pinned snapshot is gone" },
  "重新捕获一次，或者在 Sources 里换一个输入": { zh: "重新捕获一次，或者在 Sources 里换一个输入", en: "Pin it again, or choose another input in Sources" },
  "text-stats.stage.refresh": { zh: "刷新", en: "Refresh" },
  "text-stats.stage.open-files": { zh: "打开 Files", en: "Open Files" },
  "text-stats.stage.reading": { zh: "正在读取固定内容…", en: "Reading the pinned versions…" },
  "text-stats.stage.retry": { zh: "。请点击刷新重试。", en: ". Select Refresh to try again." },
  "text-stats.error.unreadable": { zh: "无法读取文件工作区", en: "Couldn't read the file workspace" },
  "text-stats.stage.add-files": { zh: "到插件市场添加 Files", en: "Add Files from the plugin market" },
} as const;
