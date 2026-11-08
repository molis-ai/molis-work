import type { IncomingMessage, ServerResponse } from "node:http";
import { accountErrors } from "@molis-ai/molis-work-service-account";
import type { AccountHostBinding } from "./account-host.js";
import { requestHost } from "./web-http.js";

/** Navigation callback, after the loopback Host guard. State and the Host-held attempt replace page control proof here only. */
export async function handleAccountCallbackHttp(request: IncomingMessage, response: ServerResponse, url: URL, account: AccountHostBinding): Promise<boolean> {
  if (url.pathname !== "/account/callback") return false;
  if (request.method !== "GET" || request.headers.authorization || request.headers["x-auth-initiator-proof"] ||
      request.headers["transfer-encoding"] || Number(request.headers["content-length"] ?? 0) !== 0 ||
      (request.headers["sec-fetch-mode"] && request.headers["sec-fetch-mode"] !== "navigate") ||
      (request.headers["sec-fetch-dest"] && request.headers["sec-fetch-dest"] !== "document"))
    throw accountErrors.forbidden("Invalid account callback navigation");
  const origin = `http://${requestHost(request)}`, stop = new AbortController();
  const disconnected = () => { if (!response.writableEnded) stop.abort(); };
  response.once("close", disconnected);
  try {
    const result = await account.authenticate(origin, stop.signal, (auth, control) =>
      auth.callback(new URL(url.pathname + url.search, origin), request.headers.origin, control));
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'", "x-content-type-options": "nosniff" });
    response.end(`Molis Work\n\n${result.status === "COMPLETE" ? "验证完成" : "验证已取消"}\n请回到 Molis Work，可关闭此窗口。\n`);
  } finally { response.off("close", disconnected); }
  return true;
}
