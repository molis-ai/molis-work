import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HOME_PAGE_SESSION_HEADER, HomePageSessionRegistry, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import {
  ActionError,
  LOCAL_PERSON_ACTOR_ID,
  bindActionHandler,
  type ActionCallContext,
  type ActionDefinition,
  type ExactActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ContentAdoptionResult } from "@molis-ai/molis-work-contracts/platform/blueprints";
import {
  HOME_PAGE_RETENTION,
  homePageActions,
  type HomePageApprovalReceipt,
  type HomePageDiffResult,
  type HomePageDraft,
  type HomePageOverview,
  type HomePagePreviewResult,
  type HomePageReadResult,
  type HomePageSelectResult,
  type HomePageVersion,
} from "@molis-ai/molis-work-contracts/services/home";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  HOME_PAGES_BASELINE,
  HOME_PAGES_HOME_STORE,
  HomePagesStore,
  homePageActionHandlers,
  inspectHomePageDesign,
  openHomePagesDatabase,
  purgeHomePagesProject,
  type HomePagesPorts,
} from "@molis-ai/molis-work-service-home";
import { heldHomeSqlite, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";

const QUERY_ACTION: ExactActionReference = {
  capability_id: "projects.directories.get",
  version: 1,
  provider_id: "system.project-workspaces",
};

const COMMAND_ACTION: ExactActionReference = {
  capability_id: "materials.recent.record",
  version: 1,
  provider_id: "system.project-workspaces",
};

const AGENT_ONLY_ACTION: ExactActionReference = {
  capability_id: "acceptance.deliveries.record",
  version: 1,
  provider_id: "system.acceptance",
};

function sampleDraft(title: string, extraCss = "", actions: ExactActionReference[] = [QUERY_ACTION]): HomePageDraft {
  return {
    title,
    entry: "index.html",
    actions,
    files: [
      {
        path: "index.html",
        media_type: "text/html",
        text: `<main class="hp-card"><h2 class="hp-title">${title}</h2><p id="out" class="hp-out"></p><script src="./app.js"></script></main>`,
      },
      {
        path: "styles.css",
        media_type: "text/css",
        text: `.hp-card { padding: var(--s-4); background: var(--surface); border-radius: var(--r-card); }${extraCss}`,
      },
      {
        path: "app.js",
        media_type: "text/javascript",
        text: `document.getElementById("out").textContent = ${JSON.stringify(title)};`,
      },
    ],
  };
}

test("SPC-10 ONB-25 ONB-26 ONB-27 WBR-26: home page lifecycle — draft save, blueprint content adoption, diff, adopt, idempotency, restore, basic switch, design check, retention & project cleanup", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("Generated Home Lifecycle");
  const other = await f.project("Other Project");
  const post = (projectId: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
    f.request(`/projects/${projectId}${path}`, { method: "POST", body, headers });

  // 1. Fresh project starts on basic homepage.
  const initialRes = await post(project.project_id, "/api/home-pages/read", {});
  assert.equal(initialRes.status, 200, await initialRes.clone().text());
  const initial = (await initialRes.json()) as HomePageOverview;
  assert.deepEqual(initial.selection, { kind: "basic" });
  assert.deepEqual(initial.versions, []);

  // 2. Save v1 direct draft — does NOT change selection.
  const saveV1Res = await post(project.project_id, "/api/home-pages/drafts/save", {
    draft: sampleDraft("研究看板第一版"),
  });
  assert.equal(saveV1Res.status, 200, await saveV1Res.clone().text());
  const { version: v1 } = (await saveV1Res.json()) as { version: HomePageVersion };
  assert.equal(v1.version, 1);
  assert.equal(v1.author, "person");
  assert.equal(v1.files.length, 3);
  assert.ok(v1.files.every(file => /^[0-9a-f]{64}$/u.test(file.sha256)));

  const afterDraft = (await (await post(project.project_id, "/api/home-pages/read", {})).json()) as HomePageOverview;
  assert.deepEqual(afterDraft.selection, { kind: "basic" });
  assert.equal(afterDraft.versions.length, 1);
  assert.equal(afterDraft.versions[0]!.approval, null);

  // 3. Append v2 with CAS expected_version + based_on; stale expected_version conflicts.
  const staleRes = await post(project.project_id, "/api/home-pages/drafts/save", {
    draft: sampleDraft("冲突草稿"),
    page_id: v1.page_id,
    expected_version: 99,
  });
  assert.equal(staleRes.status, 409);

  const saveV2Res = await post(project.project_id, "/api/home-pages/drafts/save", {
    draft: sampleDraft("研究看板第二版", " .hp-out { color: var(--ink-2); }", [QUERY_ACTION, COMMAND_ACTION]),
    page_id: v1.page_id,
    expected_version: 1,
    based_on: 1,
  });
  assert.equal(saveV2Res.status, 200, await saveV2Res.clone().text());
  const { version: v2 } = (await saveV2Res.json()) as { version: HomePageVersion };
  assert.equal(v2.version, 2);
  assert.equal(v2.based_on, 1);

  // 4. Diff between v1 and v2 reflects modified files and added actions.
  const diffRes = await post(project.project_id, "/api/home-pages/diff", {
    page_id: v1.page_id,
    from_version: 1,
    to_version: 2,
  });
  assert.equal(diffRes.status, 200, await diffRes.clone().text());
  const diff = (await diffRes.json()) as HomePageDiffResult;
  assert.ok(diff.files.some(file => file.path === "styles.css" && file.kind === "modified"));
  assert.deepEqual(diff.actions.added, [COMMAND_ACTION]);
  assert.deepEqual(diff.actions.removed, []);

  // 5. Blueprint content adoption (`molis.home-page.v1`) saves draft ONLY, idempotently, and is readable via home.read queries.
  const adoptDraftPayload = {
    request_id: "bp-adopt-home-1",
    blueprint: { source: { kind: "draft", draft_id: "scene-1", revision: 1 }, part_id: "home" },
    selection: { kind: "create" },
    body: sampleDraft("场景带来的首页草稿"),
  };
  const bp1 = (await (await post(project.project_id, "/api/home-pages/drafts/save", adoptDraftPayload)).json()) as ContentAdoptionResult;
  const bp2 = (await (await post(project.project_id, "/api/home-pages/drafts/save", adoptDraftPayload)).json()) as ContentAdoptionResult;
  assert.equal(bp1.outcome, "created");
  assert.equal(bp1.subject.kind, "home-page");
  assert.deepEqual(bp2, bp1, "repeating same blueprint adoption request_id is idempotent");

  // Selection MUST still be basic after blueprint content adoption!
  const afterBp = (await (await post(project.project_id, "/api/home-pages/read", {})).json()) as HomePageOverview;
  assert.deepEqual(afterBp.selection, { kind: "basic" });

  // Query readback finds adoption receipt and proposal candidates.
  const queryRead = (await (await post(project.project_id, "/api/home-pages/read", {
    queries: [
      { by: "request", operation: "adopt", request_id: "bp-adopt-home-1" },
      { by: "approval_request", operation: "adopt", request_id: "never-happened" },
    ],
  })).json()) as Extract<HomePageReadResult, { results: unknown }>;
  assert.equal(queryRead.results[0]!.kind, "receipt");
  assert.equal(queryRead.results[1]!.kind, "missing");

  // 6. Adopt v1 with idempotency, request_conflict, and revision_conflict.
  const adoptReq = {
    page_id: v1.page_id,
    version: 1,
    approved_actions: [QUERY_ACTION],
    request_id: "person-adopt-v1",
    expected_revision: afterBp.revision,
  };
  const adoptRes1 = await post(project.project_id, "/api/home-pages/adopt", adoptReq);
  assert.equal(adoptRes1.status, 200, await adoptRes1.clone().text());
  const receipt1 = (await adoptRes1.json()) as HomePageApprovalReceipt<"adopt">;
  assert.equal(receipt1.operation, "adopt");
  assert.deepEqual(receipt1.selection, { kind: "page", page_id: v1.page_id, version: 1 });
  assert.deepEqual(receipt1.approval.approved_actions, [QUERY_ACTION]);

  // Same request_id + same payload -> idempotent receipt.
  const adoptReplay = (await (await post(project.project_id, "/api/home-pages/adopt", adoptReq)).json()) as HomePageApprovalReceipt<"adopt">;
  assert.deepEqual(adoptReplay, receipt1);

  // Same request_id + different version -> request_conflict (409).
  const conflictReq = await post(project.project_id, "/api/home-pages/adopt", {
    ...adoptReq,
    version: 2,
  });
  assert.equal(conflictReq.status, 409);

  // Stale expected_revision -> revision_conflict (409).
  const staleRev = await post(project.project_id, "/api/home-pages/adopt", {
    page_id: v1.page_id,
    version: 2,
    approved_actions: [QUERY_ACTION],
    request_id: "person-adopt-v2-stale",
    expected_revision: afterBp.revision,
  });
  assert.equal(staleRev.status, 409);

  // Read back approval receipt by approval_request query.
  const approvalRead = (await (await post(project.project_id, "/api/home-pages/read", {
    queries: [{ by: "approval_request", operation: "adopt", request_id: "person-adopt-v1" }],
  })).json()) as Extract<HomePageReadResult, { results: unknown }>;
  assert.equal(approvalRead.results[0]!.kind, "receipt");

  // 7. Switch back to basic homepage (`home.select@1`) — versions stay intact; restore v1 (`home.pages.restore@1`).
  const basicRes = await post(project.project_id, "/api/home-pages/select", {
    kind: "basic",
    request_id: "person-select-basic-1",
    expected_revision: receipt1.revision,
  });
  assert.equal(basicRes.status, 200);
  const basicResult = (await basicRes.json()) as HomePageSelectResult;
  assert.deepEqual(basicResult.selection, { kind: "basic" });
  assert.equal(basicResult.approval, null);

  const restoreRes = await post(project.project_id, "/api/home-pages/restore", {
    page_id: v1.page_id,
    version: 1,
    approved_actions: [QUERY_ACTION],
    request_id: "person-restore-v1",
    expected_revision: basicResult.revision,
  });
  assert.equal(restoreRes.status, 200);
  const restoreReceipt = (await restoreRes.json()) as HomePageApprovalReceipt<"restore">;
  assert.equal(restoreReceipt.operation, "restore");
  assert.deepEqual(restoreReceipt.selection, { kind: "page", page_id: v1.page_id, version: 1 });

  // 8. Design-language check catches violations and passes clean token-based files.
  const cleanReport = inspectHomePageDesign(sampleDraft("干净页面").files);
  assert.equal(cleanReport.ok, true);
  // B37R-2: a readable light palette cannot mask an unreadable dark palette.
  const contrast = (css: string, ...palettes: Record<string, string>[]) => inspectHomePageDesign(
    [{ path: "page.css", media_type: "text/css", text: css }], { palettes }).issues.map(issue => issue.code);
  const bodyColors = "p{color:var(--ink);background:var(--paper)}";
  assert.deepEqual(contrast(bodyColors, { ink: "#767676", paper: "#ffffff" }), []);
  assert.ok(contrast(bodyColors, { ink: "#000000", paper: "#ffffff" }, { ink: "#777777", paper: "#ffffff" }).includes("low_contrast"));
  assert.ok(contrast("p{color:var(--ink);background-color:var(--ink)}").includes("low_contrast"));
  assert.ok(contrast(".heading{color:var(--amber)}").includes("amber_usage"));
  assert.deepEqual(contrast(".waiting{color:var(--amber)}"), []);
  const nested = [
    { path: "index.html", media_type: "text/html", text: "<main><p>Visible text</p></main>" },
    { path: "page.css", media_type: "text/css", text: "main{background:var(--ink);color:var(--paper)}p{color:var(--ink)}" },
  ] as const;
  assert.ok(inspectHomePageDesign(nested).issues.some(issue => issue.code === "low_contrast"));
  const onText = (css: string) => inspectHomePageDesign([nested[0], { ...nested[1], text: css }]).issues.map(issue => issue.code);
  assert.ok(onText("body{background:var(--ink)}").includes("low_contrast"));
  assert.deepEqual(onText(".unused{color:var(--ink);background:var(--ink)}"), []);
  assert.deepEqual(onText("p{color:var(--ink);background:var(--ink)}main p{color:var(--paper)}"), []);
  const dirtyReport = inspectHomePageDesign([
    {
      path: "index.html",
      media_type: "text/html",
      text: `<div style="color:red" onclick="alert(1)"><iframe src="https://evil.example"></iframe></div>`,
    },
    {
      path: "styles.css",
      media_type: "text/css",
      text: `.chip { background: #ff0000; border-radius: 999px; }`,
    },
    {
      path: "app.js",
      media_type: "text/javascript",
      text: `eval("1+1"); fetch("https://example.com");`,
    },
  ]);
  assert.equal(dirtyReport.ok, false);
  assert.ok(dirtyReport.issues.some(i => i.code === "inline_style_attr"));
  assert.ok(dirtyReport.issues.some(i => i.code === "inline_event_handler"));
  assert.ok(dirtyReport.issues.some(i => i.code === "external_asset"));
  assert.ok(dirtyReport.issues.some(i => i.code === "nested_embed"));
  assert.ok(dirtyReport.issues.some(i => i.code === "dynamic_eval"));
  assert.ok(dirtyReport.issues.some(i => i.code === "literal_color"));
  assert.ok(dirtyReport.issues.some(i => i.code === "pill_radius"));

  // Hex-like CSS ID selectors (#feed, #cafe, #fade) MUST NOT false-positive as literal_color, while CSS remote url()/@import MUST be caught.
  const idSelectorReport = inspectHomePageDesign([
    { path: "index.html", media_type: "text/html", text: `<main id="feed"><section id="cafe"></section></main>` },
    { path: "styles.css", media_type: "text/css", text: `#feed, #cafe, #fade { background: var(--paper); color: var(--ink); }` },
  ]);
  assert.equal(idSelectorReport.ok, true, "hex-like CSS ID selectors must not fail literal_color check");
  const cssExternalReport = inspectHomePageDesign([
    { path: "index.html", media_type: "text/html", text: `<main></main>` },
    { path: "styles.css", media_type: "text/css", text: `@import "https://evil.example/a.css"; .x { background-image: url(https://evil.example/b.png); }` },
  ]);
  assert.equal(cssExternalReport.ok, false, "CSS external @import/url must fail sandbox_isolation");
  assert.ok(cssExternalReport.issues.some(i => i.code === "external_asset" && i.path === "styles.css"));
  // CSS parser security edge cases: @media/nested rules, EOF unclosed blocks, unquoted backslash escapes, quoted /* */, and spaceless @import.
  for (const [label, css, expectedCode] of [
    ["@media nested literal color", `@media (min-width: 600px) { .card { color: #ff0000; } }`, "literal_color"],
    ["EOF unclosed block", `.a { color: #ff0000`, "literal_color"],
    ["unquoted backslash escape before quote", `.a\\" { color: #ff0000; }`, "literal_color"],
    ["quoted comment tokens hiding literal color", `.a { --a: "/*"; color: #f00; --b: "*/"; }`, "literal_color"],
    ["quoted comment tokens hiding external url", `.a { --a: "/*"; background: url(https://evil.example/x); --b: "*/"; }`, "external_asset"],
    ["spaceless @import quote", `@import"https://evil.example/a.css";`, "external_asset"],
    ["comment-separated @import quote", `@import/**/"https://evil.example/a.css";`, "external_asset"],
  ] as const) {
    const rep = inspectHomePageDesign([
      { path: "index.html", media_type: "text/html", text: `<main></main>` },
      { path: "styles.css", media_type: "text/css", text: css },
    ]);
    assert.equal(rep.ok, false, `${label}: must fail design check`);
    assert.ok(rep.issues.some(i => i.code === expectedCode), `${label}: must report ${expectedCode}`);
  }

  // 9. Retention (>20 versions protects active + based_on + last approved & prunes oldest unpinned; >20 pages refuses).
  // Seed other project so we also prove project deletion does not affect it.
  await post(other.project_id, "/api/home-pages/drafts/save", { draft: sampleDraft("另一个项目页面") });
  let latestVersion = 2;
  for (let i = 3; i <= HOME_PAGE_RETENTION.maxVersionsPerPage + 4; i++) {
    const res = await post(project.project_id, "/api/home-pages/drafts/save", {
      draft: sampleDraft(`迭代第 ${i} 版`, ` /* v${i} */`),
      page_id: v1.page_id,
      expected_version: latestVersion,
      // Point the latest draft at based_on: 2 once pruning starts (i >= 21) so v2 stays pinned while v3..v6 prune!
      ...(i >= HOME_PAGE_RETENTION.maxVersionsPerPage ? { based_on: 2 } : {}),
    });
    assert.equal(res.status, 200, await res.clone().text());
    latestVersion = ((await res.json()) as { version: HomePageVersion }).version.version;
  }
  const afterPrune = (await (await post(project.project_id, "/api/home-pages/read", {})).json()) as HomePageOverview;
  const v1PageVersions = afterPrune.versions.filter(v => v.page_id === v1.page_id).map(v => v.version);
  assert.ok(v1PageVersions.length <= HOME_PAGE_RETENTION.maxVersionsPerPage, `kept ${v1PageVersions.length} <= 20`);
  assert.ok(v1PageVersions.includes(1), "active & last-approved v1 is protected from pruning");
  assert.ok(v1PageVersions.includes(2), "based_on v2 is protected from pruning");
  assert.ok(v1PageVersions.includes(latestVersion), "latest version is kept");

  const inspectRes = await post(project.project_id, "/api/home-pages/inspect", { page_id: v1.page_id, version: latestVersion });
  assert.equal(inspectRes.status, 200);
  const inspected = (await inspectRes.json()) as { pruned: Array<{ version: number }> };
  assert.ok(inspected.pruned.length >= 1, "pruned versions are recorded for display");

  // Fill up to 20 pages, then the 21st page is refused with home.page_limit.
  const existingPages = new Set(afterPrune.versions.map(v => v.page_id)).size;
  for (let i = existingPages; i < HOME_PAGE_RETENTION.maxPagesPerProject; i++) {
    const res = await post(project.project_id, "/api/home-pages/drafts/save", { draft: sampleDraft(`页面 ${i + 1}`) });
    assert.equal(res.status, 200);
  }
  const overLimit = await post(project.project_id, "/api/home-pages/drafts/save", { draft: sampleDraft("第 21 个页面") });
  assert.equal(overLimit.status, 400);
  const overLimitBody = (await overLimit.json()) as { code?: string };
  assert.equal(overLimitBody.code, "home.page_limit");

  // 10. Deleting project clears its rows in home-pages.db while preserving other project.
  const hooks = projectDeletedHooksFor(f.home);
  const owner = hooks.owners().find(item => item.id === "home-pages");
  assert.ok(owner, "home-pages is registered in project-deleted-owners");
  purgeHomePagesProject(heldHomeSqlite(f.home, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE), project.project_id);
  const afterClear = (await (await post(project.project_id, "/api/home-pages/read", {})).json()) as HomePageOverview;
  assert.deepEqual(afterClear.versions, []);
  const otherStill = (await (await post(other.project_id, "/api/home-pages/read", {})).json()) as HomePageOverview;
  assert.equal(otherStill.versions.length, 1);
});

test("S-home-page-files SPC-11 ONB-28: tampered stored file bytes are refused by readFiles, preview, adopt, restore, and live session open; framed pages cannot read home page files", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("Tamper Detection");
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    f.request(`/projects/${project.project_id}${path}`, { method: "POST", body, headers });

  const { version: v1 } = (await (await post("/api/home-pages/drafts/save", { draft: sampleDraft("待核验页面") })).json()) as { version: HomePageVersion };
  const initial = (await (await post("/api/home-pages/read", {})).json()) as HomePageOverview;
  const adoptRes = await post("/api/home-pages/adopt", {
    page_id: v1.page_id,
    version: 1,
    approved_actions: [QUERY_ACTION],
    request_id: "adopt-before-tamper",
    expected_revision: initial.revision,
  });
  assert.equal(adoptRes.status, 200);
  const adopted = (await adoptRes.json()) as HomePageApprovalReceipt<"adopt">;

  // Live session opens cleanly BEFORE tampering, and refuses calling files/read through both direct route and action gateway.
  const liveSessionRes = await post("/api/home-pages/session", {});
  assert.equal(liveSessionRes.status, 200);
  const { page_session_id: liveSessionId } = (await liveSessionRes.json()) as { page_session_id: string };

  const filesDirectByFrame = await post("/api/home-pages/files/read", { page_id: v1.page_id, version: 1 }, {
    [HOME_PAGE_SESSION_HEADER]: liveSessionId,
  });
  assert.equal(filesDirectByFrame.status, 403);

  const filesViaGateway = await post("/api/home-pages/actions", {
    reference: { capability_id: "home.pages.files.read", version: 1, provider_id: "system.home" },
    input: { page_id: v1.page_id, version: 1 },
  }, { [HOME_PAGE_SESSION_HEADER]: liveSessionId });
  assert.equal(filesViaGateway.status, 403);

  // Tamper stored blob content directly in home-pages.db (same sha256 primary key, altered content!).
  const db = openBaselineHomeSqlite(f.home, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE);
  try {
    const jsFile = v1.files.find(file => file.path === "app.js")!;
    db.prepare("UPDATE home_page_blobs SET content = ? WHERE sha256 = ?").run("alert('tampered!');", jsFile.sha256);
  } finally {
    db.close();
  }

  // Every read/preview/adopt/restore/session path MUST reject with home.page_file_mismatch!
  for (const [path, body] of [
    ["/api/home-pages/files/read", { page_id: v1.page_id, version: 1 }],
    ["/api/home-pages/preview", { page_id: v1.page_id, version: 1 }],
    ["/api/home-pages/adopt", { page_id: v1.page_id, version: 1, approved_actions: [QUERY_ACTION], request_id: "adopt-tampered", expected_revision: adopted.revision }],
    ["/api/home-pages/restore", { page_id: v1.page_id, version: 1, approved_actions: [QUERY_ACTION], request_id: "restore-tampered", expected_revision: adopted.revision }],
    ["/api/home-pages/session", {}],
  ] as const) {
    const res = await post(path, body);
    const payload = (await res.json()) as { code?: string };
    assert.equal(res.status, 409, `${path} status=${res.status} body=${JSON.stringify(payload)}`);
    assert.equal(payload.code, "home.page_file_mismatch", `${path} must refuse tampered bytes`);
  }
});

