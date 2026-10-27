import { feedErrors } from "@molis-ai/molis-work-contracts/modules/feed";
import { sourceDeletedAt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedApplication } from "./application.js";
import type { FeedSourceRecord } from "./projection.js";

/** Trusted execution options, never source configuration or transport input. */
export interface FeedSourceSyncAuthority {
  signal?: AbortSignal;
  beforeEffect?(): void | Promise<void>;
}

export interface FeedSourceSyncGuard {
  (): Promise<void>;
  /**
   * The same check of the source, without waiting: the first statement of every commit body that writes what the sync brought (its materials,
   * cursor, deliveries, terminal state). A commit waits for the caller before its transaction opens, and the source can change in that wait;
   * checked inside the body, the source the sync checked is the one it writes to, in the same transaction (FI-C-05).
   */
  check(): void;
  /** True once this guard has refused: the attempt lost its authority or its source changed, and stays refused. */
  readonly refused: boolean;
}

/**
 * Source state stays with Feed; caller authority stays with the original dispatcher.
 *
 * `afterOwnFailure` is for the bookkeeping that follows a failed pull. The sync records its interrupted run on the
 * source itself (status, error code, cursor, updated_at) after its last check, so those fields are not the person's
 * edit; what the person can change (name, description, enabled, schedule, configuration) still refuses.
 */
export function createFeedSourceSyncGuard(
  feed: FeedApplication, source: FeedSourceRecord, authority: FeedSourceSyncAuthority,
  options: { afterOwnFailure?: boolean } = {},
): FeedSourceSyncGuard {
  const configuration = (row: FeedSourceRecord) => JSON.stringify([row.kind, row.sync_kind, row.definition_id, row.config, row.credential_ref]);
  const original = configuration(source);
  const revision = (row: FeedSourceRecord) => JSON.stringify(options.afterOwnFailure
    ? [row.name, row.description, row.enabled, row.schedule]
    : [row.updated_at, row.name, row.description, row.enabled, row.status, row.schedule]);
  const originalRevision = revision(source);
  let refused = false, refusal: unknown;
  const verify = () => {
    authority.signal?.throwIfAborted();
    const current = feed.getSource(source.project_id, source.source_id);
    if (sourceDeletedAt(current)) throw feedErrors.source_not_found("来源已删除，本次拉取结果未提交");
    if (!current.enabled || current.status === "paused" || current.status === "disconnected") {
      throw feedErrors.source_paused("来源已暂停或断开，本次拉取结果未提交");
    }
    if (configuration(current) !== original) throw feedErrors.source_configuration_changed("来源配置已变化，请按新配置重新拉取");
    if (revision(current) !== originalRevision) throw feedErrors.source_changed("拉取期间来源已变化，请按当前设置重试");
  };
  // Error bookkeeping must not turn a refused attempt back into an authorized write.
  const refusing = (error: unknown): never => { refused = true; refusal = error; throw error; };
  const guard = async () => {
    if (refused) throw refusal;
    try {
      authority.signal?.throwIfAborted();
      await authority.beforeEffect?.();
      verify();
    } catch (error) { refusing(error); }
  };
  const check = () => {
    if (refused) throw refusal;
    try { verify(); } catch (error) { refusing(error); }
  };
  return Object.defineProperties(guard, { refused: { get: () => refused }, check: { value: check } }) as FeedSourceSyncGuard;
}
