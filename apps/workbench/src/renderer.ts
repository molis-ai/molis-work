import { countGoalDecisions, renderGoalDescriptionBasics } from "@adeptify/goalboard-plugin-goals";
import { createWorkbenchProjectSettingsPages } from "./project-settings-pages.js";
import { createWorkbenchFocusSections } from "./focus-sections.js";
import type { GoalBoardWebView } from "./page-view.js";
import { createWorkbenchSettingsRenderer } from "./settings-renderer.js";
import { type GoalsDocumentView as WebGoalView } from "@adeptify/goalboard-plugin-goals";
import { createWorkbenchDecisionCenterRenderer } from "./decision-center.js";
import { decisionTypeCounts } from "@adeptify/goalboard-plugin-goals";
import { type WorkbenchDecisionGroup } from "./decision-center.js";
import { buildDecisionGroups } from "@adeptify/goalboard-plugin-goals";
import { pendingDecisionCount } from "@adeptify/goalboard-plugin-goals";
import { decisionGroupCount } from "@adeptify/goalboard-plugin-goals";
import { createGoalsDecisionResults } from "@adeptify/goalboard-plugin-goals";
import { createWorkbenchGoalsDecisionResultsRenderer } from "./ui-composition.js";
import { type GoalsDecisionGroup } from "@adeptify/goalboard-plugin-goals";
import { createWorkbenchGoalsFragmentRenderer } from "./goals-fragment-renderer.js";
import { createWorkbenchGoalsPageRenderer } from "./goals-page-renderer.js";
import { buildGoalsNavigationItems } from "@adeptify/goalboard-plugin-goals";
import { ARTIFACT_EMBED_STYLES, ARTIFACT_WORKBENCH_STYLES } from "./artifact-ui.js";
import { icon, renderIconSprite } from "@adeptify/goalboard-design-system";
import { createWorkbenchOnboardingRenderer } from "./onboarding-renderer.js";
import { TRASH_GOAL_STYLES } from "@adeptify/goalboard-plugin-goals";
import { ONBOARDING_STYLES } from "@adeptify/goalboard-design-system";
import {
  THEME_BOOTSTRAP_SCRIPT as BASE_THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "@adeptify/goalboard-design-system";
import { CLIENT_SCRIPT } from "./browser-assets.js";
import { CONTROL_CLIENT_SCRIPT } from "./browser-assets.js";
import { IMMERSIVE_NAVIGATION_STYLES } from "./styles/immersive-navigation.js";
import { PROJECT_HOME_STYLES } from "./styles/project-home.js";
import { IMMERSIVE_DIRECTORY_STYLES } from "./styles/immersive-directory.js";
import { GOAL_CANVAS_STYLES } from "./styles/goal-canvas.js";
import { MORE_STYLES } from "./browser-assets.js";
import { PROJECT_GUIDANCE_SETTINGS_STYLES } from "./browser-assets.js";
import { PROJECT_INDEX_STYLES } from "./browser-assets.js";
import { PROJECT_RULES_SETTINGS_STYLES } from "./browser-assets.js";
import { RESPONSIVE_STYLES } from "./browser-assets.js";
import { SETTINGS_STYLES } from "./browser-assets.js";
import { STYLES } from "./browser-assets.js";

import { createWorkbenchGoalsPolicyRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsSafetyRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsRelationRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsTreeRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsMomentumRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsDocumentRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsContextRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsStatusRenderer } from "./ui-composition.js";
import { createGoalStateExplainer } from "@adeptify/goalboard-plugin-goals";
import { createWorkbenchGoalsFactorsRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsDialogsRenderer } from "./ui-composition.js";
import { GOAL_DISPLAY_STATUSES } from "@adeptify/goalboard-plugin-goals";
import { PLANNING_SETTINGS_STYLES } from "@adeptify/goalboard-plugin-goals";
import { partOfChildViews } from "@adeptify/goalboard-plugin-goals";
import { sortGoalTreeItems } from "@adeptify/goalboard-plugin-goals";
import { createArtifactReferenceRenderer } from "./ui-composition.js";
import { renderWorkbenchDocument } from "./ui-composition.js";
import { createGoalsDecisionPresentation } from "@adeptify/goalboard-plugin-goals";
import { createWorkbenchGoalsProposalRenderer } from "./ui-composition.js";
import type {
  FeedItemRecord,
  FeedItemType,
  InboxEntryRecord,
} from "@adeptify/goalboard-plugin-feed";
import { PROJECT_OPERATIONS_CLIENT_SCRIPT } from "@adeptify/goalboard-plugin-work";
import { PROJECT_OPERATIONS_STYLES } from "@adeptify/goalboard-plugin-work";
import { renderProjectOperations } from "./ui-composition.js";
import { renderWorkTerminal } from "./ui-composition.js";
import { createWorkbenchFeedProjectionRenderer } from "./feed-projection-ui.js";
import { type FeedSupplementalEntry } from "./feed-projection-ui.js";
import { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createWorkbenchProjectDirectoryRenderer } from "./project-directory-renderer.js";
import type { GoalPolicy, PlanningMethodPack, PlanningMethodComposition } from "@adeptify/goalboard-contracts/modules/goals";
import type { createWorkbenchLocale, WebLocale } from "./i18n.js";
export interface WorkbenchRendererPorts {
  locale: Pick<ReturnType<typeof createWorkbenchLocale>, "L" | "htmlLang" | "dateTimeLocale" | "listJoin" | "localeSwitchHref" | "clientI18nScript"> & { currentLocale(): WebLocale };
  desktop: { appendDesktopQueryToLocalHrefs(html: string): string; withDesktopQuery(path: string): string; bootstrapScript: string };
  goals: { defaultPolicy: GoalPolicy; composePlanningMethodPacks(methods: readonly PlanningMethodPack[]): PlanningMethodComposition };
}

/** Compose application pages from registered UI owners; request and desktop state belong to the Host. */
export function createWorkbenchRenderer(ports: WorkbenchRendererPorts) {
  const { L, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref, clientI18nScript } = ports.locale;
  const { appendDesktopQueryToLocalHrefs, withDesktopQuery, bootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } = ports.desktop;
  const { defaultPolicy: DEFAULT_GOAL_POLICY, composePlanningMethodPacks } = ports.goals;
const { sectionHeading, subsectionHeading, renderFocusSectionDeck } = createWorkbenchFocusSections({ L, escapeHtml });

const decisionCenterRenderer = createWorkbenchDecisionCenterRenderer({ translate: L, escapeHtml, icon, currentLocale, formatDate });

const { recentDecisionResults } = createGoalsDecisionResults(L);

const renderRecentDecisionResults = createWorkbenchGoalsDecisionResultsRenderer({ translate: L, escapeHtml, icon, formatDate });

type DecisionGoalGroup = GoalsDecisionGroup<WebGoalView>;

const { renderDecisionGoalLink } =
  createGoalsDecisionPresentation({ translate: L, escapeHtml });

const { renderGoalTreeProposalDecision } = createWorkbenchGoalsProposalRenderer({ translate: L, escapeHtml, icon, renderList });

const { renderFeedNativePluginPersistedDetail, renderFeedNativePluginSurface } = createWorkbenchFeedProjectionRenderer({ L, dateTimeLocale });

const { explainWorkState, explainParentCompletion } = createGoalStateExplainer(L);

const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;

const { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation } = createWorkbenchSettingsNavigation({ L, escapeHtml, icon, withDesktopQuery });

const projectDirectoryRenderer = createWorkbenchProjectDirectoryRenderer({ L, escapeHtml, icon, withDesktopQuery, htmlLang, renderIconSprite, controlTokenMeta, clientI18nScript, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT });

const { renderGoalBoardProjectIndex } = projectDirectoryRenderer;

const { renderProjectMigrationDialog } = projectDirectoryRenderer;

const renderGoalBoardSettings = createWorkbenchSettingsRenderer({
  L, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, clientI18nScript, renderIconSprite,
  withDesktopQuery, settingsContextHref, renderSettingsNavigation, renderProjectMigrationDialog,
  themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
});

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function controlTokenMeta(controlToken: string): string {
  return `<meta name="goalboard-control-token" content="${escapeHtml(controlToken)}">`;
}

function dataJson(view: GoalBoardWebView): string {
  const summarize = (items: WebGoalView[]) => buildGoalsNavigationItems(
    items, goalId => partOfChildViews(goalId, view), visibleGoalStatusIcon,
  );
  return JSON.stringify({
    snapshot: {
      board: { board_id: view.snapshot.board.board_id },
      cursor: view.snapshot.cursor,
    },
    project: view.project,
    active_goal_id: view.active_goal_id,
    goals: summarize(view.goals),
    archived_goals: summarize(view.archived_goals),
    trashed_goals: summarize(view.trashed_goals),
  }).replaceAll("<", "\\u003c");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return L("未记录");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(dateTimeLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

const artifactReferenceRenderer = createArtifactReferenceRenderer({ escape: escapeHtml, icon, text: L });

function renderReference(value: string, label = value, evidenceId?: string): string {
  return artifactReferenceRenderer(value, label, evidenceId);
}

function renderList(values: string[], empty: string): string {
  if (values.length === 0) return `<p class="empty-row">${escapeHtml(L(empty))}</p>`;
  return `<ul class="doc-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

const { renderStatus, renderActionStatus, renderVisibleGoalStatus, visibleGoalStatusIcon } = createWorkbenchGoalsStatusRenderer({ translate: L, escapeHtml, icon });

function sortGoals(items: WebGoalView[]): WebGoalView[] {
  return sortGoalTreeItems(items);
}

const goalsTreeRenderer = createWorkbenchGoalsTreeRenderer({
  translate: L, escapeHtml, currentLocale, listJoin, icon,
  renderStatus, renderActionStatus, renderVisibleGoalStatus, displayStatuses: GOAL_DISPLAY_STATUSES,
});

const { renderGoalMomentum, renderMomentumPlaceholder } = createWorkbenchGoalsMomentumRenderer({
  translate: L, escapeHtml, currentLocale, icon, renderVisibleGoalStatus,
});

const goalsRelationRenderer = createWorkbenchGoalsRelationRenderer({ translate: L, escapeHtml, icon });

function renderRelations(item: WebGoalView, view: GoalBoardWebView, editable = true): string {
  return goalsRelationRenderer.renderRelations(item, view, editable);
}

const { renderChildProgress, renderContractCoverage } = createWorkbenchGoalsContextRenderer({
  translate: L, escapeHtml, icon, currentLocale,
  subsectionHeading, explainWorkState, explainParentCompletion,
});

const { renderRiskWorkbench, renderImpactWorkbench } = createWorkbenchGoalsSafetyRenderer({
  translate: L, escapeHtml, formatDate, icon, currentLocale, renderReference, renderList,
});

const { renderProjectPolicyDocument, renderPolicyEditor } = createWorkbenchGoalsPolicyRenderer({
  translate: L, escapeHtml, formatDate, icon, currentLocale, defaultPolicy: DEFAULT_GOAL_POLICY,
});

function decisionGroupModel(group: DecisionGoalGroup, view: GoalBoardWebView): WorkbenchDecisionGroup {
  return { ownerGoalId: group.ownerGoalId, item: group.item,
    counts: { goalTree: group.goalTreeProposals.length },
    ownerLinkHtml: renderDecisionGoalLink(group.item),
    content: {
      goalTree: group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join(""),
    },
  };
}

function renderDecisionCenter(view: GoalBoardWebView, desktopInbox = false): string {
  return decisionCenterRenderer.renderDecisionCenter({ groups: buildDecisionGroups(view).map(group => decisionGroupModel(group, view)),
    count: pendingDecisionCount(view), typeCounts: decisionTypeCounts(view), recentHtml: renderRecentDecisionResults(view),
  }, desktopInbox);
}

function renderFeedDecisionGroupDetail(group: DecisionGoalGroup, view: GoalBoardWebView, goalId: string, title: string, summary: string, updatedAt: string): string {
  return decisionCenterRenderer.renderFeedDecisionGroupDetail(decisionGroupModel(group, view), goalId, title, summary, updatedAt);
}

function renderPersistedFeedItemDetail(
  item: FeedItemRecord,
  routePrefix = "",
  options: { entryId?: string; inboxActive?: boolean; inboxEntry?: InboxEntryRecord | null } = {},
): string {
  return renderFeedNativePluginPersistedDetail(item, routePrefix, options);
}

function renderFeedWorkbenchFragment(
  view: GoalBoardWebView,
  defaultPreset: FeedItemType,
): string {
  return prefixLocalLinks(renderFeedNativePluginSurface(
    view,
    "workbench-fragment",
    defaultPreset,
    feedNativePluginSupplementalEntries(view),
    true,
  ), view.route_prefix);
}

function feedNativePluginSupplementalEntries(view: GoalBoardWebView): FeedSupplementalEntry[] {
  const decisionGroups = buildDecisionGroups(view);
  const decisions = decisionGroups.map((group): FeedSupplementalEntry => {
    const goalId = group.item?.goal.goal_id ?? group.ownerGoalId ?? "board";
    const title = group.item?.goal.title ?? L("整个项目的事项");
    const count = decisionGroupCount(group);
    const inboxEntry = goalId === "board" ? null : view.feed.inbox_entries.find((entry) =>
      entry.subject_type === "goal_decision" && entry.subject_id === goalId &&
      (entry.status === "open" || entry.status === "in_progress"),
    ) ?? null;
    return {
      entry_id: `decision:${goalId}`,
      item_id: null,
      inbox_entry: inboxEntry ? { ...inboxEntry, project_id: inboxEntry.board_id } : null,
      item: null,
      preset: "inbox_message",
      provider: "other",
      kind_label: L("Inbox Message · Goal 决定"),
      source_label: "GoalBoard",
      disposition: "inbox",
      title,
      summary: L("{count} 项等待你判断。", { count }),
      updated_at: group.item?.goal.updated_at ?? view.events[0]?.at ?? "",
      read: true,
      attention_rank: 3,
      detail_slot_html: renderFeedDecisionGroupDetail(
        group,
        view,
        goalId,
        title,
        L("{count} 项等待你判断。", { count }),
        group.item?.goal.updated_at ?? view.events[0]?.at ?? "",
      ),
    };
  });
  const results = recentDecisionResults(view).map((result): FeedSupplementalEntry => ({
    entry_id: `result:${result.event.event_id}`,
    item_id: null,
    inbox_entry: null,
    item: null,
    preset: "inbox_message",
    provider: "other",
    kind_label: L("Inbox Message · 处理结果"),
    source_label: "GoalBoard",
    disposition: "saved",
    title: result.title,
    summary: result.effects.join(currentLocale() === "en" ? " " : "；"),
    updated_at: result.event.at,
    read: true,
    attention_rank: 1,
    detail_slot_html: `<article class="feed-detail feed-detail--result" data-feed-detail="result:${escapeHtml(result.event.event_id)}"><header class="feed-detail-header"><div class="feed-detail-kicker"><span>Inbox Message</span><span>${escapeHtml(result.kindLabel)}</span><span>${escapeHtml(result.state)}</span></div><h1>${escapeHtml(result.title)}</h1><p>${escapeHtml(result.effects.join(currentLocale() === "en" ? " " : "；"))}</p><div class="feed-detail-meta"><span>${icon("workflow")}GoalBoard</span><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div></header><section class="decision-results feed-result-record" aria-label="${L("最近处理结果")}"><article class="decision-result decision-result--${result.kind}"><span class="decision-result-icon">${icon(result.kind === "risk" ? "risk" : result.kind === "rewire" ? "link" : result.kind === "review" ? "user" : result.kind === "candidate" ? "plus" : result.kind === "goalTree" ? "tree" : "clipboard")}</span><div class="decision-result-copy"><div><span>${escapeHtml(result.kindLabel)}</span><strong>${escapeHtml(result.state)}</strong><time datetime="${escapeHtml(result.event.at)}">${formatDate(result.event.at)}</time></div><h3>${escapeHtml(result.title)}</h3>${result.effects.map((effect) => `<p>${escapeHtml(effect)}</p>`).join("")}<small>${escapeHtml(result.reasonLabel ? `${result.reasonLabel}：${result.reason ?? result.event.reason}` : L("你的理由：{reason}", { reason: result.reason ?? result.event.reason }))}</small></div>${result.links.length ? `<div class="decision-result-links">${result.links.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}${icon("chevron-right")}</a>`).join("")}</div>` : ""}</article></section></article>`,
  }));
  return [...decisions, ...results];
}

