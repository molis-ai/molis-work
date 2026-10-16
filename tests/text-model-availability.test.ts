import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostCompleteText, textModelAvailability, textModelMissing } from "@molis-ai/molis-work-app-local-host";

/**
 * D4-b, D4-c: an action that needs the text model says why it cannot run. "No model" sends the person to set one up
 * (`actions.connection_required`, saying where: the one reason the Host writes); model settings that exist but cannot be read are another fact,
 * with the failure's own code, so nobody goes looking for a model they already have. The eight model-backed Host actions
 * (information, workflows, todo, dataset, pages, ppt, lingguang, plugin `services.model`) all answer through this one function.
 */
const SETTINGS_UNREADABLE = "文字模型的设置读不了，请检查模型设置";
const NO_MODEL = "请先在「模型设置」里连接文字模型";

test("no text model asks for one; model settings that cannot be read say so with their own code (D4-b, D4-c)", async t => {
  const home = await mkdtemp(join(tmpdir(), "text-model-availability-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  for (const key of ["MOLIS_WORK_TEXT_API_KEY", "MINIMAX_API_KEY", "MOLIS_WORK_TEXT_BASE_URL", "MOLIS_WORK_TEXT_MODEL", "MOLIS_WORK_TEXT_API_FORMAT"]) delete process.env[key];
  const model = () => hostCompleteText({ homeDirectory: home });

  assert.deepEqual(textModelAvailability(model),
    { available: false, code: "actions.connection_required", reason: NO_MODEL }, "nothing set up: where to set one up");
  assert.deepEqual(textModelAvailability(model, "继续对话"),
    { available: false, code: "actions.connection_required", reason: `${NO_MODEL}，再继续对话` }, "a caller adds only what it was for");

  // A catalog this Host did not write: the model settings are there but cannot be read.
  await mkdir(join(home, "projects"), { recursive: true });
  const db = new DatabaseSync(join(home, "projects", "catalog.db"));
  db.exec("CREATE TABLE notes (id TEXT)"); db.close();
  assert.throws(model, (error: unknown) => error instanceof ActionError && error.code === "catalog.unknown_database");
  assert.deepEqual(textModelAvailability(model),
    { available: false, code: "catalog.unknown_database", reason: SETTINGS_UNREADABLE }, "unreadable settings are not reported as no model");

  assert.deepEqual(textModelAvailability(() => { throw new Error("disk full"); }),
    { available: false, code: "actions.configuration_unavailable", reason: SETTINGS_UNREADABLE }, "a failure without a code of its own");
  assert.deepEqual(textModelAvailability(() => async () => "ok"), { available: true });
});

test("the reason names the model settings page exactly as the settings navigation shows it", () => {
  // The person looks for this name in 设置; if the page is renamed, the one reason the Host writes must follow.
  const sections = readFileSync(new URL("../apps/workbench/src/settings-sections.ts", import.meta.url), "utf8");
  const label = /\{ id: "models", label: "([^"]+)"/u.exec(sections)?.[1];
  assert.equal(label, "模型设置");
  assert.equal(textModelMissing(), `请先在「${label}」里连接文字模型`);
  assert.equal(textModelMissing("使用写作助手"), `请先在「${label}」里连接文字模型，再使用写作助手`);
});
