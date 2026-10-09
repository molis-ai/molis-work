import {
  icon,
  renderIconSprite,
  THEME_BOOTSTRAP_SCRIPT as BASE_THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
} from "@molis-ai/molis-work-design-system";
import type { GoalPolicy, PlanningMethodComposition, PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { FeedItemRecord, InboxEntryRecord } from "@molis-ai/molis-work-plugin-feed";
import {
  buildDecisionGroups,
  buildGoalsNavigationItems,
  countGoalDecisions,
  createGoalStateExplainer,
  GOAL_DISPLAY_STATUSES,
  type GoalsDocumentView as WebGoalView,
  partOfChildViews,
  sortGoalTreeItems,
} from "@molis-ai/molis-work-plugin-goals";
import { createWorkbenchFeedProjectionRenderer, type FeedSupplementalEntry } from "./feed-projection-ui.js";
import { createWorkbenchFocusSections } from "./focus-sections.js";
import { createWorkbenchGoalsFragmentRenderer } from "./goals-fragment-renderer.js";
import { createWorkbenchGoalsPageRenderer } from "./goals-page-renderer.js";
import type { createWorkbenchLocale, WebLocale } from "./i18n.js";
import { createWorkbenchInboxProjectionRenderer } from "./inbox-projection-ui.js";
import { createWorkbenchScheduleProjectionRenderer } from "./schedule-projection-ui.js";
import { createWorkbenchOnboardingRenderer } from "./onboarding-renderer.js";
import {
  renderMolisWorkArrivalStylesheet as renderArrivalCss,
  renderMolisWorkSettingsStylesheet as renderSettingsCss,
  renderMolisWorkWorkbenchClientScript as renderWorkbenchClient,
  renderMolisWorkWorkbenchStylesheet as renderWorkbenchCss,
} from "./page-assets.js";
import { renderGoalInputsHtml } from "./goal-inputs-html.js";
import type { MolisWorkWebView } from "./page-view.js";
import { createWorkbenchProjectChooserRenderer } from "./arrival/chooser.js";
import { createWorkbenchProjectSettingsPages } from "./project-settings-pages.js";
import { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createWorkbenchSettingsRenderer } from "./settings-renderer.js";
import {
  createArtifactReferenceRenderer,
  createWorkbenchGoalsContextRenderer,
  createWorkbenchGoalsDialogsRenderer,
  createWorkbenchGoalsDocumentRenderer,
  createWorkbenchGoalsFactorsRenderer,
  createWorkbenchGoalsMomentumRenderer,
  createWorkbenchGoalsPolicyRenderer,
  createWorkbenchGoalsProposalRenderer,
  createWorkbenchGoalsRelationRenderer,
  createWorkbenchGoalsStatusRenderer,
  createWorkbenchGoalsTreeRenderer,
  renderProjectOperations,
  renderShelfContribution,
  renderExperimentsContribution,
  renderImagesContribution,
  renderPagesContribution,
  renderFormContribution,
  renderDatasetContribution,
  renderPptContribution,
  renderLingguangContribution,
  renderTodoContribution,
  renderJellyContribution,
  renderCogniaContribution,
  renderAlchemistContribution,
  renderWorkflowsContribution,
  renderWorkbenchDocument,
  renderWorkTerminal,
} from "./ui-composition.js";
import { renderSideViewDocument as renderSideView, type SideViewDocumentInput } from "./side-view-document.js";
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

const { renderGoalTreeProposalDecision } = createWorkbenchGoalsProposalRenderer({ translate: L, escapeHtml, icon, renderList });

const { renderFeedNativePluginPersistedDetail, renderFeedNativePluginSurface } = createWorkbenchFeedProjectionRenderer({ L, dateTimeLocale });
const { renderInboxNativePluginSurface } = createWorkbenchInboxProjectionRenderer({ L, dateTimeLocale });
const { renderScheduleNativePluginSurface } = createWorkbenchScheduleProjectionRenderer({ L, dateTimeLocale });
function renderShelfNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderShelfContribution(surface, {
    materials: [],
    results: [],
    clipboard: [],
    recipes: [],
    selected_id: null,
    primitives: { escape: escapeHtml, text: L },
  });
}


function renderPagesNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderPagesContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

function renderFormNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderFormContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

function renderDatasetNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderDatasetContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

function renderImagesNativePluginSurface(): string {
  return renderImagesContribution({ primitives: { escape: escapeHtml, text: L } });
}

function renderPptNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderPptContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

function renderCogniaNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderCogniaContribution(surface, { primitives: { escape: escapeHtml, text: L } });
}

function renderJellyNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderJellyContribution(surface, { primitives: { escape: escapeHtml, text: L } });
}

function renderLingguangNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderLingguangContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

function renderTodoNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderTodoContribution(surface, { primitives: { escape: escapeHtml, text: L } });
}

function renderWorkflowsNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderWorkflowsContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

function renderAlchemistNativePluginSurface(surface: "directory" | "workbench"): string {
  return renderAlchemistContribution(surface, {
    primitives: { escape: escapeHtml, text: L },
  });
}

const { explainWorkState, explainParentCompletion } = createGoalStateExplainer(L);

const THEME_BOOTSTRAP_SCRIPT = `${BASE_THEME_BOOTSTRAP_SCRIPT}${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}`;

const { settingsContextHref, renderProjectSwitcher, renderDesktopProjectChrome, renderSettingsNavigation, renderProjectSettingsNavigation } = createWorkbenchSettingsNavigation({ L, escapeHtml, icon, withDesktopQuery });

const projectChooserRenderer = createWorkbenchProjectChooserRenderer({ L, escapeHtml, icon, withDesktopQuery, htmlLang, renderIconSprite, controlTokenMeta, clientI18nScript, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT, dateTimeLocale });

const { renderMolisWorkProjectIndex, renderProjectBrief: renderMolisWorkProjectBrief } = projectChooserRenderer;

const renderMolisWorkSettings = createWorkbenchSettingsRenderer({
  L, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, clientI18nScript, renderIconSprite,
  withDesktopQuery, settingsContextHref, renderSettingsNavigation,
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
      board: { project_id: view.snapshot.board.project_id },
      cursor: view.snapshot.cursor,
    },
    project: view.project,
    active_goal_id: view.active_goal_id,
    goals: summarize(view.goals),
    archived_goals: summarize(view.archived_goals),
    trashed_goals: summarize(view.trashed_goals),
    inbox_judgment: view.inbox_judgment ?? null,
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

function renderReference(value: string, label = value): string {
  return artifactReferenceRenderer(value, label);
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

const { renderGoalMomentum, renderMomentumPlaceholder, renderGoalKanban } = createWorkbenchGoalsMomentumRenderer({
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

const { renderProjectPolicyDocument, renderPolicyEditor } = createWorkbenchGoalsPolicyRenderer({
  translate: L, escapeHtml, formatDate, icon, defaultPolicy: DEFAULT_GOAL_POLICY,
});

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

function renderInboxWorkbenchFragment(view: MolisWorkWebView): string {
  return prefixLocalLinks(renderInboxNativePluginSurface(view, "workbench"), view.route_prefix);
}

function renderScheduleWorkbenchFragment(view: MolisWorkWebView): string {
  return prefixLocalLinks(renderScheduleNativePluginSurface(view, "workbench"), view.route_prefix);
}

const goalsFactorsRenderer = createWorkbenchGoalsFactorsRenderer({ translate: L, escapeHtml, icon, renderFocusSectionDeck });

function renderGoalFactors(item: WebGoalView, view: MolisWorkWebView): string {
  return goalsFactorsRenderer(item, {
    relationsHtml: renderRelations(item, view, Boolean(item.event_document?.state.owner)),
    policyHtml: renderPolicyEditor(item),
  });
}

const goalsDocumentRenderer = createWorkbenchGoalsDocumentRenderer({
  translate: L, escapeHtml, icon, formatDate, renderVisibleGoalStatus, renderStatus, sectionHeading,
});

const { renderTrashGoalDocument } = goalsDocumentRenderer;

/** The Goal's inputs, followed and fixed, in one list with one 「加输入」 (goal-inputs-html.ts). */
function renderInputBindingsHtml(item: WebGoalView): string {
  return renderGoalInputsHtml(item, { L, escapeHtml, renderReference });
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
      ? `<h3>${L("交付物")}</h3>${item.artifact_embed_html}`
      : "",
    coverageHtml: `${renderInputBindingsHtml(item)}${renderContractCoverage(item, view)}${renderChildProgress(item, view)}`,
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
  momentum: (view, goalId, items) => renderGoalMomentum(view, goalId, [...items]) + renderGoalKanban(view, goalId, [...items]),
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

const { renderMolisWorkProjectSettingsHub, renderMolisWorkProjectGeneralSettings, renderMolisWorkProjectSettings, renderMolisWorkProjectGuidanceSettings, renderMolisWorkPlanningLibrary, renderMolisWorkPlanningMethodPage, renderMolisWorkPlanningSettings } = createWorkbenchProjectSettingsPages({
  L, escapeHtml, formatDate, icon, htmlLang, listJoin, controlTokenMeta, clientI18nScript, renderIconSprite, withDesktopQuery,
  themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT,
  navigation: { settingsContextHref, renderProjectSettingsNavigation, renderSettingsNavigation }, renderProjectPolicyDocument, composePlanningMethodPacks,
});

function prefixLocalLinks(html: string, routePrefix: string, desktopShell = false): string {
  // Global settings and the capability service live outside any project; a Plugin linking to them from the project page
  // means the global page (project settings come in through the __PROJECT_SETTINGS__ tokens). Only href itself: data-*-href stays.
  const prefixed = routePrefix
    ? html.replace(/(\s)href="\/(?!locale(?:\?|")|projects\/|settings(?:[/?#"])|capabilities(?:[/?#"]))/g, `$1href="${routePrefix}/`)
    : html;
  const resolved = prefixed
    .replaceAll('href="__PROJECT_INDEX__"', 'href="/"')
    .replaceAll('href="__SYSTEM_CAPABILITIES__"', `href="/capabilities/library${routePrefix ? `?project=${encodeURIComponent(routePrefix.split("/")[2]!)}` : ""}"`)
    .replaceAll('href="__WORKBENCH_CSS__"', 'href="/assets/molis-work-workbench.css"')
    .replaceAll('href="__PROJECT_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings` : "/settings/projects"}"`)
    .replaceAll('href="__PROJECT_RULES_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings/rules` : "/settings/projects"}"`)
    .replaceAll('href="__SYSTEM_SETTINGS__"', `href="/settings/appearance${routePrefix ? `?project=${encodeURIComponent(routePrefix.split("/")[2]!)}` : ""}"`);
  return desktopShell ? appendDesktopQueryToLocalHrefs(resolved) : resolved;
}

const { renderMolisWorkWeb, renderMolisWorkRefreshFragment } =
  createWorkbenchGoalsPageRenderer<WebGoalView, MolisWorkWebView, FeedSupplementalEntry>({
    L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, clientI18nScript, dataJson, prefixLocalLinks, renderWorkbenchDocument,
    renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, goalsTreeRenderer,
    renderCreateDialog, renderGoalTrashDialog, renderMomentumPlaceholder, renderGoalKanban, renderTuiPane,
    renderProjectOperations: (project, data) => renderProjectOperations(project, data, icon, L),
    renderDesktopProjectChrome, renderProjectSwitcher,
    renderFeedNativePluginSurface, renderInboxNativePluginSurface, renderScheduleNativePluginSurface, renderShelfNativePluginSurface, renderExperimentsContribution, renderImagesNativePluginSurface, renderPagesNativePluginSurface, renderFormNativePluginSurface, renderDatasetNativePluginSurface, renderPptNativePluginSurface, renderLingguangNativePluginSurface, renderTodoNativePluginSurface, renderJellyNativePluginSurface, renderCogniaNativePluginSurface, renderAlchemistNativePluginSurface, renderWorkflowsNativePluginSurface,
  });
  return {
    renderMolisWorkProjectIndex,
    renderMolisWorkProjectBrief,
    renderMolisWorkSettings,
    renderPersistedFeedItemDetail,
    renderFeedWorkbenchFragment,
    renderInboxWorkbenchFragment,
    renderScheduleWorkbenchFragment,
    renderGoalDocumentFragment,
    renderMolisWorkMomentumFragment,
    renderMolisWorkOnboarding,
    renderMolisWorkProjectSettingsHub,
    renderMolisWorkProjectGeneralSettings,
    renderMolisWorkProjectSettings,
    renderMolisWorkProjectGuidanceSettings,
    renderMolisWorkPlanningLibrary,
    renderMolisWorkPlanningMethodPage,
    renderMolisWorkPlanningSettings,
    renderMolisWorkWorkbenchStylesheet: (): string => renderWorkbenchCss(),
    renderMolisWorkArrivalStylesheet: (): string => renderArrivalCss(),
    renderMolisWorkSettingsStylesheet: (): string => renderSettingsCss(),
    renderMolisWorkWorkbenchClientScript: (): string => renderWorkbenchClient(),
    renderMolisWorkWeb,
    renderMolisWorkRefreshFragment,
    /** One plugin tab of the side panel, or null when that view is not declared by a plugin enabled here. */
    renderSideViewDocument: (input: Omit<SideViewDocumentInput, "lang" | "headHtml" | "clientI18nScript" | "themeBootstrapScript" | "translate"> & { controlToken: string }): string | null =>
      renderSideView({ ...input, lang: htmlLang(), headHtml: controlTokenMeta(input.controlToken), clientI18nScript: clientI18nScript(), themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, translate: L }),
  };
}

export type WorkbenchRenderer = ReturnType<typeof createWorkbenchRenderer>;