test("S-home-page-authority SPC-11 ONB-25 ONB-26: preview is query-only, live executes only declared+approved explicit-plugin actions, forged bodies/cross-project/wrong routes are refused, call log distinguishes home-page vs home-page-preview, and in-flight commands abort at beforeEffect() on revocation", { timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const project = await f.project("Authority Isolation", ["risk"]);
  const other = await f.project("Foreign Project");
  const post = (projectId: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
    f.request(`/projects/${projectId}${path}`, { method: "POST", body, headers });

  const riskView = (await f.host.inspectActions({
    actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: project.project_id,
    audience: "user",
    permissions: ["risk:read", "risk:write"],
  }, project.reference)).find(v => v.capability_id === "risk.create");
  assert.ok(riskView, "risk.create@1 should be registered on project with risk plugin");
  const RISK_CREATE: ExactActionReference = {
    capability_id: riskView.capability_id,
    version: riskView.version,
    provider_id: riskView.provider.provider_id,
  };
  const RISK_INPUT = { title: "生成页记风险", statement: "测试经由获准生成首页动作网关写入", impact: "low", likelihood: "low" };

  // Reject saving a draft that declares an action without explicit `plugin` audience (e.g. agent/workflow-only delivery).
  const badDraftRes = await post(project.project_id, "/api/home-pages/drafts/save", {
    draft: sampleDraft("越权动作草稿", "", [AGENT_ONLY_ACTION]),
  });
  assert.ok(badDraftRes.status >= 400);
  const badBody = (await badDraftRes.json()) as { code?: string };
  assert.equal(badBody.code, "home.action_unavailable");

  // Save a valid draft declaring 1 query action + 1 real business command action (both explicitly `plugin` audience).
  const { version: v1 } = (await (await post(project.project_id, "/api/home-pages/drafts/save", {
    draft: sampleDraft("权限隔离页面", "", [QUERY_ACTION, RISK_CREATE]),
  })).json()) as { version: HomePageVersion };

  // 1. Preview session (`home-page-preview`): query succeeds, command is refused with ZERO side effects!
  const preview = (await (await post(project.project_id, "/api/home-pages/preview", { page_id: v1.page_id, version: 1 })).json()) as HomePagePreviewResult;
  const previewQuery = await post(project.project_id, "/api/home-pages/actions", {
    reference: QUERY_ACTION,
    input: {},
  }, { [HOME_PAGE_SESSION_HEADER]: preview.page_session_id });
  assert.equal(previewQuery.status, 200, await previewQuery.clone().text());

  const previewCommand = await post(project.project_id, "/api/home-pages/actions", {
    reference: RISK_CREATE,
    input: RISK_INPUT,
  }, { [HOME_PAGE_SESSION_HEADER]: preview.page_session_id });
  assert.equal(previewCommand.status, 403);

  // 2. Adopt v1 approving ONLY QUERY_ACTION (NOT RISK_CREATE).
  const overview = (await (await post(project.project_id, "/api/home-pages/read", {})).json()) as HomePageOverview;
  const adopted = (await (await post(project.project_id, "/api/home-pages/adopt", {
    page_id: v1.page_id,
    version: 1,
    approved_actions: [QUERY_ACTION],
    request_id: "adopt-query-only",
    expected_revision: overview.revision,
  })).json()) as HomePageApprovalReceipt<"adopt">;
  const { page_session_id: liveSessionId } = (await (await post(project.project_id, "/api/home-pages/session", {})).json()) as { page_session_id: string };

  // Approved query works; declared-but-unapproved command is refused!
  const liveQuery = await post(project.project_id, "/api/home-pages/actions", {
    reference: QUERY_ACTION,
    input: {},
  }, { [HOME_PAGE_SESSION_HEADER]: liveSessionId });
  assert.equal(liveQuery.status, 200);

  const liveUnapproved = await post(project.project_id, "/api/home-pages/actions", {
    reference: RISK_CREATE,
    input: RISK_INPUT,
  }, { [HOME_PAGE_SESSION_HEADER]: liveSessionId });
  assert.equal(liveUnapproved.status, 403);

  // Forged body fields (subject / project_id / page_id / version / actor_id) are refused.
  for (const extra of [
    { subject: { kind: "home-page", project_id: other.project_id, page_id: "x", version: 1 } },
    { project_id: other.project_id },
    { page_id: "other" },
    { version: 99 },
    { actor_id: "someone-else" },
  ]) {
    const forged = await post(project.project_id, "/api/home-pages/actions", {
      reference: QUERY_ACTION,
      input: {},
      ...extra,
    }, { [HOME_PAGE_SESSION_HEADER]: liveSessionId });
    assert.equal(forged.status, 400, `forged ${Object.keys(extra)[0]} must be rejected`);
  }

  // Cross-project gateway request with liveSessionId is refused.
  const crossProject = await post(other.project_id, "/api/home-pages/actions", {
    reference: QUERY_ACTION,
    input: {},
  }, { [HOME_PAGE_SESSION_HEADER]: liveSessionId });
  assert.equal(crossProject.status, 403);

  // Calling any other route with x-molis-home-page is refused at transport guard (POST and GET SSE streams alike).
  for (const forbiddenPath of ["/api/home-pages/read", "/api/home-pages/adopt", "/api/mainline/line", "/api/acceptance/read"]) {
    const res = await post(project.project_id, forbiddenPath, {}, { [HOME_PAGE_SESSION_HEADER]: liveSessionId });
    assert.equal(res.status, 403, `${forbiddenPath} with x-molis-home-page must be 403`);
  }
  for (const forbiddenGet of ["/api/attention", "/api/attention/events"]) {
    const res = await f.request(`/projects/${project.project_id}${forbiddenGet}`, {
      method: "GET",
      headers: { [HOME_PAGE_SESSION_HEADER]: liveSessionId },
    });
    assert.equal(res.status, 403, `GET ${forbiddenGet} with x-molis-home-page must be 403`);
  }

  // Trigger a failed declared query in preview AND a real approved command in live so ActionCallLog records both subjects!
  const previewBadQuery = await post(project.project_id, "/api/home-pages/actions", {
    reference: QUERY_ACTION,
    input: { unexpected: true },
  }, { [HOME_PAGE_SESSION_HEADER]: preview.page_session_id });
  assert.equal(previewBadQuery.status, 400);

  // Adopt v1 approving BOTH QUERY_ACTION and RISK_CREATE on a fresh request so we can run an approved command and check call log.
  const adoptWithCmd = (await (await post(project.project_id, "/api/home-pages/adopt", {
    page_id: v1.page_id,
    version: 1,
    approved_actions: [QUERY_ACTION, RISK_CREATE],
    request_id: "adopt-with-cmd-for-log",
    expected_revision: adopted.revision,
  })).json()) as HomePageApprovalReceipt<"adopt">;
  const { page_session_id: liveCmdSessionId } = (await (await post(project.project_id, "/api/home-pages/session", {})).json()) as { page_session_id: string };
  const liveCmdRes = await post(project.project_id, "/api/home-pages/actions", {
    reference: RISK_CREATE,
    input: RISK_INPUT,
  }, { [HOME_PAGE_SESSION_HEADER]: liveCmdSessionId });
  assert.equal(liveCmdRes.status, 200, await liveCmdRes.clone().text());
  const createdRisk = (await liveCmdRes.json()) as { risk?: { risk_id: string; title: string } };
  assert.equal(createdRisk.risk?.title, RISK_INPUT.title);

  // ActionCallLog (`logs/action-calls.jsonl`) distinguishes home-page vs home-page-preview subjects!
  const callLogLines = readFileSync(join(f.home, "logs/action-calls.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line) as { home_page?: string; capability_id?: string });
  assert.ok(
    callLogLines.some(entry => entry.home_page === `home-page-preview:${project.project_id}/${v1.page_id}@1`),
    `log records home-page-preview subject; saw: ${JSON.stringify(callLogLines.map(e => e.home_page))}`,
  );
  assert.ok(
    callLogLines.some(entry => entry.home_page === `home-page:${project.project_id}/${v1.page_id}@1`),
    `log records home-page subject; saw: ${JSON.stringify(callLogLines.map(e => e.home_page))}`,
  );

  // Switching back to basic immediately revokes liveCmdSessionId!
  const basicRes = await post(project.project_id, "/api/home-pages/select", {
    kind: "basic",
    request_id: "select-basic-revoke",
    expected_revision: adoptWithCmd.revision,
  });
  assert.equal(basicRes.status, 200);
  const afterRevoke = await post(project.project_id, "/api/home-pages/actions", {
    reference: QUERY_ACTION,
    input: {},
  }, { [HOME_PAGE_SESSION_HEADER]: liveCmdSessionId });
  assert.equal(afterRevoke.status, 403, "old live session is revoked immediately after selecting basic");

  // 3. In-flight command aborts at beforeEffect() when home selection changes (revocation mid-flight)!
  const dir = mkdtempSync(join(tmpdir(), "home-page-inflight-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openHomePagesDatabase(dir);
  t.after(() => db.close());

  const entered = deferred(), release = deferred();
  let writes = 0;
  const slowWriteDef: ActionDefinition<Record<string, never>, { ok: boolean }> = {
    capability_id: "fixture.home.slow_write",
    version: 1,
    operation: "command",
    action: {
      title: "慢写入",
      description: "在 beforeEffect 前挂起的测试写动作",
      kind: "operation",
      effect: "write",
      scope: "project",
      scheduling: "concurrent",
      audiences: ["user", "plugin"],
      permissions: [],
      subject_kinds: [],
      input_schema: { type: "object", properties: {}, additionalProperties: false },
      output_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    },
  };
  const slowRef: ExactActionReference = { capability_id: slowWriteDef.capability_id, version: 1, provider_id: "fixture.slow" };
  const actions = new ActionService();
  const registry = new HomePageSessionRegistry();
  const ports: HomePagesPorts = {
    open: projectId => new HomePagesStore(db, projectId),
    discover: async caller => actions.discover({ ...caller, audience: "plugin" }),
    openPreviewSession: (caller, version) => ({ page_session_id: registry.openPreview(caller.project_id!, caller.actor_id, version).page_session_id }),
    onSelectionChanged: projectId => registry.revokeLiveProject(projectId),
  };
  actions.registerProvider({
    provider: { provider_id: "fixture.slow", title: "Slow", kind: "system" },
    definitions: [slowWriteDef],
    handlers: [{
      ...slowWriteDef,
      handle: async ctx => {
        entered.resolve();
        await release.promise;
        await ctx.beforeEffect();
        writes += 1;
        return { ok: true };
      },
    }],
  });
  actions.registerProvider({
    provider: { provider_id: "system.home", title: "Home", kind: "system" },
    definitions: Object.values(homePageActions),
    handlers: homePageActionHandlers(ports),
  });

  const userCaller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p-inflight", audience: "user", permissions: ["home:read", "home:write"] };
  const saved = (await actions.invoke(userCaller, homePageActions.saveDraft, {
    draft: sampleDraft("在途取消页", "", [slowRef]),
  })) as { version: HomePageVersion };
  const ov = (await actions.invoke(userCaller, homePageActions.read, {})) as HomePageOverview;
  const rec = (await actions.invoke(userCaller, homePageActions.adopt, {
    page_id: saved.version.page_id,
    version: 1,
    approved_actions: [slowRef],
    request_id: "adopt-inflight",
    expected_revision: ov.revision,
  })) as HomePageApprovalReceipt<"adopt">;
  const live = registry.openLive("p-inflight", LOCAL_PERSON_ACTOR_ID, saved.version, [slowRef]);

  const inFlight = registry.invokeBySessionId({
    pageSessionId: live.page_session_id,
    projectId: "p-inflight",
    body: { reference: slowRef, input: {} },
    client: actions,
    permissions: [],
  });
  const expectRejected = assert.rejects(inFlight, (err: unknown) => err instanceof ActionError && (err.code === "home.session_invalid" || err.code === "actions.cancelled"));
  await entered.promise;
  // Switch back to basic while command is awaiting pre-beforeEffect!
  await actions.invoke(userCaller, homePageActions.select, {
    kind: "basic",
    request_id: "select-basic-inflight",
    expected_revision: rec.revision,
  });
  release.resolve();
  await expectRejected;
  assert.equal(writes, 0, "revoked in-flight home-page command MUST NOT commit side effects after beforeEffect()");
});

test("S-home-page-approval SPC-11 ONB-27: adopt and restore refuse agents, plugins, MCP, framed pages, and nested calls from another action handler (e.g. blueprints.adoption.apply/revert/remove)", { timeout: 120_000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), "home-page-approval-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openHomePagesDatabase(dir);
  t.after(() => db.close());

  const actions = new ActionService();
  const registry = new HomePageSessionRegistry();
  const ports: HomePagesPorts = {
    open: projectId => new HomePagesStore(db, projectId),
    discover: async caller => actions.discover({ ...caller, audience: "plugin" }),
    openPreviewSession: (caller, version) => ({ page_session_id: registry.openPreview(caller.project_id!, caller.actor_id, version).page_session_id }),
    onSelectionChanged: projectId => registry.revokeLiveProject(projectId),
  };
  actions.registerProvider({
    provider: { provider_id: "system.home", title: "Home", kind: "system" },
    definitions: Object.values(homePageActions),
    handlers: homePageActionHandlers(ports),
  });

  // Register a wrapper action simulating `blueprints.adoption.apply` trying to nested-call `home.pages.adopt` / `restore`.
  const nestedWrapperDef: ActionDefinition<{ op: "adopt" | "restore"; page_id: string; expected_revision: string }, unknown> = {
    capability_id: "fixture.blueprints.nested_apply",
    version: 1,
    operation: "command",
    action: {
      title: "模拟场景嵌套采用",
      description: "在动作处理器内部嵌套调用首页采用或恢复",
      kind: "operation",
      effect: "write",
      scope: "project",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: {
        type: "object",
        properties: {
          op: { enum: ["adopt", "restore"] },
          page_id: { type: "string" },
          expected_revision: { type: "string" },
        },
        required: ["op", "page_id", "expected_revision"],
        additionalProperties: false,
      },
    },
  };
  actions.registerProvider({
    provider: { provider_id: "fixture.blueprints", title: "Blueprints Fixture", kind: "system" },
    definitions: [nestedWrapperDef],
    handlers: [bindActionHandler(nestedWrapperDef, async (input, ctx) => {
      const target = input.op === "adopt" ? homePageActions.adopt : homePageActions.restore;
      return actions.invoke(
        { actor_id: ctx.actor_id, project_id: ctx.project_id, audience: "user", permissions: ["home:read", "home:write"] },
        target,
        { page_id: input.page_id, version: 1, approved_actions: [], request_id: `nested-${input.op}`, expected_revision: input.expected_revision },
      );
    })],
  });

  const userCaller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p-approval", audience: "user", permissions: ["home:read", "home:write"] };
  const saved = (await actions.invoke(userCaller, homePageActions.saveDraft, {
    draft: sampleDraft("需顶层批准页", "", []),
  })) as { version: HomePageVersion };
  const initial = (await actions.invoke(userCaller, homePageActions.read, {})) as HomePageOverview;
  assert.deepEqual(initial.selection, { kind: "basic" });

  // 1. Agent, plugin, MCP, workflow, delegated, host_plugin, and home_page callers MUST all be refused!
  const fakeHostPlugin = {
    plugin_id: "com.example.plugin",
    install_id: "install-fixture",
    actor_id: LOCAL_PERSON_ACTOR_ID,
    project_id: "p-approval",
  } as HostPluginCaller;
  const forbiddenCallers: Array<[string, ActionCallContext]> = [
    ["agent", { ...userCaller, audience: "agent" }],
    ["plugin", { ...userCaller, audience: "plugin" }],
    ["mcp", { ...userCaller, audience: "mcp" }],
    ["workflow", { ...userCaller, audience: "workflow" }],
    ["delegated", { ...userCaller, delegated_by: "agent:assistant" }],
    ["host_plugin", { ...userCaller, host_plugin: fakeHostPlugin }],
    ["home_page", { ...userCaller, home_page: { kind: "home-page", project_id: "p-approval", page_id: saved.version.page_id, version: 1 } }],
    ["home_page_preview", { ...userCaller, home_page: { kind: "home-page-preview", project_id: "p-approval", page_id: saved.version.page_id, version: 1 } }],
  ];
  for (const [label, caller] of forbiddenCallers) {
    for (const def of [homePageActions.adopt, homePageActions.restore]) {
      await assert.rejects(
        actions.invoke(caller, def, {
          page_id: saved.version.page_id,
          version: 1,
          approved_actions: [],
          request_id: `bad-${label}-${def.capability_id}`,
          expected_revision: initial.revision,
        }),
        (err: unknown) => err instanceof ActionError && (err.code === "home.approval_forbidden" || err.code === "actions.forbidden"),
        `${label} calling ${def.capability_id} must be refused`,
      );
    }
  }

  // 2. Nested calls from inside another running action handler (simulating blueprints.adoption.apply/revert/remove) MUST be refused!
  for (const op of ["adopt", "restore"] as const) {
    await assert.rejects(
      actions.invoke(userCaller, nestedWrapperDef, {
        op,
        page_id: saved.version.page_id,
        expected_revision: initial.revision,
      }),
      (err: unknown) => err instanceof ActionError && err.code === "home.approval_forbidden",
      `nested ${op} inside another action must be refused via parent_action`,
    );
  }

  // Selection MUST remain basic after every single refusal!
  const after = (await actions.invoke(userCaller, homePageActions.read, {})) as HomePageOverview;
  assert.deepEqual(after.selection, { kind: "basic" });
  assert.equal(after.versions[0]!.approval, null);

  // 3. Direct HTTP refusal when a plugin page header tries /api/home-pages/adopt or /restore.
  const f = await serveHomeRuntime(t);
  const proj = await f.project("Plugin Refusal");
  const pluginsList = (await (await f.request("/api/settings/project-plugins")).json()) as { projects: Array<{ project_id: string; revision: string }> };
  const rev = pluginsList.projects.find(item => item.project_id === proj.project_id)!.revision;
  assert.equal((await f.request(`/api/settings/projects/${proj.project_id}/plugins`, { method: "POST", body: { plugin_id: "goals", expected_revision: rev } })).status, 200);
  const opened = (await (await f.request(`/projects/${proj.project_id}/api/host/plugin-pages`, { method: "POST", body: { plugin_id: "io.molis.work.goals" } })).json()) as { page_id: string };
  const savedHttp = (await (await f.request(`/projects/${proj.project_id}/api/home-pages/drafts/save`, { method: "POST", body: { draft: sampleDraft("插件不能批", "", []) } })).json()) as { version: HomePageVersion };
  const ovHttp = (await (await f.request(`/projects/${proj.project_id}/api/home-pages/read`, { method: "POST", body: {} })).json()) as HomePageOverview;

  for (const header of ["x-molis-plugin-page", "x-molis-context-page"]) {
    for (const path of ["/api/home-pages/adopt", "/api/home-pages/restore", "/api/home-pages/select"]) {
      const refused = await f.request(`/projects/${proj.project_id}${path}`, {
        method: "POST",
        headers: { [header]: opened.page_id },
        body: path.endsWith("select")
          ? { kind: "basic", request_id: "plug-sel", expected_revision: ovHttp.revision }
          : { page_id: savedHttp.version.page_id, version: 1, approved_actions: [], request_id: "plug-app", expected_revision: ovHttp.revision },
      });
      assert.equal(refused.status, 403, `${header} ${path} must be 403`);
    }
  }
  const ovAfter = (await (await f.request(`/projects/${proj.project_id}/api/home-pages/read`, { method: "POST", body: {} })).json()) as HomePageOverview;
  assert.deepEqual(ovAfter.selection, { kind: "basic" });
});
