import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

const failure = () => new Error(t.text("workbench.language.window-failed"));
const version = (root: ParentNode) => {
  const selected = root.querySelector<HTMLElement>("article[data-artifact-id][data-artifact-version]");
  return selected ? JSON.stringify([selected.dataset.artifactId, selected.dataset.artifactVersion]) : null;
};

function mountedArtifact() {
  const shell = document.querySelector("[data-artifact-stage-shell]");
  const visible = () => shell?.checkVisibility({ visibilityProperty: true }) === true;
  if (!visible()) return null;
  const directory = shell?.querySelector<HTMLElement>("[data-artifact-directory]");
  const detail = shell?.querySelector<HTMLElement>("[data-artifact-detail]");
  const path = detail?.dataset.artifactFragmentPath, language = detail?.dataset.artifactFragmentLanguage;
  if (!detail || !directory || !path || !language) return null;
  const address = new URL(path, location.origin), base = (document.body.dataset.routePrefix ?? "") + "/artifacts";
  if (address.origin !== location.origin || address.pathname !== path || (path !== base && !path.startsWith(base + "/"))) throw failure();
  const directoryBody = directory.firstElementChild, detailBody = detail.firstElementChild;
  const current = () => visible() && directory.isConnected && detail.isConnected && detail.dataset.artifactFragmentPath === path
    && detail.dataset.artifactFragmentLanguage === language && directory.firstElementChild === directoryBody && detail.firstElementChild === detailBody;
  return { path, language, directory, detail, current };
}

/** Read both languages of the retained selection through the same trusted HTML route. */
export async function prepareArtifactLanguage(request: UiRequest, target: string, signal: AbortSignal) {
  const mounted = mountedArtifact();
  if (!mounted || mounted.language === target) return undefined;
  const { path, language, directory, detail, current } = mounted, selected = version(detail);
  const read = async (tag: string) => {
    const reply = await request<Response>(path, { as: "response", control: true, signal, headers: {
      "x-molis-work-fragment": "artifact-workbench", "x-molis-work-ui-locale": tag, accept: "text/html",
    } });
    if ((!reply.ok && reply.status !== 404) || reply.redirected || !reply.headers.get("content-type")?.startsWith("text/html")) throw failure();
    const page = new DOMParser().parseFromString(await reply.text(), "text/html");
    const list = page.body.querySelector(":scope > [data-artifact-directory]");
    const shown = page.body.querySelector<HTMLElement>(":scope > [data-artifact-detail]");
    if (!list || shown?.dataset.artifactFragmentLanguage !== tag || version(shown) !== selected) throw failure();
    return { list, shown };
  };
  const [old, next] = await Promise.all([read(language), read(target)]);
  const regions = [{ root: directory, old: old.list, next: next.list }, { root: detail, old: old.shown, next: next.shown }];
  return { current, regions, applied: () => { detail.dataset.artifactFragmentLanguage = target; } };
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
