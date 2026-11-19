// Batch 35 item 1 (SRB-09, specs/sessions-rebuild/spec.md; contract design §7.4 and §12 row 16): onboarding brings existing work in AI
// tools into a project. The round reads the sessions filed to an existing project as that project's AI, so the project's AI read permit
// decides: off, the organizing does not run and says why, and only the person turns it on. What it reads becomes sourced material the
// person can correct; a failed organizing keeps what was read; importing the same sessions again records them once.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { modelPromptText, type ModelPromptInput } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { SESSIONS_HISTORY_PERMISSION, SESSIONS_READ_PERMISSION, sessionsActions, sessionsErrors, type ExternalSessionEntry } from "@molis-ai/molis-work-contracts/services/sessions";
import {
  adoptContextJourney, bindLocalWebActions, bindLocalWebProjectAiActions, MolisWorkLocalHost, molisWorkHostProjectReference, readContextJourney, readOnboardingSessions,
  selectContextSources, sessionKeyOf, startContextJourney, updateContextDraft, waitContextJourney, withContextJourneys,
} from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

type Session = { key: string; title: string; entries: ExternalSessionEntry[]; partial?: boolean };
const entry = (position: string, role: ExternalSessionEntry["role"], at: string | null, text: string, step?: ExternalSessionEntry["step"]): ExternalSessionEntry =>
  ({ position, role, at, text, truncated: false, ...(step ? { step } : {}) });

/** What `sessions.list@1` and `sessions.history.read@1` answer the project's AI; `off` is the permit turned off. */
function sessionsClient(sessions: readonly Session[], options: { off?: boolean; reads?: string[] } = {}): BoundActionClient {
  return {
    discover: async () => [],
    invoke: (async (definition: { capability_id: string }, input: { session_key?: string; limit?: number; from?: { before: string } }) => {
      if (options.off) throw sessionsErrors.project_ai_read_off("当前项目的外部会话 AI 读取许可处于关闭状态", { next_step: "open_project_ai_read" });
      if (definition.capability_id === sessionsActions.list.capability_id) {
        return { sessions: sessions.map(session => ({ session_key: session.key, tool: { entry_id: "claude-code", display_name: "Claude Code", surface: "cli", region: "global" }, seen_via: [],
          title: session.title, directory: "/work/app", last_activity_at: "2026-10-03T10:00:00.000Z", activity: "idle", forked_from: null, return_target: null,
          attribution: { state: "automatic", project: { project_id: "p", display_name: "App" }, evidence: { kind: "directory", path: "/work/app" } } })),
          sources: [], unfiled_count: null, next_cursor: null, scope_revision: 1, trust: "untrusted" };
      }
      const session = sessions.find(one => one.key === input.session_key)!;
      options.reads?.push(session.key);
      // Newest page first, two entries a page, so the reader goes back through older pages.
      const end = input.from ? session.entries.findIndex(one => one.position === input.from!.before) : session.entries.length;
      const page = session.entries.slice(Math.max(0, end - 2), end);
      return { session_key: session.key, entries: page, older_cursor: end - 2 > 0 ? page[0]!.position : null, newer_cursor: null, matches: [], search: null,
        read_state: session.partial ? "partial" : "complete", stopped: session.partial ? { code: "sessions.read_stopped", at: null, retryable: true } : null, activity: "idle", trust: "untrusted" };
    }) as BoundActionClient["invoke"],
  };
}

const DB_SESSION: Session = { key: "sess-db", title: "Pick the database", entries: [
  entry("1", "you", "2026-09-01T09:00:00.000Z", "Let's use Postgres, not SQLite."),
  entry("2", "tool", "2026-09-01T09:01:00.000Z", "Agreed. I'll write the migration."),
  entry("3", "tool_step", "2026-09-01T09:05:00.000Z", "migrate up: 3 tables", { name: "bash", status: "ok" }),
  entry("4", "you", "2026-09-02T08:00:00.000Z", "Next: add the login page."),
] };

/** A one-off Home; the Hosts a test opens on it close before it is removed. */
async function home(t: { after(fn: () => unknown): void }, hosts: MolisWorkLocalHost[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "molis-onboarding-sessions-"));
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  t.after(async () => { for (const host of hosts) await host.close(); await rm(dir, { recursive: true, force: true }); });
  return dir;
}
/** A round that adds to an existing project, with the sessions as its source. */
function existingRound(dir: string, projectId = "project-existing") {
  const id = randomUUID();
  withContextJourneys(dir, store => store.create(id, projectId));
  selectContextSources(dir, id, { sources: [{ kind: "sessions", selected: true }] });
  return id;
}

