import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  HomePageDiffResult,
  HomePageOverview,
  HomePageRef,
  HomePageVersionSummary,
} from "@molis-ai/molis-work-contracts/services/home";
import {
  renderCheckSummary,
  renderCompareAdoptBar,
  renderEditConflict,
  type CheckSummaryItem,
} from "@molis-ai/molis-work-design-system/home-page-adoption";
import {
  escapeHtml,
  icon,
  renderAlert,
  renderBadge,
  renderButton,
  renderPopover,
  renderStatusMark,
  t as uiText,
} from "@molis-ai/molis-work-plugin-sdk/ui";

export interface InspectedAction extends ExactActionReference {
  readonly title: string;
  readonly description: string;
  readonly provider_title: string;
  readonly operation: string;
  readonly effect: "read" | "write" | "irreversible";
  readonly external: boolean;
  readonly metered: boolean;
  readonly available: boolean;
  readonly unavailable_reason: string | null;
}

export interface InspectReportItem {
  readonly id: "public_actions" | "sandbox_isolation" | "project_scope" | "design_tokens";
  readonly ok: boolean;
  readonly severity: "ok" | "error" | "warning";
  readonly issues: ReadonlyArray<{ readonly path: string; readonly reason: string }>;
}

export interface InspectResponse {
  readonly version: HomePageVersionSummary;
  readonly actions: readonly InspectedAction[];
  readonly report: { readonly ok: boolean; readonly checks: readonly InspectReportItem[] };
  readonly pruned: ReadonlyArray<{ readonly page_id: string; readonly version: number }>;
}

export const homePageRefKey = (ref: HomePageRef): string => `${ref.page_id}@${ref.version}`;
export const homeActionIdKey = (ref: ExactActionReference): string => `${ref.provider_id}|${ref.capability_id}|${ref.version}`;

export function latestUnadoptedDraft(overview: HomePageOverview): HomePageVersionSummary | null {
  const active = overview.selection.kind === "page" ? overview.selection : null;
  const candidates = overview.versions.filter(v => !v.approval);
  if (!candidates.length) return null;
  if (!active) return candidates[0] ?? null;
  const newerOnActive = candidates.find(v => v.page_id === active.page_id && v.version > active.version);
  return newerOnActive ?? candidates[0] ?? null;
}

export function previousApprovedVersion(overview: HomePageOverview): HomePageVersionSummary | null {
  const activeKey = overview.selection.kind === "page" ? homePageRefKey(overview.selection) : null;
  return overview.versions.find(v => v.approval && homePageRefKey(v) !== activeKey) ?? null;
}

