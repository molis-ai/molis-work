/** Local setting groups updated atomically; the action bar order refers to the shortcuts it contains. */
export const SHELF_PREFERENCE_FIELDS = {
  "shelf.drop_wheel": ["drop_wheel_enabled"],
  "shelf.hotkeys": ["hotkeys"],
  "shelf.panel_keys": ["panel_keys"],
  "shelf.engine": ["engine"],
  "shelf.model": ["model_selection"],
  "shelf.action_bar": ["shortcuts", "action_order", "hidden_actions"],
} as const;
export type ShelfPreferenceKey = keyof typeof SHELF_PREFERENCE_FIELDS;
export function shelfPreferenceKey(key: string): key is ShelfPreferenceKey { return Object.hasOwn(SHELF_PREFERENCE_FIELDS, key); }