const goalsFactorsRenderer = createWorkbenchGoalsFactorsRenderer({ translate: L, escapeHtml, icon, renderFocusSectionDeck });

function renderGoalFactors(item: WebGoalView, view: GoalBoardWebView, extras: { basicsExtrasHtml: string; contractCoverageHtml: string }): string {
  return goalsFactorsRenderer(item, {
    basicsHtml: `${renderGoalDescriptionBasics(item.event_document ?? null, item, L, escapeHtml, icon)}${extras.basicsExtrasHtml}`,
    coverageHtml: extras.contractCoverageHtml,
    relationsHtml: renderRelations(item, view, Boolean(item.event_document?.state.owner)),
    risksHtml: renderRiskWorkbench(item, view, true, false),
    impactsHtml: renderImpactWorkbench(item, true, false),
    policyHtml: renderPolicyEditor(item),
  });
}

const goalsDocumentRenderer = createWorkbenchGoalsDocumentRenderer({
  translate: L, escapeHtml, icon, formatDate, renderVisibleGoalStatus, renderStatus, sectionHeading,
});

const { renderTrashGoalDocument } = goalsDocumentRenderer;

function renderCoverageHtml(item: WebGoalView): string {
  if (!item.coverage.length) return "";
  return `<h3>${L("历史需求覆盖")}</h3><ul>${item.coverage.map((coverage) =>
    `<li><strong>${escapeHtml(coverage.requirement_id)} · ${escapeHtml(coverage.statement)}</strong><small>${escapeHtml(coverage.disposition)}${coverage.reason ? ` · ${escapeHtml(coverage.reason)}` : ""}</small></li>`
  ).join("")}</ul>`;
}

