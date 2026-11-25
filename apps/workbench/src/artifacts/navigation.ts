import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workbenchNavigationLabel } from "../navigation-label.js";

/** Platform navigation, independent of project Plugin membership or any Manifest. */
export const ARTIFACT_NAVIGATION = {
  id: "artifacts",
  surface: "artifacts",
  get label(): string {
    return workbenchNavigationLabel("workbench.artifacts.navigation-name", () => uiText.text("workbench.artifacts.navigation-name"));
  },
  glyph: "package",
  group: "make",
  rail: null,
  chosen: false,
  order: 60,
  hue: "pink",
  hint: "workbench.artifacts.navigation-hint",
} as const;
