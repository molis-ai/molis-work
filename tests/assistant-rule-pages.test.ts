import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { AssistantService, AssistantStore, installedPagesPort, PROJECT_HOME_PAGE } from "@molis-ai/molis-work-app-local-host";

/** PG-036: a rule names a page by the id of an installed plugin, read from the project catalog when the rule is written. */
async function withAssistant(run: (setup: { service: AssistantService; catalog: Awaited<ReturnType<typeof openMolisWorkProjectCatalog>>; projectId: string; pages: () => Promise<readonly string[]> }) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-rule-pages-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try {
    const project = await catalog.createProject({ display_name: "规则页面", actor_id: "owner" });
    const pages = installedPagesPort(async (_options, operation) => operation(catalog), home);
    const service = new AssistantService(new AssistantStore(new DatabaseSync(":memory:")), {
      host: async () => { throw new Error("not used"); }, authority: async () => { throw new Error("not used"); }, pages }, "web-user");
    await run({ service, catalog, projectId: project.project_id, pages });
  } finally { catalog.close(); await rm(home, { recursive: true, force: true }); }
}

const quiet = (surfaces: string[], label = "在这里不提醒") => ({ kind: "quiet" as const, surfaces, except: [], label });

test("PG-036: a plugin enabled in a project can have its page named by a rule; a personal plugin and the project home always can", async () => {
  await withAssistant(async ({ service, catalog, projectId, pages }) => {
    assert.ok(!(await pages()).includes("coding"), "the plugin is not enabled in any project yet");
    catalog.addProjectPlugin({ project_id: projectId, plugin_id: "coding", actor_id: "owner" });
    assert.ok((await pages()).includes("coding"));
    assert.ok((await pages()).includes("jelly"), "a personal plugin is the person's in every project");
    const rules = await service.followUps.addRule(quiet(["coding", "jelly", PROJECT_HOME_PAGE]));
    assert.deepEqual(rules.map(rule => rule.surfaces), [["coding", "jelly", PROJECT_HOME_PAGE]]);
  });
});

test("PG-036: a page no installed plugin has is refused, and the refusal lists the pages there are", async () => {
  await withAssistant(async ({ service }) => {
    await assert.rejects(service.followUps.addRule(quiet(["no-such-page"])), (error: Error) => /no-such-page/.test(error.message) && new RegExp(PROJECT_HOME_PAGE).test(error.message));
    await assert.rejects(service.followUps.addRule(quiet(["Bad Id"])), /Bad Id/, "an id of the wrong shape is refused too, not dropped");
    assert.deepEqual(service.followUps.rules(), [], "nothing was kept");
  });
});

test("PG-036: after the plugin is taken out of every project its page is refused; a rule that already names it can still be turned off", async () => {
  await withAssistant(async ({ service, catalog, projectId, pages }) => {
    catalog.addProjectPlugin({ project_id: projectId, plugin_id: "coding", actor_id: "owner" });
    const [rule] = await service.followUps.addRule(quiet(["coding"]));
    catalog.removeProjectPlugin({ project_id: projectId, plugin_id: "coding", actor_id: "owner" });
    await assert.rejects(service.followUps.addRule(quiet(["coding"])), /coding/);
    const off = await service.followUps.addRule({ ...quiet(["coding"]), enabled: false }, rule!.rule_id);
    assert.deepEqual(off.map(item => [item.surfaces, item.enabled]), [[["coding"], false]], "turning the rule off keeps the page it names");
    assert.ok(!(await pages()).includes("feed"));
    await assert.rejects(service.followUps.addRule(quiet(["coding", "feed"]), rule!.rule_id), /feed/, "a page the rule did not name still has to be installed");
  });
});

test("PG-036: a personal plugin the person hid from every project drops out of the pages a rule may name", async () => {
  await withAssistant(async ({ service, catalog, projectId, pages }) => {
    assert.ok((await pages()).includes("jelly"));
    catalog.removeProjectPlugin({ project_id: projectId, plugin_id: "jelly", actor_id: "owner" });
    assert.ok(!(await pages()).includes("jelly"));
    await assert.rejects(service.followUps.addRule(quiet(["jelly"])), /jelly/);
  });
});

test("PG-036: a pause names no page, so it is never checked against the catalog", async () => {
  await withAssistant(async ({ service }) => {
    const until = new Date(Date.now() + 3600_000).toISOString();
    const rules = await service.followUps.addRule({ kind: "pause", surfaces: ["no-such-page"], except: [], until, label: "先别提醒" });
    assert.deepEqual(rules.map(rule => [rule.kind, rule.surfaces]), [["pause", []]]);
  });
});
