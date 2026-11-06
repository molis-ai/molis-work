import { readFileSync } from "node:fs";
import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RECEIPT_LAYERS_STYLES, renderReceiptLayersSpecimen } from "./receipt-layers-specimen.js";

/**
 * The component board's 协作零件 section: the parts the four Molis Work introduction demos (a bad review fixed the same day,
 * a passing wish turned into a plugin, a daily topic list, a trending post published) all draw — who is a person and who an
 * AI, a goal's completion requirements with their evidence, a discussion's topics, what an AI brings and the answers that can
 * be tapped, the sources that say the same thing and the rule that raised them, and a per-platform review before sending.
 * They are proposals for review (定样), not shipped parts: the markup and styles live on the board until they are approved
 * and moved into the design system. The demo copy is sample data.
 */

type Kind = "person" | "ai";
interface Who { readonly name: string; readonly kind: Kind; readonly mark?: string; readonly assistant?: boolean }

const YOU: Who = { name: "你", kind: "person" };
const ZHE: Who = { name: "阿哲", kind: "person", mark: "哲" };
const CODEX: Who = { name: "Codex", kind: "ai" };
const CLAUDE: Who = { name: "Claude Code", kind: "ai" };
const ASSISTANT: Who = { name: "助理", kind: "ai", assistant: true };

/** A person is round, an AI is square; the Assistant carries its spark instead of an initial. */
function who(entry: Who, size: "sm" | "lg" = "sm"): string {
  const face = entry.assistant ? icon("sparkles") : (entry.mark ?? Array.from(entry.name)[0]!);
  return `<span class="mw-who${size === "lg" ? " mw-who--lg" : ""}" data-kind="${entry.kind}"${entry.assistant ? " data-assistant" : ""} role="img" aria-label="${entry.name}（${entry.kind === "ai" ? "AI" : "人"}）">${face}</span>`;
}

/** Who has it: the person's round face, and the AI they handed it to stacked behind. */
function owner(label: string, ...faces: Who[]): string {
  return `<span class="mw-owner"><span class="mw-owner__faces">${faces.map((face) => who(face)).join("")}</span><span>${label}</span></span>`;
}

