import { isTerminalAgentPhase, type AgentRunPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ensureProjectPlugins, projectPluginProblem } from "./project-plugins.js";
import type { ProjectPluginHttpPorts, ProjectPluginRouteHooks } from "./project-plugin-http.js";
import { agentQuestionHtml } from "./agent-question-card.js";
import { CARD_RESULT_OPEN, cardOutcomeSteps, interactionNextSteps } from "./agent-next-steps.js";
import { assistantCardHtml, cardView } from "./assistant/assistant-card-view.js";
import type { StoredCard } from "./assistant/assistant-store.js";
import { L } from "./web-locale.js";
import { icon, escapeHtml, renderPluginStageShell, renderEmpty, renderSidebar, renderInteractionNextSteps, type InteractionNextStep } from "@molis-ai/molis-work-design-system";
import {
  CODING_PLUGIN_ID,
  CODING_PROJECT_PLUGIN_ID,
  CODING_UI_CONTRIBUTION_ID,
  codingFollowUps,
  type CodingFollowUpRun,
  type CodingUiHostModel,
} from "@molis-ai/molis-work-plugin-coding";
import { DIFF_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-diff";
import {
  FILES_PLUGIN_ID,
  renderFilesBrowserDirectory,
  renderFilesBrowserResult,
} from "@molis-ai/molis-work-plugin-files";
import {
  renderGitBrowserDirectory,
  renderGitBrowserResult,
} from "@molis-ai/molis-work-plugin-git";
import { TEXT_STATS_UI_CONTRIBUTION_ID } from "@molis-ai/molis-work-plugin-text-stats";

import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { AssistantCard } from "@molis-ai/molis-work-contracts/services/assistant";

import type { PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Coding's directory panel, rendered by the Plugin the Host is running.
 *
 * This is the whole point of the `plugin_panels` seam: the shell does not know
 * how to draw Coding, it asks the running Plugin. When the platform cannot be
 * started — for any reason — this returns null and the shell renders what it
 * rendered before. A degraded page is a better answer than a page that fails
 * because one Plugin did.
 */

export interface CodingSurfacePorts extends ProjectPluginHttpPorts {
  escapeHtml(value: unknown): string;
}

export async function codingDirectoryPanel(
  ports: CodingSurfacePorts,
): Promise<{ panel: string; plugin_id: string } | null> {
  return codingPanel(ports, "directory");
}

export async function codingWorkbenchPanel(ports: CodingSurfacePorts) {
  return codingPanel(ports, "workbench");
}

async function codingPanel(ports: CodingSurfacePorts, surface: "directory" | "workbench") {
  const record = await ensureProjectPlugins(ports);
  const problem = projectPluginProblem(record, ports.store, CODING_PLUGIN_ID);
  if (problem || !record.platform) {
    const message = ports.escapeHtml(problem?.reason ?? record.error ?? "Coding 插件未能启动");
    const panel = surface === "directory"
      ? `<section class="mw-empty" role="alert"><p>${message}</p></section>`
      : `<section class="desktop-work-surface" data-work-surface="coding" data-work-surface-label="Coding" hidden><div class="mw-empty" role="alert"><p>${message}</p><p>请检查插件状态后重新打开。</p></div></section>`;
    return { panel, plugin_id: CODING_PROJECT_PLUGIN_ID };
  }
  const contribution = record.platform.supervisor.contribution(CODING_PLUGIN_ID);
  const views = (contribution as { views?: ReadonlyArray<{
    descriptor: { contribution_id: string };
    render(request: { surface: string; model: CodingUiHostModel }): string;
  }> } | null)?.views ?? [];
  const view = views.find((entry) => entry.descriptor.contribution_id === CODING_UI_CONTRIBUTION_ID);
  if (!view) return { plugin_id: CODING_PROJECT_PLUGIN_ID, panel: failedStage("coding", "Coding 页面未注册") };

  try {
    // The session directory is not the Host's to fill: Coding's own view reads it from Coding's store at render
    // (codingUiView), so the Host hands over only what is the Host's — the page's face, companions and primitives.
    const model: CodingUiHostModel = {
      route_prefix: ports.routePrefix ?? "",
      face: "sessions",
      filter: "all",
      tools: [],
      workspace_path: null,
      companion_directory: renderFilesBrowserDirectory(L) + renderGitBrowserDirectory(L),
      companion_result: renderFilesBrowserResult(L) + renderGitBrowserResult(L),
      primitives: {
        escape: ports.escapeHtml,
        icon: (name) => icon(name as Parameters<typeof icon>[0]),
        text: L,
        formatDate: (value) => value.slice(0, 10),
      },
    };
    return {
      panel: view.render({ surface, model }),
      plugin_id: CODING_PROJECT_PLUGIN_ID,
    };
  } catch (error) {
    return { plugin_id: CODING_PROJECT_PLUGIN_ID, panel: failedStage("coding", error instanceof Error ? error.message : "Coding 页面读取失败") };
  }
}

/** Files hands its snapshots on as process items (artifact-positioning A2); either declaration list can name them. */
function readsFilesOutputs(platform: { supervisor: { manifest(pluginId: string): import("@molis-ai/molis-work-contracts/platform/plugin").PluginManifest | undefined } }, pluginId: string): boolean {
  const files = platform.supervisor.manifest(FILES_PLUGIN_ID), consumer = platform.supervisor.manifest(pluginId);
  const outputs = [...files?.artifacts.produces ?? [], ...files?.process_items?.produces ?? []];
  return [...consumer?.artifacts.consumes ?? [], ...consumer?.process_items?.consumes ?? []].some(input =>
    outputs.some(output => output.artifact_type_id === input.artifact_type_id && output.schema_version === input.schema_version));
}

/**
 * What the Coding family still adds around a project's plugin route (project-plugin-http.ts): a consumer of Files' outputs reads
 * them fresh first, and Coding's answers carry the cards the Host renders for it. Diff and Text Stats draw their own, Coding its words
 * and its change reader (PG-062); the cards go with the rest of the result decoration's move to Coding (C7), the Files refresh once
 * the workspace has a platform notice (N-14); then the hooks go too.
 */
export const codingRouteHooks: ProjectPluginRouteHooks = ({ platform, pluginId, ports }) => ({
  async beforeDispatch(router) {
    // Existing workspace outputs need a settings refresh before their consumers
    // read them. Unrelated plugins must not cause Files reads or publications.
    if (!readsFilesOutputs(platform, pluginId)) return;
    await router.dispatch({ method: "GET", pathname: `/api/plugins/${FILES_PLUGIN_ID}/state`, actor_id: ports.actorId, query: {} });
    await platform.wiring.drain();
  },
  async afterDispatch(result) { if (pluginId === CODING_PLUGIN_ID) decorateCodingResult(result); },
});

/**
 * The row beside Coding's composer (AC-25; AC-06, H4): the round's questions and cards as the Assistant's are, then, once
 * the round is over, the result of its card that ran last, then the round card's own follow-ups. Every step presses a
 * control already on screen; a card result's 「打开」 is named by its selector, as Coding's follow-ups are.
 */
export function codingNextSteps(run: CodingFollowUpRun & { awaiting_input: readonly AgentPendingQuestion[] }, cards: readonly AssistantCard[],
  say: (text: string, values?: Record<string, string | number>) => string): InteractionNextStep[] {
  const ran = isTerminalAgentPhase(run.phase as AgentRunPhase)
    ? cardOutcomeSteps(cards, "", say, card => `[data-card=${JSON.stringify(card.card_id)}] [data-ix-press=${JSON.stringify(CARD_RESULT_OPEN)}]`) : [];
  return interactionNextSteps(run.awaiting_input, cards, [], [...ran, ...codingFollowUps(run, say)], say);
}

/** A card of a Coding session as Coding keeps it: the SDK's card, with no work of the Assistant's around it. */
type CodingCard = Omit<StoredCard, "work_id">;

function decorateCodingResult(result: PluginRouteResponse): void {
  // Coding draws the model's words and its change reader itself (its `rich-html.ts`); the Host adds the question and suggestion cards and the next-step row.
  const body = result.body as { runs?: Array<CodingFollowUpRun & { turns: unknown; awaiting_input: AgentPendingQuestion[]; cards?: CodingCard[] }> } | undefined;
  if (body?.runs) for (const run of body.runs) {
    // Recovery reports also list runs, but carry receipt facts rather than turns.
    if (!Array.isArray(run.turns) || !Array.isArray(run.awaiting_input)) continue;
    // The same question card the Assistant shows, in the person's language; Coding's page restores its own drafts into it.
    for (const question of run.awaiting_input) Object.assign(question, { html: agentQuestionHtml(question, L, undefined, undefined, true) });
    // The row beside the composer: the round's questions as the Assistant's are, then what its card offers next (AC-25).
    // Drawn on every round the page receives in full, so a round it keeps unchanged keeps its row; it shows the latest one's.
    // The round's suggestions as the Assistant's cards are drawn; Coding keeps them and runs them (D25).
    const cards = (run.cards ?? []).map(card => cardView({ ...card, work_id: "" }));
    run.cards?.forEach((card, index) => Object.assign(card, { html: assistantCardHtml(cards[index]!, L, undefined, false) }));
    const steps = codingNextSteps(run, cards, L);
    Object.assign(run, { next_html: steps.length ? renderInteractionNextSteps(steps, L("下一步"), { max: steps.length }) : "" });
  }
}

function failedStage(plugin: string, message: string): string {
  return renderPluginStageShell({ surface: plugin, label: plugin, dataset: plugin + "-error",
    body: `<div class="mw-empty" role="alert"><p>${escapeHtml(message)}</p><a class="mw-btn" href="">${escapeHtml(L("重新打开页面"))}</a></div>` });
}

/** The stage panels the Host renders itself, and the contribution ids the Manifest fallback must not render again. */
export async function builtinStagePanels(ports: CodingSurfacePorts, enabled: readonly string[]): Promise<{ html: string[]; ids: string[] }> {
  const ids = [CODING_UI_CONTRIBUTION_ID];
  if (enabled.includes("diff")) ids.push(DIFF_UI_CONTRIBUTION_ID);
  if (enabled.includes("text-stats")) ids.push(TEXT_STATS_UI_CONTRIBUTION_ID);
  return { html: await codingCompanionStages(ports, enabled), ids };
}

/** Compose the running companions into the same main-stage contract as other apps. */
export async function codingCompanionStages(ports: CodingSurfacePorts, enabled: readonly string[]): Promise<string[]> {
  const record = await ensureProjectPlugins(ports);
  return ["files", "git", "diff", "text-stats"].filter(id => enabled.includes(id)).map(id => {
    const active = record.platform?.supervisor.state("io.molis.work." + id);
    if (active?.status !== "running") return failedStage(id, active?.message ?? L("插件未能启动，请重新打开页面"));
    const openWorkspace = `<a class="mw-btn mw-btn--ghost companion-manage" href="${escapeHtml(ports.routePrefix ?? "")}/settings/workspaces">${icon("folder-tree")}<span>${escapeHtml(L("工作目录设置"))}</span>${icon("chevron-right")}</a>`;
    let body: string;
    if (id === "files" || id === "git") {
      const directory = id === "files" ? renderFilesBrowserDirectory(L) : renderGitBrowserDirectory(L);
      const result = id === "files" ? renderFilesBrowserResult(L) : renderGitBrowserResult(L);
      body = `<div class="companion-layout">${renderSidebar({className:"companion-directory",header:openWorkspace,body:directory})}<div class="companion-result">${renderEmpty({className:"companion-empty",icon:id === "files" ? "file" : "git-branch",title:L(id === "files" ? "打开文件，开始阅读" : "查看工作区的改动"),body:L(id === "files" ? "从目录选择文件，阅读内容、保存选区，或固定两份快照进行对比。" : "从目录选择一项改动，查看读取时的固定差异，再决定是否暂存。")})}${result}</div></div>`;
    } else {
      // Diff and Text Stats are plugin pages: the stage draws their heading and one sentence, the actions sit at the right,
      // and the plugin's own content (or its empty block) fills the column.
      const files = enabled.includes("files");
      body = `<div class="plugin-stage-list" data-companion-list><header class="plugin-stage-chrome"><button class="mw-btn mw-btn--ghost" type="button" data-companion-refresh>${icon("refresh")}<span class="mw-spinner" hidden></span><span>${escapeHtml(L("刷新"))}</span></button><button class="mw-btn mw-btn--ghost" type="button" data-companion-open="${files ? "files" : "market"}">${icon("file")}<span>${escapeHtml(L(files ? "打开 Files" : "到插件市场添加 Files"))}</span></button></header><p data-companion-status role="status"></p><div data-companion-content></div></div>`;
    }
    return renderPluginStageShell({ surface: id, label: id === "text-stats" ? "Text Stats" : id[0]!.toUpperCase() + id.slice(1), dataset: "coding-companion", extraAttrs: `data-companion="${id}"`, body: id === "files" || id === "git" ? `<div class="companion-surface mw-layout-primitives">${body}</div>` : body });
  });
}
