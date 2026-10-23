/**
 * The component board's Assistant frame (apps/workbench/src/assistant-board-frame.ts, specs/visual-ui-experience VUX-39): a
 * stand-in for the Host that answers the shipped island from fixed works, and the frame's two simulated actions.
 *
 * - Reads under `route()` are answered from the samples the Host drew: the list, a work, its surroundings, the long wait that
 *   follows a running work (it answers when 「推进一步」 moves the work on, or after 20 s with the same view, as the Host does).
 * - Writes are refused with one plain reason, so a confirmation, an answer, a Send or an image the Host would read all fail
 *   where the island shows a failure. A work's unsent text is kept in memory (the island saves it with the work).
 * - Every other request to `/api/` is refused too: nothing in the frame reaches the real Host.
 * - The island's per-viewer memory (`molis.assistant.*`: the open work, its tabs, drafts) is kept in memory, so the frame never
 *   changes what the workbench on this computer remembers; theme and density stay the page's own.
 * - It takes focus only once the person is in it (a focus call before that does nothing), so it never scrolls the board.
 * - 「带上三个文件」 picks files through the island's own file input: a text file it reads, a kind it refuses before reading
 *   and a picture the stand-in Host refuses, so the strip shows the parts that failed beside the one that went in.
 */
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
type Json = Record<string, unknown>;
type View = { work: Json & { work_id: string }; [key: string]: unknown };
type Samples = { project: { id: string; title: string }; works: Array<Json & { work_id: string }>; views: Record<string, View>; surroundings: Record<string, Json>; next: Record<string, View[]> };
type Page = Window & { L?: (text: string, values?: Record<string, string | number>) => string; molisWorkRequest?: Pick<UiRequest, "toast"> };

const page = window as Page;
const L = (text: string, values?: Record<string, string | number>) => page.L ? page.L(text, values) : text;
const one = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const data = JSON.parse(one("#mw-asst-data").textContent ?? "{}") as { samples: Samples; current: string | null };
const S = data.samples;
const PREFIX = "/__ui/catalog/assistant/sample";

// The island's own memory, in memory: the open work and the tabs of every sample work, so the list and the tabs start full.
const held = new Map<string, string>([["molis.assistant.tabs", JSON.stringify(S.works.map((work) => work.work_id))]]);
if (data.current) held.set("molis.assistant.current", data.current);
const real = window.localStorage;
const mine = (key: string) => key.startsWith("molis.assistant.");
const storage = {
  getItem: (key: string) => mine(key) ? held.get(key) ?? null : real.getItem(key),
  setItem: (key: string, value: string) => { if (mine(key)) held.set(key, String(value)); else real.setItem(key, value); },
  removeItem: (key: string) => { if (mine(key)) held.delete(key); else real.removeItem(key); },
};
Object.defineProperty(window, "localStorage", { configurable: true, get: () => storage });

// The frame is one specimen on a long page: the island focuses its input when a work opens, and focus in a frame scrolls the
// board to it. Until the person is in the frame, its focus calls do nothing, so it never takes the board's focus or scroll.
const focus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) { if (document.hasFocus()) focus.call(this, options); };

const versions = new Map<string, number>(S.works.map((work) => [work.work_id, 1]));
const waiting = new Map<string, Array<() => void>>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refuse = () => json({ error: L("样例不执行这一步（模拟）"), code: "workbench.board_sample" }, 409);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const answerWait = (id: string, since: string | null, signal?: AbortSignal | null) => new Promise<Response>((resolve, reject) => {
  const done = () => { clearTimeout(timer); resolve(json({ version: String(versions.get(id)), view: copy(S.views[id]) })); };
  const timer = setTimeout(done, 20_000);
  if (since !== String(versions.get(id))) { done(); return; }
  waiting.set(id, [...(waiting.get(id) ?? []), done]);
  signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
});

