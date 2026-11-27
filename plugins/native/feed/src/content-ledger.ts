import { PLUGIN_EVIDENCE_BATCH } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";

/**
 * The evidence bodies Feed's sources hold (specs/unified-partition-plugins §5, batch 109). The bodies live in the Home, content-addressed, so
 * one body can be held by sources of several partitions; the platform's evidence ledger (`services.evidence`) records which source of which
 * partition holds which body, the partition and installation being the Host's stamp and the source id Feed's holder key. It is a superset of
 * what is really referenced: a body is held before it is written and released only after its source's rows are gone, so a crash can leave a
 * hold too many (a body kept longer) and never one too few (a body that something still points at, deleted).
 */

/** The only bodies the evidence ledger counts: what the Home's evidence store names. A reference to anything else (a research note) is not its. */
const BODY_REF = /^molis-work-evidence\/sha256\/[0-9a-f]{64}$/u;
/** Whether a material's reference names a body in the Home's evidence store, rather than something another library keeps (`research:<id>`). */
export const isFeedBodyRef = (contentRef: string): boolean => BODY_REF.test(contentRef);
/** Most references one call may name, so a hold or release is one bounded write. */
export const FEED_CONTENT_LEDGER_BATCH = PLUGIN_EVIDENCE_BATCH;

export interface FeedContentRelease { bodies_deleted: number; bodies_kept: number; complete: boolean }
