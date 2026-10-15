import { SearchError, type SearchErrorCode } from "@adeptify/search-evidence-layer";

export function rssError(code: SearchErrorCode): SearchError {
  return new SearchError({ code, retryable: false, sideEffectState: "none", recoveryAction: "none", safeContext: { providerId: "rss" } });
}

export function rssEnvironmentProxyError(): SearchError {
  const error = rssError("provider_not_configured");
  error.message = "自定义 RSS 暂不支持已启用的环境代理：无法在该路径固定已检查地址；请使用直连或透明代理。";
  return error;
}
