import { type UiConnectionNeedOutcome, type UiConnectionNeedTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectionNeedHtml, type ConnectionNeedStage, type ConnectionNeedView } from "../../connection-need-card.js";
import type { FramedArea, PageFramedAreas } from "./framed-area.js";
import { childPlaces } from "./over-frame.js";
import type { ConnectionNeedDown, ConnectionNeedUp, FrameScope, Translate } from "./types.js";

/**
 * 原处的连接卡 (specs/assistant-service-connections/spec.md §13.5): a page keeps an empty element where it needs an account and names
 * the target; the shell draws the card outside the page's frame on that place (the framed-area registry of 18 P3), and every write in
 * it is the person's own deliberate press, made as the person through the Host's page route (C2) or the connections page's own routes.
 * The page hears the account's display name once connected, or that the person cancelled; never which account, its state or a key.
 */

/** The one thing the page hears when a card cannot be drawn, whatever the reason. */
export const CONNECTION_NEED_UNAVAILABLE = "Unavailable";
/** The card's heights by width alone (§13.5 三第 2 条, the same steps as the platform area), and the one line it folds into. */
export const CONNECTION_NEED_HEIGHTS = { narrow: 432, wide: 344, line: 48 } as const;

type Choice = { connection_id: string; label: string; auth_method: string; state: string };
type Read = { service_id: string; service_title: string; reason?: string; origin?: string; connection: Choice | null; disabled?: true;
  authorization?: { authorization_id: string; status: string; url: string; method: string } };
type Auth = { id: string; url: string; relogin: boolean; timer?: ReturnType<typeof setTimeout> };
interface Entry extends ConnectionNeedView { id: number; readonly key: string; readonly target: UiConnectionNeedTarget; readonly area: FramedArea; readonly heights: { narrow: number; wide: number };
  read: Read | null; auth?: Auth; other?: Choice }

const closed = () => new DOMException("Card closed", "AbortError");
const LOGIN_URL = /^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)[:/])/u, SLOT = /^[a-z][a-z0-9-]{0,63}$/u, RECORD = /^[A-Za-z0-9._:-]{1,200}$/u, KEY = "[data-connection-need-key]";
/** A target exactly as `UiConnectionNeedTarget` has it; a name more, or a value of another shape, is no target. */
export function needTarget(value: unknown): UiConnectionNeedTarget | null {
  const target = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const names = Object.keys(target).sort().join(), { slot_id: slot, record_key: record, base_url: base } = target;
  if (typeof slot !== "string") return null;
  if (target.kind === "slot" && SLOT.test(slot) && (names === "kind,slot_id" || names === "kind,record_key,slot_id" && typeof record === "string" && RECORD.test(record)))
    return { kind: "slot", slot_id: slot, ...(typeof record === "string" ? { record_key: record } : {}) };
  return target.kind === "image" && names === "base_url,kind,slot_id" && slot.trim() && slot.length <= 128 && typeof base === "string" && base.length <= 2048
    ? { kind: "image", slot_id: slot, base_url: base } : null;
}

/** What the Host's answer and the person's accounts make the card show first (§13.5 三第 3 条). */
function startStage(entry: Entry): ConnectionNeedStage {
  const image = entry.target.kind === "image";
  if (entry.read!.connection) return image ? "refused" : entry.read!.disabled ? "disabled" : "expired";
  return entry.accounts.length ? "choose" : image ? "paste" : "ask";
}

/** What the card's steps share with the card that holds them. */
interface Card {
  readonly t: Translate; readonly scope: FrameScope;
  live(entry: Entry): boolean; draw(entry: Entry): void; act(entry: Entry, work: () => Promise<void>): Promise<void>;
  host<T>(entry: Entry, body: Record<string, unknown>): Promise<T>; settings<T>(path: string, body?: unknown, method?: "PATCH" | "DELETE"): Promise<T>;
  /** Shows what an answer says: connected folds the card, anything else is the stage it starts from again. */
  settle(entry: Entry, answer: Read): void; fail(entry: Entry, note?: string): void; load(entry: Entry): Promise<void>; put(entry: Entry, connection_id: string): Promise<void>;
}

