import type {
  AgentMaterialChecklistItem,
  AgentMaterialDeliveryMode,
  AgentStepProgressSummary,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import {
  renderCodingRoundMaterials,
  renderEnvChecklist,
  type MwCodingRoundMaterialItem,
  type MwEnvCheckRowOptions,
  t as uiText,
} from "@molis-ai/molis-work-plugin-sdk/ui";
import { insertedAcceptance } from "./inserted-step.js";

export type CodingBoardProgressSummary = AgentStepProgressSummary;

export interface CodingStepNode {
  readonly id: string;
  readonly title?: string;
  readonly state: string;
  readonly inserted?: boolean;
  readonly parent_id?: string;
  readonly story_points?: number | null;
  readonly estimate_source?: "agent" | "human";
  readonly estimate_reason?: string;
  readonly progress?: number;
  readonly progress_basis?: string;
  readonly skipped?: boolean;
  readonly scope_removed?: boolean;
  readonly unknown_outcome?: boolean;
  readonly reports: readonly { readonly note: string }[];
}

export interface CodingPlanLookup {
  readonly content: {
    readonly title?: string;
    readonly steps: readonly {
      readonly title: string;
      readonly acceptance: string;
      readonly parent?: number;
      readonly story_points?: number;
      readonly estimate_source?: "agent" | "human";
      readonly estimate_reason?: string;
    }[];
  };
}

export interface CodingEnvironmentReadinessInput {
  readonly workspace_id: string;
  readonly canonical_path?: string;
  readonly status: "ready" | "attention";
  readonly branch: string | null;
  readonly head_commit: string | null;
  readonly dirty_count: number;
  readonly git_conflicted_count: number;
  readonly git_merging: boolean;
  readonly is_git_repo: boolean;
  readonly deps_manager: string | null;
  readonly deps_installed: boolean;
  readonly script_names: readonly string[];
  readonly ports: readonly number[];
  readonly package_json_invalid?: boolean;
  readonly env_template: string | null;
  readonly env_keys: readonly string[];
  readonly has_local_env: boolean;
  readonly worktrees: { readonly active: number; readonly problem_count: number; readonly cleanup_count: number };
  readonly checked_at: string;
}

export interface CodingRoundMaterialsRunInput {
  readonly frozen?: {
    readonly text_materials?: readonly {
      readonly material_id: string;
      readonly title?: string;
      readonly subject?: { readonly kind: string; readonly id: string };
      readonly material_ref?: { readonly subject?: { readonly kind: string; readonly id: string } };
      readonly source_artifact_id?: string;
      readonly source_version?: number;
      readonly read_revision?: string;
      readonly delivery?: AgentMaterialDeliveryMode;
      readonly total_chars?: number;
      readonly delivered_chars?: number;
      readonly overflow_materials?: readonly AgentMaterialChecklistItem[];
    }[];
  };
  readonly activity?: readonly {
    readonly name: string;
    readonly state: string;
    readonly target?: string;
    readonly output?: string;
  }[];
}

/** Parses an inline manual step-progress percentage (`0..99`, optional trailing `%`) into a `0..0.99` fraction, or `null` when invalid. */
export function parseStepProgressPercent(rawText: string): number | null {
  const cleaned = rawText.trim().replace(/%$/u, "").trim();
  if (!cleaned) return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct < 0 || pct > 99) return null;
  return Math.round(pct * 100) / 10_000;
}

export function skippedStep(node: { readonly skipped?: boolean }): boolean {
  return Boolean(node.skipped);
}

export function scopeRemovedStep(node: { readonly scope_removed?: boolean }): boolean {
  return Boolean(node.scope_removed);
}

export function settledStep(node: { readonly state: string; readonly unknown_outcome?: boolean; readonly skipped?: boolean; readonly scope_removed?: boolean }): boolean {
  return (node.state === "succeeded" && !node.unknown_outcome) || skippedStep(node) || scopeRemovedStep(node);
}