test("SRB-09 each filed session is one material: the person's words, the tool's replies and its receipts in order, with when they happened", async () => {
  const read = await readOnboardingSessions(sessionsClient([DB_SESSION, { ...DB_SESSION, key: "sess-partial", title: "Half read", entries: DB_SESSION.entries.slice(0, 1), partial: true }]));
  assert.ok(!("refused" in read), "both sessions are read");
  assert.deepEqual(read.files.map(file => file.path), ["sessions/sess-db.md", "sessions/sess-partial.md"]);
  assert.equal(sessionKeyOf(read.files[0]!.path), "sess-db");
  assert.equal(read.titles["sessions/sess-db.md"], "Pick the database");
  const text = read.files[0]!.bytes!.toString("utf8");
  const order = ["### 你 · 2026-09-01T09:00:00.000Z", "### 工具 · 2026-09-01T09:01:00.000Z", "### 工具步骤 · bash（成功） · 2026-09-01T09:05:00.000Z", "### 你 · 2026-09-02T08:00:00.000Z"]
    .map(head => text.indexOf(head));
  assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1]!)), `entries in order across pages:\n${text}`);
  assert.match(text, /「你」是本人说的，「工具」是工具的回复，「工具步骤」是工具执行的回执。时间是当时发生的时间/);
  assert.doesNotMatch(text, /只读到一部分/);
  assert.match(read.files[1]!.bytes!.toString("utf8"), /这次只读到一部分/, "a partial read says so, never passes for the whole");
});

test("SRB-09 with the project's AI read permit off, the sessions are not read, the organizing does not run, and the round says why", async t => {
  const dir = await home(t), id = existingRound(dir);
  let modelCalls = 0;
  const refused = await readOnboardingSessions(sessionsClient([DB_SESSION], { off: true }));
  assert.ok("refused" in refused && /许可没打开/.test(refused.refused), "the reader answers why, and reads nothing");
  startContextJourney(dir, id, { withCatalog: withMolisWorkProjectCatalog, sessions: async () => sessionsClient([DB_SESSION], { off: true }),
    model: async () => ({ completeText: async () => { modelCalls++; return "# x\ny [S1]"; } }) });
  const failed = await waitContextJourney(dir, id);
  assert.equal(failed.phase, "failed");
  assert.match(failed.error!, /许可没打开.*只有你能打开它.*这一步不整理会话/);
  assert.equal(failed.sources.find(source => source.kind === "sessions")?.references, undefined);
  assert.equal(modelCalls, 0, "nothing reached the model");
});

test("SRB-09 a new project's round leaves the sessions for the step after the project exists", async t => {
  const dir = await home(t), id = randomUUID();
  withContextJourneys(dir, store => store.create(id));
  selectContextSources(dir, id, { sources: [{ kind: "sessions", selected: true }, { kind: "browser", selected: true, text: "The launch is on October 8." }] });
  startContextJourney(dir, id, { withCatalog: withMolisWorkProjectCatalog, sessions: async () => { throw new Error("must not read sessions before the project exists"); },
    model: async () => ({ completeText: async () => "# Launch\nOctober 8 [S1]" }) });
  const round = await waitContextJourney(dir, id);
  assert.equal(round.phase, "review", round.error ?? "");
  const sessions = round.sources.find(source => source.kind === "sessions")!;
  assert.equal(sessions.selected, true, "still chosen, for the next step");
  assert.equal(sessions.references, undefined);
  assert.equal(sessions.error, undefined);
});

test("SRB-09 a failed organizing keeps the sessions read, a retry reads none of them again, and the result cites them and can be corrected", async t => {
  const dir = await home(t), id = existingRound(dir), prompts: string[] = [];
  startContextJourney(dir, id, { withCatalog: withMolisWorkProjectCatalog, sessions: async () => sessionsClient([DB_SESSION]),
    model: async () => ({ completeText: async () => { throw new Error("model unavailable"); } }) });
  const failed = await waitContextJourney(dir, id);
  assert.equal(failed.phase, "failed");
  const kept = failed.sources.find(source => source.kind === "sessions")!.references!;
  assert.equal(kept.length, 1, "what was read stays");
  assert.equal(kept[0]!.session_key, "sess-db");
  assert.equal(kept[0]!.title, "Pick the database");
  startContextJourney(dir, id, { withCatalog: withMolisWorkProjectCatalog, sessions: async () => { throw new Error("must not read twice"); },
    model: async () => ({ completeText: async (input: ModelPromptInput) => { prompts.push(modelPromptText(input)); return "# App\n## 决定\n用 Postgres（2026-09-01）[S1]\n## 未完成\n登录页 [S1]"; } }) });
  const review = await waitContextJourney(dir, id);
  assert.equal(review.phase, "review", review.error ?? "");
  assert.deepEqual(review.summary!.references.map(reference => [reference.label, reference.title, reference.used_in_summary]), [["S1", "Pick the database", true]]);
  assert.match(prompts.join("\n"), /已定的决定|已经定下的决定|decisions already made/u, "the organizer is told to keep decisions and results with when they happened");
  assert.match(prompts.join("\n"), /Let's use Postgres, not SQLite\./);
  updateContextDraft(dir, id, { title: "App", body: "## 决定\n用 Postgres，不用 SQLite（2026-09-01）[S1]" });
  assert.match(readContextJourney(dir, id).summary!.body, /不用 SQLite/, "the person corrects the result before it is kept");
});

/** The person's actions in an existing project, as the onboarding route gives them (Pages and Artifacts by their own grants). */
function projectPorts(dir: string, hosts: MolisWorkLocalHost[]) {
  // Once a Host runs, the catalog is its own (as on the onboarding route): the Home has one writer.
  let host: MolisWorkLocalHost | undefined;
  let runCatalog: typeof withMolisWorkProjectCatalog = withMolisWorkProjectCatalog;
  const withCatalog: typeof withMolisWorkProjectCatalog = (options, operation) => runCatalog(options, operation);
  return {
    withCatalog,
    actions: async (_home: string, projectId: string, original_file?: { path: string; install_id: string }) => {
      const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
      if (!host) {
        host = new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }); hosts.push(host);
        runCatalog = host.configurePersonalPlanning(dir, host.ensureWebCatalog(dir, openMolisWorkProjectCatalog).withCatalog);
      }
      return bindActionClient(host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id })),
        () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: ["pages:read", "pages:write", "artifacts:read", "artifacts:write"], ...original_file ? { original_file } : {} }));
    },
  };
}

