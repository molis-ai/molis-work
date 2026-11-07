import { UI_CONNECTION_NEED_REASON_MAX, type UiConnectionNeedOutcome, type UiConnectionNeedTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";
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
type Stage = "ask" | "key" | "choose" | "expired" | "disabled" | "refused" | "running" | "failed" | "unsupported" | "other" | "line";
interface Entry { id: number; readonly key: string; readonly target: UiConnectionNeedTarget; readonly area: FramedArea; readonly heights: { narrow: number; wide: number };
  read: Read | null; stage: Stage; accounts: ConnectorConnectionView[]; note: string; danger: boolean; busy: boolean; answered: boolean;
  auth?: { id: string; url: string; method: string; relogin: boolean; timer?: ReturnType<typeof setTimeout> }; other?: Choice; line?: string }

const SLOT = /^[a-z][a-z0-9-]{0,63}$/u, RECORD = /^[A-Za-z0-9._:-]{1,200}$/u;
/** A target exactly as `UiConnectionNeedTarget` has it; a name more, or a value of another shape, is no target. */
export function needTarget(value: unknown): UiConnectionNeedTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const target = value as Record<string, unknown>, keys = Object.keys(target);
  if (target.kind === "slot" && typeof target.slot_id === "string" && SLOT.test(target.slot_id) && keys.every(key => ["kind", "slot_id", "record_key"].includes(key))
    && (target.record_key === undefined || typeof target.record_key === "string" && RECORD.test(target.record_key)))
    return { kind: "slot", slot_id: target.slot_id, ...(target.record_key === undefined ? {} : { record_key: target.record_key as string }) };
  if (target.kind === "image" && keys.length === 3 && typeof target.slot_id === "string" && target.slot_id.trim() && target.slot_id.length <= 128
    && typeof target.base_url === "string" && target.base_url.length <= 2048) return { kind: "image", slot_id: target.slot_id, base_url: target.base_url };
  return null;
}

