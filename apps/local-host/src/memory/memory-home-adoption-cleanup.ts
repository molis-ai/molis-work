import { isDeepStrictEqual } from "node:util";
import { memoryErrors } from "@molis-ai/molis-work-service-memory";
import { copyMemoryLedgerCleanupTargets, inspectMemoryLedgerCleanupSources, readMemoryLedgerCleanupDecision,
  beginMemoryLedgerCleanup, suppressMemoryLedgerCleanupSources, completeMemoryLedgerCleanupTarget,
  type MemoryLedgerCleanupTarget, type MemoryLedgerAdoptionSnapshot } from "@molis-ai/molis-work-storage";
import type { MemoryHomeAdoptionBridge, MemoryHomeAdoptionScope } from "./memory-home-adoption.js";

export type MemoryHomeAdoptionCleanup = { readonly mode: "confirm"; readonly operation_id: string; readonly targets: readonly MemoryLedgerCleanupTarget[] }
  | { readonly mode: "resume"; readonly operation_id: string };
export interface MemoryHomeAdoptionCleanupPreview {
  outcome: "completed" | "partial" | "cancelled";
  targets: readonly MemoryLedgerCleanupTarget[];
  issues: readonly { code: string }[];
  exhausted: boolean;
  cursor?: string;
}
export type MemoryHomeAdoptionCleanupResult = readonly { ref: MemoryLedgerCleanupTarget["ref"];
  outcome: "completed" | "conflict" | "denied" | "unknown" | "not-executed" }[];
type Context = { homeDirectory: string; snapshot: MemoryLedgerAdoptionSnapshot; scopes: readonly MemoryHomeAdoptionScope[];
  bridge: MemoryHomeAdoptionBridge; signal?: AbortSignal; assertCurrent(): void };

export function fixedCleanup(input: MemoryHomeAdoptionCleanup | undefined): MemoryHomeAdoptionCleanup | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input.operation_id !== "string" || !input.operation_id.trim()) throw memoryErrors.invalid("离线清理需要稳定操作号");
  if (input.mode === "resume" && Object.keys(input).length === 2) return { mode: "resume", operation_id: input.operation_id };
  if (input.mode !== "confirm" || Object.keys(input).length !== 3 || !Array.isArray(input.targets) || !input.targets.length)
    throw memoryErrors.invalid("离线清理需要明确确认目标，或恢复原决定");
  const targets = copyMemoryLedgerCleanupTargets(input.targets);
  if (new Set(targets.map(target => JSON.stringify([target.ref.kind, target.ref.id]))).size !== targets.length)
    throw memoryErrors.invalid("清理目标不能重复");
  return { mode: "confirm", operation_id: input.operation_id, targets };
}

/** One SDK page per call: an empty intermediate page still returns its continuation. */
export async function cleanupPreview(context: Context, cursor?: string): Promise<MemoryHomeAdoptionCleanupPreview> {
  let index = 0, sdkCursor: string | undefined;
  if (cursor !== undefined) {
    const value: unknown = JSON.parse(cursor);
    if (!value || typeof value !== "object" || !("index" in value) || typeof value.index !== "number"
      || !Number.isSafeInteger(value.index) || value.index < 0 || value.index >= context.scopes.length * 2
      || Object.keys(value).some(key => !["index", "cursor"].includes(key))
      || "cursor" in value && typeof value.cursor !== "string") throw memoryErrors.invalid("清理预览游标不合法");
    index = value.index; sdkCursor = "cursor" in value ? value.cursor as string : undefined;
  }
  context.assertCurrent();
  const scope = context.scopes[Math.floor(index / 2)];
  if (!scope) return { outcome: "completed", targets: [], issues: [], exhausted: true };
  const page = await context.bridge.previewCleanup({ ...scope, kind: index % 2 === 0 ? "memory" : "memory-candidate",
    ...(sdkCursor === undefined ? {} : { cursor: sdkCursor }), ...(context.signal ? { signal: context.signal } : {}) });
  context.assertCurrent();
  const items = page.items.map(item => {
    if (item.identity.scope !== scope.scope || item.identity.owner !== scope.owner) throw memoryErrors.forbidden("清理预览返回了范围外的身份");
    return { ...item, identity: { ...scope } };
  });
  const targets = inspectMemoryLedgerCleanupSources({ homeDirectory: context.homeDirectory, targets: items });
  if (!page.exhausted && (!page.cursor || page.cursor === sdkCursor)) throw memoryErrors.unavailable("清理预览分页未能继续");
  const exhausted = page.exhausted && index + 1 >= context.scopes.length * 2;
  return { outcome: page.outcome, targets, issues: page.issues, exhausted,
    ...(!exhausted ? { cursor: JSON.stringify(page.exhausted ? { index: index + 1 } : { index, cursor: page.cursor }) } : {}) };
}

/** The ledger decision, not a fresh tombstone preview, owns retries and the original SDK operation ids. */
export async function cleanupConfirmed(context: Context, input: MemoryHomeAdoptionCleanup): Promise<MemoryHomeAdoptionCleanupResult> {
  context.assertCurrent();
  let decision = readMemoryLedgerCleanupDecision({ ...context, operation_id: input.operation_id });
  if (decision) {
    if (input.mode === "confirm" && !isDeepStrictEqual(decision.items.map(item => item.target), input.targets))
      throw memoryErrors.conflict("同一清理操作不能更换确认目标、版本或来源影响");
  } else {
    if (input.mode === "resume") throw memoryErrors.conflict("没有原清理决定，不能按当前缺失补记完成");
    const remaining = new Set(input.targets);
    let cursor: string | undefined;
    do {
      const page = await cleanupPreview(context, cursor);
      if (page.outcome === "cancelled") throw memoryErrors.forbidden("清理预览已取消");
      for (const target of remaining) if (page.targets.some(item => isDeepStrictEqual(item, target))) remaining.delete(target);
      cursor = page.cursor;
    } while (cursor !== undefined);
    if (remaining.size) throw memoryErrors.conflict("目标或已知来源影响已经改变，请重新预览确认");
    decision = beginMemoryLedgerCleanup({ ...context, operation_id: input.operation_id, targets: input.targets });
  }
  const results: { ref: MemoryLedgerCleanupTarget["ref"]; outcome: MemoryHomeAdoptionCleanupResult[number]["outcome"] }[] =
    decision.items.map(item => ({ ref: item.target.ref, outcome: item.completed ? "completed" : "not-executed" }));
  for (let index = 0; index < decision.items.length; index++) {
    const item = decision.items[index]!;
    if (item.completed) continue;
    try {
      context.assertCurrent();
      if (!context.scopes.some(scope => isDeepStrictEqual(scope, item.target.identity))) throw memoryErrors.forbidden("原清理目标不在当前范围");
      suppressMemoryLedgerCleanupSources({ ...context, decision, index });
      context.assertCurrent();
      await context.bridge.purgeCleanupTarget({ target: item.target, operation_id: item.operation_id, ...(context.signal ? { signal: context.signal } : {}) });
      context.assertCurrent();
      decision = completeMemoryLedgerCleanupTarget({ ...context, decision, index });
      results[index]!.outcome = "completed";
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      results[index]!.outcome = /conflict|STORAGE_CONFLICT/.test(code) ? "conflict"
        : context.signal?.aborted || /DENIED|CANCELLED|forbidden|unavailable/.test(code) ? "denied" : "unknown";
      break;
    }
  }
  return results;
}