function renderInputBindingsHtml(item: WebGoalView): string {
  if (!item.input_bindings.length) return "";
  return `<h3>${L("绑定资料")}</h3><div class="bound-list">${item.input_bindings.map((binding) =>
    `<article>${renderReference(binding.source_ref, binding.input_name)}<small>${escapeHtml(binding.state)} · ${escapeHtml(binding.reason)}${binding.snapshot_digest ? ` · ${escapeHtml(binding.snapshot_digest)}` : ""}</small></article>`
  ).join("")}</div>`;
}

function renderGoalDocument(item: WebGoalView, view: GoalBoardWebView, selected: boolean): string {
  const contractCoverageHtml = renderContractCoverage(item, view);
  const basicsExtrasHtml = `${renderCoverageHtml(item)}${renderInputBindingsHtml(item)}${renderChildProgress(item, view)}`;
  return goalsDocumentRenderer.renderGoalDocument(item, {
    activeGoalId: view.snapshot.board.active_goal_id,
    decisionCount: countGoalDecisions(view, item.goal.goal_id),
    relatedWorkHtml: renderGoalFactors(item, view, { basicsExtrasHtml, contractCoverageHtml }),
    artifactHtml: item.artifact_embed_html
      ? `<h3>${L("关联结果")}</h3>${item.artifact_embed_html}`
      : "",
    coverageHtml: `${basicsExtrasHtml}${contractCoverageHtml}`,
    eventDocument: item.event_document ?? null,
  }, selected);
}

