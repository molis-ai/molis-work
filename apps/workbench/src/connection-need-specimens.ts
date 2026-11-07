import type { UiConnectionNeedTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml, renderBadge } from "@molis-ai/molis-work-plugin-sdk/ui";
import { CONNECTION_NEED_HEIGHTS, connectionNeedHtml, type ConnectionNeedView } from "./connection-need-card.js";
import { CONNECTION_NEED_AREA_STYLES } from "./styles/connection-need-area.js";

/**
 * The component board's 原处的连接卡 · 平台区域版 (specs/assistant-service-connections/spec.md §13.5): the card the shell draws outside a
 * plugin page's frame, in every stage, at the wide step (560 × 344) and the narrow one (375 × 432), its folded line, and the same card
 * under an Assistant result. Drawn with the card's own markup (`connectionNeedHtml`), so the specimens are what a page shows. Marked for
 * the D track's review (`data-board-review="d-track"`). Where it differs from #1862's 原处的连接卡 (in 服务连接) is in §13.5's
 * 「与 #1862 标本的对应」. The services, accounts and the plugin's reason are sample data; nothing goes anywhere.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;
type View = Omit<ConnectionNeedView, "read"> & { read: NonNullable<ConnectionNeedView["read"]> };

const SLOT = { kind: "slot", slot_id: "github", record_key: "feed-source-1" } as const;
const IMAGE = { kind: "image", slot_id: "openai", base_url: "https://api.openai.com/v1" } as const;
// The Feed manifest's own words for its slot: the plugin's, quoted as they are in either language.
const FEED_REASON = "读取你为这个来源选好的账号";
const ACCOUNTS = [
  { connection_id: "specimen-a", account_label: "yijunw0212", display_name: "GitHub" },
  { connection_id: "specimen-b", account_label: "molis-bot", display_name: "GitHub" },
];

function view(stage: View["stage"], read: View["read"], more: Partial<View> = {}, target: UiConnectionNeedTarget | null = SLOT): View {
  return { stage, read, note: "", danger: false, busy: false, answered: false, accounts: [], ...(target ? { target } : {}), ...more };
}

/** One card as the shell holds it: a fixed width, the height that width gets (or the folded line's), the card's markup inside. */
function card(L: Say, owner: string, entry: View, width: number): string {
  const height = entry.stage === "line" ? CONNECTION_NEED_HEIGHTS.line : width < 480 ? CONNECTION_NEED_HEIGHTS.narrow : CONNECTION_NEED_HEIGHTS.wide;
  return `<div class="mw-platform-area connection-need-area" data-connection-need-specimen="${entry.stage}" data-stage="${entry.stage}" style="width:${width}px;height:${height}px">${connectionNeedHtml(L, owner, entry)}</div>`;
}

function figure(L: Say, caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen" data-board-review="d-track"><figcaption>${escapeHtml(caption)} ${renderBadge({ label: L("待 D 轨合审"), tone: "info" })}</figcaption><div class="mw-cn-board__stage">${body}</div></figure>`;
}

/** The section the board places after 平台区域. */
export function renderConnectionNeedSection(L: Say): string {
  const feed = "Feed", images = L("图片"), github = { service_title: "GitHub", reason: FEED_REASON, connection: null };
  const signedIn = { ...github, connection: { label: "yijunw0212" } };
  const imageModel = { service_title: L("图像模型"), origin: "https://api.openai.com", connection: null };
  const stages: Array<[string, string, View]> = [
    [L("还没有账号 · 在浏览器登录"), feed, view("ask", github)],
    [L("已有账号 · 这件事用哪个"), feed, view("choose", github, { accounts: ACCOUNTS })],
    [L("等你在浏览器里登录"), feed, view("running", github, { auth: { url: "https://github.com/login/oauth/authorize" } })],
    [L("填服务的密钥 · 检查通过才保存"), "Linear", view("key", { service_title: "Linear", connection: null })],
    [L("图像服务的密钥 · 只发往一个地址"), images, view("paste", imageModel, { target: IMAGE })],
    [L("密钥被拒 · 可以换一个"), images, view("refused", { ...imageModel, connection: { label: "OpenAI" } }, { target: IMAGE, accounts: ACCOUNTS.slice(0, 1), danger: true, note: L("没有连上。这里什么都没改，可以再试一次。") })],
    [L("登录失效"), feed, view("expired", signedIn, { accounts: ACCOUNTS.slice(1) })],
    [L("账号停用了"), feed, view("disabled", signedIn, { accounts: ACCOUNTS.slice(1) })],
    [L("登录回来是另一个账号"), feed, view("other", signedIn, { other: { label: "molis-bot" } })],
    [L("还不能一键连接"), "Salesforce", view("unsupported", { service_title: "Salesforce", connection: null })],
  ];
  const lines = [
    card(L, feed, view("line", github, { answered: true, line: L("已连上 {name} · {account}", { name: "GitHub", account: "yijunw0212" }) }), 560),
    card(L, feed, view("line", github, { answered: true, line: L("没有连上，这里什么都没改") }), 560),
    card(L, feed, view("line", github, { line: L("没有连上") }), 375),
  ].join("");
  const assistant = `<div class="mw-platform-area connection-need-area assistant-connection-need" data-connection-need-specimen="assistant" data-stage="ask" style="width:400px">${connectionNeedHtml(L, L("助理"), view("ask", { service_title: "GitHub", connection: null }, {}, null))}</div>`;
  return `<section class="mw-catalog__section" id="connection-need" data-primitive="connection-need"><h2>${escapeHtml(L("原处的连接卡 · 平台区域版"))}</h2>
    <div class="mw-catalog__specimens">
      ${stages.map(([caption, owner, entry]) => figure(L, caption, card(L, owner, entry, 560) + card(L, owner, entry, 375))).join("\n      ")}
      ${figure(L, L("收成一行 · 连上、取消、同一页再要"), lines)}
      ${figure(L, L("助理结果里的同一张卡"), assistant)}
    </div>
  </section>`;
}

/** The board's layout for the section; the card's own styles are the shell's. */
export const CONNECTION_NEED_SECTION_STYLES = CONNECTION_NEED_AREA_STYLES
  + `#connection-need .mw-catalog__specimen{margin:0}`
  + `.mw-cn-board__stage{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;max-width:100%;overflow-x:auto;padding:16px;border-radius:var(--r-card);background:var(--paper);box-shadow:inset 0 0 0 1px var(--line)}`
  + `.mw-cn-board__stage>.mw-platform-area{flex:none}`;
