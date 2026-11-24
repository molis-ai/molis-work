import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameScope } from "../plugin-frame/types.js";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The page of a signed package installed in a project or the Home (47-1: the platform's, not the studio's). The package's declared
 * view is drawn by the shared component renderer; every call goes to the package's own sandboxed process through the Host's route
 * (`call`), and a submit goes through the page's own action entrance. Served as `/assets/molis-work-plugins/installed-plugin.js`
 * after the component renderer (`installed-plugin/client-asset.ts`), and mounted in the package's opaque frame.
 */
interface InstalledPage { readonly mode: "installed"; readonly plugin_id: string; readonly call: string; readonly view: unknown }
interface RenderedPlugin {
  update(view: unknown): Promise<void>;
  destroy(): void;
  openInput(panel: string): boolean;
  openRecord(itemId: string): Promise<boolean>;
}
type SurfaceSlot = UiPluginClientHost["view"]["surfaceSlot"];
type ComponentFactory = (input: { root: HTMLElement; call: (componentId: string, binding: string, payload: unknown) => Promise<unknown>; connectionNeed: UiPluginClientHost<HTMLElement>["connectionNeed"]; mountSurfaceSlot?: SurfaceSlot }) => RenderedPlugin;
type FrameHost = UiPluginClientHost<HTMLElement, HTMLDialogElement, HTMLImageElement | HTMLIFrameElement> & {
  readonly mountPluginClient: (root: HTMLElement) => FrameScope | null;
  readonly route: (path: string) => string;
  readonly page: () => InstalledPage | undefined;
};

declare global {
  /** The shared component renderer, set by the line the Host serves ahead of this program. */
  var molisInstalledPluginComponents: ComponentFactory | undefined;
  var __molisPluginPending: number | undefined;
  var __molisPluginReady: boolean | undefined;
}

globalThis.molisWorkbenchPluginFactories ||= {};
globalThis.molisWorkbenchPluginFactories["installed-plugin"] = (base) => {
  const host = base as FrameHost, page = host.page(), components = globalThis.molisInstalledPluginComponents;
  const root = host.root.matches("[data-installed-plugin]") ? host.root : host.root.querySelector<HTMLElement>("[data-installed-plugin]");
  if (!root || page?.mode !== "installed" || !components) return;
  const lifetime = host.mountPluginClient(root);
  if (!lifetime) return;
  if (parent !== window) root.dataset.framed = "";
  let pending = 0;
  globalThis.__molisPluginPending = 0;
  const request = async (url: string, body: unknown) => {
    const response = await lifetime.fetch(url, { method: "POST", cache: "no-store", headers: globalThis.molisWorkControlHeaders?.() ?? { "content-type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json().catch(() => ({})) as { error?: string; code?: string; value?: unknown };
    lifetime.assertCurrent();
    if (!response.ok) throw Object.assign(new Error(value.error || uiText.text("common.generated.input-preserved")), { status: response.status, code: value.code });
    return value;
  };
  const call = async (componentId: string, binding: string, payload: unknown) => {
    globalThis.__molisPluginPending = ++pending;
    try {
      if (binding === "submit") return await request(host.route("/api/host/plugin-page-actions"), { mode: "component_submit", component_id: componentId, payload });
      return (await request(page.call, { componentId, binding, payload })).value;
    } finally {
      pending--;
      if (lifetime.alive) globalThis.__molisPluginPending = pending;
    }
  };
  const plugin = components({ root, call, connectionNeed: host.connectionNeed, mountSurfaceSlot: host.view?.surfaceSlot });
  lifetime.own(() => plugin.destroy());
  const ready = plugin.update(page.view).then(() => { if (lifetime.alive) globalThis.__molisPluginReady = true; })
    .catch((error: unknown) => { if (lifetime.alive) root.textContent = error instanceof Error ? error.message : String(error); });
  // The shell's 「打开」 of one of this package's records or forms (`molis-work:select-item`), after the view is drawn.
  lifetime.listen(host.root, "molis-work:select-item", event => {
    const { panel, itemId, intent } = (event as CustomEvent<{ panel?: unknown; itemId?: unknown; intent?: unknown }>).detail ?? {};
    if (intent !== "open") return;
    if (typeof panel === "string" || typeof itemId === "string") event.preventDefault();
    const unavailable = () => {
      if (!lifetime.alive) return;
      const note = document.createElement("p");
      note.dataset.pcOpenFailed = "";
      note.setAttribute("role", "alert");
      note.textContent = uiText.text("common.generated.record-or-form-unavailable");
      root.prepend(note);
    };
    void ready.then(async () => {
      if (!lifetime.alive) return;
      root.querySelector("[data-pc-open-failed]")?.remove();
      const opened = typeof panel === "string" ? plugin.openInput(panel) : typeof itemId === "string" ? await plugin.openRecord(itemId) : true;
      if (!opened) unavailable();
    }).catch(unavailable);
  });
};
