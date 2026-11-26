import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import type { SettingsValues } from "@molis-ai/molis-work-contracts/platform/settings";
import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("ONB-22/23/28, PWA-36, PF-A14, PF-A15, VUX-54/55/56, ONB-48: settings, prompt simplification, and Scheme A on-demand help work end-to-end", async t => {
  const b = await openBoardBrowser(t, "user", undefined, null);
  if (!b) return;
  const { localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), raw = localHost.homeActionClient(), person = bindActionClient(raw, () => caller);
  const read = { capability_id: "assistant.preferences.read", version: 1, provider_id: "system.assistant-settings" };
  const write = { ...read, capability_id: "assistant.preferences.write" };
  const key = "assistant.lookback", cap = "assistant.daily_tokens";
  const actor = caller.actor_id, store = localHost.assistantStore!();
  store.setSetting(actor, "daily_tokens", "4500");
  const get = async () => (await raw.invoke(caller, read, { keys: [key, cap] }) as SettingsValues).values;
  const [range, budget] = await get();
  assert.equal(range?.state === "ok" && range.source, "provider_default");
  assert.equal(budget?.state === "ok" && budget.value, 4500);
  const title = { literal: "Editorial review" };
  const { draft } = await person.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "look", layer: "personal", required: true, proposal: { kind: "setting", key, value: { count: 2, unit: "weeks" } } },
      { part_id: "report", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "read", title, part_ids: ["look", "report"] }],
    example_task: { title, input: title, step_ids: ["read"], result: { part_id: "report", location: title } },
  } });
  const preview = await person.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "personal" }, part_ids: ["look"] });
  assert.equal(preview.parts[0]?.decision, "update");
  const request = { preview_id: preview.preview_id, part_ids: ["look"], request_id: "editorial-lookback" };
  const done = await person.invoke(blueprintActions.apply, request);
  assert.equal(done.steps[0]?.state, "applied");

  await navigate(() => command("Page.navigate", { url: origin + "/settings/assistant" }, sessionId));
  await waitFor("document.querySelector('[data-lookback-count]')?.value === '2' && document.querySelector('[data-lookback-unit]').value === 'weeks'");
  assert.equal(await evaluate("document.querySelector('[data-assistant-budget-input]').value"), "4500");
  await evaluate("document.querySelector('[data-lookback-count]').value='3'; document.querySelector('[data-lookback-unit]').value='days'");
  await click("[data-assistant-lookback] button[type=submit]");
  await waitFor("!document.querySelector('[data-assistant-lookback] button[type=submit]').disabled");
  // AUT-06: the project settings directory opens both owner-backed controls.
  assert.ok(b.projectId);
  const projectSettings = origin + "/projects/" + encodeURIComponent(b.projectId) + "/?settings=assistant";
  const openProjectSettings = () => navigate(() => command("Page.navigate", { url: projectSettings }, sessionId));
  await openProjectSettings();
  await waitFor("document.querySelector('[data-assistant-offers]:enabled:checked')");
  await evaluate("document.querySelector('[data-assistant-offers]').click()");
  await waitFor("document.querySelector('[data-assistant-offers]:enabled:not(:checked)')");
  await openProjectSettings();
  await waitFor("document.querySelector('[data-lookback-count]')?.value === '3' && document.querySelector('[data-lookback-unit]').value === 'days'");
  await waitFor("document.querySelector('[data-assistant-offers]:enabled:not(:checked)')");
  assert.deepEqual(JSON.parse(store.setting(actor, "lookback")!), { count: 3, unit: "days" });
  await person.invoke(blueprintActions.apply, request);
  const undo = await person.invoke(blueprintActions.revert, { adoption_id: done.adoption_id, request_id: "return-window" });
  assert.equal(undo.undo.steps[0]?.state, "skipped");
  assert.deepEqual(JSON.parse(store.setting(actor, "lookback")!), { count: 3, unit: "days" });
  await click("[data-assistant-lookback] [data-inherit]");
  await waitFor("document.querySelector('[data-lookback-count]')?.value === '48' && document.querySelector('[data-assistant-lookback] [data-inherit]').hidden");

  const change = { key: cap, layer: "personal", expected_revision: budget!.revision, request_id: "cost-limit", change: { set: 6000 } };
  const receipt = await raw.invoke(caller, write, change);
  assert.equal(store.setting(actor, "daily_tokens"), "6000");
  await navigate(() => command("Page.navigate", { url: origin + "/settings/assistant" }, sessionId));
  await waitFor("document.querySelector('[data-assistant-budget-input]')?.value === '6000'");
  await click("[data-budget-inherit]");
  await waitFor("document.querySelector('[data-assistant-budget-input]')?.value === '' && document.querySelector('[data-budget-inherit]').hidden");
  assert.deepEqual(await raw.invoke(caller, write, change), receipt);
  const updated = (await get())[1];
  assert.equal(updated?.state === "ok" && updated.source, "provider_default");
  assert.equal(store.setting(actor, "daily_tokens"), "");
  await assert.rejects(raw.invoke({ ...caller, actor_kind: "runtime" }, write, change), { code: "assistant.scope" });

  // PF-A15: understandable daily cap tiers write through settings_entries and Computer Use shows pre-action facts + local app picker.
  await click('[data-budget-preset="100000"]');
  await waitFor("document.querySelector('[data-assistant-budget-input]')?.value === '100000' && document.querySelector('[data-budget-preset=\"100000\"]')?.getAttribute('aria-pressed') === 'true'");
  assert.equal(store.setting(actor, "daily_tokens"), "100000");
  assert.ok(await evaluate<boolean>("document.querySelectorAll('[data-assistant-computer] .mw-facts .mw-fact-row').length >= 2"), "Computer Use shows pre-action facts");
  const computerApps = await b.web.get<{ apps: Array<{ bundle_id: string; name: string }> }>("/api/computer/apps");
  assert.ok(Array.isArray(computerApps.apps), "GET /api/computer/apps returns verifiable app list");
  await click("[data-budget-inherit]");
  await waitFor("document.querySelector('[data-assistant-budget-input]')?.value === '' && document.querySelector('[data-budget-preset=\"0\"]')?.getAttribute('aria-pressed') === 'true'");

  // PF-A14: simplified prompt editing preserves locked JSON format contracts and rejects broken full-text overrides with targeted errors.
  const promptKey = "system:skills/skills.revise";
  const promptDetail = await b.web.get<{ prompt: { key: string; body: string; user: { revision: number } | null }; editor: { editable: string; locked_format: string; required_keys: string[]; format_intact: boolean } }>(`/api/agent-definitions/prompt?key=${encodeURIComponent(promptKey)}`);
  assert.ok(promptDetail.editor.locked_format.includes("JSON"), "server splits locked JSON contract");
  assert.equal(promptDetail.editor.format_intact, true);
  const savedSimple = await b.web.post<{ prompt: { body: string; effective: string; user: { revision: number } }; editor: { editable: string; format_intact: boolean } }>(`/api/agent-definitions/prompt?key=${encodeURIComponent(promptKey)}`, {
    mode: "simplified",
    guidance: "请用要点形式写出简洁的改动说明。",
    expected_revision: promptDetail.prompt.user ? promptDetail.prompt.user.revision : null,
  });
  assert.equal(savedSimple.prompt.effective, "user");
  assert.equal(savedSimple.editor.editable, "请用要点形式写出简洁的改动说明。");
  assert.equal(savedSimple.editor.format_intact, true);
  assert.ok(savedSimple.prompt.body.includes(promptDetail.editor.locked_format), "simplified edit preserves locked JSON format verbatim");
  await assert.rejects(
    () => b.web.post(`/api/agent-definitions/prompt?key=${encodeURIComponent(promptKey)}`, {
      mode: "full",
      body: "直接用纯文字回答即可",
      validate_format: true,
      expected_revision: savedSimple.prompt.user.revision,
    }),
    /JSON/u,
    "full-text validation points out missing JSON format",
  );
  const resetRes = await b.web.post<{ prompt: { effective: string } }>(`/api/agent-definitions/prompt/reset?key=${encodeURIComponent(promptKey)}`, {
    expected_revision: savedSimple.prompt.user.revision,
  });
  assert.equal(resetRes.prompt.effective, "default");

  // VUX-55 / ONB-48: settings page mounts Scheme A Help, expanded button shows --nav-active wash, Esc closes and returns focus without losing input.
  const assistantHelp = '[data-mw-help-trigger][data-help-topic="settings-assistant"]';
  await waitFor(`!!document.querySelector('${assistantHelp}')`);
  await click(assistantHelp);
  await waitFor(`!!document.querySelector('.mw-help-card') && document.querySelector('${assistantHelp}')?.getAttribute('aria-expanded') === 'true'`);
  const expandedBg = await evaluate<string>(`getComputedStyle(document.querySelector('${assistantHelp}')).backgroundColor`);
  assert.notEqual(expandedBg, "rgba(0, 0, 0, 0)", `expanded ghost Help trigger must show --nav-active wash, got ${expandedBg}`);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor(`!document.querySelector('.mw-help-card') && document.querySelector('${assistantHelp}')?.getAttribute('aria-expanded') === 'false'`);
  const focusDiag = await evaluate<{ same: boolean; hasFocus: boolean; active: string; count: number }>(`({ same: document.activeElement === document.querySelector('${assistantHelp}'), hasFocus: document.hasFocus(), active: document.activeElement?.outerHTML.slice(0, 120) || '', count: document.querySelectorAll('[data-mw-help-trigger]').length })`);
  assert.equal(focusDiag.same, true, `Esc returns focus to the Help trigger (${JSON.stringify(focusDiag)})`);

  // VUX-55 (B5): project settings routes and capabilities connections/access mount their dedicated help topics.
  const projectId = b.projectId;
  assert.ok(projectId);
  const rulesHtml = await (await fetch(`${origin}/projects/${encodeURIComponent(projectId)}/settings/rules`)).text();
  assert.match(rulesHtml, /data-help-topic="settings-authorizations"/u, "project settings rules redirects to authorizations with help");
  const guidanceEmbedHtml = await (await fetch(`${origin}/projects/${encodeURIComponent(projectId)}/settings/guidance?embed=1`)).text();
  assert.match(guidanceEmbedHtml, /data-help-topic="settings-guidance"/u, "embedded project settings guidance mounts guidance help");
  const connectionsHtml = await (await fetch(`${origin}/capabilities/connections`)).text();
  assert.match(connectionsHtml, /data-help-topic="settings-connectors"/u, "capabilities/connections maps to connectors help");
  const accessHtml = await (await fetch(`${origin}/capabilities/access`)).text();
  assert.match(accessHtml, /data-help-topic="settings-mcp"/u, "capabilities/access maps to mcp help");

  // VUX-54 / VUX-55 / VUX-56: catalog specimens prove pre-action facts stay visible when closed, skipped tip persists across reload, failure recovers on retry, side-pane transfer renders lists+collapsible, and 390px has no overflow.
  await navigate(() => command("Page.navigate", { url: origin + "/__ui/catalog#on-demand-help" }, sessionId));
  await waitFor("!!document.querySelector('#on-demand-help [data-mw-help-tip]') && !!document.querySelector('#on-demand-help .mw-facts')");
  assert.equal(await evaluate<boolean>("document.querySelector('#on-demand-help .mw-facts').getBoundingClientRect().height > 0"), true, "pre-action facts stay visible while Help is closed");
  await click("#on-demand-help [data-mw-help-tip-skip]");
  await waitFor("document.querySelector('#on-demand-help [data-mw-help-tip]')?.hidden === true");
  await b.reloadPage();
  await waitFor("!!document.querySelector('#on-demand-help [data-mw-help-trigger]')");
  assert.equal(await evaluate<boolean>("document.querySelector('#on-demand-help [data-mw-help-tip]')?.hidden === true"), true, "skipped first-visit tip stays hidden across reload");
  await click("#on-demand-help [data-help-specimen-fail]");
  await click("#specimen-help-entry");
  await waitFor("!!document.querySelector('.mw-help-card .mw-empty--error [data-mw-help-retry]')");
  await click(".mw-help-card [data-mw-help-retry]");
  await waitFor("!!document.querySelector('.mw-help-card .mw-help-section') && !document.querySelector('.mw-help-card .mw-empty--error')");
  await waitFor("!!document.querySelector('.mw-help-card [data-mw-help-to-side]')");
  await click(".mw-help-card [data-mw-help-to-side]");
  await waitFor("!document.querySelector('[data-help-specimen-side]')?.hidden && document.querySelectorAll('[data-help-specimen-side-body] .mw-help-section').length >= 3 && !!document.querySelector('[data-help-specimen-side-body] details.mw-collapsible')");
  await click("#specimen-help-entry");
  await waitFor("!!document.querySelector('.mw-help-card .mw-help-section')");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await waitFor("document.documentElement.clientWidth <= 390");
  assert.equal(await evaluate<boolean>("document.documentElement.scrollWidth <= 390"), true, "Scheme A Help fits 390px without horizontal overflow");
  // P2-7: at <= 760px, "Keep reading in the side pane" collapses into an icon-only button left of Close in the card header.
  assert.equal(
    await evaluate<boolean>(`(() => {
      const btn = document.querySelector('.mw-help-card [data-mw-help-to-side]');
      const closeBtn = document.querySelector('.mw-help-card [data-mw-help-close]');
      return Boolean(btn && closeBtn && btn.parentElement?.classList.contains('mw-help-card__head') && btn.classList.contains('mw-btn--icon-only') && btn.nextElementSibling === closeBtn);
    })()`),
    true,
    "P2-7: mobile Scheme A Help collapses side-pane button into icon-only control left of Close in header",
  );
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");
  await command("Emulation.clearDeviceMetricsOverride", {}, sessionId);

  // VUX-59: live generated-plugin example on /__ui/catalog mounts Scheme A Help automatically via PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT.
  await waitFor("!!document.querySelector('[data-presentation-example] [data-mw-help-trigger]')");
  await click("[data-presentation-example] [data-mw-help-trigger]");
  await waitFor("!!document.querySelector('.mw-help-card .mw-help-section')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");

  // P1-1: in-place language switch on /settings/appearance updates the Scheme A Help card live without reloading.
  const appearanceHelp = '[data-mw-help-trigger][data-help-topic="settings-appearance"]';
  await navigate(() => command("Page.navigate", { url: origin + "/settings/appearance" }, sessionId));
  await waitFor(`!!document.querySelector('${appearanceHelp}') && !!document.querySelector('[data-ui-language="en"]')`);
  await click(appearanceHelp);
  await waitFor("!!document.querySelector('.mw-help-card__title')");
  assert.match(await evaluate<string>("document.querySelector('.mw-help-card__title')?.textContent || ''"), /界面与语言/u, "initial appearance Help renders in zh");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");
  await evaluate("window.__helpLangSwitchMarker = 'same-document'");
  await click('[data-ui-language="en"]');
  await waitFor("document.documentElement.lang === 'en'");
  assert.equal(await evaluate<string>("window.__helpLangSwitchMarker"), "same-document", "P1-1: language switch happened in place without reloading");
  await click(appearanceHelp);
  await waitFor("/Appearance and language/u.test(document.querySelector('.mw-help-card__title')?.textContent || '')");
  assert.match(await evaluate<string>("document.querySelector('.mw-help-card__body')?.textContent || ''"), /Choose light or dark appearance/u, "P1-1: Help body re-renders in English after in-place switch");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");
  await click('[data-ui-language="zh"]');
  await waitFor("document.documentElement.lang.startsWith('zh')");
  await click(appearanceHelp);
  await waitFor("/界面与语言/u.test(document.querySelector('.mw-help-card__title')?.textContent || '')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");

  // P1-2 & P1-4: /capabilities/rules and /capabilities/history each expose their own specialized Help topic and omit broken side-pane transfer on standalone pages.
  const rulesHelp = '[data-mw-help-trigger][data-help-topic="settings-judgment-rules"]';
  await navigate(() => command("Page.navigate", { url: origin + "/capabilities/rules" }, sessionId));
  await waitFor(`!!document.querySelector('${rulesHelp}')`);
  await click(rulesHelp);
  await waitFor("/判断规则/u.test(document.querySelector('.mw-help-card__title')?.textContent || '')");
  assert.equal(
    await evaluate<boolean>("!!document.querySelector('.mw-help-card [data-mw-help-to-side]') === !!document.querySelector('[data-side-tab=\"help\"]')"),
    true,
    "P1-4: side-pane transfer button matches whether the shell actually offers the help side tab",
  );
  const historyHelp = '[data-mw-help-trigger][data-help-topic="settings-call-history"]';
  await navigate(() => command("Page.navigate", { url: origin + "/capabilities/history" }, sessionId));
  await waitFor(`!!document.querySelector('${historyHelp}')`);
  await click(historyHelp);
  await waitFor("/调用记录/u.test(document.querySelector('.mw-help-card__title')?.textContent || '')");
  await navigate(() => command("Page.navigate", { url: origin + "/settings/projects" }, sessionId));
  await waitFor('!!document.querySelector(\'[data-mw-help-trigger][data-help-topic="settings-projects"]\')');
  await click('[data-mw-help-trigger][data-help-topic="settings-projects"]');
  await waitFor("/管理项目/u.test(document.querySelector('.mw-help-card__title')?.textContent || '')");
  assert.equal(
    await evaluate<boolean>("!!document.querySelector('.mw-help-card [data-mw-help-to-side]') === !!document.querySelector('[data-side-tab=\"help\"]')"),
    true,
    "P1-4: settings/projects transfer button matches shell help-tab availability",
  );

  // P1-4: standalone Home plugin page (/plugins/jelly; Todo moved to partitions in batch 108) carries sideHelpAvailable="0" so Help omits the broken side-pane button.
  const todoFrame = await pluginFrameBrowser(t, b, "jelly");
  await navigate(() => command("Page.navigate", { url: origin + "/plugins/jelly" }, sessionId));
  await todoFrame.waitFor("document.body.dataset.sideHelpAvailable === '0' && !!document.querySelector('[data-mw-help-trigger]')");
  await todoFrame.evaluate("document.querySelector('[data-mw-help-trigger]')?.click()");
  await todoFrame.waitFor("!!document.querySelector('.mw-help-card')");
  assert.equal(
    await todoFrame.evaluate<boolean>("!!document.querySelector('.mw-help-card [data-mw-help-to-side]')"),
    false,
    "P1-4: standalone Home plugin page hides broken side-pane transfer button",
  );

  // VUX-55 (B4 & P1-4): transferring Help to right side restores prior tab on close, AND switching directly from Help to another side tab cleans up the transient Help tab.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${encodeURIComponent(projectId)}/?openPlugin=todo` }, sessionId));
  await waitFor("!!document.querySelector('[data-side-panel]')");
  const priorTab = await evaluate<string | null>(`(() => {
    const tab = [...document.querySelectorAll('[data-side-tab]')].find((el) => !el.hidden && el.dataset.sideTab && el.dataset.sideTab !== 'help');
    if (!tab) return null;
    document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: tab.dataset.sideTab, focus: false }, cancelable: true }));
    return tab.dataset.sideTab;
  })()`);
  assert.ok(priorTab, "project workbench has an existing right-side tab to open before Help");
  await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tab="${priorTab}"]')?.getAttribute('aria-selected') === 'true'`);
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'help', target: { title: '待办', sections: [{ id: 'what', heading: '这是什么', body: '说明' }] }, focus: true }, cancelable: true }))`);
  await waitFor("document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tab=\"help\"]')?.getAttribute('aria-selected') === 'true' && !document.querySelector('[data-side-tab=\"help\"]')?.hidden");
  await click("[data-side-help-close]");
  await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tab="${priorTab}"]')?.getAttribute('aria-selected') === 'true' && document.querySelector('[data-side-tab="help"]')?.hidden === true`);
  // Now re-open Help in side panel, then click another tab directly on the strip — transient Help tab must disappear instead of remaining orphaned.
  await evaluate(`document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'help', target: { title: '待办', sections: [{ id: 'what', heading: '这是什么', body: '说明' }] }, focus: true }, cancelable: true }))`);
  await waitFor("document.querySelector('[data-side-tab=\"help\"]')?.getAttribute('aria-selected') === 'true' && !document.querySelector('[data-side-tab=\"help\"]')?.hidden");
  await evaluate(`document.querySelector('[data-side-tab="${priorTab}"]')?.click()`);
  await waitFor(`document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tab="${priorTab}"]')?.getAttribute('aria-selected') === 'true' && document.querySelector('[data-side-tab="help"]')?.hidden === true`);

  // P1-2: Project Home, Artifacts, and Sessions expose working Scheme A Help declarations and triggers.
  assert.equal(await evaluate<boolean>("Boolean(document.querySelector('[data-work-surface=\"home\"] [data-mw-help-trigger][data-help-topic=\"workbench-home\"]'))"), true, "P1-2: Project Home has Help trigger");
  assert.equal(await evaluate<boolean>("Boolean(document.querySelector('[data-work-surface=\"artifacts\"] script[data-mw-help-declaration]'))"), true, "P1-2: Artifacts has Help declaration");
  assert.equal(await evaluate<boolean>("Boolean(document.querySelector('[data-work-surface=\"sessions\"] template')?.content?.querySelector('[data-mw-help-trigger][data-help-topic=\"workbench-sessions\"]'))"), true, "P1-2: Sessions has Help trigger");
  // Navigate to Project Home and actually open its Scheme A Help card live.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${encodeURIComponent(projectId)}/` }, sessionId));
  await waitFor('!!document.querySelector(\'[data-work-surface="home"] [data-mw-help-trigger][data-help-topic="workbench-home"]\')');
  await click('[data-work-surface="home"] [data-mw-help-trigger][data-help-topic="workbench-home"]');
  await waitFor("/项目主页/u.test(document.querySelector('.mw-help-card__title')?.textContent || '')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");

  // P1-2 & P1-3: enable Goals and Work Brief on the project, verify Project Home / Goals / Artifacts / Sessions Help and work-brief dynamic re-render persistence.
  for (const plugin_id of ["goals", "work-brief"]) {
    await b.web.post(`/api/settings/projects/${projectId}/plugins`, { plugin_id, expected_revision: await projectPluginRevision(b.web, projectId) });
  }
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${encodeURIComponent(projectId)}/?openPlugin=goals` }, sessionId));
  await waitFor("!!document.querySelector('[data-goal-stage-chrome] [data-mw-help-trigger]')");
  await click("[data-goal-stage-chrome] [data-mw-help-trigger]");
  await waitFor("!!document.querySelector('.mw-help-card .mw-help-section')");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, sessionId);
  await waitFor("!document.querySelector('.mw-help-card')");

  const briefFrame = await pluginFrameBrowser(t, b, "work-brief");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${encodeURIComponent(projectId)}/?openPlugin=work-brief` }, sessionId));
  await briefFrame.waitFor("document.body.dataset.sideHelpAvailable === '1' && !!document.querySelector('[data-help-slot] [data-mw-help-trigger]')");
  // Trigger a dynamic header re-render inside work-brief (switch to Personal mode) and verify Help survives cleanly.
  await briefFrame.evaluate("document.querySelector('[data-wb-act=\"mode\"][data-wb-value=\"personal\"]')?.click()");
  await briefFrame.waitFor("!!document.querySelector('[data-help-slot] [data-mw-help-trigger]')");
});

