import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { pluginTextForOwner, type PluginTextReader } from "@molis-ai/molis-work-app-workbench";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { isWebLocale } from "./web-locale.js";
import { refuseLocalWebRequest, requestHost, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";
import { WEB_PAGE_SESSION_HEADER, webPageToken } from "./web-sessions.js";

/** Send the requested words and only the default words that are needed to fill gaps. Each pack keeps its own grammar. */
function projectPacks(reader: PluginTextReader, locale: string, declared: boolean, sharedOnly = false): UiLocalePack[] {
  const requested = reader.pack(locale), baseline = locale === reader.default ? requested : reader.pack(reader.default);
  if (!baseline || (declared && !requested)) throw new ActionError("actions.unavailable", "界面语言包不可用，请重试");
  const messages = (pack: UiLocalePack, excluding?: UiLocalePack) => Object.fromEntries(Object.entries(pack.messages)
    .filter(([key]) => (!sharedOnly || key.startsWith("common.")) && (!excluding || !Object.hasOwn(excluding.messages, key))));
  if (!requested || baseline === requested) return [{ ...baseline, messages: messages(baseline) }];
  const fallback = messages(baseline, requested);
  return [...(Object.keys(fallback).length ? [{ ...baseline, messages: fallback }] : []), { ...requested, messages: messages(requested) }];
}

/** The common web guard has already checked the page proof against its bound cookie and transport. */
export async function handlePageLocales({ request, response, url, serverOptions }: WebRequestContext, projectId: string | null): Promise<void> {
  const proof = webPageToken(request);
  if (!proof || request.headers[WEB_PAGE_SESSION_HEADER] !== proof || request.headers["x-molis-plugin-page"] !== undefined
    || request.headers["x-molis-context-page"] !== undefined
    || (request.headers.origin !== undefined && request.headers.origin !== `http://${requestHost(request)}`)
    || (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "same-origin")) {
    refuseLocalWebRequest(response); return;
  }
  if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "此入口只读取界面语言包" }); return; }
  const locale = url.searchParams.get("locale"), ids = [...new Set(url.searchParams.getAll("page"))];
  if (!isWebLocale(locale) || url.searchParams.getAll("locale").length !== 1 || !ids.length || ids.length > 256
    || ids.some(id => !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(id))
    || [...url.searchParams.keys()].some(key => key !== "locale" && key !== "page")) {
    sendLocalWebJson(response, 400, { error: "请选择语言与当前页面的挂载" }); return;
  }
  const abort = new AbortController();
  const closed = () => { if (!response.writableFinished) abort.abort(new ActionError("actions.cancelled", "页面已关闭")); };
  response.once("close", closed);
  try {
    const home = serverOptions.homeDirectory;
    if (!home) throw new ActionError("actions.unavailable", "界面语言包需要当前 Home");
    await pluginPagesFor(home).withPageText(request, ids, projectId, abort.signal, sources => {
      serverOptions.assertAccountCurrent?.();
      const common = pluginTextForOwner("workbench");
      if (!common) throw new ActionError("actions.unavailable", "共有界面语言包不可用，请重试");
      const owners = new Map<PluginTextReader | PluginManifest, { owner: string; pages: string[]; packs: UiLocalePack[] }>();
      for (const { id, manifest, reader } of sources) {
        if (manifest.ui.locales && !reader) throw new ActionError("actions.unavailable", "插件语言包不可用，请重新打开");
        const identity = reader ?? manifest;
        let existing = owners.get(identity);
        if (!existing) {
          existing = { owner: manifest.plugin_id, pages: [], packs: reader ? projectPacks(reader, locale, manifest.ui.locales?.available.includes(locale) === true) : [] };
          owners.set(identity, existing);
        }
        existing.pages.push(id);
      }
      sendLocalWebJson(response, 200, { locale, shared: projectPacks(common, locale, true, true), owners: [...owners.values()] });
    });
  } catch (error) {
    if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  } finally { response.off("close", closed); }
}
