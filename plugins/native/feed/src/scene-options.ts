// Feed's own Functions scene and its options (M9, specs/plugin-specials-demotion): the scene id, the option ids its capture scene
// recommends and the default choice rules live with the plugin that declares the scene, not in the shared Functions contract. The
// string values are what saved rules and judgment records hold, so they stay as they were.

export const FEED_CAPTURE_SCENE_ID = "feed.capture";
/** Feed's 「进入 Inbox」 option; the value is the one rules recorded when the option was first offered. */
export const INBOX_ADMIT_OPTION_ID = "inbox.admit";
export const FEED_REAUTH_OPTION_ID = "feed.reauth";
export const FEED_OPEN_OPTION_ID = "feed.open";
export const FEED_SAVE_OPTION_ID = "feed.save";
export const FEED_PROMOTE_OPTION_ID = "feed.promote";
export const FEED_ARCHIVE_OPTION_ID = "feed.archive";
export const SYSTEM_INBOX_ADMIT_FUNCTION_KEY = "system_admit_inbox";

export const FEED_CAPTURE_DISPOSITION_IDS: readonly string[] = [
  INBOX_ADMIT_OPTION_ID,
  FEED_SAVE_OPTION_ID,
  FEED_PROMOTE_OPTION_ID,
  FEED_ARCHIVE_OPTION_ID,
];

export function defaultFeedCaptureOptionIds(canAdmit: boolean): string[] {
  return canAdmit ? [...FEED_CAPTURE_DISPOSITION_IDS, FEED_OPEN_OPTION_ID] : [];
}

/** Footer dispositions on a Feed item. `feed.open` maps to "stay in Feed" and is not a footer button. */
export function visibleFeedDispositionIds(
  suggested: readonly string[] | null | undefined,
  canAdmit: boolean,
): string[] {
  if (!canAdmit) return [];
  const offered = [...FEED_CAPTURE_DISPOSITION_IDS];
  const suggestedIds = suggested ?? [];
  const picked = offered.filter((id) => suggestedIds.includes(id));
  if (picked.length > 0) return picked;
  if (suggestedIds.includes(FEED_OPEN_OPTION_ID)) {
    return offered.filter((id) => id !== INBOX_ADMIT_OPTION_ID);
  }
  return offered;
}
