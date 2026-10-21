/**
 * Pure classification of HTTP feed bodies before/instead of RSS parse.
 * Distinguishes real empty feeds from WAF/HTML challenges that return 200.
 */

export type FeedBodyClass =
  | "rss_xml"
  | "html_waf_challenge"
  | "html_other"
  | "empty"
  | "unknown";

export interface FeedBodyClassification {
  class: FeedBodyClass;
  /** Safe machine code for lastErrorCode / SearchError.code */
  errorCode?: string;
  /** Short Chinese reason for operators / UI (no secrets). */
  reason: string;
}
/**
 * Classify a response body (+ optional Content-Type).
 * Does not throw; pure and deterministic.
 */
export function classifyFeedBody(
  body: string,
  contentType?: string | null,
): FeedBodyClassification {
  const trimmed = body.trim();
  if (!trimmed) {
    return {
      class: "empty",
      errorCode: "feed_empty_body",
      reason: "源站返回了空正文，不是「没有新文章」的成功同步。",
    };
  }

  const ct = (contentType ?? "").toLowerCase();
  const head = trimmed.slice(0, 800).toLowerCase();
  const looksXml =
    head.startsWith("<?xml") ||
    head.includes("<rss") ||
    head.includes("<feed") ||
    /application\/(rss|atom)\+xml|text\/xml|application\/xml/u.test(ct);

  if (looksXml && !head.includes("<!doctype html") && !head.includes("<html")) {
    return {
      class: "rss_xml",
      reason: "正文看起来是 RSS/Atom XML。",
    };
  }

  const looksHtml =
    head.includes("<!doctype html") ||
    head.includes("<html") ||
    ct.includes("text/html");

  if (looksHtml) {
    const waf =
      /captcha|challenge|waf|security|verify|robot|access denied|ddos|火山|火山引擎|x-tt-system|geetest|cloudflare/iu.test(
        body.slice(0, 20_000),
      ) ||
      /x-tt-system-error|proxy-status/iu.test(ct);
    // Also scan common WAF markers in body (火山 appears in 36kr challenge page).
    const bodyWaf = /火山|challenge|captcha|waf|security.?check/iu.test(
      body.slice(0, 20_000),
    );
    if (waf || bodyWaf) {
      return {
        class: "html_waf_challenge",
        errorCode: "feed_blocked_html",
        reason:
          "源站返回了 HTML 风控/人机验证页（不是 RSS）。这不是「没有消息」，而是拉取被拦截；请换其他可公开订阅的 RSS 源。",
      };
    }
    return {
      class: "html_other",
      errorCode: "feed_not_rss",
      reason:
        "源站返回了 HTML 页面而非 RSS/Atom 订阅流。不是空成功；请检查 feed 地址是否仍有效。",
    };
  }

  return {
    class: "unknown",
    errorCode: "feed_parse_failed",
    reason: "无法识别为 RSS/Atom 正文；同步未成功导入内容。",
  };
}
