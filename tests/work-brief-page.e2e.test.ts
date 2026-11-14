import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { RISK_WRITE, riskActions, type RiskRecord } from "@molis-ai/molis-work-plugin-risk";
import { WORK_BRIEF_WRITE, workBriefActions, type BriefSaved } from "@molis-ai/molis-work-plugin-work-brief";
import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { person } from "./fixtures/home-runtime.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

/**
 * Work Brief as a person meets it (docs/design/work-brief-core): with the plugin in the project the brief fills the project's home;
 * its sentences show what they stood on, a refresh reports only what changed, the person's own change survives a new draft, a
 * version can be fixed, a next step runs once, and the basic home is one press away.
 */
const WIDTHS = (process.env.WB_WIDTHS ?? "1440,1024,390").split(",").map(Number);
const ref = (definition: { capability_id: string; version: number }) => ({ capability_id: definition.capability_id, version: definition.version });

for (const width of WIDTHS) test(`WBR-02 WBR-22 WBR-25 WBR-27 the brief on the project's home at ${width}px: bases, refresh, edit, proposal, versions, next steps, basic home`, { timeout: 240_000 }, async t => {
  // A Host of its own (no model): the test seeds the brief through the same actions the Assistant uses.
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, web, localHost, databasePath } = browser;
  for (const plugin_id of ["risk", "work-brief"]) await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id, expected_revision: await projectPluginRevision(web, projectId) });
  const client = localHost!.actionClient(molisWorkHostProjectReference({ databasePath, projectId }));
  const me: ActionCallContext = person([...RISK_WRITE, ...WORK_BRIEF_WRITE, "artifact:write", "artifact:read"], projectId);
  const call = <O>(definition: { capability_id: string; version: number }, input: unknown, who = me) => client.invoke(who, ref(definition), input) as Promise<O>;
  const risk = async (title: string) => (await call<{ risk: RiskRecord }>(riskActions.create, { title, statement: "关键部件可能晚两周到货", impact: "high", likelihood: "medium" })).risk;
  const supplier = await risk("供应商延期"), rate = await risk("汇率波动");
  const views = await client.discover(me);
  const exact = (definition: { capability_id: string; version: number }) => {
    const view = views.find(row => row.capability_id === definition.capability_id && row.version === definition.version)!;
    return { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  };
  const cite = { kind: "risk", id: supplier.risk_id }, other = { kind: "risk", id: rate.risk_id };
  const assistant: ActionCallContext = { ...me, audience: "agent" };
  const draft = (first: string) => ({ claims: [{ text: first, cites: [cite] }, { text: "汇率在可控范围内，本周没有新的敞口。", cites: [other, cite] }, { text: "预算我已经和财务口头确认过。", supplied_by: "owner" }],
    attention: [{ subject: cite, why: "要决定是否换备选供应商" }],
    next: [{ text: "记一笔：已联系备选供应商", why: "让风险记录跟上进展", subject: cite, act: { kind: "action", reference: exact(riskActions.addNote), input: { risk_id: supplier.risk_id, text: "已联系备选供应商" } } },
      { text: "起草备选供应商的对比", why: "还没有可比的方案", act: { kind: "assistant" } }] });
  const first = await call<BriefSaved>(workBriefActions.save, { request_id: `first-${width}`, draft: draft("交付有延期风险，关键部件可能晚两周。") }, assistant);
  assert.equal(first.version!.version, 1);

  const output = new URL(`../${specEvidenceDirectory("specs/work-brief/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`brief-${name}-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  // The project's own address, no plugin named: the home shows, and the brief is what fills it.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await browser.waitFor("document.querySelector('[data-home-lead]') && !document.querySelector('[data-home-lead]').hidden && document.querySelector('[data-home-lead] iframe[data-plugin-frame]')");
  const page = await pluginFrameBrowser(t, browser, "work-brief");
  const { evaluate, waitFor, click } = page;
  const noOverflow = async () => assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "页面不应横向滚动");
  const act = (name: string, value?: string) => `[data-wb-act="${name}"]${value === undefined ? "" : `[data-wb-value="${value}"]`}`;
  const has = (selector: string) => `document.querySelector(${JSON.stringify(selector)})`;
  const words = (selector: string) => evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(selector)})].map(node => node.textContent.trim())`);
  const settled = () => waitFor("!document.querySelector('[aria-busy=true]') && !document.querySelector('.wb-frame [data-wb-act][disabled]')");
  await waitFor("document.querySelectorAll('.wb-claims > li').length === 3");
  // Each basis and each thing waiting is a place the shell fills; the page holds no copy of the risk.
  await waitFor("[...document.querySelectorAll('.wb-att [data-wb-slot]')].every(node => node.getBoundingClientRect().height > 40)");
  assert.deepEqual(await words(".wb-fn"), ["1.1", "2.1", "2.2"], "每句话后面是它的依据，口述的那句没有");
  assert.doesNotMatch((await words(".wb-pulse > li")).join(" "), /未授权|读不到/u, "本人读得到的来源照实显示");
  assert.match((await words(".wb-pulse > li")).join(" "), /风险/u);
  await noOverflow();
  await screenshot("home");

  // A basis opens where the sentence is, with what it read then.
  await click('.wb-fn[data-wb-value$=":0"]');
  await waitFor(has(".wb-pop .mw-preview-card, .wb-pop [data-wb-slot]"));
  assert.match((await words(".wb-pop")).join(""), /供应商延期/u);
  await waitFor("document.querySelector('.wb-pop [data-wb-slot]').getBoundingClientRect().height > 20");
  await noOverflow();
  await screenshot("cite");
  await evaluate("document.querySelector('.wb-frame').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await waitFor(`!${has(".wb-pop")}`);

  // WBR-10 a refresh reports only what changed: a new risk makes a second version, a second press makes none.
  await risk("新的合规要求");
  await click(act("refresh"));
  await waitFor(`${has(".mw-alert")} && ${has(act("pop", "ver"))}.textContent.includes("2")`, 30_000);
  await settled();
  await screenshot("refreshed");
  await click(act("refresh"));
  await settled();
  await waitFor(`${has(act("pop", "ver"))}.textContent.includes("2")`);
  assert.equal((await call<{ versions: unknown[] }>(workBriefActions.get, {})).versions.length, 2, "没有变化的刷新不存新版本");

  // WBR-07 the person rewords a sentence in place; it is marked as theirs and keeps its basis.
  const claimId = first.version!.claims[0]!.claim_id;
  await click(act("edit-claim", claimId));
  await waitFor(has('form[data-wb-form="claim"] textarea'));
  await evaluate(`(() => { const area = document.querySelector('form[data-wb-form="claim"] textarea'); area.value = "交付会晚两周，已在找备选。"; area.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await noOverflow();
  await screenshot("editing");
  await click(act("save-claim"));
  await waitFor("document.querySelector('.wb-claims > li')?.textContent.includes('交付会晚两周，已在找备选。')");
  await settled();

  // WBR-05 a draft that words that sentence differently waits; the person keeps their own and takes the rest.
  const waiting = await call<BriefSaved>(workBriefActions.save, { request_id: `second-${width}`, draft: { ...draft("交付没有风险。"),
    claims: draft("交付没有风险。").claims.map((claim, index) => ({ ...claim, claim_id: first.version!.claims[index]!.claim_id })) } }, assistant);
  assert.equal(waiting.proposal!.conflicts.length, 1);
  await evaluate(`window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { capability_id: "work-brief.briefs.save" } }))`);
  await waitFor(has(".wb-conflict"));
  await noOverflow();
  await screenshot("proposal");
  await click('.wb-conflict .wb-actions [data-wb-act="pick"]:first-child');
  await waitFor(`!${has(`${act("resolve")}[disabled]`)}`);
  await click(act("resolve"));
  await waitFor(`!${has(".wb-conflict")}`);
  await settled();
  assert.match((await words(".wb-claims > li"))[0]!, /交付会晚两周，已在找备选。/u);

  // WBR-04 WBR-27 an older version reads as it was, says what it is now, and can be fixed.
  await click(act("pop", "ver"));
  await waitFor(has(act("version", "1")));
  await screenshot("versions");
  await click(act("version", "1"));
  await waitFor(has(act("then-now", "now")));
  assert.match((await words(".wb-claims > li"))[0]!, /交付有延期风险/u);
  await click(act("then-now", "now"));
  await waitFor(has(".wb-now"));
  await noOverflow();
  await screenshot("old");
  await click(act("pop", "ver"));
  await waitFor(has(act("fix", "1")));
  await click(act("fix", "1"));
  await waitFor(`${has(act("pop", "ver"))}.textContent.includes(${JSON.stringify(width ? "已固定" : "")})`, 30_000);
  await click(act("back"));
  await waitFor(`!${has(act("then-now", "now"))}`);

  // WBR-06 a next step runs once as the person, on the risk itself; the other goes to the Assistant.
  const steps = (await call<{ version: { next: { option_id: string }[] } }>(workBriefActions.get, {})).version.next;
  await click(act("run-next", steps[0]!.option_id));
  await waitFor(`!${has(act("run-next", steps[0]!.option_id))}`, 30_000);
  assert.equal((await call<{ marks: { state: string }[] }>(workBriefActions.get, {})).marks[0]!.state, "done");
  await settled();
  assert.equal(await evaluate(`Boolean(${has(act("run-next", steps[0]!.option_id))})`), false, "做过的一步不能再点");
  await evaluate("document.querySelector('#wb-next').scrollIntoView({ block: 'start' })");
  await noOverflow();
  await screenshot("next");

  // WBR-24 the person's own items across projects, each saying where it is from.
  await click(act("mode", "personal"));
  await waitFor(`${has(".wb-personal")} || ${has(".mw-empty")}`, 30_000);
  await noOverflow();
  await screenshot("personal");
  await click(act("mode", "project"));
  await waitFor(has(".wb-claims"));

  // WBR-22 the basic home is one press away, and so is the way back.
  const toggle = "document.querySelector('[data-home-control=\"lead-toggle\"]')";
  await browser.waitFor(toggle);
  await browser.evaluate(`${toggle}.click()`);
  await browser.waitFor("document.querySelector('[data-home-lead]').hidden");
  await screenshot("basic");
  await browser.evaluate(`${toggle}.click()`);
  await browser.waitFor("!document.querySelector('[data-home-lead]').hidden");
});