function specimen(caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${caption}</figcaption>${body}</figure>`;
}

function requirement(state: "done" | "open" | "none", title: string, evidence: string, extra: string): string {
  const checked = state === "done";
  const label = state === "none" ? `${title}：还没有依据，先不能勾` : `${title}：${checked ? "已验过，点一下取消" : "验过就勾上"}`;
  return `<li class="mw-req" data-state="${state}"><button type="button" class="mw-req__check" aria-pressed="${checked}" aria-label="${label}"${state === "none" ? " disabled" : ""}>${icon("check")}</button>`
    + `<div class="mw-req__body"><span class="mw-req__title">${title}</span><span class="mw-req__evidence">${evidence}</span>${extra}</div></li>`;
}

function requirementsSpecimen(): string {
  const rows = [
    requirement("done", "微信里能付款", "依据：通知改走 https · 测试 16/16", owner("你 · Codex", YOU, CODEX)),
    requirement("open", "23 位用户的订单补上", "依据：补上 21 笔 · 退款 2 笔", `<span class="mw-decision">你定的：已重新下单的 2 笔改退款</span>${owner("阿哲 · Claude Code", ZHE, CLAUDE)}`),
    requirement("none", "真机上付一笔", "还没有依据 · 等阿哲验收", owner("阿哲验收", ZHE)),
  ].join("");
  return `<div class="mw-reqs" data-collab-reqs><p class="mw-reqs__head"><span>完成要求</span><b data-reqs-count>1/3</b><span class="mw-reqs__bars" aria-hidden="true"><i data-on></i><i></i><i></i></span></p><ul>${rows}</ul></div>`;
}

const TOPICS: readonly { name: string; status: string; tone: "progress" | "done" | "quiet"; unread?: boolean; concluded?: boolean; current?: boolean }[] = [
  { name: "主群", status: "4 位成员 · 最近 09:20", tone: "quiet" },
  { name: "# 周五发布", status: "讨论中 · 阿哲 09:40", tone: "progress", unread: true },
  { name: "# 新版首页", status: "讨论中 · 小林 昨天 18:02", tone: "progress" },
  { name: "# 支付失败", status: "已有结论 · 你确认 15:12", tone: "done", concluded: true, current: true },
];

function topicsSpecimen(): string {
  const current = TOPICS.find((topic) => topic.current)!;
  const chips = TOPICS.map((topic) => `<button type="button" class="mw-topic" aria-pressed="${Boolean(topic.current)}" data-status="${topic.status}" data-tone="${topic.tone}"${topic.unread ? " data-unread" : ""}>${topic.name}${topic.concluded ? icon("check") : ""}${topic.unread ? `<span class="mw-sr-only">，有未读</span>` : ""}</button>`).join("");
  return `<div class="mw-thread-head" data-collab-topics><div class="mw-topics" role="group" aria-label="项目讨论的话题">${chips}</div>`
    + `<p class="mw-thread-status" data-tone="${current.tone}" data-topic-status>${current.status}</p>`
    + `<label class="mw-thread-compose"><span data-topic-to>发到 ${current.name}</span><input class="mw-thread-compose__input" placeholder="发送消息…" aria-label="消息"></label></div>`;
}

function conversationSpecimen(): string {
  return `<div class="mw-convo"><p class="mw-said">先不急，<mark class="mw-heard">要是每次发版前都能这样试一遍就好了</mark>。</p>`
    + `<p class="mw-preparing" data-collab-preparing>${who(ASSISTANT)}<span class="mw-preparing__line" data-preparing-line>读了阿哲的文档</span></p></div>`;
}

function broughtSpecimen(): string {
  const rows = [["微信里能付款", owner("你", YOU)], ["23 位用户的订单补上", owner("阿哲", ZHE)], ["真机上付一笔", owner("阿哲验收", ZHE)]]
    .map(([title, face], index) => `<li><span class="mw-brought__n">${index + 1}</span><span>${title}</span>${face}</li>`).join("");
  return `<article class="mw-brought" data-collab-brought><p class="mw-brought__by">${who(ASSISTANT)}<b>助理</b><span>09:14</span></p>`
    + `<div class="mw-brought__card"><p class="mw-brought__note">${icon("history")}读了项目记忆 2 条 · 7 月那次付款通知走了 http</p>`
    + `<div class="mw-brought__fold"><div><div class="mw-brought__body"><h4>建个目标，三件事各有人接？</h4><ol>${rows}</ol></div>`
    + `<div class="mw-brought__answers">${renderButton({ label: "建目标", variant: "primary", size: "sm", attrs: { "data-answer": "已建目标 · 你同意" } })}${renderButton({ label: "再想想", variant: "secondary", size: "sm", attrs: { "data-answer": "先放着 · 你说再想想" } })}</div></div></div>`
    + `<p class="mw-brought__result" data-brought-result hidden>${icon("check")}<span data-brought-said></span>${renderButton({ label: "撤回", variant: "ghost", size: "sm", attrs: { "data-brought-undo": true } })}</p></div></article>`;
}

function source(glyph: "star" | "mail" | "git-branch", meta: string, text: string, span: "start" | "mid" | "end", joined: boolean): string {
  return `<li class="mw-source" data-span="${span}"${joined ? " data-joined" : ""}><span class="mw-source__icon">${icon(glyph)}</span><span><span class="mw-source__meta">${meta}</span>${text}</span>${joined ? `<span class="mw-urgent">要紧</span>` : ""}</li>`;
}

function sourcesSpecimen(): string {
  return `<div class="mw-joined"><ul class="mw-sources" aria-label="三条说的是同一件事">${[
    source("star", "App Store 评论 · ★☆☆☆☆ · 08:41", "付完钱一直转圈，订单没出来", "start", true),
    source("mail", "客户邮件 · 三家门店 · 08:57", "我们 3 个店员在微信里都付不了款", "mid", true),
    source("star", "App Store 评论 · ★★★★☆ · 09:03", "新版界面好看多了", "mid", false),
    source("git-branch", "GitHub #331 · 09:10", "iOS 微信里，付款成功的通知没回来", "end", true),
  ].join("")}</ul>`
    + `<div class="mw-rule"><p class="mw-rule__head">${icon("circle-alert")}要紧：微信里付不了款 · 23 位用户</p>`
    + `<p class="mw-rule__line">你定的规则<b>涉及付款</b><b>影响超过 10 人</b>${icon("arrow")}开话题，@ 负责人</p>`
    + `<p class="mw-rule__done">${icon("message")}已在「# 支付失败」叫上你</p></div></div>`;
}

