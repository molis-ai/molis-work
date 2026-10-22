import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability, type GitOperationRecord, type GitReviewedResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { MolisWorkLocalHost } from "./project-host.js";
import { prepareGitOperation } from "./git-operations.js";
import { prepareGitIndex } from "./workspace-git-index.js";
import { reviewAuthority } from "./plugin-callers.js";

const workspaceGitErrors = defineErrorCodes("workspace_git", {
  /** The workspace the call names is no longer authorized for this project (or its folder no longer matches). */
  workspace_unavailable: "unavailable",
});

type GitReviewPort = NonNullable<Awaited<ReturnType<typeof createPrologueNodeAdapter>>["gitReviews"]>;
export interface WorkspaceGitActionPorts {
  readonly localHost: MolisWorkLocalHost;
  /** Where the description of what each operation produced is kept (`git-operation-details.json`). */
  readonly homeDirectory: string;
  /** Starts the Agent runtime on first use; its Git reviews, once wired. */
  gitReviews(): Promise<GitReviewPort | undefined>;
  /** The Host review queue, once the Agent runtime has started. */
  reviews(): Promise<AgentReviewQueue>;
  /** The project's authorized workspaces. */
  workspaces(projectId: string): Promise<readonly ProjectWorkspaceRef[]>;
}

const notWired = () => new ActionError("actions.connection_required", "Git 宿主审查执行方尚未接通");

/**
 * The platform's workspace Git service as four plugin-only actions (PG-035): staging and the other Git operations start a Host review a person
 * approves, under the calling installation's `review:<kind>` (PG-009, S-50); the two reads list what became of them.
 */
