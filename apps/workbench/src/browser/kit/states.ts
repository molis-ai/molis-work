import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { badge, colon, english, joined, L, mark, retracted, type Kit } from "./common.js";

// What each entry and each pack says about itself, read from the catalog alone (contract-design §4.4): an entry's own state word at
// the end of its row, and a pack's state from its plugin and what it holds. A pack has no switch of its own.

const SKILL_STATE: Record<string, string> = { off: "关", auto: "自动", manual: "仅手动" };
/** An owner's own reason codes the page has words for; any other code reads 「暂时用不了」 with the owner's detail beside it. */
const REASON: Record<string, string> = {
  plugin_disabled: "插件停用了", resource_invalid: "正文或附带文件缺失", requires_unmet: "缺少所需的能力",
  connection_missing: "还没有连接所需服务", native_only: "只有本地 Agent 能用", not_applicable: "不适用于当前执行方式",
};
export const reasonWord = (entry: KitEntry) => entry.availability.available ? ""
  : entry.availability.reason === "publisher_revoked" ? retracted() : L(REASON[entry.availability.reason] || "暂时用不了");

/** The word at the end of an entry's row, as a status mark (a tool's is a tag: it has no state, only whether it writes). */
export function entryMark(entry: KitEntry): string {
  if (entry.kind === "tool") return entry.tool.writes ? badge(L("会写"), "warning") : badge(L("只读"));
  if (!entry.availability.available) return mark(reasonWord(entry), "hold", "unavailable");
  if (entry.kind === "skill") return entry.skill.state === "off" ? mark(L("关"), "quiet", "idle") : mark(L(SKILL_STATE[entry.skill.state]!), "idle", "ready");
  if (entry.kind === "prompt") {
    if (entry.version.change?.kind === "default_updated") return mark(L("默认已更新"), "attention", "ready");
    return entry.prompt.edited ? mark(L("你的版本"), "idle", "ready") : mark(L("默认"), "quiet", "idle");
  }
  if (entry.kind === "mcp") {
    if (entry.ref.part === "outbound") return entry.mcp.granted_to?.length ? mark(L("对外开着"), "idle", "ready") : mark(L("没开给谁"), "quiet", "idle");
    if (entry.ref.part === "server") {
      if (entry.mcp.server_enabled === false) return mark(L("关着"), "quiet", "paused");
      return entry.mcp.health === "connected" ? mark(L("已连接"), "idle", "ready") : mark(L("断开了"), "hold", "unavailable");
    }
    return entry.mcp.action_available ? mark(L("能调用"), "idle", "ready") : mark(L("用不了"), "hold", "unavailable");
  }
  return mark(L("在用"), "idle", "ready");
}

export type PackGroup = "on" | "na" | "off";
export interface PackState { word: string; mark: string; group: PackGroup; body: string }

/** A pack's state and the one sentence under it (README rule 5): only availability counts, never a newer default. */
export function packState(kit: Kit, pack: KitPack): PackState {
  const state = pack.state;
  const make = (word: string, tone: "idle" | "hold" | "quiet", ring: "ready" | "unavailable" | "paused", group: PackGroup, body: string) =>
    ({ word, mark: mark(word, tone, ring), group, body });
  if (state.kind === "uninstalled") return make(L("已卸载"), "quiet", "paused", "off", L("这个包的插件已卸载，包里的东西不再列出。重新添加后，你改过的提示词照原样回来。"));
  if (state.kind === "disabled") return make(L("已停用"), "quiet", "paused", "off", L("插件停用了：包里的技能、角色和提示词都不会被用到。启用后照原来的设置。"));
  if (state.kind === "unknown") {
    const titles = state.issues.map(index => kit.catalog.issues[index]?.title).filter((title): title is string => Boolean(title));
    return make(L("没读全"), "hold", "unavailable", "na", L("{what}没读到，说不准包里有没有用不了的东西。", { what: joined(titles.map(title => `「${title}」`)) }));
  }
  if (state.kind === "attention") {
    const items = state.items.map(item => kit.byKey.get(item.entry)).filter((entry): entry is KitEntry => Boolean(entry));
    return make(L("{n} 项要处理", { n: state.items.length }), "hold", "unavailable", "na", items.map(entry => entry.name + colon() + reasonWord(entry)).join(english() ? "; " : "；"));
  }
  return make(L("在用"), "idle", "ready", "on", L("包里的东西都能用。"));
}