function reviewSpecimen(): string {
  const row = (title: string, meta: string) => `<li class="mw-review__row"><span class="mw-source__icon">${icon("file")}</span><span><b>${title}</b><span class="mw-source__meta">${meta}</span></span>${renderButton({ label: "过目", variant: "secondary", size: "sm", attrs: { "data-review": true, "aria-pressed": "false" } })}</li>`;
  return `<div class="mw-review" data-collab-review><p class="mw-review__head"><span>两个平台，你都过目才能发</span><b data-review-count>0/2</b></p>`
    + `<ul>${row("公众号长文", "你的 Claude 写的底稿 · 3,200 字")}${row("小红书 6 页", "小林的 ChatGPT 做的 · 竖版")}</ul>`
    + `<div class="mw-review__send">${renderButton({ label: "发出去", variant: "primary", size: "sm", disabled: true, attrs: { "data-review-send": true } })}</div></div>`;
}

export function renderCollabSection(): string {
  const faces = [YOU, ZHE, ASSISTANT, CODEX, CLAUDE].map((entry) => `<span class="mw-collab-face">${who(entry, "lg")}<span>${entry.name}</span></span>`).join("");
  return `<section class="mw-catalog__section" id="collab" data-primitive="collab"><h2>协作零件</h2>
    <p class="mw-catalog__hint">定样，还没进产品：从四份介绍演示稿（一句抱怨到修好、一句闲聊到一个插件、每日选题、一条热点到发出去）里提出的协作零件，拍板后搬进设计系统。人是圆的，AI 是方的；AI 留下的痕迹（它带来的说明、它听到的那半句、串起同一件事的线）用强调色，「谁在做」用不用颜色区分还没定。示例数据。</p>
    <div class="mw-catalog__specimens">
      ${specimen("谁 · 人是圆的，AI 是方的", `<div class="mw-collab-faces">${faces}</div>`)}
      ${specimen("谁在接 · 人在前，交给的 AI 叠在后面", `<div class="mw-collab-row">${owner("你 · Codex", YOU, CODEX)}${owner("阿哲 · Claude Code", ZHE, CLAUDE)}${owner("阿哲验收", ZHE)}</div>`)}
      ${specimen("完成要求 · AI 交依据，人来打勾（没有依据的勾不了）", requirementsSpecimen())}
      ${specimen("项目讨论 · 话题、状态、发到哪", topicsSpecimen())}
      ${specimen("对话 · 助理听到的那半句、它在准备", conversationSpecimen())}
      ${specimen("AI 带来的东西 · 能点的回答，答了收成一行", broughtSpecimen())}
      ${specimen("同一件事串起来 · 和叫人的那条规则", sourcesSpecimen())}
      ${specimen("逐项过目 · 每个平台各点一次才能发", reviewSpecimen())}
      ${renderReceiptLayersSpecimen()}
    </div>
  </section>`;
}

