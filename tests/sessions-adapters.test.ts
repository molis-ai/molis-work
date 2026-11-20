import assert from "node:assert/strict";
import { appendFile, mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import type { ExternalSessionRow } from "@molis-ai/molis-work-contracts/services/sessions";
import { createHostSessionsPorts } from "@molis-ai/molis-work-app-local-host";
import {
  EXTERNAL_SESSIONS_STORE,
  SessionsService,
  identifySessionDirectory,
  type SessionCommandResult,
  type SessionProjectSnapshot,
  type SessionsPorts,
} from "@molis-ai/molis-work-service-sessions";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

const PERSON: ActionCallContext = {
  actor_id: LOCAL_PERSON_ACTOR_ID,
  project_id: null,
  audience: "user",
  permissions: [],
};

const EMPTY_SNAPSHOT: SessionProjectSnapshot = { projects: [], directories: [], bindings: [] };

async function withRoot<T>(run: (root: string) => Promise<T>): Promise<T> {
  const raw = await mkdtemp(path.join(tmpdir(), "molis-sessions-adapters-"));
  const dir = await realpath(raw);
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("SRB-01 SRB-02 SRB-10 SRB-13 local file adapters (Claude, Gemini, Pi, Qoder, Kimi, MiniMax) parse transcripts, skip subagents/thoughts, mark attachments and keep append-stable positions", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    const repoDir = path.join(root, "repo");
    await mkdir(homeDir, { recursive: true });
    await mkdir(userHome, { recursive: true });
    await mkdir(repoDir, { recursive: true });

    // 1. Claude Code + skipped subagents/sidechains/snapshot-shells + attachment + >64KB oversized message
    const claudeDir = path.join(userHome, ".claude", "projects", "repo-slug");
    await mkdir(path.join(claudeDir, "subagents"), { recursive: true });
    await writeFile(
      path.join(claudeDir, "subagents", "sub-ignored.jsonl"),
      `${JSON.stringify({ sessionId: "sub-ignored", cwd: repoDir, timestamp: "2026-11-10T01:00:00Z", message: { role: "user", content: "subagent" } })}\n`,
    );
    await writeFile(
      path.join(claudeDir, "sidechain-only.jsonl"),
      `${JSON.stringify({ sessionId: "sidechain-only", isSidechain: true, cwd: repoDir, timestamp: "2026-11-10T01:00:10Z", message: { role: "user", content: "sidechain subagent task" } })}\n`,
    );
    await writeFile(
      path.join(claudeDir, "snapshot-shell.jsonl"),
      [
        JSON.stringify({ type: "file-history-snapshot", messageId: "snap-1", snapshot: {} }),
        JSON.stringify({ type: "summary", summary: "Shell summary without messages" }),
      ].join("\n") + "\n",
    );
    const bigText = `HEAD-${"x".repeat(70_000)}-TAIL`;
    await writeFile(
      path.join(claudeDir, "claude-main-1.jsonl"),
      [
        JSON.stringify({ sessionId: "claude-main-1", cwd: repoDir, timestamp: "2026-11-10T01:01:00Z", message: { role: "user", content: [{ type: "text", text: "Hello Claude" }, { type: "image", source: { data: "AAAA" } }] } }),
        JSON.stringify({ sessionId: "claude-main-1", isSidechain: true, cwd: repoDir, timestamp: "2026-11-10T01:01:30Z", message: { role: "assistant", content: "Sidechain internal chatter" } }),
        JSON.stringify({ sessionId: "claude-main-1", cwd: repoDir, timestamp: "2026-11-10T01:02:00Z", message: { role: "assistant", content: bigText } }),
      ].join("\n") + "\n",
    );

    // 2. Gemini CLI: omits `thoughts` & `logs.json`, marks inlineData `[附件未读取]`
    const geminiChats = path.join(userHome, ".gemini", "tmp", "hash1", "chats");
    await mkdir(geminiChats, { recursive: true });
    await writeFile(path.join(geminiChats, "logs.json"), JSON.stringify({ ignored: true }));
    await writeFile(
      path.join(geminiChats, "session-gem-1.json"),
      JSON.stringify({
        sessionId: "gem-session-1",
        cwd: repoDir,
        summary: "Gemini CLI check",
        messages: [
          { type: "user", timestamp: "2026-11-10T02:00:00Z", content: "Explain schema" },
          {
            type: "gemini",
            timestamp: "2026-11-10T02:01:00Z",
            thoughts: [{ subject: "secret internal chain" }],
            content: [{ thought: true, text: "hidden thought" }, { text: "Visible answer" }, { inlineData: { mimeType: "image/png", data: "BBBB" } }],
          },
        ],
      }),
    );
    // MR19-04: an entire newer page of unrelated JSON precedes the valid older conversation.
    await utimes(path.join(geminiChats, "session-gem-1.json"), 1, 1);
    await Promise.all(Array.from({ length: 50 }, (_, n) => writeFile(path.join(geminiChats, `future-${n}.json`), "{}")));

    // 3. Pi Agent: merges toolCall + toolResult
    const piDir = path.join(userHome, ".pi", "agent", "sessions", "proj");
    await mkdir(piDir, { recursive: true });
    await writeFile(
      path.join(piDir, "20261110_pi-sess-1.jsonl"),
      [
        JSON.stringify({ type: "session", id: "pi-sess-1", cwd: repoDir, timestamp: "2026-11-10T03:00:00Z" }),
        JSON.stringify({ timestamp: "2026-11-10T03:01:00Z", message: { role: "user", content: "Run ls" } }),
        JSON.stringify({ timestamp: "2026-11-10T03:02:00Z", message: { role: "assistant", content: [{ type: "toolCall", id: "tc-1", name: "bash", arguments: { cmd: "ls" } }] } }),
        JSON.stringify({ timestamp: "2026-11-10T03:03:00Z", message: { role: "toolResult", toolCallId: "tc-1", toolName: "bash", isError: false, content: "README.md" } }),
      ].join("\n") + "\n",
    );

    // 4. Qoder (`~/.qoder-cn/projects`), 5. Kimi Code (`~/.kimi-code/sessions` `context.jsonl` + `metadata.json`, skips `wire.jsonl`), 6. MiniMax Code (`~/.minimax`, skips `auth.jsonl`)
    const qoderDir = path.join(userHome, ".qoder-cn", "projects", "demo");
    await mkdir(qoderDir, { recursive: true });
    await writeFile(
      path.join(qoderDir, "qoder-1.jsonl"),
      `${JSON.stringify({ sessionId: "qoder-1", cwd: repoDir, timestamp: "2026-11-10T04:00:00Z", message: { role: "user", content: "Qoder prompt" } })}\n`,
    );

    const kimiSessionDir = path.join(userHome, ".kimi-code", "sessions", "whash", "kimi-sess-1");
    await mkdir(kimiSessionDir, { recursive: true });
    await writeFile(path.join(kimiSessionDir, "wire.jsonl"), `${JSON.stringify({ raw: "wire-only" })}\n`);
    await writeFile(path.join(kimiSessionDir, "metadata.json"), JSON.stringify({ title: "Kimi Metadata Title", work_dir: repoDir, updated_at: "2026-11-10T05:05:00Z" }));
    await writeFile(
      path.join(kimiSessionDir, "context.jsonl"),
      `${JSON.stringify({ role: "user", content: "Kimi context question", timestamp: "2026-11-10T05:00:00Z" })}\n`,
    );

    const minimaxDir = path.join(userHome, ".minimax", "projects", "p1");
    await mkdir(minimaxDir, { recursive: true });
    await writeFile(path.join(minimaxDir, "auth-token.jsonl"), `${JSON.stringify({ token: "skip" })}\n`);
    await writeFile(
      path.join(minimaxDir, "minimax-1.jsonl"),
      `${JSON.stringify({ sessionId: "minimax-1", cwd: repoDir, timestamp: "2026-11-10T06:00:00Z", message: { role: "user", content: "MiniMax prompt" } })}\n`,
    );

    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: userHome, env: {} });
    const ports: SessionsPorts = {
      ...base,
      projects: { read: async op => op(EMPTY_SNAPSHOT) },
      directories: { identify: p => identifySessionDirectory(p, { homeDir: userHome }) },
    };

    const svc = new SessionsService(homeDir, ports);
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      const localEntries: ExternalToolId[] = ["claude-code", "gemini-cli", "pi-agent", "qoder-cn", "kimi-code", "minimax-code"];
      await svc.scopeSet(
        {
          expected_revision: s0.scope_revision,
          sources: localEntries.map(entry_id => ({ entry_id, allowed: true, directories: { mode: "all" as const } })),
        },
        PERSON,
      );
      await svc.waitForDiscoveryIdle();

      const listed = await svc.list({ view: "all", limit: 50 }, PERSON);
      const rows = listed.sessions as ExternalSessionRow[];
      const ids = rows.map(r => `${r.tool.entry_id}:${r.identity.native_id}`).sort();
      assert.deepEqual(ids, [
        "claude-code:claude-main-1",
        "gemini-cli:gem-session-1",
        "kimi-code:kimi-sess-1",
        "minimax-code:minimax-1",
        "pi-agent:pi-sess-1",
        "qoder-cn:qoder-1",
      ]);

      const claudeRow = rows.find(r => r.tool.entry_id === "claude-code")!;
      const claudeHist1 = await svc.historyRead({ session_key: claudeRow.session_key }, PERSON);
      assert.equal(claudeHist1.entries.some(e => e.text.includes("Sidechain internal chatter")), false);
      assert.ok(claudeHist1.entries.some(e => e.text === "[附件未读取]"));
      const truncatedEntry = claudeHist1.entries.find(e => e.truncated);
      assert.ok(truncatedEntry && Buffer.byteLength(truncatedEntry.text, "utf8") <= 64 * 1024);
      const firstPosBeforeAppend = claudeHist1.entries[0]!.position;

      // Append a new JSONL line: existing entry positions stay byte-offset identical!
      await appendFile(
        path.join(claudeDir, "claude-main-1.jsonl"),
        `${JSON.stringify({ sessionId: "claude-main-1", cwd: repoDir, timestamp: "2026-11-10T01:05:00Z", message: { role: "user", content: "Follow-up line" } })}\n`,
      );
      const claudeHist2 = await svc.historyRead({ session_key: claudeRow.session_key }, PERSON);
      assert.equal(claudeHist2.entries[0]!.position, firstPosBeforeAppend);
      assert.equal(claudeHist2.entries.at(-1)?.text, "Follow-up line");

      const gemRow = rows.find(r => r.tool.entry_id === "gemini-cli")!;
      const gemHist = await svc.historyRead({ session_key: gemRow.session_key }, PERSON);
      assert.equal(gemHist.entries.some(e => e.text.includes("hidden thought") || e.text.includes("secret internal")), false);
      assert.ok(gemHist.entries.some(e => e.text === "Visible answer"));
      assert.ok(gemHist.entries.some(e => e.text === "[附件未读取]"));

      const piRow = rows.find(r => r.tool.entry_id === "pi-agent")!;
      const piHist = await svc.historyRead({ session_key: piRow.session_key }, PERSON);
      const stepEntry = piHist.entries.find(e => e.role === "tool_step");
      assert.equal(stepEntry?.step?.name, "bash");
      assert.equal(stepEntry?.step?.status, "ok");
      assert.match(stepEntry?.text ?? "", /README\.md/u);

      const kimiRow = rows.find(r => r.tool.entry_id === "kimi-code")!;
      assert.equal(kimiRow.title, "Kimi Metadata Title");
    } finally {
      svc.close();
    }

    // MR19-04: resume the saved offset after the previous version indexed the valid file on page one.
    await utimes(path.join(geminiChats, "future-0.json"), 0, 0);
    {
      using db = new DatabaseSync(homeSqlitePath(homeDir, EXTERNAL_SESSIONS_STORE));
      const updated = db.prepare("UPDATE session_sources SET state = 'reading', progress_cursor = '50', progress_read = 1, skipped_count = 49 WHERE entry_id = 'gemini-cli'").run();
      assert.equal(updated.changes, 1);
    }
    const restarted = new SessionsService(homeDir, ports);
    try {
      await restarted.waitForDiscoveryIdle();
      const listed = await restarted.list({ view: "all", limit: 50 }, PERSON);
      const source = listed.sources.find(item => item.entry_id === "gemini-cli");
      assert.equal(source?.state, "complete");
      assert.equal(source.session_count, 1);
      assert.ok(listed.sessions.some(row => row.identity.native_id === "gem-session-1"));
    } finally {
      restarted.close();
    }
  });
});

