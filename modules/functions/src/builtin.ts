import type { DatabaseSync } from "node:sqlite";
import {
  FEED_CAPTURE_SCENE_ID,
  FEED_OPEN_BEHAVIOR_ID,
  FEED_REAUTH_BEHAVIOR_ID,
  FUNCTIONS_DEFAULT_MODEL,
  HOME_ASK_BEHAVIOR_ID,
  HOME_CONTINUE_BEHAVIOR_ID,
  HOME_DOCK_SCENE_ID,
  INBOX_ADMIT_BEHAVIOR_ID,
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  INBOX_NEXT_SCENE_ID,
  SYSTEM_HOME_DOCK_FUNCTION_KEY,
  SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
  SYSTEM_INBOX_NEXT_FUNCTION_KEY,
  type ChoiceCriterion,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { hashFunctionConfig } from "./hash.js";

const HOME_DOCK_CRITERIA: readonly ChoiceCriterion[] = [
  { key: HOME_CONTINUE_BEHAVIOR_ID, description: "接着做，打开原对象" },
  { key: INBOX_DONE_BEHAVIOR_ID, description: "做完了" },
  { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" },
  { key: FEED_REAUTH_BEHAVIOR_ID, description: "重新授权" },
  { key: HOME_ASK_BEHAVIOR_ID, description: "问问怎么回事" },
];

const INBOX_ADMIT_CRITERIA: readonly ChoiceCriterion[] = [
  { key: INBOX_ADMIT_BEHAVIOR_ID, description: "进入 Inbox" },
  { key: FEED_OPEN_BEHAVIOR_ID, description: "留在 Feed" },
];

const INBOX_NEXT_CRITERIA: readonly ChoiceCriterion[] = [
  { key: INBOX_DONE_BEHAVIOR_ID, description: "标记已处理" },
  { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" },
];

export function seedBuiltinFunctions(db: DatabaseSync): void {
  seedChoice(db, {
    id: "builtin-system_pick_home_dock",
    name: "挑首页按钮",
    function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY,
    instructions: "看这件事该显示哪个按钮。",
    criteria: HOME_DOCK_CRITERIA,
    scene_id: HOME_DOCK_SCENE_ID,
    subject_kinds: ["inbox_entry", "feed_item", "source", "session", "home_event"],
  });
  seedChoice(db, {
    id: "builtin-system_admit_inbox",
    name: "是否进 Inbox",
    function_key: SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
    instructions: "看这条消息要不要进 Inbox。",
    criteria: INBOX_ADMIT_CRITERIA,
    scene_id: FEED_CAPTURE_SCENE_ID,
    subject_kinds: ["feed_item"],
  });
  seedChoice(db, {
    id: "builtin-system_pick_inbox_next",
    name: "挑 Inbox 下一步",
    function_key: SYSTEM_INBOX_NEXT_FUNCTION_KEY,
    instructions: "看这条 Inbox 该显示哪个按钮。",
    criteria: INBOX_NEXT_CRITERIA,
    scene_id: INBOX_NEXT_SCENE_ID,
    subject_kinds: ["inbox_entry"],
  });
}

function seedChoice(db: DatabaseSync, input: {
  id: string;
  name: string;
  function_key: string;
  instructions: string;
  criteria: readonly ChoiceCriterion[];
  scene_id: string;
  subject_kinds: readonly string[];
}): void {
  const existing = db.prepare("SELECT id, config_hash FROM functions WHERE function_key = ?").get(input.function_key) as { id: string; config_hash: string } | undefined;
  const now = new Date().toISOString();
  const config_hash = hashFunctionConfig({
    primitive: "choice",
    instructions: input.instructions,
    criteria: input.criteria,
    model: FUNCTIONS_DEFAULT_MODEL,
  });
  const kindsJson = JSON.stringify(input.subject_kinds);
  if (existing) {
    if (existing.config_hash === config_hash) {
      db.prepare("UPDATE functions SET name = ?, scene_id = ?, subject_kinds_json = ? WHERE function_key = ?")
        .run(input.name, input.scene_id, kindsJson, input.function_key);
      return;
    }
    db.prepare(`
      UPDATE functions
      SET name = ?, instructions = ?, criteria_json = ?, scene_id = ?, subject_kinds_json = ?, config_hash = ?, updated_at = ?
      WHERE function_key = ?
    `).run(input.name, input.instructions, JSON.stringify(input.criteria), input.scene_id, kindsJson, config_hash, now, input.function_key);
    return;
  }
  const preview = {
    input: "builtin",
    outcome: "ok",
    primitive: "choice",
    choice: input.criteria[0]?.key ?? null,
    noul: null,
    score: null,
    legend: null,
    probabilities: {},
    confidence: null,
    model: FUNCTIONS_DEFAULT_MODEL,
    config_hash,
    at: now,
  };
  db.prepare(`
    INSERT INTO functions (
      id, name, function_key, primitive, status, version, model, instructions, criteria_json,
      scene_id, subject_kinds_json, config_hash, last_preview_json, samples_json, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'choice', 'published', 1, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)
  `).run(
    input.id,
    input.name,
    input.function_key,
    FUNCTIONS_DEFAULT_MODEL,
    input.instructions,
    JSON.stringify(input.criteria),
    input.scene_id,
    kindsJson,
    config_hash,
    JSON.stringify(preview),
    now,
    now,
    now,
  );
}
