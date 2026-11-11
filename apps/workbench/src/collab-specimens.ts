import { readFileSync } from "node:fs";
import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RECEIPT_LAYERS_STYLES, renderReceiptLayersSpecimen } from "./receipt-layers-specimen.js";

/**
 * The component board's 协作零件 section: the parts the four Molis Work introduction demos (a bad review fixed the same day,
 * a passing wish turned into a plugin, a daily topic list, a trending post published) all draw — who is a person and who an
 * AI, a goal's completion requirements with their evidence, a discussion's topics, what an AI brings and the answers that can
 * be tapped, the sources that say the same thing and the rule that raised them, and a per-platform review before sending.
 * They are proposals for review (定样), not shipped parts: the markup and styles live on the board until they are approved
 * and moved into the design system. The demo copy is sample data, written through the board's translator (`say`, as the
 * conditions and service-connection sections are); the sample person names are data, not UI words.
 */

type Say = (text: string, values?: Record<string, string | number>) => string;
type Kind = "person" | "ai";
interface Who { readonly name: string; readonly kind: Kind; readonly mark?: string; readonly assistant?: boolean }

const YOU: Who = { name: "你", kind: "person" };
const ZHE: Who = { name: "阿哲", kind: "person", mark: "哲" };
const CODEX: Who = { name: "Codex", kind: "ai" };
const CLAUDE: Who = { name: "Claude Code", kind: "ai" };
const ASSISTANT: Who = { name: "助理", kind: "ai", assistant: true };

/** A person is round, an AI is square; the Assistant carries its spark instead of an initial. UI role names (“你”, the
 * Assistant) are words of the interface and go through the translator; real sample person names stay as data. */
function who(say: Say, entry: Who, size: "sm" | "lg" = "sm"): string {
  const face = entry.assistant ? icon("sparkles") : (entry.mark ?? Array.from(entry.name)[0]!);
  const name = entry.name === "你" || entry.assistant ? say(entry.name) : entry.name;
  return `<span class="mw-who${size === "lg" ? " mw-who--lg" : ""}" data-kind="${entry.kind}"${entry.assistant ? " data-assistant" : ""} role="img" aria-label="${name}${entry.kind === "ai" ? say("（AI）") : say("（人）")}">${face}</span>`;
}

/** Who has it: the person's round face, and the AI they handed it to stacked behind. */
function owner(say: Say, label: string, ...faces: Who[]): string {
  return `<span class="mw-owner"><span class="mw-owner__faces">${faces.map((face) => who(say, face)).join("")}</span><span>${say(label)}</span></span>`;
}

function specimen(caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen"><figcaption>${caption}</figcaption>${body}</figure>`;
}

function requirement(say: Say, state: "done" | "open" | "none", title: string, evidence: string, extra: string): string {
  const checked = state === "done";
  const label = state === "none" ? say("{title}：还没有依据，先不能勾", { title: say(title) })
    : say(checked ? "{title}：已验过，点一下取消" : "{title}：验过就勾上", { title: say(title) });
  return `<li class="mw-req" data-state="${state}"><button type="button" class="mw-req__check" aria-pressed="${checked}" aria-label="${label}"${state === "none" ? " disabled" : ""}><span class="mw-req__mark">${icon("check")}</span></button>`
    + `<div class="mw-req__body"><span class="mw-req__title">${say(title)}</span><span class="mw-req__evidence">${say(evidence)}</span>${extra}</div></li>`;
}

function requirementsSpecimen(say: Say): string {
  const rows = [
    requirement(say, "done", "微信里能付款", "依据：通知改走 https · 测试 16/16", owner(say, "你 · Codex", YOU, CODEX)),
    requirement(say, "open", "23 位用户的订单补上", "依据：补上 21 笔 · 退款 2 笔", `<span class="mw-decision">${say("你定的：已重新下单的 2 笔改退款")}</span>${owner(say, "阿哲 · Claude Code", ZHE, CLAUDE)}`),
    requirement(say, "none", "真机上付一笔", "还没有依据 · 等阿哲验收", owner(say, "阿哲验收", ZHE)),
  ].join("");
  return `<div class="mw-reqs" data-collab-reqs><p class="mw-reqs__head"><span>${say("完成要求")}</span><b data-reqs-count>1/3</b><span class="mw-reqs__bars" aria-hidden="true"><i data-on></i><i></i><i></i></span></p><ul>${rows}</ul></div>`;
}

