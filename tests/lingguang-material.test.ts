import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_BODY_LIMIT } from "@molis-ai/molis-work-contracts/modules/lingguang";
import { lingguangActions as actions, LINGGUANG_ACTION_PERMISSIONS, createLingguangActionHandlers } from "@molis-ai/molis-work-plugin-lingguang";
import { jellyContentActions, JELLY_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-jelly";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { handleLingguangNativePluginHttp } from "../apps/local-host/src/lingguang-native-plugin-http.js";

/** 灵光 is the one place for ideas (specs/post-merge-review PMR-22): it reads files and pages, and hands a spark to Jelly as a note. */
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const home = await mkdtemp(join(tmpdir(), "lingguang-material-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "a", projectId: "a" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: "a", audience: "user", permissions: LINGGUANG_ACTION_PERMISSIONS };
  const client = host.actionClient(ref);
  const server: Server = createServer((request, response) => {
    void handleLingguangNativePluginHttp(request, response, new URL(request.url!, "http://localhost"), (_input, transport) => ({ projectId: "a",
      actions: bindActionClient(client, () => ({ ...caller, ...transport })) }))
      .then(handled => { if (!handled) { response.writeHead(404); response.end(); } });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address === "object");
  return { home, host, ref, caller, client, bound: bindActionClient(client, () => caller), base: `http://127.0.0.1:${address.port}` };
}
const post = (base: string, path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const lines = async (response: Response) => (await response.text()).trim().split("\n").map(line => JSON.parse(line) as Record<string, any>);

test("reading a file streams its progress and text; nothing is kept until the person keeps it, and refusals stay readable", async t => {
  const f = await fixture(t);
  const response = await post(f.base, "/api/lingguang/material?stream=1", { file_name: "检查.txt", data_base64: Buffer.from("验证素材来源与笔记之间的联系。").toString("base64") });
  assert.match(response.headers.get("content-type")!, /ndjson/);
  const events = await lines(response);
  assert.equal(events[0]!.type, "progress");
  assert.deepEqual(events.at(-1), { type: "result", result: { text: "验证素材来源与笔记之间的联系。", file_name: "检查.txt" } });
  assert.deepEqual((await f.bound.invoke(actions.list, {})).sparks, [], "reading keeps no spark");
  // The uploaded copy is kept with 灵光, not with Jelly.
  assert.equal(readdirSync(join(f.home, "lingguang", "imports")).length, 1);
  assert.equal(existsSync(join(f.home, "jelly", "imports")), false);
  const refused = (await lines(await post(f.base, "/api/lingguang/material?stream=1", { file_name: "bad.exe", data_base64: "AA==" }))).at(-1)!;
  assert.equal(refused.type, "error"); assert.equal(refused.status, 415); assert.match(refused.code, /unsupported/);
  // Without streaming the same action answers as plain JSON; a reading route is not mistaken for a spark id.
  const plain = await post(f.base, "/api/lingguang/material", { file_name: "短.md", data_base64: Buffer.from("# 标题\n正文").toString("base64") });
  assert.equal(plain.status, 200); assert.match((await plain.json() as { text: string }).text, /正文/);
});

test("a reading longer than a spark holds is cut at the limit and says so", async () => {
  const handlers = createLingguangActionHandlers({ withStore: () => { throw new Error("not used"); }, modelAvailability: () => ({ available: false, code: "x", reason: "x" }),
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
  const jelly = bindActionClient(f.client, () => ({ actor_id: "owner", project_id: "a", audience: "user", permissions: JELLY_ACTION_PERMISSIONS }));
  const input = { payload: { title: "发布会预热", body: "倒计时海报提前一周放出", source: "灵光 · 发布会预热" }, context: { instance_id: "placement:req-1", step: 0 } };
  const first = await jelly.invoke(jellyContentActions.receive, input);
  const again = await jelly.invoke(jellyContentActions.receive, input);
  assert.equal(first.plugin, "jelly"); assert.equal(again.item_id, first.item_id, "a retried handoff finds the note it made");
  const read = await jelly.invoke(jellyContentActions.read, { item_id: first.item_id });
  assert.equal(read.title, "发布会预热"); assert.match(read.body, /倒计时海报提前一周放出/); assert.match(read.body, /来自：灵光 · 发布会预热/);
  assert.deepEqual(jellyContentActions.receive.action.subject_kinds, ["jelly_note"], "the station's content is Jelly notes");
  assert.deepEqual((await jelly.invoke(jellyContentActions.list, {})).map(item => item.item_id), [first.item_id]);
});