test("SRB-01 SRB-07 SRB-12 SRB-13 command/protocol/cloud adapters (Codex + subagent forked_from, Copilot via gh CLI, Droid tool.search, Qwen) and partial vs empty read failure", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    const repoDir = path.join(root, "repo");
    await mkdir(homeDir, { recursive: true });
    await mkdir(userHome, { recursive: true });
    await mkdir(repoDir, { recursive: true });

    // Partial vs corrupted JSONL files under Claude for `read_state: "partial"` vs raised error on empty read.
    const claudeDir = path.join(userHome, ".claude", "projects", "broken");
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      path.join(claudeDir, "partial-sess.jsonl"),
      `${JSON.stringify({ sessionId: "partial-sess", cwd: repoDir, timestamp: "2026-11-10T07:00:00Z", message: { role: "user", content: "Valid line before corruption" } })}\n{NOT_VALID_JSON\n`,
    );
    await writeFile(
      path.join(claudeDir, "mid-corrupt.jsonl"),
      [
        JSON.stringify({ sessionId: "mid-corrupt", cwd: repoDir, timestamp: "2026-11-10T07:00:30Z", message: { role: "user", content: "First line" } }),
        "{MID_FILE_BROKEN_JSON",
        JSON.stringify({ sessionId: "mid-corrupt", cwd: repoDir, timestamp: "2026-11-10T07:00:35Z", message: { role: "assistant", content: "After broken" } }),
      ].join("\n") + "\n",
    );
    await writeFile(
      path.join(claudeDir, "empty-corrupt.jsonl"),
      `${JSON.stringify({ sessionId: "empty-corrupt", cwd: repoDir, timestamp: "2026-11-10T07:01:00Z", type: "session" })}\n`,
    );

    const recordedCmds: Array<{ entry: string; argv: readonly string[] }> = [];
    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: userHome, env: {} });
    const ports: SessionsPorts = {
      ...base,
      projects: { read: async op => op(EMPTY_SNAPSHOT) },
      directories: { identify: p => identifySessionDirectory(p, { homeDir: userHome }) },
      protocols: {
        codexThreadList: async () => ({
          threads: [
            { id: "codex-parent-1", title: "Parent Codex", cwd: repoDir, updated_at: "2026-11-10T08:00:00Z", activity: "idle", parent_thread_id: null },
            { id: "codex-child-1", title: "Subagent Codex", cwd: repoDir, updated_at: "2026-11-10T08:05:00Z", activity: "running", parent_thread_id: "codex-parent-1" },
          ],
          next_cursor: null,
        }),
        codexThreadRead: async (_root, id) => ({
          id,
          title: "Parent Codex",
          cwd: repoDir,
          updated_at: "2026-11-10T08:00:00Z",
          activity: "idle",
          entries: [
            { position: "turn:0", role: "you", at: "2026-11-10T08:00:00Z", text: "Fix parser" },
            { position: "turn:1", role: "tool", at: "2026-11-10T08:01:00Z", text: "Parser fixed" },
          ],
        }),
      },
      commands: {
        run: async (entry, argv): Promise<SessionCommandResult> => {
          recordedCmds.push({ entry, argv });
          if (entry === "droid") {
            return {
              exit_code: 0,
              stderr: "",
              stdout: JSON.stringify([{ id: "droid-sess-1", title: "Droid refactor", cwd: repoDir, updated_at: "2026-11-10T09:00:00Z" }]),
            };
          }
          if (entry === "qwen-code") {
            return {
              exit_code: 0,
              stderr: "",
              stdout: JSON.stringify({ sessions: [{ id: "qwen-sess-1", title: "Qwen session", cwd: repoDir, updated_at: "2026-11-10T09:30:00Z" }] }),
            };
          }
          return { exit_code: 1, stdout: "", stderr: "unexpected" };
        },
      },
      connections: {
        choices: () => ({ choices: [{ connection_id: "conn-gh-1", display_name: "GitHub CLI", account_label: "octocat" }], connect_service_id: "github" }),
        current: id => (id === "conn-gh-1" ? { enabled: true } : null),
        request: async () => ({ status: 404, headers: {}, body: "" }),
        command: async (_connId, entry, argv): Promise<SessionCommandResult> => {
          recordedCmds.push({ entry, argv });
          if (argv.includes("list")) {
            return {
              exit_code: 0,
              stderr: "",
              stdout: JSON.stringify([
                { id: "task-42", name: "Copilot PR fix", state: "completed", updatedAt: "2026-11-10T10:00:00Z", pullRequestUrl: "https://github.com/org/repo/pull/42" },
              ]),
            };
          }
          return {
            exit_code: 0,
            stderr: "",
            stdout: "2026-11-10T10:00:00Z [user] Fix CI\n2026-11-10T10:01:00Z [assistant] Updated workflow\n",
          };
        },
      },
    };

    const svc = new SessionsService(homeDir, ports);
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      await svc.scopeSet(
        {
          expected_revision: s0.scope_revision,
          sources: [
            { entry_id: "codex", allowed: true, directories: { mode: "all" } },
            { entry_id: "droid", allowed: true, directories: { mode: "all" } },
            { entry_id: "qwen-code", allowed: true, directories: { mode: "all" } },
            { entry_id: "copilot-coding-agent", connection_id: "conn-gh-1", allowed: true, directories: { mode: "all" } },
            { entry_id: "claude-code", allowed: true, directories: { mode: "all" } },
          ],
        },
        PERSON,
      );
      await svc.waitForDiscoveryIdle();

      const all = await svc.list({ view: "all", limit: 50 }, PERSON);
      const rows = all.sessions as ExternalSessionRow[];
      const codexParent = rows.find(r => r.identity.native_id === "codex-parent-1")!;
      const codexChild = rows.find(r => r.identity.native_id === "codex-child-1")!;
      assert.equal(codexChild.forked_from, codexParent.session_key, "subagent thread links forked_from to parent session_key");

      const copilotRow = rows.find(r => r.tool.entry_id === "copilot-coding-agent")!;
      assert.equal(copilotRow.return_target?.kind, "url");
      const copilotHist = await svc.historyRead({ session_key: copilotRow.session_key }, PERSON);
      assert.equal(copilotHist.entries.length, 2);
      assert.equal(copilotHist.entries[0]?.role, "you");

      const droidSource = all.sources.find(s => s.entry_id === "droid")!;
      assert.ok("location_key" in droidSource && droidSource.location_key);
      const searched = await svc.toolSearch(
        { entry_id: "droid", location_key: droidSource.location_key, query: "refactor" },
        PERSON,
      );
      assert.equal(searched.sessions.length, 1);
      assert.equal(searched.sessions[0]?.identity.native_id, "droid-sess-1");

      // Trailing half-written line returns read entries + `read_state: "partial"` (`retryable: true`); mid-file corruption is non-retryable.
      const partialRow = rows.find(r => r.identity.native_id === "partial-sess")!;
      const partialHist = await svc.historyRead({ session_key: partialRow.session_key }, PERSON);
      assert.equal(partialHist.read_state, "partial");
      assert.equal(partialHist.entries.length, 1);
      assert.equal(partialHist.stopped?.code, "sessions.read_failed");
      assert.equal(partialHist.stopped?.retryable, true);

      const midRow = rows.find(r => r.identity.native_id === "mid-corrupt")!;
      const midHist = await svc.historyRead({ session_key: midRow.session_key }, PERSON);
      assert.equal(midHist.read_state, "partial");
      assert.equal(midHist.stopped?.code, "sessions.version_unreadable");
      assert.equal(midHist.stopped?.retryable, false);

      await writeFile(path.join(claudeDir, "empty-corrupt.jsonl"), "{BROKEN_LINE_ONLY\n");
      const emptyCorruptRow = rows.find(r => r.identity.native_id === "empty-corrupt")!;
      await assert.rejects(
        () => svc.historyRead({ session_key: emptyCorruptRow.session_key }, PERSON),
        (err: unknown) => err instanceof ActionError && err.code === "sessions.version_unreadable",
      );

      // Zero write/resume/exec commands were ever invoked across discovery, read, and search.
      for (const call of recordedCmds) {
        assert.equal(call.argv.some(arg => ["resume", "exec", "delete", "create", "apply"].includes(arg)), false);
      }
    } finally {
      svc.close();
    }
  });
});

