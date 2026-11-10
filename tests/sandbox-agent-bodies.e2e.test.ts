import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HomeConsentLedger, homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import type { AssistantMethod, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";
import { newPublisher, packageMethod, signedAgentPackage, PACKAGE_PLUGIN_ID } from "./fixtures/sandbox-package.js";
import { waitWork } from "./fixtures/assistant-send-journey.js";
import { CURRENT_WORK } from "./fixtures/assistant-current-work.js";
import { roleOf } from "./fixtures/assistant-roles.js";

test("RAC-2636/2640/2641/2643 signed File preview and real picker preserve boundary names and source through model handoff", { skip: process.platform !== "darwin", timeout: 150_000 }, async t => {
  let model!: Awaited<ReturnType<typeof issueModel>>;
  const browser = await openGoalBrowser(t, "user", undefined, null, undefined, undefined, {
    prepareHome: async homeDirectory => { model = await issueModel(t, homeDirectory, { replyText: "已完成资料检查。" }); },
  }); assert.ok(browser);
  const publisher = newPublisher(), names = ["中".repeat(80), "😀".repeat(40), "文".repeat(78) + "😀", "<img src=x onerror=globalThis.__agentInjected=1>"], prefix = "😀".repeat(200);
  const roles = names.map((name, index) => ({ name, purpose: "目".repeat(300), body: `agent/role-${index}.md` }));
  // SKP-08 SKC-03: a signed package's methods are complete Skill declarations, each with its own skill_id.
  const methods = [packageMethod("same-name", names[0]!, "同名方法"), packageMethod("old-method", "旧方法", "将被移除")];
  const bodies = Object.fromEntries(roles.map(entry => [entry.body, prefix + "<script>仅为正文</script>旧尾部"]));
  const bundle = signedAgentPackage(publisher, { version: "1.1.0", roles, methods, bodies });
  const settings = `/projects/${browser.projectId}/settings/plugins`;
  const go = async (path: string) => browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + path }, browser.sessionId));
  const select = async (candidate: typeof bundle, name: string) => {
    const file = join(browser.homeDirectory, name + ".json"); await writeFile(file, JSON.stringify(candidate));
    const doc = await browser.command<{ root: { nodeId: number } }>("DOM.getDocument", {}, browser.sessionId);
    const input = await browser.command<{ nodeId: number }>("DOM.querySelector", { nodeId: doc.root.nodeId, selector: "[data-plugin-trust-pick]" }, browser.sessionId);
    await browser.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, browser.sessionId);
    await browser.waitFor("document.querySelector('[data-plugin-trust-preview]')?.hidden === false");
  };
  const shown = () => browser.evaluate<string>("document.querySelector('[data-plugin-trust-preview]').innerText");
  const cancel = async () => { await browser.click("[data-plugin-trust-preview] .mw-btn--secondary"); await browser.waitFor("document.querySelector('[data-plugin-trust-preview]').hidden"); };
  const confirm = async () => {
    await browser.evaluate("(() => {const field=document.querySelector('[data-plugin-trust-preview] input');if(field)field.value='Signed publisher';})()");
    await browser.click("[data-plugin-trust-preview] .mw-btn--primary"); await browser.waitFor("document.querySelector('[data-plugin-trust-preview]').hidden");
  };
  await go(settings); await browser.waitFor("!!document.querySelector('[data-plugin-trust-pick]')");
  await select(bundle, "cancelled");
  for (const name of names) assert.ok((await shown()).includes(name), "full display name");
  assert.ok((await shown()).includes(publisher.identity));
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-plugin-trust-preview] img,[data-plugin-trust-preview] script').length"), 0);
  assert.equal(await browser.evaluate("globalThis.__agentInjected || 0"), 0);
  assert.deepEqual(await browser.evaluate<string[]>("[...document.querySelectorAll('.plugin-trust-agent-body pre')].map(node=>node.textContent)"), roles.map(() => prefix));
  // A method is a Skill (09 §2.2): the review lists it by name with the package's other Skills, never as a body excerpt.
  assert.deepEqual(await browser.evaluate<string[]>("[...document.querySelectorAll('[data-plugin-trust-preview] .mw-items .mw-item strong')].map(node=>node.textContent)"), methods.map(item => item.name));
  await cancel();
  assert.deepEqual(new HomeConsentLedger(browser.homeDirectory).publishers(), []); assert.equal(existsSync(join(browser.homeDirectory, "plugin-packages")), false);
  assert.equal(homeAgentDefinitions(browser.homeDirectory).methods().some(item => item.owner_id === PACKAGE_PLUGIN_ID), false);
  await select(bundle, "install"); await confirm();
  await browser.waitFor("document.querySelector('[data-plugin-trust-list]').innerText.includes('1.1.0')");
  const next = signedAgentPackage(publisher, { version: "1.2.0", compatibleFrom: ["1.1.0"], roles, methods: [methods[0]!, packageMethod("new-method", "新增方法", "新增")], bodies: Object.fromEntries(roles.map(entry => [entry.body, prefix + "新尾部"])) });
  const evidence = join(process.cwd(), ".impeccable/qa/review/t144"); await mkdir(evidence, { recursive: true });
  for (const locale of ["zh", "en"] as const) {
    await go("/locale?lang=" + locale + "&next=" + encodeURIComponent(settings)); await browser.waitFor("!!document.querySelector('[data-plugin-trust-pick]')");
    await select(next, "upgrade-" + locale);
    const text = await shown(); assert.ok(text.includes(locale === "zh" ? "正文已变化" : "Body changed"));
    // The added and removed methods are Skill changes, shown in the package's Skill list.
    assert.ok(text.includes(locale === "zh" ? "新加入" : "New")); assert.ok(text.includes(locale === "zh" ? "会移除" : "Will be removed"));
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await browser.setViewport(width, 1000);
      await browser.evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
      assert.equal(await browser.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      assert.equal(await browser.evaluate("(() => {const panel=document.querySelector('[data-plugin-trust-preview]').getBoundingClientRect();return [...document.querySelectorAll('[data-plugin-trust-preview] button')].every(node=>{const box=node.getBoundingClientRect();return box.left>=panel.left&&box.right<=panel.right;});})()"), true);
      const screenshot = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, browser.sessionId);
      await writeFile(join(evidence, `${locale}-${width}-${theme}.png`), Buffer.from(screenshot.data, "base64"));
    }
    await cancel();
  }
  await go("/locale?lang=zh&next=" + encodeURIComponent(settings)); await browser.waitFor("!!document.querySelector('[data-plugin-trust-pick]')");
  await select(next, "upgrade-confirm"); await confirm();
  const other = signedAgentPackage(newPublisher(), { pluginId: "io.molis.work.example.other-agent", version: "1.0.0", roles: [roles[0]!], methods: [], bodies });
  await select(other, "other-plugin"); await confirm();
  await browser.setViewport(1440, 1000); await go("/");
  await browser.waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(browser.projectId)}`);
  // The package's method is a Skill of the shared catalog: offered to the Assistant once the person turns it on (09 §2.2).
  const registry = homeAgentDefinitions(browser.homeDirectory), sameName = registry.methods().find(item => item.owner_id === PACKAGE_PLUGIN_ID && item.skill_id === "same-name")!;
  assert.equal(registry.skills.set(browser.projectId, sameName.install_id!, sameName.skill_id, "auto", 0, "web-user"), "ok");
  const list = await browser.evaluate<{ methods: AssistantMethod[] }>(`fetch('/projects/${browser.projectId}/api/assistant/methods').then(response=>response.json())`);
  const own = list.methods.filter(roleOf(PACKAGE_PLUGIN_ID));
  for (const name of names) assert.ok(own.some(item => item.name === name && item.default_ref.source.plugin_version === "1.2.0"));
  assert.ok(list.methods.filter(item => (item.kind === "skill" ? item.skill.name : item.name) === names[0]).length >= 2);
  // K3: "/" on an empty line opens the unified composer's menu, which lists the methods and Character material by name.
  const slash = "(() => {const input=document.querySelector('[data-assistant-composer] .mw-composer__input');input.focus();input.value='/';input.setSelectionRange(1,1);input.dispatchEvent(new InputEvent('input',{bubbles:true,data:'/',inputType:'insertText'}));})()";
  const commands = "[...document.querySelectorAll('[data-assistant-composer] [data-compose-menu] [data-composer-command]')]";
  for (const name of names.slice(0, 3)) {
    await browser.evaluate(slash);
    await browser.waitFor(`${commands}.some(node=>node.textContent.includes(${JSON.stringify(name)}))`);
    const label = await browser.evaluate<string>(`(() => {const button=${commands}.find(node=>node.textContent.includes(${JSON.stringify(name)}));const text=button.textContent;button.click();return text;})()`);
    assert.ok(label.includes(name));
  }
  await browser.evaluate(slash);
  await browser.waitFor(`${commands}.some(node=>node.textContent.startsWith('/方法 ')&&node.textContent.includes(${JSON.stringify(names[0])}))`);
  await browser.evaluate(`${commands}.find(node=>node.textContent.startsWith('/方法 ')&&node.textContent.includes(${JSON.stringify(names[0])})).click()`);
  await browser.evaluate("(() => {const input=document.querySelector('[data-assistant-composer] .mw-composer__input');input.value='用所选资料审稿';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await browser.click("[data-assistant-composer] [data-composer-send]");
  await browser.waitFor(`!!${CURRENT_WORK}`);
  const workId = await browser.evaluate<string>(CURRENT_WORK);
  const view: AssistantWorkView = await waitWork(browser, workId, value => value.work.state === "completed");
  const adopted = view.rounds[0]!.materials.filter(item => item.kind === "method"); assert.equal(adopted.length, 4);
  for (const name of names.slice(0, 3)) assert.ok(adopted.some(item => item.method?.name === name));
  const actual = JSON.stringify(model.requests);
  for (const name of names.slice(0, 3)) assert.ok(actual.includes(name));
  assert.ok(actual.includes(publisher.identity)); assert.ok(actual.includes("1.2.0")); assert.ok(actual.includes("不可信角色资料"));
});