const TOPICS: readonly { name: string; status: string; tone: "progress" | "done" | "quiet"; unread?: boolean; concluded?: boolean; current?: boolean }[] = [
  { name: "主群", status: "4 位成员 · 最近 09:20", tone: "quiet" },
  { name: "# 周五发布", status: "讨论中 · 阿哲 09:40", tone: "progress", unread: true },
  { name: "# 新版首页", status: "讨论中 · 小林 昨天 18:02", tone: "progress" },
  { name: "# 支付失败", status: "已有结论 · 你确认 15:12", tone: "done", concluded: true, current: true },
];

function topicsSpecimen(say: Say): string {
  const current = TOPICS.find((topic) => topic.current)!;
  const chips = TOPICS.map((topic) => `<button type="button" class="mw-topic" aria-pressed="${Boolean(topic.current)}" data-status="${say(topic.status)}" data-tone="${topic.tone}"${topic.unread ? " data-unread" : ""}>${say(topic.name)}${topic.concluded ? icon("check") : ""}${topic.unread ? `<span class="mw-sr-only">${say("，有未读")}</span>` : ""}</button>`).join("");
  return `<div class="mw-thread-head" data-collab-topics><div class="mw-topics" role="group" aria-label="${say("项目讨论的话题")}">${chips}</div>`
    + `<p class="mw-thread-status" data-tone="${current.tone}" data-topic-status>${say(current.status)}</p>`
    + `<label class="mw-thread-compose"><span data-topic-to>${say("发给 {name}", { name: say(current.name) })}</span><input class="mw-thread-compose__input" placeholder="${say("发送消息…")}" aria-label="${say("消息")}"></label></div>`;
}

function conversationSpecimen(say: Say): string {
  return `<div class="mw-convo"><p class="mw-said">${say("先不急，{heard}。", { heard: `<mark class="mw-heard">${say("要是每次发版前都能这样试一遍就好了")}</mark>` })}</p>`
    + `<p class="mw-preparing" data-collab-preparing>${who(say, ASSISTANT)}<span class="mw-preparing__line" data-preparing-line>${say("读了阿哲的文档")}</span></p></div>`;
}

function broughtSpecimen(say: Say): string {
  const rows = [["微信里能付款", owner(say, "你", YOU)], ["23 位用户的订单补上", owner(say, "阿哲", ZHE)], ["真机上付一笔", owner(say, "阿哲验收", ZHE)]]
    .map(([title, face], index) => `<li><span class="mw-brought__n">${index + 1}</span><span>${say(title)}</span>${face}</li>`).join("");
  return `<article class="mw-brought" data-collab-brought><p class="mw-brought__by">${who(say, ASSISTANT)}<b>${say("助理")}</b><span>09:14</span></p>`
    + `<div class="mw-brought__card"><p class="mw-brought__note">${icon("history")}${say("读了项目记忆 2 条 · 7 月那次付款通知走了 http")}</p>`
    + `<div class="mw-brought__fold"><div><div class="mw-brought__body"><h4>${say("建个目标，三件事各有人接？")}</h4><ol>${rows}</ol></div>`
    + `<div class="mw-brought__answers">${renderButton({ label: say("建目标"), variant: "primary", size: "sm", attrs: { "data-answer": say("已建目标 · 你同意") } })}${renderButton({ label: say("再想想"), variant: "secondary", size: "sm", attrs: { "data-answer": say("先放着 · 你说再想想") } })}</div></div></div>`
    + `<p class="mw-brought__result" data-brought-result hidden>${icon("check")}<span data-brought-said></span>${renderButton({ label: say("撤回"), variant: "ghost", size: "sm", attrs: { "data-brought-undo": true } })}</p></div></article>`;
}

function source(say: Say, glyph: "star" | "mail" | "git-branch", meta: string, text: string, span: "start" | "mid" | "end", joined: boolean): string {
  return `<li class="mw-source" data-span="${span}"${joined ? " data-joined" : ""}><span class="mw-source__icon">${icon(glyph)}</span><span><span class="mw-source__meta">${say(meta)}</span>${say(text)}</span>${joined ? `<span class="mw-urgent">${say("要紧")}</span>` : ""}</li>`;
}

