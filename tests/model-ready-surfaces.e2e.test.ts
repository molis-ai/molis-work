import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * A page that showed "no text model yet" reads the model again when the settings page announces the first one
 * (molis-work:model-ready), instead of keeping what it loaded: the person who comes back from the model settings sees
 * the page agree with the toast. One test per surface, each opened with no model, then a model that can run is saved
 * the way an API caller saves one (no check, nothing leaves the machine) and the announcement is sent.
 */

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

async function open(t: Parameters<typeof openGoalBrowser>[0], plugin: string): Promise<(Browser & {child: Awaited<ReturnType<typeof pluginFrameBrowser>>; cognia: Awaited<ReturnType<typeof pluginFrameBrowser>>}) | null> {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  const { command, sessionId, navigate, waitFor, origin, projectId } = browser;
  const child=await pluginFrameBrowser(t,browser,plugin), cognia=await pluginFrameBrowser(t,browser,"cognia");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?desktop=1&openPlugin=${plugin}` }, sessionId));
  await waitFor(`document.body.dataset.desktopSurface === ${JSON.stringify(plugin)}`, 15_000);
  await browser.surfaceReady(plugin);
  return {...browser,child,cognia};
}

/** A provider with a key behind a connection, so a Run could use it; then the announcement the settings page sends. */
async function firstModelIsReady({ evaluate }: Browser) {
  const saved = await evaluate<{ status: number; text: string }>(`(async () => {
    const response = await fetch('/api/settings/models/surface-fixture', { method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({
      display_name: '测试供应商', base_url: 'https://provider.invalid/v1', api_format: 'openai-chat-completions', enabled: true, prompt_cache: 'off',
      models: [{ model_id: 'm', enabled: true }], api_key: 'surface-fixture-key-0123456789' }) });
    return { status: response.status, text: await response.text() }; })()`);
  assert.equal(saved.status, 200, saved.text);
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:model-ready'))");
}

for (const [plugin, button] of [["dataset", "[data-dataset-generate-ai]"], ["form", "[data-form-generate-ai]"], ["ppt", "[data-ppt-outline-mode=ai]"]] as const) {
  test(`${plugin}: the model action turns on when the first model is ready`, { timeout: 60_000 }, async t => {
    const browser = await open(t, plugin);
    if (!browser) return;
    const { evaluate, waitFor } = browser.child;
    await waitFor(`document.querySelector(${JSON.stringify(button)})?.disabled === true`, 15_000);
    await firstModelIsReady(browser);
    await waitFor(`document.querySelector(${JSON.stringify(button)}).disabled === false`, 10_000);
    assert.equal(await evaluate("document.querySelector('[data-dataset-ai-reason], [data-form-ai-reason], [data-ppt-outline-ai-reason]')?.hidden ?? true"), true, "the reason that no model exists is gone");
  });
}

test("cognia: the link to the settings goes and the model actions turn on", { timeout: 60_000 }, async t => {
  const browser = await open(t, "cognia");
  if (!browser) return;
  const { evaluate, waitFor } = browser.child;
  await waitFor("document.querySelector('[data-cognia-action=model-settings]') && !document.querySelector('[data-cognia-action=model-settings]').hidden", 15_000);
  await firstModelIsReady(browser);
  await waitFor("document.querySelector('[data-cognia-action=model-settings]').hidden", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-cognia-action=synthesize]').disabled"), false);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-cognia-model]').textContent"), /尚未配置文字模型/);
});

test("workflows: an AI handoff stops saying the model is missing", { timeout: 90_000 }, async t => {
  const browser = await open(t, "workflows");
  if (!browser) return;
  const { evaluate, waitFor, click } = browser.child;
  await waitFor("document.querySelector('[data-wf-action=new]')", 15_000);
  await click("[data-wf-action=new]");
  await waitFor("document.querySelector('[data-wf-title]')");
  await click("[data-wf-action=append][data-wf-plugin=feed]");
  await click("[data-wf-action=append][data-wf-plugin=pages]");
  await waitFor("document.querySelectorAll('[data-wf-station]').length === 2");
  await click("[data-wf-action=link][data-link='0']");
  await click("[data-wf-action=kind][data-kind=ai]");
  await waitFor("document.querySelector('[data-wf-link-field=instructions]')");
  await evaluate(`(() => { const field = document.querySelector('[data-wf-link-field=instructions]');
    field.value = '整理成一页说明'; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('[data-wf-readiness]')?.dataset.ready === 'false' && /还没有可用的文字模型/.test(document.querySelector('[data-wf-readiness]').textContent)", 10_000);
  // The way to the settings is the page's own return trip (specs/draft-and-return §4), not an address.
  assert.equal(await evaluate("Boolean(document.querySelector('[data-wf-readiness] button[data-wf-action=model-settings]'))"), true, "the way to the settings is offered while the model is missing");
  await firstModelIsReady(browser);
  await waitFor("document.querySelector('[data-wf-readiness]')?.dataset.ready === 'true'", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-wf-readiness] [data-wf-action=model-settings]')"), null, "the way to the settings is gone with the problem");
});

const CLIENTS_READY = `!document.querySelector('[data-ui-client-state="loading"]')
  && ![...document.querySelectorAll('[data-deferred-surface]')].some(surface => !surface.closest('[hidden]') && surface.dataset.uiClientState !== 'failed')`;

// Every project has an output (batch 05, SSC-17: the default one is made on the first run), so the Host always reports a folder. To show
// the folder hint beside the model one, the page's readiness answer says the folder is missing; the model half stays the Host's own.
const NO_FOLDER = `if (!window.realFetch) { window.realFetch = window.fetch; window.fetch = async (url, options) => {
  const answer = await window.realFetch(url, options);
  if (!String(url).endsWith('/api/plugins/io.molis.work.schedule/readiness') || !answer.ok) return answer;
  return new Response(JSON.stringify({ ...await answer.json(), workspace: false }), { status: 200, headers: { 'content-type': 'application/json' } }); }; }`;

async function openScheduleDialog({ waitFor, click }: Pick<Awaited<ReturnType<typeof pluginFrameBrowser>>, "waitFor" | "click">, page: { evaluate: (expression: string) => Promise<unknown> }) {
  await page.evaluate(NO_FOLDER);
  await waitFor(`document.querySelector('[data-schedule-new]') && ${CLIENTS_READY}`, 20_000);
  await click("[data-schedule-new]");
  const shown = (kind: string) => `(() => { const hint = document.querySelector('[data-schedule-hint="${kind}"]'); return Boolean(hint) && !hint.hidden && hint.getClientRects().length > 0; })()`;
  await waitFor(`${shown("model")} && ${shown("workspace")}`, 20_000);
}

test("schedule: the new-task form's model hint goes when the first model is ready, and its links lead to where each is fixed", { timeout: 90_000 }, async t => {
  const browser = await open(t, "schedule");
  if (!browser) return;
  const {projectId}=browser;
  const {evaluate,waitFor}=browser.child;
  await openScheduleDialog(browser.child, browser);
  // The desktop page adds ?desktop=1 to the links it serves; where each one goes is the path.
  const linkPath = (kind: string) => evaluate<string | null>(`(() => { const link = document.querySelector('[data-schedule-hint=${kind}] a'); return link && new URL(link.getAttribute('href'), ${JSON.stringify(browser.origin)}).pathname; })()`);
  assert.equal(await linkPath("model"), "/settings/models", "a plain link to the model settings");
  assert.equal(await linkPath("workspace"), `/projects/${projectId}/settings/workspaces`, "and to where this project's folder is bound");
  // The hint is a grid (.mw-alert): a link beside its sentence in the grid would drop to its own row and stretch to the full width,
  // so its hit area and focus ring would cover the line. The link must be only its own words, and never broken across two lines.
  const linkBox = (kind: string) => evaluate<{ box: number; text: number; line: number; fragments: number }>(`(() => { const hint = document.querySelector('[data-schedule-hint=${kind}]'); const link = hint.querySelector('a');
    const words = document.createRange(); words.selectNodeContents(link);
    return { box: Math.round(link.getBoundingClientRect().width), text: Math.round(words.getBoundingClientRect().width), line: Math.round(hint.getBoundingClientRect().width), fragments: words.getClientRects().length }; })()`);
  for (const kind of ["model", "workspace"]) {
    const { box, text, line, fragments } = await linkBox(kind);
    assert.ok(text > 0 && text < line / 2, `${kind}: the link text (${text}px) is a few words of the ${line}px hint`);
    assert.ok(Math.abs(box - text) <= 1, `${kind}: the link's box (${box}px) is its own text (${text}px), not the row`);
    assert.equal(fragments, 1, `${kind}: the link is on one line, not broken in the middle of its words`);
  }
  // Two hints one under the other sit a form-gap apart (12px): a paragraph's default margins would add 26px to it.
  assert.ok(await evaluate<number>(`(() => { const top = document.querySelector('[data-schedule-hint=model]').getBoundingClientRect(), next = document.querySelector('[data-schedule-hint=workspace]').getBoundingClientRect(); return Math.round(next.top - top.bottom); })()`) <= 16, "the hints are a form-gap apart");
  // The model is set up somewhere else (another pane, another tab) while the form stays open.
  await firstModelIsReady(browser);
  await waitFor("document.querySelector('[data-schedule-hint=model]').hidden", 10_000);
  assert.equal(await evaluate("!document.querySelector('[data-schedule-hint=workspace]').hidden && !document.querySelector('[data-schedule-create-pane]').hidden"), true, "the folder is still missing, and the person's form is still there");
  assert.equal(await evaluate("document.querySelector('[data-schedule-create-form] [type=submit]').disabled"), false, "and creating was never blocked");
  // The project settings open over the page. The form is part of the page, not a dialog over it (batch 18: no dialog), so it stays
  // where it is, with what the person wrote, under the settings.
  await evaluate("document.querySelector('[data-schedule-hint=workspace] a').click()");
  await browser.waitFor("document.body.dataset.desktopSurface === 'project-settings'",10_000);
  assert.equal(await evaluate("document.querySelectorAll(':modal').length"), 0, "nothing modal is over the settings");
  assert.equal(await evaluate("!document.querySelector('[data-schedule-create-pane]').hidden"), true, "and the form waits under them");
});

test("schedule: the model link opens the model settings with nothing modal over them, and the form waits under them", { timeout: 90_000 }, async t => {
  const browser = await open(t, "schedule");
  if (!browser) return;
  const { evaluate } = browser.child;
  await openScheduleDialog(browser.child, browser);
  await evaluate("document.querySelector('[data-schedule-hint=model] a').click()");
  await browser.waitFor("document.body.dataset.desktopSurface === 'settings'",10_000);
  assert.equal(await evaluate("document.querySelectorAll(':modal').length"), 0, "nothing modal is over the settings");
  assert.equal(await evaluate("!document.querySelector('[data-schedule-create-pane]').hidden"), true, "and the form waits under them");
});

test("plugin builder studio: the empty model list and the link to the settings are read again", { timeout: 90_000 }, async t => {
  const browser = await open(t, "plugin-builder");
  if (!browser) return;
  const { evaluate, waitFor } = browser.child;
  const studio = "document.querySelector('[data-work-surface=plugin-builder]')";
  await waitFor(`${studio}.querySelector('[data-as-model-setup]') && !${studio}.querySelector('[data-as-model-setup]').hidden`, 15_000);
  assert.equal(await evaluate(`${studio}.querySelector('[data-as-model]').options.length`), 1, "only the prompt to choose a model");
  await firstModelIsReady(browser);
  await waitFor(`${studio}.querySelector('[data-as-model-setup]').hidden`, 10_000);
  assert.equal(await evaluate(`[...${studio}.querySelector('[data-as-model]').options].some(option => option.value.startsWith('surface-fixture'))`), true, "the new provider is offered");
  assert.match(await evaluate<string>(`${studio}.querySelector('[data-as-model-note]').textContent`), /请选择构建使用的模型/, "the studio still asks the person to choose which model builds: the choice is theirs");
});