export function registerWorkspaceGitActions(ports: WorkspaceGitActionPorts): () => void {
  const unregisterIndex = ports.localHost.registerAction(prepareGitIndexCapability, async (project, input, invocation) => {
    const reviews = await ports.gitReviews();
    if (!reviews) throw notWired();
    const current = () => ports.workspaces(project.project_id);
    const prepared = await prepareGitIndex(input, current);
    const workspace = (await current()).find(item => item.workspace_id === input.workspace_id);
    if (!workspace) throw workspaceGitErrors.workspace_unavailable("工作区已取消授权");
    await invocation.beforeEffect();
    const request = await reviews.prepare({ project_id: project.project_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      document: { kind: "git-index", action: input.action, workspace_name: workspace.display_name ?? "当前仓库", files: prepared.files } }, { ...prepared, authority: reviewAuthority(invocation.plugin, "git-index") });
    return { review_id: request.review_id };
  });

  // Commit, branch, push and PR: prepared against the repository as the person saw it, run only as the review shows.
  // What each produced is kept beside the review, since a receipt only says whether it happened.
  const detailsFile = path.join(ports.homeDirectory, "git-operation-details.json");
  const readDetails = async (): Promise<Record<string, string>> => { try { return JSON.parse(await readFile(detailsFile, "utf8")); } catch { return {}; } };
  // Operations approved together finish together: saves run one after another, so each reads what the one before it wrote and
  // none renames the temporary file from under another.
  let saving: Promise<void> = Promise.resolve();
  const saveDetail = (key: string, detail: string) => {
    const save = saving.then(async () => {
      const next = { ...await readDetails(), [key]: detail }, temporary = detailsFile + "." + process.pid + ".tmp";
      await writeFile(temporary, JSON.stringify(next)); await rename(temporary, detailsFile);
    });
    saving = save.catch(() => undefined);
    return save;
  };
  const verifiedWorkspace = async (projectId: string, workspaceId: string, refusal: string) => {
    const workspace = (await ports.workspaces(projectId)).find(item => item.workspace_id === workspaceId && item.realpath_verified);
    if (!workspace) throw workspaceGitErrors.workspace_unavailable(refusal);
    return workspace;
  };
  const unregisterOperation = ports.localHost.registerAction(prepareGitOperationCapability, async (project, input, invocation) => {
    const reviews = await ports.gitReviews();
    if (!reviews) throw notWired();
    // The action's schema refuses it first; kept here for whoever reaches this handler another way.
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(input.operation_id)) throw new ActionError("actions.input_invalid", "Git 操作标识无效");
    const workspace = await verifiedWorkspace(project.project_id, input.workspace_id, "工作区已取消授权");
    const prepared = await prepareGitOperation(workspace, input.revision, input.operation);
    // The caller's authority is checked again right before the review is created, as for staging.
    await invocation.beforeEffect();
    const request = await reviews.prepare({ project_id: project.project_id, workspace_id: input.workspace_id, operation_id: input.operation_id,
      operation_kind: "git-operation", document: { kind: "tool-operation", tool: prepared.tool, summary: prepared.summary, fields: prepared.fields } },
      { authority: reviewAuthority(invocation.plugin, "git-operation"), check: prepared.check, async execute() {
        const detail = await prepared.execute();
        try { await saveDetail(`${project.project_id}:${input.operation_id}`, detail); } catch { /* the operation happened; only its description is missing */ }
      } });
    return { review_id: request.review_id };
  });

  const unregisterOperations = ports.localHost.registerAction(readGitOperationsCapability, async (project, input) => {
    const queue = await ports.reviews();
    await verifiedWorkspace(project.project_id, input.workspace_id, "工作区已取消授权，不能读取操作结果");
    await queue.refresh(project.project_id);
    const details = await readDetails(), records: GitOperationRecord[] = [];
    for (const request of queue.list(project.project_id)) {
      if (request.operation?.kind !== "git-operation" || request.operation.workspace_id !== input.workspace_id || request.document.kind !== "tool-operation") continue;
      const receipt = queue.receipt(request.review_id);
      const outcome: GitOperationRecord["outcome"] = !receipt ? "unknown" : receipt.effect_uncertain ? "unknown" : receipt.status === "pending" ? "pending"
        : receipt.status === "rejected" ? "denied" : receipt.status === "cancelled" ? "cancelled" : receipt.status === "expired" ? "expired"
        : receipt.effect_settled ? "succeeded" : receipt.effect_error ? "failed" : "running";
      const detail = details[`${project.project_id}:${request.operation.operation_id}`];
      records.push({ operation_id: request.operation.operation_id, review_id: request.review_id, tool: request.document.tool, summary: request.document.summary, outcome,
        ...(outcome === "succeeded" && detail ? { detail } : {}), ...(receipt?.effect_error ? { failure_reason: receipt.effect_error } : {}),
        requested_at: request.requested_at, decided_by: receipt?.decided_by ?? null, decided_at: receipt?.decided_at ?? null });
    }
    return records.reverse();
  });

  const unregisterResults = ports.localHost.registerAction(readGitResultsCapability, async (project, input) => {
    const queue = await ports.reviews();
    await verifiedWorkspace(project.project_id, input.workspace_id, "工作区已取消授权，不能读取操作结果");
    await queue.refresh(project.project_id);
    const results: GitReviewedResult[] = [];
    for (const request of queue.list(project.project_id)) {
      if (request.operation?.kind !== "git-index" || request.operation.workspace_id !== input.workspace_id || request.document.kind !== "git-index") continue;
      const receipt = queue.receipt(request.review_id);
      if (!receipt || receipt.effect_uncertain || receipt.delivery_error || receipt.status === "pending") continue;
      if (receipt.status === "approved" && !receipt.effect_settled && !receipt.effect_error) continue;
      const outcome = receipt.status === "rejected" ? "denied" : receipt.status === "cancelled" ? "cancelled"
        : receipt.status === "expired" ? "expired" : receipt.effect_settled ? "succeeded" : "failed";
      const summary = outcome === "succeeded" ? (request.document.action === "stage" ? "已将审查版本放入暂存区；磁盘文件未改写。" : "已取消所选版本的暂存；磁盘文件未改写。")
        : outcome === "denied" ? "用户拒绝，原操作未执行。" : outcome === "cancelled" ? "原等待已撤回，没有重新执行。"
        : outcome === "expired" ? "原等待已过期，没有重新执行。" : receipt.reconciliation ? "已核对原操作未发生；不会自动重试。" : "原操作未完成；具体说明保留在宿主审查记录中。";
      results.push({ workspace_id: input.workspace_id, operation_id: request.operation.operation_id, outcome, summary,
        review: { review_id: request.review_id, action: request.document.action, paths: request.document.files.map(file => file.path),
          requested_at: request.requested_at, decided_by: receipt.decided_by, decided_at: receipt.decided_at,
          ...(receipt.effect_error ? { failure_reason: receipt.effect_error } : {}),
          ...(receipt.reconciliation ? { reconciliation: receipt.reconciliation } : {}) } });
    }
    return results.reverse();
  });

  return () => { unregisterIndex(); unregisterOperation(); unregisterOperations(); unregisterResults(); };
}