test("SRB-13 Claude Code reports unreadable_version source state instead of silent empty list when session files use unsupported schema version", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    const claudeDir = path.join(userHome, ".claude", "projects", "future-repo");
    await mkdir(homeDir, { recursive: true });
    await mkdir(claudeDir, { recursive: true });
    await writeFile(
      path.join(claudeDir, "future-v99.jsonl"),
      `${JSON.stringify({ schemaVersion: 99, type: "claude_v99_envelope", sessionId: "future-v99" })}\n`,
    );
    await writeFile(
      path.join(claudeDir, "snapshot-shell.jsonl"),
      `${JSON.stringify({ type: "file-history-snapshot", messageId: "m-1", snapshot: {} })}\n`,
    );

    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: userHome, env: {} });
    const ports: SessionsPorts = {
      ...base,
      projects: { read: async op => op(EMPTY_SNAPSHOT) },
      directories: { identify: p => identifySessionDirectory(p, { homeDir: userHome }) },
    };

    const svc = new SessionsService(homeDir, ports);
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      await svc.scopeSet(
        {
          expected_revision: s0.scope_revision,
          sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }],
        },
        PERSON,
      );
      await svc.waitForDiscoveryIdle();

      const listed = await svc.list({ view: "all", limit: 20 }, PERSON);
      assert.equal(listed.sessions.length, 0);
      const claudeSource = listed.sources.find(s => s.entry_id === "claude-code");
      assert.equal(claudeSource?.state, "version_unreadable");
    } finally {
      svc.close();
    }
  });
});

