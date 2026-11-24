// Inbox's own Functions scene and its options (M9, specs/plugin-specials-demotion): they live with the plugin that declares the
// scene, not in the shared Functions contract. The string values are what saved rules and judgment records hold.

export const INBOX_NEXT_SCENE_ID = "inbox.next";
export const INBOX_DONE_OPTION_ID = "inbox.done";
export const INBOX_DISMISS_OPTION_ID = "inbox.dismiss";
export const INBOX_COMPOSE_OPTION_ID = "inbox.compose";
export const INBOX_VERIFY_OPTION_ID = "inbox.verify";
export const SYSTEM_INBOX_NEXT_FUNCTION_KEY = "system_pick_inbox_next";

export function defaultInboxNextOptionIds(active: boolean): string[] {
  return active ? [INBOX_DONE_OPTION_ID, INBOX_DISMISS_OPTION_ID] : [];
}
