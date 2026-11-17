import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * specs/proactive-assistant/resident-runtime-design.md §4, §5: what runs on its own here, on the pages that show it.
 *
 * The desktop is faked in the page (`__TAURI__`): 设置 › 运行 changes its two switches through it. The Home page asks the Host
 * through the shared request client; its two runtime routes are answered by a stub here, since the overview's assembly from the
 * owners is RES-05 (`tests/runtime-overview.test.ts`). The native half — which windows may call these commands — is in the
 * Rust tests. The capsule's 「运行」 section and its quit confirmation (RES-09, RES-10's capsule half) were deleted with the
 * capsule (specs/plugin-equal-standing PEQ-13); their tests went with them.
 */

const NOW = Date.now();
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();
const source = (provider: string, title: string, scope: string | null = "p1") => ({ scope_project_id: scope, provider_id: provider, surface: provider, title });
const run = (id: string, hours: number, extra: Record<string, unknown> = {}) =>
  ({ run_id: id, title: `任务 ${id}`, due_at: at(hours), project_id: "p1", needs: [], source: source("schedule", "定时任务"), ...extra });
const missed = (id: string, hours: number, provider = "schedule", scope: string | null = "p1") =>
  ({ ...run(id, hours), missed_at: at(-0.1), source: source(provider, provider === "assistant" ? "助理定时" : "定时任务", scope) });

const OVERVIEW = {
  state: "running", waiting: { network: false, model: true },
  gaps: [{ from: at(-8), to: at(-1), cause: "sleep" }],
  upcoming: [run("u1", 1), run("u2", 2, { needs: ["model"], waiting: true }), run("u3", 3), run("u4", 4), run("u5", 5), run("u6", 6), run("u7", 30)],
  missed: [missed("m1", -3), missed("followup:a:1", -2, "assistant", null)],
  unavailable_sources: [],
};

/** The desktop, faked: every command is recorded; the next settings write can be refused. */
const FAKE_DESKTOP = `(() => {
  if (new URLSearchParams(location.search).get("desktop") !== "1") return;
  const calls = []; let refuseNextSet = false;
  let settings = { launch_at_login: false, keep_running: true };
  Object.assign(globalThis, { __calls: calls, __refuseNextSet: () => { refuseNextSet = true; } });
  globalThis.__TAURI__ = { core: { invoke: async (command, args) => {
    calls.push([command, args ?? null]);
    if (command === "runtime_settings_get") return settings;
    if (command === "runtime_settings_set") {
      if (refuseNextSet) { refuseNextSet = false; throw "系统没有改成"; }
      settings = { ...settings, [args.key]: args.value }; return settings;
    }
    return null;
  } } };
})();`;

/** The Home page's two runtime routes, answered here; every other request goes to the Host. */
const STUB_HOME_ROUTES = `(() => {
  if (location.pathname !== "/") return;
  const posted = []; let overview = ${JSON.stringify({ ...OVERVIEW, missed: [missed("m1", -3)] })};
  globalThis.__posted = posted;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.origin);
    const answer = body => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.pathname === "/api/runtime/overview") return answer(overview);
    if (url.pathname === "/api/runtime/runs/decide") {
      const body = JSON.parse(init.body); posted.push({ body, key: new Headers(init.headers).get("x-molis-work-idempotency-key") });
      overview = { ...overview, missed: overview.missed.filter(row => row.run_id !== body.run_id) };
      return answer({ state: "skipped" });
    }
    return original(input, init);
  };
})();`;

const calls = (name: string) => `globalThis.__calls.filter(([command]) => command === ${JSON.stringify(name)})`;

test("RES-10 RES-11 the Home's missed notice and 设置 › 运行", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `${FAKE_DESKTOP}\n${STUB_HOME_ROUTES}` }, sessionId);
  const text = (key: string, values: Record<string, string | number> = {}) => evaluate<string>(`globalThis.t.text(${JSON.stringify(`workbench.runtime-panel.${key}`)}, ${JSON.stringify(values)})`);

  // ---- RES-10: the Home's notice of what was missed, through the Host's routes ----
  await navigate(() => command("Page.navigate", { url: `${origin}/` }, sessionId));
  await waitFor(`document.querySelector('[data-runtime-panel][data-mode=home]:not([hidden]) [data-runtime-row="m1"]')`);
  assert.equal(await evaluate(`document.querySelector('[data-runtime-panel] .mw-alert--warning strong').textContent`), await text("missed-during-sleep", { count: 1 }));
  assert.equal(await evaluate(`document.querySelector('[data-runtime-row="m1"] [data-runtime-decide="run_now"]').className.includes('mw-btn--primary')`), true);
  assert.equal(await evaluate(`document.querySelector('[data-runtime-row="m1"] [data-runtime-decide="skip"]').className.includes('mw-btn--secondary')`), true, "跳过 is the quiet one");
  await evaluate(`document.querySelector('[data-runtime-row="m1"] [data-runtime-decide="skip"]').click()`);
  await waitFor(`document.querySelector('[data-runtime-panel] .mw-alert--success')`);
  assert.deepEqual(await evaluate(`globalThis.__posted.map(entry => entry.body)`), [{ scope_project_id: "p1", provider_id: "schedule", run_id: "m1", decision: "skip" }]);
  assert.equal(await evaluate(`typeof globalThis.__posted[0].key === "string" && globalThis.__posted[0].key.length > 0`), true, "sent as every page's writes are, with a one-time key");

  // ---- RES-11: 设置 › 运行 is the desktop's ----
  await navigate(() => command("Page.navigate", { url: `${origin}/settings/running` }, sessionId));
  const listed = `!!document.querySelector('[data-directory-panel=settings] [data-settings-section=running]')`;
  const shown = (selector: string) => `!document.querySelector('[data-running-settings] ${selector}').closest('[hidden]')`;
  await waitFor(`document.querySelector('[data-running-settings]')`);
  assert.equal(await evaluate(shown("[data-running-elsewhere]")), true, "in a browser the page says where the switches are");
  assert.equal(await evaluate(shown("[data-running-setting]")), false, "and has none");
  assert.equal(await evaluate(listed), false, "nor is it listed");
  await navigate(() => command("Page.navigate", { url: `${origin}/settings/running?desktop=1` }, sessionId));
  await waitFor(`document.querySelector('[data-running-setting=keep_running]')?.disabled === false`);
  assert.equal(await evaluate(listed), true, "listed in the desktop");
  assert.equal(await evaluate(shown("[data-running-elsewhere]")), false);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-running-setting]')].map(toggle => [toggle.dataset.runningSetting, toggle.checked])`),
    [["launch_at_login", false], ["keep_running", true]], "read from the desktop each time the page opens");
  await evaluate(`document.querySelector('[data-running-setting=launch_at_login]').click()`);
  await waitFor(`${calls("runtime_settings_set")}.length === 1 && document.querySelector('[data-running-setting=launch_at_login]').disabled === false`);
  assert.deepEqual(await evaluate(`${calls("runtime_settings_set")}[0][1]`), { key: "launch_at_login", value: true });
  assert.equal(await evaluate(`document.querySelector('[data-running-setting=launch_at_login]').checked`), true);
  await evaluate(`globalThis.__refuseNextSet(); document.querySelector('[data-running-setting=keep_running]').click()`);
  await waitFor(`!document.querySelector('[data-running-error]').hidden`);
  assert.equal(await evaluate(`document.querySelector('[data-running-setting=keep_running]').checked`), true, "a refusal puts the switch back");
});
