import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/**
 * specs/proactive-assistant/resident-runtime-design.md §4, §5: what runs on its own here, on the pages that show it.
 *
 * The desktop is faked in the page (`__TAURI__`): the capsule reads and decides through it, and 设置 › 运行 changes its two
 * switches through it. The Home page asks the Host through the shared request client; its two runtime routes are answered by
 * a stub here, since the overview's assembly from the owners is RES-05 (`tests/runtime-overview.test.ts`). The native half —
 * which windows and pages may call these commands, the quit flow, the tray's dot — is in the Rust tests (`res08_…`–`res11_…`).
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

/** The desktop, faked: every command is recorded; the overview can be swapped or taken away (the Host stopped answering). */
const FAKE_DESKTOP = `(() => {
  if (!(location.pathname === "/desktop/capsule" || new URLSearchParams(location.search).get("desktop") === "1")) return;
  const calls = []; let overview = ${JSON.stringify(OVERVIEW)}; let refuseNextSet = false;
  let settings = { launch_at_login: false, keep_running: true };
  Object.assign(globalThis, { __calls: calls, __setOverview: value => { overview = value; }, __refuseNextSet: () => { refuseNextSet = true; } });
  globalThis.__TAURI__ = { core: { invoke: async (command, args) => {
    calls.push([command, args ?? null]);
    if (command === "runtime_overview") { if (!overview) throw new Error("not answering"); return JSON.stringify(overview); }
    if (command === "runtime_decide") { overview = { ...overview, missed: overview.missed.filter(row => row.run_id !== args.run_id) }; return JSON.stringify({ state: "started" }); }
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

test("RES-09 RES-10 RES-11 the capsule's 运行, the quit confirmation, the Home's missed notice and 设置 › 运行", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `${FAKE_DESKTOP}\n${STUB_HOME_ROUTES}` }, sessionId);
  const text = (key: string, values: Record<string, string | number> = {}) => evaluate<string>(`globalThis.t.text(${JSON.stringify(`workbench.runtime-panel.${key}`)}, ${JSON.stringify(values)})`);
  const panel = "[data-runtime-panel] [data-runtime-body]";

  // ---- RES-10: the capsule's 「运行」 section ----
  await navigate(() => command("Page.navigate", { url: `${origin}/desktop/capsule?desktop=1` }, sessionId));
  await waitFor(`document.querySelectorAll('${panel} [data-runtime-row]').length === 2`);
  assert.equal(await evaluate(`document.querySelector('${panel} .runtime-panel__notice strong').textContent`), await text("missed-during-sleep", { count: 2 }),
    "what was missed, and that the computer was asleep");
  assert.deepEqual(await evaluate(`${calls("runtime_missed_dot")}.at(-1)[1]`), { missed: true }, "the tray's dot is on");
  assert.equal(await evaluate(`document.querySelector('${panel} .runtime-panel__status').dataset.tone`), "waiting", "no model: the status says it waits");
  assert.equal(await evaluate(`document.querySelectorAll('${panel} .runtime-panel__next .runtime-panel__row').length`), 5, "next: at most five");
  assert.equal(await evaluate(`[...document.querySelectorAll('${panel} .runtime-panel__next .runtime-panel__waiting')].length`), 1, "the one that needs the model waits");
  await evaluate(`document.querySelector('${panel} [data-runtime-open="/settings/models"]').click()`);
  assert.deepEqual(await evaluate(`${calls("capsule_open_main")}.at(-1)[1]`), { path: "/settings/models" }, "the way to fix it is one click");

  await evaluate(`document.querySelector('${panel} [data-runtime-row="m1"] [data-runtime-decide="run_now"]').click()`);
  await waitFor(`!document.querySelector('${panel} [data-runtime-row="m1"]')`);
  assert.deepEqual(await evaluate(`${calls("runtime_decide")}.at(-1)[1]`), { scope_project_id: "p1", provider_id: "schedule", run_id: "m1", decision: "run_now" },
    "现在做 goes to the run's own owner, in its own project");
  await evaluate(`document.querySelector('${panel} [data-runtime-row="followup:a:1"] [data-runtime-decide="skip"]').click()`);
  await waitFor(`!document.querySelector('${panel} [data-runtime-row]')`);
  assert.deepEqual(await evaluate(`${calls("runtime_decide")}.at(-1)[1]`), { scope_project_id: null, provider_id: "assistant", run_id: "followup:a:1", decision: "skip" },
    "a Home owner's run has no project");
  assert.equal(await evaluate(`document.querySelector('${panel} .runtime-panel__notice[data-tone=success] strong')?.textContent`), await text("all-handled"));
  assert.deepEqual(await evaluate(`${calls("runtime_missed_dot")}.at(-1)[1]`), { missed: false }, "and the dot goes");

  // PWA-137: a Host that stops answering is never shown as running.
  await evaluate(`globalThis.__setOverview(null); document.dispatchEvent(new Event("visibilitychange"))`);
  await waitFor(`document.querySelector('${panel} .runtime-panel__status')?.dataset.tone === 'stopped'`);
  assert.equal(await evaluate(`document.querySelector('${panel} .runtime-panel__status').textContent`), await text("stopped"));

  // ---- RES-09: quitting lists the next day's runs, five and how many more, and quits only on 「退出」 ----
  await evaluate(`globalThis.__setOverview(${JSON.stringify({ ...OVERVIEW, missed: [] })}); globalThis.molisWorkRuntimeQuit()`);
  await waitFor(`document.querySelector('${panel} [role=alertdialog]')`);
  assert.equal(await evaluate(`document.querySelectorAll('${panel} [role=alertdialog] .runtime-panel__row').length`), 5);
  assert.equal(await evaluate(`document.querySelector('${panel} .runtime-panel__more').textContent`), await text("more", { count: 1 }),
    "six in the next day (the seventh is later): five shown, one more");
  await evaluate(`document.querySelector('${panel} [data-runtime-quit=cancel]').click()`);
  await waitFor(`!document.querySelector('${panel} [role=alertdialog]')`);
  assert.equal(await evaluate(`${calls("runtime_quit_confirmed")}.length`), 0, "取消 does not quit");
  assert.equal(await evaluate(`${calls("capsule_hide")}.length > 0`), true);
  await evaluate(`globalThis.molisWorkRuntimeQuit()`);
  await waitFor(`document.querySelector('${panel} [data-runtime-quit=confirm]')`);
  await evaluate(`document.querySelector('${panel} [data-runtime-quit=confirm]').click()`);
  await waitFor(`${calls("runtime_quit_confirmed")}.length === 1`);
  // Nothing would stop in the next day: no list to read, it quits at once.
  await evaluate(`globalThis.__setOverview(${JSON.stringify({ ...OVERVIEW, missed: [], upcoming: [run("later", 30)] })}); globalThis.molisWorkRuntimeQuit()`);
  await waitFor(`${calls("runtime_quit_confirmed")}.length === 2`);
  // An owner that did not answer may have something due: it asks, says the list is not the whole of it, and quits only on 「退出」.
  await evaluate(`globalThis.__setOverview(${JSON.stringify({ ...OVERVIEW, missed: [], upcoming: [run("later", 30)],
    unavailable_sources: [{ project_id: "p1", provider_id: "feed", code: "actions.output_invalid" }] })}); globalThis.molisWorkRuntimeQuit()`);
  await waitFor(`document.querySelector('${panel} [role=alertdialog] [data-runtime-unknown]')`);
  assert.equal(await evaluate(`document.querySelector('${panel} [data-runtime-unknown]').textContent`), await text("quit-unknown"));
  assert.equal(await evaluate(`${calls("runtime_quit_confirmed")}.length`), 2, "not quit unasked");
  await evaluate(`document.querySelector('${panel} [data-runtime-quit=confirm]').click()`);
  await waitFor(`${calls("runtime_quit_confirmed")}.length === 3`);
  // Nor is a quit held up by a Host that does not answer.
  await evaluate(`globalThis.__setOverview(null); globalThis.molisWorkRuntimeQuit()`);
  await waitFor(`${calls("runtime_quit_confirmed")}.length === 4`);

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
