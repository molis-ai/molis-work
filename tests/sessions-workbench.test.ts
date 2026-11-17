import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import type { ProjectDirectories, ProjectDirectoryPage } from "@molis-ai/molis-work-contracts/modules/projects";
import type {
  ExternalSessionHistoryOutput,
  ExternalSessionListOutput,
  ExternalSessionProjectAiReadSetOutput,
  ExternalSessionScopeView,
} from "@molis-ai/molis-work-contracts/services/sessions";
import type { SessionToolMetaEntry } from "@molis-ai/molis-work-app-local-host";
import type { SessionsListReadiness } from "@molis-ai/molis-work-service-sessions";
import { openTestHome } from "./fixtures/test-home.js";

type ScopeHttpView = ExternalSessionScopeView & { readonly tool_meta: readonly SessionToolMetaEntry[] };
type DirectoriesHttpView = ProjectDirectories & { readonly page: ProjectDirectoryPage & { readonly tool_brought_ids?: readonly string[] } };

// SRB-01..SRB-16: Workbench HTTP surface for `system.sessions`, readiness projection, 50-row tool_meta grouping,
// cross-project AI read permits, and Project Settings tool-brought directory distinction & promotion.

test("SRB-01 SRB-07 SRB-12: /api/sessions/scope projects 50-tool groups, readiness transitions empty_scope -> ready, and list/history/attribution/discovery work end-to-end", { timeout: 60_000 }, async (t) => {
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "swb-http-"));
  t.after(() => rm(rawRoot, { recursive: true, force: true }));
  const root = await realpath(rawRoot);
  const userHome = path.join(root, "user");
  const projDir = path.join(root, "alpha-repo");
  const unfiledDir = path.join(root, "scratch-repo");
  const claudeDir = path.join(userHome, ".claude", "projects", "p1");
  for (const d of [userHome, projDir, unfiledDir, claudeDir]) await mkdir(d, { recursive: true });

  await writeFile(
    path.join(claudeDir, "sess-alpha.jsonl"),
    [
      JSON.stringify({ sessionId: "sess-alpha", cwd: projDir, timestamp: "2026-11-12T10:00:00Z", message: { role: "user", content: "Fix dark theme contrast" } }),
      JSON.stringify({ sessionId: "sess-alpha", cwd: projDir, timestamp: "2026-11-12T10:01:00Z", message: { role: "assistant", content: "Updated contrast token" } }),
    ].join("\n") + "\n",
  );
  await writeFile(
    path.join(claudeDir, "sess-unfiled.jsonl"),
    `${JSON.stringify({ sessionId: "sess-unfiled", cwd: unfiledDir, timestamp: "2026-11-12T11:00:00Z", message: { role: "user", content: "Explore parser spike" } })}\n`,
  );

  const home = await openTestHome(t, { host: { sessions: { homeRoot: userHome, env: {} } } });
  const alpha = await home.createProject("Alpha");
  const beta = await home.createProject("Beta");

  const initDirs = await home.web.get<DirectoriesHttpView>(`/projects/${alpha.project_id}/api/project-settings/directories`);
  await home.web.post(`/projects/${alpha.project_id}/api/project-settings/directories`, {
    change: "add_input",
    input: { workspace_path: projDir, expected_revision: initDirs.revision },
  });

  // 1. Initial readiness is `open_scope` and 50 tool_meta entries split cleanly into 10 / 2 / 38.
  const ready0 = await home.web.get<SessionsListReadiness>(`/projects/${alpha.project_id}/api/sessions/readiness`);
  assert.deepEqual(ready0, { ready: false, has_allowed_source: false, project_ai_read_allowed: false, next_step: "open_scope" });

  const scope0 = await home.web.get<ScopeHttpView>("/api/sessions/scope");
  assert.equal(scope0.tool_meta.length, 50);
  assert.equal(scope0.tool_meta.filter((m) => m.group === "connected").length, 10);
  const exportOnly = scope0.tool_meta.filter((m) => m.group === "export_only");
  assert.deepEqual(exportOnly.map((m) => m.id).sort(), ["amp", "grok-build"]);
  assert.ok(exportOnly.every((m) => Boolean(m.export_command)));
  const unsupported = scope0.tool_meta.filter((m) => m.group === "unsupported");
  assert.equal(unsupported.length, 38);
  assert.ok(unsupported.some((m) => m.unsupported_kind === "not_open"));
  assert.ok(unsupported.some((m) => m.unsupported_kind === "pending"));
  assert.equal(scope0.tool_meta.find((m) => m.id === "droid")?.can_tool_search, true);

  // 2. Enable `claude-code` across `all` directories via POST /api/sessions/scope -> readiness moves to `open_project_ai_read`, then `ready` once permitted.
  const scope1 = await home.web.post<ScopeHttpView>("/api/sessions/scope", {
    expected_revision: scope0.scope_revision,
    sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }],
  });
  assert.ok(scope1.scope_revision > scope0.scope_revision);
  await home.host.sessions!.service.waitForDiscoveryIdle();

  const ready1 = await home.web.get<SessionsListReadiness>(`/projects/${alpha.project_id}/api/sessions/readiness`);
  assert.deepEqual(ready1, { ready: false, has_allowed_source: true, project_ai_read_allowed: false, next_step: "open_project_ai_read" });

  const alphaPermit0 = scope1.project_ai_reads.find((r) => r.project.project_id === alpha.project_id)!;
  await home.web.post<ExternalSessionProjectAiReadSetOutput>(
    `/projects/${alpha.project_id}/api/sessions/project-ai-read`,
    { allowed: true, expected_revision: alphaPermit0.revision },
  );
  const ready2 = await home.web.get<SessionsListReadiness>(`/projects/${alpha.project_id}/api/sessions/readiness`);
  assert.deepEqual(ready2, { ready: true, has_allowed_source: true, project_ai_read_allowed: true, next_step: null });

  // 3. Project list shows `sess-alpha` (`automatic`), unfiled list shows `sess-unfiled` (`unfiled`).
  const projList = await home.web.get<ExternalSessionListOutput>(`/projects/${alpha.project_id}/api/sessions/list?view=project`);
  assert.equal(projList.sessions.length, 1);
  assert.equal(projList.sessions[0]!.attribution.state, "automatic");
  assert.equal(projList.sessions[0]!.return_target?.kind, "command");
  assert.equal(projList.unfiled_count, 1);

  const unfiledList = await home.web.get<ExternalSessionListOutput>("/api/sessions/list?view=unfiled");
  assert.equal(unfiledList.sessions.length, 1);
  const unfiledRow = unfiledList.sessions[0]!;
  assert.equal(unfiledRow.attribution.state, "unfiled");

  // 4. Read history + in-session search highlight (`query=contrast`).
  const alphaKey = projList.sessions[0]!.session_key;
  const hist = await home.web.get<ExternalSessionHistoryOutput>(
    `/projects/${alpha.project_id}/api/sessions/history?session_key=${encodeURIComponent(alphaKey)}&query=contrast`,
  );
  assert.equal(hist.read_state, "complete");
  assert.equal(hist.entries.length, 2);
  assert.equal(hist.matches.length, 2);

  // 5. File unfiled session to Beta via POST /api/sessions/attribution, then verify Beta project view.
  const filed = await home.web.post<{ attribution_revision: number }>("/api/sessions/attribution", {
    session_key: unfiledRow.session_key,
    decision: { kind: "project", project_id: beta.project_id },
    expected_revision: (unfiledRow as { attribution_revision: number }).attribution_revision,
  });
  assert.equal(filed.attribution_revision, 1);
  const betaList = await home.web.get<ExternalSessionListOutput>(`/projects/${beta.project_id}/api/sessions/list?view=project`);
  assert.equal(betaList.sessions.length, 1);
  assert.equal(betaList.sessions[0]!.attribution.state, "confirmed");

  // 6. Cross-project AI read toggle + revision conflict (409).
  const betaPermitRow = scope1.project_ai_reads.find((r) => r.project.project_id === beta.project_id)!;
  const toggledOn = await home.web.post<ExternalSessionProjectAiReadSetOutput>(
    `/projects/${beta.project_id}/api/sessions/project-ai-read`,
    { allowed: true, expected_revision: betaPermitRow.revision },
  );
  assert.equal(toggledOn.allowed, true);
  await assert.rejects(
    () => home.web.post(`/projects/${beta.project_id}/api/sessions/project-ai-read`, { allowed: false, expected_revision: betaPermitRow.revision }),
    (err: { status?: number; code?: string }) => err.status === 409 && err.code === "sessions.scope_conflict",
  );

  // 7. Manual discovery rerun and unsupported tool-search refusal (400/422 -> structured error).
  const disc = await home.web.post<{ queued: string[] }>("/api/sessions/discovery", { entry_id: "claude-code" });
  assert.deepEqual(disc.queued, ["claude-code"]);
  await assert.rejects(
    () => home.web.post("/api/sessions/tool-search", { entry_id: "claude-code", location_key: "local:default", query: "contrast" }),
    (err: { status?: number }) => (err.status ?? 0) >= 400,
  );
});

