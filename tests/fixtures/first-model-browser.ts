import type { openGoalBrowser } from "./goal-browser.js";

/** The key the stand-in provider (model-stand-in.ts) accepts in the browser journeys. */
export const standInKey = "stand-in-good-key-0123456789";

export type GoalBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;

/**
 * On the model settings page with no provider: pick the DeepSeek template, point it at the stand-in provider, type its
 * key and press save. Resolves once save is pressed; the caller waits for what it expects to happen.
 */
export async function saveFirstModel(browser: GoalBrowser, baseUrl: string) {
  const { evaluate, waitFor, click } = browser;
  const setValue = (selector: string, value: string) => evaluate(`(() => { const field = document.querySelector(${JSON.stringify(selector)});
    field.value = ${JSON.stringify(value)}; field.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelector('[data-model-settings] [data-model-template]')", 15_000);
  await click("[data-model-settings] [data-model-template=deepseek]");
  await waitFor("document.querySelector('[data-model-base-url]')?.value === 'https://api.deepseek.com'");
  await setValue("[data-model-base-url]", baseUrl);
  await setValue("[data-model-api-key]", standInKey);
  await click("[data-model-save]");
}