test("ONB-28/29: after a partial adoption the reopened page retries only the unconfirmed setting", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), person = bindActionClient(localHost.homeActionClient(), () => caller);
  const title = { literal: "A week of editing" };
  const { draft } = await person.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "invalid-report", layer: "project", required: false, proposal: { kind: "setting", key: "assistant.report_schedule",
      value: { enabled: true, frequency: "weekly", weekday: 1700000000000, time: "09:00", time_zone: "UTC" } } },
      { part_id: "range", layer: "personal", required: true, proposal: { kind: "setting", key: "assistant.lookback", value: { count: 1, unit: "weeks" } } },
      { part_id: "cap", layer: "personal", required: true, proposal: { kind: "setting", key: "assistant.daily_tokens", value: 5000 } },
      { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "prepare", title, part_ids: ["invalid-report", "range", "cap", "note"] }],
    example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "note", location: title } },
  } });
  const db = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"));
  try {
    db.exec("CREATE TRIGGER budget_unavailable BEFORE INSERT ON assistant_settings WHEN NEW.key='daily_tokens' BEGIN SELECT RAISE(ABORT,'budget unavailable'); END");
    const address = origin + "/onboarding?scene&draft=" + encodeURIComponent(draft.source.draft_id);
    await navigate(() => command("Page.navigate", { url: address }, sessionId));
    await waitFor("document.querySelector('[name=scene-target]')");
    await click("[name=scene-target][value=personal]");
    await click(".arrival-bar .bar-end .mw-btn--primary");
    await waitFor("document.querySelector('[data-scene-main] dl')");
    assert.match(await evaluate<string>("document.querySelector('[data-scene-main]').innerText"), /这项设置不适用于所选范围|can’t be written in the selected scope/i);
    assert.equal(await evaluate("document.querySelector('[data-scene-main] input[type=checkbox]')"), null);
    await click("[data-scene-aside] button:nth-of-type(2)");
    await waitFor("document.querySelector('[data-scene-main] input[type=checkbox]')?.checked");
    assert.match(await evaluate<string>("document.querySelector('[data-scene-main] dl').innerText"), /1\s*(周|week)/i);
    await click(".arrival-bar .bar-end .mw-btn--primary");
    const partial = "document.querySelector('[data-scene-main]')?.textContent.match(/待核对|Awaiting verification/i) && document.querySelector('.arrival-bar .bar-end .mw-btn--primary')";
    await waitFor(partial);
    const review = join(process.cwd(), ".impeccable", "qa", "review", "batch-38");
    await mkdir(review, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(review, "partial-adoption.png"), Buffer.from(shot.data, "base64"));
    const appliedRange = db.prepare("SELECT value, revision FROM assistant_settings WHERE actor_id=? AND key='lookback'").get(caller.actor_id);
    assert.ok(appliedRange);
    assert.deepEqual(JSON.parse(String(appliedRange.value)), { count: 1, unit: "weeks" });
    assert.equal(db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key='daily_tokens'").get(caller.actor_id), undefined);
    db.exec("DROP TRIGGER budget_unavailable");
    await b.reloadPage(); await waitFor(partial);
    const adoptionId = await evaluate<string>("new URL(location.href).searchParams.get('adoption')");
    for (const index of [1, 2]) {
      await click(`[data-scene-aside] button:nth-of-type(${index})`);
      await waitFor("!!document.querySelector('[data-scene-error]:not([hidden])') && document.querySelector('[data-scene-workspace]').getAttribute('aria-busy') !== 'true'");
      const status = await person.invoke(blueprintActions.read, { adoption_id: adoptionId });
      assert.equal(status.latest_undo, null);
      assert.ok(status.apply_steps.some(step => step.state === "pending_verification"));
      await waitFor(partial);
    }
    await click(".arrival-bar .bar-end .mw-btn--primary");
    await waitFor("document.querySelectorAll('[data-scene-main] details').length === 4 && !document.querySelector('.arrival-bar .bar-end .mw-btn--primary') && document.querySelector('[data-scene-aside] button')");
    assert.deepEqual(db.prepare("SELECT value, revision FROM assistant_settings WHERE actor_id=? AND key='lookback'").get(caller.actor_id), appliedRange);
    assert.equal((await person.invoke(blueprintActions.read, { adoption_id: adoptionId })).latest_undo, null);
    assert.equal(db.prepare("SELECT value FROM assistant_settings WHERE actor_id=? AND key='daily_tokens'").get(caller.actor_id)!.value, "5000");
    assert.equal(db.prepare("SELECT count(*) AS n FROM assistant_settings WHERE key LIKE 'preferences/receipt/%' AND actor_id=?").get(caller.actor_id)!.n, 2);
  } finally { db.close(); }
});