export function renderVersionSlotHtml(overview: HomePageOverview, versionMenuOpen: boolean): string {
  if (!overview.versions.length) return "";
  const sel = overview.selection;
  const active = sel.kind === "page" ? overview.versions.find(v => v.page_id === sel.page_id && v.version === sel.version) : null;
  const label = active
    ? uiText.text("workbench.home-pages.version-label", { v: active.version })
    : uiText.text("workbench.home-pages.default-first-page");
  const prev = previousApprovedVersion(overview);
  const rows = overview.versions
    .slice(0, 12)
    .map(v => {
      const isCurrent = Boolean(active && homePageRefKey(v) === homePageRefKey(active));
      const badge = isCurrent
        ? renderBadge({ label: uiText.text("workbench.home-pages.in-use"), tone: "success" })
        : !v.approval
          ? renderBadge({ label: uiText.text("workbench.home-pages.draft"), tone: "info" })
          : renderBadge({ label: uiText.text("workbench.home-pages.approved"), tone: "neutral" });
      const manual = v.author === "person" ? renderBadge({ label: uiText.text("workbench.home-pages.manual-edit"), tone: "neutral" }) : "";
      const actionBtn = isCurrent
        ? ""
        : !v.approval
          ? renderButton({
              label: uiText.text("workbench.home-pages.view-draft"),
              variant: "link",
              size: "sm",
              attrs: { "data-hp-act": "compare", "data-hp-page": v.page_id, "data-hp-ver": String(v.version) },
            })
          : renderButton({
              label: uiText.text("workbench.home-pages.restore-version"),
              variant: "link",
              size: "sm",
              attrs: { "data-hp-act": "open-restore", "data-hp-page": v.page_id, "data-hp-ver": String(v.version) },
            });
      return `<li class="hp-ver-row${isCurrent ? " is-current" : ""}"><div class="hp-ver-row__main"><strong>${escapeHtml(v.title)} · v${v.version}</strong><span class="hp-ver-row__tags">${badge}${manual}</span></div>${actionBtn}</li>`;
    })
    .join("");
  const quickActions = [
    prev
      ? renderButton({
          label: uiText.text("workbench.home-pages.restore-previous"),
          variant: "secondary",
          size: "sm",
          attrs: { "data-hp-act": "open-restore", "data-hp-page": prev.page_id, "data-hp-ver": String(prev.version) },
        })
      : "",
    sel.kind === "page"
      ? renderButton({
          label: uiText.text("workbench.home-pages.back-to-default"),
          variant: "ghost",
          size: "sm",
          attrs: { "data-hp-act": "select-basic" },
        })
      : "",
  ]
    .filter(Boolean)
    .join("");

  const pop = versionMenuOpen
    ? renderPopover({
        preview: true,
        className: "hp-ver-popover",
        attrs: { "data-hp-ver-popover": true },
        body: `<ul class="hp-ver-list">${rows}</ul>${quickActions ? `<div class="hp-ver-foot-actions">${quickActions}</div>` : ""}<p class="hp-ver-note">${escapeHtml(uiText.text("workbench.home-pages.switch-keeps-work"))}</p>`,
      })
    : "";
  return `<span class="hp-ver-wrap"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm hp-ver-trigger" data-hp-act="toggle-versions" aria-expanded="${versionMenuOpen}">${icon("history")}<span>${escapeHtml(label)}</span>${icon("chevron-down")}</button>${pop}</span>`;
}

export function renderHomeNoticeHtml(options: {
  readonly overview: HomePageOverview;
  readonly comparing: boolean;
  readonly dismissedDraftKey: string | null;
  readonly fallbackAlert: { title: string; body: string; retryRef?: HomePageRef } | null;
  readonly restoreNotice: { page: HomePageRef; title: string } | null;
}): string {
  const parts: string[] = [];
  if (options.fallbackAlert) {
    parts.push(
      renderAlert({
        tone: "warning",
        title: options.fallbackAlert.title,
        body: options.fallbackAlert.body,
        actions: [
          ...(options.fallbackAlert.retryRef
            ? [
                {
                  label: uiText.text("workbench.home-pages.retry-load"),
                  variant: "secondary" as const,
                  size: "sm" as const,
                  attrs: {
                    "data-hp-act": "retry-load",
                    "data-hp-page": options.fallbackAlert.retryRef.page_id,
                    "data-hp-ver": String(options.fallbackAlert.retryRef.version),
                  },
                },
              ]
            : []),
          { label: uiText.text("workbench.home-pages.back-to-default"), variant: "ghost", size: "sm", attrs: { "data-hp-act": "select-basic" } },
        ],
      }),
    );
  }
  if (options.overview.selection.kind === "basic" && options.restoreNotice) {
    parts.push(
      `<p class="hp-quiet-note">${icon("info")}<span>${escapeHtml(uiText.text("workbench.home-pages.saved-can-switch-back", { title: options.restoreNotice.title }))}</span>${renderButton({
        label: uiText.text("workbench.home-pages.switch-back"),
        variant: "link",
        size: "sm",
        attrs: { "data-hp-act": "open-restore", "data-hp-page": options.restoreNotice.page.page_id, "data-hp-ver": String(options.restoreNotice.page.version) },
      })}</p>`,
    );
  }
  const draft = !options.comparing ? latestUnadoptedDraft(options.overview) : null;
  if (draft && homePageRefKey(draft) !== options.dismissedDraftKey) {
    parts.push(
      `<div class="hp-draft-banner" data-home-draft-banner><div class="hp-draft-banner__copy">${renderStatusMark({
        label: uiText.text("workbench.home-pages.draft-ready-title", { v: draft.version }),
        tone: "progress",
        icon: "sparkles",
      })}<span>${escapeHtml(uiText.text("workbench.home-pages.draft-ready-caption"))}</span></div><div class="hp-draft-banner__actions">${renderButton({
        label: uiText.text("workbench.home-pages.dismiss-banner"),
        variant: "ghost",
        size: "sm",
        attrs: { "data-hp-act": "dismiss-draft", "data-hp-key": homePageRefKey(draft) },
      })}${renderButton({
        label: uiText.text("workbench.home-pages.view-draft"),
        variant: "primary",
        size: "sm",
        attrs: { "data-hp-act": "compare", "data-hp-page": draft.page_id, "data-hp-ver": String(draft.version) },
      })}</div></div>`,
    );
  }
  return parts.join("");
}