/** Active leaf steps only: excludes parent containers (`parent_id` targets), `skipped`, and `scope_removed` steps. */
export function activeLeafSteps<T extends { readonly id: string; readonly parent_id?: string; readonly skipped?: boolean; readonly scope_removed?: boolean }>(nodes: readonly T[]): T[] {
  const parentIds = new Set(nodes.flatMap(node => node.parent_id ? [node.parent_id] : []));
  return nodes.filter(node => !parentIds.has(node.id) && !node.skipped && !node.scope_removed);
}

export function planStepOf(plan: CodingPlanLookup | undefined, node: CodingStepNode): {
  readonly title: string;
  readonly acceptance: string;
  readonly story_points?: number;
  readonly estimate_source?: "agent" | "human";
  readonly estimate_reason?: string;
} {
  if (node.inserted) {
    return {
      title: node.title || node.id,
      acceptance: insertedAcceptance(node.reports) || "",
      ...(typeof node.story_points === "number" ? { story_points: node.story_points } : {}),
      ...(node.estimate_source ? { estimate_source: node.estimate_source } : {}),
      ...(node.estimate_reason ? { estimate_reason: node.estimate_reason } : {}),
    };
  }
  return plan?.content.steps[Number(node.id.replace("step-", "")) - 1] || { title: node.title || node.id, acceptance: "" };
}

/** Story-point badge text & tooltip for one step (supports parent rollup over active leaves). */
export function stepPointsBadge(
  nodes: readonly CodingStepNode[],
  node: CodingStepNode,
  plan?: CodingPlanLookup,
): { readonly text: string; readonly title: string; readonly pending: boolean } {
  const children = nodes.filter(other => other.parent_id === node.id);
  const effectivePoints = (entry: CodingStepNode): number | undefined =>
    entry.story_points === null ? undefined : (entry.story_points ?? planStepOf(plan, entry).story_points);
  if (children.length > 0) {
    const activeChildren = children.filter(other => !skippedStep(other) && !scopeRemovedStep(other));
    const estimated = activeChildren.filter(other => effectivePoints(other) !== undefined);
    const sum = estimated.reduce((acc, other) => acc + (effectivePoints(other) ?? 0), 0);
    if (sum > 0) {
      return {
        text: uiText.text("coding.board.points", { points: sum }),
        title: uiText.text("coding.board.points-rollup", { points: sum, count: activeChildren.length }),
        pending: false,
      };
    }
    return { text: uiText.text("coding.board.points-pending"), title: uiText.text("coding.board.points-pending-hint"), pending: true };
  }
  const planStep = planStepOf(plan, node);
  const pts = effectivePoints(node);
  if (pts === undefined) {
    return { text: uiText.text("coding.board.points-pending"), title: uiText.text("coding.board.points-pending-hint"), pending: true };
  }
  const src = (node.estimate_source ?? planStep.estimate_source) === "human"
    ? uiText.text("coding.board.points-by-user")
    : uiText.text("coding.board.points-by-agent");
  const reason = node.estimate_reason ?? planStep.estimate_reason;
  const parts = [src];
  if (reason) parts.push(reason);
  if (pts >= 13) parts.push(uiText.text("coding.board.split-hint"));
  if (node.progress !== undefined && node.progress > 0 && node.state !== "succeeded") {
    const pct = Math.round(node.progress * 100);
    parts.push(uiText.text("coding.board.progress-basis", { percent: pct, basis: node.progress_basis || "" }));
  }
  return { text: uiText.text("coding.board.points", { points: pts }), title: parts.join(" · "), pending: false };
}

