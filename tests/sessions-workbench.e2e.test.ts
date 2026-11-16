import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// SRB-01..SRB-16: Real Chrome E2E verification of the Workbench Sessions surface, Read Scope Sheet (both tabs + overlay),
// Unfiled view, Droid search bar, Project Settings tool-brought folder confirmation, and Assistant untrusted context strip.

async function setupSessionsBrowser(t: TestContext) {
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

  // `node:test` executes `t.after` callbacks in registration (FIFO) order: close Chrome first, then Host/HTTP, then remove temp dir.
  let harness: ChromeHarness | undefined;
  t.after(async () => { await harness?.close(); });
  const home = await serveHomeRuntime(t, { sessions: { homeRoot: userHome, env: {} } });
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

test("SRB-01 SRB-08 SRB-12: Sessions surface empty-scope -> Read Scope Sheet -> transcript, search highlight, Droid bar, mobile 390px, and English locale", { timeout: 180_000 }, async (t) => {
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

test("SRB-03 SRB-09 SRB-14: Unfiled filing, AI permit sheet + overlay return, Project Settings tool-brought confirmation, and Assistant untrusted strip", { timeout: 180_000 }, async (t) => {
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
  assert.match(unfiledText, /AI 归属建议仅向你已配置的模型发送目录名/u);
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
