import type { FeedItemRecord } from "./projection.js";

/**
 * Puts a retained item's bodies back before it is shown. The host decrypts them from the Home's evidence store in place; a Runtime
 * installation reads each one through `services.sourcePull.evidence.read`, which is awaited, so a hydrator may answer later. Handlers
 * await it and never write after it (the write phase is a transaction that cannot span an await).
 */
export type FeedHydrate = (item: FeedItemRecord) => FeedItemRecord | Promise<FeedItemRecord>;