/** The person's own login or key, prepared as the person (C2), then in the browser or pasted, and the login watched until it ends. */
function loginSteps(c: Card) {
  const { t, live, settings } = c;
  /** The login a card started: read every 2 s while the page shows, and at once when the window comes back (§13.5 三第 6 条). */
  const watch = (entry: Entry, auth: Auth) => {
    const later = () => { auth.timer = setTimeout(() => void poll(), 2000); };
    const poll = async () => {
      clearTimeout(auth.timer);
      if (!live(entry) || entry.auth !== auth) return;
      if (!c.scope.visible) { later(); return; }
      let state: { status: string; connection_id?: string };
      try { state = await settings("authorizations/" + encodeURIComponent(auth.id)); }
      catch (error) { state = { status: (error as { status?: number }).status === 404 ? "expired" : "pending" }; }
      if (!live(entry) || entry.auth !== auth) return;
      // Refused, failed or expired in the browser: said in the card, which starts over from where it was (§13.5 三第 3 条).
      if (["cancelled", "failed", "expired"].includes(state.status)) { entry.auth = undefined; c.fail(entry); c.draw(entry); return; }
      if (state.status !== "connected") { later(); return; }
      entry.auth = undefined;
      await c.act(entry, async () => {
        const now = await c.host<Read>(entry, { operation: "read" }), id = state.connection_id;
        if (!live(entry)) return;
        // Logging in again came back as another account: offered for this one place, never put there unasked (§13.2).
        if (now.connection?.state !== "connected" && auth.relogin && id && id !== now.connection?.connection_id) {
          await c.load(entry); const row = entry.accounts.find(item => item.connection_id === id);
          entry.other = { connection_id: id, label: row ? row.account_label || row.display_name : "", auth_method: "", state: "connected" }; entry.stage = "other"; return;
        }
        if (now.connection?.state === "connected" || !id) c.settle(entry, now); else await c.put(entry, id);
      });
    };
    later();
    c.scope.listen(window, "focus", () => { if (entry.auth === auth) void poll(); });
  };
  /** 连接 / 再加一个 / 用原账号重新登录. */
  const connect = (entry: Entry, relogin: boolean) => {
    // Reserved during the press, so a browser that blocks a later window does not; a desktop shell opens the system browser instead.
    const external = globalThis.molisWorkOpenExternalUrl, popup = external ? null : window.open("", "_blank");
    if (popup) popup.opener = null;
    const again = relogin ? { connection_id: entry.read!.connection!.connection_id } : {};
    void c.act(entry, async () => { try {
      const prepared = await c.host<Read>(entry, { operation: "prepare", ...again }), setup = prepared.authorization!;
      if (!live(entry)) throw closed();
      if (setup.method !== "oauth") { popup?.close(); entry.auth = { id: setup.authorization_id, url: "", relogin }; entry.stage = "key"; return; }
      const started = await settings<{ authorization_url: string; authorization_id?: string }>("methods/oauth/start", { service_id: prepared.service_id, display_name: prepared.service_title, setup_id: setup.authorization_id, ...again });
      // Only a web page goes into the window: https, or the login's own callback on this computer.
      const url = started.authorization_url;
      if (!LOGIN_URL.test(url)) throw new Error(t("服务返回的授权地址无效，请重试。"));
      if (!live(entry)) throw closed();
      const auth: Auth = entry.auth = { id: started.authorization_id ?? setup.authorization_id, url, relogin };
      if (external) await external(url); else if (popup && !popup.closed) popup.location.replace(url);
      else entry.note = t("浏览器拦截了新窗口。点「再打开一次登录页」继续登录。");
      entry.stage = "running"; watch(entry, auth);
    } catch (error) { popup?.close(); throw error; } });
  };
  /** A key typed in the card: an image target's is checked, saved, pinned and put on it by C2 in one pass; a service's through the connections page's own check-before-save. */
  const save = (entry: Entry) => {
    const input = entry.area.surface.querySelector<HTMLInputElement>(KEY), value = input?.value.trim() ?? "";
    if (!value) { input?.focus(); return; }
    void c.act(entry, async () => {
      if (entry.target.kind === "image") { const answer = await c.host<Read>(entry, { operation: "save_key", api_key: value }); if (live(entry)) c.settle(entry, answer); return; }
      const auth = entry.auth!, read = entry.read!, body = { token: value, setup_id: auth.id };
      const saved = await (auth.relogin ? settings<{ connection: { connection_id: string } }>("connections/" + encodeURIComponent(read.connection!.connection_id), body, "PATCH")
        : settings<{ connection: { connection_id: string } }>("connections", { ...body, service_id: read.service_id, display_name: read.service_title }));
      if (!live(entry)) return;
      entry.auth = undefined;
      if (auth.relogin) { const now = await c.host<Read>(entry, { operation: "read" }); if (live(entry)) c.settle(entry, now); }
      else await c.put(entry, saved.connection.connection_id);
    });
  };
  return { connect, save };
}