test("SRB-13 every file adapter reports unreadable_version instead of a silent empty history", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(userHome, ".gemini", "tmp", "p"), { recursive: true });
    await mkdir(path.join(userHome, ".qoder-cn", "projects", "p"), { recursive: true });
    await mkdir(path.join(userHome, ".kimi-code", "sessions", "hash", "kimi-future"), { recursive: true });
    await mkdir(path.join(userHome, ".minimax", "projects", "p"), { recursive: true });
    await mkdir(path.join(userHome, ".pi", "agent", "sessions", "p"), { recursive: true });

    const future = `${JSON.stringify({ schemaVersion: 99, type: "future_envelope" })}\n`;
    await writeFile(path.join(userHome, ".gemini", "tmp", "p", "session-future.json"), JSON.stringify({ schemaVersion: 99, type: "future_envelope" }));
    await writeFile(path.join(userHome, ".qoder-cn", "projects", "p", "qoder-future.jsonl"), future);
    await writeFile(path.join(userHome, ".kimi-code", "sessions", "hash", "kimi-future", "context.jsonl"), future);
    await writeFile(path.join(userHome, ".kimi-code", "sessions", "hash", "kimi-future", "metadata.json"), JSON.stringify({ title: "Future Kimi" }));
    await writeFile(path.join(userHome, ".minimax", "projects", "p", "minimax-future.jsonl"), future);
    await writeFile(path.join(userHome, ".pi", "agent", "sessions", "p", "pi-future.jsonl"), future);

    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: userHome, env: {} });
    const svc = new SessionsService(homeDir, {
      ...base,
      projects: { read: async operation => operation(EMPTY_SNAPSHOT) },
      directories: { identify: () => null },
    });
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      await svc.scopeSet({
        expected_revision: s0.scope_revision,
        sources: ["gemini-cli", "qoder-cn", "kimi-code", "minimax-code", "pi-agent"].map(entry_id => ({
          entry_id: entry_id as ExternalToolId,
          allowed: true,
          directories: { mode: "all" as const },
        })),
      }, PERSON);
      await svc.waitForDiscoveryIdle();
      const listed = await svc.list({ view: "all", limit: 20 }, PERSON);
      for (const entryId of ["gemini-cli", "qoder-cn", "kimi-code", "minimax-code", "pi-agent"] as const) {
        const source = listed.sources.find(item => item.entry_id === entryId);
        assert.equal(source?.state, "version_unreadable", `${entryId}: silent empty history`);
        assert.equal(source?.reason, "version_mismatch", `${entryId}: reason`);
        assert.equal(listed.sessions.filter(row => row.tool.entry_id === entryId).length, 0, `${entryId}: no shell row`);
      }
    } finally {
      svc.close();
    }
  });
});

