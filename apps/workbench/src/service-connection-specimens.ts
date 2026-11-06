import { readFileSync } from "node:fs";
import { escapeHtml, renderAlert, renderButton, renderField, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderConnectorMark } from "./settings-connectors.js";
import {
  renderConnectionCard, renderConnectionItem, renderConnectionProgress, SERVICE_CONNECTION_PART_STYLES,
  type ConnectionProgressState,
} from "./service-connection-parts.js";

/**
 * The component board's 服务连接 section: the three parts plan A of the service-connection decision added
 * (specs/assistant-service-connections §13.1; the prototype is docs/design/service-connections/), each in every state it
 * has — not started, under way, refused, cancelled, rate limited, done. The services, accounts and keys are sample data;
 * nothing signs in or is stored. The two 试一下 specimens move on timers, the way a real connection would.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

const SIGN_IN = ["在浏览器登录", "看能做什么", "能用了"] as const;
const KEY = ["填密钥", "验证密钥", "能用了"] as const;

function figure(caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(caption)}</figcaption>${body}</figure>`;
}

function steps(L: Say, names: readonly string[], at: number, state: ConnectionProgressState): string {
  return renderConnectionProgress({ steps: names.map((name) => L(name)), at, state }, L);
}

function feedback(status: string, body: string): string {
  return `<div class="settings-connector-feedback" role="status">${status}<p>${escapeHtml(body)}</p></div>`;
}

function primary(label: string, attrs: Record<string, string> = {}): string {
  return renderButton({ label, variant: "primary", key: "↵", attrs });
}

function capabilities(L: Say, can: readonly string[], not?: string): string {
  return `<ul class="settings-connector-capabilities">${can.map((one) => `<li data-fulfillment="live"><span>${escapeHtml(L("能"))}</span>${escapeHtml(L(one))}</li>`).join("")}${not ? `<li data-fulfillment="not"><span>${escapeHtml(L("没申请"))}</span>${escapeHtml(L(not))}</li>` : ""}</ul>`;
}

const state = (tone: string, ring: string, label: string) => `<span class="settings-state settings-state--${tone}" data-mw-state="${ring}">${escapeHtml(label)}</span>`;
const running = (label: string) => renderStatusMark({ label, state: "running", tone: "progress", plain: true });

function keyField(L: Say, rejected: boolean): string {
  return renderField({
    label: L("MiniMax 的 API 密钥"),
    hint: rejected ? undefined : L("在 MiniMax 开放平台的「接口密钥」里新建一把；只存在本机钥匙串。"),
    error: rejected ? L("MiniMax 拒绝了这把密钥（401），可能过期或少复制了字符。还没保存。") : undefined,
    control: `<input class="mw-input" data-slot="input" type="password" autocomplete="off" value="sk-cp-7f3a"${rejected ? ' aria-invalid="true"' : ""} aria-label="${escapeHtml(L("MiniMax 的 API 密钥"))}">`,
  });
}

function rowsSpecimen(L: Say): string {
  const item = (id: string, service: string, name: string, caption: string, mark: string, body: string, open = true) =>
    renderConnectionItem({ id: `board-conn-${id}`, mark: renderConnectorMark(service, escapeHtml), name, caption: L(caption), state: mark, body, open }, L);
  const group = (title: string, rows: string) => `<section class="settings-connector-subgroup"><h3>${escapeHtml(L(title))}</h3>${rows}</section>`;
  const github = item("github", "github", "GitHub", "读通知、看仓库、推送代码", state("neutral", "disconnected", L("未连接")),
    `<ol class="settings-connector-steps"><li><strong>${escapeHtml(L("在浏览器登录 {name}，点同意", { name: "GitHub" }))}</strong><p>${escapeHtml(L("登录完会自动回到这里，不用复制任何东西。"))}</p></li></ol>${capabilities(L, ["读通知", "看仓库"], "改仓库内容")}${primary(L("连接 {name}", { name: "GitHub" }))}`);
  const vercel = item("vercel", "vercel", "Vercel", "看部署和预览地址", state("success", "connected", L("已连接 · {account}", { account: "yijun" })),
    `${steps(L, SIGN_IN, 2, "done")}${renderAlert({ title: L("{name} 能用了 · {account}", { name: "Vercel", account: "yijun" }), tone: "success" })}${capabilities(L, ["看部署", "看预览地址"])}`, false);
  const linear = item("linear", "linear", "Linear", "读和建任务", running(L("连接中")),
    `${steps(L, SIGN_IN, 0, "running")}${feedback(running(L("正在等你在浏览器里登录 {name}…", { name: "Linear" })), L("登录、点同意后会自动回到这里。关掉这个页面也没关系，回来时接着走。"))}${renderButton({ label: L("再打开一次登录页"), variant: "secondary" })}`);
  const notion = item("notion", "notion", "Notion", "读页面和数据库", state("neutral", "cancelled", L("没连上")),
    `${steps(L, SIGN_IN, 0, "cancelled")}${feedback(renderStatusMark({ label: L("没有连上"), state: "cancelled", tone: "quiet", plain: true }), L("登录页关了，或在 {name} 那边点了取消。这里什么都没改。", { name: "Notion" }))}${primary(L("再连一次"))}`);
  const slack = item("slack", "slack", "Slack", "读频道消息", state("warning", "retrying", L("暂时限流")),
    `${steps(L, SIGN_IN, 1, "hold")}${renderAlert({ title: L("{name} 暂时限流", { name: "Slack" }), body: L("是 Slack 那边在限流，不是你的问题。已经连上了，能做什么还没查完；约 1 分钟后自动再查，不用你做什么。"), tone: "warning" })}${renderButton({ label: L("现在再查"), variant: "secondary" })}`);
  const minimax = item("minimax", "model-api", "MiniMax", "文字模型", state("danger", "failed", L("密钥被拒")),
    `${steps(L, KEY, 0, "failed")}${keyField(L, true)}${primary(L("保存并检查"))}`);
  return `<div class="mw-conn-board__rows" data-connectors-settings><div class="settings-connector-catalog">${group("代码与项目", github + vercel)}${group("文档与任务", linear + notion)}${group("消息", slack)}${group("模型", minimax)}</div></div>`;
}

function progressSpecimen(L: Say): string {
  const one = (label: string, names: readonly string[], at: number, s: ConnectionProgressState) => `<li><span>${escapeHtml(L(label))}</span>${steps(L, names, at, s)}</li>`;
  const list = `<ul class="mw-conn-board__states">${one("第一步进行中", SIGN_IN, 0, "running")}${one("第二步进行中", SIGN_IN, 1, "running")}${one("服务限流", SIGN_IN, 1, "hold")}${one("密钥被拒", KEY, 0, "failed")}${one("取消登录", SIGN_IN, 0, "cancelled")}${one("完成", SIGN_IN, 2, "done")}</ul>`;
  const names = SIGN_IN.map((name) => L(name));
  const live = `<div class="mw-conn-board__try" data-conn-progress-demo data-steps="${escapeHtml(JSON.stringify(names))}" data-caption="${escapeHtml(L("第 {n} 步，共 {total} 步：{step}"))}" data-words="${escapeHtml(JSON.stringify({ hold: L("等服务那边"), failed: L("没通过"), cancelled: L("取消了") }))}">
    ${renderConnectionProgress({ steps: names, at: 0, state: "running" }, L)}
    <div class="mw-catalog__row">${renderButton({ label: L("下一步"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "next" } })}${renderButton({ label: L("限流"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "hold" } })}${renderButton({ label: L("出错"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "failed" } })}${renderButton({ label: L("取消"), variant: "secondary", size: "sm", attrs: { "data-conn-step": "cancelled" } })}${renderButton({ label: L("重来"), variant: "ghost", size: "sm", attrs: { "data-conn-step": "reset" } })}</div>
  </div>`;
  return `${list}${figure(L("试一下 · 读屏会听到每一步"), live)}`;
}

function cardsSpecimen(L: Say): string {
  const github = renderConnectorMark("github", escapeHtml), image = renderConnectorMark("image-api", escapeHtml), model = renderConnectorMark("model-api", escapeHtml);
  const connected = L("已连上 {name} · {account}", { name: "GitHub", account: "yijunw0212" });
  const ask = renderConnectionCard({ mark: github, state: "ask", title: L("要读你的 GitHub 通知，先连上 GitHub"), reason: L("连好以后接着做这件事。"), connected, action: primary(L("连接 {name}", { name: "GitHub" })) });
  const expired = renderConnectionCard({ mark: github, state: "ask", title: L("GitHub 的登录过期了，读到第 2 页停下了"), reason: L("重新登录后从第 3 页接着读，不从头来。"), connected, action: primary(L("用 {account} 重新登录", { account: "yijunw0212" })) });
  const busy = renderConnectionCard({ mark: image, state: "running", title: L("生成封面要一个图像模型"), reason: L("只要一把密钥。生成完就回到这里，提示词还在。"), connected: "",
    body: `${steps(L, KEY, 1, "running")}${feedback(running(L("正在让 {name} 回一句话…", { name: L("图像模型") })), L("通常几秒钟；关掉也没关系，回来时接着查。"))}` });
  const refused = renderConnectionCard({ mark: model, state: "failed", title: L("写摘要要一个文字模型"), reason: L("只要一把密钥。连好就接着写，你选的那几条还在。"), connected: "",
    body: `${steps(L, KEY, 0, "failed")}${keyField(L, true)}`, action: primary(L("保存并检查")) });
  const cancelled = renderConnectionCard({ mark: github, state: "cancelled", title: L("没连上 {name}", { name: "GitHub" }), reason: L("这件事先停在这里，你写的还在。"), connected, action: primary(L("再连一次")) });
  const done = renderConnectionCard({ mark: github, state: "done", title: "", reason: "", connected });
  const live = renderConnectionCard({ mark: github, state: "ask", title: L("要读你的 GitHub 通知，先连上 GitHub"), reason: L("连好以后接着做这件事。"), connected,
    body: `${steps(L, SIGN_IN, 0, "running")}<div class="settings-connector-feedback" role="status" data-conn-card-say="${escapeHtml(L("正在看 {account} 能做什么…", { account: "yijunw0212" }))}">${running(L("正在等你在浏览器里登录 {name}…", { name: "GitHub" }))}<p>${escapeHtml(L("登录、点同意后会自动回到这里。关掉这个页面也没关系，回来时接着走。"))}</p></div>`, action: primary(L("连接 {name}", { name: "GitHub" }), { "data-conn-card-go": "" }) });
  const tryIt = `<div class="mw-conn-board__try" data-conn-card-demo data-steps="${escapeHtml(JSON.stringify(SIGN_IN.map((name) => L(name))))}" data-caption="${escapeHtml(L("第 {n} 步，共 {total} 步：{step}"))}">${live}<div class="mw-catalog__row">${renderButton({ label: L("重来"), variant: "ghost", size: "sm", attrs: { "data-conn-card-reset": "" } })}</div></div>`;
  return `<div class="mw-conn-board__cards">${figure(L("还没开始"), ask)}${figure(L("登录失效"), expired)}${figure(L("在卡里连"), busy)}${figure(L("密钥被拒"), refused)}${figure(L("取消登录"), cancelled)}${figure(L("连好了 · 收成一行"), done)}</div>${figure(L("试一下 · 连好后卡收成一行"), tryIt)}`;
}

/** The section the board places after 插件行视图: three specimens, each part in its states. */
export function renderServiceConnectionSection(L: Say): string {
  return `<section class="mw-catalog__section" id="service-connections" data-primitive="service-connections"><h2>${escapeHtml(L("服务连接"))}</h2>
    <div class="mw-catalog__specimens">
      ${figure(L("就地展开的服务行 · 点一行或行尾的按钮"), rowsSpecimen(L))}
      ${figure(L("步骤进度说明 · 第几步、共几步、在做什么"), progressSpecimen(L))}
      ${figure(L("原处的连接卡 · 在缺连接的地方连"), cardsSpecimen(L))}
    </div>
  </section>`;
}

