import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// W3-10-1b: the Settings group (and the five programs that moved with it for the page budget) is the first part of the Workbench to send every
// request through the page's one request helper (`molisWorkRequest`, ui-host). What these programs may no longer carry is a request of their
// own: a `fetch(` call, the control headers by hand, or `cache: "no-store"` (the helper sends every request that way).
//
// Each of these files holds a browser program as a template string, so the file's text is the program's text, and that is what is read: the
// check does not need the package's internals, and a branch that is reached rarely (a failed read, a restart) cannot hide a request.

const SOURCES = "../apps/workbench/src/";
const PROGRAMS: ReadonlyArray<readonly [string, string]> = [
  ["settings-prompts", "settings-prompts.ts"],
  ["settings-assistant", "settings-assistant.ts"],
  ["settings-memory", "settings-memory.ts"],
  ["settings-agent-diagnostics", "settings-agent-diagnostics.ts"],
  ["settings-models", "scripts/settings-models.ts"],
  ["settings-web-service", "scripts/settings-web-service.ts"],
  ["settings (the Runtime plan and the project guidance)", "scripts/settings.ts"],
  ["project-settings", "scripts/project-settings.ts"],
  ["side-panel", "side-panel.ts"],
  // The programs the budget needed moved too (the helper is bytes in the same file): the panel's browser and files, the settings directory, and
  // the two that poll in the background.
  ["side-panel-browser", "side-panel-browser.ts"],
  ["side-panel-files", "side-panel-files.ts"],
  ["settings-directory", "scripts/client/settings-directory.ts"],
  ["background-tasks", "scripts/client/background-tasks.ts"],
  ["plugin-notifications", "scripts/client/plugin-notifications.ts"],
];

const read = (file: string): string => readFileSync(new URL(SOURCES + file, import.meta.url), "utf8");
const ownRequest = (source: string) => /(?<![.\w])fetch\(/.test(source);
const ownHeaders = (source: string) => /molisWorkControlHeaders|x-molis-work-control-token|x-molis-work-idempotency-key|molis-work-control-token/.test(source);
const ownCaching = (source: string) => /cache:\s*["']no-store["']/.test(source);

for (const [name, file] of PROGRAMS) {
  test(`${name} sends its requests through the page's request helper and carries no request machinery of its own`, () => {
    const source = read(file);
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
