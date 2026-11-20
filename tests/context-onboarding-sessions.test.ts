// Batch 35 item 1 (SRB-09, specs/sessions-rebuild/spec.md; contract design §7.4 and §12 row 16): onboarding brings existing work in AI
// tools into a project. The round reads the sessions filed to an existing project as that project's AI, so the project's AI read permit
// decides: off, the organizing does not run and says why, and only the person turns it on. What it reads becomes sourced material the
// person can correct; a failed organizing keeps what was read; importing the same sessions again records them once.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { modelPromptText, type ModelPromptInput } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { SESSIONS_HISTORY_PERMISSION, SESSIONS_READ_PERMISSION, sessionsActions, sessionsErrors, type ExternalSessionEntry } from "@molis-ai/molis-work-contracts/services/sessions";
import {
  adoptContextJourney, bindLocalWebActions, bindLocalWebProjectAiActions, MolisWorkLocalHost, molisWorkHostProjectReference, onboardingTakers, readContextJourney, readOnboardingSessions,
  selectContextSources, sessionKeyOf, startContextJourney, updateContextDraft, waitContextJourney, withContextJourneys,
} from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";

type Session = { key: string; title: string; entries: ExternalSessionEntry[]; partial?: boolean };
const entry = (position: string, role: ExternalSessionEntry["role"], at: string | null, text: string, step?: ExternalSessionEntry["step"]): ExternalSessionEntry =>
  ({ position, role, at, text, truncated: false, ...(step ? { step } : {}) });