/** The card's markup: the platform's header, what the person can do now, and its buttons (§13.5 三第 3 条). */
export function connectionNeedHtml(t: Translate, owner: string, entry: Pick<Entry, "read" | "stage" | "accounts" | "note" | "danger" | "busy" | "target" | "auth" | "other" | "line" | "answered">): string {
  const read = entry.read!, name = read.service_title, image = entry.target.kind === "image";
  const button = (act: string, label: string, primary = false) =>
    `<button type="button" class="mw-btn mw-btn--sm ${primary ? "mw-btn--primary" : "mw-btn--secondary"}" data-framed-control="${escape(act)}">${escape(label)}</button>`;
  if (entry.stage === "line") return `<div class="connection-need-area__line" data-framed-area-head data-framed-area-foot><p role="status" tabindex="-1">${escape(entry.line ?? "")}</p>${entry.answered ? "" : button("again", t("再连一次"))}</div>`;
  const account = read.connection?.label ?? "", cancel = button("cancel", t("取消"));
  const para = (text: string) => `<p class="connection-need-area__text">${escape(text)}</p>`;
  const origin = read.origin ? `<p class="connection-need-area__origin">${escape(t("这把密钥只发往 {origin}", { origin: read.origin }))}</p>` : "";
  const key = `<label class="mw-field"><span class="mw-field__label">${escape(t("{name} 的 API 密钥", { name }))}</span><input class="mw-input" type="password" autocomplete="off" spellcheck="false" data-connection-need-key${entry.danger ? ' aria-invalid="true"' : ""}></label>`;
  const scope = entry.target.kind === "slot" ? entry.target.record_key === undefined ? t("{owner} 在所有项目都用它", { owner }) : t("只这一个来源用它") : t("接上后这把密钥从此只发往 {origin}", { origin: read.origin ?? "" });
  const accounts = entry.accounts.map(row => `<button type="button" class="mw-choice" data-slot="choice" data-framed-control="${escape("use:" + row.connection_id)}"><span class="mw-choice__label">${escape(row.account_label || row.display_name)}</span></button>`).join("");
  const bodies: Record<Exclude<Stage, "line">, [string, string]> = {
    ask: [image ? para(t("只要一把密钥，填好就接着做刚才那件事。")) + origin + key : para(t("在浏览器登录 {name}，点同意；登录完会自动回到这里，接着做刚才那件事。", { name })),
      image ? button("save", t("保存并接上"), true) : button("connect", t("连接 {name}", { name }), true)],
    key: [para(t("填 {name} 的 API 密钥；检查通过才保存，只存在这台电脑。", { name })) + key, button("save", t("保存并检查"), true)],
    choose: [para(scope) + `<div class="mw-choice-group connection-need-area__accounts" role="group" aria-label="${escape(t("账号"))}">${accounts}</div>`, button("add", image ? t("填一把新的") : t("再加一个账号"))],
    expired: [para(t("{account} 的登录失效了；重新登录后接着做刚才那件事。", { account })), button("other", t("换一个")) + button("relogin", t("用 {account} 重新登录", { account }), true)],
    disabled: [para(t("这个账号你停用了；启用后所有用它的地方都恢复。")), button("other", t("换一个")) + button("enable", t("启用"), true)],
    refused: [para(t("这里接着的密钥用不了了。填一把新的换过去，旧的留着。")) + origin + key, (entry.accounts.length ? button("other", t("换一个")) : "") + button("save", t("保存并接上"), true)],
    running: [`<p class="connection-need-area__wait" tabindex="-1">${escape(t("正在等你在浏览器里登录 {name}…", { name }))}</p>` + para(t("登录、点同意后会自动回到这里。")),
      entry.auth?.url ? button("reopen", t("再打开一次登录页")) : ""],
    failed: [para(t("没有连上。这里什么都没改，可以再试一次。")), button("retry", t("再试一次"), true)],
    unsupported: [para(t("{name} 还不能在这里一键连接。可以到「服务连接」里看能走的路。", { name })), button("settings", t("去服务连接"))],
    other: [para(t("登录回来的是 {account}。要把这一处换成它吗？别的地方不动。", { account: entry.other?.label ?? "" })), button("switch", t("把它用在这里"), true)],
  };
  const [body, actions] = bodies[entry.stage];
  const quote = read.reason ? `<p class="connection-need-area__quote">${escape(t("{owner} 说：{reason}", { owner, reason: read.reason }))}</p>` : "";
  const note = `<p class="connection-need-area__note${entry.danger ? " is-error" : ""}" role="status">${escape(entry.note)}</p>`;
  return `<header class="mw-platform-area__head" data-framed-area-head><span class="mw-platform-area__kicker"><svg aria-hidden="true"><use href="#icon-link"></use></svg>${escape(t("Molis Work · 连接"))}</span><span class="mw-platform-area__owner" title="${escape(owner)}">${escape(owner)}</span>`
    + `<p class="connection-need-area__title">${escape(t("连接 {name}", { name }))}</p></header>`
    + `<div class="mw-platform-area__body" data-framed-scroll${entry.busy ? ' aria-busy="true"' : ""}>${quote}${body}${note}</div>`
    + `<footer class="connection-need-area__foot" data-framed-area-foot>${entry.stage === "unsupported" ? button("close", t("关掉")) : cancel}${actions}</footer>`;
}

/** What the Host's answer and the person's accounts make the card show first (§13.5 三第 3 条). */
function startStage(entry: Entry): Stage {
  const bound = entry.read!.connection;
  if (bound) return entry.target.kind === "image" ? "refused" : entry.read!.disabled ? "disabled" : "expired";
  return entry.accounts.length ? "choose" : "ask";
}

/**
 * The trusted half. `owner` is the installation's name as the shell lists it. The installation, project and person are the page's
 * authority (the Host route reads them from the outer header), never anything here.
 */