function buildCheckItems(inspect: InspectResponse): CheckSummaryItem[] {
  const labels: Record<InspectReportItem["id"], string> = {
    public_actions: uiText.text("workbench.home-pages.check-public"),
    sandbox_isolation: uiText.text("workbench.home-pages.check-sandbox"),
    project_scope: uiText.text("workbench.home-pages.check-scope"),
    design_tokens: uiText.text("workbench.home-pages.check-design"),
  };
  const items: CheckSummaryItem[] = inspect.report.checks.map(check => ({
    state: check.severity === "error" ? "blocked" : check.severity === "warning" ? "waiting" : "done",
    text: check.issues.length ? `${labels[check.id]}：${check.issues[0]!.reason}` : labels[check.id],
  }));
  const missingDep = inspect.actions.filter(action => !action.available);
  if (missingDep.length) {
    items.push({
      state: "waiting",
      text: uiText.text("workbench.home-pages.check-dep-missing", { n: missingDep.length }),
    });
  }
  return items;
}

export function renderCompareShellHtml(activeLabel: string, draft: HomePageVersionSummary): string {
  return `
    <div class="hp-compare-switch">
      <div class="mw-toggle-group" role="group" aria-label="${escapeHtml(uiText.text("workbench.home-pages.compare-which"))}">
        <button type="button" class="mw-toggle" data-hp-view="now" aria-pressed="false">${escapeHtml(uiText.text("workbench.home-pages.side-now"))}</button>
        <button type="button" class="mw-toggle is-current" data-hp-view="draft" aria-pressed="true">${escapeHtml(uiText.text("workbench.home-pages.side-draft"))}</button>
      </div>
    </div>
    <div class="hp-compare-issues" data-hp-compare-issues></div>
    <div class="hp-compare-grid" data-hp-compare-grid data-view="draft">
      <section class="hp-compare-col" data-col="now" aria-label="${escapeHtml(uiText.text("workbench.home-pages.side-now"))}">
        <header class="hp-compare-col__head">${renderBadge({ label: uiText.text("workbench.home-pages.in-use"), tone: "success" })}<strong>${escapeHtml(activeLabel)}</strong></header>
        <div class="hp-compare-col__body" data-hp-now-stage></div>
      </section>
      <section class="hp-compare-col hp-compare-col--draft" data-col="draft" aria-label="${escapeHtml(uiText.text("workbench.home-pages.side-draft"))}">
        <header class="hp-compare-col__head">${renderBadge({ label: uiText.text("workbench.home-pages.draft"), tone: "info" })}<strong>${escapeHtml(draft.title)} · v${draft.version}</strong><span class="hp-preview-note">${escapeHtml(uiText.text("workbench.home-pages.preview-readonly-note"))}</span></header>
        <div class="hp-compare-col__body" data-hp-draft-stage></div>
      </section>
    </div>
    <div data-hp-compare-bar></div>
  `;
}

