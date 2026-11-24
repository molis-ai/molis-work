import {
  ActionError,
  bindActionHandler,
  parseExactActionReferences,
  requireSynchronous,
  type ActionCallContext,
  type ActionExecutionContext,
  type ActionHandlerBinding,
  type ActionView,
  type ExactActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContentAdoptionInput, ContentAdoptionReadResult } from "@molis-ai/molis-work-contracts/platform/blueprints";
import {
  HOME_PAGE_SUBJECT_KIND,
  homeErrors,
  homePageActions,
  type HomePageApprovalInput,
  type HomePageApprovalOperation,
  type HomePageApprovalReadResult,
  type HomePageApprovalReceipt,
  type HomePageDiffInput,
  type HomePageDiffResult,
  type HomePageDraft,
  type HomePageDraftSaveInput,
  type HomePageDraftSaveResult,
  type HomePageFilesResult,
  type HomePagePreviewResult,
  type HomePageReadInput,
  type HomePageReadResult,
  type HomePageRef,
  type HomePageSelectInput,
  type HomePageSelectResult,
  type HomePageVersion,
} from "@molis-ai/molis-work-contracts/services/home";
import { inspectHomePageDraft } from "@molis-ai/molis-work-plugin-sdk";
import { inspectHomePageDesign } from "./design-check.js";
import { actionKey, type HomePagesStore } from "./store.js";

export interface HomePagesPorts {
  open(projectId: string): HomePagesStore;
  discover(caller: ActionCallContext, mode: "save" | "approve"): Promise<readonly ActionView[]>;
  openPreviewSession(caller: ActionExecutionContext, version: HomePageVersion): { page_session_id: string };
  onSelectionChanged?(projectId: string): void;
  assertTopLevelUserApproval?(caller: ActionExecutionContext): void;
}

function requireProjectId(caller: ActionCallContext): string {
  if (!caller.project_id) throw new ActionError("actions.project_required", "生成首页动作必须在项目范围内调用");
  return caller.project_id;
}

function assertDirectUserOnly(caller: ActionExecutionContext, message: string): void {
  if (caller.audience !== "user" || caller.home_page || caller.host_plugin || caller.delegated_by) {
    throw homeErrors.approval_forbidden(message);
  }
}

function assertTopLevelUserApproval(caller: ActionExecutionContext, ports: HomePagesPorts): void {
  assertDirectUserOnly(caller, "采用或恢复生成首页只接受本人直接操作，不能由助理、插件或页面代为批准");
  if (caller.parent_action) {
    throw homeErrors.approval_forbidden("采用或恢复生成首页只接受顶层本人确认，不能由场景采用或其他动作嵌套调用");
  }
  ports.assertTopLevelUserApproval?.(caller);
}

function isContentAdoptionInput(input: HomePageDraftSaveInput): input is ContentAdoptionInput<HomePageDraft> {
  return "blueprint" in input && "selection" in input && "body" in input;
}

async function verifyDeclaredActions(
  caller: ActionCallContext,
  ports: HomePagesPorts,
  refs: readonly ExactActionReference[],
  options: { readonly mode: "save" | "approve"; readonly requireAvailable: boolean },
): Promise<void> {
  if (!refs.length) return;
  try {
    parseExactActionReferences(refs);
  } catch (error) {
    throw homeErrors.draft_invalid(error instanceof Error ? error.message : "页面声明的动作引用无效");
  }
  const directory = await ports.discover(caller, options.mode);
  const byKey = new Map<string, ActionView>(
    directory.map(view => [
      actionKey({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }),
      view,
    ]),
  );
  for (const ref of refs) {
    const view = byKey.get(actionKey(ref));
    if (!view) {
      throw homeErrors.action_unavailable(`找不到页面声明的动作 ${ref.capability_id}@${ref.version}（${ref.provider_id}）`);
    }
    // Spec §6.5: page references MUST explicitly carry the `plugin` audience (not agent->plugin fallback).
    if (!view.action.audiences.includes("plugin")) {
      throw homeErrors.action_unavailable(`动作 ${ref.capability_id}@${ref.version} 没有开放给页面调用`);
    }
    if (options.requireAvailable && !view.availability.available) {
      throw homeErrors.action_unavailable(view.availability.reason ?? `动作 ${ref.capability_id}@${ref.version} 当前不可用`);
    }
  }
}

