/**
 * The component board's Assistant frame (apps/workbench/src/assistant-board-frame.ts, specs/visual-ui-experience VUX-39): a
 * stand-in for the Host that answers the shipped island from fixed works, and the frame's two simulated actions.
 *
 * - Reads under `route()` are answered from the samples the Host drew: the list, a work, its surroundings, the long wait that
 *   follows a running work (it answers when 「推进一步」 moves the work on, or after 20 s with the same view, as the Host does).
 * - Writes are refused with one plain reason, so a confirmation, a Send or an image the Host would read all fail where the
 *   island shows a failure. In memory it keeps a work's unsent text, takes the answer to the sample question (the round goes
 *   on to its end), closes the interrupted round once it is checked, and settles the bell's notices — so the success path
 *   is on the board beside the failure.
 * - The bell's notices come through the page's own attention reader, which the frame runs as the workbench does: the
 *   stand-in answers its `/api/attention` read with the samples' notices and no background tasks.
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
type Samples = { project: { id: string; title: string }; works: Array<Json & { work_id: string; delegated_by?: unknown }>; views: Record<string, View>; surroundings: Record<string, Json>; executors: Json[];
  next: Record<string, View[]>; answered: Record<string, View>; closed: Record<string, View>; recovery: Record<string, Json>; notices: Array<Json & { notice_id: string; work_id: string }>;
  /** The lines beside each field for a questionnaire answer the Runtime refuses, by question, as the Host drew them. */
  refused: Record<string, Record<string, string>> };
type Page = Window & { L?: (text: string, values?: Record<string, string | number>) => string; molisWorkRequest?: Pick<UiRequest, "toast"> };

const page = window as Page;
const L = (text: string, values?: Record<string, string | number>) => page.L ? page.L(text, values) : text;
const one = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const data = JSON.parse(one("#mw-asst-data").textContent ?? "{}") as { samples: Samples; current: string | null; answer: "ok" | "refused" };
const S = data.samples;
const PREFIX = "/__ui/catalog/assistant/sample";

// The island's own memory, in memory: the open work and the tabs of every sample work, so the list and the tabs start full.
// A sub-task opens from the work that handed it on, so only the works the person started have tabs.
const held = new Map<string, string>([["molis.assistant.tabs", JSON.stringify(S.works.filter((work) => !work.delegated_by).map((work) => work.work_id))]]);
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

/** A work moves on to the view the Host would answer next: the list, the work and its long wait all see it. */
const moveOn = (id: string, next: View) => {
  S.views[id] = next;
  S.works = S.works.map((work) => work.work_id === id ? next.work : work);
  versions.set(id, (versions.get(id) ?? 1) + 1);
  for (const done of waiting.get(id) ?? []) done();
  waiting.delete(id);
  return json(copy(next));
};

/**
 * An answer takes a moment to reach the Host (simulated, so the card's busy state is seen), then the Host takes it and the round
 * goes on, or — with 回答问卷 · 被拒 — refuses it the way the Runtime refuses a questionnaire, with a line beside the field.
 */
const ANSWER_MS = 900;
const answerQuestion = (id: string, body: string | null) => new Promise<Response>((resolve) => setTimeout(() => {
  const pending = String((JSON.parse(body ?? "{}") as { pending_id?: unknown }).pending_id ?? ""), errors = S.refused[pending];
  if (data.answer === "refused" && errors) resolve(json({ error: L("回答没有交回（模拟）"), code: "assistant.invalid", details: { errors } }, 400));
  else resolve(S.answered[id] ? moveOn(id, S.answered[id]!) : refuse());
}, ANSWER_MS));

const READS: Record<string, () => unknown> = {
  works: () => ({ works: copy(S.works) }), notices: () => ({ notices: copy(S.notices) }), characters: () => ({ characters: [] }),
  executors: () => ({ executors: copy(S.executors) }), capabilities: () => ({ capabilities: [] }), methods: () => ({ methods: [] }), "surface-kinds": () => ({ kinds: [] }),
};
function answer(url: URL, method: string, body: string | null, signal?: AbortSignal | null): Response | Promise<Response> {
  const parts = url.pathname.slice((PREFIX + "/api/assistant/").length).split("/").map(decodeURIComponent);
  const id = parts[0] === "works" ? parts[1] ?? "" : "", view = S.views[id];
  if (method === "GET" && parts.length === 1 && READS[parts[0]!]) return json(READS[parts[0]!]!());
  if (method === "GET" && view && parts.length === 2) return json(copy(view));
  if (method === "GET" && view && parts[2] === "wait") return answerWait(id, url.searchParams.get("since"), signal);
  if (method === "GET" && view && parts[2] === "surroundings" && S.surroundings[id]) return json(copy(S.surroundings[id]));
  if (method === "GET" && view && parts[2] === "recovery") return json(copy(S.recovery[id] ?? { blockers: [], rounds: [] }));
  if (method === "POST" && view && parts[2] === "recovery" && S.closed[id]) return moveOn(id, S.closed[id]!);
  if (method === "POST" && view && parts[2] === "answer") return answerQuestion(id, body);
  if (method === "POST" && view && parts[2] === "question-draft") return json({});
  if (method === "POST" && parts.length === 1 && parts[0] === "notices") {
    const target = JSON.parse(body ?? "{}") as { notice_id?: string; work_id?: string };
    S.notices = S.notices.filter((notice) => notice.notice_id !== target.notice_id && (!target.work_id || notice.work_id !== target.work_id));
    return json({});
  }
  if (method === "POST" && view && parts[2] === "draft") {
    const draft = String((JSON.parse(body ?? "{}") as { draft?: unknown }).draft ?? "");
    for (const work of [view.work, ...S.works.filter((row) => row.work_id === id)]) work.draft = draft;
    return json({ work: copy(view.work) });
  }
  return refuse();
}
// The frame reaches nothing real: the stand-in answers the Assistant's reads and drafts and the attention read, and refuses every other request.
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href), method = (init?.method ?? "GET").toUpperCase();
  if (url.origin === location.origin && url.pathname === PREFIX + "/api/attention" && method === "GET") {
    return Promise.resolve(json({ background_tasks: [], notices: copy(S.notices), plugin_events_pending: 0, board_cursor: null }));
  }
  if (url.origin === location.origin && url.pathname.startsWith(PREFIX + "/api/assistant/")) return Promise.resolve(answer(url, method, typeof init?.body === "string" ? init.body : null, init?.signal));
  return Promise.resolve(refuse());
};

const toastNode = one("[data-toast]"), status = one("[data-asst-state]");
const toast = (message: unknown) => page.molisWorkRequest?.toast(toastNode, typeof message === "string" ? undefined : message, typeof message === "string" ? message : undefined, { ms: 2200 });

// 推进一步: the running work's next view, as the Host would hand it to the island's long wait.
one("[data-asst-advance]").addEventListener("click", () => {
  const id = Object.keys(S.next).find((key) => S.next[key]!.length);
  if (!id) { status.textContent = L("样例已经走完了"); return; }
  moveOn(id, S.next[id]!.shift()!);
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