const READS: Record<string, () => unknown> = {
  works: () => ({ works: copy(S.works) }), notices: () => ({ notices: [] }), characters: () => ({ characters: [] }),
  capabilities: () => ({ capabilities: [] }), methods: () => ({ methods: [] }), "surface-kinds": () => ({ kinds: [] }),
};
function answer(url: URL, method: string, body: string | null, signal?: AbortSignal | null): Response | Promise<Response> {
  const parts = url.pathname.slice((PREFIX + "/api/assistant/").length).split("/").map(decodeURIComponent);
  const id = parts[0] === "works" ? parts[1] ?? "" : "", view = S.views[id];
  if (method === "GET" && parts.length === 1 && READS[parts[0]!]) return json(READS[parts[0]!]!());
  if (method === "GET" && view && parts.length === 2) return json(copy(view));
  if (method === "GET" && view && parts[2] === "wait") return answerWait(id, url.searchParams.get("since"), signal);
  if (method === "GET" && view && parts[2] === "surroundings" && S.surroundings[id]) return json(copy(S.surroundings[id]));
  if (method === "GET" && view && parts[2] === "recovery") return json({ blockers: [], rounds: [] });
  if (method === "POST" && view && parts[2] === "draft") {
    const draft = String((JSON.parse(body ?? "{}") as { draft?: unknown }).draft ?? "");
    for (const work of [view.work, ...S.works.filter((row) => row.work_id === id)]) work.draft = draft;
    return json({ work: copy(view.work) });
  }
  return refuse();
}
// The frame reaches nothing real: the stand-in answers the Assistant's reads and drafts, and refuses every other request.
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href), method = (init?.method ?? "GET").toUpperCase();
  if (url.origin === location.origin && url.pathname.startsWith(PREFIX + "/api/assistant/")) return Promise.resolve(answer(url, method, typeof init?.body === "string" ? init.body : null, init?.signal));
  return Promise.resolve(refuse());
};

const toastNode = one("[data-toast]"), status = one("[data-asst-state]");
const toast = (message: unknown) => page.molisWorkRequest?.toast(toastNode, typeof message === "string" ? undefined : message, typeof message === "string" ? message : undefined, { ms: 2200 });

// 推进一步: the running work's next view, as the Host would hand it to the island's long wait.
one("[data-asst-advance]").addEventListener("click", () => {
  const id = Object.keys(S.next).find((key) => S.next[key]!.length);
  if (!id) { status.textContent = L("样例已经走完了"); return; }
  const next = S.next[id]!.shift()!;
  S.views[id] = next;
  S.works = S.works.map((work) => work.work_id === id ? next.work : work);
  versions.set(id, (versions.get(id) ?? 1) + 1);
  for (const done of waiting.get(id) ?? []) done();
  waiting.delete(id);
  status.textContent = L("已推进一步");
});

// 带上三个文件: one the island reads, one it will not take, one the stand-in Host refuses to read.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
one("[data-asst-attach]").addEventListener("click", () => {
  const field = document.querySelector<HTMLInputElement>("[data-assistant-file]");
  if (!field) return;
  const picked = new DataTransfer();
  picked.items.add(new File(["# 会议记录\n\n- 周五 10:00 复盘\n- 只看首次使用\n"], "会议记录.md", { type: "text/markdown" }));
  picked.items.add(new File([new Uint8Array([80, 75, 3, 4])], "设计稿.zip", { type: "application/zip" }));
  picked.items.add(new File([PNG], "白板照片.png", { type: "image/png" }));
  field.files = picked.files;
  field.dispatchEvent(new Event("change", { bubbles: true }));
});

(window as Window & { molisBoardAssistant?: unknown }).molisBoardAssistant = {
  project: S.project,
  route: (path: string) => PREFIX + path,
  toast,
  openItem: (_surface: string, _id: string, title: string) => toast(L("样例里不打开「{title}」（模拟）", { title })),
  /** Opens the panel on the starting work (or a new one) the way a page asks the Assistant to open. */
  start(island: unknown) {
    document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: data.current ? { work_id: data.current } : { new: true } }));
    return island;
  },
};
