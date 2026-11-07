import type { UiConnectionNeedTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";
import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The connection card's markup (specs/assistant-service-connections/spec.md §13.5 三第 3 条): one card for a plugin page's place, drawn by
 * the shell outside the frame (browser/plugin-frame/connection-need.ts), and for the Assistant's pending connection (ASC-69), drawn on
 * the Host. Only words, the service's and plugin's names and the person's own account labels go in; never a key or a connection id but
 * the person's own choice buttons.
 */

/** `paste` is an image target's first key; `key` a service's pasted one after preparing (§13.5 三第 3 条). */
export type ConnectionNeedStage = "ask" | "paste" | "key" | "choose" | "expired" | "disabled" | "refused" | "running" | "unsupported" | "other" | "line";
type Say = (text: string, values?: Record<string, string | number>) => string;
/** What the markup reads. */
export interface ConnectionNeedView {
  stage: ConnectionNeedStage; note: string; danger: boolean; busy: boolean; answered: boolean; line?: string;
  read: { service_title: string; reason?: string; origin?: string; connection: { label: string } | null } | null;
  accounts: ReadonlyArray<{ connection_id: string; account_label?: string | null; display_name: string }>;
  target?: UiConnectionNeedTarget; auth?: { url: string }; other?: { label: string };
}

/**
 * A login address the card may open: https, or plain http on this computer (the one spelling of "this computer",
 * `platform/loopback`), never with a user name or password in it (`http://localhost:@evil.example/` is evil.example).
 * The Assistant's card has the same function, written into its script from this one (scripts/client/assistant-connection.ts).
 */
export function isConnectionLoginUrl(value: string): boolean {
  const url = URL.canParse(value) ? new URL(value) : null;
  return Boolean(url && (url.protocol === "https:" || isLoopbackHttpUrl(url)) && !url.username && !url.password);
}

/** A translation with a name put in: no space between two Chinese words (「连接 图像模型」 is 「连接图像模型」); a Latin name keeps its. */
export const sayNamed = (t: Say): Say => (text, values) => t(text, values).replace(/(?<=[㐀-鿿]) (?=[㐀-鿿])/gu, "");

/** The card's heights by width alone (§13.5 三第 2 条, the same steps as the platform area), and the one line it folds into. */
export const CONNECTION_NEED_HEIGHTS = { narrow: 432, wide: 344, line: 48 } as const;

const PART = "connection-need-area__";

/**
 * The card's markup: the platform's header, what the person can do now, and its buttons (§13.5 三第 3 条), one row a stage. The foot
 * holds at most the cancel and the step's own button, so the narrow step's two stacked 44px targets always fit (ASC-71); the other
 * way (换一个) is a button in the body, under what the card says.
 */
export function connectionNeedHtml(say: Say, owner: string, entry: ConnectionNeedView & { read: NonNullable<ConnectionNeedView["read"]> }): string {
  const t: (text: string, values?: Record<string, string | number>) => string = sayNamed(say), read = entry.read, name = read.service_title, account = read.connection?.label ?? "", image = entry.target?.kind === "image";
  // A button is `step` or `step=words` (the same step under another label); `*` marks the primary one.
  const button = (act: string) => {
    const [id, word = id] = act.replace("*", "").split("="), labels: Record<string, string> = { cancel: t("取消"), connect: t("连接 {name}", { name }),
      save: t("保存并接上"), check: t("保存并检查"), add: t("再加一个账号"), fill: t("填一把新的"), other: t("换一个"), relogin: t("用 {account} 重新登录", { account }),
      enable: t("启用账号"), reopen: t("再打开一次登录页"), retry: t("再连一次"), settings: t("去服务连接"), switch: t("把它用在这里") };
    return `<button type="button" class="mw-btn mw-btn--sm mw-btn--${act.endsWith("*") ? "primary" : "secondary"}" data-framed-control="${escape(id!)}">${escape(labels[word!] ?? word)}</button>`;
  };
  const buttons = (acts: string) => acts.split(" ").filter(Boolean).map(button).join("");
  const p = (part: string, text: string, more = "") => `<p class="${PART}${part}"${more}>${escape(text)}</p>`, some = (part: string, text: string) => text ? p(part, text) : "";
  if (entry.stage === "line") return `<div class="${PART}line" data-framed-area-head data-framed-area-foot>${p("said", entry.line ?? "", ' role="status" tabindex="-1"')}${entry.answered ? "" : buttons("retry")}</div>`;
  const scope = !entry.target || entry.target.kind === "image" ? t("接上后这把密钥从此只发往 {origin}", { origin: read.origin ?? "" })
    : entry.target.record_key === undefined ? t("{owner} 在所有项目都用它", { owner }) : t("只这一个来源用它");
  // [what the card says, the foot's step, a second line, another way in the body]
  const rows: Record<Exclude<ConnectionNeedStage, "line">, [string, string, string?, string?]> = {
    ask: [t("在浏览器登录 {name}，点同意；登录完会自动回到这里，接着做刚才那件事。", { name }), "connect*"],
    paste: [t("只要一把密钥，填好就接着做刚才那件事。"), "save*"],
    key: [t("填 {name} 的 API 密钥；检查通过才保存，只存在这台电脑。", { name }), "save=check*"],
    choose: [t("这件事用哪个 {name} 账号？", { name }), image ? "fill" : "connect=add", scope],
    expired: [t("{account} 的登录失效了；重新登录后接着做刚才那件事。", { account }), "relogin*", "", "other"],
    disabled: [t("这个账号你停用了；启用后所有用它的地方都恢复。"), "enable*", "", "other"],
    refused: [t("这里接着的密钥用不了了。填一把新的换过去，旧的留着。"), "save*", "", entry.accounts.length ? "other" : ""],
    running: ["", entry.auth?.url ? "reopen" : ""],
    unsupported: [t("{name} 还不能在这里一键连接。可以到「服务连接」里看能走的路。", { name }), "settings"],
    other: [t("登录回来的是 {account}。要把这一处换成它吗？别的地方不动。", { account: entry.other?.label ?? "" }), "switch*"],
  };
  const [text, acts, second = "", more = ""] = rows[entry.stage], keyed = ["paste", "key", "refused"].includes(entry.stage);
  // One form for every key the card asks for: an image's says where it goes (only that origin), where to find one and how it is kept
  // (the model settings' words, #1881); a service's that it is checked first.
  const field = keyed ? some("origin", read.origin ? t("这把密钥只发往 {origin}", { origin: read.origin }) : "")
    + `<label class="mw-field"><span class="mw-field__label">${escape(t("{name} 的 API 密钥", { name }))}</span><input class="mw-input" type="password" autocomplete="off" spellcheck="false" data-connection-need-key${entry.danger ? ' aria-invalid="true"' : ""}></label>`
    + (image ? some("hint", t("在你用的服务的控制台里找 API 密钥") + t("。加密存在这台电脑，保存后不再显示。")) : "") : "";
  const list = entry.stage === "choose" ? `<div class="mw-choice-group ${PART}accounts" role="group" aria-label="${escape(t("账号"))}">${entry.accounts.map(row =>
    `<button type="button" class="mw-choice" data-slot="choice" data-framed-control="${escape("use:" + row.connection_id)}"><span class="mw-choice__label">${escape(row.account_label || row.display_name)}</span></button>`).join("")}</div>` : "";
  return `<header class="mw-platform-area__head" data-framed-area-head><span class="mw-platform-area__kicker"><svg aria-hidden="true"><use href="#icon-link"></use></svg>${escape(t("Molis Work · 连接"))}</span><span class="mw-platform-area__owner" title="${escape(owner)}">${escape(owner)}</span>`
    + `${p("title", t("连接 {name}", { name }))}</header><div class="mw-platform-area__body" data-framed-scroll${entry.busy ? ' aria-busy="true"' : ""}>`
    + (read.reason ? p("quote", t("{owner} 说：{reason}", { owner, reason: read.reason })) : "")
    + (entry.stage === "running" ? p("wait", t("正在等你在浏览器里登录 {name}，点同意后会自动回到这里。", { name }), ' tabindex="-1"') : "") + some("text", text) + some("scope", second) + field + list
    + (more ? `<div class="${PART}more">${buttons(more)}</div>` : "")
    + `${p("note" + (entry.danger ? " is-error" : ""), entry.note, ' role="status"')}</div><footer class="${PART}foot" data-framed-area-foot>${buttons("cancel " + acts)}</footer>`;
}
