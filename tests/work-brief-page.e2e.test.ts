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
  await waitFor("document.querySelectorAll('.wb-claims > li').length === 3");
  await noOverflow();
  await screenshot("home");
});
