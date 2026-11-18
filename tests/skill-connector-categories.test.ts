import assert from "node:assert/strict";
import test from "node:test";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, signedContentPackage } from "./fixtures/content-package.js";

/**
 * A skill's connector categories against the person's connections (specs/assistant-service-connections §13.7; ASC-38～40). The services
 * stand in for a category by declaring it (`categories`): Linear and Jira declare `project-tracker` in the catalog; nothing here names
 * them in the product.
 */
const action = (value: { capability_id: string; version: number }) => ({ capability_id: value.capability_id, version: value.version });
const BODY = "# 周报\n\n从 ~~project tracker 读这周关掉的事项，整理好后发到 ~~chat。\n";

test("ASC-38 ASC-39 ASC-40: a skill's category needs an account, its placeholder becomes the account, several are asked once, and a same-kind swap keeps it working", { timeout: 120_000 }, async () => {
  const h = await installedPackageHost();
  try {
    await h.install(signedContentPackage(newPublisher(), { skills: [{ id: "weekly-review", name: "周报", body: BODY, connector_categories: ["project-tracker"] }] }));
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const list = async () => (await h.client.invoke(person, action(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills
      .find(row => row.pack.plugin_id === CONTENT_PLUGIN_ID && row.ref.skill_id === "weekly-review")!;
    const read = async () => {
      const skill = await list();
      const result = (await h.client.invoke(person, action(skillCatalogActions.readBodies), { refs: [skill.ref] }) as { results: SkillBodyReadResult[] }).results[0]!;
      assert.ok(result.ok, JSON.stringify(result));
      return result.ok ? result.body : "";
    };

    // ASC-38: no account for the category: unavailable, naming the category, and not filled with another kind of service.
    assert.deepEqual((await list()).availability, { available: false, reason: "connection_missing", detail: "project-tracker" });
    const slack = withConnectorConnections(h.home, store => store.createToken({ serviceId: "slack", displayName: "Slack", token: "fixture-slack-token" }).connection_id);
    assert.equal((await list()).availability.available, false, "a chat account does not stand in for a project tracker");

    // One account: the placeholder is that account, and the model is told to name it in the result (ASC-40).
    const linear = withConnectorConnections(h.home, store => store.createToken({ serviceId: "linear", displayName: "Linear", token: "fixture-linear-token" }).connection_id);
    const skill = await list();
    assert.deepEqual(skill.availability, { available: true });
    await h.client.invoke(person, action(skillCatalogActions.setState), { scope: "project", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state: "auto", expected_revision: 0 });
    const one = await read();
    assert.match(one, /从 Linear 读这周关掉的事项/u);
    assert.doesNotMatch(one, /~~project tracker/u);
    assert.match(one, /~~chat/u, "a category the skill does not declare is left as written, even with a chat account connected");
    assert.match(one, /结果里写明实际用的服务和账号/u);

    // ASC-39: two accounts of the kind: the candidates, and the model asks once and keeps one for this work.
    const jira = withConnectorConnections(h.home, store => store.createToken({ serviceId: "jira", displayName: "Jira", token: "fixture-jira-token" }).connection_id);
    const two = await read();
    assert.match(two, /project-tracker（候选：Linear、Jira）/u);
    assert.match(two, /问用户一次用哪一个，这次工作只用它，不混用、不合并/u);

    // ASC-40: the same skill works with another service of the kind; a disabled account no longer counts.
    withConnectorConnections(h.home, store => store.setEnabled(linear, false));
    const swapped = await read();
    assert.match(swapped, /从 Jira 读这周关掉的事项/u);
    assert.doesNotMatch(swapped, /Linear/u);
    withConnectorConnections(h.home, store => { store.remove(jira); store.remove(slack); });
    assert.deepEqual((await list()).availability, { available: false, reason: "connection_missing", detail: "project-tracker" });
  } finally { await h.close(); }
});
