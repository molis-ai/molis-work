import { isAbsolute, relative } from "node:path";
import type { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewKind, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { HOST_REVIEW_SETTLED_EVENT, HOST_WORKSPACE_CHANGED_EVENT, type HostReviewSettledPayload, type HostWorkspaceChangedPayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { HostEventRecipient, PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";

/**
 * A person-reviewed operation that ran. A plugin's names the installation that asked for it while that activation still runs;
 * an Agent's own write (BL-366) has nobody to answer and carries only the workspace it changed.
 */
export type ReviewSettlement =
  /** `recipient` is null when the activation that asked has since stopped: the operation ran all the same. */
  | { recipient: HostEventRecipient | null; payload: HostReviewSettledPayload; changed?: never }
  | { recipient: null; payload?: never; changed: HostWorkspaceChangedPayload };

/** What an Agent's approved write is placed with: the directory its round ran in, and the project's workspaces. */
export interface AgentWritePlaces {
  /** The round's frozen directory, as a canonical path; null when the round is gone or has none. */
  runDirectory(run: NonNullable<AgentReviewRequest["run"]>): Promise<string | null>;
  workspaces(): Promise<readonly ProjectWorkspaceRef[]>;
}

/** The kinds of an Agent's own review whose effect writes into a directory. */
const AGENT_WRITES: ReadonlySet<AgentReviewKind> = new Set(["text-edit", "command", "rewind", "git-index", "git-integration"]);

/**
 * The project workspace an Agent's approved write landed in: the directory the review names (a subtask's own root, or an
 * integration's target), else the round's, matched to the deepest workspace that holds it. Null when none does: a subtask's
 * separate worktree is no project workspace, and no subscriber reads it.
 */
async function agentWriteWorkspace(request: AgentReviewRequest, places: AgentWritePlaces): Promise<string | null> {
  const document = request.document;
  const named = document.kind === "git-integration" ? document.target_directory
    : document.kind === "text-edit" || document.kind === "command" ? document.workspace_path : undefined;
  const directory = named ?? (request.run ? await places.runDirectory(request.run) : null);
  if (!directory) return null;
  const holding = (await places.workspaces()).filter(workspace => {
    const inner = relative(workspace.canonical_path, directory);
    return inner === "" || (!inner.startsWith("..") && !isAbsolute(inner));
  }).sort((a, b) => b.canonical_path.length - a.canonical_path.length);
  return holding[0]?.workspace_id ?? null;
}

export type ObserveReviewSettlements = (listener: (settlement: ReviewSettlement) => void) => () => void;

/**
 * Settled plugin operations of one project asked for in this process (X-6): each may have written to a workspace, whoever asked.
 * The recipient is the review's trusted authority, recorded when the installation asked for it, never a plugin or project read
 * from request input. It is null once the asking activation has stopped, been disabled, upgraded or reinstalled (its `holds()` is
 * false): a reinstall keeps the `install_id`, so the id alone cannot tell the new installation from the one that asked. A review
 * restored from history has no authority and sends nothing: it ran in an earlier process, before anything running now started.
 */
export function observeReviewSettlements(queue: AgentReviewQueue, projectId: string, listener: (settlement: ReviewSettlement) => void,
  places?: AgentWritePlaces): () => void {
  let observing = true;
  const stop = queue.observeSettlement((request, receipt, origin) => {
    const operation = request.operation;
    if (request.project_id !== projectId) return;
    // An Agent's own write, whatever its outcome: a failed or unknown one may have written part of its change (BL-366).
    if (!operation && places && AGENT_WRITES.has(request.kind)) {
      void agentWriteWorkspace(request, places).then(workspace_id => {
        if (workspace_id && observing) listener({ recipient: null, changed: { workspace_id, cause: "agent-change" } });
      }, () => undefined);
      return;
    }
    if (!origin || !operation || operation.kind === "checkpoint-rewind") return;
    listener({ recipient: origin.holds() ? { plugin_id: origin.plugin_id, install_id: origin.install_id } : null, payload: { review_id: request.review_id, kind: operation.kind, operation_id: operation.operation_id,
      workspace_id: operation.workspace_id, outcome: receipt.effect_uncertain ? "unknown" : receipt.effect_settled ? "succeeded" : "failed" } });
  });
  return () => { observing = false; stop(); };
}

/**
 * One subscription to whichever settlement port the latest entry point brought. Each settlement goes as `host.review.settled@1`
 * to the installation that asked for it, while it still holds, and as `host.workspace.changed@1` to every installation of the
 * project that subscribes and holds `workspace:read`, whatever the outcome: a failed or unknown operation may have written part
 * of its change. Host-event delivery decides who can take each one now (S-54).
 */
export function reviewSettlementForwarder(hostEvents: Pick<PluginHostEvents, "notify" | "broadcast">) {
  let current: ObserveReviewSettlements | undefined, unsubscribe: (() => void) | undefined;
  return {
    update(next: ObserveReviewSettlements | undefined): void {
      if (next === current) return;
      unsubscribe?.(); current = next;
      unsubscribe = next?.(settlement => {
        let changed: HostWorkspaceChangedPayload;
        if (settlement.changed) changed = settlement.changed;
        else {
          const { recipient, payload } = settlement;
          if (recipient) hostEvents.notify(recipient, { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, payload, correlation_id: payload.review_id });
          changed = { workspace_id: payload.workspace_id, cause: "plugin-operation" };
        }
        hostEvents.broadcast({ event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, payload: changed });
      });
    },
    stop(): void {
      unsubscribe?.(); unsubscribe = undefined; current = undefined;
    },
  };
}