/**
 * The trusted half. `owner` is the installation's name as the shell lists it. The installation, project and person are the page's
 * authority (the Host route reads them from the outer header), never anything here.
 */
export function pageConnectionNeed(port: MessagePort, scope: FrameScope, areas: PageFramedAreas, pageId: string, route: (path: string) => string, t: Translate, owner: string) {
  const entries = new Map<string, Entry>(), refused = new Set<string>();
  const send = (kind: string, id: number, more: object = {}) => { if (scope.alive) port.postMessage({ type: "connection-need-" + kind, id, ...more } as ConnectionNeedDown); };
  const ask = <T>(target: UiConnectionNeedTarget, body: Record<string, unknown>) => molisWorkRequest<T>(route("/api/host/plugin-page-connection"),
    { body: { target, ...body }, headers: { "x-molis-context-page": pageId }, scope });
  const byId = (id: number) => [...entries.values()].find(entry => entry.id === id);
  const live = (entry: Entry) => scope.alive && entries.get(entry.key) === entry;
  const close = (key: string) => { const entry = entries.get(key); if (!entry) return; clearTimeout(entry.auth?.timer); entry.area.close(); entries.delete(key); };
  scope.own(() => { for (const key of [...entries.keys()]) close(key); });
  const draw = (entry: Entry) => {
    if (!live(entry)) return;
    const surface = entry.area.surface, typed = surface.querySelector<HTMLInputElement>(KEY)?.value ?? "";
    surface.dataset.stage = entry.stage;
    entry.area.redraw(connectionNeedHtml(t, owner, entry as ConnectionNeedView & { read: Read }));
    const key = surface.querySelector<HTMLInputElement>(KEY); if (key) key.value = typed;
  };
  /** Folds the card into its one line, after the page has its answer; the focus, if it was in the card, lands on the line. */
  const fold = (entry: Entry, line: string, outcome?: UiConnectionNeedOutcome) => {
    clearTimeout(entry.auth?.timer); entry.auth = undefined;
    const held = entry.area.surface.contains(document.activeElement);
    if (outcome && !entry.answered) { entry.answered = true; send("done", entry.id, { outcome }); }
    entry.heights.narrow = entry.heights.wide = CONNECTION_NEED_HEIGHTS.line;
    entry.stage = "line"; entry.line = line; entry.busy = false; draw(entry);
    if (held) entry.area.surface.querySelector<HTMLElement>("[role=status]")?.focus({ preventScroll: true });
  };
  const c: Card = {
    t, scope, live, draw, host: (entry, body) => ask(entry.target, body),
    settings: (path, body, method) => molisWorkRequest("/api/settings/connectors/" + path, { scope, ...(body === undefined ? {} : { body }), ...(method ? { method } : {}) }),
    settle: (entry, answer) => {
      const bound = answer.connection;
      if (bound?.state === "connected") fold(entry, t("已连上 {name} · {account}", { name: entry.read!.service_title, account: bound.label }), { status: "connected", account: { label: bound.label } });
      else { entry.read = answer; entry.stage = startStage(entry); }
    },
    fail: (entry, note) => { entry.note = note || t("没有连上。这里什么都没改，可以再试一次。"); entry.danger = true; if (entry.stage === "running") entry.stage = startStage(entry); },
    /** Reads the target and, when nothing usable is on it, this service's accounts the card may offer (an image target's: unpinned or pinned here). */
    load: async entry => {
      const read = entry.read = await ask<Read>(entry.target, { operation: "read" });
      const directory = await c.settings<{ connections: Array<ConnectorConnectionView | { project_id: string }> }>("connections?service_id=" + encodeURIComponent(read.service_id));
      entry.accounts = directory.connections.filter((row): row is ConnectorConnectionView => !("project_id" in row) && row.state === "connected"
        && row.connection_id !== read.connection?.connection_id && (!row.target_origin || row.target_origin === read.origin));
    },
    /** The connection the person ended with goes on this place: a first one is bound, another over a working one is a switch (S-108). */
    put: async (entry, connection_id) => {
      const bound = entry.read!.connection;
      const answer = await ask<Read>(entry.target, { operation: bound && bound.connection_id !== connection_id && entry.target.kind === "slot" ? "switch" : "bind", connection_id });
      if (live(entry)) c.settle(entry, answer);
    },
    /** One write, at most one at a time; a failure is said in the card, and the person may try again (§13.5 三第 3 条). */
    act: async (entry, work) => {
      entry.busy = true; entry.note = ""; entry.danger = false; draw(entry);
      try { await work(); }
      catch (error) {
        const failure = error as { code?: string; message?: string; name?: string };
        if (!live(entry) || failure.name === "AbortError") return;
        if (failure.code === "connector.setup.unsupported") { entry.stage = "unsupported"; return; }
        c.fail(entry, failure.code === "connector.check.rate_limited" ? t("{name}那边暂时限流，密钥没有保存；稍后再试。", { name: entry.read!.service_title }) : failure.message);
      } finally { if (live(entry)) { entry.busy = false; if (entry.stage !== "line") draw(entry); } }
    },
  };
  const { connect, save } = loginSteps(c);
  const begin = async (entry: Entry) => {
    Object.assign(entry.heights, { narrow: CONNECTION_NEED_HEIGHTS.narrow, wide: CONNECTION_NEED_HEIGHTS.wide });
    await c.load(entry);
    if (!live(entry)) return;
    entry.note = ""; entry.danger = false; c.settle(entry, entry.read!); if (entry.stage !== "line") draw(entry);
  };
  const cancel = (entry: Entry) => {
    const auth = entry.auth; refused.add(entry.key);
    // The login under way is cancelled as the person (§4.6.1): a late return then only leaves its connection, put on no place.
    if (auth) void c.settings("authorizations/" + encodeURIComponent(auth.id), undefined, "DELETE").catch(() => undefined);
    fold(entry, t("没有连上，这里什么都没改"), { status: "cancelled" });
  };
  const steps: Record<string, (entry: Entry) => void> = {
    cancel, connect: entry => connect(entry, false), save,
    fill: entry => { entry.stage = "paste"; draw(entry); }, other: entry => { entry.stage = "choose"; draw(entry); },
    relogin: entry => { if (entry.stage === "expired") connect(entry, true); },
    enable: entry => { if (entry.stage === "disabled") void c.act(entry, async () => { const answer = await ask<Read>(entry.target, { operation: "enable" }); if (live(entry)) c.settle(entry, answer); }); },
    switch: entry => { const other = entry.other; if (other) void c.act(entry, () => c.put(entry, other.connection_id)); },
    reopen: entry => { if (entry.auth?.url) window.open(entry.auth.url, "_blank", "noopener,noreferrer"); },
    retry: entry => void c.act(entry, () => begin(entry)),
    settings: entry => document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: location.origin + "/settings/connectors?connector=" + encodeURIComponent(entry.read!.service_id) } })),
  };
  /** A press on one of the card's controls: the six checks of §3.3 (18 P3), then at most one step. */
  const press = (entry: Entry, event: MouseEvent) => {
    const control = (event.target as Element).closest<HTMLElement>("[data-framed-control]");
    if (!control || !entry.area.surface.contains(control)) return;
    event.preventDefault();
    const refusal = entry.area.gate(event, control);
    if (refusal?.reason === "silent" || entry.busy || !live(entry) || !entry.read) return;
    if (refusal) {
      entry.note = refusal.reason === "moved" ? t("刚移动过，请再点一次") : t("请先让这一块完整显示"); entry.danger = false;
      if (refusal.reason === "partial") { if (refusal.reveal) send("reveal", entry.id); else control.scrollIntoView({ block: "nearest", inline: "nearest" }); }
      draw(entry); return;
    }
    const name = control.dataset.framedControl!, id = name.slice(4);
    if (name.startsWith("use:")) { if (entry.accounts.some(row => row.connection_id === id)) void c.act(entry, () => c.put(entry, id)); }
    else if (Object.hasOwn(steps, name)) steps[name]!(entry);
  };

  const open = async (message: Extract<ConnectionNeedUp, { type: "connection-need-open" }>) => {
    const target = Object.keys(message).length === 3 ? needTarget(message.target) : null, key = JSON.stringify(target);
    const fail = () => send("done", message.id, { error: CONNECTION_NEED_UNAVAILABLE });
    if (!target || byId(message.id) || !scope.visible) { fail(); return; }
    // One card a target on a page: asked again, the card already there answers the new request and its place is brought into view.
    const existing = entries.get(key);
    if (existing && !existing.answered) { send("done", existing.id, { error: "AbortError" }); existing.id = message.id; send("reveal", message.id); return; }
    if (existing) close(key);
    let read: Read;
    try { read = await ask<Read>(target, { operation: "read" }); } catch { fail(); return; }
    if (!scope.alive) return;
    if (read.connection?.state === "connected") { send("done", message.id, { outcome: { status: "connected", account: { label: read.connection.label } } }); return; }
    const heights = { narrow: CONNECTION_NEED_HEIGHTS.narrow, wide: CONNECTION_NEED_HEIGHTS.wide } as { narrow: number; wide: number };
    const area = areas.open({ heights, onHeight: height => send("size", entries.get(key)?.id ?? message.id, { height }) });
    if (!area) { fail(); return; }
    area.surface.className = "mw-platform-area connection-need-area";
    area.surface.dataset.connectionNeedArea = "";
    area.surface.setAttribute("aria-label", t("连接 {name} · 来自 {owner}", { name: read.service_title, owner }));
    const entry: Entry = { id: message.id, key, target, area, heights, read, stage: "ask", accounts: [], note: "", danger: false, busy: false, answered: false };
    entries.set(key, entry);
    area.surface.addEventListener("click", event => press(entry, event));
    send("shown", entry.id, { service: read.service_title });
    // Cancelled once on this page: asked again, only the folded line shows, opened by the person (§13.5 三第 1 条).
    if (refused.has(key)) { heights.narrow = heights.wide = CONNECTION_NEED_HEIGHTS.line; entry.stage = "line"; entry.line = t("没有连上 · 再连一次"); draw(entry); return; }
    try { await begin(entry); } catch { if (live(entry)) { close(key); fail(); } }
  };
  return (message: ConnectionNeedUp) => {
    if (!message || !Number.isSafeInteger(message.id) || message.id < 1) return;
    if (message.type === "connection-need-open") { void open(message); return; }
    const entry = byId(message.id); if (!entry) return;
    if (message.type === "connection-need-close") close(entry.key);
    else if (message.type === "connection-need-layout") entry.area.layout(message.box);
  };
}