function sourcesSpecimen(say: Say): string {
  return `<div class="mw-joined"><ul class="mw-sources" aria-label="${say("三条说的是同一件事")}">${[
    source(say, "star", "App Store 评论 · ★☆☆☆☆ · 08:41", "付完钱一直转圈，订单没出来", "start", true),
    source(say, "mail", "客户邮件 · 三家门店 · 08:57", "我们 3 个店员在微信里都付不了款", "mid", true),
    source(say, "star", "App Store 评论 · ★★★★☆ · 09:03", "新版界面好看多了", "mid", false),
    source(say, "git-branch", "GitHub #331 · 09:10", "iOS 微信里，付款成功的通知没回来", "end", true),
  ].join("")}</ul>`
    + `<div class="mw-rule"><p class="mw-rule__head">${icon("circle-alert")}${say("要紧：微信里付不了款 · 23 位用户")}</p>`
    + `<p class="mw-rule__line">${say("你定的规则")}<b>${say("涉及付款")}</b><b>${say("影响超过 10 人")}</b>${icon("arrow")}${say("开话题，@ 负责人")}</p>`
    + `<p class="mw-rule__done">${icon("message")}${say("已在「# 支付失败」叫上你")}</p></div></div>`;
}

function reviewSpecimen(say: Say): string {
  const row = (title: string, meta: string) => `<li class="mw-review__row"><span class="mw-source__icon">${icon("file")}</span><span><b>${say(title)}</b><span class="mw-source__meta">${say(meta)}</span></span>${renderButton({ label: say("过目"), variant: "secondary", size: "sm", attrs: { "data-review": true, "aria-pressed": "false" } })}</li>`;
  return `<div class="mw-review" data-collab-review><p class="mw-review__head"><span>${say("两个平台，你都过目才能发")}</span><b data-review-count>0/2</b></p>`
    + `<ul>${row("公众号长文", "你的 Claude 写的底稿 · 3,200 字")}${row("小红书 6 页", "小林的 ChatGPT 做的 · 竖版")}</ul>`
    + `<div class="mw-review__send">${renderButton({ label: say("发出去"), variant: "primary", size: "sm", disabled: true, attrs: { "data-review-send": true } })}</div></div>`;
}