export function renderCompareChromeParts(options: {
  readonly draft: HomePageVersionSummary;
  readonly inspect: InspectResponse;
  readonly diff: HomePageDiffResult | null;
  readonly hasManualConflict: boolean;
  readonly conflictChoice: "mine" | "new" | "merge" | null;
  readonly blocker: "check" | "conflict" | null;
  readonly checksOpen: boolean;
}): { issuesHtml: string; barHtml: string } {
  const { draft, inspect, diff, hasManualConflict, conflictChoice, blocker, checksOpen } = options;
  const checks = buildCheckItems(inspect);
  const hasMissingDep = inspect.actions.some(a => !a.available);
  const summaryLabel =
    blocker === "check"
      ? uiText.text("workbench.home-pages.summary-failed")
      : blocker === "conflict"
        ? uiText.text("workbench.home-pages.summary-conflict")
        : hasMissingDep
          ? uiText.text("workbench.home-pages.summary-dep-off")
          : uiText.text("workbench.home-pages.summary-passed");
  const summaryTone = blocker === "check" ? "blocked" : blocker === "conflict" ? "attention" : hasMissingDep ? "hold" : "done";
  const summaryState = blocker === "check" ? "blocked" : blocker === "conflict" ? "conflict" : hasMissingDep ? "waiting" : "done";

  const conflictHtml =
    hasManualConflict && diff
      ? renderEditConflict({
          title: uiText.text("workbench.home-pages.conflict-title", { v: draft.version }),
          body: uiText.text("workbench.home-pages.conflict-body", { base: draft.based_on ?? 1 }),
          mineLabel: uiText.text("workbench.home-pages.conflict-mine", { base: draft.based_on ?? 1 }),
          mineValue: diff.files.map(f => f.path).join("、"),
          nextLabel: uiText.text("workbench.home-pages.conflict-next", { v: draft.version }),
          nextValue: `${draft.title}（${diff.files.length} 个文件变动）`,
          choices: [
            { label: uiText.text("workbench.home-pages.conflict-keep"), variant: "primary", attrs: { "data-hp-act": "conflict-pick", "data-hp-pick": "mine" } },
            { label: uiText.text("workbench.home-pages.conflict-use-new"), variant: "secondary", attrs: { "data-hp-act": "conflict-pick", "data-hp-pick": "new" } },
            { label: uiText.text("workbench.home-pages.conflict-merge"), variant: "ghost", attrs: { "data-hp-act": "conflict-pick", "data-hp-pick": "merge" } },
          ],
          ...(conflictChoice
            ? {
                resolved: {
                  text:
                    conflictChoice === "mine"
                      ? uiText.text("workbench.home-pages.conflict-picked-mine")
                      : conflictChoice === "new"
                        ? uiText.text("workbench.home-pages.conflict-picked-new")
                        : uiText.text("workbench.home-pages.conflict-picked-merge"),
                  changeLabel: uiText.text("workbench.home-pages.conflict-change"),
                  changeAttrs: { "data-hp-act": "conflict-pick", "data-hp-pick": "" },
                },
              }
            : {}),
        })
      : "";

  const failedCheckAlert =
    blocker === "check"
      ? renderAlert({
          tone: "danger",
          title: uiText.text("workbench.home-pages.check-failed-title"),
          body: inspect.report.checks.find(c => c.severity === "error")?.issues[0]?.reason ?? uiText.text("workbench.home-pages.check-failed-body"),
        })
      : "";

  const barHtml = renderCompareAdoptBar({
    summary: renderCheckSummary({
      id: "home-compare-checks",
      label: summaryLabel,
      tone: summaryTone,
      state: summaryState,
      items: checks,
      open: checksOpen,
      placement: "up",
      triggerAttrs: { "data-hp-act": "toggle-checks" },
    }),
    actions: renderButton({
      label: uiText.text("workbench.home-pages.close-compare"),
      variant: "ghost",
      size: "sm",
      attrs: { "data-hp-act": "exit-compare" },
    }),
    primary: renderButton({
      label: uiText.text("workbench.home-pages.adopt-ellipsis"),
      variant: "primary",
      size: "sm",
      key: "↵",
      disabled: Boolean(blocker),
      attrs: {
        "data-hp-act": "open-adopt",
        ...(blocker ? { title: uiText.text(blocker === "check" ? "workbench.home-pages.adopt-blocked-check" : "workbench.home-pages.adopt-blocked-conflict") } : {}),
      },
    }),
  });

  return { issuesHtml: `${failedCheckAlert}${conflictHtml}`, barHtml };
}

