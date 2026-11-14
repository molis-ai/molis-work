import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { PLUGIN_INSTALL_PERMISSIONS, homeAgentDefinitions, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, MEETING_NOTES, signedContentPackage } from "./fixtures/content-package.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/prologue-strategies/skill.md SKL-11, SKL-12 and specs/skill-packs SKP-10: the 「依据」 panel belongs to the shell. A round's
// page (the Assistant, a plugin's frame) only asks for it with `molis:skill-pick-open`; the shell reads the catalog, changes the
// person's settings through the real Host, and answers a choice for another round with `molis:skill-redo`.
test("SKL-11 SKL-12 SKP-10: the shell's panel says why a Skill was used, changes its setting with a way back, fails in place, and hands a redo back to the page", { timeout: 240_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis41-picks-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const f = await serveHomeRuntime(t), project = await f.project("Skill picks");
  // The person installs a package with two Skills and turns both on (auto).
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, permissions: PLUGIN_INSTALL_PERMISSIONS, project_id: project.project_id,
    user_action: { source: "management" as const, conversation_ref: "b41:install", message_ref: "b41:confirm" } };
  const client = f.host.actionClient(project.reference);
  const preview = await client.invoke(person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version },
    { bundle: signedContentPackage(newPublisher(), { skills: [{ ...MEETING_NOTES, name: "会议纪要" }, { id: "weekly-report", name: "周报" }] }) }) as { preview_id: string };
  await client.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  const api = async <T>(path: string, body: unknown) => {
    const response = await f.request(`/projects/${project.project_id}/api/skills/${path}`, { method: "POST", body });
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as T;
  };
  const catalog = async () => (await api<{ skills: SkillCatalogEntry[] }>("list", {})).skills;
  // The built-in plugins bring Skills of their own (Pages has a 「meeting-notes」 too): the fixture's are told by their package.
  const row = async (id: string) => (await catalog()).find(entry => entry.ref.source.plugin_id === CONTENT_PLUGIN_ID && entry.ref.skill_id === id)!;
  for (const id of ["meeting-notes", "weekly-report"]) {
    const entry = await row(id);
    await api("set", { scope: "project", install_id: entry.ref.install_id, skill_id: id, state: "auto", expected_revision: entry.settings_revision });
  }
  const notes = await row("meeting-notes"), weekly = await row("weekly-report");
  const stateOf = (id: string) => homeAgentDefinitions(f.home).skills.settings(project.project_id).find(setting => setting.install_id === notes.ref.install_id && setting.skill_id === id)?.state;

  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  // The first open of a project starts its plugins in this process; on a loaded machine that outlasts the harness's default.
  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/` }, 90_000);
  await page.wait("document.readyState === 'complete' && !!globalThis.molisPlacement && !!globalThis.molisWorkHomeView?.mountSkillPicks", { timeoutMs: 60_000 });
  await page.evaluate(`globalThis.redos = []; document.addEventListener("molis:skill-redo", event => globalThis.redos.push(event.detail))`);
  // What a round's line sends when its Skill button is pressed.
  const open = async (index: number | null) => {
    const taken = await page.evaluate<boolean>(`!document.dispatchEvent(new CustomEvent("molis:skill-pick-open", { cancelable: true, detail: ${JSON.stringify({ reply: "round-1", consumer: "assistant",
      picks: [{ ref: notes.ref, name: "会议纪要", picked: "auto" }], index, box: { x: 300, y: 200, width: 140, height: 28 } })} }))`);
    assert.equal(taken, true, "the shell took the request");
    await page.wait("!!document.querySelector('[data-skill-why] [role=menuitem]')", { describe: "document.querySelector('[data-skill-why]')?.innerText" });
  };
  const press = (label: string) => page.evaluate(`[...document.querySelectorAll('[data-skill-why] [role=menuitem]')].find(item => item.innerText.trim().startsWith(${JSON.stringify(label)})).click()`);
  const panel = () => page.evaluate<string>("document.querySelector('[data-skill-why]')?.innerText ?? ''");
  const redos = () => page.evaluate<Array<{ reply: string; named: Array<{ ref: unknown; name: string }> }>>("globalThis.redos.splice(0)");

  // SKL-11: why, the facts to judge it by, and what can be done — this round, and from now on.
  await open(0);
  const said = await panel();
  for (const words of ["会议纪要", "AI 按这一轮的任务自己选的。", "做什么", "用户要做会议纪要时使用。", "来自", "现在的设置", "自动", "这一轮", "换一个重做", "这次不用技能，重做", "以后", "改成仅手动", "停用"]) assert.ok(said.includes(words), `the panel says 「${words}」:\n${said}`);
  assert.equal(await page.evaluate("document.activeElement?.getAttribute('role')"), "menuitem", "the keyboard starts on the first action");
  assert.equal(await page.evaluate("document.querySelector('[data-skill-why]').matches(':popover-open') && document.querySelector('[data-skill-why]').getAttribute('role')"), "dialog");
  const box = await page.evaluate<{ left: number; top: number; right: number; bottom: number }>("(({ left, top, right, bottom }) => ({ left, top, right, bottom }))(document.querySelector('[data-skill-why]').getBoundingClientRect())");
  assert.ok(box.left >= 0 && box.top >= 228 && box.right <= 1280 && box.bottom <= 800, `the panel opens under the button, inside the window: ${JSON.stringify(box)}`);

  // SKP-10: 仅手动 takes effect at once, on the Host; the toast offers the way back, and the way back restores it.
  await press("改成仅手动");
  await page.wait("!!document.querySelector('.placement-toast') && !document.querySelector('[data-skill-why]')");
  assert.equal(stateOf("meeting-notes"), "manual");
  assert.match(await page.evaluate<string>("document.querySelector('.placement-toast').innerText"), /「会议纪要」已改成仅手动[\s\S]*以后只在你点名时使用。[\s\S]*撤销/);
  await page.evaluate("[...document.querySelectorAll('.placement-toast .mw-toast__action')].find(button => button.innerText === '撤销').click()");
  await page.wait("[...document.querySelectorAll('.placement-toast')].some(toast => toast.innerText.includes('已撤销'))");
  assert.equal(stateOf("meeting-notes"), "auto", "undone on the Host");

  // A save that fails says so in the panel, changes nothing, and can be tried again: here the setting moved after the panel read it.
  await open(0);
  const moved = await row("meeting-notes");
  await api("set", { scope: "project", install_id: moved.ref.install_id, skill_id: "meeting-notes", state: "manual", expected_revision: moved.settings_revision });
  await press("停用");
  await page.wait("document.querySelector('[data-skill-why] [role=alert]')?.hidden === false");
  assert.match(await page.evaluate<string>("document.querySelector('[data-skill-why] [role=alert]').innerText"), /没保存成，什么都没改。[\s\S]*重试/);
  assert.equal(stateOf("meeting-notes"), "manual", "nothing was changed by the refused save");
  assert.equal(await page.evaluate("document.querySelectorAll('.placement-toast').length > 0 && [...document.querySelectorAll('.placement-toast')].some(toast => toast.innerText.includes('已停用'))"), false, "and no success is announced");
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.wait("!document.querySelector('[data-skill-why]')");

  // SKL-11 「这次不用技能」: the page hears a redo with nothing named.
  await open(0); await press("这次不用技能，重做");
  assert.deepEqual(await redos(), [{ reply: "round-1", named: [] }]);
  // 「换一个重做」: the other Skills usable here, without the one the round already used; the choice goes back by its exact reference.
  await open(0); await press("换一个重做");
  await page.wait("document.querySelector('[data-skill-why]')?.innerText.includes('改用哪个')");
  const others = await page.evaluate<string[]>("[...document.querySelectorAll('[data-skill-why] [role=menuitem]')].map(item => item.innerText.trim().split('\\n')[0])");
  const offered = others.filter(name => !name.startsWith("‹"));
  assert.ok(offered.includes("周报") && !offered.includes("会议纪要"), `the other Skills usable here, not the one the round used: ${offered.join("、")}`);
  await page.evaluate(`[...document.querySelectorAll('[data-skill-why] [role=menuitem]')].find(item => item.innerText.trim().split('\\n')[0] === "周报").click()`);
  assert.deepEqual(await redos(), [{ reply: "round-1", named: [{ ref: weekly.ref, name: "周报" }] }]);
  assert.equal(await page.evaluate("!!document.querySelector('[data-skill-why]')"), false, "the panel closes once the choice is handed back");
  // 「选一个」 on a round that used none goes straight to the list.
  await open(null);
  assert.ok((await panel()).includes("改用哪个"));
});

// SKL-11: the Assistant's own line. A round that used no Skill says so once it ended, and 「选一个」 opens the shell's panel beside it.
test("SKL-11: an Assistant round that used no Skill says so above its reply, and its button opens the shell's panel", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, {
    prepareHome: async homeDirectory => { await issueModel(t, homeDirectory, { replyText: "好的，已经整理。" }); },
  });
  if (!browser) return;
  const { projectId, origin, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-assistant-composer] .mw-composer__input");
  await command("Input.insertText", { text: "整理一下今天的会" }, sessionId);
  await click("[data-assistant-composer] [data-composer-send]");
  await waitFor("document.querySelector('[data-assistant-thread] .mw-skill-line [data-skill-pick]')", 20_000);
  const line = await evaluate<{ text: string; beforeReply: boolean }>(`(() => { const line = document.querySelector('[data-assistant-thread] .mw-skill-line'), reply = document.querySelector('[data-assistant-thread] .assistant-rich');
    return { text: line.innerText.replace(/\\s+/g, ' ').trim(), beforeReply: !!reply && !!(line.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`);
  assert.deepEqual(line, { text: "这一轮没用技能 选一个", beforeReply: true });
  await click("[data-assistant-thread] .mw-skill-line [data-skill-pick]");
  await waitFor("document.querySelector('[data-skill-why]')?.innerText.includes('这里没有别的可用技能。')", 10_000);
  const near = await evaluate<boolean>(`(() => { const button = document.querySelector('[data-assistant-thread] .mw-skill-line [data-skill-pick]').getBoundingClientRect(), panel = document.querySelector('[data-skill-why]').getBoundingClientRect();
    return Math.abs(panel.left - button.left) <= 16 || panel.right <= innerWidth; })()`);
  assert.equal(near, true, "the panel opens by the button");
});
