import type { LensCompatibilityKey } from "../../domain/research/lens.js";

/** The compatibility key of an idea version, scope and lens, as the plan, run and report rows spell it. */
export function keyFromRow(row: {
  idea_id: string;
  idea_version: number;
  mvp_scope_version: number | null;
  lens: LensCompatibilityKey["lens"];
}): LensCompatibilityKey {
  return {
    ideaId: row.idea_id,
    ideaVersion: row.idea_version,
    ...(row.mvp_scope_version === null ? {} : { mvpScopeVersion: row.mvp_scope_version }),
    lens: row.lens,
  };
}
