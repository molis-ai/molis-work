import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ExternalToolPath } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { sessionsActions, type ExternalSessionRow } from "@molis-ai/molis-work-contracts/services/sessions";
import { MolisWorkLocalHost, createHostSessionsPorts } from "@molis-ai/molis-work-app-local-host";
import {
  SessionsService,
  identifySessionDirectory,
  type SessionAttributionSuggester,
  type SessionProjectSnapshot,
  type SessionsPorts,
} from "@molis-ai/molis-work-service-sessions";

const PERSON_CALLER: ActionCallContext = {
  actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: null,
  audience: "user",
  permissions: [],
};

function personInProject(projectId: string): ActionCallContext {
  return { ...PERSON_CALLER, project_id: projectId };
}

async function withTempDir<T>(prefix: string, run: (dir: string) => Promise<T>): Promise<T> {
  const raw = await mkdtemp(path.join(tmpdir(), prefix));
  const dir = await realpath(raw);
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeClaudeSession(userHome: string, folder: string, id: string, cwd: string | null, title: string, ts: string): Promise<void> {
  const dir = path.join(userHome, ".claude", "projects", folder);
  await mkdir(dir, { recursive: true });
  const lines = [
    JSON.stringify({ sessionId: id, cwd, timestamp: ts, type: "user", message: { role: "user", content: title } }),
    JSON.stringify({ sessionId: id, cwd, timestamp: ts, type: "assistant", message: { role: "assistant", content: `Reply for ${title}` } }),
  ];
  await writeFile(path.join(dir, `${id}.jsonl`), `${lines.join("\n")}\n`, "utf8");
}

function buildTestPorts(
  homeDir: string,
  userHome: string,
  state: { snapshot: SessionProjectSnapshot; suggester?: SessionAttributionSuggester | null; searchEvents: number; nowIso?: string },
): SessionsPorts {
  const base = createHostSessionsPorts(homeDir, () => undefined, () => { state.searchEvents++; }, { homeRoot: userHome, env: {} });
  return {
    ...base,
    clock: () => (state.nowIso ? new Date(state.nowIso) : new Date()),
    projects: {
      read: async <T>(op: (snap: SessionProjectSnapshot) => T): Promise<T> => op(state.snapshot),
    },
    directories: {
      identify: (dirPath: string) => identifySessionDirectory(dirPath, { homeRoot: userHome }),
    },
    suggester: state.suggester ?? null,
  };
}

test("SRB-03 SRB-04 nine attribution levels, later_suggestion, tool_reported_other and monotonic clear revision", async () => {
  await withTempDir("molis-sessions-svc-", async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    await mkdir(homeDir, { recursive: true });
    await mkdir(userHome, { recursive: true });

    const dirAlpha = path.join(root, "ws-alpha");
    const dirBeta = path.join(root, "ws-beta");
    const dirShared = path.join(root, "ws-shared");
    const dirRuntimeOnly = path.join(root, "ws-runtime");
    const dirFormerlyLinked = path.join(root, "ws-formerly-linked");
    const dirUnrelated = path.join(root, "ws-none");
    for (const d of [dirAlpha, dirBeta, dirShared, dirRuntimeOnly, dirFormerlyLinked, dirUnrelated]) {
      await mkdir(d, { recursive: true });
    }

    await writeClaudeSession(userHome, "p1", "sess-auto", dirAlpha, "Auto in alpha", "2026-11-10T10:01:00.000Z");
    await writeClaudeSession(userHome, "p1", "sess-other-report", dirAlpha, "Auto with other runtime binding", "2026-11-10T10:02:00.000Z");
    await writeClaudeSession(userHome, "p1", "sess-ambig", dirShared, "Ambiguous shared folder", "2026-11-10T10:03:00.000Z");
    await writeClaudeSession(userHome, "p1", "sess-reported", dirRuntimeOnly, "Runtime bound session", "2026-11-10T10:04:00.000Z");
    await writeClaudeSession(userHome, "p1", "sess-tool-linked", dirRuntimeOnly, "Tool linked folder only", "2026-11-10T10:05:00.000Z");
    await writeClaudeSession(userHome, "p1", "sess-rel-gone", dirFormerlyLinked, "Previously linked folder", "2026-11-10T10:06:00.000Z");
    await writeClaudeSession(userHome, "p1", "sess-none", dirUnrelated, "No relation session", "2026-11-10T10:07:00.000Z");

    const nowIso = "2026-11-10T10:00:00.000Z";
    const state: { snapshot: SessionProjectSnapshot; suggester?: SessionAttributionSuggester | null; searchEvents: number; nowIso?: string } = {
      searchEvents: 0,
      nowIso: "2026-11-10T11:00:00.000Z",
      suggester: {
        promptVersion: () => 1,
        suggest: async input => ({
          items: input.groups.map(g => ({
            group: g.ref,
            project: 0,
            alternatives: [],
            reason: "Belongs to Project Alpha",
            evidence: [{ kind: "title" as const, text: g.titles[0] ?? "task" }],
          })),
        }),
      },
      snapshot: {
        projects: [
          { project_id: "proj-a", display_name: "Project Alpha" },
          { project_id: "proj-b", display_name: "Project Beta" },
        ],
        directories: [
          { workspace_id: "ws-a", canonical_path: dirAlpha, realpath_verified: true, display_name: "ws-alpha", project_ids: ["proj-a"], person_project_ids: ["proj-a"], created_at: nowIso, updated_at: nowIso },
          { workspace_id: "ws-b", canonical_path: dirBeta, realpath_verified: true, display_name: "ws-beta", project_ids: ["proj-b"], person_project_ids: ["proj-b"], created_at: nowIso, updated_at: nowIso },
          { workspace_id: "ws-sh", canonical_path: dirShared, realpath_verified: true, display_name: "ws-shared", project_ids: ["proj-a", "proj-b"], person_project_ids: ["proj-a", "proj-b"], created_at: nowIso, updated_at: nowIso },
          { workspace_id: "ws-rt", canonical_path: dirRuntimeOnly, realpath_verified: true, display_name: "ws-runtime", project_ids: ["proj-b"], person_project_ids: [], created_at: nowIso, updated_at: nowIso },
          { workspace_id: "ws-former", canonical_path: dirFormerlyLinked, realpath_verified: true, display_name: "ws-formerly-linked", project_ids: ["proj-a"], person_project_ids: ["proj-a"], created_at: nowIso, updated_at: nowIso },
        ],
        bindings: [
          { binding_id: "b-1", runtime_id: "claude-code", stable_work_context_id: "sess-other-report", project_id: "proj-b", bound_by: "runtime:claude-code", created_at: nowIso, updated_at: nowIso },
          { binding_id: "b-2", runtime_id: "claude-code", stable_work_context_id: "sess-reported", project_id: "proj-b", bound_by: "runtime:claude-code", created_at: nowIso, updated_at: nowIso },
        ],
      },
    };

    const svc = new SessionsService(homeDir, buildTestPorts(homeDir, userHome, state));
    try {
      const initialScope = await svc.scopeRead({}, PERSON_CALLER);
      await svc.scopeSet(
        {
          expected_revision: initialScope.scope_revision,
          sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }],
        },
        PERSON_CALLER,
      );
      await svc.waitForDiscoveryIdle();
      // First read primes derived directory cache while `dirFormerlyLinked` is linked to `proj-a`.
      await svc.list({ view: "all" }, PERSON_CALLER);
      // Unlink `dirFormerlyLinked`: its cached directory transitions from `automatic` to `relation_gone` (level 8)!
      state.snapshot = {
        ...state.snapshot,
        directories: state.snapshot.directories.filter(d => d.workspace_id !== "ws-former"),
      };

      const all = await svc.list({ view: "all" }, PERSON_CALLER);
      const byNative = new Map((all.sessions as ExternalSessionRow[]).map(r => [r.identity.native_id, r]));
      assert.equal(byNative.get("sess-auto")?.attribution.state, "automatic");
      const otherReportAttr = byNative.get("sess-other-report")?.attribution;
      assert.equal(otherReportAttr?.state, "automatic");
      assert.equal(otherReportAttr?.state === "automatic" ? otherReportAttr.tool_reported_other?.project.project_id : undefined, "proj-b");
      assert.equal(byNative.get("sess-ambig")?.attribution.state === "unfiled" ? byNative.get("sess-ambig")?.attribution.reason : undefined, "ambiguous");
      assert.equal(byNative.get("sess-reported")?.attribution.state, "reported");
      assert.equal(byNative.get("sess-tool-linked")?.attribution.state === "unfiled" ? byNative.get("sess-tool-linked")?.attribution.reason : undefined, "tool_linked");
      assert.equal(byNative.get("sess-rel-gone")?.attribution.state === "unfiled" ? byNative.get("sess-rel-gone")?.attribution.reason : undefined, "relation_gone");
      assert.equal(byNative.get("sess-none")?.attribution.state === "unfiled" ? byNative.get("sess-none")?.attribution.reason : undefined, "no_relation");

      const targetRow = byNative.get("sess-none")!;
      assert.equal(targetRow.attribution_revision, 0);
      const confirmed = await svc.attributionSet(
        { session_key: targetRow.session_key, decision: { kind: "project", project_id: "proj-b" }, expected_revision: 0 },
        PERSON_CALLER,
      );
      assert.equal(confirmed.attribution.state, "confirmed");
      assert.equal(confirmed.attribution_revision, 1);

      const leftUnfiled = await svc.attributionSet(
        { session_key: targetRow.session_key, decision: { kind: "leave_unfiled" }, expected_revision: 1 },
        PERSON_CALLER,
      );
      assert.equal(leftUnfiled.attribution.state === "unfiled" ? leftUnfiled.attribution.reason : undefined, "left_unfiled");
      assert.equal(leftUnfiled.attribution_revision, 2);

      const cleared = await svc.attributionSet(
        { session_key: targetRow.session_key, decision: { kind: "clear" }, expected_revision: 2 },
        PERSON_CALLER,
      );
      assert.equal(cleared.attribution.state === "unfiled" ? cleared.attribution.reason : undefined, "no_relation");
      assert.equal(cleared.attribution_revision, 3, "clear never resets attribution_revision to 0");

      await assert.rejects(
        () => svc.attributionSet({ session_key: targetRow.session_key, decision: { kind: "project", project_id: "proj-a" }, expected_revision: 0 }, PERSON_CALLER),
        (err: unknown) => err instanceof ActionError && err.code === "sessions.attribution_conflict",
      );

      // Confirm `targetRow` to `proj-b` at 11:00, then run a suggestion at 12:00 pointing to `proj-a`: surfaces `later_suggestion` without altering `confirmed`!
      const reconfirmed = await svc.attributionSet(
        { session_key: targetRow.session_key, decision: { kind: "project", project_id: "proj-b" }, expected_revision: 3 },
        PERSON_CALLER,
      );
      assert.equal(reconfirmed.attribution.state, "confirmed");
      state.nowIso = "2026-11-10T12:00:00.000Z";
      await svc.attributionSuggest({ session_keys: [targetRow.session_key] }, PERSON_CALLER);
      const withLater = (await svc.list({ view: "all" }, PERSON_CALLER)).sessions.find(r => r.session_key === targetRow.session_key) as ExternalSessionRow;
      assert.equal(withLater.attribution.state, "confirmed");
      assert.equal(withLater.attribution.state === "confirmed" ? withLater.attribution.project.project_id : undefined, "proj-b");
      assert.equal(withLater.attribution.state === "confirmed" ? withLater.attribution.later_suggestion?.project?.project_id : undefined, "proj-a");

      // Delete `proj-b`: `session_attributions` survives and surfaces `project_gone`.
      state.snapshot = {
        ...state.snapshot,
        projects: [{ project_id: "proj-a", display_name: "Project Alpha" }],
      };
      svc.purgeProject("proj-b");
      const afterPurge = await svc.list({ view: "unfiled" }, PERSON_CALLER);
      const goneRow = (afterPurge.sessions as ExternalSessionRow[]).find(r => r.session_key === targetRow.session_key);
      assert.equal(goneRow?.attribution.state === "unfiled" ? goneRow.attribution.reason : undefined, "project_gone");
    } finally {
      svc.close();
    }
  });
});