export const COLLAB_SECTION_STYLES = `#collab svg{width:14px;height:14px;flex:none}` + RECEIPT_LAYERS_STYLES
  + `.mw-who{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--wash);color:var(--ink-soft);font-size:11px;font-weight:500;line-height:1;flex:none}`
  + `.mw-who[data-kind=ai]{border-radius:6px;background:var(--ink);color:var(--paper)}.mw-who[data-assistant]{background:var(--accent-soft);color:var(--accent)}`
  + `#collab .mw-who svg{width:12px;height:12px}.mw-who--lg{width:32px;height:32px;font-size:13px}.mw-who--lg[data-kind=ai]{border-radius:8px}#collab .mw-who--lg svg{width:16px;height:16px}`
  + `.mw-collab-faces,.mw-collab-row{display:flex;flex-wrap:wrap;align-items:center;gap:16px}.mw-collab-row{gap:8px}.mw-collab-face{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--muted)}`
  + `.mw-owner{display:inline-flex;align-items:center;gap:6px;padding:2px 10px 2px 3px;border-radius:999px;background:var(--wash);font-size:12px;color:var(--ink-soft)}.mw-owner__faces{display:inline-flex}.mw-owner__faces .mw-who+.mw-who{margin-left:-6px;box-shadow:0 0 0 2px var(--wash)}`
  + `.mw-reqs{width:min(100%,400px);font-size:13px}.mw-reqs__head{display:flex;align-items:center;gap:8px;margin:0 0 6px;color:var(--muted)}.mw-reqs__head b{color:var(--ink);font-variant-numeric:tabular-nums}`
  + `.mw-reqs__bars{display:inline-flex;gap:4px}.mw-reqs__bars i{width:22px;height:4px;border-radius:2px;background:var(--line);transition:background-color var(--dur-move) var(--ease-quint)}.mw-reqs__bars i[data-on]{background:var(--green)}`
  + `.mw-reqs ul,.mw-sources,.mw-review ul,.mw-brought ol{list-style:none;margin:0;padding:0}`
  + `.mw-req{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid var(--line)}`
  + `.mw-req__check{display:grid;place-items:center;width:20px;height:20px;margin-top:1px;padding:0;border:1.5px solid var(--line-strong);border-radius:50%;background:none;color:transparent;cursor:pointer;transition:background-color var(--dur-move) var(--ease-quint),border-color var(--dur-move) var(--ease-quint)}`
  + `.mw-req__check[aria-pressed=true]{border-color:var(--green);background:var(--green);color:var(--on-accent)}#collab .mw-req__check svg{width:12px;height:12px}.mw-req__check:disabled{border-style:dashed;cursor:not-allowed}`
  + `.mw-req__body{display:grid;justify-items:start;gap:5px;min-width:0}.mw-req__title{color:var(--ink);font-weight:500}.mw-req__evidence{font-size:12px;color:var(--muted)}`
  + `.mw-decision{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:12px}.mw-decision::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}`
  + `.mw-thread-head{width:min(100%,360px)}.mw-topics{display:flex;flex-wrap:wrap;gap:8px}`
  + `.mw-topic{position:relative;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:0;border-radius:999px;background:var(--wash);color:var(--ink-soft);font:inherit;font-size:12px;cursor:pointer}`
  + `.mw-topic[aria-pressed=true]{background:var(--ink);color:var(--paper)}#collab .mw-topic svg{width:12px;height:12px}.mw-topic[data-unread]::after{content:"";position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--blue)}`
  + `.mw-thread-status{margin:8px 0 0;font-size:12px;color:var(--muted)}.mw-thread-status[data-tone=done]{color:var(--green)}`
  + `.mw-thread-compose{display:grid;gap:4px;margin-top:10px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--paper);font-size:11px;color:var(--muted)}.mw-thread-compose__input{border:0;padding:0;background:none;color:var(--ink);font:inherit;font-size:13px;outline:none}`
  + `.mw-convo{display:grid;gap:10px;width:min(100%,360px)}.mw-said{justify-self:end;max-width:85%;margin:0;padding:8px 14px;border-radius:16px 16px 4px 16px;background:var(--wash);font-size:13px;line-height:1.6}`
  + `.mw-heard{background:none;color:inherit;text-decoration:underline 2px var(--accent);text-underline-offset:4px}.mw-preparing{display:flex;align-items:center;gap:8px;margin:0;font-size:12px;color:var(--muted)}`
  + `.mw-preparing__line{animation:craft-rise var(--dur-move) var(--ease-quint)}`
  + `.mw-brought{display:grid;gap:6px;width:min(100%,380px);font-size:13px}.mw-brought__by{display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--muted)}.mw-brought__by b{color:var(--ink);font-weight:500}`
  + `.mw-brought__card{overflow:hidden;border-radius:12px;background:var(--paper);box-shadow:0 0 0 1px var(--line)}.mw-brought__note{display:flex;align-items:flex-start;gap:6px;margin:0;padding:6px 12px;background:var(--accent-soft);color:var(--accent);font-size:12px;line-height:18px}#collab .mw-brought__note svg{margin-top:2px}`
  + `.mw-brought__fold{display:grid;grid-template-rows:1fr;transition:grid-template-rows var(--dur-move) var(--ease-quint)}.mw-brought__fold>div{min-height:0;overflow:hidden}.mw-brought[data-answered] .mw-brought__fold{grid-template-rows:0fr}`
  + `.mw-brought__body{padding:10px 12px 0}.mw-brought h4{margin:0 0 8px;font-size:13px;font-weight:600}.mw-brought li{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 0}.mw-brought__n{color:var(--faint);font-variant-numeric:tabular-nums}`
  + `.mw-brought__answers{display:flex;gap:8px;padding:10px 12px 12px}.mw-brought__result{display:flex;align-items:center;gap:6px;margin:0;padding:8px 12px;color:var(--green);font-size:12px}.mw-brought__result .mw-btn{margin-left:auto}`
  + `.mw-joined{display:grid;gap:12px;width:min(100%,400px)}.mw-sources{display:grid;gap:6px;padding-left:18px}`
  + `.mw-source,.mw-review__row{position:relative;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--paper);box-shadow:0 0 0 1px var(--line);font-size:13px}`
  + `.mw-source:not([data-joined]){opacity:.55}.mw-source__icon{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--wash);color:var(--muted)}.mw-source__meta{display:block;font-size:11px;color:var(--muted)}`
  + `.mw-source[data-span]::before{content:"";position:absolute;left:-12px;width:1.5px;background:var(--accent)}.mw-source[data-span=start]::before{top:50%;bottom:-6px}.mw-source[data-span=mid]::before{top:-6px;bottom:-6px}.mw-source[data-span=end]::before{top:-6px;bottom:50%}`
  + `.mw-source[data-joined]::after{content:"";position:absolute;left:-12px;top:50%;width:12px;height:1.5px;background:var(--accent)}`
  + `.mw-urgent{padding:1px 6px;border-radius:6px;background:var(--amber-soft);color:var(--amber);font-size:11px}`
  + `.mw-rule{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:var(--amber-soft);color:var(--ink-soft);font-size:12px}.mw-rule p{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0}.mw-rule__head{color:var(--ink);font-size:13px;font-weight:600}`
  + `.mw-rule__line b{padding:1px 8px;border-radius:6px;background:var(--paper);box-shadow:0 0 0 1px var(--line);font-weight:400}.mw-rule__done{color:var(--muted)}`
  + `.mw-review{display:grid;gap:8px;width:min(100%,380px);font-size:13px}.mw-review__head{display:flex;justify-content:space-between;margin:0;color:var(--muted)}.mw-review__head b{color:var(--ink);font-variant-numeric:tabular-nums}.mw-review ul{display:grid;gap:6px}.mw-review__row b{font-weight:500}`
  + `.mw-review__row [aria-pressed=true]{color:var(--green)}.mw-review__send{display:flex;justify-content:flex-end}`
  + `@media (prefers-reduced-motion:reduce){.mw-preparing__line{animation:none}.mw-brought__fold,.mw-req__check,.mw-reqs__bars i{transition:none}}`;

/** The section's program and the palette switch's, written in `src/browser/board/collab-section.ts` and bundled into `dist/`
 * when the package builds. */
export const COLLAB_SECTION_SCRIPT = readFileSync(new URL("./board-collab-section.js", import.meta.url), "utf8").trim();