for (const width of WIDTHS) test(`WBR-26 the brief in English on the dark theme at ${width}px: the page's words change, the person's sentences stay`, { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, web, localHost, databasePath } = browser;
  for (const plugin_id of ["risk", "work-brief"]) await web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id, expected_revision: await projectPluginRevision(web, projectId) });
  const client = localHost!.actionClient(molisWorkHostProjectReference({ databasePath, projectId }));
  const me: ActionCallContext = person([...RISK_WRITE, ...WORK_BRIEF_WRITE], projectId);
  const supplier = (await client.invoke(me, ref(riskActions.create), { title: "Supplier delay", statement: "A key part may arrive two weeks late", impact: "high", likelihood: "medium" }) as { risk: RiskRecord }).risk;
  const cite = { kind: "risk", id: supplier.risk_id };
  await client.invoke({ ...me, audience: "agent" }, ref(workBriefActions.save), { request_id: `english-${width}`, draft: { claims: [{ text: "交付有延期风险，关键部件可能晚两周。", cites: [cite] }, { text: "预算我已经和财务口头确认过。", supplied_by: "owner" }],
    attention: [{ subject: cite, why: "要决定是否换备选供应商" }], next: [{ text: "起草备选供应商的对比", why: "还没有可比的方案", act: { kind: "assistant" } }] } });
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${projectId}/`)}` }, sessionId));
  await browser.waitFor("document.documentElement.lang === 'en' && document.documentElement.dataset.resolvedTheme === 'dark' && document.querySelector('[data-home-lead] iframe[data-plugin-frame]')");
  const page = await pluginFrameBrowser(t, browser, "work-brief");
  await page.waitFor("document.querySelectorAll('.wb-claims > li').length === 2 && [...document.querySelectorAll('.wb-att [data-wb-slot]')].every(node => node.getBoundingClientRect().height > 20)");
  assert.match(await page.evaluate<string>(`document.querySelector('[data-wb-act="refresh"]').textContent`), /Refresh/u);
  assert.match(await page.evaluate<string>("document.querySelector('.wb-claims > li').textContent"), /交付有延期风险/u);
  assert.ok(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "the English page must not scroll sideways");
  const output = new URL(`../${specEvidenceDirectory("specs/work-brief/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  await browser.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`brief-home-en-dark-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
});
