import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { sessionSourceFailure } from "@molis-ai/molis-work-service-sessions";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import type { SessionsPorts } from "@molis-ai/molis-work-service-sessions";
import type { ExternalSessionListOutput, ExternalSessionScopeView } from "@molis-ai/molis-work-contracts/services/sessions";

// SRB-01..SRB-16: Real Chrome E2E verification of the Workbench Sessions surface, Read Scope Sheet (both tabs + overlay),
// Unfiled view, Droid search bar, Project Settings tool-brought folder confirmation, and Assistant untrusted context strip.

async function setupSessionsBrowser(t: TestContext, options: { ports?: Partial<SessionsPorts>; olderSessions?: number } = {}) {
  const chrome = locateTestChrome();
  if (!chrome) { t.skip("Chrome is required for Sessions Workbench E2E"); return null; }
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "swb-e2e-"));
  const root = await realpath(rawRoot);
  const userHome = path.join(root, "user");
  const alphaDir = path.join(root, "alpha-repo");
  const unfiledDir = path.join(root, "scratch-repo");
  const toolDir = path.join(root, "tool-brought-repo");
  const claudeDir = path.join(userHome, ".claude", "projects", "p1");
  const chromeDir = path.join(root, "chrome");
  for (const d of [userHome, alphaDir, unfiledDir, toolDir, claudeDir, chromeDir]) await mkdir(d, { recursive: true });

  await writeFile(
    path.join(claudeDir, "sess-alpha.jsonl"),
    [
      JSON.stringify({ sessionId: "sess-alpha", cwd: alphaDir, timestamp: "2026-11-12T10:00:00Z", message: { role: "user", content: "Fix contrast token in dark mode" } }),
      JSON.stringify({ sessionId: "sess-alpha", cwd: alphaDir, timestamp: "2026-11-12T10:01:00Z", message: { role: "assistant", content: "Updated contrast token cleanly" } }),
    ].join("\n") + "\n",
  );
  await writeFile(
    path.join(claudeDir, "sess-unfiled.jsonl"),
    `${JSON.stringify({ sessionId: "sess-unfiled", cwd: unfiledDir, timestamp: "2026-11-12T11:00:00Z", message: { role: "user", content: "Investigate standalone spike" } })}\n`,
  );
  for (let index = 0; index < (options.olderSessions ?? 0); index++) {
    const sessionId = `archive-${index}`, title = index === 0 ? "ArchiveNeedleOldest" : `Archive item ${index}`;
    await writeFile(path.join(claudeDir, `${sessionId}.jsonl`), [
      JSON.stringify({ sessionId, cwd: alphaDir, timestamp: new Date(Date.UTC(2026, 10, 11, 0, index)).toISOString(), message: { role: "user", content: title } }),
      JSON.stringify({ sessionId, cwd: alphaDir, timestamp: new Date(Date.UTC(2026, 10, 11, 0, index, 1)).toISOString(), message: { role: "assistant", content: `Body of ${title}` } }),
    ].join("\n") + "\n");
  }

  // `node:test` executes `t.after` callbacks in registration (FIFO) order: close Chrome first, then Host/HTTP, then remove temp dir.
  let harness: ChromeHarness | undefined;
  t.after(async () => { await harness?.close(); });
  const home = await serveHomeRuntime(t, { sessions: { homeRoot: userHome, env: {}, ports: options.ports } });
  t.after(() => rm(rawRoot, { recursive: true, force: true }));

  const alpha = await home.project("Alpha");
  const beta = await home.project("Beta");

  const initDirs = await (await home.request(`/projects/${alpha.project_id}/api/project-settings/directories`)).json() as { revision: string };
  await home.request(`/projects/${alpha.project_id}/api/project-settings/directories`, {
    method: "POST",
    body: { change: "add_input", input: { workspace_path: alphaDir, expected_revision: initDirs.revision } },
  });
  await home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home.home }, (catalog) =>
    catalog.commit(() =>
      catalog.bindRuntimeContext({
        context: { runtime_id: "claude-code", stable_work_context_id: "ctx-tool", host_declares_stable: true, workspace: { canonical_path: toolDir, realpath_verified: true } },
        project_id: alpha.project_id,
        actor_id: "runtime:claude-code",
        user_confirmed: true,
      }),
    ),
  );

  harness = await ChromeHarness.start(chromeDir, { executable: chrome, commandTimeoutMs: 30_000 });
  const { targetId } = await harness.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await harness.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  await harness.command("Page.enable", {}, sessionId);
  await harness.command("Network.enable", {}, sessionId);
  await harness.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `{
      const orig = window.fetch.bind(window), origin = ${JSON.stringify(home.origin)};
      window.fetch = (input, init) => {
        const req = input instanceof Request ? input : null;
        const u = new URL(req ? req.url : String(input), location.href);
        const m = String(init?.method ?? req?.method ?? 'GET').toUpperCase();
        if (u.origin === origin && m === 'GET') {
          if (u.pathname === '/api/personal/status') return Promise.resolve(Response.json({ configured: false, identity: null, ready: true, space: 'local' }));
          if (u.pathname === '/api/sync') return Promise.resolve(Response.json({ available: false, reason: 'local' }));
        }
        return orig(input, init);
      };
    }`,
  }, sessionId);

  const cdp = harness;
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const res = await cdp.command<{ result: { value: T }; exceptionDetails?: unknown }>(
      "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId,
    );
    assert.equal(res.exceptionDetails, undefined, JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  const waitFor = async (expression: string, timeoutMs = 25_000): Promise<void> => {
    const res = await cdp.command<{ exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression: `new Promise((resolve, reject) => {
        const deadline = Date.now() + ${timeoutMs};
        const tick = () => { if (${expression}) resolve(true); else if (Date.now() >= deadline) reject(new Error('Timeout: ' + ${JSON.stringify(expression)})); else setTimeout(tick, 25); };
        tick();
      })`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId, timeoutMs + 5_000);
    assert.equal(res.exceptionDetails, undefined, JSON.stringify(res.exceptionDetails));
  };
  const goto = async (urlPath: string, width = 1440, height = 900, locale: "zh" | "en" = "zh") => {
    await cdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 480 }, sessionId);
    await cdp.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: home.origin }, sessionId);
    await cdp.command("Page.navigate", { url: home.origin + urlPath }, sessionId, 60_000);
    await waitFor("document.readyState === 'complete'");
  };

  return { home, alpha, beta, harness: cdp, sessionId, evaluate, waitFor, goto };
}

