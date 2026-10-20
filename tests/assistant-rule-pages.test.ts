import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ASSISTANT_RULES_PROVIDER } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantRule } from "@molis-ai/molis-work-contracts/services/assistant";
import { openTestHome, type TestHome } from "./fixtures/test-home.js";

/**
 * PG-036: a rule names a page by the id of an installed plugin, read from the project catalog when the rule is written.
 * Everything here goes through the Home's own interfaces: plugins are installed or taken out through the project settings,
 * rules are written through the Assistant's HTTP route and through the `assistant.rules.add` action.
 */
interface RulePages { rules: AssistantRule[]; pages: Array<{ page_id: string; label: string }> }

const quiet = (surfaces: string[], label = "在这里不提醒") => ({ kind: "quiet" as const, surfaces, except: [], label });
const person: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [] };

async function setup(t: TestContext) {
  const home = await openTestHome(t);
  const project = await home.createProject("规则页面");
  const pluginsPath = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
  const installed = async () => (await home.web.get<RulePages>("/api/assistant/rules")).pages.map(page => page.page_id);
  const addRule = (rule: object, ruleId?: string) => home.web.post<{ rules: AssistantRule[] }>("/api/assistant/rules", { rule, ...(ruleId ? { rule_id: ruleId } : {}) });
  return {
    home, installed, addRule,
    install: (pluginId: string) => home.web.post(pluginsPath, { plugin_id: pluginId }),
    remove: (pluginId: string) => home.web.delete(pluginsPath, { plugin_id: pluginId }),
  };
}

const addByAction = (home: TestHome, input: object) => home.host.homeActionClient().invoke(person,
  { capability_id: "assistant.rules.add", version: 1, provider_id: ASSISTANT_RULES_PROVIDER }, input) as Promise<{ rules: AssistantRule[] }>;

test("PG-036: a plugin installed in a project can have its page named by a rule; a personal plugin and the project home always can", async t => {
  const { installed, addRule, install } = await setup(t);
  assert.ok(!(await installed()).includes("coding"), "the plugin is not installed in any project yet");
  await assert.rejects(addRule(quiet(["coding"])), /coding/);
  await install("coding");
  const pages = await installed();
  assert.ok(pages.includes("coding") && pages.includes("jelly") && pages.includes("home"), "the project plugin, a personal one and the project home are all there");
  const { rules } = await addRule(quiet(["coding", "jelly", "home"]));
  assert.deepEqual(rules.map(rule => rule.surfaces), [["coding", "jelly", "home"]]);
});

test("PG-036: the pages the settings page offers come with the server, each with the name the workbench rail shows", async t => {
  const { home } = await setup(t);
  const { pages } = await home.web.get<RulePages>("/api/assistant/rules");
  const byId = new Map(pages.map(page => [page.page_id, page.label]));
  assert.equal(byId.get("home"), "项目首页");
  assert.ok((byId.get("jelly") ?? "").length > 0 && byId.get("jelly") !== "jelly", "an installed plugin is listed under the name of its rail entry, not its id");
});

test("PG-036: a personal plugin with no entry in the workbench rail is not a page a rule can name, since the client never reports it", async t => {
  const { home, installed, addRule } = await setup(t);
  const { pages } = await home.web.get<RulePages>("/api/assistant/rules");
  for (const page of ["shelf", "characters"]) {
    assert.ok(!pages.some(choice => choice.page_id === page), `${page} is not offered`);
    await assert.rejects(addRule(quiet([page])), new RegExp(page), `a rule naming ${page} is refused over HTTP`);
    await assert.rejects(addByAction(home, quiet([page])), new RegExp(page), `a rule naming ${page} is refused as an action`);
  }
  assert.ok(pages.every(choice => choice.page_id === "home" || choice.label !== choice.page_id), "every page offered has the name its rail entry shows");
  assert.ok((await installed()).includes("jelly"), "a personal plugin that has a rail entry is still offered");
  assert.deepEqual((await home.web.get<RulePages>("/api/assistant/rules")).rules, [], "nothing was kept");
});

test("PG-036: a page no installed plugin has is refused, over HTTP and as an action, and the refusal lists the pages there are", async t => {
  const { home, addRule } = await setup(t);
  await assert.rejects(addRule(quiet(["no-such-page"])), (error: Error) => /no-such-page/.test(error.message) && /home/.test(error.message));
  await assert.rejects(addRule(quiet(["Bad Id"])), /Bad Id/, "an id of the wrong shape is refused over HTTP too, not dropped");
  await assert.rejects(addByAction(home, quiet(["no-such-page"])), (error: Error) => /no-such-page/.test(error.message) && /home/.test(error.message));
  assert.deepEqual((await home.web.get<RulePages>("/api/assistant/rules")).rules, [], "nothing was kept");
});

test("PG-036: the add action accepts an installed page and refuses one whose plugin is not installed", async t => {
  const { home, install } = await setup(t);
  await assert.rejects(addByAction(home, quiet(["feed"])), /feed/);
  await install("feed");
  const added = await addByAction(home, quiet(["feed"]));
  assert.deepEqual(added.rules.map(rule => rule.surfaces), [["feed"]]);
});

test("PG-036: after the plugin is taken out of every project its page is refused; a rule that already names it can still be turned off", async t => {
  const { installed, addRule, install, remove } = await setup(t);
  await install("coding");
  const { rules: [rule] } = await addRule(quiet(["coding"]));
  await remove("coding");
  assert.ok(!(await installed()).includes("coding"));
  await assert.rejects(addRule(quiet(["coding"])), /coding/);
  const { rules: off } = await addRule({ ...quiet(["coding"]), enabled: false }, rule!.rule_id);
  assert.deepEqual(off.map(item => [item.surfaces, item.enabled]), [[["coding"], false]], "turning the rule off keeps the page it names");
  await assert.rejects(addRule(quiet(["coding", "feed"]), rule!.rule_id), /feed/, "a page the rule did not name still has to be installed");
});

test("PG-036: a personal plugin the person hid from every project drops out of the pages a rule may name", async t => {
  const { installed, addRule, remove } = await setup(t);
  assert.ok((await installed()).includes("jelly"));
  await remove("jelly");
  assert.ok(!(await installed()).includes("jelly"));
  await assert.rejects(addRule(quiet(["jelly"])), /jelly/);
});

test("PG-036: a pause names no page, so it is never checked against the catalog", async t => {
  const { addRule } = await setup(t);
  const until = new Date(Date.now() + 3600_000).toISOString();
  const { rules } = await addRule({ kind: "pause", surfaces: ["no-such-page"], except: [], until, label: "先别提醒" });
  assert.deepEqual(rules.map(rule => [rule.kind, rule.surfaces]), [["pause", []]]);
});
