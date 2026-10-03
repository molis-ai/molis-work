/**
 * The fields every 成果 is written with (specs/artifact-positioning A1): where the version came from, its title and its
 * media type. Test registrations spread this next to their payload.
 */
export function pinnedArtifact(title: string, subject: { kind: string; id: string } = { kind: "item", id: title }, revision = "1") {
  return { origin: { kind: "pinned" as const, subject, revision }, title, media_type: "application/json" };
}

/** The title a producer would record: the payload's own `title`, else the fallback. */
export function titleOf(content: { kind: string; payload?: unknown } | undefined, fallback: string): string {
  const payload = content?.kind === "inline" ? content.payload as { title?: unknown } | null : null;
  return typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim().split(/\r?\n/u, 1)[0]! : fallback;
}
