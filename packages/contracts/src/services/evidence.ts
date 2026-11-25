/**
 * The platform's evidence ledger (`horizontal/evidence`, specs/unified-partition-plugins §5, batch 106): who holds which body of the Home's
 * shared evidence pool. A hold is keyed by the body's reference, the partition and installation the Host stamps from the trusted context,
 * and the plugin's own holder key; only the platform's collection path, carrying {@link EVIDENCE_COLLECT_PERMISSION}, deletes a body
 * nobody holds (S-98 as rewritten).
 */
export const EVIDENCE_COLLECT_PERMISSION = "evidence:collect";

/** Who holds a body: the partition and installation are the Host's, `holder_key` the plugin's (its object, e.g. a source or a material). */
export interface EvidenceHolder {
  readonly partition_id: string;
  readonly owner_install: string;
  readonly holder_key: string;
}

export interface EvidenceHoldRecord extends EvidenceHolder {
  readonly content_ref: string;
  readonly held_at: string;
}