export function renderCollabSection(say: Say): string {
  // The words the section's program rebuilds at runtime (the board's translation channel, as `platform-area-words` does).
  const words = {
    "{title}：已验过，点一下取消": say("{title}：已验过，点一下取消"),
    "{title}：验过就勾上": say("{title}：验过就勾上"),
    "发给 {name}": say("发给 {name}"),
    "已过目": say("已过目"),
    "读了阿哲的文档": say("读了阿哲的文档"),
    "查了现成的能力": say("查了现成的能力"),
    "画好一版插件草图": say("画好一版插件草图"),
  };
  const faces = [YOU, ZHE, ASSISTANT, CODEX, CLAUDE].map((entry) => `<span class="mw-collab-face">${who(say, entry, "lg")}<span>${say(entry.name)}</span></span>`).join("");
  return `<section class="mw-catalog__section" id="collab" data-primitive="collab"><h2>${say("协作零件")}</h2>
    <script type="application/json" id="collab-words">${JSON.stringify(words).replace(/</g, "\\u003c")}</script>
    <p class="mw-catalog__hint">${say("定样，还没进产品：从四份介绍演示稿（一句抱怨到修好、一句闲聊到一个插件、每日选题、一条热点到发出去）里提出的协作零件，拍板后搬进设计系统。人是圆的，AI 是方的；AI 留下的痕迹（它带来的说明、它听到的那半句、串起同一件事的线）用强调色，「谁在做」用不用颜色区分还没定。示例数据。")}</p>
    <div class="mw-catalog__specimens">
      ${specimen(say("谁 · 人是圆的，AI 是方的"), `<div class="mw-collab-faces">${faces}</div>`)}
      ${specimen(say("谁在接 · 人在前，交给的 AI 叠在后面"), `<div class="mw-collab-row">${owner(say, "你 · Codex", YOU, CODEX)}${owner(say, "阿哲 · Claude Code", ZHE, CLAUDE)}${owner(say, "阿哲验收", ZHE)}</div>`)}
      ${specimen(say("完成要求 · AI 交依据，人来打勾（没有依据的勾不了）"), requirementsSpecimen(say))}
      ${specimen(say("项目讨论 · 话题、状态、发给谁"), topicsSpecimen(say))}
      ${specimen(say("对话 · 助理听到的那半句、它在准备"), conversationSpecimen(say))}
      ${specimen(say("AI 带来的东西 · 能点的回答，答了收成一行"), broughtSpecimen(say))}
      ${specimen(say("同一件事串起来 · 和叫人的那条规则"), sourcesSpecimen(say))}
      ${specimen(say("逐项过目 · 每个平台各点一次才能发"), reviewSpecimen(say))}
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
  + `.mw-req{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid var(--line)}`
  + `.mw-req__check{display:grid;place-items:center;width:32px;height:32px;margin-top:-7px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer}`
  + `.mw-req__check:focus-visible{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset,1px)}`
  + `.mw-req__mark{display:grid;place-items:center;width:20px;height:20px;border:1.5px solid var(--line-strong);border-radius:50%;color:transparent;transition:background-color var(--dur-move) var(--ease-quint),border-color var(--dur-move) var(--ease-quint)}`
  + `.mw-req__check[aria-pressed=true] .mw-req__mark{border-color:var(--green);background:var(--green);color:var(--on-accent)}#collab .mw-req__mark svg{width:12px;height:12px}.mw-req__check:disabled{cursor:not-allowed}.mw-req__check:disabled .mw-req__mark{border-style:dashed}`
  + `@media (max-width:600px),(pointer:coarse){.mw-req{grid-template-columns:44px minmax(0,1fr)}.mw-req__check{width:44px;height:44px;margin-top:-13px}}`
  + `.mw-req__body{display:grid;justify-items:start;gap:5px;min-width:0}.mw-req__title{color:var(--ink);font-weight:500}.mw-req__evidence{font-size:12px;color:var(--muted)}`
  + `.mw-decision{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:6px;background:var(--accent-soft);color:var(--accent);font-size:12px}.mw-decision::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}`
  + `.mw-thread-head{width:min(100%,360px)}.mw-topics{display:flex;flex-wrap:wrap;gap:8px}`
  + `.mw-topic{position:relative;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border:0;border-radius:999px;background:var(--wash);color:var(--ink-soft);font:inherit;font-size:12px;cursor:pointer}`
  + `.mw-topic[aria-pressed=true]{background:var(--ink);color:var(--paper)}#collab .mw-topic svg{width:12px;height:12px}.mw-topic[data-unread]::after{content:"";position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:var(--blue)}`
  + `.mw-thread-status{margin:8px 0 0;font-size:12px;color:var(--muted)}.mw-thread-status[data-tone=done]{color:var(--green)}`
  + `.mw-thread-compose{display:grid;gap:4px;margin-top:10px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:var(--paper);font-size:11px;color:var(--muted)}.mw-thread-compose__input{border:0;padding:0;background:none;color:var(--ink);font:inherit;font-size:13px;outline:none}`
  + `.mw-thread-compose__input:focus-visible{outline:var(--focus-stroke);outline-offset:1px}`
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
  + `.mw-source__icon{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--wash);color:var(--muted)}.mw-source__meta{display:block;font-size:11px;color:var(--muted)}`
  + `.mw-source[data-span]::before{content:"";position:absolute;left:-12px;width:1.5px;background:var(--accent)}.mw-source[data-span=start]::before{top:50%;bottom:-6px}.mw-source[data-span=mid]::before{top:-6px;bottom:-6px}.mw-source[data-span=end]::before{top:-6px;bottom:50%}`
  + `.mw-source[data-joined]::after{content:"";position:absolute;left:-12px;top:50%;width:12px;height:1.5px;background:var(--accent)}`
  + `.mw-urgent{padding:1px 6px;border-radius:6px;background:var(--amber-soft);color:var(--amber);font-size:11px}`
  + `.mw-rule{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:var(--amber-soft);color:var(--ink-soft);font-size:12px}.mw-rule p{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0}.mw-rule__head{color:var(--ink);font-size:13px;font-weight:600}`
  + `.mw-rule__line b{padding:1px 8px;border-radius:6px;background:var(--paper);box-shadow:0 0 0 1px var(--line);font-weight:400}.mw-rule__done{color:var(--muted)}`
  + `.mw-review{display:grid;gap:8px;width:min(100%,380px);font-size:13px}.mw-review__head{display:flex;justify-content:space-between;margin:0;color:var(--muted)}.mw-review__head b{color:var(--ink);font-variant-numeric:tabular-nums}.mw-review ul{display:grid;gap:6px}.mw-review__row b{font-weight:500}`
  + `.mw-review__row [aria-pressed=true]{color:var(--green)}.mw-review__send{display:flex;justify-content:flex-end}`
  + `@media (prefers-reduced-motion:reduce){.mw-preparing__line{animation:none}.mw-brought__fold,.mw-req__mark,.mw-reqs__bars i{transition:none}}`;

/** The section's program and the palette switch's, written in `src/browser/board/collab-section.ts` and bundled into `dist/`
 * when the package builds. */
export const COLLAB_SECTION_SCRIPT = readFileSync(new URL("./board-collab-section.js", import.meta.url), "utf8").trim();
