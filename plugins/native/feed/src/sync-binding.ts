import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncBlobReference } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { FEED_CONTENT_REPLICA_ID } from "./contract/feed.js";
import { SIGNAL_CONTENT_REPLICA_ID } from "./contract/signals.js";
import { isFeedBodyRef } from "./content-ledger.js";
import { feedRuleCollection } from "./replication.js";
import { FEED_UNASSIGNED_BODY_HOLDER } from "./store/history-reads.js";
import { messageSections, sourceSections } from "./sync-sections.js";

const SYNC_HOLD_BATCH_SIZE = 200;
const SYNC_HOLDER_MAX_LENGTH = 200;

export interface FeedSyncBodyGroup {
  readonly source_id: string;
  readonly refs: readonly string[];
}

export interface FeedSyncHooks {
  /** Registers synced evidence bodies in Feed's Home reference ledger for this project. */
  holdSyncedBodies?(groups: readonly FeedSyncBodyGroup[]): Promise<void>;
  /** Wakes background reconciliation after synced message rows are applied or recovered. */
  onBodiesApplied?(): void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRows(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is Record<string, unknown> => row !== null) : [];
}

function normalizeHolderId(value: unknown): string {
  if (typeof value !== "string") return FEED_UNASSIGNED_BODY_HOLDER;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= SYNC_HOLDER_MAX_LENGTH ? trimmed : FEED_UNASSIGNED_BODY_HOLDER;
}

