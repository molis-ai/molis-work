import { actionEffect, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, knowledgeCatalogText, type KnowledgeListEntry } from "@molis-ai/molis-work-contracts/services/knowledge";
import { directEligible } from "./assistant-authority.js";
import type { KnowledgeDispatchGuard } from "@molis-ai/molis-work-service-knowledge";

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
    ? ["本轮可用的业务能力（按提供方分组）。没有标记的只读取；标“可撤销”的执行时不经确认，事后可以在工作面板撤销；标“修改”的执行前会请用户确认；标“不可撤回”的执行前会请用户确认，执行后撤不回来：",
      ...[...groups].map(([provider, titles]) => `- ${provider}：${titles.join("、")}`)]
    : ["本轮没有可用的业务能力。"];
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

/** What the Host reads for a round's situation besides the directory itself. */
export type KnowledgeMaterialGuard = KnowledgeDispatchGuard;
type WithKnowledgeGuard<T> = T & KnowledgeMaterialGuard;
type MaybeAsync<T> = T | null | Promise<T | null>;
export interface AssistantRoundFactPorts {
  knowledgeTally?(projectId: string, views: readonly ActionView[]): MaybeAsync<WithKnowledgeGuard<{ total: number; sources: Array<{ plugin_title: string; count: number }> }>>;
  knowledgeCatalog?(projectId: string, views: readonly ActionView[], words: string): MaybeAsync<WithKnowledgeGuard<{ total: number; whole: boolean; pieces: KnowledgeListEntry[] }>>;
}

/**
 * The line 「本轮情况」 gives about the project's knowledge when the round may list it (specs/project-knowledge PMAT-33): a fact,
 * so a question that sounds general is not answered from general knowledge only because nothing said the project holds documents.
 * Empty for personal work, a round without 「列出项目资料」, a count the Host cannot read now, and none counted: a project whose
 * sources are still being listed would otherwise be said to hold nothing.
 */
export async function knowledgeFact(ports: AssistantRoundFactPorts, projectId: string | null, offered: readonly ActionView[], guards?: KnowledgeMaterialGuard[]): Promise<string> {
  const list = knowledgeActions.list;
  if (!projectId || !ports.knowledgeTally || !offered.some(view => view.capability_id === list.capability_id && view.provider.provider_id === KNOWLEDGE_PROVIDER_ID)) return "";
  let tally: Awaited<ReturnType<NonNullable<AssistantRoundFactPorts["knowledgeTally"]>>>;
  try { tally = await ports.knowledgeTally(projectId, offered); } catch { return ""; }
  if (!tally?.total) return "";
  if (tally.beforeDispatch) guards?.push({ beforeDispatch: tally.beforeDispatch, sourceCapture: tally.sourceCapture, assertCardsCurrent: tally.assertCardsCurrent });
  return `这个项目的资料有 ${tally.total} 份（${tally.sources.map(source => `${source.plugin_title} ${source.count}`).join("、")}）。`;
}

/**
 * 「项目资料目录」(specs/project-knowledge §6.4, PMAT-35): titles and briefs for the model to choose from, then pull the text with
 * tools, and each knowledge action's exact identity and input so it is called without looking it up. Empty when the round may
 * not list the project's knowledge, for personal work, a catalog the Host cannot read now, and an empty one.
 */
export async function knowledgeDirectory(ports: AssistantRoundFactPorts, projectId: string | null, offered: readonly ActionView[], words: string, guards?: KnowledgeMaterialGuard[]): Promise<string> {
  const tools = offered.filter(view => view.provider.provider_id === KNOWLEDGE_PROVIDER_ID && view.action.audiences.includes("agent"));
  if (!projectId || !ports.knowledgeCatalog || !tools.some(view => view.capability_id === knowledgeActions.list.capability_id)) return "";
  let catalog: Awaited<ReturnType<NonNullable<AssistantRoundFactPorts["knowledgeCatalog"]>>>;
  try { catalog = await ports.knowledgeCatalog(projectId, offered, words); } catch { return ""; }
  if (!catalog?.pieces.length) return "";
  if (catalog.beforeDispatch) guards?.push({ beforeDispatch: catalog.beforeDispatch, sourceCapture: catalog.sourceCapture, assertCardsCurrent: catalog.assertCardsCurrent });
  const input = (view: ActionView) => {
    const schema = view.action.input_schema as { properties?: Record<string, unknown>; required?: string[] };
    return Object.keys(schema.properties ?? {}).map(key => schema.required?.includes(key) ? `${key}（必填）` : key).join("、");
  };
  return [knowledgeCatalogText(catalog), "", `资料的这些能力经 read-capability 直接调用（provider_id 为 ${KNOWLEDGE_PROVIDER_ID}，input 是对象），不必先查找：`,
    ...tools.map(view => `- ${view.action.title}：capability_id ${view.capability_id}，version ${view.version}；input 字段 ${input(view)}`)].join("\n");
}
