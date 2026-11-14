import { isDeepStrictEqual } from "node:util";
import type { MemoryAuthority, MemoryPurgePreviewItem, MemoryScope } from "@prologue/sdk";
import { openNodeRecoveryInspection, openNodeRecoveryMaintenance } from "@prologue/sdk/node";
import type { MemoryRestoreIdentity, MemoryRestoreSdkPort, MemoryRestoreTarget } from "@molis-ai/molis-work-contracts/services/memory";
import type { PrologueMemoryOptions } from "./prologue-memory-authority.js";
import { agentErrors } from "../errors.js";

const scope = (value: MemoryRestoreIdentity["scope"]): MemoryScope => value === "personal" ? "user" : value;
const view = (item: MemoryPurgePreviewItem): MemoryRestoreTarget => ({ kind: item.kind, id: item.ref.id, version: item.expectedVersion,
  scope: item.identity.scope === "user" ? "personal" : item.identity.scope as MemoryRestoreIdentity["scope"], owner: item.identity.owner,
  ...(item.kind === "memory-candidate" ? { sources: item.sources?.map(source => ({ event_id: source.eventId, version: source.version })) ?? null } : {}) });

/** SDK107 cold owners only. Inspection authority cannot mutate; mutation authority freezes exact selected versions. */
export async function openPrologueMemoryRestore(input: {
  readonly storageRoot: string; readonly appVersion: string; readonly operationId: string;
  readonly scopes: readonly MemoryRestoreIdentity[]; readonly policy: PrologueMemoryOptions["policy"];
  readonly assertCurrent: () => void; readonly signal?: AbortSignal;
}): Promise<MemoryRestoreSdkPort> {
  const scopes = structuredClone(input.scopes).map(item => ({ scope: scope(item.scope), owner: item.owner }));
  const current = () => {
    input.signal?.throwIfAborted();
    const checked: unknown = input.assertCurrent();
    if (checked !== undefined) { void Promise.resolve(checked).catch(() => undefined); throw agentErrors.capability_unavailable("恢复权限必须同步确认"); }
  };
  const own = (target: { scope: MemoryScope; owner: string }) => scopes.some(item => item.scope === target.scope && item.owner === target.owner);
  const app = { appId: "io.molis.work", appVersion: input.appVersion }, context = { consumer: "ui", currentScene: "common", purpose: "management" as const };
  const authority = (targets?: readonly MemoryRestoreTarget[]): MemoryAuthority => {
    const permits = (requests: Parameters<MemoryAuthority["authorize"]>[0]) => requests.every(request => request.appId === app.appId && isDeepStrictEqual(request.context, context) && own(request.target)
        && (request.action === "manage-read" || request.action === "delete")
        && (!targets || targets.some(target => target.kind === request.target.ref.kind && target.id === request.target.ref.id
          && scope(target.scope) === request.target.scope && target.owner === request.target.owner
          && (target.version === request.target.version || target.kind === "memory" && request.action === "delete"
            && request.target.tombstoned === true && request.target.version === target.version + 1))));
    return {
    async authorize(requests) { current(); return permits(requests); },
    assertCurrent(requests) { current(); if (!permits(requests)) throw agentErrors.capability_unavailable("恢复清除超出原目标与版本"); },
    async authorizeManagement(request) { current(); return { allowed: request.appId === app.appId && isDeepStrictEqual(request.context, context) && own(request) }; },
    async authorizeAdoption(request) { current(); return request.appId === app.appId && isDeepStrictEqual(request.context, context)
      && request.scopes.every(own) && request.scopes.length === scopes.length; },
    };
  };
  current();
  // Writable readiness precedes every terminal observation, without granting a selected deletion.
  // The publisher already saved originals and holds the Home barrier and storage owner.
  const ready = await openNodeRecoveryMaintenance({ storageRoot: input.storageRoot, memoryStorageFormat: "indexed-v1", app,
    assertCurrent: current, sessionPurges: [], memory: { policy: input.policy, context, scopes, authority: authority([]) },
    ...(input.signal ? { signal: input.signal } : {}) });
  await ready.close(); current();
  const reader = await openNodeRecoveryInspection({ storageRoot: input.storageRoot, memoryStorageFormat: "indexed-v1", app, assertCurrent: current,
    memory: { policy: input.policy, context, scopes, authority: authority() } });
  const exact = (target: MemoryRestoreIdentity & { kind: MemoryRestoreTarget["kind"]; id: string }) => ({
    ref: { kind: target.kind, id: target.id, revision: 1 as const }, identity: { scope: scope(target.scope), owner: target.owner },
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return {
    async inspect(target) {
      current(); const found = await reader.inspectMemory(exact(target)); current();
      return found.state === "present" ? { state: "present", target: view(found.target) } : found;
    },
    async candidates(identity) {
      const result: MemoryRestoreTarget[] = []; let cursor: string | undefined;
      do {
        current();
        const page = await reader.previewMemoryPurge({ kind: "memory-candidate", scope: scope(identity.scope), owner: identity.owner,
          limit: 40, ...(cursor ? { cursor } : {}), ...(input.signal ? { signal: input.signal } : {}) });
        current();
        if (page.outcome !== "completed" || page.issues.length || !page.exhausted && (!page.cursor || page.cursor === cursor))
          throw agentErrors.capability_unavailable("恢复候选来源检查未完整完成");
        result.push(...page.items.map(view)); cursor = page.exhausted ? undefined : page.cursor;
      } while (cursor);
      return result;
    },
    async purge(targets) {
      if (!targets.length) return [];
      const fixed = structuredClone(targets); current();
      const paths = new Set<string>();
      const writer = await openNodeRecoveryMaintenance({ storageRoot: input.storageRoot, memoryStorageFormat: "indexed-v1", app, assertCurrent: current, sessionPurges: [],
        memory: { policy: input.policy, context, scopes, authority: authority(fixed) }, ...(input.signal ? { signal: input.signal } : {}) });
      try {
        for (const target of fixed) {
          current(); const receipt = await writer.purgeMemory({ ...exact(target), expectedVersion: target.version,
            operationId: `${input.operationId}:${target.kind}:${target.id}` }); current();
          for (const path of receipt.storageFiles) paths.add(path);
        }
      } finally { await writer.close(); }
      return Object.freeze([...paths]);
    },
    close: () => reader.close(),
  };
}
