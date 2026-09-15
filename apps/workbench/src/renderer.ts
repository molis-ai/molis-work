import { countGoalDecisions } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchProjectSettingsPages } from "./project-settings-pages.js";
import { createWorkbenchFocusSections } from "./focus-sections.js";
import type { MolisWorkWebView } from "./page-view.js";
import { createWorkbenchSettingsRenderer } from "./settings-renderer.js";
import { type GoalsDocumentView as WebGoalView } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchDecisionCenterRenderer } from "./decision-center.js";
import { decisionTypeCounts } from "@molis-ai/molis-work-plugin-goals";
import { type WorkbenchDecisionGroup } from "./decision-center.js";
import { buildDecisionGroups } from "@molis-ai/molis-work-plugin-goals";
import { pendingDecisionCount } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchGoalsDecisionResultsRenderer } from "./ui-composition.js";
import { type GoalsDecisionGroup } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchGoalsFragmentRenderer } from "./goals-fragment-renderer.js";
import { createWorkbenchGoalsPageRenderer } from "./goals-page-renderer.js";
import { buildGoalsNavigationItems } from "@molis-ai/molis-work-plugin-goals";
import { ARTIFACT_EMBED_STYLES, ARTIFACT_WORKBENCH_STYLES } from "./artifact-ui.js";
import { icon, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { createWorkbenchOnboardingRenderer } from "./onboarding-renderer.js";
import { TRASH_GOAL_STYLES } from "@molis-ai/molis-work-plugin-goals";
import { ONBOARDING_STYLES } from "@molis-ai/molis-work-design-system";
import {
  THEME_BOOTSTRAP_SCRIPT as BASE_THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "@molis-ai/molis-work-design-system";
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
import { createGoalStateExplainer } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchGoalsFactorsRenderer } from "./ui-composition.js";
import { createWorkbenchGoalsDialogsRenderer } from "./ui-composition.js";
import { GOAL_DISPLAY_STATUSES } from "@molis-ai/molis-work-plugin-goals";
import { PLANNING_SETTINGS_STYLES } from "@molis-ai/molis-work-plugin-goals";
import { partOfChildViews } from "@molis-ai/molis-work-plugin-goals";
import { sortGoalTreeItems } from "@molis-ai/molis-work-plugin-goals";
import { createArtifactReferenceRenderer } from "./ui-composition.js";
import { renderWorkbenchDocument } from "./ui-composition.js";
import { createGoalsDecisionPresentation } from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchGoalsProposalRenderer } from "./ui-composition.js";
import type {
  FeedItemRecord,
  InboxEntryRecord,
} from "@molis-ai/molis-work-plugin-feed";
import { PROJECT_OPERATIONS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-work";
import { PROJECT_OPERATIONS_STYLES } from "@molis-ai/molis-work-plugin-work";
import { renderProjectOperations } from "./ui-composition.js";
import { renderWorkTerminal } from "./ui-composition.js";
import { createWorkbenchFeedProjectionRenderer } from "./feed-projection-ui.js";
import { createWorkbenchInboxProjectionRenderer } from "./inbox-projection-ui.js";
import { type FeedSupplementalEntry } from "./feed-projection-ui.js";
import { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createWorkbenchProjectDirectoryRenderer } from "./project-directory-renderer.js";
import type { GoalPolicy, PlanningMethodPack, PlanningMethodComposition } from "@molis-ai/molis-work-contracts/modules/goals";
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

const renderRecentDecisionResults = createWorkbenchGoalsDecisionResultsRenderer({ translate: L, escapeHtml, icon, formatDate });

type DecisionGoalGroup = GoalsDecisionGroup<WebGoalView>;

const { renderDecisionGoalLink } =
  createGoalsDecisionPresentation({ translate: L, escapeHtml });

const { renderGoalTreeProposalDecision } = createWorkbenchGoalsProposalRenderer({ translate: L, escapeHtml, icon, renderList });

const { renderFeedNativePluginPersistedDetail, renderFeedNativePluginSurface } = createWorkbenchFeedProjectionRenderer({ L, dateTimeLocale });
const { renderInboxNativePluginSurface } = createWorkbenchInboxProjectionRenderer({ L, dateTimeLocale });

const { explainWorkState, explainParentCompletion } = createGoalStateExplainer(L);

const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;

const { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation } = createWorkbenchSettingsNavigation({ L, escapeHtml, icon, withDesktopQuery });

const projectDirectoryRenderer = createWorkbenchProjectDirectoryRenderer({ L, escapeHtml, icon, withDesktopQuery, htmlLang, renderIconSprite, controlTokenMeta, clientI18nScript, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT });

const { renderMolisWorkProjectIndex } = projectDirectoryRenderer;

const { renderProjectMigrationDialog } = projectDirectoryRenderer;

const renderMolisWorkSettings = createWorkbenchSettingsRenderer({
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
  return `<meta name="molis-work-control-token" content="${escapeHtml(controlToken)}">`;
}

function dataJson(view: MolisWorkWebView): string {
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

function renderRelations(item: WebGoalView, view: MolisWorkWebView, editable = true): string {
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

function decisionGroupModel(group: DecisionGoalGroup, view: MolisWorkWebView): WorkbenchDecisionGroup {
  return { ownerGoalId: group.ownerGoalId, item: group.item,
    counts: { goalTree: group.goalTreeProposals.length },
    ownerLinkHtml: renderDecisionGoalLink(group.item),
    content: {
      goalTree: group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join(""),
    },
  };
}

function renderDecisionCenter(view: MolisWorkWebView, desktopInbox = false): string {
  return decisionCenterRenderer.renderDecisionCenter({ groups: buildDecisionGroups(view).map(group => decisionGroupModel(group, view)),
    count: pendingDecisionCount(view), typeCounts: decisionTypeCounts(view), recentHtml: renderRecentDecisionResults(view),
  }, desktopInbox);
}

function renderPersistedFeedItemDetail(
  item: FeedItemRecord,
  routePrefix = "",
  options: { entryId?: string; inboxActive?: boolean; inboxEntry?: InboxEntryRecord | null; surface?: "frame-block" } = {},
): string {
  return renderFeedNativePluginPersistedDetail(item, routePrefix, options);
}

function renderFeedWorkbenchFragment(view: MolisWorkWebView): string {
  return prefixLocalLinks(renderFeedNativePluginSurface(
    view,
    "workbench-fragment",
    "feed",
    [],
    true,
  ), view.route_prefix);
}

const goalsFactorsRenderer = createWorkbenchGoalsFactorsRenderer({ translate: L, escapeHtml, icon, renderFocusSectionDeck });

function renderGoalFactors(item: WebGoalView, view: MolisWorkWebView): string {
  return goalsFactorsRenderer(item, {
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

function renderGoalDecisionHtml(item: WebGoalView, view: MolisWorkWebView): string {
  const group = buildDecisionGroups(view).find((entry) => entry.item?.goal.goal_id === item.goal.goal_id);
  if (!group?.goalTreeProposals.length) return "";
  return group.goalTreeProposals.map((proposal) => renderGoalTreeProposalDecision(proposal, view)).join("");
}

function renderGoalDocument(item: WebGoalView, view: MolisWorkWebView, selected: boolean): string {
  return goalsDocumentRenderer.renderGoalDocument(item, {
    activeGoalId: view.snapshot.board.active_goal_id,
    decisionCount: countGoalDecisions(view, item.goal.goal_id),
    relatedWorkHtml: renderGoalFactors(item, view),
    artifactHtml: item.artifact_embed_html
      ? `<h3>${L("关联结果")}</h3>${item.artifact_embed_html}`
      : "",
    coverageHtml: `${renderCoverageHtml(item)}${renderInputBindingsHtml(item)}${renderContractCoverage(item, view)}${renderChildProgress(item, view)}`,
    decisionHtml: renderGoalDecisionHtml(item, view),
    eventDocument: item.event_document ?? null,
  }, selected);
}

/** Bind the public fragment composition to existing content owners. */
const {
  renderGoalDocumentFragment, renderMolisWorkMomentumFragment,
} = createWorkbenchGoalsFragmentRenderer<WebGoalView, MolisWorkWebView>({
  document: (item, view) => renderGoalDocument(item, view, true),
  trash: (item) => renderTrashGoalDocument(item, true),
  momentum: (view, goalId, items) => renderGoalMomentum(view, goalId, [...items]),
  prefixLinks: prefixLocalLinks,
});

/** Event history content remains with the execution/records owner, not the route adapter. */
const goalsDialogsRenderer = createWorkbenchGoalsDialogsRenderer({ translate: L, escapeHtml, icon });

const { renderGoalTrashDialog } = goalsDialogsRenderer;

function renderCreateDialog(view: MolisWorkWebView): string {
  return goalsDialogsRenderer.renderCreateDialog(view.goals);
}

const renderMolisWorkOnboarding = createWorkbenchOnboardingRenderer({
  L, escapeHtml, htmlLang, controlTokenMeta, withDesktopQuery, clientI18nScript, icon, renderIconSprite,
  nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT,
});

function renderTuiPane(
  selected: WebGoalView | undefined,
  view: MolisWorkWebView,
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

const { renderMolisWorkProjectGeneralSettings, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings } = createWorkbenchProjectSettingsPages({
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
    .replaceAll('href="__WORKBENCH_CSS__"', 'href="/assets/molis-work-workbench.css"')
    .replaceAll('href="__PROJECT_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings/guidance` : "/settings/projects"}"`)
    .replaceAll('href="__SYSTEM_SETTINGS__"', `href="/settings/appearance${routePrefix ? `?project=${routePrefix.slice("/projects/".length)}` : ""}"`);
  return desktopShell ? appendDesktopQueryToLocalHrefs(resolved) : resolved;
}

/** Shared workbench presentation. Kept outside project HTML so the browser can reuse it. */
function renderMolisWorkWorkbenchStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${VISUAL_FOUNDATION_STYLES}${TRASH_GOAL_STYLES}${PROJECT_OPERATIONS_STYLES}${ARTIFACT_EMBED_STYLES}${ARTIFACT_WORKBENCH_STYLES}${IMMERSIVE_NAVIGATION_STYLES}${IMMERSIVE_DIRECTORY_STYLES}${PROJECT_HOME_STYLES}${GOAL_CANVAS_STYLES}.document-pane.is-syncing .goal-document { animation: none; }`;
}

/** Full-screen first-run and update journey. */
function renderMolisWorkOnboardingStylesheet(): string {
  return ONBOARDING_STYLES;
}

/** Shared project index presentation. */
function renderMolisWorkProjectIndexStylesheet(): string {
  return `${STYLES}${PROJECT_INDEX_STYLES}${VISUAL_FOUNDATION_STYLES}`;
}

/** Shared settings presentation, reused across project and global settings routes. */
function renderMolisWorkSettingsStylesheet(): string {
  return `${STYLES}${MORE_STYLES}${RESPONSIVE_STYLES}${PROJECT_INDEX_STYLES}${SETTINGS_STYLES}${PROJECT_GUIDANCE_SETTINGS_STYLES}${PROJECT_RULES_SETTINGS_STYLES}${PLANNING_SETTINGS_STYLES}${VISUAL_FOUNDATION_STYLES}`;
}

/** Shared workbench behavior. Locale strings and project facts remain page-local. */
function renderMolisWorkWorkbenchClientScript(): string {
  return `${CONTROL_CLIENT_SCRIPT}${CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${PROJECT_OPERATIONS_CLIENT_SCRIPT}`;
}

const { renderMolisWorkWeb, renderMolisWorkRefreshFragment } =
  createWorkbenchGoalsPageRenderer<WebGoalView, MolisWorkWebView, FeedSupplementalEntry>({
    L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, clientI18nScript, dataJson, prefixLocalLinks, renderWorkbenchDocument,
    renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, goalsTreeRenderer,
    renderCreateDialog, renderGoalTrashDialog, renderMomentumPlaceholder, renderTuiPane,
    renderProjectOperations: (project, data) => renderProjectOperations(project, data, icon, L),
    renderDesktopProjectChrome, renderProjectSwitcher,
    renderFeedNativePluginSurface, renderInboxNativePluginSurface,
  });
  return { renderMolisWorkProjectIndex, renderMolisWorkSettings, renderDecisionCenter, renderPersistedFeedItemDetail, renderFeedWorkbenchFragment, renderGoalDocumentFragment, renderMolisWorkMomentumFragment, renderMolisWorkOnboarding, renderMolisWorkProjectGeneralSettings, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings, renderMolisWorkWorkbenchStylesheet, renderMolisWorkOnboardingStylesheet, renderMolisWorkProjectIndexStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkWeb, renderMolisWorkRefreshFragment };
}

export type WorkbenchRenderer = ReturnType<typeof createWorkbenchRenderer>;