test("SRB-05 SRB-08 scope counts, project AI read CAS, suggestion caching/groups cap, connector usages and Host wiring", async () => {
  await withTempDir("molis-sessions-counts-", async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    const wsDir = path.join(root, "proj-one-dir");
    await mkdir(homeDir, { recursive: true });
    await mkdir(userHome, { recursive: true });
    await mkdir(wsDir, { recursive: true });

    for (let i = 0; i < 22; i++) {
      const uniqueDir = path.join(root, `unfiled-dir-${i}`);
      await mkdir(uniqueDir, { recursive: true });
      await writeClaudeSession(userHome, "batch", `sess-group-${i}`, uniqueDir, `Group ${i} task`, `2026-11-10T11:${String(i).padStart(2, "0")}:00.000Z`);
    }
    await writeClaudeSession(userHome, "batch", "sess-filed-one", wsDir, "Filed session", "2026-11-10T12:00:00.000Z");

    let suggestCalls = 0;
    const nowIso = "2026-11-10T10:00:00.000Z";
    const state: { snapshot: SessionProjectSnapshot; suggester?: SessionAttributionSuggester | null; searchEvents: number } = {
      searchEvents: 0,
      suggester: {
        promptVersion: () => 1,
        suggest: async input => {
          suggestCalls++;
          return {
            items: input.groups.map(g => ({
              group: g.ref,
              project: input.projects[0]?.ref ?? null,
              alternatives: [],
              reason: "目录与项目名称接近",
              evidence: [{ kind: "title" as const, text: g.titles[0] ?? "task" }],
            })),
          };
        },
      },
      snapshot: {
        projects: [{ project_id: "proj-1", display_name: "Project One" }],
        directories: [
          { workspace_id: "ws-1", canonical_path: wsDir, realpath_verified: true, display_name: "proj-one-dir", project_ids: ["proj-1"], person_project_ids: ["proj-1"], created_at: nowIso, updated_at: nowIso },
        ],
        bindings: [],
      },
    };

    const svc = new SessionsService(homeDir, buildTestPorts(homeDir, userHome, state));
    try {
      const s0 = await svc.scopeRead({ include_counts: true }, personInProject("proj-1"));
      const s1 = await svc.scopeSet(
        { expected_revision: s0.scope_revision, sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] },
        PERSON_CALLER,
      );
      await svc.waitForDiscoveryIdle();

      const countsOpen = (await svc.scopeRead({ include_counts: true }, personInProject("proj-1"))).project_ai_reads[0]!;
      assert.equal(countsOpen.current, true);
      assert.equal(countsOpen.counts?.filed, 1);
      assert.equal(countsOpen.counts?.ai_readable, 1);
      assert.equal(countsOpen.counts?.blocked.length, 0);

      // Stop claude-code: `filed` stays 1, `ai_readable` drops to 0, `blocked` names claude-code (count 1).
      const s2 = await svc.scopeSet(
        { expected_revision: s1.scope_revision, sources: [{ entry_id: "claude-code", allowed: false, directories: { mode: "all" } }] },
        PERSON_CALLER,
      );
      const countsBlocked = (await svc.scopeRead({ include_counts: true }, personInProject("proj-1"))).project_ai_reads[0]!;
      assert.equal(countsBlocked.counts?.filed, 1);
      assert.equal(countsBlocked.counts?.ai_readable, 0);
      assert.equal(countsBlocked.counts?.blocked[0]?.entry_id, "claude-code");
      assert.equal(countsBlocked.counts?.blocked[0]?.count, 1);

      // Re-open source and verify `too_many_groups` (> 20 directory groups) + cached `suggest` + `retry: true`.
      await svc.scopeSet(
        { expected_revision: s2.scope_revision, sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] },
        PERSON_CALLER,
      );
      await svc.waitForDiscoveryIdle();
      const unfiled = await svc.list({ view: "unfiled", limit: 30 }, PERSON_CALLER);
      assert.equal(unfiled.sessions.length, 22);

      await assert.rejects(
        () => svc.attributionSuggest({ session_keys: unfiled.sessions.map(s => s.session_key) }, PERSON_CALLER),
        (err: unknown) => err instanceof ActionError && err.code === "sessions.too_many_groups",
      );

      const twoKeys = unfiled.sessions.slice(0, 2).map(s => s.session_key);
      const firstSuggest = await svc.attributionSuggest({ session_keys: twoKeys }, PERSON_CALLER);
      assert.equal(firstSuggest.suggestions.length, 2);
      assert.equal(firstSuggest.suggestions[0]?.suggestion.status, "ready");
      assert.equal(suggestCalls, 1);

      await svc.attributionSuggest({ session_keys: twoKeys }, PERSON_CALLER);
      assert.equal(suggestCalls, 1, "cached input_digest skips second model call");

      await svc.attributionSuggest({ session_keys: twoKeys, retry: true }, PERSON_CALLER);
      assert.equal(suggestCalls, 2, "retry forces fresh model call");

      // Project AI read CAS.
      const permit1 = await svc.projectAiReadSet({ allowed: true, expected_revision: 0 }, personInProject("proj-1"));
      assert.equal(permit1.allowed, true);
      assert.equal(permit1.revision, 1);
      await assert.rejects(
        () => svc.projectAiReadSet({ allowed: false, expected_revision: 0 }, personInProject("proj-1")),
        (err: unknown) => err instanceof ActionError && err.code === "sessions.scope_conflict",
      );
    } finally {
      svc.close();
    }

    // Also verify `MolisWorkLocalHost` registers `system.sessions` actions cleanly.
    const hostHome = path.join(root, "host-home");
    await mkdir(hostHome, { recursive: true });
    const host = new MolisWorkLocalHost({ homeDirectory: hostHome, sessions: { homeRoot: userHome, env: {} }, completeText: null });
    try {
      const res = await host.homeActionClient().invoke({ ...PERSON_CALLER, permissions: ["sessions:read"] }, sessionsActions.scopeRead, {}) as { sources: Array<{ entry_id: string; adapter: string }> };
      assert.ok(res.sources.some(src => src.entry_id === "codex" && src.adapter === "available"));
      assert.ok(res.sources.some(src => src.entry_id === "cursor" && src.adapter === "none"));
    } finally {
      await host.close();
    }
  });
});
