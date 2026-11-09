/**
 * Feed's page words under stable keys (`feed.<area>.<name>`), Chinese and English side by side; the Manifest lists them as its
 * `ui.messages`, so the common translator serves them to the rendered page and the browser client alike. Words that read the
 * same in Chinese but differently in English (收起 on an alert and on a fold) live here; the rest are still `FEED_EN`.
 */
export const FEED_MESSAGES = {
  "feed.presentation.empty": { zh: "还没有收到资料", en: "No materials yet" },
  "feed.presentation.summary": { zh: "近期收到的资料和来源状态", en: "Recent materials and source status" },
  "feed.presentation.note": { zh: "同步来的资料不算你接下的工作。", en: "Synced material does not count as work you took on." },
  "feed.rule.dismiss": { zh: "收起", en: "Dismiss" },
  "feed.rule.show-less": { zh: "收起", en: "Show less" },
} as const;
