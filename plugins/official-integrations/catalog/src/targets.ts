import { oauthTenantSiteOrigin } from "@molis-ai/molis-work-plugin-sdk/oauth";
import { CatalogLiveError } from "./http.js";
import type { CatalogAuthContext } from "./types.js";

/** Cloud origins only: no URL-normalized paths, credentials, ports or look-alike suffixes. */
export function catalogCloudOrigin(raw: string, domain: "atlassian.net" | "salesforce.com"): string {
  const origin = oauthTenantSiteOrigin(domain, raw);
  if (!origin) throw new CatalogLiveError("configuration", undefined, "请检查连接配置");
  return origin;
}

export function atlassianBase(ctx: CatalogAuthContext, service: "jira" | "confluence"): string {
  const site = catalogCloudOrigin(ctx.extra.site_url ?? ctx.extra.site ?? "", "atlassian.net");
  if (!ctx.extra.base) return site;
  if (ctx.extra.auth_method !== "oauth" || !/^[a-zA-Z0-9-]{1,128}$/u.test(ctx.extra.cloud_id ?? "")
    || ctx.extra.base !== `https://api.atlassian.com/ex/${service}/${ctx.extra.cloud_id}`) {
    throw new CatalogLiveError("configuration", undefined, "请检查连接配置");
  }
  return ctx.extra.base;
}