type ChildConnectionNeed = (place: HTMLElement, target: UiConnectionNeedTarget, options?: { signal?: AbortSignal }) => Promise<UiConnectionNeedOutcome>;
const childNeeds = new WeakMap<MessagePort, ChildConnectionNeed>();
/**
 * The page's half: an empty element, where it is, kept at the height the shell gives it; the answer when the person is done. One a
 * port, whoever asks for it (the client host and the slot picker share it), so their requests never share a number.
 */
export function childConnectionNeed(port: MessagePort, scope: FrameScope): ChildConnectionNeed {
  const made = childNeeds.get(port);
  if (made) return made;
  let sequence = 0;
  type Waiting = { element: HTMLElement; settle?: { resolve(outcome: UiConnectionNeedOutcome): void; reject(error: Error): void }; stop?: () => void };
  const entries = new Map<number, Waiting>(), up = (message: ConnectionNeedUp) => port.postMessage(message);
  const close = (id: number, error: Error = closed()) => {
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); places.untrack(id); entry.stop?.(); entry.settle?.reject(error);
    entry.element.style.removeProperty("height"); up({ type: "connection-need-close", id });
  };
  const places = childPlaces(scope, (id, box) => up({ type: "connection-need-layout", id, box }), id => close(id));
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  port.addEventListener("message", (event: MessageEvent<ConnectionNeedDown>) => {
    const message = event.data, entry = entries.get(message.id), kind = typeof message.type === "string" && message.type.startsWith("connection-need-") ? message.type.slice(16) : "";
    if (!entry || !kind) return;
    // One shape a kind (types.ts); read by its kind alone.
    const element = entry.element, said = message as { height?: number; service?: string; error?: string; outcome?: UiConnectionNeedOutcome };
    if (kind === "size") element.style.height = Math.max(0, Number(said.height) || 0) + "px";
    else if (kind === "reveal") element.scrollIntoView({ block: "nearest" });
    else if (kind === "shown") { element.setAttribute("role", "note"); element.setAttribute("aria-label", L("这里需要连接 {name}，连接卡在页面上", { name: String(said.service) })); }
    else if (kind !== "done") return;
    else if (said.error) close(message.id, said.error === "AbortError" ? closed() : new Error(CONNECTION_NEED_UNAVAILABLE));
    else if (said.outcome) { const settle = entry.settle, outcome = said.outcome; entry.settle = undefined; entry.stop?.(); settle?.resolve(outcome.status === "connected" ? { status: "connected", account: { label: String(outcome.account.label) } } : { status: "cancelled" }); }
  });
  const ask: ChildConnectionNeed = (place, target, options = {}) => {
    if (!scope.alive || !(place instanceof HTMLElement)) return Promise.reject(new Error(CONNECTION_NEED_UNAVAILABLE));
    const signal = options.signal;
    if (signal?.aborted) return Promise.reject(closed());
    // The same element asked again: its card closes first.
    for (const [id, entry] of entries) if (entry.element === place) close(id);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const entry: Waiting = { element: place, settle: { resolve, reject } };
      entries.set(id, entry);
      if (signal) { const abort = () => close(id); signal.addEventListener("abort", abort, { once: true }); entry.stop = () => signal.removeEventListener("abort", abort); }
      up({ type: "connection-need-open", id, target });
      places.track(id, place);
    });
  };
  childNeeds.set(port, ask);
  return ask;
}