/** Formats the weighted story-point progress summary of a board. */
export function formatBoardProgressSummary(
  summary: CodingBoardProgressSummary | undefined,
  nodes?: readonly CodingStepNode[],
): string {
  if (!summary) return "";
  const removed = summary.removed_scope_points > 0 ? uiText.text("coding.board.summary.removed", { points: summary.removed_scope_points }) : "";
  const unestimatedMore = summary.unestimated_leaves > 0 ? uiText.text("coding.board.summary.unestimated-more", { count: summary.unestimated_leaves }) : "";
  const activeLeaves = summary.estimated_leaves + summary.unestimated_leaves;
  if (activeLeaves === 0) {
    return [uiText.text("coding.board.summary.empty"), removed].filter(Boolean).join(" · ");
  }
  if (summary.total_points === 0 || summary.weighted_percent === null) {
    return [uiText.text("coding.board.summary.unestimated"), unestimatedMore, removed].filter(Boolean).join(" · ");
  }
  const completed = Math.round(summary.completed_points * 10) / 10;
  const hasDiscounted = nodes
    ? activeLeafSteps(nodes).some(node => node.progress !== undefined && node.progress > 0 && node.progress < 1 && node.state !== "succeeded")
    : !Number.isInteger(summary.completed_points);
  return [
    uiText.text("coding.board.summary.weighted", { percent: summary.weighted_percent, completed, total: summary.total_points }),
    hasDiscounted ? uiText.text("coding.board.summary.discounted") : "",
    unestimatedMore,
    removed,
  ].filter(Boolean).join(" · ");
}

function gitReadinessRow(readiness: CodingEnvironmentReadinessInput): MwEnvCheckRowOptions {
  const label = uiText.text("coding.env.row.git");
  const branch = readiness.branch || uiText.text("coding.env.git.detached");
  if (!readiness.is_git_repo) {
    return { state: "idle", label, value: uiText.text("coding.env.git.not-repo-detail") };
  }
  if (readiness.git_conflicted_count > 0 || readiness.git_merging) {
    return {
      state: "failed",
      label,
      value: uiText.text("coding.env.git.conflict", { branch, count: readiness.git_conflicted_count }),
      badge: { label: uiText.text("coding.env.badge.missing"), tone: "danger" },
      recovery: {
        tone: "danger",
        title: uiText.text("coding.env.recovery.conflict-title"),
        body: uiText.text("coding.env.recovery.conflict-body"),
        actions: [
          { label: uiText.text("coding.env.action.open-files"), variant: "secondary", attrs: { "data-coding-env-action": "open-files" } },
          { label: uiText.text("coding.env.action.switch-workspace"), variant: "ghost", attrs: { "data-coding-env-action": "open-workspace" } },
        ],
      },
    };
  }
  if (readiness.dirty_count > 0) {
    return {
      state: "partial",
      label,
      value: uiText.text("coding.env.git.dirty", { branch, count: readiness.dirty_count }),
      badge: { label: uiText.text("coding.env.badge.pre-existing"), tone: "neutral" },
    };
  }
  return {
    state: "done",
    label,
    value: uiText.text("coding.env.git.clean", { branch }),
    status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
  };
}

function depsReadinessRow(readiness: CodingEnvironmentReadinessInput): MwEnvCheckRowOptions {
  const label = uiText.text("coding.env.row.deps");
  const readyStatus = { label: uiText.text("coding.env.badge.ready"), tone: "done" as const };
  if (!readiness.deps_manager) {
    return { state: "idle", label, value: uiText.text("coding.env.deps-none") };
  }
  if (readiness.deps_manager === "cargo") {
    return { state: "done", label, value: uiText.text("coding.env.deps.cargo-ok"), status: readyStatus };
  }
  if (readiness.deps_manager === "python") {
    return {
      state: readiness.deps_installed ? "done" : "idle",
      label,
      value: readiness.deps_installed ? uiText.text("coding.env.deps.python-ok") : uiText.text("coding.env.deps.python-info"),
      ...(readiness.deps_installed
        ? { status: readyStatus }
        : { badge: { label: uiText.text("coding.env.badge.missing"), tone: "neutral" } }),
    };
  }
  if (readiness.deps_installed) {
    return { state: "done", label, value: uiText.text("coding.env.deps.node-ok", { manifest: readiness.deps_manager }), status: readyStatus };
  }
  return {
    state: "verify",
    label,
    value: uiText.text("coding.env.deps.node-missing", { manifest: readiness.deps_manager }),
    badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
    recovery: {
      tone: "warning",
      title: uiText.text("coding.env.recovery.deps-title"),
      body: uiText.text("coding.env.recovery.deps-body"),
      actions: [
        { label: uiText.text("coding.env.action.prepare-deps"), variant: "secondary", attrs: { "data-coding-env-action": "install-deps", "data-manifest": readiness.deps_manager } },
      ],
    },
  };
}

