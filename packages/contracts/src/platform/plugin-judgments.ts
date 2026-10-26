import type { ActionReference } from "./actions.js";
import type { JudgmentRecord } from "../modules/functions.js";

/** The Manifest permissions that give a plugin `services.judgments`: reading the ledger of its own scenes, and writing to it. Declared and granted like any other. */
export const PLUGIN_JUDGMENTS_READ_PERMISSION = "judgments:read";
export const PLUGIN_JUDGMENTS_WRITE_PERMISSION = "judgments:write";

/** One judgment a plugin records for a scene it declares. The function key and the time are the platform's: the plugin names the function by its reference. */
export interface PluginJudgmentInput {
  readonly function: ActionReference;
  readonly subject: JudgmentRecord["subject"];
  readonly scene_id: string;
  readonly scene_provenance: NonNullable<JudgmentRecord["scene_provenance"]>;
  readonly outcome: JudgmentRecord["outcome"];
  readonly suggested_behavior_ids: readonly string[];
  readonly error_code: string | null;
}

/**
 * The judgment ledger of the scenes the plugin declares (`action_scenes` in its Manifest), in the project the activation runs in
 * (docs/system/SECURITY-INVARIANTS.md S-90). The ledger lives in the Home's Functions library, not in the project's: `record` commits
 * there by itself and is not part of the plugin's project transaction, so a caller records first and writes its own rows after. A row whose
 * plugin rows did not follow is not harmless: adopting one rechecks its `scene_provenance`, which stops it only while the object is gone or
 * changed, so do not take `latest()` as proof that your own rows landed. A row belongs to the installation that recorded it: another plugin
 * that declares the same scene id reads none of it, and it goes with the installation's data.
 */
export interface PluginJudgmentsClient {
  /** The newest judgment this installation recorded for each subject of one of its scenes, in this project. Reads need `judgments:read`. */
  latest(sceneId: string): readonly JudgmentRecord[];
  /**
   * Records one judgment of one of this plugin's scenes for a subject of this project. Needs `judgments:write`, and only from a writable
   * call: a callback of the plugin's own scene (once its `beforeEffect` returned) or a concurrent action that declares the permission.
   */
  record(input: PluginJudgmentInput): JudgmentRecord;
}