export function pageConnectionNeed(port: MessagePort, scope: FrameScope, areas: PageFramedAreas, pageId: string, route: (path: string) => string, t: Translate, owner: string) {
  const entries = new Map<string, Entry>(), refused = new Set<string>();
  const send = (message: ConnectionNeedDown) => { if (scope.alive) port.postMessage(message); };
  const card = <T>(target: UiConnectionNeedTarget, body: Record<string, unknown>) => molisWorkRequest<T>(route("/api/host/plugin-page-connection"),
    { body: { target, ...body }, headers: { "x-molis-context-page": pageId }, scope });
  const settings = <T>(path: string, body?: unknown, method?: "GET" | "POST" | "PATCH" | "DELETE") => molisWorkRequest<T>("/api/settings/connectors/" + path, { scope, ...(body === undefined ? {} : { body }), ...(method ? { method } : {}) });
  const byId = (id: number) => [...entries.values()].find(entry => entry.id === id);
  const live = (entry: Entry) => scope.alive && entries.get(entry.key) === entry;
  const draw = (entry: Entry) => {
    if (!live(entry)) return;
    const typed = entry.area.surface.querySelector<HTMLInputElement>("[data-connection-need-key]")?.value ?? "";
    entry.area.surface.dataset.stage = entry.stage;
    entry.area.redraw(connectionNeedHtml(t, owner, entry));
    const key = entry.area.surface.querySelector<HTMLInputElement>("[data-connection-need-key]"); if (key) key.value = typed;
  };
  const stop = (entry: Entry) => { clearTimeout(entry.auth?.timer); };
  const close = (key: string) => { const entry = entries.get(key); if (!entry) return; stop(entry); entry.area.close(); entries.delete(key); };
  scope.own(() => { for (const key of [...entries.keys()]) close(key); });
  /** Folds the card into its one line, after the page has its answer; the focus, if it was in the card, lands on the line. */
  const fold = (entry: Entry, line: string, outcome?: UiConnectionNeedOutcome) => {
    stop(entry); entry.auth = undefined;
    const held = entry.area.surface.contains(document.activeElement);
    if (outcome && !entry.answered) { entry.answered = true; send({ type: "connection-need-done", id: entry.id, outcome }); }
    entry.heights.narrow = entry.heights.wide = CONNECTION_NEED_HEIGHTS.line;
    entry.stage = "line"; entry.line = line; entry.busy = false; draw(entry);
    if (held) entry.area.surface.querySelector<HTMLElement>("[role=status]")?.focus({ preventScroll: true });
  };
  const connected = (entry: Entry, choice: Choice) => fold(entry, t("已连上 {name} · {account}", { name: entry.read!.service_title, account: choice.label }), { status: "connected", account: { label: choice.label } });
  /** Reads the target and, when nothing usable is on it, this service's accounts the card may offer (an image target's: unpinned or pinned here). */
  const load = async (entry: Entry) => {
    entry.read = await card<Read>(entry.target, { operation: "read" });
    const directory = await settings<{ connections: Array<ConnectorConnectionView | { project_id: string }> }>("connections?service_id=" + encodeURIComponent(entry.read.service_id));
    entry.accounts = directory.connections.filter((row): row is ConnectorConnectionView => !("project_id" in row) && row.state === "connected"
      && row.connection_id !== entry.read?.connection?.connection_id && (!row.target_origin || row.target_origin === entry.read?.origin));
  };
  const begin = async (entry: Entry) => {
    entry.heights.narrow = CONNECTION_NEED_HEIGHTS.narrow; entry.heights.wide = CONNECTION_NEED_HEIGHTS.wide;
    await load(entry);
    if (!live(entry)) return;
    if (entry.read!.connection?.state === "connected") { connected(entry, entry.read!.connection); return; }
    entry.stage = startStage(entry); entry.note = ""; entry.danger = false; draw(entry);
  };
  /** One write, at most one at a time; a failure is said in the card, and the person may try again (§13.5 三第 3 条). */
  const act = async (entry: Entry, work: () => Promise<void>) => {
    entry.busy = true; entry.note = ""; entry.danger = false; draw(entry);
    try { await work(); }
    catch (error) {
      if (!live(entry)) return;
      const failure = error as { code?: string; message?: string };
      if (failure.code === "connector.setup.unsupported") { entry.stage = "unsupported"; return; }
      entry.note = failure.code === "connector.check.rate_limited" ? t("{name}那边暂时限流，密钥没有保存；稍后再试。", { name: entry.read!.service_title })
        : failure.message || t("没有连上。这里什么都没改，可以再试一次。");
      entry.danger = true;
    } finally { if (live(entry)) { entry.busy = false; if (entry.stage !== "line") draw(entry); } }
  };
  /** The connection the person ended with goes on this place: a first one is bound, another over a working one is a switch (S-108). */
  const put = async (entry: Entry, connection_id: string) => {
    const bound = entry.read!.connection;
    const answer = await card<Read>(entry.target, { operation: bound && bound.connection_id !== connection_id && entry.target.kind === "slot" ? "switch" : "bind", connection_id });
    if (!live(entry)) return;
    if (answer.connection?.state === "connected") connected(entry, answer.connection); else { entry.read = answer; entry.stage = startStage(entry); }
  };
  /** The login a card started: read every 2 s while the page shows, and at once when the window comes back (§13.5 三第 6 条). */
  const watch = (entry: Entry) => {
    const auth = entry.auth; if (!auth) return;
    const poll = async () => {
      clearTimeout(auth.timer);
      if (!live(entry) || entry.auth !== auth) return;
      if (!scope.visible) { auth.timer = setTimeout(() => void poll(), 2000); return; }
      let state: { status: string; connection_id?: string };
      try { state = await settings("authorizations/" + encodeURIComponent(auth.id)); }
      catch (error) { state = { status: (error as { status?: number }).status === 404 ? "expired" : "pending" }; }
      if (!live(entry) || entry.auth !== auth) return;
      if (state.status === "connected") {
        entry.auth = undefined;
        await act(entry, async () => {
          const now = await card<Read>(entry.target, { operation: "read" });
          if (!live(entry)) return;
          if (now.connection?.state === "connected") { connected(entry, now.connection); return; }
          // Logging in again came back as another account: offered for this one place, never put there unasked (§13.2).
          if (auth.relogin && state.connection_id && state.connection_id !== now.connection?.connection_id) {
            await load(entry); const row = entry.accounts.find(item => item.connection_id === state.connection_id);
            entry.other = { connection_id: state.connection_id, label: row ? row.account_label || row.display_name : "", auth_method: "", state: "connected" }; entry.stage = "other"; return;
          }
          if (state.connection_id) await put(entry, state.connection_id);
        });
      } else if (["cancelled", "failed", "expired"].includes(state.status)) { entry.auth = undefined; entry.stage = "failed"; draw(entry); }
      else auth.timer = setTimeout(() => void poll(), 2000);
    };
    auth.timer = setTimeout(() => void poll(), 2000);
    scope.listen(window, "focus", () => { if (entry.auth === auth) void poll(); });
  };
  /** 连接 / 再加一个 / 用原账号重新登录: the person's login, prepared as the person (C2), then in the browser or with a pasted key. */
  const connect = (entry: Entry, relogin: boolean) => {
    // Reserved during the press, so a browser that blocks a later window does not; a desktop shell opens the system browser instead.
    const popup = globalThis.molisWorkOpenExternalUrl ? null : window.open("", "_blank");
    if (popup) popup.opener = null;
    void act(entry, async () => { try {
      const prepared = await card<Read>(entry.target, { operation: "prepare", ...(relogin ? { connection_id: entry.read!.connection!.connection_id } : {}) });
      const authorization = prepared.authorization!;
      if (!live(entry)) { popup?.close(); return; }
      if (authorization.method !== "oauth") { popup?.close(); entry.auth = { id: authorization.authorization_id, url: "", method: authorization.method, relogin }; entry.stage = "key"; return; }
      const started = await settings<{ authorization_url: string; authorization_id?: string }>("methods/oauth/start", { service_id: prepared.service_id, display_name: prepared.service_title, setup_id: authorization.authorization_id,
        ...(relogin ? { connection_id: entry.read!.connection!.connection_id } : {}) });
      const url = new URL(started.authorization_url);
      if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error(t("服务返回的授权地址无效，请重试。"));
      if (!live(entry)) { popup?.close(); return; }
      entry.auth = { id: started.authorization_id ?? authorization.authorization_id, url: url.href, method: "oauth", relogin };
      if (globalThis.molisWorkOpenExternalUrl) await globalThis.molisWorkOpenExternalUrl(url.href); else if (popup && !popup.closed) popup.location.replace(url.href);
      else entry.note = t("浏览器拦截了新窗口。点「再打开一次登录页」继续登录。");
      entry.stage = "running"; watch(entry);
    } catch (error) { popup?.close(); throw error; } });
  };
  /** A key typed in the card: an image target's is saved, pinned and put on it by C2 in one pass; a service's goes through the connections page's own check-before-save. */
  const save = (entry: Entry) => {
    const input = entry.area.surface.querySelector<HTMLInputElement>("[data-connection-need-key]"), value = input?.value.trim() ?? "";
    if (!value) { input?.focus(); return; }
    void act(entry, async () => {
      if (entry.target.kind === "image") {
        const answer = await card<Read>(entry.target, { operation: "save_key", api_key: value });
        if (live(entry) && answer.connection?.state === "connected") connected(entry, answer.connection);
        return;
      }
      const auth = entry.auth!, read = entry.read!;
      const saved = await (auth.relogin ? settings<{ connection: { connection_id: string } }>("connections/" + encodeURIComponent(read.connection!.connection_id), { token: value, setup_id: auth.id }, "PATCH")
        : settings<{ connection: { connection_id: string } }>("connections", { service_id: read.service_id, display_name: read.service_title, token: value, setup_id: auth.id }));
      if (!live(entry)) return;
      entry.auth = undefined;
      if (auth.relogin) { const now = await card<Read>(entry.target, { operation: "read" }); if (live(entry) && now.connection?.state === "connected") connected(entry, now.connection); return; }
      await put(entry, saved.connection.connection_id);
    });
  };
  const cancel = (entry: Entry) => {
    const auth = entry.auth; stop(entry); entry.auth = undefined; refused.add(entry.key);
    // The login under way is cancelled as the person (§4.6.1): a late return then only leaves its connection, put on no place.
    if (auth) void settings("authorizations/" + encodeURIComponent(auth.id), undefined, "DELETE").catch(() => undefined);
    fold(entry, t("没有连上，这里什么都没改"), { status: "cancelled" });
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
      if (refusal.reason === "partial" && refusal.reveal) send({ type: "connection-need-reveal", id: entry.id });
      if (refusal.reason === "partial" && !refusal.reveal) control.scrollIntoView({ block: "nearest", inline: "nearest" });
      draw(entry); return;
    }
    const name = control.dataset.framedControl!;
    if (name.startsWith("use:")) { const id = name.slice(4); if (entry.accounts.some(row => row.connection_id === id)) void act(entry, () => put(entry, id)); return; }
    if (name === "cancel" || name === "close") cancel(entry);
    else if (name === "add" && entry.target.kind === "image") { entry.stage = "ask"; draw(entry); }
    else if (name === "connect" || name === "add") connect(entry, false);
    else if (name === "relogin" && entry.stage === "expired") connect(entry, true);
    else if (name === "save") save(entry);
    else if (name === "enable" && entry.stage === "disabled") void act(entry, async () => { const answer = await card<Read>(entry.target, { operation: "enable" });
      if (live(entry)) { if (answer.connection?.state === "connected") connected(entry, answer.connection); else { entry.read = answer; entry.stage = startStage(entry); } } });
    else if (name === "other") { entry.stage = "choose"; draw(entry); }
    else if (name === "switch" && entry.other) { const other = entry.other; void act(entry, () => put(entry, other.connection_id)); }
    else if (name === "reopen" && entry.auth?.url) window.open(entry.auth.url, "_blank", "noopener,noreferrer");
    else if (name === "retry" || name === "again") void act(entry, () => begin(entry));
    else if (name === "settings") { const url = new URL("/settings/connectors?connector=" + encodeURIComponent(entry.read.service_id), location.origin); document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: url.href } })); }
  };

  const open = async (message: Extract<ConnectionNeedUp, { type: "connection-need-open" }>) => {
    const target = Object.keys(message).length === 3 ? needTarget(message.target) : null, key = JSON.stringify(target);
    const fail = () => send({ type: "connection-need-done", id: message.id, error: CONNECTION_NEED_UNAVAILABLE });
    if (!target || byId(message.id) || !scope.visible) { fail(); return; }
    // One card a target on a page: asked again, the card already there answers the new request and its place is brought into view.
    const existing = entries.get(key);
    if (existing && !existing.answered) { send({ type: "connection-need-done", id: existing.id, error: "AbortError" }); existing.id = message.id; send({ type: "connection-need-reveal", id: message.id }); return; }
    if (existing) close(key);
    let read: Read;
    try { read = await card<Read>(target, { operation: "read" }); } catch { fail(); return; }
    if (!scope.alive) return;
    if (read.connection?.state === "connected") { send({ type: "connection-need-done", id: message.id, outcome: { status: "connected", account: { label: read.connection.label } } }); return; }
    const heights: { narrow: number; wide: number } = { narrow: CONNECTION_NEED_HEIGHTS.narrow, wide: CONNECTION_NEED_HEIGHTS.wide };
    const area = areas.open({ heights, onHeight: height => { const entry = entries.get(key); send({ type: "connection-need-size", id: entry?.id ?? message.id, height }); } });
    if (!area) { fail(); return; }
    area.surface.className = "mw-platform-area connection-need-area";
    area.surface.dataset.connectionNeedArea = "";
    const reason = read.reason ? [...read.reason].slice(0, UI_CONNECTION_NEED_REASON_MAX).join("") : undefined;
    read = { ...read, ...(reason ? { reason } : {}) };
    area.surface.setAttribute("aria-label", t("连接 {name} · 来自 {owner}", { name: read.service_title, owner }));
    const entry: Entry = { id: message.id, key, target, area, heights, read, stage: "ask", accounts: [], note: "", danger: false, busy: false, answered: false };
    entries.set(key, entry);
    area.surface.addEventListener("click", event => press(entry, event));
    send({ type: "connection-need-shown", id: entry.id, service: read.service_title });
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

/** The page's half: an empty element, where it is, kept at the height the shell gives it; the answer when the person is done. */
export function childConnectionNeed(port: MessagePort, scope: FrameScope) {
  let sequence = 0;
  const entries = new Map<number, { element: HTMLElement; settle?: { resolve(outcome: UiConnectionNeedOutcome): void; reject(error: Error): void }; stop?: () => void }>();
  const aborted = () => new DOMException("Card closed", "AbortError");
  const close = (id: number, error: Error = aborted()) => {
    const entry = entries.get(id); if (!entry) return;
    entries.delete(id); places.untrack(id); entry.stop?.(); entry.settle?.reject(error);
    entry.element.style.removeProperty("height"); port.postMessage({ type: "connection-need-close", id } satisfies ConnectionNeedUp);
  };
  const places = childPlaces(scope, (id, box) => port.postMessage({ type: "connection-need-layout", id, box } satisfies ConnectionNeedUp), id => close(id));
  scope.own(() => { for (const id of [...entries.keys()]) close(id); });
  port.addEventListener("message", (event: MessageEvent<ConnectionNeedDown>) => {
    const message = event.data, entry = entries.get(message.id);
    if (!entry || !message.type.startsWith("connection-need-")) return;
    if (message.type === "connection-need-size") entry.element.style.height = Math.max(0, message.height) + "px";
    else if (message.type === "connection-need-reveal") entry.element.scrollIntoView({ block: "nearest" });
    else if (message.type === "connection-need-shown") { entry.element.setAttribute("role", "note"); entry.element.setAttribute("aria-label", L("这里需要连接 {name}，连接卡在页面上", { name: message.service })); }
    else if (message.error) close(message.id, message.error === "AbortError" ? aborted() : new Error(CONNECTION_NEED_UNAVAILABLE));
    else if (message.outcome) { const settle = entry.settle; entry.settle = undefined; entry.stop?.(); settle?.resolve(message.outcome.status === "connected" ? { status: "connected", account: { label: String(message.outcome.account.label) } } : { status: "cancelled" }); }
  });
  return (place: HTMLElement, target: UiConnectionNeedTarget, options: { signal?: AbortSignal } = {}): Promise<UiConnectionNeedOutcome> => {
    if (!scope.alive || !(place instanceof HTMLElement)) return Promise.reject(new Error(CONNECTION_NEED_UNAVAILABLE));
    if (options.signal?.aborted) return Promise.reject(aborted());
    // The same element asked again: its card closes first.
    for (const [id, entry] of entries) if (entry.element === place) close(id);
    const id = ++sequence, signal = options.signal;
    return new Promise((resolve, reject) => {
      const entry: { element: HTMLElement; settle?: { resolve(outcome: UiConnectionNeedOutcome): void; reject(error: Error): void }; stop?: () => void } = { element: place, settle: { resolve, reject } };
      entries.set(id, entry);
      if (signal) { const abort = () => close(id); signal.addEventListener("abort", abort, { once: true }); entry.stop = () => signal.removeEventListener("abort", abort); }
      port.postMessage({ type: "connection-need-open", id, target } satisfies ConnectionNeedUp);
      places.track(id, place);
    });
  };
}