function scriptsAndBaselineRows(readiness: CodingEnvironmentReadinessInput): {
  readonly rows: MwEnvCheckRowOptions[];
  readonly baselineCmd: string;
  readonly canRunBaseline: boolean;
} {
  const rows: MwEnvCheckRowOptions[] = [];
  if (readiness.package_json_invalid) {
    rows.push({
      state: "verify",
      label: uiText.text("coding.env.row.scripts"),
      value: uiText.text("coding.env.scripts.invalid-pkg"),
      badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
    });
  } else if (readiness.script_names.length) {
    const scriptList = uiText.text("coding.env.scripts.summary", { scriptList: readiness.script_names.join(", ") });
    const scriptsValue = readiness.ports.length
      ? uiText.text("coding.env.scripts.summary-ports", { scriptList, ports: uiText.text("coding.env.scripts.ports", { ports: readiness.ports.join(", ") }) })
      : scriptList;
    rows.push({
      state: "done",
      label: uiText.text("coding.env.row.scripts"),
      value: scriptsValue,
      status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
    });
  }
  const hasBaselineTest = readiness.script_names.includes("test") || readiness.deps_manager === "cargo";
  const baselineCmd = readiness.deps_manager === "cargo"
    ? "cargo test"
    : readiness.deps_manager === "pnpm"
      ? "pnpm test"
      : readiness.deps_manager === "yarn"
        ? "yarn test"
        : readiness.deps_manager === "bun"
          ? "bun test"
          : "npm test";
  const blockedByDeps = Boolean(readiness.deps_manager && !readiness.deps_installed && readiness.deps_manager !== "cargo");
  if (hasBaselineTest) {
    rows.push(blockedByDeps
      ? { state: "idle", label: uiText.text("coding.env.row.baseline"), value: uiText.text("coding.env.baseline.after-deps", { command: baselineCmd }) }
      : {
          state: "ready",
          label: uiText.text("coding.env.row.baseline"),
          value: uiText.text("coding.env.baseline.ready", { command: baselineCmd }),
          status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
        });
  }
  return { rows, baselineCmd, canRunBaseline: hasBaselineTest && !blockedByDeps };
}

