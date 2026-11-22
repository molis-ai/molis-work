/** The blocks of a Goal frame: what each holds and how its body is read from the item's owner. */
import type { Route } from "./types.js";

/** What a row of the page or the frame-asset service offers for a frame. */
export interface FrameAsset {
  readonly kind: string;
  readonly id: string;
  readonly title: string;
  readonly caption: string;
  readonly itemRef?: string;
  readonly entryId?: string;
  readonly reading?: FrameReading | null;
  /** The owner view the service read the asset from; one with a source is resolved again before it is added. */
  readonly source?: unknown;
  /** A drag from another document carries only a handle the service resolves. */
  readonly handle?: string;
}
export interface FrameReading { readonly reason?: string; readonly relation?: string; readonly next?: string; readonly status?: string }

/** The workbench's frame-asset service (apps/workbench plugin-frame/frame-assets). */
export interface FrameAssetService {
  list(signal?: AbortSignal): Promise<FrameAsset[]>;
  resolve(asset: FrameAsset, signal?: AbortSignal): Promise<FrameAsset | undefined>;
  drag(value: unknown, signal?: AbortSignal): Promise<FrameAsset | undefined>;
}

/** A block on a Goal's frame, as it is saved. */
export interface FrameBlock {
  readonly id: string;
  readonly kind: string;
  readonly itemId: string;
  readonly itemRef?: string;
  readonly entryId?: string;
  readonly title: string;
  readonly caption?: string;
  readonly reading?: FrameReading | null;
  x: number;
  y: number;
}
export interface Camera { x: number; y: number; z: number }
/** A Goal's frame: where it is looked at from, its blocks and the one opened. */
export interface Frame { camera: Camera; blocks: FrameBlock[]; expanded: string }

export const kindLabel = (kind: string) => kind === "feed" ? "Feed" : kind === "inbox" ? "Inbox" : kind === "artifact" ? globalThis.t.text("goals.frame-container-client.result") : kind;

const liveAssetRow = (block: FrameBlock) => [...document.querySelectorAll<HTMLElement>("[data-frame-asset]")].find((row) => row.dataset.frameAsset === block.kind && row.dataset.frameAssetId === block.itemId);
const showBlockError = (body: HTMLElement, error: unknown) => {
  const status = document.createElement("p");
  status.className = "frame-block-status";
  molisWorkRequest.show(status, error, globalThis.t.text("goals.frame-container-client.could-not-open-item"));
  const retry = document.createElement("button");
  retry.type = "button";
  retry.dataset.frameBlockRetry = "";
  retry.textContent = globalThis.t.text("common.control.retry");
  body.replaceChildren(status, retry);
};
const readValue = (block: FrameBlock, row: HTMLElement | undefined, key: keyof FrameReading, attr: string) => block.reading?.[key] || row?.dataset[attr] || "";
const loadInboxBody = (body: HTMLElement, block: FrameBlock) => {
  const row = liveAssetRow(block);
  const article = document.createElement("article");
  article.className = "frame-reading";
  article.dataset.frameReading = "inbox";
  const reason = readValue(block, row, "reason", "frameReadingReason");
  const relation = readValue(block, row, "relation", "frameReadingRelation");
  const next = readValue(block, row, "next", "frameReadingNext");
  const status = readValue(block, row, "status", "frameReadingStatus");
  const copy = document.createElement("p");
  const parts: string[] = [];
  if (reason) parts.push(reason);
  if (relation) parts.push(globalThis.t.text("goals.frame-container-client.relates-relation", { relation }));
  if (next) parts.push(globalThis.t.text("goals.frame-container-client.next-next", { next }));
  if (status) parts.push(status);
  copy.textContent = parts.length ? parts.join("") : block.caption || "";
  if (copy.textContent) article.append(copy);
  body.replaceChildren(article);
};
const loadFeedBody = async (body: HTMLElement, block: FrameBlock, route: Route) => {
  const row = liveAssetRow(block);
  const itemId = block.itemRef || row?.dataset.feedItemId || (row?.dataset.inboxSubjectType === "feed" ? row.dataset.inboxSubjectId : "") || block.itemId;
  const html = await molisWorkRequest<string>(route("/api/stage/feed/objects/" + encodeURIComponent(itemId) + "?surface=frame-block"), { as: "text", fallback: globalThis.t.text("goals.frame-container-client.could-not-load-item") });
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  const reading = template.content.querySelector("[data-frame-reading]") || template.content.querySelector(".frame-reading") || template.content.firstElementChild;
  if (!reading) throw new Error(globalThis.t.text("goals.frame-container-client.could-not-load-item"));
  body.replaceChildren(reading);
};
const loadArtifactBody = async (body: HTMLElement, block: FrameBlock, route: Route) => {
  const sep = String(block.itemId).lastIndexOf("#");
  const artifactId = sep === -1 ? block.itemId : block.itemId.slice(0, sep);
  const version = sep === -1 ? "1" : block.itemId.slice(sep + 1);
  const html = await molisWorkRequest<string>(route("/artifacts/" + encodeURIComponent(artifactId) + "/versions/" + encodeURIComponent(version)), { as: "text", accept: [404], headers: { "x-molis-work-fragment": "frame-block" }, fallback: globalThis.t.text("goals.frame-container-client.could-not-load-artifacts") });
  const template = document.createElement("template");
  template.innerHTML = html;
  const reading = template.content.querySelector("[data-frame-reading]") || template.content.querySelector("[data-artifact-detail]");
  if (!reading) throw new Error(globalThis.t.text("goals.frame-container-client.could-not-load-artifacts"));
  if (reading.matches("[data-artifact-detail]")) {
    if (!reading.childElementCount) throw new Error(globalThis.t.text("goals.frame-container-client.could-not-load-artifacts"));
    body.replaceChildren(...reading.childNodes);
  } else body.replaceChildren(reading);
};

