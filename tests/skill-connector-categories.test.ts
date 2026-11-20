import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, signedContentPackage } from "./fixtures/content-package.js";
import { connectorAssistantModel, toolField, untilSetup } from "./fixtures/connector-assistant-model.js";
import { openTestHome } from "./fixtures/test-home.js";

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
    const missing = await list();
    assert.deepEqual(missing.availability, { available: false, reason: "connection_missing", detail: "project-tracker" });
    assert.deepEqual((await h.client.invoke(person, action(skillCatalogActions.readBodies), { refs: [missing.ref] }) as { results: SkillBodyReadResult[] }).results,
      [{ ref: missing.ref, ok: false, reason: "connection_missing", detail: "project-tracker" }]);
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

test("SCAF-05 ASC-39 ASC-40 the real Assistant round waits for and reuses the work's selected account", { timeout: 120_000 }, async t => {
  const f = await openTestHome(t), project = await f.createProject("Account choice");
  const prefix = "/projects/" + project.project_id + "/api";
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "weekly-review", name: "周报", body: BODY, connector_categories: ["project-tracker"] }] });
  const preview = await f.web.post<{ preview_id: string }>(prefix + "/plugin-trust/install/preview", { bundle });
  await f.web.post(prefix + "/plugin-trust/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Fixture publisher" });
  const accounts = withConnectorConnections(f.home, store => ["Team A", "Team B"].map((name, index) => ({
    name: "Linear · " + name,
    record: store.createToken({ serviceId: "linear", displayName: name, token: "fixture-linear-" + index }),
  })));
  const [other, beta] = accounts;
  assert.ok(other && beta);
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: project.project_id, permissions: [...SKILLS_PERMISSIONS] };
  const catalog = f.host.actionClient(project.reference);
  const skill = ((await catalog.invoke(person, skillCatalogActions.list, {}) as { skills: SkillCatalogEntry[] }).skills).find(row => row.ref.skill_id === "weekly-review")!;
  await catalog.invoke(person, skillCatalogActions.setState, { scope: "project", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state: "manual", expected_revision: 0 });
  const sorted = accounts.toSorted((a, b) => a.record.connection_id.localeCompare(b.record.connection_id));
  const read = (connection_id: string) => ({ name: "read-capability", input: { capability_id: "connectors.records.read", version: 1, provider_id: "system.connectors",
    input: { connection_id, connector_category: "project-tracker" } } });
  const discover = { name: "find-capabilities", input: { query: "connectors.records.read" } };
  const ask = (given: Record<string, unknown>) => {
    const id = JSON.stringify(given).match(/connection_[a-f0-9]{20}/u)?.[0];
    return { name: "ask-user", input: { why: "选择工作账号", questions: [{ id, type: "choice", prompt: "本次用哪个项目账号？",
      options: sorted.map(row => ({ label: row.name })) }] } };
  };
  const model = await connectorAssistantModel(t, f.home, (body, turn) => {
    if (turn === 1 || turn === 7) return discover;
    if (turn === 2 || turn === 4) return read(other.record.connection_id);
    if (turn === 3 || turn === 10) return ask(body);
    if (turn === 5 || turn === 8) return read(beta.record.connection_id);
    return "已整理 Team B 的事项。";
  }, undefined, f.host.configurePersonalPlanning(f.home, withMolisWorkProjectCatalog));
  const fetchOriginal = globalThis.fetch, actualReads: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== "api.linear.app") {
      assert.match(url.hostname, /^(127\.0\.0\.1|localhost)$/u, "only the loopback model and fake Linear are used");
      return fetchOriginal(input, init);
    }
    actualReads.push(new Headers(init?.headers).get("authorization") ?? "");
    return Response.json({ data: { viewer: { id: "team-b", name: "Beta" }, issues: { nodes: [{ id: "b1", identifier: "B-1", title: "Fixture schedule" }] } } });
  });
  const send = (request_id: string, work_id?: string) => f.web.post<{ work: { work_id: string } }>(prefix + "/assistant/send", {
    request_id, ...(work_id ? { work_id } : {}), text: "用周报技能读取本周事项",
    materials: [{ material_id: request_id, kind: "method", title: skill.name, explicit: true, method: { kind: "skill", ref: skill.ref } }],
  });
  const view = (id: string) => f.web.get<AssistantWorkView>(prefix + "/assistant/works/" + id);
  const waiting = (id: string) => untilSetup(async () => {
    const work = await view(id);
    const round = work.rounds.find(row => row.awaiting_input.length);
    assert.ok(!["completed", "failed", "stopped"].includes(work.work.state), `expected an account question before ${work.work.state}; model calls ${model.requests.length}`);
    return round && { round, question: round.awaiting_input[0]! };
  }, "the original account question");
  const before = await send("account-choice-first");
  const id = before.work.work_id, first = await waiting(id);
  assert.deepEqual(actualReads, [], "the Agent Host did not dispatch against a default or guessed account");
  assert.match(JSON.stringify(model.requests[0]), /Team A.*Team B|Team B.*Team A/u);
  const detail = first.question.questions?.[0];
  assert.ok(detail);
  const chosen = detail.options.find(row => row.label === beta.name)!;
  await f.web.post(prefix + "/assistant/works/" + id + "/answer", { run_id: first.round.run_id, pending_id: first.question.pending_id,
    pending_revision: first.question.pending_revision, values: { [`q${detail.index}`]: String(chosen.index) } });
  const complete = (total: number) => untilSetup(async () => {
    const work = await view(id);
    return work.work.state === "completed" && work.rounds.length === total ? work : undefined;
  }, "the work completes");
  await complete(1);
  assert.equal(toolField(model.requests[5]?.messages, "account_label"), beta.record.display_name);
  assert.ok(actualReads.length > 0 && actualReads.every(key => key === "fixture-linear-1"), "only the selected account reached Linear");
  const initialReads = actualReads.length;
  await send("account-choice-existing", id);
  await complete(2);
  assert.ok(actualReads.length > initialReads, "the next round in the same work read again without asking");
  assert.ok(actualReads.every(key => key === "fixture-linear-1"));
  const separate = await send("account-choice-independent");
  await waiting(separate.work.work_id);
  assert.notEqual(separate.work.work_id, id);
});
