import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workbenchPlatformText } from "../platform-languages.js";

function defaultNavigationLabel(key: string): string {
  const value = workbenchPlatformText.pack(workbenchPlatformText.default)?.messages[key];
  return typeof value === "string" ? value : key;
}

/** Platform navigation, independent of project Plugin membership or any Manifest. */
export const ARTIFACT_NAVIGATION = {
  id: "artifacts",
  surface: "artifacts",
  get label(): string {
    try { return uiText.text("workbench.artifacts.navigation-name"); }
    catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "ui.text_no_context") return defaultNavigationLabel("workbench.artifacts.navigation-name");
      throw error;
    }
  },
  glyph: "package",
  group: "make",
  rail: null,
  chosen: false,
  order: 60,
  hue: "pink",
  hint: "workbench.artifacts.navigation-hint",
} as const;