test("ONB-23/34: the Assistant's report preference follows the scene, then the person's local calendar choice without creating a standing delegation", async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { localHost, origin, command, sessionId, navigate, evaluate, waitFor, click } = b;
  assert.ok(localHost);
  const caller = await localHost.localPersonContext(), raw = localHost.homeActionClient(), person = bindActionClient(raw, () => caller);
  const key = "assistant.report_schedule", title = { literal: "Friday review" };
  const read = { capability_id: "assistant.preferences.read", version: 1, provider_id: "system.assistant-settings" };
  const write = { ...read, capability_id: "assistant.preferences.write" };
  const current = async () => (await raw.invoke(caller, read, { keys: [key] }) as SettingsValues).values[0]!;
  const initial = await current();
  assert.ok(initial.state === "ok" && initial.source === "provider_default");
  const friday = { enabled: true, frequency: "weekly", weekday: 5, time: "17:30", time_zone: "Asia/Shanghai" };
  for (const invalid of [{ ...friday, time_zone: "no/such-zone" }, { ...friday, time: "25:00" }, { ...friday, frequency: "daily" }]) {
    await assert.rejects(raw.invoke(caller, write, { key, layer: "personal", expected_revision: initial.revision, change: { set: invalid }, request_id: "invalid" }),
      { code: "assistant.setting_invalid" });
  }
  assert.deepEqual(await current(), initial);
  const { draft } = await person.invoke(blueprintActions.draftSave, { expected_revision: null, blueprint: {
    title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
    parts: [{ part_id: "calendar", layer: "personal", required: true, proposal: { kind: "setting", key, value: friday } },
      { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
    steps: [{ step_id: "review", title, part_ids: ["calendar", "note"] }],
    example_task: { title, input: title, step_ids: ["review"], result: { part_id: "note", location: title } },
  } });
  const preview = await person.invoke(blueprintActions.preview, { source: draft.source, target: { kind: "personal" }, part_ids: ["calendar"] });
  assert.deepEqual(preview.parts[0]?.consequences, ["schedule"]);
  await navigate(() => command("Page.navigate", { url: origin + "/onboarding?scene&preview=" + preview.preview_id }, sessionId));
  await waitFor("document.querySelector('[data-scene-main] dl')");
  const summary = await evaluate<string>("document.querySelector('[data-scene-main] dl').innerText");
  assert.match(summary, /星期五|Friday/i);
  assert.match(summary, /17:30.*Asia\/Shanghai/);
  assert.doesNotMatch(summary, /time_zone|month_day/);
  const request = { preview_id: preview.preview_id, part_ids: ["calendar"], request_id: "prepare-fridays" };
  const result = await person.invoke(blueprintActions.apply, request);
  assert.equal(result.steps[0]?.state, "applied");

  const form = "document.querySelector('[data-assistant-report]')", fields = form + ".elements";
  await navigate(() => command("Page.navigate", { url: origin + "/settings/assistant" }, sessionId));
  await waitFor(form + " && " + fields + ".weekday.value === '5' && " + fields + ".time_zone.value === 'Asia/Shanghai'");
  assert.equal(await evaluate(fields + ".time.value"), "17:30");
  await evaluate(fields + ".frequency.value = 'monthly'; " + fields + ".frequency.dispatchEvent(new Event('change')); " +
    fields + ".month_day.value = '12'; " + fields + ".time.value = '08:45'; " + fields + ".time_zone.value = 'America/Los_Angeles'; " + fields + ".enabled.checked = false");
  await click("[data-assistant-report] button[type=submit]");
  await waitFor("!" + form + ".querySelector('button[type=submit]').disabled");
  const revised = await current();
  assert.deepEqual(revised.state === "ok" && revised.value, { enabled: false, frequency: "monthly", month_day: 12, time: "08:45", time_zone: "America/Los_Angeles" });
  await b.reloadPage();
  await waitFor(form + " && " + fields + ".month_day.value === '12' && !" + fields + ".enabled.checked && " + fields + ".weekday.disabled");
  assert.equal((await person.invoke(blueprintActions.apply, request)).adoption_id, result.adoption_id);
  await person.invoke(blueprintActions.revert, { adoption_id: result.adoption_id, request_id: "remove-fridays" });
  assert.deepEqual(await current(), revised);
  const db = new DatabaseSync(homeSqlitePath(b.homeDirectory, "assistant"), { readOnly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM assistant_followups").get()!.n, 0);
  } finally { db.close(); }
  await click("[data-assistant-report] [data-inherit]");
  await waitFor(form + ".querySelector('[data-inherit]').hidden && " + fields + ".frequency.value === 'daily'");
  const inherited = await current();
  assert.deepEqual(inherited.state === "ok" && inherited.value, initial.value);
});
