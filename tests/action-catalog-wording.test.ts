import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

/**
 * What the Assistant reads to pick an action (AI entry inventory §6, §7.4): a title that names the action, a description that
 * says more than the title (what it touches and what it needs), and no two actions answering to the same title.
 */
const MIN_DESCRIPTION = 14;

test("the Assistant's directory: every action has its own title and a description that says more than the title", async () => {
  const home = await mkdtemp(join(tmpdir(), "action-catalog-wording-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), projectId: "a" });
  const found = new Map<string, { title: string; description: string }>();
  try {
    for (const [project, reference] of [["a", ref], [null, undefined]] as const) {
      for (const view of await host.inspectActions({ actor_id: "web-user", project_id: project, audience: "agent", permissions: [] }, reference)) {
        found.set(`${view.capability_id}@${view.version}`, { title: view.action.title, description: view.action.description ?? "" });
      }
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
  assert.ok(found.size > 400, "the directory must actually be there");
  const same = [...found].filter(([, row]) => row.title.trim() === row.description.trim()).map(([id]) => id);
  assert.deepEqual(same, [], "a description that repeats the title says nothing");
  const short = [...found].filter(([, row]) => row.description.trim().length < MIN_DESCRIPTION).map(([id, row]) => `${id}: ${row.description}`);
  assert.deepEqual(short, [], `a description under ${MIN_DESCRIPTION} characters leaves out what the action touches or needs`);
  const byTitle = new Map<string, string[]>();
  for (const [id, row] of found) byTitle.set(row.title, [...(byTitle.get(row.title) ?? []), id]);
  const duplicated = Object.fromEntries([...byTitle].filter(([, ids]) => ids.length > 1));
  assert.deepEqual(duplicated, {}, "two actions with one title cannot be told apart in a search result");
  // The two readers of one kind of object are named by what they do.
  assert.equal(found.get("pages.search.entries@1")?.title, "列出可搜索的文档");
  assert.equal(found.get("pages.subject.read@1")?.title, "读取文档的正文与关联");
  assert.equal(found.get("alchemist.idea.subject.read@1")?.title, "读取 Idea 的正文与关联");
  assert.equal(found.get("feed.search.entries@1")?.title, "列出可搜索的 Feed 材料与来源");
});
