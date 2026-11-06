import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

/**
 * The model settings page's first key as plan A says it (specs/assistant-service-connections §13.1, batch 13 ④b), against a stand-in
 * provider on 127.0.0.1: a refused key is said under the key field and nothing is saved; a 429 says it is the service's (too many
 * requests or out of credit) and when it checks again; the right key saves and the provider reads as its four rows. The page is
 * shot at the three widths, in both languages and both schemes, for review.
 */

const good = "stand-in-good-key-0123456789", wrong = "stand-in-wrong-key-0123456789", throttled = "stand-in-throttled-key-0123456789";

test("ASC-62 the first key: refused under its field, rate limited with when it checks again, then four plain rows", { timeout: 120_000 }, async (t) => {
  const standIn = await startModelStandIn(good, "MOLIS_OK", { throttledKey: throttled });
  t.after(() => standIn.close());
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  const shots = reviewEvidenceUrl("model-settings-plan-a/");
  await mkdir(shots, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(`${name}.png`, shots),
    Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId)).data, "base64"));
  const size = (width: number) => command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
  const scheme = (value: "light" | "dark") => command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }, { name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const open = async (query: string, lang = "zh") => {
    await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=${lang}&next=${encodeURIComponent(`/settings/models${query}`)}` }, sessionId));
    await waitFor("document.querySelector('[data-model-settings]')", 10_000);
  };
  const providers = async () => ((await (await fetch(`${origin}/api/settings/models`)).json()) as { providers: unknown[] }).providers;
  await size(1440); await scheme("light");

  await open("?new=1&template=deepseek");
  assert.equal(await evaluate("document.querySelector('.model-advanced').open"), false, "高级 starts folded");
  assert.match(await evaluate<string>("document.querySelector('[data-model-key-field]').textContent"), /platform\.deepseek\.com/, "the key field says where to get one");
  await shot("1-draft-1440-light-zh");
  await setValue("[data-model-base-url]", standIn.baseUrl);

  // A refused key: said under the field, the steps stop at the key, nothing is saved, and the key stays typed.
  await setValue("[data-model-api-key]", wrong);
  await click("[data-model-save]");
  await waitFor("document.querySelector('[data-model-key-error]')", 20_000);
  assert.deepEqual(await evaluate(`(() => { const key = document.querySelector('[data-model-api-key]'), error = document.querySelector('[data-model-key-error]');
    return { invalid: key.getAttribute('aria-invalid'), under: key.closest('[data-model-key-field]').contains(error), role: error.getAttribute('role'),
      said: /拒绝了这把密钥/.test(error.textContent) && /还没保存/.test(error.textContent), kept: key.value === ${JSON.stringify(wrong)},
      step: document.querySelector('[data-connection-progress]').dataset.state, focus: document.activeElement === key }; })()`),
  { invalid: "true", under: true, role: "alert", said: true, kept: true, step: "failed", focus: true });
  assert.deepEqual(await providers(), []);
  await shot("2-key-refused-1440-light-zh");

  // Changing the key clears what was said about the old one.
  await setValue("[data-model-api-key]", throttled);
  assert.equal(await evaluate("document.querySelector('[data-model-key-error]')"), null);
  // A 429: the service's side, both causes, and when it checks again by itself; still nothing saved.
  await click("[data-model-save]");
  await waitFor("!document.querySelector('[data-model-limited]').hidden", 30_000);
  const limited = await evaluate<{ title: string; body: string; step: string }>(`({ title: document.querySelector('[data-model-limited] strong').textContent,
    body: document.querySelector('[data-model-limited] p').textContent, step: document.querySelector('[data-connection-progress]').dataset.state })`);
  assert.match(limited.title, /请求太多或额度用完/);
  assert.match(limited.body, /服务那边的原因[\s\S]*约 1 分钟后（[^）]+）自动再查一次/);
  assert.equal(limited.step, "hold");
  assert.deepEqual(await providers(), []);
  await scheme("dark"); await shot("3-rate-limited-1440-dark-zh"); await scheme("light");

  // The right key: saved after the check; the provider then reads as its four rows, checked just now.
  await setValue("[data-model-api-key]", good);
  await click("[data-model-save]");
  await waitFor("/连接检查通过/.test(document.querySelector('[data-model-status]')?.textContent || '')", 20_000);
  const id = ((await providers())[0] as { provider_id: string }).provider_id;
  for (const [width, lang, mode] of [[1440, "zh", "light"], [1024, "en", "light"], [390, "zh", "dark"], [390, "en", "light"]] as const) {
    await size(width); await scheme(mode);
    await open(`?provider=${encodeURIComponent(id)}`, lang);
    await waitFor("document.querySelector('.model-facts')");
    const page = await evaluate<{ rows: number; reach: string; overflow: boolean; cut: string[]; leaked: boolean }>(`({ rows: document.querySelectorAll('.model-facts .settings-setting-row').length,
      reach: document.querySelectorAll('.model-facts .settings-setting-row')[1].textContent, overflow: document.documentElement.scrollWidth > innerWidth,
      cut: [...document.querySelectorAll('.model-facts .setting-value > *')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent),
      leaked: document.documentElement.outerHTML.includes(${JSON.stringify(good)}) })`);
    assert.equal(page.rows, 4);
    assert.match(page.reach, lang === "zh" ? /连得上 · \d\d-\d\d \d\d:\d\d 检查/ : /Reachable · checked \d\d-\d\d \d\d:\d\d/);
    assert.equal(page.overflow, false, `no horizontal scrolling at ${width}`);
    assert.deepEqual(page.cut, [], `every fact is read whole at ${width} (${lang}): a narrow card stacks its rows instead of cutting the value`);
    assert.equal(page.leaked, false, "the key is nowhere in the page");
    await shot(`4-saved-${width}-${mode}-${lang}`);
  }
  await size(1440); await scheme("light"); await open(`?provider=${encodeURIComponent(id)}`);
  await click(".model-advanced > summary");
  await evaluate("document.querySelector('.model-advanced').scrollIntoView({ block: 'start' })");
  await shot("5-advanced-open-1440-light-zh");
  assert.match(await evaluate<string>("document.querySelector('.model-diagnostics').textContent"), /connected/, "the raw check is in 高级");
  await open(`?new=1&template=deepseek`, "en"); await size(390); await shot("6-draft-390-light-en");
});