for (const entry of ["paging", "list-search", "system-search"] as const) {
  test(`QEA-30: ${entry} opens a real session older than the first 50 rows`, { timeout: 120_000 }, async t => {
    const ctx = await setupSessionsBrowser(t, { olderSessions: 50 });
    if (!ctx) return;
    const { home, alpha, evaluate, waitFor, goto } = ctx;
    const scope = await (await home.request("/api/sessions/scope")).json() as ExternalSessionScopeView;
    const saved = await home.request("/api/sessions/scope", { method: "POST", body: { expected_revision: scope.scope_revision,
      sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] } });
    assert.equal(saved.status, 200);
    await home.host.sessions!.service.waitForDiscoveryIdle();
    const first = await (await home.request(`/projects/${alpha.project_id}/api/sessions/list?view=project`)).json() as ExternalSessionListOutput;
    assert.equal(first.sessions.length, 50);
    assert.ok(first.next_cursor);
    assert.equal(first.sessions.some(row => row.title === "ArchiveNeedleOldest"), false);
    await goto(`/projects/${alpha.project_id}/?openPlugin=${entry === "system-search" ? "goals" : "sessions"}`, 1440, 900, "en");
    if (entry === "system-search") {
      await evaluate("document.querySelector('[data-global-search-open]').click()");
      await waitFor("Boolean(document.querySelector('[data-global-search-dialog][open]'))");
      await evaluate(`(() => { const input = document.querySelector('[data-global-search]'); input.value = 'ArchiveNeedleOldest'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await waitFor(`Array.from(document.querySelectorAll('[data-global-search-hit]')).some(row => row.textContent.includes('ArchiveNeedleOldest'))`);
      await evaluate(`Array.from(document.querySelectorAll('[data-global-search-hit]')).find(row => row.textContent.includes('ArchiveNeedleOldest')).click()`);
    } else {
      await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 50");
      if (entry === "paging") {
        assert.ok(await evaluate("Boolean(document.querySelector('[data-sessions-page=next]:not(:disabled)'))"));
        await evaluate("document.querySelector('[data-sessions-page=next]').click()");
      } else await evaluate(`(() => { const input = document.querySelector('[data-sessions-search]'); input.value = 'archiveneedleoldest'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await waitFor(`document.querySelector('[data-sessions-body]')?.textContent.includes('ArchiveNeedleOldest') && document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1`);
      await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
    }
    await waitFor(`document.querySelector('[data-sessions-detail]')?.textContent.includes('Body of ArchiveNeedleOldest')`);
    if (entry === "paging") {
      await evaluate("document.querySelector('[data-sessions-page=previous]').click()");
      await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 50");
      assert.equal(await evaluate("document.querySelector('[data-sessions-detail]').textContent.includes('Body of ArchiveNeedleOldest')"), true,
        "moving between list pages must not revoke an independently authorized selection");
    }
  });
}

test("QEA-32: cloud scope A to B to save and off sends one account and reuses owner discovery", { timeout: 120_000 }, async t => {
  const ctx = await setupSessionsBrowser(t, { ports: { connections: {
    choices: () => ({ choices: [{ connection_id: "account-a", display_name: "Account A", account_label: "alice" },
      { connection_id: "account-b", display_name: "Account B", account_label: "bob" }], connect_service_id: "github" }),
    current: id => id === "account-a" || id === "account-b" ? { enabled: true } : null,
    request: async () => ({ status: 404, headers: {}, body: "" }),
    command: async () => ({ exit_code: 0, stderr: "", stdout: "[]" }),
  } } });
  if (!ctx) return;
  const { home, alpha, evaluate, waitFor, goto } = ctx;
  await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "en");
  await waitFor(`Boolean(document.querySelector('[data-work-surface="sessions"]:not([hidden]) [data-sessions-body]'))`);
  await evaluate(`(() => { const original = window.fetch.bind(window); window.__extraDiscovery = 0; window.fetch = (input, init) => {
    if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/discovery')) window.__extraDiscovery++;
    return original(input, init);
  }; })()`);
  for (const [account, allowed] of [["account-a", true], ["account-b", true], ["account-b", true], ["account-b", false]] as const) {
    await evaluate(`document.querySelector('[data-work-surface="sessions"] [data-sessions-open-scope="tools"]').click()`);
    await waitFor(`Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-scope-conn="copilot-coding-agent"]'))`);
    await evaluate(`(() => {
      document.querySelector('[data-scope-conn="copilot-coding-agent"]').value = ${JSON.stringify(account)};
      const check = document.querySelector('[data-scope-allow="copilot-coding-agent"]');
      if (check.checked !== ${allowed}) check.click();
      document.querySelector('[data-sessions-scope-save]').click();
    })()`);
    await waitFor("!document.querySelector('[data-sessions-scope-sheet]').open");
    const current = await (await home.request("/api/sessions/scope")).json() as ExternalSessionScopeView;
    const cloud = current.sources.filter(row => row.entry_id === "copilot-coding-agent");
    assert.equal(cloud.find(row => row.connection_id === account)?.allowed, allowed);
    assert.equal(cloud.filter(row => row.allowed).length, allowed ? 1 : 0);
    if (account === "account-b") assert.equal(cloud.find(row => row.connection_id === "account-a")?.allowed, false);
  }
  assert.equal(await evaluate("window.__extraDiscovery"), 0, "scopeSet already schedules widened sources; UI must not rescan all sources");
});

for (const change of ["scope", "query"] as const) {
  test(`QEA-30 QEA-31: a real late Droid search receipt cannot survive ${change} change`, { timeout: 120_000 }, async t => {
    const ctx = await setupSessionsBrowser(t, { ports: { commands: { run: async () => ({ exit_code: 0, stderr: "",
      stdout: JSON.stringify([{ id: "droid-private", title: "Droid withdrawn hit", updated_at: "2026-11-12T12:00:00Z" }]) }) } } });
    if (!ctx) return;
    const { home, alpha, evaluate, waitFor, goto } = ctx;
    const scope = await (await home.request("/api/sessions/scope")).json() as ExternalSessionScopeView;
    assert.equal((await home.request("/api/sessions/scope", { method: "POST", body: { expected_revision: scope.scope_revision,
      sources: ["claude-code", "droid"].map(entry_id => ({ entry_id, allowed: true, directories: { mode: "all" } })) } })).status, 200);
    await home.host.sessions!.service.waitForDiscoveryIdle();
    await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "en");
    await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
    await evaluate(`document.querySelector('[data-sessions-view="all"]').click()`);
    await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 3");
    await evaluate(`(() => {
      const select = document.querySelector('[data-sessions-tool-filter]'); select.value = 'droid'; select.dispatchEvent(new Event('change', { bubbles: true }));
      const input = document.querySelector('[data-sessions-search]'); input.value = 'private body phrase'; input.dispatchEvent(new Event('input', { bubbles: true }));
      const original = window.fetch.bind(window); window.__droidReceived = false;
      window.fetch = async (input, init) => {
        const response = await original(input, init);
        if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/tool-search')) {
          window.fetch = original;
          if (!response.ok) throw new Error('Expected successful actual tool search');
          const body = await response.text();
          window.__droidReceived = true;
          await new Promise(resolve => { window.__releaseDroid = resolve; });
          return new Response(body, { status: response.status, headers: response.headers });
        }
        return response;
      };
    })()`);
    await waitFor("document.querySelector('[data-sessions-droid-bar]').hidden === false");
    await evaluate("document.querySelector('[data-sessions-droid-run]').click()");
    await waitFor("window.__droidReceived === true");
    if (change === "scope") {
      await evaluate(`document.querySelector('[data-work-surface="sessions"] [data-sessions-open-scope="tools"]').click()`);
      await waitFor(`Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-scope-allow="droid"]'))`);
      await evaluate(`(() => { document.querySelector('[data-scope-allow="droid"]').click(); document.querySelector('[data-sessions-scope-save]').click(); })()`);
      await waitFor("!document.querySelector('[data-sessions-scope-sheet]').open");
    } else {
      await evaluate(`(() => {
        const select = document.querySelector('[data-sessions-tool-filter]'); select.value = 'claude-code'; select.dispatchEvent(new Event('change', { bubbles: true }));
        const input = document.querySelector('[data-sessions-search]'); input.value = 'Fix contrast'; input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await waitFor(`document.querySelector('[data-sessions-body]').textContent.includes('Fix contrast')`);
    }
    await evaluate("window.__releaseDroid(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    assert.equal(await evaluate("document.querySelector('[data-sessions-body]').textContent.includes('Droid withdrawn hit')"), false);
    const current = await (await home.request("/api/sessions/scope")).json() as ExternalSessionScopeView;
    assert.equal(current.sources.find(row => row.entry_id === "claude-code")?.allowed, true, "another allowed source stays available");
  });
}

test("QEA-30: failed new-query read cannot reuse an older page cursor, and late query success cannot replace recovery", { timeout: 120_000 }, async t => {
  const ctx = await setupSessionsBrowser(t, { olderSessions: 101 });
  if (!ctx) return;
  const { home, alpha, evaluate, waitFor, goto } = ctx;
  const scope = await (await home.request("/api/sessions/scope")).json() as ExternalSessionScopeView;
  assert.equal((await home.request("/api/sessions/scope", { method: "POST", body: { expected_revision: scope.scope_revision,
    sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] } })).status, 200);
  await home.host.sessions!.service.waitForDiscoveryIdle();
  await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "en");
  await waitFor("Boolean(document.querySelector('[data-sessions-page=next]:not(:disabled)'))");
  await evaluate("document.querySelector('[data-sessions-page=next]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-page=previous]:not(:disabled)')) && Boolean(document.querySelector('[data-sessions-page=next]:not(:disabled)'))");
  await evaluate(`(() => {
    const original = window.fetch.bind(window); window.__queryFailed = false;
    window.fetch = async (input, init) => {
      if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/list')) {
        window.fetch = original; window.__queryFailed = true;
        return Response.json({ error: 'Fixture list temporarily unavailable' }, { status: 503 });
      }
      return original(input, init);
    };
    const input = document.querySelector('[data-sessions-search]'); input.value = 'Archive'; input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor("window.__queryFailed === true");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-sessions-page]:not(:disabled)'))"), false, "old query cursors are unavailable even after failure");
  await evaluate(`(() => {
    const original = window.fetch.bind(window); window.__listReceived = false;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/list')) {
        window.fetch = original;
        if (!response.ok) throw new Error('Expected recovered list response');
        const body = await response.text(); window.__listReceived = true;
        await new Promise(resolve => { window.__releaseList = resolve; });
        return new Response(body, { status: response.status, headers: response.headers });
      }
      return response;
    };
    const input = document.querySelector('[data-sessions-search]'); input.value = 'Archive '; input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor("window.__listReceived === true");
  await evaluate(`(() => { const input = document.querySelector('[data-sessions-search]'); input.value = 'Fix contrast'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1 && document.querySelector('[data-sessions-body]').textContent.includes('Fix contrast')");
  await evaluate("window.__releaseList(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.equal(await evaluate("document.querySelectorAll('[data-sessions-body] [data-session-key]').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-sessions-body]').textContent.includes('Fix contrast')"), true);
});

for (const stage of ["displayed", "late-response"] as const) {
  test(`QEA-31: saving a narrower scope clears ${stage} transcript and assistant context; reopening recovers`, { timeout: 120_000 }, async t => {
    const ctx = await setupSessionsBrowser(t);
    if (!ctx) return;
    const { alpha, evaluate, waitFor, goto } = ctx;
    await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "en");
    const setAllowed = async (allowed: boolean) => {
      await evaluate(`document.querySelector('[data-work-surface="sessions"] [data-sessions-open-scope="tools"]').click()`);
      await waitFor(`Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-scope-allow="claude-code"]'))`);
      await evaluate(`(() => {
        const box = document.querySelector('[data-scope-allow="claude-code"]');
        if (box.checked !== ${allowed}) box.click();
        document.querySelector('[data-sessions-scope-save]').click();
      })()`);
      await waitFor("!document.querySelector('[data-sessions-scope-sheet]').open");
    };
    await waitFor(`Boolean(document.querySelector('[data-work-surface="sessions"]:not([hidden]) [data-sessions-body]'))`);
    await setAllowed(true);
    await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
    if (stage === "late-response") {
      await evaluate(`(() => {
        const original = window.fetch.bind(window);
        window.__historyReceived = false;
        window.fetch = async (input, init) => {
          const response = await original(input, init);
          if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/history')) {
            window.fetch = original;
            if (!response.ok) throw new Error('Expected a real successful history receipt');
            window.__historyReceived = true;
            await new Promise(resolve => { window.__releaseHistory = resolve; });
          }
          return response;
        };
      })()`);
    }
    await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
    if (stage === "late-response") await waitFor("window.__historyReceived === true");
    else {
      await waitFor(`Boolean(document.querySelector('[data-sessions-detail] .mw-transcript'))`);
      await evaluate(`(() => { const original = window.fetch.bind(window); window.__currentHistoryReads = 0; window.fetch = (input, init) => {
        if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/history')) window.__currentHistoryReads++;
        return original(input, init);
      }; })()`);
      await setAllowed(true);
      await waitFor(`document.querySelector('[data-sessions-detail]')?.textContent.includes('Updated contrast token cleanly')`);
      assert.equal(await evaluate("window.__currentHistoryReads"), 1, "a still-authorized selection is re-read after saving scope");
    }
    await setAllowed(false);
    if (stage === "late-response") await evaluate("window.__releaseHistory(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 0");
    assert.deepEqual(await evaluate(`(() => {
      const pane = document.querySelector('[data-sessions-detail]');
      return { visibleTranscript: !pane.hidden && Boolean(pane.querySelector('.mw-transcript')),
        context: pane.getAttribute('data-assistant-context'), retainsBody: pane.textContent.includes('Updated contrast token cleanly') };
    })()`), { visibleTranscript: false, context: null, retainsBody: false });
    await setAllowed(true);
    await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
    await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
    await waitFor(`document.querySelector('[data-sessions-detail]')?.textContent.includes('Updated contrast token cleanly')`);
    assert.ok(await evaluate("Boolean(document.querySelector('[data-sessions-detail][data-assistant-context]'))"));
  });
}

for (const outcome of ["back", "failure"] as const) {
  test(`QEA-31: mobile history ${outcome} returns to a usable list without accepting a late transcript`, { timeout: 120_000 }, async t => {
    const ctx = await setupSessionsBrowser(t);
    if (!ctx) return;
    const { home, alpha, evaluate, waitFor, goto } = ctx;
    const scope = await (await home.request("/api/sessions/scope")).json() as ExternalSessionScopeView;
    await home.request("/api/sessions/scope", { method: "POST", body: { expected_revision: scope.scope_revision,
      sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] } });
    await home.host.sessions!.service.waitForDiscoveryIdle();
    await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 390, 844, "en");
    await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
    await evaluate(`(() => {
      const original = window.fetch.bind(window); window.__historyReceived = false;
      window.fetch = async (input, init) => {
        const response = await original(input, init);
        if (new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/api/sessions/history')) {
          window.fetch = original;
          if (!response.ok) throw new Error('Expected a real successful history receipt');
          const body = await response.text(); window.__historyReceived = true;
          await new Promise(resolve => { window.__releaseHistory = resolve; });
          return ${outcome === "failure" ? "Response.json({ message: 'Transport unavailable' }, { status: 503 })" : "new Response(body, { status: response.status, headers: response.headers })"};
        }
        return response;
      };
      document.querySelector('[data-sessions-body] [data-session-key]').click();
    })()`);
    await waitFor("window.__historyReceived === true");
    if (outcome === "back") {
      assert.equal(await evaluate("Boolean(document.querySelector('[data-sessions-back]')?.checkVisibility())"), true,
        "a waiting person can return before the response arrives");
      assert.equal(await evaluate("Boolean(document.querySelector('[data-sessions-detail][data-assistant-context]'))"), false);
      await evaluate("document.querySelector('[data-sessions-back]').click()");
    }
    await evaluate("window.__releaseHistory(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await waitFor("document.querySelector('[data-work-surface=\"sessions\"]').dataset.expanded === 'false'");
    assert.equal(await evaluate("Boolean(document.querySelector('[data-sessions-detail] .mw-transcript'))"), false);
    assert.equal(await evaluate("Boolean(document.querySelector('[data-sessions-detail][data-assistant-context]'))"), false);
    assert.equal(await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').checkVisibility()"), true);
    await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
    await waitFor("document.querySelector('[data-sessions-detail]')?.textContent.includes('Updated contrast token cleanly')");
  });
}

test("SRB-01 SRB-02 SRB-08 SRB-12: Sessions surface empty-scope -> Read Scope Sheet -> transcript, search highlight, Droid bar, mobile 390px, and English locale", { timeout: 180_000 }, async (t) => {
  const ctx = await setupSessionsBrowser(t);
  if (!ctx) return;
  const { alpha, harness, sessionId, evaluate, waitFor, goto } = ctx;

  await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "zh");
  await waitFor("Boolean(document.querySelector('[data-work-surface=\"sessions\"]:not([hidden]) [data-sessions-body] .sessions-empty-card'))");

  // Open Read Scope Sheet, inspect 3 groups (10 / 2 / 38), enable claude-code & droid across all directories, save.
  await evaluate("document.querySelector('[data-work-surface=\"sessions\"] [data-sessions-open-scope=\"tools\"]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-scope-allow=\"claude-code\"]'))");
  const groups = await evaluate<{ connected: number; text: string }>(`(() => {
    const panel = document.querySelector('[data-sessions-scope-panel="tools"]');
    return { connected: panel.querySelectorAll('[data-scope-tool]').length, text: panel.textContent || '' };
  })()`);
  assert.equal(groups.connected, 10);
  assert.match(groups.text, /Grok Build/u);
  assert.match(groups.text, /Amp/u);

  await evaluate(`(() => {
    document.querySelector('input[name="sessions-dir-mode"][value="all"]').click();
    for (const id of ['claude-code', 'droid']) {
      const box = document.querySelector('[data-scope-allow="' + id + '"]');
      if (!box.checked) box.click();
    }
    document.querySelector('[data-sessions-scope-save]').click();
  })()`);
  await waitFor("!document.querySelector('[data-sessions-scope-sheet]').open");
  await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");

  // Select session -> transcript, resume command, in-session search highlight, and Change Attribution dialog note.
  await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-detail]:not([hidden]) .mw-transcript'))");
  const detailInfo = await evaluate<{ hasResume: boolean; codeText: string }>(`(() => ({
    hasResume: Boolean(document.querySelector('[data-detail-copy-resume]')),
    codeText: document.querySelector('.sessions-resume-cmd code')?.textContent || '',
  }))()`);
  assert.equal(detailInfo.hasResume, true);
  assert.match(detailInfo.codeText, /claude/u);

  await evaluate(`(() => {
    const input = document.querySelector('[data-detail-query]');
    input.value = 'contrast';
    document.querySelector('[data-detail-search-run]').click();
  })()`);
  await waitFor("document.querySelectorAll('[data-sessions-detail] .mw-transcript__hit').length >= 1");

  await evaluate("document.querySelector('[data-sessions-detail] [data-detail-change-attr]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-attribution-dialog][open]'))");
  const attrText = await evaluate<string>("document.querySelector('[data-sessions-attribution-dialog]').textContent || ''");
  assert.match(attrText, /它连着的工具调用仍落在旧项目/u);
  await evaluate("document.querySelector('[data-sessions-attr-cancel]').click()");

  // Filtering to `droid` reveals the Droid search bar.
  await evaluate(`(() => {
    const sel = document.querySelector('[data-sessions-tool-filter]');
    sel.value = 'droid';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("document.querySelector('[data-sessions-droid-bar]')?.hidden === false");
  await evaluate(`(() => {
    const sel = document.querySelector('[data-sessions-tool-filter]');
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  // Responsive widths (1440, 1024, 390) + mobile back button + light/dark themes: zero horizontal overflow.
  // QEA-30: the reset tool filter is an owner query, not a synchronous filter of the first page.
  await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
  for (const theme of ["light", "dark"] as const) {
    await harness.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await harness.command("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w <= 480 }, sessionId);
      const overflow = await evaluate<number>("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      assert.ok(overflow <= 0, `${theme} ${w}px horizontal overflow=${overflow}`);
    }
  }
  await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
  await waitFor("document.querySelector('[data-work-surface=\"sessions\"]').dataset.expanded === 'true'");
  await evaluate("document.querySelector('[data-sessions-back]').click()");
  await waitFor("document.querySelector('[data-work-surface=\"sessions\"]').dataset.expanded === 'false'");

  // English locale (`en`): zero Chinese characters in the Sessions surface or Read Scope Sheet.
  await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "en");
  await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
  await evaluate("document.querySelector('[data-work-surface=\"sessions\"] [data-sessions-open-scope=\"tools\"]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-scope-tool]'))");
  const enWords = await evaluate<string>(`(() => {
    const s1 = document.querySelector('[data-work-surface="sessions"]')?.textContent || '';
    const s2 = document.querySelector('[data-sessions-scope-sheet]')?.textContent || '';
    return s1 + ' ' + s2;
  })()`);
  assert.equal(enWords.match(/[㐀-鿿]+/gu)?.join(" ") ?? "", "", "zero Chinese characters in English Sessions UI");
});

test("SRB-11 SRB-14 SRB-15 SRB-16: Unfiled filing, AI permit sheet + overlay return, Project Settings tool-brought confirmation, and Assistant untrusted strip", { timeout: 180_000 }, async (t) => {
  const ctx = await setupSessionsBrowser(t);
  if (!ctx) return;
  const { home, alpha, beta, evaluate, waitFor, goto } = ctx;

  const s0 = await (await home.request("/api/sessions/scope")).json() as { scope_revision: number };
  await home.request("/api/sessions/scope", {
    method: "POST",
    body: { expected_revision: s0.scope_revision, sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] },
  });
  await home.host.sessions!.service.waitForDiscoveryIdle();

  // 1. Unfiled view: payload & permit notes + filing to Beta.
  await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "zh");
  await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
  await evaluate("document.querySelector('[data-sessions-view=\"unfiled\"]').click()");
  await waitFor("document.querySelectorAll('[data-unfiled-card]').length === 1");
  const unfiledText = await evaluate<string>("document.querySelector('[data-sessions-body]').textContent || ''");
  assert.match(unfiledText, /AI 归属建议仅向你已配置的模型发送标题、脱敏目录、开头几句/u);
  await evaluate(`(() => {
    const sel = document.querySelector('[data-unfiled-select]');
    sel.value = ${JSON.stringify(beta.project_id)};
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-unfiled-file]').click();
  })()`);
  await waitFor("document.querySelectorAll('[data-unfiled-card]').length === 0");

  // 2. Overlay `molisOpenSessionsScope("project_ai_read", { overlay: true })`: toggle on reveals `回到对话`, toggle off shows irrevocable note.
  await evaluate("globalThis.molisOpenSessionsScope('project_ai_read', { overlay: true })");
  await waitFor("Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-permit-project].is-current'))");
  const permitText = await evaluate<string>("document.querySelector('[data-permit-project].is-current .mw-permit__meta')?.textContent || ''");
  assert.match(permitText, /归到这里 \d+ 条/);
  assert.doesNotMatch(permitText, /\{|\}/);
  await evaluate(`document.querySelector('[data-permit-switch="${alpha.project_id}"]').click()`);
  await waitFor("document.querySelector('[data-sessions-scope-return]')?.hidden === false");
  await evaluate(`document.querySelector('[data-permit-switch="${alpha.project_id}"]').click()`);
  await waitFor("(document.querySelector('[data-permit-project].is-current .mw-permit__note')?.textContent || '').includes('已经写进回答的内容不会收回')");
  await evaluate("document.querySelector('[data-sessions-scope-close]').click()");

  // 3. Assistant context strip on `sessions` surface: optional dashed chip -> `+` -> solid `不可信材料 · 仅本轮`.
  await evaluate("document.querySelector('[data-sessions-view=\"project\"]').click()");
  await waitFor("document.querySelectorAll('[data-sessions-body] [data-session-key]').length === 1");
  await evaluate("document.querySelector('[data-sessions-body] [data-session-key]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-detail]:not([hidden])[data-assistant-context]'))");
  await evaluate("document.querySelector('[data-assistant-composer] .mw-composer__input').focus()");
  await waitFor("Boolean(document.querySelector('[data-assistant-context-strip]:not([hidden]) .is-optional .assistant-strip-act'))");
  await evaluate("document.querySelector('[data-assistant-context-strip] .is-optional .assistant-strip-act').click()");
  await waitFor("(document.querySelector('[data-assistant-context-strip]')?.textContent || '').includes('不可信材料 · 仅本轮')");

  // 4. Project Settings `输入与输出`: tool-brought folder displays `工具带入 · 待确认` and promotes on `确认连入`.
  await evaluate("document.querySelector('.navigator-project-settings').click()");
  await waitFor("Boolean(document.querySelector('[data-directory-panel=\"project-settings\"] [data-settings-section=\"workspaces\"]'))");
  await evaluate("document.querySelector('[data-directory-panel=\"project-settings\"] [data-settings-section=\"workspaces\"]').click()");
  await waitFor("Boolean(document.querySelector('[data-project-directories][data-state=\"ready\"] [data-tool-brought=\"true\"]'))");
  const rowText = await evaluate<string>("document.querySelector('[data-tool-brought=\"true\"]').textContent || ''");
  assert.match(rowText, /工具带入 · 待确认/u);
  await evaluate("document.querySelector('[data-tool-brought=\"true\"] [data-act=\"confirm-input\"]').click()");
  await waitFor("document.querySelector('[data-project-directories]')?.dataset.state === 'ready' && !document.querySelector('[data-project-directories]').hasAttribute('aria-busy') && !document.querySelector('[data-project-directories] [data-tool-brought=\"true\"]')");
});

test("SRB-06 SRB-12: cloud connection row and account_changed recovery (login_expired -> account_changed -> two exits)", { timeout: 180_000 }, async (t) => {
  let mode: "login_expired" | "account_changed" = "login_expired";
  const fakeConnections = {
    current: (id: string) => id === "conn-gh" ? { enabled: true, account_label: "alice" } : null,
    choices: () => ({ choices: [{ connection_id: "conn-gh", display_name: "GitHub CLI", account_label: "alice" }], connect_service_id: "github" }),
    request: async () => ({ status: 404, headers: {}, body: "" }),
    command: async () => {
      if (mode === "account_changed") throw sessionSourceFailure("account_changed", "GitHub CLI 当前登录账号已变为另一账号", false);
      return { exit_code: 1, stderr: "HTTP 403: Resource not accessible by personal access token", stdout: "" };
    },
  };
  const ctx = await setupSessionsBrowser(t, { ports: { connections: fakeConnections } });
  if (!ctx) return;
  const { alpha, evaluate, waitFor, goto } = ctx;
  const scope = await (await ctx.home.request("/api/sessions/scope")).json() as { scope_revision: number };
  // The cloud row is visible and its connection can be selected; save enables discovery.
  await goto(`/projects/${alpha.project_id}/?openPlugin=sessions`, 1440, 900, "zh");
  await waitFor("Boolean(document.querySelector('[data-work-surface=\"sessions\"] .sessions-empty-card'))");
  await evaluate("document.querySelector('[data-work-surface=\"sessions\"] [data-sessions-open-scope=\"tools\"]').click()");
  await waitFor("Boolean(document.querySelector('[data-sessions-scope-sheet][open] [data-scope-allow=\"copilot-coding-agent\"]'))");
  await evaluate(`(() => {
    document.querySelector('input[name="sessions-dir-mode"][value="all"]').click();
    const box = document.querySelector('[data-scope-allow="copilot-coding-agent"]');
    if (!box.checked) box.click();
    document.querySelector('[data-sessions-scope-save]').click();
  })()`);
  await waitFor("document.querySelector('[data-source-entry=\"copilot-coding-agent\"]')?.textContent.includes('gh auth refresh')");
  // Retry after the terminal account changed: the source becomes account_changed and both exits are visible.
  mode = "account_changed";
  await evaluate("document.querySelector('[data-source-entry=\"copilot-coding-agent\"] [data-source-retry]').click()");
  await waitFor("(document.querySelector('[data-source-entry=\"copilot-coding-agent\"]')?.textContent || '').includes('切回原账号')");
  const actions = await evaluate<string>("document.querySelector('[data-source-entry=\"copilot-coding-agent\"]')?.textContent || ''");
  assert.match(actions, /我已在终端切回原账号，重新核对/u);
  assert.match(actions, /去读取范围改用新账号的连接/u);
  assert.ok(scope.scope_revision >= 0);
});
