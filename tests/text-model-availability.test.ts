import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostCompleteText, textModelAvailability } from "@molis-ai/molis-work-app-local-host";

/**
 * D4-b, D4-c: an action that needs the text model says why it cannot run. "No model" sends the person to set one up
 * (`actions.connection_required`, in the action's own words); model settings that exist but cannot be read are another fact,
 * with the failure's own code, so nobody goes looking for a model they already have. The eight model-backed Host actions
 * (information, workflows, todo, dataset, pages, ppt, lingguang, plugin `services.model`) all answer through this one function.
 */
const SETTINGS_UNREADABLE = "文字模型的设置读不了，请检查模型设置";

test("no text model asks for one; model settings that cannot be read say so with their own code (D4-b, D4-c)", async t => {
  const home = await mkdtemp(join(tmpdir(), "text-model-availability-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MINIMAX_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT"]) delete process.env[key];
  const model = () => hostCompleteText({ homeDirectory: home });

  assert.deepEqual(textModelAvailability(model, "请先配置可用的文字模型"),
    { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" }, "nothing set up: the action's own words");

  // A catalog this Host did not write: the model settings are there but cannot be read.
  await mkdir(join(home, "projects"), { recursive: true });
  const db = new DatabaseSync(join(home, "projects", "catalog.db"));
  db.exec("CREATE TABLE notes (id TEXT)"); db.close();
  assert.throws(model, (error: unknown) => error instanceof ActionError && error.code === "catalog.unknown_database");
  assert.deepEqual(textModelAvailability(model, "请先配置可用的文字模型"),
    { available: false, code: "catalog.unknown_database", reason: SETTINGS_UNREADABLE }, "unreadable settings are not reported as no model");

  assert.deepEqual(textModelAvailability(() => { throw new Error("disk full"); }, "请先配置可用的文字模型"),
    { available: false, code: "actions.configuration_unavailable", reason: SETTINGS_UNREADABLE }, "a failure without a code of its own");
  assert.deepEqual(textModelAvailability(() => async () => "ok", "请先配置可用的文字模型"), { available: true });
});
