import type { AccountEnvironmentConfig } from "@molis-ai/molis-work-contracts/services/account";
import { accountErrors } from "./errors.js";

export function accountProviderStartUrl(config: AccountEnvironmentConfig, method: string, input: unknown): string {
  const url = new URL(String(input));
  if (url.origin !== config.authOrigin || url.username || url.password || url.hash ||
      url.pathname !== `/api/v2/auth/external/${method.toLowerCase()}/browser-start` ||
      [...url.searchParams.keys()].join() !== "ticket" || !url.searchParams.get("ticket"))
    throw accountErrors.upstream_invalid("Invalid provider start URL");
  return url.href;
}
interface ProviderAttempt { id: string; state: string; purpose: string; method: string; nextStep: string }
export function assertAccountProviderCallback<T extends ProviderAttempt>(config: AccountEnvironmentConfig, url: URL, origin: string | undefined, attempt: T | undefined): asserts attempt is T {
  const params = url.searchParams;
  if (url.origin + url.pathname !== config.redirectAllowlist[0] || url.hash || url.username || url.password ||
      (origin !== undefined && origin !== config.authOrigin && origin !== config.productOrigin) ||
      [...params.keys()].sort().join() !== "result,state,transactionId" ||
      !["VERIFIED", "CANCELLED", "FAILED"].includes(params.get("result") ?? "") ||
      !attempt || attempt.id !== params.get("transactionId") || attempt.state !== params.get("state") ||
      !["LOGIN", "REAUTH", "BIND", "REPLACE"].includes(attempt.purpose) || !["GOOGLE", "GITHUB"].includes(attempt.method) || attempt.nextStep !== "WAIT_PROVIDER")
    throw accountErrors.forbidden("Invalid account callback");
}
