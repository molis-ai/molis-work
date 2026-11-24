import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Platform navigation for external AI tool session history (BL-177, SRB-08). */
export const SESSIONS_NAVIGATION = {
  id: "sessions",
  surface: "sessions",
  get label(): string {
    try { return uiText.text("workbench.sessions.navigation-name"); }
    catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ui.text_no_context") return "外部会话";
      throw error;
    }
  },
  glyph: "history",
  group: "make",
  rail: null,
  chosen: false,
  order: 65,
  hue: "indigo",
  hint: "workbench.sessions.navigation-hint",
} as const;

export const SESSIONS_PROVIDER_ID = "system.sessions";