export async function readHomePages(
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageReadInput,
): Promise<HomePageReadResult> {
  const projectId = requireProjectId(caller);
  const store = ports.open(projectId);
  if (!("queries" in input)) {
    return store.readOverview();
  }
  const currentState = store.selectionState();
  const results: Array<ContentAdoptionReadResult | HomePageApprovalReadResult> = [];
  for (const query of input.queries) {
    if (query.by === "approval_request") {
      const receipt = store.readApprovalReceipt(caller.actor_id, query.operation, query.request_id);
      results.push(
        receipt
          ? { kind: "receipt", receipt, current: currentState }
          : { kind: "missing", current: currentState },
      );
    } else if (query.by === "request") {
      const receipt = store.readDraftAdoptionReceipt(caller.actor_id, query.operation, query.request_id);
      if (!receipt) {
        results.push({ kind: "missing", operation: query.operation, request_id: query.request_id });
      } else {
        const latest = store.readLatestVersion(receipt.subject.id);
        results.push({
          kind: "receipt",
          operation: "adopt",
          request_id: query.request_id,
          receipt,
          current: latest
            ? {
                state: "present",
                revision: latest.version.version,
                origin: latest.origin,
                value: {
                  page_id: latest.version.page_id,
                  version: latest.version.version,
                  title: latest.version.title,
                  entry: latest.version.entry,
                },
              }
            : { state: "missing" },
        });
      }
    } else if (query.by === "subject") {
      if (query.subject.kind !== HOME_PAGE_SUBJECT_KIND) {
        results.push({ kind: "subject", current: { state: "missing" } });
      } else {
        const latest = store.readLatestVersion(query.subject.id);
        results.push({
          kind: "subject",
          current: latest
            ? {
                state: "present",
                revision: latest.version.version,
                origin: latest.origin,
                value: {
                  page_id: latest.version.page_id,
                  version: latest.version.version,
                  title: latest.version.title,
                  entry: latest.version.entry,
                },
              }
            : { state: "missing" },
        });
      }
    } else {
      const candidates = store.findProposalCandidates(query.blueprint, query.body.title);
      results.push({
        kind: "proposal",
        candidates: candidates.map(({ page_id, detail }) => ({
          subject: { kind: HOME_PAGE_SUBJECT_KIND, id: page_id },
          current: {
            state: "present",
            revision: detail.version.version,
            origin: detail.origin,
            value: {
              page_id: detail.version.page_id,
              version: detail.version.version,
              title: detail.version.title,
              entry: detail.version.entry,
            },
          },
        })),
      });
    }
  }
  return { results };
}

export async function saveHomePageDraft(
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageDraftSaveInput,
): Promise<HomePageDraftSaveResult> {
  const projectId = requireProjectId(caller);
  if (caller.home_page || (caller.audience !== "user" && caller.audience !== "agent")) {
    throw homeErrors.approval_forbidden("生成页面不能直接保存首页草稿");
  }
  const draft = isContentAdoptionInput(input) ? input.body : input.draft;
  const problems = inspectHomePageDraft(draft);
  if (problems.length) {
    throw homeErrors.draft_invalid(problems.map(item => `${item.path}: ${item.reason}`).join("；"), {
      details: { problems },
    });
  }
  await verifyDeclaredActions(caller, ports, draft.actions, { mode: "save", requireAvailable: false });
  await caller.beforeEffect();
  requireSynchronous(caller.assert_authority_current?.(), "首页草稿最终授权检查必须同步完成");
  caller.signal?.throwIfAborted();

  const store = ports.open(projectId);
  const author: "assistant" | "person" = caller.audience === "agent" ? "assistant" : "person";
  if (isContentAdoptionInput(input)) {
    return store.saveAdoptionDraft({
      actor_id: caller.actor_id,
      request_id: input.request_id,
      blueprint: input.blueprint,
      selection: input.selection,
      draft,
      author,
    });
  }
  const version = store.saveDirectDraft({
    draft,
    author,
    ...("page_id" in input ? { page_id: input.page_id, expected_version: input.expected_version, based_on: input.based_on } : {}),
  });
  return { version };
}

export async function previewHomePage(
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageRef,
): Promise<HomePagePreviewResult> {
  const projectId = requireProjectId(caller);
  assertDirectUserOnly(caller, "只有本人可以打开生成首页草稿的试用会话");
  const store = ports.open(projectId);
  const verified = store.readFilesVerified(input);
  const designReport = inspectHomePageDesign(verified.files);
  if (!designReport.ok) {
    const reasons = designReport.issues.filter(item => item.severity === "error").map(item => `${item.path}: ${item.reason}`);
    throw homeErrors.draft_invalid(reasons.join("；") || "页面未通过安全与样式检查，不能进入预览", {
      details: { issues: designReport.issues },
    });
  }
  await caller.beforeEffect();
  requireSynchronous(caller.assert_authority_current?.(), "打开首页试用会话前必须完成同步授权检查");
  caller.signal?.throwIfAborted();
  const { page_session_id } = ports.openPreviewSession(caller, verified.version);
  return { page: { page_id: verified.version.page_id, version: verified.version.version }, page_session_id };
}

