import type { SandboxSchema } from "./plugin-sandbox.js";
import type { TextRef } from "./ui-text.js";

/** One setting as its owner declares it; reading and writing it is `platform/settings`. Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract. */
export const SETTINGS_LAYERS = ["project", "personal"] as const;
export const SETTINGS_CONSEQUENCES = ["reach", "cost", "external", "schedule"] as const;
export type SettingLayer = (typeof SETTINGS_LAYERS)[number];
export type SettingConsequence = (typeof SETTINGS_CONSEQUENCES)[number];

export interface SettingEntryDeclaration {
  /** A stable name. The declaring installation or system provider owns it. */
  key: string;
  title: TextRef;
  summary?: TextRef;
  layers: SettingLayer[];
  schema: SandboxSchema;
  consequence?: SettingConsequence[];
  device_only?: true;
}
