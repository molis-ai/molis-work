import type { UiFormatTool, UiSayTool, UiTextTool } from "@molis-ai/molis-work-contracts/platform/ui";

// Opt in only for Workbench browser programs. The language entry installs these in each document before its client runs.
declare global {
  var t: UiTextTool;
  var say: UiSayTool;
  var format: UiFormatTool;
}