/** What `sessions.list@1` and `sessions.history.read@1` answer the project's AI; `off` is the permit turned off. */
function sessionsClient(sessions: readonly Session[], options: { off?: boolean; reads?: string[]; stopAfter?: number } = {}): BoundActionClient {
  return {
    discover: async () => [],
    invoke: (async (definition: { capability_id: string }, input: { session_key?: string; limit?: number; from?: { before: string } }) => {
      if (options.off) throw sessionsErrors.project_ai_read_off("当前项目的外部会话 AI 读取许可处于关闭状态", { next_step: "open_project_ai_read" });
      if (definition.capability_id === sessionsActions.historyAuthorize.capability_id) return { scope_revision: "permit-1", revision: "scope-1" };
      if (definition.capability_id === sessionsActions.list.capability_id) {
        return { sessions: sessions.map(session => ({ session_key: session.key, tool: { entry_id: "claude-code", display_name: "Claude Code", surface: "cli", region: "global" }, seen_via: [],
          title: session.title, directory: "/work/app", last_activity_at: "2026-10-03T10:00:00.000Z", activity: "idle", forked_from: null, return_target: null,
          attribution: { state: "automatic", project: { project_id: "p", display_name: "App" }, evidence: { kind: "directory", path: "/work/app" } } })),
          sources: [], unfiled_count: null, next_cursor: null, scope_revision: 1, trust: "untrusted" };
      }
      const session = sessions.find(one => one.key === input.session_key)!;
      if (options.stopAfter !== undefined && options.reads?.length === options.stopAfter) throw sessionsErrors.scope_changed("读取范围已经变化");
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
  const reads: string[] = [];
  startContextJourney(dir, id, { withCatalog: withMolisWorkProjectCatalog, sessions: async () => sessionsClient([DB_SESSION], { reads }),
    model: async () => ({ completeText: async (input: ModelPromptInput) => { prompts.push(modelPromptText(input)); return "# App\n## 决定\n用 Postgres（2026-09-01）[S1]\n## 未完成\n登录页 [S1]"; } }) });
  const review = await waitContextJourney(dir, id);
  assert.deepEqual(reads, [], "reauthorizing cached materials does not read original history again");
  assert.equal(review.phase, "review", review.error ?? "");
  assert.deepEqual(review.summary!.references.map(reference => [reference.label, reference.title, reference.used_in_summary]), [["S1", "Pick the database", true]]);
  assert.match(prompts.join("\n"), /已定的决定|已经定下的决定|decisions already made/u, "the organizer is told to keep decisions and results with when they happened");
  assert.match(prompts.join("\n"), /Let's use Postgres, not SQLite\./);
  updateContextDraft(dir, id, { title: "App", body: "## 决定\n用 Postgres，不用 SQLite（2026-09-01）[S1]" });
  assert.match(readContextJourney(dir, id).summary!.body, /不用 SQLite/, "the person corrects the result before it is kept");
});

test("B35-R2 revoking during a history page keeps the earlier page and allows a different source to be organized", async t => {
  const dir = await home(t), id = existingRound(dir);
  selectContextSources(dir, id, { sources: [{ kind: "sessions", selected: true }, { kind: "browser", selected: true, text: "April launch" }] });
  const reads: string[] = [], prompts: string[] = [];
  startContextJourney(dir, id, { withCatalog: withMolisWorkProjectCatalog, sessions: async () => sessionsClient([DB_SESSION], { reads, stopAfter: 1 }),
    model: async () => ({ completeText: async (input: ModelPromptInput) => { prompts.push(modelPromptText(input)); return "# Calendar\nApril [S1]"; } }) });
  const review = await waitContextJourney(dir, id);
  assert.equal(review.phase, "review", review.error ?? "");
  assert.equal(review.sources.find(source => source.kind === "sessions")?.references?.length, 1);
  assert.match(review.sources.find(source => source.kind === "sessions")?.error ?? "", /已读材料仍在/);
  assert.match(prompts.join("\n"), /April launch/);
  assert.doesNotMatch(prompts.join("\n"), /Postgres|Login/);
  assert.deepEqual(review.summary?.references.map(ref => ref.session_key), [undefined]);
});

/** The person's actions in an existing project, as the onboarding route gives them (Pages and Artifacts by their own grants). */
function projectPorts(dir: string, hosts: MolisWorkLocalHost[]) {
  // Once a Host runs, the catalog is its own (as on the onboarding route): the Home has one writer.
  let host: MolisWorkLocalHost | undefined;
  let runCatalog: typeof withMolisWorkProjectCatalog = withMolisWorkProjectCatalog;
  const withCatalog: typeof withMolisWorkProjectCatalog = (options, operation) => runCatalog(options, operation);
  const client = async (projectId: string, permissions: readonly string[], original_file?: { path: string; install_id: string }) => {
    const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
    if (!host) {
      host = new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }); hosts.push(host);
      runCatalog = host.configurePersonalPlanning(dir, host.ensureWebCatalog(dir, openMolisWorkProjectCatalog).withCatalog);
    }
    return bindActionClient(host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id })),
      () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: [...permissions], ...original_file ? { original_file } : {} }));
  };
  return {
    withCatalog,
    takers: onboardingTakers,
    actions: (_home: string, projectId: string, original_file?: { path: string; install_id: string }) =>
      client(projectId, ["artifacts:read", "artifacts:write"], original_file),
    take: (_home: string, projectId: string, definition: ActionDefinition) =>
      client(projectId, definition.action.permissions),
  };
}