test("SRB-01 SRB-02 Kimi Code reads state.json + wire.jsonl as well as context.jsonl + metadata.json", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    const repoDir = path.join(root, "repo");
    const sessionDir = path.join(userHome, ".kimi-code", "sessions", "hash", "kimi-wire-1");
    await mkdir(homeDir, { recursive: true });
    await mkdir(repoDir, { recursive: true });
    await mkdir(sessionDir, { recursive: true });
    await writeFile(path.join(sessionDir, "state.json"), JSON.stringify({ session_id: "kimi-wire-1", cwd: repoDir, title: "Kimi wire session", updated_at: "2026-11-10T05:05:00Z" }));
    await writeFile(
      path.join(sessionDir, "wire.jsonl"),
      [
        JSON.stringify({ role: "user", content: "Wire question", timestamp: "2026-11-10T05:00:00Z" }),
        JSON.stringify({ role: "assistant", content: "Wire answer", timestamp: "2026-11-10T05:01:00Z" }),
      ].join("\n") + "\n",
    );

    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: userHome, env: {} });
    const svc = new SessionsService(homeDir, {
      ...base,
      projects: { read: async operation => operation(EMPTY_SNAPSHOT) },
      directories: { identify: () => null },
    });
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      await svc.scopeSet({ expected_revision: s0.scope_revision, sources: [{ entry_id: "kimi-code", allowed: true, directories: { mode: "all" } }] }, PERSON);
      await svc.waitForDiscoveryIdle();
      const listed = await svc.list({ view: "all" }, PERSON);
      const row = listed.sessions.find(item => item.tool.entry_id === "kimi-code");
      assert.ok(row, "state.json + wire.jsonl discovers a session");
      assert.equal(row.title, "Kimi wire session");
      assert.equal(row.directory, repoDir);
      const history = await svc.historyRead({ session_key: row.session_key }, PERSON);
      assert.deepEqual(history.entries.map(entry => entry.text), ["Wire question", "Wire answer"]);
    } finally {
      svc.close();
    }
  });
});