function envTemplateAndWorktreeRows(readiness: CodingEnvironmentReadinessInput): MwEnvCheckRowOptions[] {
  const rows: MwEnvCheckRowOptions[] = [];
  if (readiness.env_template) {
    const shownKeys = readiness.env_keys.length > 5
      ? uiText.text("coding.env.vars.more", { keys: readiness.env_keys.slice(0, 5).join(", "), count: readiness.env_keys.length })
      : readiness.env_keys.join(", ");
    rows.push(!readiness.has_local_env && readiness.env_keys.length > 0
      ? {
          state: "verify",
          label: uiText.text("coding.env.row.env"),
          value: uiText.text("coding.env.vars.missing", { file: readiness.env_template, keys: shownKeys }),
          badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
          recovery: {
            tone: "warning",
            title: uiText.text("coding.env.recovery.env-title"),
            body: uiText.text("coding.env.recovery.env-body", { file: readiness.env_template, keys: shownKeys }),
            actions: [{ label: uiText.text("coding.env.action.open-files"), variant: "secondary", attrs: { "data-coding-env-action": "open-files" } }],
          },
        }
      : {
          state: "done",
          label: uiText.text("coding.env.row.env"),
          value: readiness.has_local_env
            ? uiText.text("coding.env.vars.present", { file: readiness.env_template })
            : uiText.text("coding.env.vars.checked", { file: readiness.env_template }),
          status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
        });
  }
  if (readiness.worktrees.active > 0) {
    rows.push(readiness.worktrees.problem_count > 0
      ? {
          state: "verify",
          label: uiText.text("coding.env.row.worktrees"),
          value: uiText.text("coding.env.worktrees.problem", { total: readiness.worktrees.active, problems: readiness.worktrees.problem_count }),
          badge: { label: uiText.text("coding.env.badge.missing"), tone: "warning" },
          recovery: {
            tone: "warning",
            title: uiText.text("coding.env.recovery.worktree-title"),
            body: uiText.text("coding.env.recovery.worktree-body"),
            actions: [{ label: uiText.text("coding.env.action.open-files"), variant: "secondary", attrs: { "data-coding-env-action": "open-files" } }],
          },
        }
      : readiness.worktrees.cleanup_count > 0
        ? {
            state: "ready",
            label: uiText.text("coding.env.row.worktrees"),
            value: uiText.text("coding.env.worktrees.cleanup", { total: readiness.worktrees.active }),
          }
        : {
            state: "done",
            label: uiText.text("coding.env.row.worktrees"),
            value: uiText.text("coding.env.worktrees.ready", { total: readiness.worktrees.active }),
            status: { label: uiText.text("coding.env.badge.ready"), tone: "done" },
          });
  }
  return rows;
}

export function buildEnvironmentChecklistHtml(readiness: CodingEnvironmentReadinessInput | null | undefined): string {
  if (!readiness || !readiness.workspace_id) return "";
  const { rows: scriptRows, baselineCmd, canRunBaseline } = scriptsAndBaselineRows(readiness);
  const rows: MwEnvCheckRowOptions[] = [
    gitReadinessRow(readiness),
    depsReadinessRow(readiness),
    ...scriptRows,
    ...envTemplateAndWorktreeRows(readiness),
  ];
  const attentionCount = rows.filter(row => row.state === "failed" || row.state === "verify").length;
  return renderEnvChecklist({
    title: uiText.text("coding.env.title"),
    statusLabel: attentionCount > 0 ? uiText.text("coding.env.status.attention", { count: attentionCount }) : uiText.text("coding.env.status.ready"),
    statusTone: rows.some(row => row.state === "failed") ? "blocked" : attentionCount > 0 ? "attention" : "done",
    rows,
    footer: {
      title: uiText.text("coding.env.footer.title"),
      detail: uiText.text("coding.env.footer.detail"),
      ...(canRunBaseline ? { action: { label: uiText.text("coding.env.action.run-baseline"), variant: "ghost", attrs: { "data-coding-env-action": "run-baseline", "data-command": baselineCmd } } } : {}),
    },
  });
}

function wasMaterialContinuedRead(
  activity: CodingRoundMaterialsRunInput["activity"],
  item: {
    readonly material_id?: string;
    readonly title?: string;
    readonly source_artifact_id?: string;
    readonly subject?: { readonly id: string };
    readonly material_ref?: { readonly subject?: { readonly id: string } };
  },
): boolean {
  const tokenSet = new Set<string>();
  const addToken = (candidate: string | undefined, minLength: number) => {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed.length >= minLength) tokenSet.add(trimmed);
  };
  addToken(item.source_artifact_id, 3);
  addToken(item.material_id, 3);
  if (item.material_id) {
    const beforeRev = item.material_id.split("@")[0];
    addToken(beforeRev, 4);
    const colon = beforeRev?.indexOf(":") ?? -1;
    if (beforeRev && colon > 0) addToken(beforeRev.slice(colon + 1), 4);
  }
  addToken(item.subject?.id ?? item.material_ref?.subject?.id, 4);
  addToken(item.title, 6);
  const tokens = [...tokenSet];
  if (!tokens.length) return false;
  return (activity || []).some(act => {
    if (act.state !== "completed") return false;
    const isMaterialReadTool = act.name.startsWith("molis-action-")
      || act.name === "read-capability"
      || act.name.includes("knowledge.read")
      || act.name.includes("materials.read");
    if (!isMaterialReadTool) return false;
    const hay = `${act.target || ""}\n${act.output || ""}`;
    return tokens.some(tok => hay.includes(tok));
  });
}

