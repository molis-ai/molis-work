import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { frameUiLanguage } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pluginTextForOwner, type PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { pluginPagesFor, type ReadShownProjectPlugins } from "./plugin-page-authority.js";
import { isWebLocale, webLanguage } from "./web-locale.js";
import { refuseLocalWebRequest, requestHost, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import type { WebRequestContext } from "./web-route-table.js";
import { shellPageRead } from "./web-sessions.js";
import { projectTextPacks } from "./ui-text-provider.js";

/** The common web guard has already checked the page proof against its bound cookie and transport. */
export async function handlePageLocales({ request, response, url, serverOptions }: Pick<WebRequestContext, "request" | "response" | "url" | "serverOptions">,
  projectId: string | null, shown?: ReadShownProjectPlugins): Promise<void> {
  if (!shellPageRead(request, `http://${requestHost(request)}`)) { refuseLocalWebRequest(response); return; }
  if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "此入口只读取界面语言包" }); return; }
  const locale = url.searchParams.get("locale"), ids = [...new Set(url.searchParams.getAll("page"))];
  // A protected home response's word grants (surface-composition §14.6) are read beside the pages, in the same one batch and limit.
  const texts = [...new Set(url.searchParams.getAll("surface_text"))];
  if (!isWebLocale(locale) || url.searchParams.getAll("locale").length !== 1 || !ids.length && !texts.length || ids.length + texts.length > 256
    || [...ids, ...texts].some(id => !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/u.test(id))
    || [...url.searchParams.keys()].some(key => key !== "locale" && key !== "page" && key !== "surface_text")) {
    sendLocalWebJson(response, 400, { error: "请选择语言与当前页面的挂载" }); return;
  }
  const abort = new AbortController();
  const closed = () => { if (!response.writableFinished) abort.abort(new ActionError("actions.cancelled", "页面已关闭")); };
  response.once("close", closed);
  try {
    const home = serverOptions.homeDirectory;
    if (!home) throw new ActionError("actions.unavailable", "界面语言包需要当前 Home");
    await pluginPagesFor(home).withPageText(request, ids, projectId, abort.signal, (sources, granted) => {
      serverOptions.assertAccountCurrent?.();
      const common = pluginTextForOwner("workbench");
      if (!common) throw new ActionError("actions.unavailable", "共有界面语言包不可用，请重试");
      const owners = new Map<PluginTextReader | PluginManifest, { owner: string; pages: string[]; embedded: string[]; packs: UiLocalePack[] }>();
      for (const { id, manifest, reader, embedded } of sources) {
        if (manifest.ui.locales && !reader) throw new ActionError("actions.unavailable", "插件语言包不可用，请重新打开");
        const identity = reader ?? manifest;
        let existing = owners.get(identity);
        if (!existing) {
          existing = { owner: manifest.plugin_id, pages: [], embedded: [], packs: reader ? projectTextPacks(reader, locale, manifest.ui.locales?.available.includes(locale) === true) : [] };
          owners.set(identity, existing);
        }
        (embedded ? existing.embedded : existing.pages).push(id);
      }
      // Only the keys the response showed, from that one source: two sources of one owner never lend each other words.
      const surface = granted.map(({ id, manifest, reader, keys }) => {
        if (!reader) throw new ActionError("actions.unavailable", "插件语言包不可用，请重新打开");
        const packs = projectTextPacks(reader, locale, manifest.ui.locales?.available.includes(locale) === true)
          .map(pack => ({ ...pack, messages: Object.fromEntries(Object.entries(pack.messages).filter(([key]) => keys.has(key))) }));
        return { ref: id, owner: manifest.plugin_id, packs };
      });
      sendLocalWebJson(response, 200, { language: frameUiLanguage(webLanguage(locale)!), shared: projectTextPacks(common, locale, true, true), owners: [...owners.values()],
        ...(texts.length ? { texts: surface } : {}) });
    }, shown, texts);
  } catch (error) {
    if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  } finally { response.off("close", closed); }
}
