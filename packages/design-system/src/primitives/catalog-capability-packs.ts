// The board's specimens of the AI kit parts (capability-pack.ts holds the parts: their rules and renderers, shared with the
// 「能力包」 settings page). Only the board's own layout of the specimens is added here.
import { escapeHtml, icon, renderAttrs, renderBadge, renderButton, renderStatusMark, type AttrValue, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenuGroup, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";
import { statusLine } from "./catalog-skill-packs.js";
import {
  CAPABILITY_PACK_STYLES, renderCells, renderDetailTrail, renderIconCounts, renderItemGroup, renderNowBlock, renderPickRow, renderStateRows, renderUsage, type NowMenu,
} from "./capability-pack.js";

export const CAPABILITY_PACK_BOARD_STYLES = CAPABILITY_PACK_STYLES + `
  .mw-catalog :is([data-primitive="now-block"], [data-primitive="item-group"], [data-primitive="cell-grid"], [data-primitive="detail-trail"], [data-primitive="icon-counts"], [data-primitive="state-rows"], [data-primitive="usage-figure"]) .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  .mw-catalog :is([data-primitive="now-block"], [data-primitive="item-group"], [data-primitive="cell-grid"], [data-primitive="detail-trail"], [data-primitive="icon-counts"], [data-primitive="state-rows"], [data-primitive="usage-figure"]) .mw-catalog__row { display: grid; gap: 10px; min-width: 0; }
  .mw-catalog [data-primitive="icon-counts"] .mw-items { width: 100%; }
  .mw-catalog :is([data-primitive="sticky-detail"], [data-primitive="state-rows"]) .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog [data-primitive="sticky-detail"] .mw-catalog__row { display: block; }
  .mw-catalog [data-sticky-frame] { height: var(--settings-view-h); overflow: auto; padding: 12px; border-radius: var(--sk-r-item, 8px); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-catalog [data-sticky-frame] > p { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
`;

/* ---------- the board's specimens (made up; nothing is read from a Home). Every text is still Chinese: `say` turns it. ---------- */

const hold = (word: string) => renderStatusMark({ label: word, tone: "hold", state: "unavailable" });
const inUse = (word: string) => renderStatusMark({ label: word, tone: "idle", state: "ready" });
const go = (say: Say, label: string) => renderButton({ label: say(label), variant: "ghost", size: "sm", icon: "arrow" });

/** The board draws this menu three times; each copy names its items after its own id, so no described item's id repeats. */
function exportMenu(say: Say, id: string, withPrompts = true): NowMenu {
  const items = [
    renderMenuItem({ label: say("整个包"), description: say("内容包原样带签名，加上你的提示词改写和引用"), iconName: "package", id: `${id}-pack` }),
    ...(withPrompts ? [renderMenuItem({ label: say("只导出你的提示词改写（{n}）", { n: 1 }), description: say("存成你自己的数据文件，导回时逐条确认"), iconName: "text", id: `${id}-prompts` })] : []),
    renderMenuItem({ label: say("角色、工具和 MCP 的引用"), description: say("只带名字和版本，不带配置、地址和凭据"), iconName: "link", id: `${id}-refs` }),
  ].join("");
  return { id, label: say("导出这个包"), icon: "download", items: renderMenuGroup({ label: say("导出「{p}」", { p: say("写作工具") }), items }) };
}

export function nowBlockSection(say: Say): string {
  const manage = renderButton({ label: say("在插件设置里管理"), variant: "ghost", size: "sm", icon: "arrow" });
  return section("now-block", say("状态与去处 / State and Next Steps"), `<div class="mw-catalog__specimens">
    ${specimen(say("要处理：逐项写出，导出菜单锚在按钮下沿"), renderNowBlock({ status: statusLine(hold(say("1 项要处理")), say("排日程：暂时用不了")), actions: manage, menu: exportMenu(say, "now-export-a") }))}
    ${specimen(say("在用：一句说明"), renderNowBlock({ status: statusLine(inUse(say("在用")), say("包里的东西都能用。")), actions: manage, menu: exportMenu(say, "now-export-b", false) }))}
    ${specimen(say("插件停用：去处是启用插件"), renderNowBlock({ status: statusLine(renderStatusMark({ label: say("已停用"), tone: "quiet", state: "paused" }), say("插件停用了：包里的技能、角色和提示词都不会被用到。启用后照原来的设置。")),
      actions: renderButton({ label: say("启用插件"), variant: "primary", size: "sm" }) }))}
    ${specimen(say("一条的「现在」：说明在下，去处一排"), renderNowBlock({ status: statusLine(renderStatusMark({ label: say("默认已更新"), tone: "attention", state: "stale" }), say("用的是你的版本，基于第 3 版；默认已更新到第 4 版。")),
      note: say("这里不显示正文。改写、对比和恢复默认都在「提示词」里，从下一轮生效。"),
      actions: renderButton({ label: say("对比新的默认"), variant: "secondary", size: "sm", icon: "arrow" }) + renderButton({ label: say("在提示词里改"), variant: "secondary", size: "sm", icon: "arrow" }) }))}
  </div>`);
}

function promptRow(say: Say, name: string, sub: string, word: string, current = false): string {
  return renderPickRow({ glyph: "text", name: say(name), sub: say(sub), end: word === "默认已更新" ? renderStatusMark({ label: say(word), tone: "attention", state: "stale" }) : inUse(say(word)), current });
}

export function itemGroupSection(say: Say): string {
  const editor = renderItemGroup({ glyph: "user", name: say("写作编辑"), description: say("改稿、压缩篇幅、统一语气"), where: say("生效：助理、Pages"), end: inUse(say("在用")), label: say("它的提示词"),
    children: [promptRow(say, "写作编辑的说明", "写作工具 · 默认第 2 版", "默认", true), promptRow(say, "语气要求", "你的版本基于第 3 版；默认已更新到第 4 版", "默认已更新")], empty: say("没有自己的提示词") });
  const reference = renderItemGroup({ glyph: "user", name: say("个人助理"), description: say("你每天对话的助理"), where: say("Molis Work 自带的个人助理，这里只是引用"), end: inUse(say("在用")), label: say("它的提示词"),
    children: [promptRow(say, "提纲要求", "写作工具 · 没有归属角色，默认归个人助理", "默认")], empty: say("没有自己的提示词") });
  const none = renderItemGroup({ glyph: "user", name: say("审阅者"), description: say("只读地检查改动"), where: say("现在没有地方用它"), end: renderStatusMark({ label: say("已停用"), tone: "quiet", state: "paused" }), label: say("它的提示词"),
    children: [], empty: say("没有自己的提示词") });
  return section("item-group", say("条目组 / Item Group"), `<div class="mw-catalog__specimens">
    ${specimen(say("父行可选中，子条目缩进列在下面"), `<ul class="mw-item-groups">${editor}</ul>`)}
    ${specimen(say("引用行与没有子条目"), `<ul class="mw-item-groups">${reference}${none}</ul>`)}
  </div>`);
}

function tools(say: Say, current = ""): string {
  const writes = (word: string) => renderBadge({ label: say(word), tone: word === "会写" ? "warning" : "neutral" });
  return renderCells([
    { name: say("读文件"), code: "read_file", tag: writes("只读") }, { name: say("写文件"), code: "write_file", tag: writes("会写") },
    { name: say("执行命令"), code: "run_command", tag: writes("会写") }, { name: say("搜索网页"), code: "web_search", tag: writes("只读") },
    { name: say("把改动交给子代理继续做"), code: "delegate_to_subagent", tag: writes("只读") },
  ].map((cell) => ({ ...cell, current: cell.code === current })));
}

export function cellGridSection(say: Say): string {
  return section("cell-grid", say("紧凑条目格 / Compact Cells"), `<div class="mw-catalog__specimens">
    ${specimen(say("整格是按钮：名称、代码名、只读或会写"), tools(say, "run_command"))}
    ${specimen(say("窄处两列，长名字截断、悬停看全称"), `<div style="width: min(340px, 100%)">${tools(say)}</div>`)}
  </div>`);
}

export function detailTrailSection(say: Say): string {
  const head = (title: string, body: string) => `<header><h3 tabindex="-1">${escapeHtml(say(title))}</h3><p>${escapeHtml(say(body))}</p></header>`;
  return section("detail-trail", say("第三层返回与路径 / Third-Level Trail"), `<div class="mw-catalog__specimens">
    ${specimen(say("包 / 角色 / 这一条"), `<div class="mw-list-detail__detail">${renderDetailTrail({ up: say("回到「{p}」", { p: say("写作工具") }), path: [say("写作工具"), say("写作编辑"), say("写作编辑的说明")], label: say("所在位置") })}${head("写作编辑的说明", "写作编辑每次改稿前先读的要求")}</div>`)}
    ${specimen(say("长路径换行，不截断"), `<div class="mw-list-detail__detail">${renderDetailTrail({ up: say("回到「{p}」", { p: say("本机导入 · Claude Code") }), path: [say("本机导入 · Claude Code"), say("把会议录音整理成带行动项的纪要")], label: say("所在位置") })}${head("把会议录音整理成带行动项的纪要", "会后把录音转写整理成纪要")}</div>`)}
  </div>`);
}

/** The counts of one pack, in the order the pack's sections come. */
function packCounts(say: Say, counts: Readonly<Record<"role" | "prompt" | "skill" | "mcp" | "tool", number | "—">>): string {
  const glyph: Record<string, PluginIconName> = { role: "user", prompt: "text", skill: "book", mcp: "network", tool: "wand" };
  const whole: Record<string, string> = { role: "{n} 个角色", prompt: "{n} 个提示词", skill: "{n} 个技能", mcp: "{n} 个 MCP", tool: "{n} 个工具" };
  return renderIconCounts(Object.entries(counts).filter(([, n]) => n !== 0).map(([kind, n]) => ({ glyph: glyph[kind]!, value: String(n),
    name: n === "—" ? say("MCP：没读到") : say(whole[kind]!, { n }) })));
}

function packRow(say: Say, name: string, counts: Parameters<typeof packCounts>[1], end: string, current = false, attrs?: Record<string, AttrValue>): string {
  return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick"${current ? ' aria-current="true"' : ""}${renderAttrs(attrs)}><span class="mw-mark" aria-hidden="true">${icon("package")}</span><span><strong>${
    escapeHtml(say(name))}</strong>${packCounts(say, counts)}</span><span class="mw-item__end">${end}</span></button></li>`;
}

export function iconCountsSection(say: Say): string {
  return section("icon-counts", say("图标计数 / Icon Counts"), `<div class="mw-catalog__specimens">
    ${specimen(say("列表行里：一个图标一个数"), `<ul class="mw-items">${packRow(say, "写作工具", { role: 2, prompt: 3, skill: 3, mcp: 0, tool: 3 }, hold(say("1 项要处理")))}${
      packRow(say, "Coding", { role: 2, prompt: 2, skill: 0, mcp: "—", tool: 6 }, hold(say("没读全")))}${packRow(say, "Feed", { role: 0, prompt: 2, skill: 0, mcp: 0, tool: 1 }, inUse(say("在用")))}</ul>`)}
    ${specimen(say("单独放：没读到的写「—」"), packCounts(say, { role: 2, prompt: 2, skill: 0, mcp: "—", tool: 6 }))}
  </div>`);
}

function mcpRows(say: Say, broken = false): string {
  return renderStateRows([
    { name: say("服务器"), meaning: say("服务器有没有在跑、连不连得上"), mark: broken ? hold(say("断开了")) : inUse(say("开着")), fact: broken ? undefined : say("随 Molis Work 一起运行"), go: broken ? go(say, "重新连接") : undefined },
    { name: say("给外部客户端"), meaning: say("哪些外部 AI 工具能连它"), mark: inUse(say("开给 {n} 个：{list}", { n: 2, list: "Claude Code、Codex" })), go: go(say, "对外接入") },
    { name: say("工具可用"), meaning: say("它的工具里，有几个登记成动作、能被调用"), mark: inUse(say("{total} 个里开放 {open} 个", { total: 14, open: 12 })), go: go(say, "能力库") },
  ]);
}

export function stateRowsSection(say: Say): string {
  return section("state-rows", say("分项状态行 / State Rows"), `<div class="mw-catalog__specimens">
    ${specimen(say("三种「开」：一行一种"), mcpRows(say))}
    ${specimen(say("窄处：去处换到下一行"), `<div style="width: min(300px, 100%)">${mcpRows(say, true)}</div>`)}
  </div>`);
}

export function usageSection(say: Say): string {
  return section("usage-figure", say("用量 / Usage"), `<div class="mw-catalog__specimens">
    ${specimen(say("近期次数：数字、最近一次、范围"), renderUsage({ figure: 12, head: say("近期 {n} 次", { n: 12 }), last: say("最近一次 昨天 17:40 · 助理"), scope: say("每个提示词只留最近 200 次记录，这里不是总数。") }))}
    ${specimen(say("只有最近一次：不出数字"), renderUsage({ head: say("只有最近一次"), last: say("最近一次 3 天前 · Coding"), scope: say("工具只记最近一次是什么时候。") }))}
    ${specimen(say("还没有使用记录"), renderUsage({ head: say("还没有使用记录") }))}
  </div>`);
}

/* 8 · The composed specimen: the pack list beside one pack; an entry opens in place under the third-level trail. */
function detailOf(key: string, title: string, body: string, inner: string, shown: boolean, back: string): string {
  return `<section class="mw-list-detail__detail" data-list-panel="${key}" aria-labelledby="${key}-title"${shown ? "" : " hidden"}>${back}<header><h3 id="${key}-title" tabindex="-1">${
    escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></header>${inner}</section>`;
}

const sec = (title: string, body: string) => `<section class="mw-list-detail__group"><h4>${escapeHtml(title)}</h4>${body}</section>`;

export function stickyDetailSection(say: Say): string {
  const id = "sticky";
  const back = renderButton({ label: say("全部能力包"), variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__back", attrs: { "data-list-back": "" } });
  const open = (item: string) => ({ "data-list-open": `${id}-${item}` });
  const roles = `<ul class="mw-item-groups">${renderItemGroup({ glyph: "user", name: say("写作编辑"), description: say("改稿、压缩篇幅、统一语气"), where: say("生效：助理、Pages"), end: inUse(say("在用")), label: say("它的提示词"),
    attrs: open("editor"), children: [renderPickRow({ glyph: "text", name: say("写作编辑的说明"), sub: say("写作工具 · 默认第 2 版"), end: inUse(say("默认")), attrs: open("brief") })], empty: say("没有自己的提示词") })}</ul>`;
  const skills = `<ul class="mw-items">${["写周度复盘", "会议纪要", "排日程"].map((name, index) => renderPickRow({ glyph: "book", name: say(name), sub: say("写作工具 · 2.0"),
    end: index === 2 ? hold(say("暂时用不了")) : renderStatusMark({ label: say("自动"), tone: "idle", state: "ready" }), attrs: open(index === 2 ? "schedule" : `skill-${index}`) })).join("")}</ul>`;
  const toolCells = renderCells([{ name: say("读文件"), code: "read_file", tag: renderBadge({ label: say("只读"), tone: "neutral" }), attrs: open("read") },
    { name: say("写文件"), code: "write_file", tag: renderBadge({ label: say("会写"), tone: "warning" }), attrs: open("write") },
    { name: say("搜索网页"), code: "web_search", tag: renderBadge({ label: say("只读"), tone: "neutral" }), attrs: open("search") }]);
  const writing = renderNowBlock({ status: statusLine(hold(say("1 项要处理")), say("排日程：暂时用不了")), actions: renderButton({ label: say("在插件设置里管理"), variant: "ghost", size: "sm", icon: "arrow" }), menu: exportMenu(say, `${id}-export`) });
  const packBody = `${writing}${sec(say("角色和它的提示词"), roles)}${sec(say("技能"), skills)}${sec(say("工具"), toolCells)}${sec(say("上次升级"), `<p class="mw-list-detail__used">${escapeHtml(say("1.4 → 2.0：新增「排日程」"))}</p>`)}`;
  const trail = (name: string, middle?: string) => renderDetailTrail({ up: say("回到「{p}」", { p: say("写作工具") }), path: [say("写作工具"), ...(middle ? [say(middle)] : []), say(name)], label: say("所在位置") });
  const item = (key: string, name: string, about: string, inner: string, middle?: string) =>
    detailOf(`${id}-${key}`, say(name), say(about), inner, false, trail(name, middle)).replace(`data-list-panel="${id}-${key}"`, `data-list-panel="${id}-${key}" data-list-item`);
  const usage = renderUsage({ figure: 12, head: say("近期 {n} 次", { n: 12 }), last: say("最近一次 昨天 17:40 · 助理"), scope: say("每个提示词只留最近 200 次记录，这里不是总数。") });
  const items = [
    item("brief", "写作编辑的说明", "写作编辑每次改稿前先读的要求", `${renderNowBlock({ status: statusLine(inUse(say("默认")), say("用的是默认版第 2 版。")), note: say("这里不显示正文。改写、对比和恢复默认都在「提示词」里，从下一轮生效。"), actions: go(say, "在提示词里改") })}${sec(say("用量"), usage)}`, "写作编辑"),
    item("editor", "写作编辑", "改稿、压缩篇幅、统一语气", `${renderNowBlock({ status: statusLine(inUse(say("在用")), say("在这些地方生效")), actions: go(say, "去角色") })}${sec(say("用量"), usage)}`),
    item("schedule", "排日程", "按大家的空闲时间提出会议时间", `${renderNowBlock({ status: statusLine(hold(say("暂时用不了")), say("还没有连接所需服务。")), actions: go(say, "管理连接") })}`),
    ...["read", "write", "search"].map((tool) => item(tool, ({ read: "读文件", write: "写文件", search: "搜索网页" } as Record<string, string>)[tool]!, "Molis Work 自带的工具",
      `${renderNowBlock({ status: statusLine(renderBadge({ label: say(tool === "write" ? "会写" : "只读"), tone: tool === "write" ? "warning" : "neutral" }), say("工具不能在这里开关。谁能用它，由角色的工具名单和动作授权决定。")) })}${sec(say("用量"), renderUsage({ head: say("只有最近一次"), last: say("最近一次 3 天前 · Coding"), scope: say("工具只记最近一次是什么时候。") }))}`)),
    ...[0, 1].map((index) => item(`skill-${index}`, ["写周度复盘", "会议纪要"][index]!, "写作工具里的技能", sec(say("用量"), usage))),
  ].join("");
  // The list is longer than the frame, so scrolling it shows the detail staying in view.
  const more: ReadonlyArray<readonly [string, string, string, Parameters<typeof packCounts>[1], "on" | "off"]> = [
    ["coding", "Coding", "开发时用的角色、MCP 和工具", { role: 2, prompt: 2, skill: 0, mcp: 1, tool: 6 }, "on"],
    ["feed", "Feed", "消息摘要与分类", { role: 0, prompt: 2, skill: 0, mcp: 0, tool: 1 }, "on"],
    ["builtin", "Molis Work 自带", "个人助理、全部 Agent 工具和对外的 MCP", { role: 1, prompt: 1, skill: 1, mcp: 1, tool: 12 }, "on"],
    ["roles", "你的角色", "你自己写的角色", { role: 2, prompt: 0, skill: 0, mcp: 0, tool: 4 }, "on"],
    ["goals", "Goals", "规划与拆分目标", { role: 1, prompt: 3, skill: 0, mcp: 0, tool: 2 }, "on"],
    ["legal", "法务审阅", "审合同、比对版本", { role: 1, prompt: 1, skill: 2, mcp: 0, tool: 1 }, "off"],
    ["local", "本机导入 · Claude Code", "从本机 Agent 导进来的技能", { role: 0, prompt: 0, skill: 4, mcp: 0, tool: 0 }, "on"],
  ];
  const offMark = () => renderStatusMark({ label: say("已停用"), tone: "quiet", state: "paused" });
  const others = more.map(([key, name, about, , state]) => detailOf(`${id}-${key}`, say(name), say(about), renderNowBlock({ status: state === "off"
    ? statusLine(offMark(), say("插件停用了：包里的技能、角色和提示词都不会被用到。启用后照原来的设置。")) : statusLine(inUse(say("在用")), say("包里的东西都能用。")),
    actions: state === "off" ? renderButton({ label: say("启用插件"), variant: "primary", size: "sm" }) : "" }), false, back)).join("");
  const list = `<ul class="mw-items">${packRow(say, "写作工具", { role: 1, prompt: 1, skill: 3, mcp: 0, tool: 3 }, hold(say("1 项要处理")), true, { "data-list-pick": `${id}-writing` })}${
    more.map(([key, name, , counts, state]) => packRow(say, name, counts, state === "off" ? offMark() : inUse(say("在用")), false, { "data-list-pick": `${id}-${key}` })).join("")}</ul>`;
  const split = `<div class="mw-list-detail" data-list-detail data-sticky-detail><div class="mw-list-detail__body"><div class="mw-list-detail__list" role="region" aria-label="${escapeHtml(say("能力包列表"))}">${list}</div>${
    detailOf(`${id}-writing`, say("写作工具"), say("写稿、改稿、排日程要用的都在一起"), packBody, true, back)}${others}${items}</div></div>`;
  return section("sticky-detail", say("详情贴顶 / Sticky Detail"), `<div class="mw-catalog__specimens">
    ${specimen(say("需要时才打开：详情贴在滚动区顶上，比它高时自己滚；点一条在原处打开，「回到」回到包"), `<div data-sticky-frame style="--settings-view-h: 400px"><p>${escapeHtml(say("这一框模拟设置页的滚动区：外壳给出 --settings-view-h。"))}</p>${split}</div>`)}
  </div>`);
}