export function buildRoundMaterialsHtml(run: CodingRoundMaterialsRunInput): string {
  const raw = run.frozen?.text_materials || [];
  const inline = raw.filter(item => !item.material_id.startsWith("coding-materials-overflow"));
  const overflow = raw.find(item => item.material_id.startsWith("coding-materials-overflow"))?.overflow_materials || [];
  if (!inline.length && !overflow.length) return "";
  const pinned = uiText.text("coding.material.pinned-note");
  const items: MwCodingRoundMaterialItem[] = [];
  for (const item of inline) {
    const ver = item.read_revision ? " · #" + item.read_revision : item.source_version !== undefined ? " · v" + item.source_version : "";
    const name = (item.title || item.material_id) + ver;
    const clipped = item.delivery === "clipped";
    if ((clipped || item.delivery === "on-demand") && wasMaterialContinuedRead(run.activity, item)) {
      items.push({
        state: "done",
        name,
        how: uiText.text("coding.material.delivery.continued-how"),
        statusLabel: uiText.text("coding.material.delivery.continued"),
        statusTone: "progress",
      });
    } else if (clipped) {
      items.push({
        state: "partial",
        name,
        how: uiText.text("coding.material.delivery.truncated") + " · " + pinned,
        statusLabel: uiText.text("coding.material.status.truncated"),
        statusTone: "attention",
      });
    } else if (item.delivery === "on-demand") {
      items.push({
        state: "material",
        name,
        how: uiText.text("coding.material.delivery.on-demand") + " · " + pinned,
        statusLabel: uiText.text("coding.material.status.on-demand"),
        statusTone: "quiet",
      });
    } else {
      items.push({
        state: "done",
        name,
        how: uiText.text("coding.material.delivery.inline") + " · " + pinned,
        statusLabel: uiText.text("coding.material.status.inline"),
        statusTone: "done",
      });
    }
  }
  for (const item of overflow) {
    const ver = item.read_revision ? " · #" + item.read_revision : item.source_version !== undefined ? " · v" + item.source_version : "";
    const name = (item.title || item.material_id || "") + ver;
    items.push(wasMaterialContinuedRead(run.activity, item)
      ? {
          state: "done",
          name,
          how: uiText.text("coding.material.delivery.continued-how"),
          statusLabel: uiText.text("coding.material.delivery.continued"),
          statusTone: "progress",
        }
      : {
          state: "material",
          name,
          how: uiText.text("coding.material.delivery.on-demand") + " · " + pinned,
          statusLabel: uiText.text("coding.material.status.on-demand"),
          statusTone: "quiet",
        });
  }
  const hasDeferred = overflow.length > 0 || inline.some(item => item.delivery === "clipped" || item.delivery === "on-demand");
  return renderCodingRoundMaterials({
    title: uiText.text("coding.material.round-title"),
    summaryLabel: overflow.length
      ? uiText.text("coding.material.round-overflow-summary", { inline: inline.length, rest: overflow.length })
      : uiText.text("coding.material.round-summary", { count: inline.length + overflow.length }),
    summaryTone: hasDeferred ? "progress" : "done",
    items,
    footer: { title: uiText.text("coding.material.footer.title"), detail: uiText.text("coding.material.footer.detail") },
  });
}
