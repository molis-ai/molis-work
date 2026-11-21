import { fakeActionClient } from "@molis-ai/molis-work-test-kit";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ActionError, defineSubjectContextAction, objectLink, objectLinkAt, objectLinkTemplate, validActionResultView, type ActionCallContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { mainlineActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { openObject } from "@molis-ai/molis-work-service-mainline";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";

// specs/work-line/contract-design.md §7 (platform capability audit 2026-11-14, item 2): one writer of workbench addresses, and
// one action that says where an object opens. WLN-11's 「打开」 and every later notification, reminder and search hit go through them.

const root = path.resolve(import.meta.dirname, "..");
const packOf = (file: string) => { const pack = parseLocalePack(readFileSync(path.join(root, file), "utf8"), { file }); assert.ok(pack.ok); return pack.value; };

test("WLN-11 objectLink writes every workbench address: a place, an object by reference, and a result template with its placeholders as written", () => {
  assert.equal(objectLink("p 1", { surface: "pages", id: "d/1", title: "季度 计划" }), "/projects/p%201/?openPlugin=pages&openItem=d%2F1&openTitle=%E5%AD%A3%E5%BA%A6%20%E8%AE%A1%E5%88%92");
  assert.equal(objectLink("p1", { surface: "inbox" }), "/projects/p1/?openPlugin=inbox", "a surface alone");
  assert.equal(objectLink("p1", { surface: "pages", id: "" }), "/projects/p1/?openPlugin=pages", "an empty item names the surface");
  assert.equal(objectLink("p1", { surface: "feed", params: { feedRule: "r&1" } }), "/projects/p1/?openPlugin=feed&feedRule=r%261", "what the surface itself reads");
  assert.equal(objectLink("p1", { kind: "todo_item", id: "t 1" }), "/projects/p1/?openObject=todo_item&openItem=t%201", "an object known only by reference: the page asks objects.open@1");
  assert.equal(objectLinkAt("", { surface: "shelf", id: "i1" }), "/?openPlugin=shelf&openItem=i1", "under no prefix");
  const shelf = objectLinkTemplate({ surface: "shelf", id: "{/item/item_id}", title: "{/item/name}" });
  assert.equal(shelf, "/projects/{project_id}/?openPlugin=shelf&openItem={/item/item_id}&openTitle={/item/name}");
  const goals = objectLinkTemplate({ surface: "goals", fragment: "{/proposal/proposal_id}" });
  assert.equal(goals, "/projects/{project_id}/?openPlugin=goals#{/proposal/proposal_id}");
  for (const href_template of [shelf, goals]) assert.equal(validActionResultView({ summary: "ok", link: { label: "打开", href_template } }), true, href_template);
});

test("WLN-11 no product source joins a workbench address by hand: objectLink is the only writer", () => {
  const AREAS = ["apps/local-host/src", "apps/workbench/src", "apps/desktop/src", "horizontal", "modules", "packages", "plugins"];
  const WRITER = "packages/contracts/src/platform/object-link.ts";
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === "vendor" || name.startsWith(".")) continue;
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(ts|mts|tsx)$/u.test(name) && !/\.test\.ts$/u.test(name) && !name.endsWith(".d.ts")) files.push(file);
    }
  };
  for (const area of AREAS) walk(path.join(root, area));
  assert.ok(files.length > 1000, "the product source is scanned");
  const joined = files.filter(file => path.relative(root, file) !== WRITER).flatMap(file => readFileSync(file, "utf8").split("\n")
    .map((line, index) => ({ line, at: `${path.relative(root, file)}:${index + 1}` }))
    // An address being written: the parameter after `?`, `&` or a quote, followed by a value. Comments describe addresses and are not code.
    .filter(({ line }) => /[?&'"`]open(?:Plugin|Object)=/u.test(line) && !/^\s*(?:\/\/|\*|\/\*)/u.test(line) && !/\/\/[^'"`]*[?&]open(?:Plugin|Object)=[^'"`]*$/u.test(line))
    .map(({ at }) => at));
  assert.deepEqual(joined, [], "write the address with objectLink / objectLinkAt / objectLinkTemplate (contracts platform/object-link, or the plugin SDK)");
});

const CALLER: ActionCallContext = { actor_id: "person", audience: "user", project_id: "p1", permissions: [] };
function reader(kind: string, available = true): ActionView {
  return { ...defineSubjectContextAction(`${kind}.context.read`, 1, kind, `读 ${kind}`, []), provider: { provider_id: `io.example.${kind}`, title: kind, kind: "plugin" },
    availability: available ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "这个插件没有开启" } };
}
function clientOf(views: ActionView[], read: (subjectId: string) => unknown): { client: ActionClient; calls: Array<[string, unknown]> } {
  const calls: Array<[string, unknown]> = [];
  const client: ActionClient = fakeActionClient({ discover: async () => views, invoke: async (_caller, action, input) => { const asked = input as { subject_id: string }; calls.push([action.capability_id, asked]); return read(asked.subject_id); } });
  return { calls, client };
}

test("WLN-11 objects.open@1 asks the owner's reader as the caller: its place is the target, an object without a page has none, and what the caller cannot read gives no place", async t => {
  // The label is the host's own words, said in the reader's language (e42534c294): the reader's text is installed as a request installs it.
  t.after(installTextForTest({ locale: "zh", packs: [packOf("apps/workbench/resources/locales/zh.json")] }));
  assert.deepEqual([mainlineActions.open.capability_id, mainlineActions.open.version, mainlineActions.open.action.effect, mainlineActions.open.action.audiences], ["objects.open", 1, "read", ["user", "agent", "workflow", "mcp"]]);
  const note = { subject: { kind: "note", id: "n1" }, revision: "3", title: "季度计划", content: "…", truncated: false };
  const paged = clientOf([reader("note"), reader("thing")], () => ({ ...note, open: { surface: "pages", id: "n1" } }));
  assert.deepEqual(await openObject(CALLER, paged.client, { subject: note.subject }),
    { subject: note.subject, title: "季度计划", target: { kind: "item", surface: "pages", id: "n1", title: "季度计划", label: "打开" } });
  assert.deepEqual(paged.calls, [["note.context.read", { subject_id: "n1" }]], "one read, by the reader of that kind");

  const bare = clientOf([reader("note")], () => ({ ...note, title: "  " }));
  assert.deepEqual(await openObject(CALLER, bare.client, { subject: note.subject }), { subject: note.subject, title: "n1", target: null }, "no page of its own: no place, and a name to say so with");

  // Refusals are the reader's own: the caller's directory has no reader, the reader is off, the reader refuses, or it answers for another object.
  const none = clientOf([reader("thing")], () => note);
  await assert.rejects(openObject(CALLER, none.client, { subject: note.subject }), (error: unknown) => error instanceof ActionError && error.code === "actions.subject_unavailable");
  const off = clientOf([reader("note", false)], () => note);
  await assert.rejects(openObject(CALLER, off.client, { subject: note.subject }), (error: unknown) => error instanceof ActionError && error.code === "actions.plugin_disabled");
  assert.deepEqual([none.calls, off.calls], [[], []], "nothing is read where no reader answers this caller");
  const refused = clientOf([reader("note")], () => { throw new ActionError("actions.forbidden", "没有读取这个对象的权限"); });
  await assert.rejects(openObject(CALLER, refused.client, { subject: note.subject }), (error: unknown) => error instanceof ActionError && error.code === "actions.forbidden");
  const other = clientOf([reader("note")], () => ({ ...note, subject: { kind: "note", id: "n2" }, open: { surface: "pages", id: "n2" } }));
  await assert.rejects(openObject(CALLER, other.client, { subject: note.subject }), (error: unknown) => error instanceof ActionError && error.code === "actions.subject_mismatch");
  const two = clientOf([reader("note"), { ...reader("note"), provider: { provider_id: "io.example.other", title: "other", kind: "plugin" } } as ActionView], () => note);
  await assert.rejects(openObject(CALLER, two.client, { subject: note.subject }), (error: unknown) => error instanceof ActionError && error.code === "actions.subject_ambiguous");
});