/** Bind the public fragment composition to existing content owners. */
const {
  renderGoalDocumentFragment, renderGoalBoardMomentumFragment,
} = createWorkbenchGoalsFragmentRenderer<WebGoalView, GoalBoardWebView>({
  document: (item, view) => renderGoalDocument(item, view, true),
  trash: (item) => renderTrashGoalDocument(item, true),
  momentum: (view, goalId, items) => renderGoalMomentum(view, goalId, [...items]),
  prefixLinks: prefixLocalLinks,
});

/** Event history content remains with the execution/records owner, not the route adapter. */
const goalsDialogsRenderer = createWorkbenchGoalsDialogsRenderer({ translate: L, escapeHtml, icon });

const { renderGoalTrashDialog } = goalsDialogsRenderer;

function renderCreateDialog(view: GoalBoardWebView): string {
  return goalsDialogsRenderer.renderCreateDialog(view.goals);
}

const renderGoalBoardOnboarding = createWorkbenchOnboardingRenderer({
  L, escapeHtml, htmlLang, controlTokenMeta, withDesktopQuery, clientI18nScript, icon, renderIconSprite,
  nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
});

function renderTuiPane(
  selected: WebGoalView | undefined,
  view: GoalBoardWebView,
  cliAvailability: Record<string, boolean> = {},
): string {
  return renderWorkTerminal({
    selected: selected ? {
      ...selected.goal,
      event_work: selected.event_work === true,
      statusHtml: renderVisibleGoalStatus(selected, "data-tui-owner-status", "data-tui-owner-status-label"),
    } : undefined,
    children: (selected ? sortGoals(partOfChildViews(selected.goal.goal_id, view)) : []).map((child) => {
      const explanation = explainWorkState(child.status);
      return { goal_id: child.goal.goal_id, title: child.goal.title, statusLabel: explanation.label, nextAction: explanation.nextAction };
    }),
    cliAvailability,
    text: L,
    icon,
  });
}