test("SRB-09 adopting adds to the existing project and makes none; importing the same session again records it once", { timeout: 180_000 }, async t => {
  const hosts: MolisWorkLocalHost[] = [], dir = await home(t, hosts);
  const project = await withMolisWorkProjectCatalog({ homeDirectory: dir }, catalog => catalog.createProject({ display_name: "App", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const ports = { ...projectPorts(dir, hosts), model: async () => ({ completeText: async () => "# App\n## 决定\n用 Postgres（2026-09-01）[S1]" }) };
  const round = async (session: Session) => {
    const id = existingRound(dir, project.project_id);
    startContextJourney(dir, id, { ...ports, sessions: async () => sessionsClient([session]) });
    assert.equal((await waitContextJourney(dir, id)).phase, "review");
    await assert.rejects(adoptContextJourney(dir, id, { title: "App", blank: true }, ports), /只能采用整理结果/, "no blank start in an existing project");
    const done = await adoptContextJourney(dir, id, { title: "App 的背景", body: "## 决定\n用 Postgres（2026-09-01）[S1]" }, ports);
    assert.equal(done.phase, "complete", done.error ?? "");
    return done.summary!.references[0]!;
  };
  const first = await round(DB_SESSION), again = await round(DB_SESSION);
  const projects = await ports.withCatalog({ homeDirectory: dir }, catalog => catalog.listProjects().map(one => one.project_id));
  assert.deepEqual(projects, [project.project_id], "the round made no project");
  assert.deepEqual(again.artifact, first.artifact, "the same session read again is the same material, not a new one");
  assert.deepEqual(again.documents, first.documents, "and the same source page");
  const grown = await round({ ...DB_SESSION, entries: [...DB_SESSION.entries, entry("5", "tool", "2026-09-03T08:00:00.000Z", "Login page done.")] });
  assert.equal(grown.artifact!.artifact_id, first.artifact!.artifact_id, "a session that went on is a newer version of its one material");
  assert.equal(grown.artifact!.version, first.artifact!.version + 1);
});

test("SRB-09 the reader is the project's AI: refused on a real Host while the permit is off, and it cannot turn the permit on; the person can", { timeout: 120_000 }, async t => {
  const { host, project } = await serveHomeRuntime(t);
  const { reference } = await project("外部会话的项目");
  const ai = () => bindLocalWebProjectAiActions(host, reference, [SESSIONS_READ_PERMISSION, SESSIONS_HISTORY_PERMISSION]);
  await assert.rejects(ai().invoke(sessionsActions.list, { view: "project" }), (error: unknown) => error instanceof ActionError && error.code === "sessions.project_ai_read_off");
  await assert.rejects(ai().invoke(sessionsActions.projectAiReadSet, { allowed: true, expected_revision: 0 }), (error: unknown) => error instanceof ActionError);
  await assert.rejects(ai().invoke(sessionsActions.list, { view: "all" }), (error: unknown) => error instanceof ActionError, "never the person's wider view");
  const person = bindLocalWebActions(host, reference, [SESSIONS_READ_PERMISSION, SESSIONS_HISTORY_PERMISSION, "sessions:manage"]);
  const allowed = await person.invoke(sessionsActions.projectAiReadSet, { allowed: true, expected_revision: 0 });
  assert.equal(allowed.allowed, true);
  const listed = await ai().invoke(sessionsActions.list, { view: "project" });
  assert.deepEqual(listed.sessions, [], "with the permit on, the AI reads the project's (here none)");
  assert.equal(listed.unfiled_count, null, "and is told nothing that is the person's alone");
});
