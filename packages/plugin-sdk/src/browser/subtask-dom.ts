import type { SubtaskConversationOptions } from "./subtask-contract.js";
import { contentHtml } from "../browser.js";
import type { ScrollFollower } from "../page-globals.js";
import { escapeHtml } from "../ui/html.js";
import { renderSubtaskConversation, subtaskAction, subtaskChildren, subtaskContext, subtaskHeader, subtaskIntroduction,
  type MwSubtaskContent, type MwSubtaskConversationLabels, type MwSubtaskConversationView, type MwSubtaskDetail, type MwSubtaskMessage } from "../ui/subtask-conversation.js";

const htmlOf = (content: MwSubtaskContent, document: Document) => "text" in content
  ? `<p class="mw-subtask__plain">${escapeHtml(content.text)}</p>` : contentHtml(content.html, document);

/** Keep unchanged controls and text nodes; rich content gets the existing content filter before the stream patcher. */
export function patch(node: HTMLElement, html: string, stream = false) {
  const template = node.ownerDocument.createElement("template"); template.innerHTML = html;
  if (node.innerHTML === template.innerHTML) return;
  if (stream && window.molisStreamText) { window.molisStreamText(node, html); return; }
  // Compare parsed nodes: DOM serialization adds empty values to the renderer's boolean attributes.
  // Keep equal siblings too, so a new task title does not replace its unchanged Back and Close buttons.
  const current = Array.from(node.childNodes), incoming = Array.from(template.content.childNodes);
  incoming.forEach((next, index) => {
    const old = current[index];
    if (!old) node.append(next); else if (!old.isEqualNode(next)) old.replaceWith(next);
  });
  for (const old of current.slice(incoming.length)) old.remove();
}
function textChild(parent: HTMLElement, className: string, text: string | undefined, before?: Element) {
  let child = parent.querySelector<HTMLElement>(`:scope > .${className}`);
  if (!text) { child?.remove(); return; }
  if (!child) { child = parent.ownerDocument.createElement("div"); child.className = className; parent.insertBefore(child, before ?? null); }
  if (child.textContent !== text) child.textContent = text;
}
function messageNode(document: Document, message: MwSubtaskMessage, existing?: HTMLElement): HTMLElement {
  const node = existing ?? document.createElement("article"); node.className = "mw-subtask__message";
  node.dataset.subtaskMessage = message.id; node.dataset.role = message.role;
  let words = node.querySelector<HTMLElement>(".mw-subtask__words");
  if (!words) { words = document.createElement("div"); words.className = "mw-subtask__words"; words.translate = false; node.append(words); }
  textChild(node, "mw-subtask__who", message.name, words);
  patch(words, htmlOf(message.content, document), true);
  textChild(node, "mw-subtask__receipt", message.receipt);
  return node;
}
function detailNode(document: Document, detail: MwSubtaskDetail, open: boolean, existing?: HTMLElement): HTMLElement {
  const node = (existing ?? document.createElement("details")) as HTMLDetailsElement;
  node.className = "mw-subtask__detail"; node.dataset.subtaskDetail = detail.id;
  if (!existing) node.innerHTML = '<summary></summary><div class="mw-subtask__detail-body" translate="no"></div><div class="mw-subtask__answers"></div>';
  const summary = node.querySelector("summary")!;
  if (summary.textContent !== detail.title) summary.textContent = detail.title;
  const body = node.querySelector<HTMLElement>(".mw-subtask__detail-body")!;
  if (!body.hasAttribute("data-subtask-owner-mounted")) patch(body, htmlOf(detail.content, document), true);
  patch(node.querySelector<HTMLElement>(".mw-subtask__answers")!, (detail.actions ?? []).map(subtaskAction).join(""));
  if (node.open !== open) node.open = open;
  return node;
}
function keyed<T extends { readonly id: string }>(root: HTMLElement, rows: readonly T[], key: string, render: (row: T, old?: HTMLElement) => HTMLElement) {
  const existing = new Map(Array.from(root.children).map(node => [(node as HTMLElement).getAttribute(key)!, node as HTMLElement]));
  let cursor = root.firstElementChild;
  for (const row of rows) {
    const node = render(row, existing.get(row.id)); existing.delete(row.id);
    if (node !== cursor) root.insertBefore(node, cursor);
    cursor = node.nextElementSibling;
  }
  for (const node of existing.values()) node.remove();
}

