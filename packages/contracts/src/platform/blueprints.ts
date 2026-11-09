import type { RoleTemplate } from "../modules/characters.js";
import type { PluginRequirementDeclaration } from "./plugin-manifest.js";
import type { SandboxJson } from "./plugin-sandbox.js";
import type { SettingLayer } from "./settings.js";
import type { TextRef } from "./ui-text.js";

export const BLUEPRINT_LIMITS = { parts: 128, steps: 128 } as const;

/** The reusable content of a scene package or draft. Its identity comes from the caller. */
export interface Blueprint {
  title: TextRef;
  parts: BlueprintPart[];
  purpose: { audience: TextRef; work: TextRef; inputs: TextRef; outputs: TextRef; first_result: TextRef };
  steps: Array<{ step_id: string; title: TextRef; part_ids: string[] }>;
  example_task: { title: TextRef; input: TextRef; step_ids: string[]; result: { part_id: string; location: TextRef } };
}

export interface BlueprintPart {
  /** Unique within the blueprint and stable across versions. */
  part_id: string;
  required: boolean;
  layer: SettingLayer;
  proposal: BlueprintProposal;
}

export type BlueprintProposal =
  | { kind: "capability"; requires: PluginRequirementDeclaration }
  | { kind: "skill"; skill: { pack: string; skill_id: string }; state: "auto" | "manual" }
  | { kind: "role"; template: RoleTemplate }
  | { kind: "setting"; key: string; value: SandboxJson }
  | { kind: "connection"; category: string; purpose: TextRef }
  | { kind: "content"; type: string; body: SandboxJson };