export async function approveHomePage<Op extends HomePageApprovalOperation>(
  operation: Op,
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageApprovalInput,
): Promise<HomePageApprovalReceipt<Op>> {
  const projectId = requireProjectId(caller);
  assertTopLevelUserApproval(caller, ports);
  const store = ports.open(projectId);
  // Ensure the target version exists and its stored files pass SHA-256 integrity before approving.
  const verified = store.readFilesVerified({ page_id: input.page_id, version: input.version });
  const designReport = inspectHomePageDesign(verified.files);
  if (!designReport.ok) {
    const reasons = designReport.issues.filter(item => item.severity === "error").map(item => `${item.path}: ${item.reason}`);
    throw homeErrors.draft_invalid(reasons.join("；") || "页面未通过安全与样式检查，不能采用", {
      details: { issues: designReport.issues },
    });
  }
  const declared = new Set(verified.version.actions.map(actionKey));
  for (const action of input.approved_actions) {
    if (!declared.has(actionKey(action))) {
      throw homeErrors.draft_invalid(`批准的动作 ${action.capability_id}@${action.version} 不在这一版声明的清单里`);
    }
  }
  await verifyDeclaredActions(caller, ports, input.approved_actions, { mode: "approve", requireAvailable: true });
  await caller.beforeEffect();
  requireSynchronous(caller.assert_authority_current?.(), "首页批准前必须完成同步授权检查");
  caller.signal?.throwIfAborted();

  const { receipt, changed } = store.approveAndSelect({
    operation,
    actor_id: caller.actor_id,
    page_id: input.page_id,
    version: input.version,
    approved_actions: input.approved_actions,
    request_id: input.request_id,
    expected_revision: input.expected_revision,
  });
  if (changed) ports.onSelectionChanged?.(projectId);
  return receipt;
}

export async function selectBasicHomePage(
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageSelectInput,
): Promise<HomePageSelectResult> {
  const projectId = requireProjectId(caller);
  assertDirectUserOnly(caller, "只有本人可以切回基础首页");
  await caller.beforeEffect();
  requireSynchronous(caller.assert_authority_current?.(), "切回基础首页前必须完成同步授权检查");
  caller.signal?.throwIfAborted();

  const store = ports.open(projectId);
  const { result, changed } = store.selectBasic({
    actor_id: caller.actor_id,
    request_id: input.request_id,
    expected_revision: input.expected_revision,
  });
  if (changed) ports.onSelectionChanged?.(projectId);
  return result;
}

export async function diffHomePageVersions(
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageDiffInput,
): Promise<HomePageDiffResult> {
  const projectId = requireProjectId(caller);
  assertDirectUserOnly(caller, "只有本人可以查看首页版本差异");
  return ports.open(projectId).diffVersions(input.page_id, input.from_version, input.to_version);
}

export async function readHomePageFiles(
  caller: ActionExecutionContext,
  ports: HomePagesPorts,
  input: HomePageRef,
): Promise<HomePageFilesResult> {
  const projectId = requireProjectId(caller);
  assertDirectUserOnly(caller, "页面文件只供受信任外壳以本人身份读取，页面主体不能读取");
  return ports.open(projectId).readFilesVerified(input);
}

/** Reads the currently adopted generated homepage version, verified files, and approved actions for opening a live session. */
export function readAdoptedHomePageSessionTarget(
  ports: Pick<HomePagesPorts, "open">,
  projectId: string,
): { ref: HomePageRef; version: HomePageVersion; approved_actions: ExactActionReference[] } {
  const store = ports.open(projectId);
  const state = store.selectionState();
  if (state.selection.kind !== "page") {
    throw homeErrors.page_not_found("当前项目使用的是基础首页，没有已采用的生成首页");
  }
  const ref: HomePageRef = { page_id: state.selection.page_id, version: state.selection.version };
  const verified = store.readFilesVerified(ref);
  const detail = store.readVersion(ref);
  return {
    ref,
    version: verified.version,
    approved_actions: detail?.approval?.approved_actions ?? [],
  };
}

/** Reads pruned version records for a project's generated homepage (for inspect UI notices). */
export function readPrunedHomePageVersions(
  ports: Pick<HomePagesPorts, "open">,
  projectId: string,
  pageId?: string,
): Array<{ page_id: string; version: number; pruned_at: string }> {
  return ports.open(projectId).prunedVersions(pageId);
}

/** Action definitions and handlers for all 8 `homePageActions`, wired into `system.home` by the Host. */
export function homePageActionHandlers(ports: HomePagesPorts): ActionHandlerBinding[] {
  return [
    bindActionHandler(homePageActions.read, (input, caller) => readHomePages(caller, ports, input)),
    bindActionHandler(homePageActions.saveDraft, (input, caller) => saveHomePageDraft(caller, ports, input)),
    bindActionHandler(homePageActions.preview, (input, caller) => previewHomePage(caller, ports, input)),
    bindActionHandler(homePageActions.adopt, (input, caller) => approveHomePage("adopt", caller, ports, input)),
    bindActionHandler(homePageActions.restore, (input, caller) => approveHomePage("restore", caller, ports, input)),
    bindActionHandler(homePageActions.select, (input, caller) => selectBasicHomePage(caller, ports, input)),
    bindActionHandler(homePageActions.diff, (input, caller) => diffHomePageVersions(caller, ports, input)),
    bindActionHandler(homePageActions.readFiles, (input, caller) => readHomePageFiles(caller, ports, input)),
  ];
}