test("S-sessions-read-only-commands 3: an authenticated gh 403 is reported as a permission/login recovery, not a generic retry", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    await mkdir(homeDir, { recursive: true });
    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: path.join(root, "user"), env: {} });
    const svc = new SessionsService(homeDir, {
      ...base,
      projects: { read: async operation => operation(EMPTY_SNAPSHOT) },
      directories: { identify: () => null },
      connections: {
        current: id => (id === "conn-gh" ? { enabled: true, account_label: "octocat" } : null),
        choices: () => ({ choices: [{ connection_id: "conn-gh", display_name: "GitHub CLI", account_label: "octocat" }], connect_service_id: "github" }),
        request: async () => ({ status: 404, headers: {}, body: "" }),
        command: async () => ({ exit_code: 1, stderr: "HTTP 403: Resource not accessible by personal access token", stdout: "" }),
      },
    });
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      await svc.scopeSet({
        expected_revision: s0.scope_revision,
        sources: [{ entry_id: "copilot-coding-agent", connection_id: "conn-gh", allowed: true, directories: { mode: "all" } }],
      }, PERSON);
      await svc.waitForDiscoveryIdle();
      const listed = await svc.list({ view: "all" }, PERSON);
      const source = listed.sources.find(item => item.entry_id === "copilot-coding-agent");
      assert.equal(source?.state, "needs_login");
      assert.equal(source?.reason, "login_expired");
      assert.equal(source?.next_step, "sign_in");
    } finally {
      svc.close();
    }
  });
});

