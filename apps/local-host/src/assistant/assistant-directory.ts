import { actionEffect, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { directEligible } from "./assistant-authority.js";

/** Capabilities named as not usable now are capped; the rest are counted, so the directory stays short. */
const UNAVAILABLE_SHOWN = 12;

/**
 * Every action this scope offers to agents, split by whether it can run now. What cannot run stays in the round's
 * directory with its owner's reason (handbook 13.4), so the round can tell the person what is missing and where to fix it;
 * it is never given to the round as a tool, and the action service still refuses it.
 */
export function agentActions(views: readonly ActionView[], limit: number): { offered: ActionView[]; unavailable: ActionView[] } {
  const agent = views.filter(view => view.action.audiences.includes("agent") && view.provider.provider_id);
  return { offered: agent.filter(view => view.availability.available).slice(0, limit), unavailable: agent.filter(view => !view.availability.available) };
}

/** What exists, grouped by who provides it, so the round knows what to search for; schemas stay deferred until needed. */
export function capabilityDirectory(offered: readonly ActionView[], unavailable: readonly ActionView[], confirm: ReadonlySet<string>): string {
  const groups = new Map<string, string[]>();
  for (const view of offered) {
    const effect = actionEffect(view.action, view.capability_id);
    const mark = effect === "read" ? "" : effect === "irreversible" ? "（不可撤回）" : directEligible(view, offered, confirm) ? "（可撤销）" : "（修改）";
    groups.set(view.provider.title, [...groups.get(view.provider.title) ?? [], view.action.title + mark]);
  }
  const usable = offered.length
    ? ["本轮可用的业务能力（按提供方分组）。用 find-capabilities 按“提供方 名称”搜索取得准确标识与参数；读取类用 read-capability；标“可撤销”的，用户明确要求这个效果时用 change-reversible 直接做（事后告诉用户可以在工作面板撤销）；标“修改”“不可撤回”的用 change-capability，执行前会请用户确认：",
      ...[...groups].map(([provider, titles]) => `- ${provider}：${titles.join("、")}`)]
    : ["本轮没有可用的业务能力。需要操作数据时，如实告诉用户缺少哪类能力或授权。"];
  return [...usable, ...unavailableLines(unavailable)].join("\n");
}

/** The ones there but not usable now: by provider and reason, each reason once, as the owner gave it. */
function unavailableLines(unavailable: readonly ActionView[]): string[] {
  if (!unavailable.length) return [];
  const reasons = new Map<string, { provider: string; reason: string; titles: string[] }>();
  for (const view of unavailable.slice(0, UNAVAILABLE_SHOWN)) {
    const reason = view.availability.available ? "" : view.availability.reason;
    const key = `${view.provider.title}\n${reason}`;
    const row = reasons.get(key) ?? { provider: view.provider.title, reason, titles: [] };
    row.titles.push(view.action.title);
    reasons.set(key, row);
  }
  const more = unavailable.length - Math.min(unavailable.length, UNAVAILABLE_SHOWN);
  return ["", "现在用不了的能力（能力在，但还不能用；破折号后是提供方给的原因）：",
    ...[...reasons.values()].map(row => `- ${row.provider}：${row.titles.join("、")}——${row.reason}`),
    ...(more ? [`- 另有 ${more} 项现在用不了，未列出`] : [])];
}
