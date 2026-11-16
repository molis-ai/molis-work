import { createHash } from "node:crypto";
import path from "node:path";
import type { ProjectSelection } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeContextBindingRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ExternalToolEntry, ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  EXTERNAL_SESSION_DEFAULT_LOCATION,
  type ExternalSessionAttribution,
  type ExternalSessionDirectoryScope,
  type ExternalSessionFiledAttribution,
  type ExternalSessionIdentity,
  type ExternalSessionRow,
  type ExternalSessionRowSummary,
  type ExternalSessionSuggestion,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { canonicalJsonText, redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import type { SessionDirectoryIdentity } from "./git-files.js";
import type { SessionProjectSnapshot } from "./ports.js";

export function canonicalEntryId(tool: ExternalToolEntry): ExternalToolId {
  return (tool.shares_sessions_with ?? tool.id) as ExternalToolId;
}

export function localLocationKey(expandedRoot: string | null): string {
  if (expandedRoot === null) return EXTERNAL_SESSION_DEFAULT_LOCATION;
  return `local:${createHash("sha256").update(expandedRoot).digest("hex").slice(0, 24)}`;
}

export function sessionKeyForIdentity(identity: ExternalSessionIdentity): string {
  const canonical: ExternalSessionIdentity = {
    entry_id: identity.entry_id,
    location_key: identity.location_key,
    native_id: identity.native_id,
  };
  return `xs_${createHash("sha256").update(canonicalJsonText(canonical, "null")).digest("hex").slice(0, 32)}`;
}

export function directoryKeyForPath(directoryPath: string): string {
  return `dir_${createHash("sha256").update(directoryPath).digest("hex").slice(0, 24)}`;
}

export function computeDirectorySnapshotDigest(snapshot: SessionProjectSnapshot, homeDirectory?: string): string {
  const normHome = homeDirectory ? path.resolve(homeDirectory) : null;
  const normalizeWorkspacePath = (p: string): string =>
    normHome && (p === normHome || p.startsWith(`${normHome}${path.sep}`))
      ? `$MOLIS_HOME/${path.relative(normHome, p).split(path.sep).join("/")}`
      : p;
  const projects = [...snapshot.projects]
    .map(item => ({ project_id: item.project_id, display_name: item.display_name }))
    .sort((a, b) => (a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0));
  const directories = [...snapshot.directories]
    .map(item => ({
      workspace_id: item.workspace_id,
      canonical_path: normalizeWorkspacePath(item.canonical_path),
      realpath_verified: item.realpath_verified,
      project_ids: [...item.project_ids].sort(),
      person_project_ids: [...item.person_project_ids].sort(),
    }))
    .sort((a, b) => (a.workspace_id < b.workspace_id ? -1 : a.workspace_id > b.workspace_id ? 1 : 0));
  return createHash("sha256").update(canonicalJsonText({ projects, directories }, "null")).digest("hex").slice(0, 32);
}

export function computeBindingSnapshotDigest(snapshot: SessionProjectSnapshot): string {
  const bindings = [...snapshot.bindings]
    .map(item => ({
      binding_id: item.binding_id,
      runtime_id: item.runtime_id,
      stable_work_context_id: item.stable_work_context_id,
      project_id: item.project_id,
      updated_at: item.updated_at,
    }))
    .sort((a, b) => (a.binding_id < b.binding_id ? -1 : a.binding_id > b.binding_id ? 1 : 0));
  const projects = [...snapshot.projects].map(item => item.project_id).sort();
  return createHash("sha256").update(canonicalJsonText({ projects, bindings }, "null")).digest("hex").slice(0, 32);
}

export function isSameOrSubpath(childRealPath: string, parentRealPath: string): boolean {
  const rel = path.relative(parentRealPath, childRealPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function isSameOrSubpathRelative(childWorktreeRel: string, parentWorktreeRel: string): boolean {
  if (parentWorktreeRel === "") return true;
  return childWorktreeRel === parentWorktreeRel || childWorktreeRel.startsWith(`${parentWorktreeRel}/`);
}

export interface PreparedLinkedWorkspace {
  workspace_id: string;
  canonical_path: string;
  real_path: string;
  repository_key: string | null;
  worktree_relative: string | null;
  person_project_ids: string[];
  tool_only_project_ids: string[];
}

export type DerivedDirectoryStateKind = "automatic" | "ambiguous" | "tool_linked" | "relation_gone" | "no_relation";

export interface DerivedDirectoryEvaluation {
  derived_state: DerivedDirectoryStateKind;
  derived_project_id: string | null;
  evidence_kind: "directory" | "repository" | null;
  evidence_path: string | null;
  candidates: string[];
}

export function prepareLinkedWorkspaces(
  snapshot: SessionProjectSnapshot,
  identify: (dirPath: string) => SessionDirectoryIdentity | null,
): { projectMap: Map<string, ProjectSelection>; workspaces: PreparedLinkedWorkspace[] } {
  const projectMap = new Map<string, ProjectSelection>();
  for (const project of snapshot.projects) {
    projectMap.set(project.project_id, { project_id: project.project_id, display_name: project.display_name });
  }
  const workspaces: PreparedLinkedWorkspace[] = [];
  for (const record of snapshot.directories) {
    if (!record.realpath_verified) continue;
    const personIds = record.person_project_ids.filter(id => projectMap.has(id));
    const personSet = new Set(personIds);
    const toolOnlyIds = record.project_ids.filter(id => projectMap.has(id) && !personSet.has(id));
    if (personIds.length === 0 && toolOnlyIds.length === 0) continue;
    const identity = identify(record.canonical_path);
    if (!identity) continue;
    workspaces.push({
      workspace_id: record.workspace_id,
      canonical_path: record.canonical_path,
      real_path: identity.real_path,
      repository_key: identity.repository_key,
      worktree_relative: identity.worktree_relative,
      person_project_ids: personIds,
      tool_only_project_ids: toolOnlyIds,
    });
  }
  return { projectMap, workspaces };
}

function matchWorkspaceRelation(
  sessionIdentity: SessionDirectoryIdentity,
  workspace: PreparedLinkedWorkspace,
): "directory" | "repository" | null {
  if (isSameOrSubpath(sessionIdentity.real_path, workspace.real_path)) {
    return "directory";
  }
  if (
    sessionIdentity.repository_key !== null
    && sessionIdentity.repository_key === workspace.repository_key
    && sessionIdentity.worktree_relative !== null
    && workspace.worktree_relative !== null
    && isSameOrSubpathRelative(sessionIdentity.worktree_relative, workspace.worktree_relative)
  ) {
    return "repository";
  }
  return null;
}

/**
 * Whether a session's directory falls inside the `linked_projects` read scope (contract-design §7.1):
 * strictly follows verified directory relations created by the person (including subdirectories and valid git worktrees).
 */
export function isDirectoryInLinkedProjectsScope(
  sessionIdentity: SessionDirectoryIdentity | null,
  workspaces: readonly PreparedLinkedWorkspace[],
): boolean {
  if (!sessionIdentity) return false;
  for (const workspace of workspaces) {
    if (workspace.person_project_ids.length === 0) continue;
    if (matchWorkspaceRelation(sessionIdentity, workspace) !== null) return true;
  }
  return false;
}

export function isSessionDirectoryAllowedByScope(
  scope: ExternalSessionDirectoryScope,
  sessionIdentity: SessionDirectoryIdentity | null,
  workspaces: readonly PreparedLinkedWorkspace[],
): boolean {
  if (scope.mode === "all") return true;
  return isDirectoryInLinkedProjectsScope(sessionIdentity, workspaces);
}

const PREVIOUSLY_MATCHED = new Set<string>(["automatic", "ambiguous", "tool_linked", "relation_gone"]);

export function evaluateDerivedDirectory(
  sessionIdentity: SessionDirectoryIdentity | null,
  workspaces: readonly PreparedLinkedWorkspace[],
  previousState?: string | null,
): DerivedDirectoryEvaluation {
  if (!sessionIdentity) {
    return {
      derived_state: previousState && PREVIOUSLY_MATCHED.has(previousState) ? "relation_gone" : "no_relation",
      derived_project_id: null,
      evidence_kind: null,
      evidence_path: null,
      candidates: [],
    };
  }

  const matchedPerson = new Map<string, { kind: "directory" | "repository"; path: string }>();
  for (const workspace of workspaces) {
    if (workspace.person_project_ids.length === 0) continue;
    const matchKind = matchWorkspaceRelation(sessionIdentity, workspace);
    if (!matchKind) continue;
    for (const projectId of workspace.person_project_ids) {
      const existing = matchedPerson.get(projectId);
      if (!existing || (existing.kind === "repository" && matchKind === "directory")) {
        matchedPerson.set(projectId, { kind: matchKind, path: workspace.canonical_path });
      }
    }
  }

  if (matchedPerson.size > 0) {
    const candidateIds = new Set<string>(matchedPerson.keys());
    if (sessionIdentity.repository_key !== null) {
      for (const workspace of workspaces) {
        if (workspace.repository_key === sessionIdentity.repository_key) {
          for (const projectId of workspace.person_project_ids) candidateIds.add(projectId);
        }
      }
    }
    if (candidateIds.size === 1) {
      const [projectId, evidence] = [...matchedPerson.entries()][0]!;
      return {
        derived_state: "automatic",
        derived_project_id: projectId,
        evidence_kind: evidence.kind,
        evidence_path: evidence.path,
        candidates: [projectId],
      };
    }
    return {
      derived_state: "ambiguous",
      derived_project_id: null,
      evidence_kind: null,
      evidence_path: null,
      candidates: [...candidateIds],
    };
  }

  const toolProjectIds = new Set<string>();
  for (const workspace of workspaces) {
    if (workspace.tool_only_project_ids.length === 0) continue;
    if (matchWorkspaceRelation(sessionIdentity, workspace) !== null) {
      for (const projectId of workspace.tool_only_project_ids) toolProjectIds.add(projectId);
    }
  }
  if (toolProjectIds.size > 0) {
    return {
      derived_state: "tool_linked",
      derived_project_id: null,
      evidence_kind: null,
      evidence_path: null,
      candidates: [...toolProjectIds],
    };
  }

  return {
    derived_state: previousState && PREVIOUSLY_MATCHED.has(previousState) ? "relation_gone" : "no_relation",
    derived_project_id: null,
    evidence_kind: null,
    evidence_path: null,
    candidates: [],
  };
}

export interface StoredAttributionDecision {
  decision: "project" | "leave_unfiled" | "clear";
  project_id: string | null;
  basis: "user_chose" | "suggestion_accepted" | null;
  revision: number;
  decided_at: string;
}

export function matchRuntimeBindingForSession(
  session: { entry_id: ExternalToolId; location_key: string; native_id: string; seen_via: readonly ExternalToolId[] },
  bindings: readonly RuntimeContextBindingRecord[],
  projectMap: ReadonlyMap<string, ProjectSelection>,
  duplicateLocalKeys: ReadonlySet<string>,
): RuntimeContextBindingRecord | null {
  if (!session.location_key.startsWith("local:")) return null;
  if (duplicateLocalKeys.has(`${session.entry_id}\0${session.native_id}`)) return null;
  let latest: RuntimeContextBindingRecord | null = null;
  for (const binding of bindings) {
    if (binding.stable_work_context_id !== session.native_id) continue;
    if (binding.runtime_id !== session.entry_id && !session.seen_via.includes(binding.runtime_id as ExternalToolId)) continue;
    if (!projectMap.has(binding.project_id)) continue;
    if (!latest || binding.updated_at > latest.updated_at) latest = binding;
  }
  return latest;
}

export interface ResolvedAttribution {
  attribution: ExternalSessionAttribution;
  /** Project ID when filed as `confirmed` or `automatic` (eligible for project AI read when permitted). */
  effective_project_id: string | null;
  /** Project ID when and only when at level 6 (`reported`). */
  reported_project_id: string | null;
}

export function resolveSessionAttribution(input: {
  decision: StoredAttributionDecision | null;
  derived: DerivedDirectoryEvaluation;
  binding: RuntimeContextBindingRecord | null;
  suggestion: ExternalSessionSuggestion | null;
  projectMap: ReadonlyMap<string, ProjectSelection>;
}): ResolvedAttribution {
  const { decision, derived, binding, suggestion, projectMap } = input;
  const derivedCandidates = derived.candidates
    .map(id => projectMap.get(id))
    .filter((item): item is ProjectSelection => item !== undefined);

  if (decision && decision.decision !== "clear") {
    if (decision.decision === "leave_unfiled") {
      return {
        attribution: { state: "unfiled", reason: "left_unfiled", candidates: [], suggestion: null },
        effective_project_id: null,
        reported_project_id: null,
      };
    }
    if (decision.decision === "project") {
      const chosen = decision.project_id ? projectMap.get(decision.project_id) : undefined;
      if (chosen) {
        const later = suggestion && suggestion.created_at > decision.decided_at ? suggestion : undefined;
        return {
          attribution: {
            state: "confirmed",
            project: chosen,
            basis: decision.basis ?? "user_chose",
            decided_at: decision.decided_at,
            ...(later ? { later_suggestion: later } : {}),
          },
          effective_project_id: chosen.project_id,
          reported_project_id: null,
        };
      }
      return {
        attribution: {
          state: "unfiled",
          reason: "project_gone",
          candidates: derivedCandidates,
          suggestion,
        },
        effective_project_id: null,
        reported_project_id: null,
      };
    }
  }

  if (derived.derived_state === "automatic" && derived.derived_project_id) {
    const automaticProject = projectMap.get(derived.derived_project_id);
    if (automaticProject) {
      const otherProject = binding && binding.project_id !== automaticProject.project_id
        ? projectMap.get(binding.project_id)
        : undefined;
      return {
        attribution: {
          state: "automatic",
          project: automaticProject,
          evidence: {
            kind: derived.evidence_kind ?? "directory",
            path: derived.evidence_path ?? "",
          },
          ...(otherProject && binding
            ? { tool_reported_other: { project: otherProject, runtime_id: binding.runtime_id } }
            : {}),
        },
        effective_project_id: automaticProject.project_id,
        reported_project_id: null,
      };
    }
  }

  if (derived.derived_state === "ambiguous") {
    return {
      attribution: {
        state: "unfiled",
        reason: "ambiguous",
        candidates: derivedCandidates,
        suggestion,
      },
      effective_project_id: null,
      reported_project_id: null,
    };
  }

  if (binding) {
    const reportedProject = projectMap.get(binding.project_id);
    if (reportedProject) {
      return {
        attribution: {
          state: "reported",
          project: reportedProject,
          source: { kind: "runtime_binding", runtime_id: binding.runtime_id },
          reported_at: binding.updated_at,
        },
        effective_project_id: null,
        reported_project_id: reportedProject.project_id,
      };
    }
  }

  if (derived.derived_state === "tool_linked" && derivedCandidates.length > 0) {
    return {
      attribution: {
        state: "unfiled",
        reason: "tool_linked",
        candidates: derivedCandidates,
        suggestion,
      },
      effective_project_id: null,
      reported_project_id: null,
    };
  }

  if (derived.derived_state === "relation_gone") {
    return {
      attribution: {
        state: "unfiled",
        reason: "relation_gone",
        candidates: [],
        suggestion,
      },
      effective_project_id: null,
      reported_project_id: null,
    };
  }

  return {
    attribution: {
      state: "unfiled",
      reason: "no_relation",
      candidates: [],
      suggestion,
    },
    effective_project_id: null,
    reported_project_id: null,
  };
}

export function toRowSummary(row: ExternalSessionRow): ExternalSessionRowSummary {
  let filedAttribution: ExternalSessionFiledAttribution;
  if (row.attribution.state === "confirmed") {
    const { later_suggestion: _later, ...rest } = row.attribution;
    filedAttribution = rest;
  } else if (row.attribution.state === "automatic") {
    const { tool_reported_other: _other, ...rest } = row.attribution;
    filedAttribution = rest;
  } else {
    throw new Error(`Non-filed session ${row.session_key} cannot be projected to ExternalSessionRowSummary`);
  }
  const {
    identity: _identity,
    return_target: _returnTarget,
    attribution: _attribution,
    attribution_revision: _revision,
    ...rest
  } = row;
  return {
    ...rest,
    title: row.title === null ? null : redactSecrets(row.title),
    return_target: null,
    attribution: filedAttribution,
  };
}
