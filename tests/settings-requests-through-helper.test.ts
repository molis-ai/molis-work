import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_DIAGNOSTICS_CLIENT_SCRIPT } from "../apps/workbench/src/settings-agent-diagnostics.js";
import { ASSISTANT_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/settings-assistant.js";
import { MEMORY_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/settings-memory.js";
import { PROMPT_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/settings-prompts.js";
import { SIDE_PANEL_SCRIPT } from "../apps/workbench/src/side-panel.js";
import { SIDE_BROWSER_SCRIPT } from "../apps/workbench/src/side-panel-browser.js";
import { SIDE_FILES_FACTORY_SCRIPT } from "../apps/workbench/src/side-panel-files.js";
import { BACKGROUND_TASKS_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/background-tasks.js";
import { PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/plugin-notifications.js";
import { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/settings-directory.js";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/scripts/project-settings.js";
import { MODEL_SETTINGS_CLIENT_SCRIPT } from "../apps/workbench/src/scripts/settings-models.js";
import { WEB_SERVICE_SETTINGS_SCRIPT } from "../apps/workbench/src/scripts/settings-web-service.js";
import { PROJECT_GUIDANCE_CLIENT_SCRIPT, RUNTIME_PLAN_CLIENT_SCRIPT } from "../apps/workbench/src/scripts/settings.js";

// W3-10-1b: the Settings group (and the five programs that moved with it for the page budget) is the first part of the Workbench to send every request through the page's one request helper
// (`molisWorkRequest`, ui-host). What these programs may no longer carry is a request of their own: a `fetch(` call, the
// control headers by hand, or `cache: "no-store"` (the helper sends every request that way). The check is on the programs as
// the Host serves them, so a branch that is reached rarely (a failed read, a restart) cannot hide one.

const SETTINGS_GROUP: ReadonlyArray<readonly [string, string]> = [
  ["settings-prompts", PROMPT_SETTINGS_CLIENT_SCRIPT],
  ["settings-assistant", ASSISTANT_SETTINGS_CLIENT_SCRIPT],
  ["settings-memory", MEMORY_SETTINGS_CLIENT_SCRIPT],
  ["settings-agent-diagnostics", AGENT_DIAGNOSTICS_CLIENT_SCRIPT],
  ["settings-models", MODEL_SETTINGS_CLIENT_SCRIPT],
  ["settings-web-service", WEB_SERVICE_SETTINGS_SCRIPT],
  ["settings (Runtime plan)", RUNTIME_PLAN_CLIENT_SCRIPT],
  ["settings (project guidance)", PROJECT_GUIDANCE_CLIENT_SCRIPT],
  ["project-settings", PROJECT_SETTINGS_CLIENT_SCRIPT],
  ["side-panel", SIDE_PANEL_SCRIPT],
  // The programs the budget needed moved too (the helper is bytes in the same file): the panel's browser and files, the settings directory, and
  // the two that poll in the background.
  ["side-panel-browser", SIDE_BROWSER_SCRIPT],
  ["side-panel-files", SIDE_FILES_FACTORY_SCRIPT],
  ["settings-directory", SETTINGS_DIRECTORY_FACTORY_SCRIPT],
  ["background-tasks", BACKGROUND_TASKS_FACTORY_SCRIPT],
  ["plugin-notifications", PLUGIN_NOTIFICATIONS_FACTORY_SCRIPT],
];

const ownRequest = (source: string) => /(?<![.\w])fetch\(/.test(source);
const ownHeaders = (source: string) => /molisWorkControlHeaders|x-molis-work-control-token|x-molis-work-idempotency-key|molis-work-control-token/.test(source);
const ownCaching = (source: string) => /cache:\s*["']no-store["']/.test(source);

for (const [name, source] of SETTINGS_GROUP) {
  test(`${name} sends its requests through the page's request helper and carries no request machinery of its own`, () => {
    assert.ok(source.includes("molisWorkRequest"), "it asks the helper");
    assert.equal(ownRequest(source), false, "no fetch( of its own");
    assert.equal(ownHeaders(source), false, "no control headers by hand: the helper adds the token and the one-time key, and only for this origin");
    assert.equal(ownCaching(source), false, 'no cache: "no-store": the helper sends every request that way');
  });
}

test("the check sees a request of a program's own, however it is spelled", () => {
  assert.equal(ownRequest('const r = await fetch("/api/x")'), true);
  assert.equal(ownRequest("return fetch(url).then(read)"), true);
  assert.equal(ownRequest("await molisWorkRequest('/api/x')"), false);
  assert.equal(ownRequest("scope.fetch(url)"), false, "a method named fetch is the lifecycle's, which is not this check's business");
  assert.equal(ownHeaders("headers: molisWorkControlHeaders()"), true);
  assert.equal(ownHeaders("'x-molis-work-idempotency-key': crypto.randomUUID()"), true);
  assert.equal(ownCaching("fetch(u, { cache: 'no-store' })"), true);
});