test("SRB-13 a later discovery page with an unknown file does not discard valid sessions from an earlier page", async () => {
  await withRoot(async root => {
    const homeDir = path.join(root, "home");
    const userHome = path.join(root, "user");
    const dir = path.join(userHome, ".qoder-cn", "projects", "p");
    await mkdir(homeDir, { recursive: true });
    await mkdir(dir, { recursive: true });
    const futurePath = path.join(dir, "qoder-future.jsonl");
    await writeFile(futurePath, `${JSON.stringify({ schemaVersion: 99, type: "future" })}\n`);
    await utimes(futurePath, new Date(0), new Date(0));
    for (let index = 0; index < 50; index++) {
      await writeFile(
        path.join(dir, `qoder-${String(index).padStart(2, "0")}.jsonl`),
        `${JSON.stringify({ sessionId: `qoder-${index}`, cwd: root, timestamp: "2026-11-10T04:00:00Z", message: { role: "user", content: "hello" } })}\n`,
      );
    }
    const base = createHostSessionsPorts(homeDir, () => undefined, () => {}, { homeRoot: userHome, env: {} });
    const svc = new SessionsService(homeDir, {
      ...base,
      projects: { read: async operation => operation(EMPTY_SNAPSHOT) },
      directories: { identify: () => null },
    });
    try {
      const s0 = await svc.scopeRead({}, PERSON);
      await svc.scopeSet({ expected_revision: s0.scope_revision, sources: [{ entry_id: "qoder-cn", allowed: true, directories: { mode: "all" } }] }, PERSON);
      await svc.waitForDiscoveryIdle();
      const listed = await svc.list({ view: "all", limit: 100 }, PERSON);
      const source = listed.sources.find(item => item.entry_id === "qoder-cn");
      assert.equal(source?.state, "complete");
      assert.equal(listed.sessions.filter(row => row.tool.entry_id === "qoder-cn").length, 50);
    } finally {
      svc.close();
    }
  });
});