test("SRB-09 B35-R3 adopting the same session and summary again reuses the original page, the summary and the fixed artifacts", { timeout: 180_000 }, async t => {
  const hosts: MolisWorkLocalHost[] = [], dir = await home(t, hosts);
  const project = await withMolisWorkProjectCatalog({ homeDirectory: dir }, catalog => catalog.createProject({ display_name: "App", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const ports = { ...projectPorts(dir, hosts), model: async () => ({ completeText: async () => "# App\n## 决定\n用 Postgres（2026-09-01）[S1]" }) };
  const round = async (session: Session, body = "## 决定\n用 Postgres（2026-09-01）[S1]") => {
    const id = existingRound(dir, project.project_id);
    startContextJourney(dir, id, { ...ports, sessions: async () => sessionsClient([session]) });
    assert.equal((await waitContextJourney(dir, id)).phase, "review");
    await assert.rejects(adoptContextJourney(dir, id, { title: "App", blank: true }, ports), /只能采用整理结果/, "no blank start in an existing project");
    const done = await adoptContextJourney(dir, id, { title: "App 的背景", body }, ports);
    assert.equal(done.phase, "complete", done.error ?? "");
    return { ref: done.summary!.references[0]!, summary_open: done.summary_open, artifacts: done.artifact_references };
  };
  const first = await round(DB_SESSION), again = await round(DB_SESSION);
  const projects = await ports.withCatalog({ homeDirectory: dir }, catalog => catalog.listProjects().map(one => one.project_id));
  assert.deepEqual(projects, [project.project_id], "the round made no project");
  assert.deepEqual(again, first, "both journeys point to the original source and summary records");
  const edited = await round(DB_SESSION, "人工修订的决定 [S1]");
  assert.deepEqual(edited.ref.artifact, first.ref.artifact);
  assert.deepEqual(edited.ref.parts, first.ref.parts);
  assert.notDeepEqual(edited.summary_open, first.summary_open, "a new accepted text is a separate summary");
  const grown = await round({ ...DB_SESSION, entries: [...DB_SESSION.entries, entry("5", "tool", "2026-09-03T08:00:00.000Z", "Login page done.")] });
  assert.equal(grown.ref.artifact!.artifact_id, first.ref.artifact!.artifact_id, "a session that went on is a newer version of its one material");
  assert.equal(grown.ref.artifact!.version, first.ref.artifact!.version + 1);
  assert.notDeepEqual(grown.summary_open, first.summary_open, "a new source version is a separate summary");
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
  const authorized = await ai().invoke(sessionsActions.historyAuthorize, { session_keys: [] });
  const revoked = await person.invoke(sessionsActions.projectAiReadSet, { allowed: false, expected_revision: allowed.revision });
  await assert.rejects(ai().invoke(sessionsActions.historyAuthorize, { session_keys: [] }), { code: "sessions.project_ai_read_off" });
  await person.invoke(sessionsActions.projectAiReadSet, { allowed: true, expected_revision: revoked.revision });
  assert.notEqual((await ai().invoke(sessionsActions.historyAuthorize, { session_keys: [] })).revision, authorized.revision);
});

test("B35-R1 the real resume endpoint keeps existing and new project journeys separate", { timeout: 120_000 }, async t => {
  const env = await serveHomeRuntime(t);
  const alpha = await env.project("Alpha"), beta = await env.project("Beta");
  const prefix = "/api/onboarding/context";
  const created = [];
  for (const project of [beta, alpha, null]) {
    const id = randomUUID();
    const result = await env.request(prefix, { method: "POST", body: { id, ...(project ? { project_id: project.project_id } : {}) } });
    assert.equal(result.status, 201, await result.text());
    const selected = await env.request(`${prefix}/${id}/selection`, { method: "POST", body: { sources: [{ kind: "browser", text: "Kept draft", selected: true }] } });
    assert.equal(selected.status, 200, await selected.text());
    created.push(id);
  }
  const betaView = `?project=${encodeURIComponent(beta.project_id)}`;
  assert.equal((await (await env.request(prefix + betaView)).json()).resume.id, created[0]);
  assert.equal((await (await env.request(prefix)).json()).resume.id, created[2]);
  assert.equal((await env.request(`${prefix}/${created[1]}${betaView}`)).status, 400, "a mixed URL does not return Alpha's journey");
  assert.equal((await env.request(`${prefix}/${created[1]}`)).status, 200, "the canonical OAuth return uses the journey id");
});

test("B35-R2 the real Sessions owner fences a late model reply and a cached retry after revocation", { timeout: 120_000 }, async t => {
  const tmp = await mkdtemp(join(tmpdir(), "molis-b35-session-fixtures-"));
  const backend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(async () => {
    if (backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = backend;
    resetSecretStoreCache();
    await rm(tmp, { recursive: true, force: true });
  });
  const repo = await realpath(tmp), source = join(repo, ".claude", "projects", "test");
  await mkdir(source, { recursive: true });
  const marker = "B35 real fixture conversation";
  await writeFile(join(source, "alpha.jsonl"), JSON.stringify({ sessionId: "alpha", cwd: repo, timestamp: "2026-11-12T10:00:00Z", message: { role: "user", content: marker } }) + "\n");
  const entered = deferred(), release = deferred();
  const model = await startModelStandIn("fixture-key", "# Alpha\nUse the launch checklist. [S1]", { beforeReply: async body => {
    if (body.includes(marker)) { entered.resolve(); await release.promise; }
  } });
  t.after(async () => { release.resolve(); await model.close(); });
  const env = await serveHomeRuntime(t, { sessions: { homeRoot: repo, env: {} } });
  const alpha = await env.project("Alpha"), beta = await env.project("Beta");
  const api = async (path: string, body?: unknown) => {
    const result = await env.request(path, body === undefined ? {} : { method: "POST", body });
    assert.ok(result.ok, `${path}: ${result.status} ${await result.clone().text()}`);
    return result.json();
  };
  const dirs = `/projects/${alpha.project_id}/api/project-settings/directories`;
  await api(dirs, { change: "add_input", input: { workspace_path: repo, expected_revision: (await api(dirs)).revision } });
  const scope = await api("/api/sessions/scope");
  await api("/api/sessions/scope", { expected_revision: scope.scope_revision, sources: [{ entry_id: "claude-code", allowed: true, directories: { mode: "all" } }] });
  await env.host.sessions!.service.waitForDiscoveryIdle();
  await api("/api/settings/models/b35", { display_name: "B35 fixture", base_url: model.baseUrl, api_format: "openai-chat-completions", prompt_cache: "off",
    enabled: true, api_key: "fixture-key", models: [{ model_id: "fixture", enabled: true }] });

  const permit = `/projects/${alpha.project_id}/api/sessions/project-ai-read`;
  const allowed = await api(permit, { allowed: true, expected_revision: 0 });
  const prefix = "/api/onboarding/context", id = randomUUID(), betaId = randomUUID();
  await api(prefix, { id, project_id: alpha.project_id });
  await api(prefix, { id: betaId, project_id: beta.project_id });
  await api(`${prefix}/${id}/selection`, { sources: [{ kind: "sessions", selected: true }] });
  await api(`${prefix}/${id}/start`, {});
  const timeout = setTimeout(() => entered.resolve(), 20_000);
  await entered.promise;
  clearTimeout(timeout);
  assert.ok(model.bodies.some(body => body.includes(marker)), "the permitted round actually dispatched the material through Prologue");
  const off = await api(permit, { allowed: false, expected_revision: allowed.revision });
  const on = await api(permit, { allowed: true, expected_revision: off.revision });
  release.resolve();
  const refused = await waitContextJourney(env.home, id);
  assert.equal(refused.phase, "failed");
  assert.equal(refused.summary, null);
  assert.equal(refused.drafts, undefined);
  const [kept] = refused.sources.find(source => source.kind === "sessions")!.references!;
  const original = await api(`${prefix}/${id}/text/${kept!.text.sha256}`);
  assert.match(original.text, /B35 real fixture conversation/);
  assert.equal((await api(`${prefix}/${betaId}`)).phase, "selecting");
  const calls = model.requests.length;
  await api(permit, { allowed: false, expected_revision: on.revision });
  await api(`${prefix}/${id}/start`, {});
  assert.equal((await waitContextJourney(env.home, id)).phase, "failed");
  assert.equal(model.requests.length, calls, "the retry cannot send cached raw history while permission is off");
});
