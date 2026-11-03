import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ActionExecutionContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { formActions, createFormActionHandlers, ownFormStores } from "@molis-ai/molis-work-plugin-form";
import { openFormStore } from "./fixtures/plugin-home-stores.js";

// The names a form is exported under (src/fillpage.ts formFillPageFilename and formResultsCsvFilename): the title is cut at 80 characters, not 80 UTF-16 units.
// One 🟢 is one character and two units, so a cut by units kept only part of such a title and could stop between its two halves.

const wide = (count: number) => "🟢".repeat(count);
const PAGE = " · 填写页.html", TABLE = " · 答卷.csv";
/** True when the name survives being written as UTF-8 and read back: half of a two-unit character does not. */
const whole = (name: string) => Buffer.from(name, "utf8").toString("utf8") === name;

/** A form with this title in a real Form library, and the names the two actions give its fill page and its results table. */
async function exported(t: import("node:test").TestContext, title: string) {
  const home = await mkdtemp(join(tmpdir(), "form-export-names-"));
  const forms = openFormStore(home);
  t.after(async () => { forms.close(); await rm(home, { recursive: true, force: true }); });
  const handlers: ActionHandlerBinding[] = createFormActionHandlers({ ...ownFormStores(run => run(forms)), modelAvailability: () => ({ available: true }) });
  const caller: ActionExecutionContext = { actor_id: "web-user", project_id: "p", audience: "user", permissions: [], beforeEffect: async () => {} };
  const form = forms.create({ project_id: "p", title });
  forms.update(form.id, { questions: [{ id: "q1", type: "text", title: "你的建议", required: false, order: 1 }] }, "p");
  const filename = async (definition: { capability_id: string }) => {
    const handler = handlers.find(item => item.capability_id === definition.capability_id)!;
    return (await (handler.handle(caller, { id: form.id }) as Promise<{ filename: string }>)).filename;
  };
  return { page: await filename(formActions.fillPage), table: await filename(formActions.csv) };
}

test("RAC-1873 the fill page's file name keeps a title that runs past 80 UTF-16 units whole: no half character is left in it", async t => {
  // "a" and 40 🟢 are 41 characters and 81 units: the 80th unit is the first half of the last 🟢, where a cut by units stopped.
  const title = "a" + wide(40);
  const { page } = await exported(t, title);
  assert.ok(whole(page), "the name has no half of a character in it");
  assert.equal(page, title + PAGE, "the title is kept whole");
});

test("RAC-1874 the fill page's file name is cut at 80 characters, not 80 units: a title of exactly 80 characters is kept whole", async t => {
  // 80 🟢 are 80 characters and 160 units; a cut by units kept 40 of them.
  assert.equal((await exported(t, wide(80))).page, wide(80) + PAGE, "80 two-unit characters are kept whole");
  assert.equal((await exported(t, "x".repeat(80))).page, "x".repeat(80) + PAGE, "and 80 one-unit characters, as before");
});

test("RAC-1875 the results table's file name keeps a title that runs past 80 UTF-16 units whole: no half character is left in it", async t => {
  const title = "a" + wide(40);
  const { table } = await exported(t, title);
  assert.ok(whole(table), "the name has no half of a character in it");
  assert.equal(table, title + TABLE, "the title is kept whole");
});

test("RAC-1876 the results table's file name is cut at 80 characters, not 80 units: a title of exactly 80 characters is kept whole", async t => {
  assert.equal((await exported(t, wide(80))).table, wide(80) + TABLE, "80 two-unit characters are kept whole");
  assert.equal((await exported(t, "x".repeat(80))).table, "x".repeat(80) + TABLE, "and 80 one-unit characters, as before");
});
