/**
 * Feed's page words under stable keys (`feed.<area>.<name>`), Chinese and English side by side; the Manifest lists them as its
 * `ui.messages`, so the common translator serves them to the rendered page and the browser client alike. Words that read the
 * same in Chinese but differently in English (收起 on an alert and on a fold) live here; the rest are still `FEED_EN`.
 */
export const FEED_MESSAGES = {
  "feed.rule.dismiss": { zh: "收起", en: "Dismiss" },
  "feed.rule.show-less": { zh: "收起", en: "Show less" },
} as const;
