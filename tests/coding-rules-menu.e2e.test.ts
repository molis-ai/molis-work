import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginFrameBrowser, pluginFrameInitScript } from "./fixtures/plugin-frame-browser.js";
import { CODING_COMPOSER, CODING_TAKEN, codingControl } from "./fixtures/coding-composer.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { asideReply } from "./fixtures/ending-review.js";

/** One streamed Anthropic-format model turn that only answers. */
function answer(text: string): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

const RULE = "RULES_MARKER: answer in one short sentence.";
const DIALOG = "[data-coding-rules-dialog]";
const RULES = codingControl("rules");

/**
 * BCD-05, BCD-08, BCD-10, BCD-14 (batch12-design §3.6, §3.7): the round a person starts in their own output folder is given its AGENTS.md,
 * and 「规则 N」 at the foot of the bar counts the files that round recorded, opening a menu that lists the project's own instructions and
 * the files apart. Reading turned off: the next round reads none and the menu says why, with the Host's confirm to turn it on. A round
 * that recorded nothing (from before this was recorded) says so instead of guessing.
 */
test("BCD-05 BCD-08 BCD-10 BCD-14 the rules menu shows what each round was given, why nothing was read, and the way to change it", { timeout: 300_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const bodies: string[] = [];
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8"), review = asideReply(raw);
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (review) { res.end(answer(review)); return; }
    bodies.push(raw); res.end(answer("好的。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const prepareHome = async (homeDirectory: string) => {
    await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
      const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" });
        store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
        models: [{ model_id: "fixture-small", enabled: true }] });
    }));
  };
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, { prepareHome }); if (!b) return;
  const child = await pluginFrameBrowser(t, b, "coding");
  const { command, sessionId, homeDirectory, projectId } = b;
  const coding = "[data-coding-workbench]";
  const workspace = join(homeDirectory, "coding-rules-fixture");
  await mkdir(workspace, { recursive: true });
  await writeFile(join(workspace, "AGENTS.md"), RULE);
  const fill = (selector: string, value: string) => b.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};
    node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/` }, sessionId));
  // The person chooses their own folder as the project's output, in the project's settings: that is what trusts it (§3.1).
  await b.click(".navigator-project-settings");
  await b.waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await b.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await b.waitFor("!!document.querySelector('[data-directories-add]') && document.querySelector('[data-project-directories]')?.dataset.state==='ready'");
  await fill("[data-directories-add] [name=path]", workspace);
  await b.click("[data-directories-add] [type=submit]");
  await b.waitFor("document.querySelector('[data-directories-inputs]').textContent.includes('coding-rules-fixture')");
  await b.click("[data-directories-inputs] [data-directory-row]:has([title$='/coding-rules-fixture']) [data-act=set-output]");
  await b.waitFor("document.querySelector('[data-directories-output] [data-directory-row] [data-text=path]')?.title.endsWith('/coding-rules-fixture')");
  await b.click(`[data-plugin-strip] [data-plugin-id="coding"]`);
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.getBoundingClientRect().width > 100`);
  await child.click(`${coding} [data-coding-new]`);
  await b.waitFor(`${CODING_TAKEN} && !document.querySelector('${CODING_COMPOSER} .mw-composer__input').disabled && document.querySelector('${CODING_COMPOSER} [data-composer-control=model]').options.length >= 1`);
  const session = await child.evaluate<string>(`document.querySelector('${coding} [data-coding-session][aria-current=true]')?.dataset.codingSession ?? ''`);
  const label = () => b.evaluate<string>(`document.querySelector(${JSON.stringify(RULES)})?.textContent.trim() ?? ''`);
  /** Sends one round in 讨论 and waits for its model call and for the bar to say what it recorded. */
  const round = async (words: string, expected: string) => {
    const before = bodies.length;
    await fill(codingControl("intent"), "discuss");
    await fill(`${CODING_COMPOSER} .mw-composer__input`, words);
    await b.waitFor(`!document.querySelector('${CODING_COMPOSER} [data-composer-send]').disabled`);
    await b.click(`${CODING_COMPOSER} [data-composer-send]`);
    for (let i = 0; i < 600 && bodies.length <= before; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(bodies.length > before, "the round called the model");
    // The round has ended once the way of working may change again; by then the bar says what it recorded.
    await b.waitFor(`document.querySelector(${JSON.stringify(RULES)})?.textContent.trim() === ${JSON.stringify(expected)} && !document.querySelector(${JSON.stringify(codingControl("intent"))}).disabled`, 30_000);
    return bodies.at(-1)!;
  };
  const openMenu = async () => {
    await b.click(RULES);
    await child.waitFor(`document.querySelector(${JSON.stringify(DIALOG)})?.open === true`);
    return child.evaluate<string>(`document.querySelector(${JSON.stringify(DIALOG)}).textContent.replace(/\\s+/g,' ')`);
  };
  const closeMenu = () => child.click(`${DIALOG} [data-coding-rules-close]`);
  const shot = async (name: string) => {
    const directory = join(process.cwd(), ".impeccable/qa/review/coding-rules-menu"); await mkdir(directory, { recursive: true });
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
  };

  // Trusted: the round is given AGENTS.md, and the bar counts one file.
  const trusted = await round("这个项目怎么发布？", "规则 1");
  assert.ok(trusted.includes("RULES_MARKER"), "BCD-05: the model request carries the output's AGENTS.md");
  const menu = await openMenu();
  assert.match(menu, /项目说明.*这个项目没有写项目说明/, "BCD-14: the project's own instructions are a group of their own, not counted in 规则 N");
  assert.match(menu, /仓库说明文件.*1MDAGENTS\.md\d+ 字生效中/, "BCD-08: the file the round recorded, its length, in effect");
  assert.match(menu, /规则只能约束 Coding/);
  await shot("zh-light-1360-trusted");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await shot("zh-dark-1360-trusted");
  await command("Emulation.setEmulatedMedia", { features: [] }, sessionId);
  for (const [width, height] of [[768, 1024], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 300));
    await shot(`zh-light-${width}-trusted`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await closeMenu();

  // The person turns reading off in the project's settings: the next round reads nothing and the menu says why, with the confirm.
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/settings/workspaces` }, sessionId));
  await b.waitFor("document.querySelector('[data-project-directories]')?.dataset.state === 'ready' && document.querySelector('[data-directories-read-instructions]')?.checked === true");
  await b.click("[data-directories-read-instructions]");
  await b.waitFor("document.querySelector('[data-directories-status]')?.dataset.tone === 'done' && document.querySelector('[data-directories-read-instructions]').checked === false");
  await b.evaluate("document.querySelector('[data-directories-instructions]').scrollIntoView({block:'center'})");
  await shot("zh-light-1360-settings-off");
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/?openPlugin=coding` }, sessionId));
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.dataset.uiClientState === 'ready'`, 20_000);
  await child.click(`${coding} [data-coding-session="${session}"]`);
  await b.waitFor(`${CODING_TAKEN} && !document.querySelector('${CODING_COMPOSER} .mw-composer__input').disabled`, 20_000);
  const untrusted = await round("再说一次。", "规则");
  assert.ok(!untrusted.includes("RULES_MARKER"), "BCD-05: reading off, the round is given no instruction file");
  const off = await openMenu();
  assert.match(off, /仓库说明文件.*没有读取.*你在项目设置里关了读取/, "BCD-08: not loaded, and why");
  assert.equal(await child.evaluate<string>(`document.querySelector('${DIALOG} [data-coding-rules-not-loaded]')?.dataset.codingRulesNotLoaded ?? ''`), "off");
  await shot("zh-light-1360-not-loaded");
  // 「读取这个文件夹的说明文件」 goes through the Host's own dialog; once the person says yes the menu says it applies from the next round.
  await child.click(`${DIALOG} [data-coding-rules-confirm]`);
  await b.waitFor("document.querySelector('[data-page-dialog=confirm]')?.open === true || Boolean(document.querySelector('[data-page-dialog=confirm]:not([hidden])'))");
  await b.click("[data-page-dialog=confirm] [type=submit]");
  await child.waitFor(`document.querySelector(${JSON.stringify(DIALOG)}).textContent.includes('下一轮起生效')`, 15_000);
  await closeMenu();
  const again = await round("第三次。", "规则 1");
  assert.ok(again.includes("RULES_MARKER"), "turned on again, the next round reads it");

  // English, light and dark.
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${projectId}/?openPlugin=coding`)}` }, sessionId));
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.dataset.uiClientState === 'ready'`, 20_000);
  await child.click(`${coding} [data-coding-session="${session}"]`);
  await b.waitFor(`document.querySelector(${JSON.stringify(RULES)})?.textContent.trim() === 'Rules 1'`, 20_000);
  const english = await openMenu();
  assert.match(english, /Repository instruction files.*1MDAGENTS\.md.*In effect/);
  await shot("en-light-1360-trusted");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await shot("en-dark-1360-trusted");
  await command("Emulation.setEmulatedMedia", { features: [] }, sessionId);
  await closeMenu();

  // BCD-10: a round that recorded no sources (one from before they were recorded) says so; it never shows the files as not loaded.
  await pluginFrameInitScript(t, b, `(()=>{const original=window.fetch;window.fetch=async(input,init)=>{const response=await original(input,init);const path=String(input?.url||input);
    if(!/\\/sessions\\/[^/?]+\\?window=/.test(path))return response;const body=await response.json();for(const run of [...(body.runs||[]),...(body.earlier||[])])if(run&&run.frozen)delete run.frozen.instructions;
    return new Response(JSON.stringify(body),{status:response.status,headers:{'content-type':'application/json'}});};})()`);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/locale?lang=zh&next=${encodeURIComponent(`/projects/${projectId}/?openPlugin=coding`)}` }, sessionId));
  await b.waitFor(`document.querySelector('[data-work-surface="coding"]')?.dataset.uiClientState === 'ready'`, 20_000);
  await child.click(`${coding} [data-coding-session="${session}"]`);
  await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(RULES)}))`, 20_000);
  assert.equal(await label(), "规则", "an unrecorded round counts nothing");
  const unrecorded = await openMenu();
  assert.match(unrecorded, /这一轮没有记录规则来源/);
  assert.doesNotMatch(unrecorded, /没加载|没有读取/, "BCD-10: never 「没加载」 for a round that recorded nothing");
  assert.deepEqual(await child.evaluate("(window.codingTestErrors || [])"), []);
});