const { renderGoalBoardProjectGeneralSettings, renderGoalBoardProjectSettings, renderGoalBoardProjectGuidanceSettings, renderGoalBoardPlanningLibrary, renderGoalBoardPlanningMethodPage, renderGoalBoardPlanningSettings } = createWorkbenchProjectSettingsPages({
  L, escapeHtml, formatDate, icon, htmlLang, listJoin, controlTokenMeta, clientI18nScript, renderIconSprite, withDesktopQuery,
  themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
  navigation: { settingsContextHref, renderProjectSettingsNavigation, renderSettingsNavigation }, renderProjectPolicyDocument, composePlanningMethodPacks,
});

function prefixLocalLinks(html: string, routePrefix: string, desktopShell = false): string {
  const prefixed = routePrefix
    ? html.replace(/href="\/(?!locale(?:\?|")|projects\/)/g, `href="${routePrefix}/`)
    : html;
  const resolved = prefixed
    .replaceAll('href="__PROJECT_INDEX__"', 'href="/"')
    .replaceAll('href="__WORKBENCH_CSS__"', 'href="/assets/goalboard-workbench.css"')
    .replaceAll('href="__PROJECT_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings/guidance` : "/settings/projects"}"`)
    .replaceAll('href="__SYSTEM_SETTINGS__"', `href="/settings/appearance${routePrefix ? `?project=${routePrefix.slice("/projects/".length)}` : ""}"`);
  return desktopShell ? appendDesktopQueryToLocalHrefs(resolved) : resolved;
}

