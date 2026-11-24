import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePageDraft, HomePageOverview, HomePageVersion } from "@molis-ai/molis-work-contracts/services/home";
import type { SurfaceGroup } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { HOME_PAGES_BASELINE, HOME_PAGES_HOME_STORE } from "@molis-ai/molis-work-service-home";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { createProject, LocalHostHttpClient, projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";
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
    document.dispatchEvent(new CustomEvent("molis-work:language-changed"));
    if (document.querySelector('[data-home-adopt-dialog] input[data-hp-grant="0"]').checked) throw Error("Language refresh granted an unchecked action");
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

  // P0 #2 regression: adopted generated home page stays centered in column 1 at 1440px (never shoved to right half).
  const columnMetrics = await browser.evaluate<{ left: number; width: number }>(`(() => {
    const col = document.querySelector('.immersive-home .mw-first-page__column');
    const r = col?.getBoundingClientRect();
    return { left: Math.round(r?.left ?? 9999), width: Math.round(r?.width ?? 0) };
  })()`);
  assert.ok(columnMetrics.left < 360 && columnMetrics.width >= 700, `adopted page column must be centered (got ${JSON.stringify(columnMetrics)})`);

  // P0 #4 regression: at 390px, version popover MUST stay inside viewport bounds (never clip off left edge).
  await browser.setViewport(390, 844, true);
  await browser.evaluate(`document.querySelector('[data-hp-act="toggle-versions"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-ver-popover]'))`, WAIT_MS);
  const mobilePop = await browser.evaluate<{ left: number; right: number }>(`(() => {
    const r = document.querySelector('[data-hp-ver-popover]').getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) };
  })()`);
  assert.ok(mobilePop.left >= 0 && mobilePop.right <= 390, `390px version popover must stay in viewport (got ${JSON.stringify(mobilePop)})`);
  await browser.evaluate(`document.querySelector('[data-hp-act="toggle-versions"]').click()`);
  await browser.setViewport(1440, 900, false);

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
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-act="conflict-pick"]') && document.querySelector('[data-hp-now-stage] iframe') && document.querySelector('[data-hp-draft-stage] iframe'))`, WAIT_MS);
  // P0 #1 regression: left side ("In use") MUST mount its live iframe cleanly alongside the right-side draft preview.
  const bothCompareFrames = await browser.evaluate<{ nowFrame: boolean; draftFrame: boolean }>(`({
    nowFrame: Boolean(document.querySelector('[data-hp-now-stage] iframe.home-generated-frame')),
    draftFrame: Boolean(document.querySelector('[data-hp-draft-stage] iframe.home-generated-frame')),
  })`);
  assert.equal(bothCompareFrames.nowFrame, true, "Plan B compare left pane (In use) MUST render live iframe");
  assert.equal(bothCompareFrames.draftFrame, true, "Plan B compare right pane (Draft) MUST render preview iframe");
  const blockedBeforePick = await browser.evaluate<boolean>(`Boolean(document.querySelector('[data-hp-act="open-adopt"]')?.disabled)`);
  assert.equal(blockedBeforePick, true, "adopt button MUST be disabled while manual-edit conflict is unresolved");
  // Choosing "merge" keeps adopt blocked so an unmerged AI draft cannot overwrite manual edits.
  await browser.evaluate(`document.querySelector('[data-hp-act="conflict-pick"][data-hp-pick="merge"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-act="conflict-pick"][data-hp-pick=""]'))`, WAIT_MS);
  const blockedOnMerge = await browser.evaluate<boolean>(`Boolean(document.querySelector('[data-hp-act="open-adopt"]')?.disabled)`);
  assert.equal(blockedOnMerge, true, "adopt button MUST remain disabled on 'merge' until edits are merged");
  // Switching choice to "mine" and clicking primary MUST keep manual v1 active (NEVER adopt assistant v2)!
  await browser.evaluate(`document.querySelector('[data-hp-act="conflict-pick"][data-hp-pick=""]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-act="conflict-pick"][data-hp-pick="mine"]'))`, WAIT_MS);
  await browser.evaluate(`document.querySelector('[data-hp-act="conflict-pick"][data-hp-pick="mine"]').click()`);
  await browser.waitFor(`document.querySelector('[data-hp-act="open-adopt"]')?.disabled === false`, WAIT_MS);
  await browser.evaluate(`document.querySelector('[data-hp-act="open-adopt"]').click()`);
  await browser.waitFor(`document.querySelector('[data-home-compare]')?.hidden === true`, WAIT_MS);
  const afterKeepMine = await client.post<HomePageOverview>(`/projects/${projectId}/api/home-pages/read`, {});
  assert.equal(afterKeepMine.selection.kind, "page");
  assert.equal(afterKeepMine.selection.version, 1, "choosing 'mine' MUST preserve manual v1 and never adopt assistant v2");

  // 5c. Design/isolation check failure ("不过的页面不进预览"): draft with literal hex color is refused by preview backend AND opens compare alert with ZERO preview iframe!
  const badDraft = probeDraft("检查不通过草稿", " .hp-panel { color: #ff00ff; }");
  const badSaved = await client.post<{ version: HomePageVersion }>(`/projects/${projectId}/api/home-pages/drafts/save`, {
    draft: badDraft,
    page_id: v1.page_id,
    expected_version: 2,
  });
  await assert.rejects(
    () => client.post(`/projects/${projectId}/api/home-pages/preview`, { page_id: badSaved.version.page_id, version: badSaved.version.version }),
    /home\.draft_invalid|字面颜色值/,
    "backend home.pages.preview@1 MUST refuse drafts failing design/isolation check",
  );
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${projectId}/` }, browser.sessionId));
  await browser.waitFor(`Boolean(document.querySelector('[data-home-draft-banner] [data-hp-act="compare"]'))`, WAIT_MS);
  await browser.evaluate(`document.querySelector('[data-home-draft-banner] [data-hp-act="compare"]').click()`);
  await browser.waitFor(`Boolean(document.querySelector('[data-hp-draft-stage] .mw-alert'))`, WAIT_MS);
  const failedPreviewCheck = await browser.evaluate<{ hasIframe: boolean; adoptDisabled: boolean }>(`({
    hasIframe: Boolean(document.querySelector('[data-hp-draft-stage] iframe')),
    adoptDisabled: Boolean(document.querySelector('[data-hp-act="open-adopt"]')?.disabled),
  })`);
  assert.equal(failedPreviewCheck.hasIframe, false, `failed check draft v${badSaved.version.version} MUST NOT mount a preview iframe`);
  assert.equal(failedPreviewCheck.adoptDisabled, true, "failed check draft MUST keep adopt disabled");
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

test("B37R-1 ONB-27: editing a merge starts with the person's text and approves only the saved new version", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  assert.ok(browser);
  const project = browser.projectId;
  assert.ok(project);
  const route = "/projects/" + project;
  const web = new LocalHostHttpClient({ origin: browser.origin, controlToken: browser.controlToken });
  const api = route + "/api/home-pages/";
  const draft = (text: string): HomePageDraft => ({
    title: "Review", entry: "index.html", actions: [],
    files: [{ path: "index.html", media_type: "text/html", text: "<main>" + text + "</main>" }],
  });
  const { version: first } = await web.post<{ version: HomePageVersion }>(api + "drafts/save", { draft: draft("My notes") });
  const overview = () => web.post<HomePageOverview>(api + "read", {});
  await web.post(api + "adopt", { page_id: first.page_id, version: 1, approved_actions: [], request_id: "original", expected_revision: (await overview()).revision });
  const reference = molisWorkHostProjectReference({ projectId: project, databasePath: browser.databasePath });
  assert.ok(browser.localHost);
  await browser.localHost.actionClient(reference).invoke({ actor_id: "editor", audience: "agent", project_id: project, permissions: ["home:write", "home:read"] },
    { capability_id: "home.pages.drafts.save", version: 1 }, { draft: draft("Proposed notes"), page_id: first.page_id, expected_version: 1, based_on: 1 });
  const visit = () => browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + route + "/" }, browser.sessionId));
  const compare = async () => {
    const banner = '[data-home-draft-banner] [data-hp-act="compare"]';
    await browser.waitFor("!!document.querySelector(" + JSON.stringify(banner) + ")");
    await browser.click(banner);
    await browser.waitFor("!!document.querySelector('[data-hp-pick=mine]')");
  };
  await visit();
  await compare();
  await browser.click("[data-hp-pick=mine]");
  await browser.click("[data-hp-act=open-adopt]");
  assert.deepEqual((await overview()).selection, { kind: "page", page_id: first.page_id, version: 1 });
  await visit();
  await compare();
  await browser.click("[data-hp-pick=merge]");
  await browser.waitFor("document.querySelector('[data-hp-merge] textarea')?.value === '<main>My notes</main>'");
  await browser.evaluate("document.querySelector('[data-hp-merge] textarea').value = '<main>My notes and proposed notes</main>'");
  await browser.click("[data-hp-merge-save]");
  await browser.waitFor("!!document.querySelector('[data-hp-act=open-adopt]:enabled') && !document.querySelector('[data-hp-merge]')");
  assert.deepEqual((await overview()).selection, { kind: "page", page_id: first.page_id, version: 1 });
  await browser.click("[data-hp-act=open-adopt]");
  await browser.click("[data-hp-act=dialog-confirm]");
  await browser.waitFor("!!document.querySelector('[data-home-generated-body] iframe')");
  assert.deepEqual((await overview()).selection, { kind: "page", page_id: first.page_id, version: 3 });
  const read = (version: number) => web.post<{ files: Array<{ text: string }> }>(api + "files/read", { page_id: first.page_id, version });
  assert.equal((await read(3)).files[0]?.text, "<main>My notes and proposed notes</main>");
  assert.equal((await read(1)).files[0]?.text, "<main>My notes</main>");
});

test("SPC-11 ONB-26: a pending approved write cannot outlive its page version or project", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  assert.ok(browser?.localHost && browser.projectId);
  const { localHost, projectId, web } = browser;
  const root = `/projects/${projectId}`;
  const otherProject = await createProject(web, "另一个项目");
  const ledger = join(browser.homeDirectory, "saved-notes.txt");
  appendFileSync(ledger, "");
  const schema = { type: "object" as const, properties: {}, additionalProperties: false };
  const capabilityId = "fixture.review.notes.save";
  let started = Promise.withResolvers<void>();
  let release = Promise.withResolvers<void>();
  let finished = Promise.withResolvers<void>();
  const unregister = localHost.registerAction({
    capability_id: capabilityId, version: 1, operation: "command",
    action: {
      title: "保存条目", description: "等待工作结束后保存条目", kind: "operation",
      effect: "write", scope: "project", scheduling: "concurrent", audiences: ["user", "plugin"],
      permissions: [], subject_kinds: [], input_schema: schema, output_schema: schema,
    },
  }, async (_runtime, _input, caller) => {
    started.resolve();
    try {
      await release.promise;
      await caller.beforeEffect();
      appendFileSync(ledger, "saved\n");
      return {};
    } finally {
      finished.resolve();
    }
  });
  t.after(() => { release.resolve(); unregister(); });
  const project = molisWorkHostProjectReference({ projectId, databasePath: browser.databasePath });
  const directory = await localHost.inspectActions(await localHost.localPersonContext(project), project);
  const descriptor = directory.find(entry => entry.capability_id === capabilityId);
  assert.ok(descriptor);
  const action: ExactActionReference = { capability_id: capabilityId, version: 1, provider_id: descriptor.provider.provider_id };
  const post = <T,>(path: string, body: Record<string, unknown> = {}) => web.post<T>(`${root}/api/home-pages/${path}`, body);
  const save = async (draft: HomePageDraft, previous?: HomePageVersion) => (await post<{ version: HomePageVersion }>("drafts/save", {
    draft, ...(previous ? { page_id: previous.page_id, expected_version: previous.version } : {}),
  })).version;
  const currentRevision = async () => (await post<HomePageOverview>("read")).revision;
  const visit = (path: string) => browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + path }, browser.sessionId));
  const slowPage = await save({
    title: "等待保存", entry: "index.html", actions: [action], files: [
      { path: "index.html", media_type: "text/html", text: '<main>核对本条记录</main><script src="work.js"></script>' },
      { path: "work.js", media_type: "text/javascript", text: `if (window.molisHomePage.mode === "live") window.molisHomePage.invokeAction(${JSON.stringify(action)}, {}).catch(() => {});` },
    ],
  });
  const nextPage = await save({
    title: "下一版", entry: "index.html", actions: [],
    files: [{ path: "index.html", media_type: "text/html", text: "<main>下一版</main>" }],
  }, slowPage);
  assert.equal(nextPage.page_id, slowPage.page_id);
  assert.equal(nextPage.version, slowPage.version + 1);
  for (const change of ["replace", "withdraw", "switch"]) {
    started = Promise.withResolvers<void>();
    release = Promise.withResolvers<void>();
    finished = Promise.withResolvers<void>();
    await visit(`/projects/${otherProject.project_id}/`);
    await post(change === "replace" ? "adopt" : "restore", {
      page_id: slowPage.page_id, version: slowPage.version, approved_actions: [action],
      expected_revision: await currentRevision(), request_id: `start-${change}`,
    });
    await visit(`${root}/`);
    await started.promise;
    if (change === "replace") {
      await post("adopt", { page_id: nextPage.page_id, version: nextPage.version, approved_actions: [], expected_revision: await currentRevision(), request_id: "replace" });
    } else if (change === "withdraw") {
      await post("select", { kind: "basic", expected_revision: await currentRevision(), request_id: "withdraw" });
    } else {
      await browser.click("[data-top-corner-toggle]");
      const row = `[data-corner-project='${otherProject.project_id}']`;
      await browser.waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`);
      await browser.click(row);
      await browser.navigate(() => browser.click(`[data-corner-pages='${otherProject.project_id}'] a.top-corner-page`));
      await browser.waitFor("Boolean(document.querySelector('[data-top-corner-toggle]'))");
    }
    release.resolve();
    await finished.promise;
    assert.equal(readFileSync(ledger, "utf8"), "", change);
  }
});

