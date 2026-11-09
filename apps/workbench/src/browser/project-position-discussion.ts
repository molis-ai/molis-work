import type { ImObjectBridge } from "@molis-ai/molis-work-im-ui";
import type { SurfaceHomeDisplay } from "../surface-home-display.js";
import type { PositionHost, PositionMount, PositionView } from "./project-position.js";

/** Translate visible, actual message parts into bounded reads; the shared view owns rendering and navigation. */
export function mountDiscussionObjects(frame: HTMLIFrameElement,
  api: <Result>(path: string, body: unknown, signal?: AbortSignal) => Promise<Result>, mount: PositionMount,
  visible: (root: HTMLElement) => boolean, translate: PositionHost["translate"],
) {
  type Part = "message" | "quote" | "share";
  const entries = new Map<HTMLElement, { part: Part; id: string; root: HTMLElement; view: PositionView; read: boolean }[]>();
  let room = "", stream: HTMLElement | null = null, frameId = 0, task: AbortController | undefined;
  const path = (id: string) => "/im/api/rooms/" + encodeURIComponent(id) + "/surfaces";
  const clear = () => {
    task?.abort(); cancelAnimationFrame(frameId); frameId = 0;
    for (const parts of entries.values()) for (const entry of parts) { entry.view.destroy(); entry.root.remove(); }
    entries.clear(); stream = null;
  };
  const inViewport = (row: HTMLElement) => {
    if (!stream?.contains(row)) return false;
    const bounds = (stream.closest("[data-scroll]") ?? stream).getBoundingClientRect(), box = row.getBoundingClientRect();
    return box.bottom > bounds.top && box.top < bounds.bottom && box.width > 0;
  };
  const refresh = () => {
    if (!stream?.isConnected || frame.contentDocument !== stream.ownerDocument || frame.closest("[hidden]")) { clear(); return; }
    const rows = [...stream.querySelectorAll<HTMLElement>("[data-message]")];
    for (const [row, parts] of entries) if (!rows.includes(row)) {
      for (const entry of parts) entry.view.destroy();
      entries.delete(row);
    }
    const waiting = [];
    for (const row of rows) {
      if (!inViewport(row)) continue;
      let parts = entries.get(row);
      if (!parts) {
        const id = row.dataset.message!, copy = row.querySelector(".im-message-copy");
        if (!copy) continue;
        parts = [];
        for (const [part, where] of [["message", ".im-message-body"], ["quote", ".im-quoted-message"], ["share", ".im-shared-reply"]] as const) {
          const anchor = copy.querySelector(where);
          if (!anchor) continue;
          const root = row.ownerDocument.createElement("div"); root.dataset.imObjectPart = part; anchor.after(root);
          const at = room;
          const view = mount(root, ({ expanded, ...input }, signal) => api(path(at),
            { ...input, views: [{ message_id: id, part, ...(expanded ? { expanded: true } : {}) }] }, signal),
            { source: () => ({}), batched: true });
          parts.push({ part, id, root, view, read: false });
        }
        entries.set(row, parts);
      }
      waiting.push(...parts.filter(entry => !entry.read).map(entry => ({ row, entry })));
    }
    if (!waiting.length) return;
    task?.abort(); const request = task = new AbortController(), at = room;
    void (async () => {
      for (let offset = 0; offset < waiting.length; offset += 6) {
        const batch = waiting.slice(offset, offset + 6).filter(({ row }) => inViewport(row));
        if (!batch.length) continue;
        try {
          const data = await api<SurfaceHomeDisplay>(path(at), { views: batch.map(({ entry: { id, part, view } }) =>
            ({ message_id: id, part, ...(view.expanded() ? { expanded: true } : {}) })) }, request.signal);
          if (task !== request || request.signal.aborted || at !== room) return;
          batch.forEach(({ row, entry }, index) => { if (visible(entry.root) && inViewport(row)) { entry.view.paint(data, index); entry.read = true; } });
        } catch {
          if (request.signal.aborted || task !== request) return;
          for (const parts of entries.values()) for (const entry of parts) { entry.view.clear(); entry.read = false; }
          return;
        }
      }
    })();
  };
  frame.contentWindow?.addEventListener("pagehide", clear, { once: true });
  const bridge: ImObjectBridge = {
    send(path, body) {
      if (!/^\/rooms\/[A-Za-z0-9_-]+\/(?:messages|threads(?:\/[A-Za-z0-9_-]+\/messages)?)$/u.test(path) || frame.closest("[hidden]"))
        return Promise.reject(new Error(translate("请在项目讨论中发送")));
      return api("/im/api" + path, body);
    },
    search(room, query, signal) { return api(path(room), { query }, signal); },
    update(id, node, shown) {
      if (!shown || frame.contentDocument !== node.ownerDocument) { clear(); return; }
      if (room !== id || stream !== node) { clear(); room = id; stream = node; }
      if (!frameId) frameId = requestAnimationFrame(() => { frameId = 0; refresh(); });
    },
    clear,
    translate,
  };
  return { bridge, clear, invalidate() { for (const parts of entries.values()) parts.forEach(entry => { entry.read = false; }); refresh(); } };
}
