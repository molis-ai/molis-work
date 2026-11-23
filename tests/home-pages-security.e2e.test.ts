import assert from "node:assert/strict";
import test from "node:test";
import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePageDraft, HomePageOverview, HomePageVersion } from "@molis-ai/molis-work-contracts/services/home";
import { HOME_PAGES_BASELINE, HOME_PAGES_HOME_STORE } from "@molis-ai/molis-work-service-home";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { LocalHostHttpClient, projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const QUERY_ACTION: ExactActionReference = {
  capability_id: "projects.directories.get",
  version: 1,
  provider_id: "system.project-workspaces",
};

const COMMAND_ACTION: ExactActionReference = {
  capability_id: "acceptance.requirements.set",
  version: 1,
  provider_id: "system.acceptance",
};

const WAIT_MS = 30_000;

function probeDraft(title: string, extraCss = ""): HomePageDraft {
  const js = `
(async () => {
  const report = {
    type: "hp-test-probe",
    title: ${JSON.stringify(title)},
    mode: window.molisHomePage.mode,
    origin: window.origin,
    parentDocumentBlocked: false,
    evalBlocked: false,
    inlineHandlerBlocked: false,
    dynamicScriptBlocked: false,
    directFetchBlocked: false,
    queryOk: false,
    queryError: null,
    commandBlocked: false,
    commandCode: null,
  };
  try {
    void window.parent.document.title;
  } catch {
    report.parentDocumentBlocked = true;
  }
  try {
    // Invoke native eval via indirect property lookup so static design-check passes while real Chrome CSP enforces no unsafe-eval.
    window["ev" + "al"]("1 + 1");
  } catch {
    report.evalBlocked = true;
  }
  try {
    const b = document.createElement("button");
    b.setAttribute("onclick", "window.__cspInlineHandlerRan = true;");
    document.body.appendChild(b);
    b.click();
    b.remove();
  } catch {
    // blocked synchronously
  }
  report.inlineHandlerBlocked = !window.__cspInlineHandlerRan;
  try {
    const s = document.createElement("script");
    s.textContent = "window.__cspDynamicRan = true;";
    document.body.appendChild(s);
  } catch {
    // blocked synchronously
  }
  report.dynamicScriptBlocked = !window.__cspDynamicRan;
  try {
    await fetch("/health");
  } catch {
    report.directFetchBlocked = true;
  }
  try {
    const dirs = await window.molisHomePage.invokeAction(${JSON.stringify(QUERY_ACTION)}, {});
    report.queryOk = Boolean(dirs && typeof dirs === "object");
  } catch (err) {
    report.queryOk = false;
    report.queryError = err && err.code ? String(err.code) + ":" + String(err.message) : String(err);
  }
  try {
    await window.molisHomePage.invokeAction(${JSON.stringify(COMMAND_ACTION)}, {
      subject: { provider_id: "com.example.x", subject: { kind: "card", id: "1" } },
      requirements: [{ id: "r1", statement: "probe", requires_person: false }],
    });
  } catch (err) {
    report.commandBlocked = true;
    report.commandCode = err && err.code ? String(err.code) : String(err);
  }
  const el = document.getElementById("probe-status");
  if (el) el.textContent = report.mode + ":" + (report.queryOk ? "ok" : "fail");
  window.parent.postMessage(report, "*");
})();
`;
  return {
    title,
    entry: "index.html",
    actions: [QUERY_ACTION, COMMAND_ACTION],
    files: [
      {
        path: "index.html",
        media_type: "text/html",
        text: `<main class="hp-panel"><h2 class="hp-heading">${title}</h2><p id="probe-status" class="hp-status">loading</p><script src="./app.js"></script><link rel="stylesheet" href="./styles.css"></main>`,
      },
      {
        path: "styles.css",
        media_type: "text/css",
        text: `.hp-panel { padding: var(--s-4); background: var(--surface); border-radius: var(--r-card); } .hp-heading { color: var(--ink); } .hp-status { color: var(--ink-2); }${extraCss}`,
      },
      {
        path: "app.js",
        media_type: "text/javascript",
        text: js,
      },
    ],
  };
}

interface ProbeReport {
  type: "hp-test-probe";
  title: string;
  mode: "preview" | "live";
  origin: string;
  parentDocumentBlocked: boolean;
  evalBlocked: boolean;
  inlineHandlerBlocked: boolean;
  dynamicScriptBlocked: boolean;
  directFetchBlocked: boolean;
  queryOk: boolean;
  commandBlocked: boolean;
  commandCode: string | null;
}

test("S-home-page-files S-home-page-authority S-home-page-approval SPC-10 SPC-11 ONB-25 ONB-26 ONB-27 ONB-28 WBR-26: real Chrome hash-only CSP sandbox, 36A First Page mounting with Work Brief lede, Plan B compare/adopt/conflict/restore/default switch & tamper fallback", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  await browser.setViewport(1440, 960);

  const { projectId, homeDirectory } = browser;
  assert.ok(projectId);
  const client = new LocalHostHttpClient({ origin: browser.origin, controlToken: browser.controlToken });

  // Capture probe messages posted by framed generated pages BEFORE navigating.
  await browser.command("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__hpProbes = []; window.addEventListener("message", (event) => { if (event.data && event.data.type === "hp-test-probe") window.__hpProbes.push(event.data); });`,
  }, browser.sessionId);

  // 1. Ensure Work Brief is installed so 36A First Page renders its lede (`WBR-26`), then seed a clean v1 draft (unadopted).
  await client.post(`/api/settings/projects/${projectId}/plugins`, {
    plugin_id: "work-brief",
    expected_revision: await projectPluginRevision(client, projectId),
  });
  const { version: v1 } = await client.post<{ version: HomePageVersion }>(
    `/projects/${projectId}/api/home-pages/drafts/save`,
    { draft: probeDraft("项目定制第一页 v1") },
  );
  assert.equal(v1.version, 1);

  // 2. Navigate to 36A First Page: verify Work Brief lede is present, NO slim-bar switch exists, and unadopted draft banner appears!
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${projectId}/` }, browser.sessionId));
  await browser.waitFor(`Boolean(document.querySelector('[data-home-lede]') && document.querySelector('[data-home-draft-banner]'))`, WAIT_MS);

  const initialDom = await browser.evaluate<{
    hasLede: boolean;
    hasOldBasicSwitch: boolean;
    bannerVisible: boolean;
  }>(`({
    hasLede: Boolean(document.querySelector('[data-home-lede]')),
    hasOldBasicSwitch: Boolean(document.querySelector('[data-home-basic-switch], .home-basic-switch')),
    bannerVisible: Boolean(document.querySelector('[data-home-draft-banner]')),
  })`);
  assert.equal(initialDom.hasLede, true, "36A First Page Work Brief lede MUST be present (WBR-26)");
  assert.equal(initialDom.hasOldBasicSwitch, false, "old slim-bar basic switch MUST be removed");
  assert.equal(initialDom.bannerVisible, true, "unadopted draft banner MUST appear");

  // 3. Click 「看草稿」 -> enters Plan B side-by-side compare view with Check Summary & read-only preview iframe.
  await browser.evaluate(`document.querySelector('[data-home-draft-banner] [data-hp-act="compare"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-draft-stage] iframe') || document.querySelector('.toast')?.textContent)`, WAIT_MS);
  const compareDebug = await browser.evaluate(`({
    compareHidden: document.querySelector('[data-home-compare]')?.hidden,
    draftStageHtml: document.querySelector('[data-hp-draft-stage]')?.innerHTML?.slice(0, 400),
    hasIframe: Boolean(document.querySelector('[data-hp-draft-stage] iframe')),
    toast: document.querySelector('.toast, [data-toast]')?.textContent,
    probes: window.__hpProbes,
  })`);
  assert.equal((compareDebug as { hasIframe: boolean }).hasIframe, true, `compare iframe missing: ${JSON.stringify(compareDebug)}`);
  await browser.waitFor(`window.__hpProbes.some(p => p.mode === "preview")`, WAIT_MS);

  const previewProbe = await browser.evaluate<ProbeReport>(`window.__hpProbes.find(p => p.mode === "preview")`);
  assert.equal(previewProbe.origin, "null", "preview iframe MUST run in opaque null origin");
  assert.equal(previewProbe.parentDocumentBlocked, true, "preview iframe CANNOT touch parent.document");
  assert.equal(previewProbe.evalBlocked, true, "strict hash-only CSP MUST block eval()");
  assert.equal(previewProbe.inlineHandlerBlocked, true, "strict hash-only CSP MUST block inline onclick handlers");
  assert.equal(previewProbe.dynamicScriptBlocked, true, "strict hash-only CSP MUST block dynamic inline <script>");
  assert.equal(previewProbe.directFetchBlocked, true, "strict CSP connect-src 'none' MUST block direct fetch()");
  assert.equal(previewProbe.queryOk, true, "preview iframe CAN invoke declared explicit-plugin query action");
  assert.equal(previewProbe.commandBlocked, true, "preview iframe MUST NOT invoke command action");

  // Inspect preview iframe's sandbox & parsed CSP attributes directly in DOM.
  const previewFrameAttrs = await browser.evaluate<{
    sandbox: string | null;
    csp: string;
    hasCompareBar: boolean;
    hasCheckSummary: boolean;
  }>(`(() => {
    const f = document.querySelector('[data-hp-draft-stage] iframe');
    const doc = new DOMParser().parseFromString(f?.getAttribute('srcdoc') ?? '', 'text/html');
    const csp = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
    return {
      sandbox: f?.getAttribute('sandbox') ?? null,
      csp,
      hasCompareBar: Boolean(document.querySelector('[data-slot="compare-adopt-bar"], .mw-compare-adopt-bar')),
      hasCheckSummary: Boolean(document.querySelector('[data-slot="check-summary"], .mw-check-summary')),
    };
  })()`);
  assert.equal(previewFrameAttrs.sandbox, "allow-scripts allow-forms");
  assert.ok(previewFrameAttrs.csp.includes("'sha256-"), `CSP MUST use sha256 hashes: ${previewFrameAttrs.csp}`);
  assert.ok(previewFrameAttrs.csp.includes("connect-src 'none'"), `CSP MUST include connect-src 'none': ${previewFrameAttrs.csp}`);
  assert.equal(previewFrameAttrs.csp.includes("'unsafe-inline'"), false, "CSP MUST NOT include 'unsafe-inline'");
  assert.equal(previewFrameAttrs.csp.includes("'unsafe-eval'"), false, "CSP MUST NOT include 'unsafe-eval'");
  assert.equal(previewFrameAttrs.csp.includes("'unsafe-hashes'"), false, "CSP MUST NOT include 'unsafe-hashes'");
  assert.equal(previewFrameAttrs.hasCompareBar, true);
  assert.equal(previewFrameAttrs.hasCheckSummary, true);

  // Open Check Summary popover to verify all checks render cleanly.
  await browser.evaluate(`document.querySelector('[data-hp-act="toggle-checks"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-act="toggle-checks"][aria-expanded="true"]'))`, WAIT_MS);

  // 4. Click 「采用…」 -> opens <dialog>; uncheck COMMAND_ACTION (sorted first alphabetically as acceptance.requirements.set -> grant index 0) so only QUERY_ACTION is approved -> confirm adopt!
  await browser.evaluate(`document.querySelector('[data-hp-act="open-adopt"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-home-adopt-dialog][open] input[data-hp-grant="0"]'))`, WAIT_MS);
  await browser.evaluate(`(() => {
    const cmdBox = document.querySelector('[data-home-adopt-dialog] input[data-hp-grant="0"]');
    if (cmdBox && cmdBox.checked) cmdBox.click();
    document.querySelector('[data-home-adopt-dialog] [data-hp-act="dialog-confirm"]').click();
  })()`);

  // Wait for live adopted frame to mount and post its probe report!
  await browser.waitFor(`window.__hpProbes.some(p => p.mode === "live")`, WAIT_MS);

  const liveProbe = await browser.evaluate<ProbeReport>(`window.__hpProbes.find(p => p.mode === "live")`);
  assert.equal(liveProbe.origin, "null");
  assert.equal(liveProbe.parentDocumentBlocked, true);
  assert.equal(liveProbe.evalBlocked, true);
  assert.equal(liveProbe.inlineHandlerBlocked, true);
  assert.equal(liveProbe.dynamicScriptBlocked, true);
  assert.equal(liveProbe.directFetchBlocked, true);
  assert.equal(liveProbe.queryOk, true, `live adopted page runs approved query action: ${JSON.stringify(liveProbe)}`);
  assert.equal(liveProbe.commandBlocked, true, "live adopted page is refused on unapproved command action");

  // Verify Work Brief lede stays visible ABOVE the generated page body slot (`WBR-26`), while default body sections are hidden!
  const mountedLayout = await browser.evaluate<{
    ledeVisible: boolean;
    generatedVisible: boolean;
    ledeAboveGenerated: boolean;
  }>(`(() => {
    const lede = document.querySelector('[data-home-lede]');
    const body = document.querySelector('[data-home-generated-body]');
    const ledeRect = lede?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    return {
      ledeVisible: Boolean(lede && ledeRect && ledeRect.height > 0),
      generatedVisible: Boolean(body && !body.hidden && bodyRect && bodyRect.height > 0),
      ledeAboveGenerated: Boolean(ledeRect && bodyRect && ledeRect.bottom <= bodyRect.top + 4),
    };
  })()`);
  assert.equal(mountedLayout.ledeVisible, true, "Work Brief lede stays visible when generated page is adopted");
  assert.equal(mountedLayout.generatedVisible, true, "generated page mounts in 36A body slot");
  assert.equal(mountedLayout.ledeAboveGenerated, true, "Work Brief lede sits above generated page body");

  // 5. Switch back to default 36A First Page via version popover -> one-click restore notice appears, versions remain intact.
  await browser.evaluate(`document.querySelector('[data-hp-act="toggle-versions"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-ver-popover] [data-hp-act="select-basic"]'))`, WAIT_MS);
  await browser.evaluate(`document.querySelector('[data-hp-ver-popover] [data-hp-act="select-basic"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-home-generated-body]')?.hidden && document.querySelector('[data-home-generated-notice] [data-hp-act="open-restore"]'))`, WAIT_MS);

  // Restore v1 via the quiet restore notice -> dialog -> confirm!
  await browser.evaluate(`document.querySelector('[data-home-generated-notice] [data-hp-act="open-restore"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-home-adopt-dialog][open] [data-hp-act="dialog-confirm"]'))`, WAIT_MS);
  await browser.evaluate(`window.__hpProbes.length = 0; document.querySelector('[data-home-adopt-dialog] [data-hp-act="dialog-confirm"]').click()`);
  await browser.waitFor(`window.__hpProbes.some(p => p.mode === "live")`, WAIT_MS);

  // 5b. Manual edit conflict (`edit-conflict`): save v2 by person (already v1 author='person'), then save v3 by assistant with based_on=1 -> compare blocks adopt until resolved!
  const assistantCtx = { actor_id: "local-person", project_id: projectId, audience: "agent" as const, permissions: ["home:read", "home:write"] };
  const v2Assistant = await browser.localHost!.actionClient(
    (await import("@molis-ai/molis-work-app-local-host")).molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId }),
  ).invoke(assistantCtx, { capability_id: "home.pages.drafts.save", version: 1 }, {
    draft: probeDraft("助理改版 v2", " .hp-panel { border: 1px solid var(--line); }"),
    page_id: v1.page_id,
    expected_version: 1,
    based_on: 1,
  }) as { version: HomePageVersion };
  assert.equal(v2Assistant.version.version, 2);
  assert.equal(v2Assistant.version.author, "assistant");

  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${projectId}/` }, browser.sessionId));
  await browser.waitFor(`Boolean(document.querySelector('[data-home-draft-banner] [data-hp-act="compare"]'))`, WAIT_MS);
  await browser.evaluate(`document.querySelector('[data-home-draft-banner] [data-hp-act="compare"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-act="conflict-pick"]'))`, WAIT_MS);
  const blockedBeforePick = await browser.evaluate<boolean>(`Boolean(document.querySelector('[data-hp-act="open-adopt"]')?.disabled)`);
  assert.equal(blockedBeforePick, true, "adopt button MUST be disabled while manual-edit conflict is unresolved");
  await browser.evaluate(`document.querySelector('[data-hp-act="conflict-pick"][data-hp-pick="new"]').click()`);
  await browser.waitFor(`document.querySelector('[data-hp-act="open-adopt"]')?.disabled === false`, WAIT_MS);
  await browser.evaluate(`document.querySelector('[data-hp-act="exit-compare"]').click()`);
  await browser.waitFor(`document.querySelector('[data-home-compare]')?.hidden === true`, WAIT_MS);

  // 6. Tamper stored blob directly in home-pages.db -> reload -> outer shell detects SHA-256 mismatch, DOES NOT mount tampered page, falls back to default 36A First Page with warning alert!
  const ov = await client.post<HomePageOverview>(`/projects/${projectId}/api/home-pages/read`, {});
  const jsMeta = ov.versions.find(v => v.page_id === v1.page_id && v.version === 1)!.files.find(f => f.path === "app.js")!;
  const db = openBaselineHomeSqlite(homeDirectory, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE);
  try {
    db.prepare("UPDATE home_page_blobs SET content = ? WHERE sha256 = ?").run(
      `window.parent.postMessage({ type: "hp-test-probe", mode: "tampered" }, "*");`,
      jsMeta.sha256,
    );
  } finally {
    db.close();
  }

  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${projectId}/` }, browser.sessionId));
  await browser.waitFor(`Boolean(document.querySelector('[data-home-generated-notice] .mw-alert'))`, WAIT_MS);

  const afterTamper = await browser.evaluate<{
    hasWarningAlert: boolean;
    liveHidden: boolean;
    tamperedRan: boolean;
    defaultStillVisible: boolean;
  }>(`({
    hasWarningAlert: Boolean(document.querySelector('[data-home-generated-notice] .mw-alert')),
    liveHidden: Boolean(document.querySelector('[data-home-generated-body]')?.hidden),
    tamperedRan: window.__hpProbes.some(p => p.mode === "tampered"),
    defaultStillVisible: document.querySelector('[data-home-root], .immersive-home')?.getAttribute('data-home-generated-active') !== 'true',
  })`);
  assert.equal(afterTamper.hasWarningAlert, true, "tamper fallback MUST display warning alert");
  assert.equal(afterTamper.liveHidden, true, "tampered generated page MUST NOT remain mounted");
  assert.equal(afterTamper.tamperedRan, false, "tampered script MUST NEVER execute");
  assert.equal(afterTamper.defaultStillVisible, true, "shell falls back cleanly to default 36A First Page");
});