function parseStringArray(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function addRef(byHolder: Map<string, Set<string>>, sourceId: unknown, ref: unknown): void {
  if (typeof ref !== "string" || !isFeedBodyRef(ref)) return;
  const holder = normalizeHolderId(sourceId);
  let refs = byHolder.get(holder);
  if (!refs) {
    refs = new Set<string>();
    byHolder.set(holder, refs);
  }
  refs.add(ref);
}

/** Extracts all evidence body references grouped by holder source_id from a decoded `project_feed` payload. */
export function extractMessageBodyGroups(value: unknown): FeedSyncBodyGroup[] {
  const wire = asRecord(value);
  const facts = asRecord(wire?.facts);
  if (!facts) return [];
  const byHolder = new Map<string, Set<string>>();

  const feedContent = asRecord(facts[FEED_CONTENT_REPLICA_ID]);
  if (feedContent) {
    const itemSource = new Map<string, unknown>();
    for (const item of asRows(feedContent.feed_items)) {
      if (typeof item.item_id === "string") {
        itemSource.set(item.item_id, item.source_id);
      }
    }
    for (const material of asRows(feedContent.feed_materials)) {
      const sourceId = typeof material.item_id === "string" ? itemSource.get(material.item_id) : null;
      addRef(byHolder, sourceId, material.content_ref);
    }
  }

  const signalContent = asRecord(facts[SIGNAL_CONTENT_REPLICA_ID]);
  if (signalContent) {
    const signalSource = new Map<string, unknown>();
    for (const signal of asRows(signalContent.signals)) {
      if (typeof signal.signal_id === "string") {
        signalSource.set(signal.signal_id, signal.source_id);
      }
      for (const ref of parseStringArray(signal.content_refs_json)) {
        addRef(byHolder, signal.source_id, ref);
      }
    }
    for (const revision of asRows(signalContent.signal_revisions)) {
      if (typeof revision.draft_json !== "string") continue;
      try {
        const draft = asRecord(JSON.parse(revision.draft_json));
        if (!draft || !Array.isArray(draft.content_refs)) continue;
        const sourceId = typeof revision.signal_id === "string"
          ? (signalSource.get(revision.signal_id) ?? draft.source_id)
          : draft.source_id;
        for (const ref of draft.content_refs) {
          addRef(byHolder, sourceId, ref);
        }
      } catch {
        // Invalid drafts are rejected by the section validator before this point.
      }
    }
  }

  const groups: FeedSyncBodyGroup[] = [];
  for (const [sourceId, refSet] of [...byHolder.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const refs = [...refSet].sort();
    for (let offset = 0; offset < refs.length; offset += SYNC_HOLD_BATCH_SIZE) {
      groups.push({ source_id: sourceId, refs: refs.slice(offset, offset + SYNC_HOLD_BATCH_SIZE) });
    }
  }
  return groups;
}

function wrapMessagesBinding(base: PluginSyncBinding, hooks?: FeedSyncHooks): PluginSyncBinding {
  if (!hooks?.holdSyncedBodies && !hooks?.onBodiesApplied) {
    return base;
  }
  const baseContent = base.content;
  const wrappedContent = baseContent && hooks.holdSyncedBodies
    ? {
        encode: baseContent.encode,
        async prepare(key: string, value: unknown): Promise<void> {
          await baseContent.prepare?.(key, value);
          const groups = extractMessageBodyGroups(value);
          if (groups.length > 0) {
            await hooks.holdSyncedBodies!(groups);
          }
        },
        async decode(
          key: string,
          input: unknown,
          read: (reference: SyncBlobReference) => Promise<Uint8Array>,
        ): Promise<unknown> {
          const cachedBlobs = new Map<string, Uint8Array>();
          const cachedRead = async (reference: SyncBlobReference): Promise<Uint8Array> => {
            const cacheKey = `${reference.digest}:${reference.size}`;
            const cached = cachedBlobs.get(cacheKey);
            if (cached) return cached;
            const bytes = await read(reference);
            cachedBlobs.set(cacheKey, bytes);
            return bytes;
          };
          const decoded = await baseContent.decode(key, input, cachedRead);
          const groups = extractMessageBodyGroups(decoded);
          if (groups.length > 0) {
            await hooks.holdSyncedBodies!(groups);
            // Re-run against the in-memory blob cache once holds are committed so a concurrent release in another
            // project cannot have removed a freshly decoded body from the Home evidence pool before the hold landed.
            return await baseContent.decode(key, input, cachedRead);
          }
          return decoded;
        },
      }
    : baseContent;

  const baseReplica = base.replica;
  const wrappedReplica = hooks.onBodiesApplied
    ? {
        ...baseReplica,
        receive(event: Parameters<typeof baseReplica.receive>[0], options?: Parameters<typeof baseReplica.receive>[1]) {
          baseReplica.receive(event, options);
          hooks.onBodiesApplied?.();
        },
        resolve(
          key: string,
          choice: "local" | "remote",
          expectedRevision?: number,
          expectedState?: string,
        ) {
          baseReplica.resolve(key, choice, expectedRevision, expectedState);
          hooks.onBodiesApplied?.();
        },
        ...(baseReplica.restoreRecovery
          ? {
              restoreRecovery(id: string, choice: "local" | "remote", expectedRevision: number) {
                baseReplica.restoreRecovery!(id, choice, expectedRevision);
                hooks.onBodiesApplied?.();
              },
            }
          : {}),
      }
    : baseReplica;

  return {
    ...base,
    replica: wrappedReplica,
    ...(wrappedContent ? { content: wrappedContent } : {}),
  };
}

export function syncBindings(context: PluginStartContext, hooks?: FeedSyncHooks): PluginSyncBinding[] {
  const scope = context.sync;
  if (!scope) return [];
  const service = context.services?.sync;
  if (!service) {
    throw new ActionError("actions.unredeemed", "个人空间同步服务未提供");
  }
  return [
    service.sections("source_descriptions", sourceSections),
    wrapMessagesBinding(service.sections("messages", messageSections), hooks),
    {
      collection_id: "capture_rules",
      replica: service.collection("capture_rules", feedRuleCollection(context.project_id!)),
      content: createSyncJsonContent({ spaceId: scope.spaceId, authorize: () => scope.assertActive() }),
      locate: syncTupleLocation("feed", true, 2, false),
    },
  ];
}
