import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_BODY_LIMIT } from "@molis-ai/molis-work-plugin-lingguang/contract";
import { lingguangActions as actions, LINGGUANG_ACTION_PERMISSIONS, createLingguangActionHandlers } from "@molis-ai/molis-work-plugin-lingguang";
import { jellyContentActions, JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";

import { serveLingguang } from "./fixtures/lingguang-runtime.js";
const fixture = serveLingguang;
const lines = async (response: Response) => (await response.text()).trim().split("\n").map(line => JSON.parse(line) as Record<string, any>);

test("reading a file streams its progress and text; nothing is kept until the person keeps it, and refusals stay readable", async t => {
  const f = await fixture(t);
  const response = await f.request("/material", { file_name: "检查.txt", data_base64: Buffer.from("验证素材来源与笔记之间的联系。").toString("base64") });
  assert.match(response.headers.get("content-type")!, /ndjson/);
  const events = await lines(response);
  assert.equal(events[0]!.type, "progress");
  assert.deepEqual(events.at(-1), { type: "result", result: { text: "验证素材来源与笔记之间的联系。", file_name: "检查.txt" } });
  assert.deepEqual((await f.bound.invoke(actions.list, {})).sparks, [], "reading keeps no spark");
  // Nothing of the upload is kept: no raw copy under 灵光 (or Jelly) that no one reads and nothing cleans up.
  assert.deepEqual(readdirSync(join(f.home, "lingguang")).filter(name => !name.startsWith("lingguang.db")), []);
  assert.equal(existsSync(join(f.home, "jelly", "imports")), false);
  const refused = (await lines(await f.request("/material", { file_name: "bad.exe", data_base64: "AA==" }))).at(-1)!;
  // The error event is written by the SDK from the failure's kind. The file reader's refusals have kinds since W3-02-F: 415 misdescribes who failed and has none, so a
  // file type nobody reads is a request the person can change (400), and its code stays.
  assert.equal(refused.type, "error"); assert.equal(refused.status, 400); assert.equal(refused.code, "material.unsupported");
  // RAC-33: the declared material route always streams; it is not mistaken for a spark id.
  const plain = await f.request("/material", { file_name: "短.md", data_base64: Buffer.from("# 标题\n正文").toString("base64") });
  assert.equal(plain.status, 200); assert.match((await lines(plain)).at(-1)!.result.text, /正文/);
});

test("a reading longer than a spark holds is cut at the limit and says so", async () => {
  const handlers = createLingguangActionHandlers({ read: () => { throw new Error("not used"); }, write: async () => { throw new Error("not used"); }, modelAvailability: () => ({ available: false, code: "x", reason: "x" }),
    readFile: async () => ({ text: "长".repeat(LINGGUANG_BODY_LIMIT + 10), title: "长文", coverage: { status: "partial", issues: ["第 3 页没有读出"] } }) });
  const read = handlers.find(binding => binding.capability_id === actions.readFile.capability_id)!;
  const result = await read.handle({ actor_id: "owner", project_id: "a", audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS } as never, { file_name: "长.pdf", data_base64: "AA==" }) as { text: string; partial: boolean; issues: string[] };
  assert.ok(result.text.length < LINGGUANG_BODY_LIMIT);
  assert.equal(result.partial, true);
  assert.deepEqual(result.issues, ["第 3 页没有读出", `内容较长，只保留了前 ${LINGGUANG_BODY_LIMIT - 2000} 字`]);
});

test("Jelly receives a handed-over spark as one note, once; it reads back as a Jelly note", async t => {
  const f = await fixture(t);
  // A station is used inside a project, the way placement hands a spark over from where it is.
  const jelly = bindActionClient(f.client, () => ({ actor_id: "owner", project_id: f.project.project_id, audience: "user", permissions: JELLY_ACTION_PERMISSIONS }));
  const input = { title: "发布会预热", body: "倒计时海报提前一周放出", source: "灵光 · 发布会预热", request_id: "placement:req-1" };
  const first = await jelly.invoke(jellyContentActions.receive, input);
  const again = await jelly.invoke(jellyContentActions.receive, input);
  assert.equal(first.plugin, "jelly"); assert.equal(again.item_id, first.item_id, "a retried handoff finds the note it made");
  const read = await jelly.invoke(jellyContentActions.read, { item_id: first.item_id });
  assert.equal(read.title, "发布会预热"); assert.match(read.body, /倒计时海报提前一周放出/); assert.match(read.body, /来自：灵光 · 发布会预热/);
  assert.deepEqual(jellyContentActions.receive.action.subject_kinds, ["jelly_note"], "the station's content is Jelly notes");
  assert.deepEqual((await jelly.invoke(jellyContentActions.list, {})).map(item => item.item_id), [first.item_id]);
});
