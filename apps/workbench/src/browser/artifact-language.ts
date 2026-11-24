import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

const failure = () => new Error(t.text("workbench.language.window-failed"));
const version = (root: ParentNode) => {
  const selected = root.querySelector<HTMLElement>("article[data-artifact-id][data-artifact-version]");
  return selected ? JSON.stringify([selected.dataset.artifactId, selected.dataset.artifactVersion]) : null;
};

function mountedArtifacts() {
  const base = (document.body.dataset.routePrefix ?? "") + "/artifacts";
  const shells: Array<{ path: string; language: string; directory: HTMLElement; detail: HTMLElement; current: () => boolean }> = [];
  for (const shell of document.querySelectorAll("[data-artifact-stage-shell]")) {
    const visible = () => shell.checkVisibility({ visibilityProperty: true }) === true;
    if (!visible()) continue;
    const directory = shell.querySelector<HTMLElement>("[data-artifact-directory]");
    const detail = shell.querySelector<HTMLElement>("[data-artifact-detail]");
    const path = detail?.dataset.artifactFragmentPath, language = detail?.dataset.artifactFragmentLanguage;
    if (!detail || !directory || !path || !language) continue;
    const address = new URL(path, location.origin);
    if (address.origin !== location.origin || address.pathname !== path || (path !== base && !path.startsWith(base + "/"))) throw failure();
    const directoryBody = directory.firstElementChild, detailBody = detail.firstElementChild;
    const current = () => visible() && directory.isConnected && detail.isConnected && detail.dataset.artifactFragmentPath === path
      && detail.dataset.artifactFragmentLanguage === language && directory.firstElementChild === directoryBody && detail.firstElementChild === detailBody;
    shells.push({ path, language, directory, detail, current });
  }
  return shells;
}

/** Read both languages of every visible retained selection through the same trusted HTML route. */
export async function prepareArtifactLanguage(request: UiRequest, target: string, signal: AbortSignal) {
  const mounted = mountedArtifacts().filter(item => item.language !== target);
  if (!mounted.length) return undefined;
  const cache = new Map<string, Promise<{ list: Element; shown: HTMLElement }>>();
  const read = (path: string, tag: string, selected: string | null) => {
    const key = `${tag}\0${path}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const task = (async () => {
      const reply = await request<Response>(path, { as: "response", control: true, signal, headers: {
        "x-molis-work-fragment": "artifact-workbench", "x-molis-work-ui-locale": tag, accept: "text/html",
      } });
      if ((!reply.ok && reply.status !== 404) || reply.redirected || !reply.headers.get("content-type")?.startsWith("text/html")) throw failure();
      const page = new DOMParser().parseFromString(await reply.text(), "text/html");
      const list = page.body.querySelector(":scope > [data-artifact-directory]");
      const shown = page.body.querySelector<HTMLElement>(":scope > [data-artifact-detail]");
      if (!list || shown?.dataset.artifactFragmentLanguage !== tag || version(shown) !== selected) throw failure();
      return { list, shown };
    })();
    cache.set(key, task);
    return task;
  };
  const prepared = await Promise.all(mounted.map(async item => {
    const selected = version(item.detail);
    const [old, next] = await Promise.all([read(item.path, item.language, selected), read(item.path, target, selected)]);
    return {
      item,
      regions: [{ root: item.directory, old: old.list, next: next.list }, { root: item.detail, old: old.shown, next: next.shown }],
    };
  }));
  const regions = prepared.flatMap(entry => entry.regions);
  const current = () => prepared.every(entry => entry.item.current());
  const applied = () => { for (const entry of prepared) entry.item.detail.dataset.artifactFragmentLanguage = target; };
  return { current, regions, applied };
}

/** A covered or late selection uses the same reads when its existing surface is shown again. */
export function watchArtifactLanguage(request: () => UiRequest, language: () => string, failed: () => void) {
  let pending: AbortController | undefined;
  const cancel = () => pending?.abort();
  const sync = () => {
    cancel();
    const controller = pending = new AbortController(), target = language();
    void prepareArtifactLanguage(request(), target, controller.signal).then(loaded => {
      if (!loaded?.current() || controller.signal.aborted || language() !== target) return;
      for (const { root, old, next } of loaded.regions) globalThis.molisWorkRetitleRegion?.(root, old.innerHTML, next.innerHTML);
      loaded.applied();
    }).catch(() => { if (!controller.signal.aborted) failed(); });
  };
  document.addEventListener("molis-work:select-item", (event: Event) => {
    if (event.target instanceof Element && event.target.matches("[data-artifact-stage-shell]")
      && !(event as CustomEvent<{ invalidate?: boolean }>).detail?.invalidate) queueMicrotask(sync);
  }, true);
  return { cancel, sync };
}
