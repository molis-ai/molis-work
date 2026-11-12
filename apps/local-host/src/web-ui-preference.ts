import type { IncomingMessage, ServerResponse } from "node:http";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { isWebLocale, localePreference, localeSetCookie, resolveWebLocaleChoice, type WebLocale } from "./web-locale.js";
import { readLocalWebBody, refuseLocalWebRequest, requestHost, sendLocalWebJson } from "./web-http.js";
import { captureWebSessionAuthority, UI_LANGUAGE_PREVIEW_HEADER, WEB_PAGE_SESSION_HEADER, webRequestAuthenticated } from "./web-sessions.js";

export { UI_LANGUAGE_PREVIEW_HEADER } from "./web-sessions.js";

function shell(request: IncomingMessage, control: string): boolean {
  const { headers } = request;
  return typeof headers[WEB_PAGE_SESSION_HEADER] === "string" && webRequestAuthenticated(request, control)
    && headers["x-molis-plugin-page"] === undefined && headers["x-molis-context-page"] === undefined
    && (headers["sec-fetch-site"] === undefined || headers["sec-fetch-site"] === "same-origin")
    && (headers.origin === undefined || headers.origin === `http://${requestHost(request)}`);
}

export function languagePreview(request: IncomingMessage, response: ServerResponse, url: URL, control: string): WebLocale | null | false {
  const value = request.headers[UI_LANGUAGE_PREVIEW_HEADER];
  if (value === undefined) return null;
  const page = !/^(?:\/(?:api|assets|im|account|locale|health)(?:\/|$)|\/projects\/[^/]+\/api(?:\/|$))/u.test(url.pathname);
  if (request.method !== "GET" || !page || !isWebLocale(value) || !shell(request, control)) {
    refuseLocalWebRequest(response); return false;
  }
  return value;
}

export function requestLanguage(request: IncomingMessage, url: URL, preview: WebLocale | null) {
  const capsule = request.method === "GET" && (url.pathname === "/desktop/capsule" || /^\/projects\/[^/]+\/api\/capsule$/u.test(url.pathname))
    ? url.searchParams.get("locale") : null;
  const selected = preview ?? capsule;
  return isWebLocale(selected) ? { tag: selected, source: "explicit" as const }
    : resolveWebLocaleChoice(request.headers.cookie, request.headers["accept-language"]);
}

/** The same outer document that reads the settings can commit its own choice; the common API guard also checks Origin and the one-time key. */
export async function handleLanguagePreference(request: IncomingMessage, response: ServerResponse, url: URL, control: string,
  remember: (locale: WebLocale) => void, assertCurrent?: () => void): Promise<boolean> {
  if (url.pathname !== "/api/ui/locale") return false;
  if (!shell(request, control)) { refuseLocalWebRequest(response); return true; }
  const cookie = request.headers.cookie, accept = request.headers["accept-language"];
  if (request.method === "GET") {
    assertCurrent?.();
    sendLocalWebJson(response, 200, { preference: localePreference(cookie), ...resolveWebLocaleChoice(cookie, accept) });
    return true;
  }
  if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: t.text("workbench.language.method") }); return true; }
  const sessionCurrent = captureWebSessionAuthority();
  const body = await readLocalWebBody(request), preference = body.preference;
  if (Object.keys(body).length !== 1 || preference !== "system" && !isWebLocale(preference)) {
    sendLocalWebJson(response, 400, { error: t.text("workbench.language.choose") }); return true;
  }
  const chosen = preference === "system" ? resolveWebLocaleChoice(null, accept) : { tag: preference, source: "explicit" };
  if (!shell(request, control) || response.destroyed) { refuseLocalWebRequest(response); return true; }
  sessionCurrent();
  assertCurrent?.();
  remember(chosen.tag);
  response.appendHeader("Set-Cookie", localeSetCookie(preference));
  sendLocalWebJson(response, 200, { preference, ...chosen });
  return true;
}
