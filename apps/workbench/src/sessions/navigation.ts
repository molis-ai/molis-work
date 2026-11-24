import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workbenchNavigationLabel } from "../navigation-label.js";

/** Platform navigation for external AI tool session history (BL-177, SRB-08). */
export const SESSIONS_NAVIGATION = {
  id: "sessions",
  surface: "sessions",
  get label(): string {
    return workbenchNavigationLabel("workbench.sessions.navigation-name", () => uiText.text("workbench.sessions.navigation-name"));
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