export function renderApprovalDialogHtml(options: {
  readonly operation: "adopt" | "restore";
  readonly target: HomePageVersionSummary;
  readonly inspect: InspectResponse;
  readonly overview: HomePageOverview;
}): string {
  const { operation, target, inspect, overview } = options;
  const priorApprovedKeys = new Set<string>();
  if (operation === "restore" && target.approval) {
    for (const a of target.approval.approved_actions) priorApprovedKeys.add(homeActionIdKey(a));
  } else if (overview.selection.kind === "page") {
    const sel = overview.selection;
    const current = overview.versions.find(v => v.page_id === sel.page_id && v.version === sel.version);
    for (const a of current?.approval?.approved_actions ?? []) priorApprovedKeys.add(homeActionIdKey(a));
  }

  const noNewPerms =
    operation === "restore" &&
    inspect.actions.every(action => priorApprovedKeys.has(homeActionIdKey(action)));

  const actionRows = inspect.actions.length
    ? inspect.actions
        .map((action, index) => {
          const carried = priorApprovedKeys.has(homeActionIdKey(action));
          const consequence =
            action.effect === "irreversible"
              ? uiText.text("workbench.home-pages.effect-irreversible")
              : action.effect === "write"
                ? uiText.text("workbench.home-pages.effect-write")
                : uiText.text("workbench.home-pages.effect-read");
          const extra = [
            consequence,
            action.external ? uiText.text("workbench.home-pages.effect-external") : "",
            action.metered ? uiText.text("workbench.home-pages.effect-metered") : "",
            action.provider_title,
          ]
            .filter(Boolean)
            .join(" · ");
          const badge = !action.available
            ? renderBadge({ label: uiText.text("workbench.home-pages.action-unavailable"), tone: "warning" })
            : carried
              ? renderBadge({ label: uiText.text("workbench.home-pages.carried-permission"), tone: "neutral" })
              : renderBadge({ label: uiText.text("workbench.home-pages.new-permission"), tone: "warning" });
          return `<li class="hp-grant-row"><label class="mw-check-row"><input type="checkbox" class="mw-check" data-hp-grant="${index}"${action.available ? " checked" : " disabled"}><span><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(extra)}${action.unavailable_reason ? ` · ${escapeHtml(action.unavailable_reason)}` : ""}</small></span></label>${badge}</li>`;
        })
        .join("")
    : `<li class="hp-grant-empty">${escapeHtml(uiText.text("workbench.home-pages.no-actions-needed"))}</li>`;

  const title =
    operation === "restore"
      ? uiText.text("workbench.home-pages.restore-dialog-title", { v: target.version })
      : uiText.text("workbench.home-pages.adopt-dialog-title", { v: target.version });
  const subtitle = noNewPerms
    ? uiText.text("workbench.home-pages.restore-no-new-perms")
    : uiText.text("workbench.home-pages.adopt-dialog-subtitle");

  return `<form method="dialog" class="mw-form" data-hp-adopt-form>
    <header class="mw-form__header"><div><h2 id="hp-adopt-title">${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></header>
    <div class="mw-form__body">
      <ul class="hp-grant-list">${actionRows}</ul>
      <p class="hp-quiet-note">${icon("shield")}<span>${escapeHtml(uiText.text("workbench.home-pages.scope-promise"))}</span></p>
    </div>
    <footer class="mw-form__footer">
      ${renderButton({ label: uiText.text("common.control.cancel"), variant: "ghost", attrs: { "data-hp-act": "dialog-cancel" } })}
      ${renderButton({ label: uiText.text(operation === "restore" ? "workbench.home-pages.confirm-restore" : "workbench.home-pages.confirm-adopt"), variant: "primary", key: "↵", attrs: { "data-hp-act": "dialog-confirm" } })}
    </footer>
  </form>`;
}