/** The board's own layout for the section (the parts' styles come first); the cards sit in a column as narrow as a conversation. */
export const SERVICE_CONNECTION_SECTION_STYLES = SERVICE_CONNECTION_PART_STYLES
  + `#service-connections .mw-catalog__specimen{margin:0}.mw-conn-board__rows{max-width:760px}.mw-conn-board__rows .settings-connector-catalog{display:grid;gap:24px;padding-top:0}`
  + `.mw-conn-board__states{display:grid;gap:8px;margin:0;padding:0;list-style:none}.mw-conn-board__states>li{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:12px;min-width:0}.mw-conn-board__states>li>span:first-child{color:var(--muted);font-size:12px}`
  + `.mw-conn-board__try{display:grid;gap:12px;max-width:560px;padding:16px;border-radius:var(--r-card);background:var(--surface-soft)}`
  + `.mw-conn-board__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:24px;align-items:start}`
  + `@media (max-width:760px){.mw-conn-board__states>li{grid-template-columns:minmax(0,1fr);gap:4px}}`;

/** The section's program, written in `src/browser/board/service-connection-section.ts` and bundled into `dist/` when the package builds. */
export const SERVICE_CONNECTION_SECTION_SCRIPT = readFileSync(new URL("./board-service-connection-section.js", import.meta.url), "utf8").trim();