/** Reads an opened block's body from its owner; a newer read of the same body wins. */
export const fillBody = async (article: HTMLElement | null, block: FrameBlock | undefined, route: Route, force = false) => {
  const body = article?.querySelector<HTMLElement>("[data-frame-block-body]");
  if (!body || !block) return;
  const stamp = block.kind + ":" + block.itemId;
  if (!force && body.dataset.loaded === stamp) return;
  const token = String(Date.now()) + "-" + block.id;
  body.dataset.loadToken = token;
  delete body.dataset.loaded;
  const status = document.createElement("p");
  status.className = "frame-block-status";
  status.textContent = globalThis.t.text("goals.frame-container-client.opening");
  body.replaceChildren(status);
  try {
    if (block.kind === "inbox") loadInboxBody(body, block);
    else if (block.kind === "feed") await loadFeedBody(body, block, route);
    else if (block.kind === "artifact") await loadArtifactBody(body, block, route);
    else {
      const fallback = document.createElement("p");
      fallback.textContent = block.caption || kindLabel(block.kind);
      body.replaceChildren(fallback);
    }
    if (!body.isConnected || body.dataset.loadToken !== token) return;
    body.dataset.loaded = stamp;
  } catch (error) {
    if (!body.isConnected || body.dataset.loadToken !== token) return;
    showBlockError(body, error);
  }
};

const closeIcon = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';

/** The article of one block on the frame. */
export const blockArticle = (block: FrameBlock, expanded: boolean) => {
  const article = document.createElement("article");
  article.className = "frame-block" + (expanded ? " is-expanded" : "");
  article.dataset.frameBlock = block.id;
  article.tabIndex = 0;
  article.setAttribute("aria-label", block.title);
  article.dataset.frameBlockKind = block.kind;
  article.style.transform = "translate(" + block.x + "px," + block.y + "px)";
  const handle = document.createElement("header");
  handle.dataset.frameBlockHandle = "";
  const title = document.createElement("strong");
  title.textContent = block.title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "frame-block-close";
  close.dataset.frameBlockClose = "";
  close.setAttribute("aria-label", globalThis.t.text("goals.frame-container-client.collapse-card"));
  close.innerHTML = closeIcon;
  handle.append(title, close);
  const caption = document.createElement("p");
  caption.textContent = block.caption || "";
  const stamp = document.createElement("span");
  stamp.className = "frame-block-kind";
  stamp.textContent = kindLabel(block.kind);
  const body = document.createElement("div");
  body.dataset.frameBlockBody = "";
  article.append(caption, handle, stamp, body);
  return article;
};

const pinnedTab = (tab: string, current: string, label: string) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "container-tab is-pinned";
  button.dataset.containerTab = tab;
  if (current === tab) button.setAttribute("aria-current", "page");
  const text = document.createElement("span");
  text.textContent = label;
  button.append(text);
  return button;
};
/** The container tabs: the three board views, then one tab for each open Goal frame. */
export const containerTabs = (current: string, openIds: readonly string[], goalTitle: (goalId: string) => string) => {
  const fragment = document.createDocumentFragment();
  fragment.append(pinnedTab("list", current, globalThis.t.text("goals.frame-container-client.list")),
    pinnedTab("canvas", current, globalThis.t.text("goals.frame-container-client.goal-canvas")),
    pinnedTab("kanban", current, globalThis.t.text("goals.frame-container-client.board")));
  openIds.forEach((goalId) => {
    const tab = document.createElement("div");
    tab.className = "container-tab";
    tab.dataset.containerTab = goalId;
    tab.setAttribute("role", "tab");
    tab.title = goalTitle(goalId);
    if (current === goalId) tab.setAttribute("aria-current", "page");
    const label = document.createElement("span");
    label.textContent = tab.title;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "container-tab-close";
    close.dataset.containerTabClose = goalId;
    close.setAttribute("aria-label", globalThis.t.text("goals.frame-container-client.close-frame-title", { title: tab.title }));
    close.title = globalThis.t.text("common.control.close");
    close.innerHTML = closeIcon;
    tab.append(label, close);
    fragment.append(tab);
  });
  return fragment;
};

/** The asset a click or drag on a page row offers, when the row is one a frame can hold. */
export const readAsset = (target: Element | null): FrameAsset | null => {
  if (!target) return null;
  if (target.closest("[data-tree-toggle], [data-directory-back], [data-work-surface-open], [data-feed-filter-trigger], [data-feed-filter-panel], [data-container-tabs], [data-frame-block]")) return null;
  const row = target.closest<HTMLElement>("[data-frame-asset]");
  if (!row) return null;
  const d = row.dataset;
  return {
    kind: d.frameAsset || "",
    id: d.frameAssetId || "",
    title: d.frameAssetTitle || row.querySelector("strong")?.textContent || "",
    caption: d.frameAssetCaption || "",
    itemRef: d.feedItemId || (d.inboxSubjectType === "feed" ? d.inboxSubjectId : "") || "",
    entryId: d.feedEntryId || d.inboxEntryId || "",
    reading: { reason: d.frameReadingReason || "", relation: d.frameReadingRelation || "", next: d.frameReadingNext || "", status: d.frameReadingStatus || "" },
  };
};
/** The asset a drop carries from another document, when it carries one. */
export const readTransfer = (event: DragEvent): FrameAsset | null => {
  try {
    const raw = event.dataTransfer?.getData("application/x-molis-work-asset");
    return raw ? JSON.parse(raw) as FrameAsset : null;
  } catch { return null; }
};