test("SRB-14 S-sessions-person-decides: Project Settings distinguishes tool-brought directories and promotes them on person confirmation", { timeout: 60_000 }, async (t) => {
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), "swb-dirs-"));
  t.after(() => rm(rawRoot, { recursive: true, force: true }));
  const root = await realpath(rawRoot);
  const userHome = path.join(root, "user");
  const toolDir = path.join(root, "tool-brought-repo");
  const claudeDir = path.join(userHome, ".claude", "projects", "p1");
  for (const d of [userHome, toolDir, claudeDir]) await mkdir(d, { recursive: true });

  await writeFile(
    path.join(claudeDir, "sess-tool.jsonl"),
    `${JSON.stringify({ sessionId: "sess-tool", cwd: toolDir, timestamp: "2026-11-12T12:00:00Z", message: { role: "user", content: "Tool bound session" } })}\n`,
  );

  const home = await openTestHome(t, { host: { sessions: { homeRoot: userHome, env: {} } } });
  const proj = await home.createProject("ToolDirProj");

  // Tool brings `toolDir` into `proj` via `bindRuntimeContext` (non-person `actor_id`).
  await home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home.home }, (catalog) =>
    catalog.commit(() =>
      catalog.bindRuntimeContext({
        context: {
          runtime_id: "claude-code",
          stable_work_context_id: "other-context",
          host_declares_stable: true,
          workspace: { canonical_path: toolDir, realpath_verified: true },
        },
        project_id: proj.project_id,
        actor_id: "runtime:claude-code",
        user_confirmed: true,
      }),
    ),
  );

  const before = await home.web.get<DirectoriesHttpView>(`/projects/${proj.project_id}/api/project-settings/directories`);
  const toolEntry = before.directories.find((d) => d.canonical_path === toolDir);
  assert.ok(toolEntry, "tool-brought directory appears in project directories");
  assert.deepEqual(before.page.tool_brought_ids, [toolEntry.workspace_id]);

  // Enable claude-code in `linked_projects` mode: tool-brought directory is NOT person-linked yet!
  const s0 = await home.web.get<ScopeHttpView>("/api/sessions/scope");
  await home.web.post<ScopeHttpView>("/api/sessions/scope", {
    expected_revision: s0.scope_revision,
    sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "linked_projects" } }],
  });
  await home.host.sessions!.service.waitForDiscoveryIdle();
  const listBefore = await home.web.get<ExternalSessionListOutput>(`/projects/${proj.project_id}/api/sessions/list?view=project`);
  assert.equal(listBefore.sessions.length, 0, "tool-brought folder does not enter linked_projects scope before person confirms");

  // Person clicks `确认连入` (`add_input`) in Project Settings -> `tool_brought_ids` clears and folder becomes person-linked!
  const after = await home.web.post<DirectoriesHttpView>(`/projects/${proj.project_id}/api/project-settings/directories`, {
    change: "add_input",
    input: { workspace_path: toolDir, expected_revision: before.revision },
  });
  assert.equal(after.page.tool_brought_ids, undefined);

  await home.web.post("/api/sessions/discovery", { entry_id: "claude-code" });
  await home.host.sessions!.service.waitForDiscoveryIdle();
  const listAfter = await home.web.get<ExternalSessionListOutput>(`/projects/${proj.project_id}/api/sessions/list?view=project`);
  assert.equal(listAfter.sessions.length, 1);
  assert.equal(listAfter.sessions[0]!.attribution.state, "automatic");
});
