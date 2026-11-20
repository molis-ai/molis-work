/**
 * A CLI command that gets through the entry (the database, the Home's lock, the store upgrades, the resident Host or the fallback)
 * and reaches the platform, which then finds nothing to review. The CLI's Goals commands (`snapshot`, `init`…) were the probe these
 * entry tests used; they were removed with specs/plugin-equal-standing PEQ-15, and this one names no plugin.
 */
export const cliEntryProbe = (database: string, project_id: string): string[] => ["review-request", "--db", database, "--json", JSON.stringify({
  project_id, reference: { owner: { kind: "trusted-decision", project_id, scope: "project", provider_id: "cli-entry-probe" }, id: "none", version: "1" },
})];

/** What the probe ends in once it reached the platform: the review request is not there. */
export const REACHED_THE_PLATFORM = { code: "actions.missing" } as const;