interface Place { readonly top: number; readonly following: boolean; readonly unread: boolean; readonly expanded: Map<string, boolean> }
export function subtaskDom(root: HTMLElement, labels: () => MwSubtaskConversationLabels, mount?: (root: HTMLElement, view: MwSubtaskConversationView, detail: MwSubtaskDetail) => ReturnType<NonNullable<SubtaskConversationOptions["mountDetail"]>>) {
  const mounts = new Map<HTMLElement, { key: string; handle: NonNullable<ReturnType<NonNullable<SubtaskConversationOptions["mountDetail"]>>> }>();
  const release = (body: HTMLElement) => { const mounted = mounts.get(body); mounts.delete(body); mounted?.handle.destroy(); body.removeAttribute("data-subtask-owner-mounted"); body.replaceChildren(); };
  const releaseAll = () => { for (const body of mounts.keys()) release(body); };
  root.innerHTML = renderSubtaskConversation({ labels: labels() });
  const find = (name: string) => root.querySelector<HTMLElement>(`[data-subtask-${name}]`)!;
  const thread = find("thread"), messages = find("messages"), details = find("details"), latest = find("latest");
  const places = new Map<string, Place>();
  let target: string | undefined, expanded = new Map<string, boolean>(), follower: ScrollFollower | undefined, first = true;
  const remember = () => { if (target && !first && !root.hidden) places.set(target, { top: thread.scrollTop, following: follower?.state !== "detached", unread: !latest.hidden, expanded }); };
  function show(next: string) {
    remember(); follower?.dispose();
    first = true;
    if (target !== next) clear();
    target = next; root.hidden = false; expanded = places.get(next)?.expanded ?? new Map();
    latest.hidden = !places.get(next)?.unread;
    follower = window.molisFollow?.(thread, { onChange: state => { if (state === "following") latest.hidden = true; } });
  }
  function clear() {
    releaseAll();
    for (const name of ["context", "intro", "messages", "details", "children", "feedback"]) find(name).replaceChildren();
    latest.hidden = true;
  }
  function draw(view: MwSubtaskConversationView) {
    const words = labels(), before = messages.textContent, following = follower?.state !== "detached";
    const anchor = Array.from(messages.children).find(node => node.getBoundingClientRect().bottom >= thread.getBoundingClientRect().top);
    const offset = anchor?.getBoundingClientRect().top;
    patch(find("head"), subtaskHeader(view, words)); patch(find("context"), subtaskContext(view));
    patch(find("intro"), subtaskIntroduction(view));
    keyed(messages, view.messages, "data-subtask-message", (message, old) => messageNode(root.ownerDocument, message, old));
    keyed(details, view.details ?? [], "data-subtask-detail", (detail, old) => detailNode(root.ownerDocument, detail, expanded.get(detail.id) ?? Boolean(detail.expanded), old));
    for (const body of mounts.keys()) if (!details.contains(body)) release(body);
    for (const node of Array.from(details.querySelectorAll<HTMLElement>("[data-subtask-detail]"))) {
      const detail = view.details?.find(one => one.id === node.dataset.subtaskDetail), body = node.querySelector<HTMLElement>(".mw-subtask__detail-body")!;
      if (!detail) continue;
      const key = JSON.stringify([view.target, view.binding, detail.id]); let mounted = mounts.get(body);
      if (mounted && mounted.key !== key) { release(body); mounted = undefined; }
      if (!mounted && mount) {
        const handle = mount(body, view, detail);
        if (handle) { mounted = { key, handle }; mounts.set(body, mounted); body.setAttribute("data-subtask-owner-mounted", ""); }
        else patch(body, htmlOf(detail.content, root.ownerDocument), true);
      }
      mounted?.handle.update?.(view, detail);
    }
    patch(find("children"), subtaskChildren(view, words));
    root.querySelector(".mw-subtask")!.setAttribute("aria-label", view.title);
    thread.setAttribute("aria-label", words.messages); find("follow").setAttribute("title", words.latest);
    const latestLabel = find("follow").querySelector('[data-slot="button-label"]'); if (latestLabel) latestLabel.textContent = words.latest;
    if (first) {
      const place = places.get(view.target);
      if (place && !place.following) follower?.restore(place.top); else { follower?.resume(); thread.scrollTop = thread.scrollHeight; follower?.pin(); }
      first = false;
    } else if (following) follower?.pin();
    else {
      if (anchor?.isConnected && offset !== undefined) thread.scrollTop += anchor.getBoundingClientRect().top - offset;
      if (before !== messages.textContent) latest.hidden = false;
    }
  }
  const toggled = (event: Event) => {
    const node = event.target as HTMLDetailsElement;
    if (node.matches("[data-subtask-detail]")) expanded.set(node.dataset.subtaskDetail!, node.open);
  };
  details.addEventListener("toggle", toggled, true);
  return {
    releaseDetails: releaseAll, holdDetails: (held: boolean) => { for (const body of mounts.keys()) body.inert = held; },
    find, draw, show, composer: find("composer"),
    forget() { if (target) places.delete(target); expanded.clear(); first = true; follower?.resume(); clear(); },
    idle() { patch(find("head"), subtaskHeader(undefined, labels())); },
    latest() { latest.hidden = true; follower?.toLatest(); },
    hide() { remember(); first = true; follower?.dispose(); follower = undefined; root.hidden = true; },
    destroy() { follower?.dispose(); details.removeEventListener("toggle", toggled, true); places.clear(); root.replaceChildren(); },
  };
}