test("SPC-11: the basic and generated home share the owner's presentation only after its separate approval", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  assert.ok(browser?.projectId && browser.localHost);
  const { projectId, web } = browser;
  const root = `/projects/${projectId}`;
  const visit = () => browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + root + "/" }, browser.sessionId));
  const title = "核对两种首页的字段";
  const created = await web.post<{ goal: { goal_id: string } }>(root + "/api/plugins/io.molis.work.goals/goals", {
    title, outcome: "读取同一份呈现声明", idempotency_key: "compare-presentation",
  });
  const subject = { kind: "goal", id: created.goal.goal_id };
  const basic = await web.post<SurfaceHomeDisplay>(root + "/api/host/surface-home", {});
  const expected = basic.groups.flatMap(group => group.items).find(item => item.subject.id === subject.id && item.subject.kind === subject.kind);
  assert.ok(expected && expected.fields.some(field => field.role === "title"));
  const project = molisWorkHostProjectReference({ projectId, databasePath: browser.databasePath });
  const directory = await browser.localHost.inspectActions(await browser.localHost.localPersonContext(project), project);
  const reference = (id: string): ExactActionReference => {
    const action = directory.find(view => view.capability_id === id);
    assert.ok(action);
    return { capability_id: id, version: action.version, provider_id: action.provider.provider_id };
  };
  const compose = reference("surfaces.compose"), values = reference("goals.presentation.values");
  const script = `const compose = ${JSON.stringify(compose)}, values = ${JSON.stringify(values)}, subject = ${JSON.stringify(subject)};
    (async () => {
      const { groups } = await window.molisHomePage.invokeAction(compose, { slot: { kind: "home" }, subjects: [subject] });
      let title;
      if (groups.length) {
        const item = groups.flatMap(group => group.items)[0];
        const result = await window.molisHomePage.invokeAction(values, { subjects: [subject], fields: item.fields.map(field => field.key) });
        title = result.items[0].values.title;
        document.querySelector("h2").textContent = title;
      }
      window.parent.postMessage({ type: "owner-presentation", groups, title }, "*");
    })().catch(error => window.parent.postMessage({ type: "owner-presentation", error: error.message }, "*"));`;
  const draft: HomePageDraft = {
    title: "项目条目", entry: "index.html", actions: [compose, values], files: [
      { path: "index.html", media_type: "text/html", text: '<main><h2>项目条目</h2><script src="card.js"></script></main>' },
      { path: "card.js", media_type: "text/javascript", text: script },
    ],
  };
  await browser.command("Page.addScriptToEvaluateOnNewDocument", {
    source: 'window.addEventListener("message", event => { if (event.data?.type === "owner-presentation") window.ownerPresentation = event.data; });',
  }, browser.sessionId);
  const pages = root + "/api/home-pages/";
  for (const withValues of [false, true]) {
    const { version } = await web.post<{ version: HomePageVersion }>(pages + "drafts/save", { draft });
    await web.post(pages + "adopt", { page_id: version.page_id, version: version.version, approved_actions: withValues ? [compose, values] : [compose],
      expected_revision: (await web.post<HomePageOverview>(pages + "read", {})).revision, request_id: "present-" + withValues });
    await visit();
    await browser.waitFor("Boolean(window.ownerPresentation)");
    const seen = await browser.evaluate<{ groups: SurfaceGroup[]; title?: string; error?: string }>("window.ownerPresentation");
    assert.equal(seen.error, undefined);
    if (!withValues) {
      assert.deepEqual(seen.groups, []);
      continue;
    }
    assert.deepEqual(seen.groups.map(group => group.owner_plugin_id), [expected.owner_plugin_id]);
    const [group] = seen.groups;
    assert.ok(group);
    assert.equal(group.plugin_card?.summary, undefined, "the owner's private overview remains private");
    assert.deepEqual(group.items[0]?.fields, expected.fields);
    assert.equal(group.items[0]?.form, expected.form);
    assert.equal(seen.title, title);
  }
});