/** Shared workbench presentation. Kept outside project HTML so the browser can reuse it. */
function renderGoalBoardWorkbenchStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${VISUAL_FOUNDATION_STYLES}${TRASH_GOAL_STYLES}${PROJECT_OPERATIONS_STYLES}${ARTIFACT_EMBED_STYLES}${ARTIFACT_WORKBENCH_STYLES}${IMMERSIVE_NAVIGATION_STYLES}${IMMERSIVE_DIRECTORY_STYLES}${PROJECT_HOME_STYLES}${GOAL_CANVAS_STYLES}.document-pane.is-syncing .goal-document { animation: none; }`;
}

/** Full-screen first-run and update journey. */
function renderGoalBoardOnboardingStylesheet(): string {
  return ONBOARDING_STYLES;
}

/** Shared project index presentation. */
function renderGoalBoardProjectIndexStylesheet(): string {
  return `${STYLES}${PROJECT_INDEX_STYLES}${VISUAL_FOUNDATION_STYLES}`;
}

/** Shared settings presentation, reused across project and global settings routes. */
function renderGoalBoardSettingsStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${PROJECT_INDEX_STYLES}${SETTINGS_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${VISUAL_FOUNDATION_STYLES}`;
}

/** Shared workbench behavior. Locale strings and project facts remain page-local. */
function renderGoalBoardWorkbenchClientScript(): string {
  return `${CONTROL_CLIENT_SCRIPT}${CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${PROJECT_OPERATIONS_CLIENT_SCRIPT}`;
}

const { renderGoalBoardWeb, renderGoalBoardRefreshFragment } =
  createWorkbenchGoalsPageRenderer<WebGoalView, GoalBoardWebView, FeedSupplementalEntry>({
    L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, clientI18nScript, dataJson, prefixLocalLinks, renderWorkbenchDocument,
    renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, goalsTreeRenderer,
    renderCreateDialog, renderGoalTrashDialog, renderMomentumPlaceholder, renderTuiPane,
    renderProjectOperations: (project, data) => renderProjectOperations(project, data, icon, L),
    renderDesktopProjectChrome, renderProjectSwitcher,
    feedNativePluginSupplementalEntries, renderFeedNativePluginSurface,
  });
  return { renderGoalBoardProjectIndex, renderGoalBoardSettings, renderDecisionCenter, renderPersistedFeedItemDetail, renderFeedWorkbenchFragment, renderGoalDocumentFragment, renderGoalBoardMomentumFragment, renderGoalBoardOnboarding, renderGoalBoardProjectGeneralSettings, renderGoalBoardProjectSettings, renderGoalBoardProjectGuidanceSettings, renderGoalBoardPlanningLibrary, renderGoalBoardPlanningMethodPage, renderGoalBoardPlanningSettings, renderGoalBoardWorkbenchStylesheet, renderGoalBoardOnboardingStylesheet, renderGoalBoardProjectIndexStylesheet, renderGoalBoardSettingsStylesheet, renderGoalBoardWorkbenchClientScript, renderGoalBoardWeb, renderGoalBoardRefreshFragment };
}

export type WorkbenchRenderer = ReturnType<typeof createWorkbenchRenderer>;
