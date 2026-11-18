/** Platform navigation for external AI tool session history (BL-177, SRB-08). */
export const SESSIONS_NAVIGATION = {
  id: "sessions",
  surface: "sessions",
  label: "外部会话",
  glyph: "history",
  group: "make",
  rail: null,
  chosen: false,
  order: 65,
  hue: "indigo",
  hint: "workbench.sessions.navigation-hint",
} as const;

export const SESSIONS_PROVIDER_ID = "system.sessions";
