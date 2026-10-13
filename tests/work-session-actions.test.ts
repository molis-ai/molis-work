import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { workActions, WORK_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-work";
import { SessionRuntimeService } from "../apps/local-host/src/session-runtime-resources.js";

// W2-18-WORK-EFFECT-01/02: pause the real Host's native transport before owner commit/next dispatch.
for (const operation of ["discover", "create", "prepare", "send"] as const) {
  for (const refusal of ["cancel", "revoke", "disable"] as const) {
    test(`Work ${operation} preserves invocation control after a native wait (${refusal})`, { timeout: 25_000 }, async () => {
      const home = await mkdtemp(join(tmpdir(), "work-effect-"));
      const project = await withCatalog({ homeDirectory: home }, async catalog => {
        const project = await catalog.createProject({ display_name: "Work effects", actor_id: "owner" });
        catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" });
        return project;
      });
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      const entered = Promise.withResolvers<void>(), response = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>(), abort = new AbortController();
      let blocked = false, revoked = false;
      const methods: string[] = [];
      const blockedMethod = operation === "discover" ? "thread/list" : operation === "prepare" ? "thread/turns/list" : "thread/start";
      const host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: {
        async request(method, params) {
          methods.push(method);
          if (blocked && method === blockedMethod) { entered.resolve(); await response.promise; }
          if (method === "thread/list") return { data: [{ id: "external-discovery", preview: "Discovered" }], nextCursor: null };
          if (method === "thread/start") return { thread: { id: "created-external-target" } };
          if (method === "thread/turns/list") return { data: [], nextCursor: null };
          if (method === "turn/start") return { turn: { id: "should-not-be-dispatched" } };
          return { thread: { id: params.threadId, turns: [] } };
        }, subscribe() { return () => undefined; },
      }, actionAvailability: projectActionAvailability(withCatalog, home) });
      const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const,
        permissions: [...WORK_ACTION_PERMISSIONS, "goals:read", "goals:write"], signal: abort.signal,
        validate_authority: async () => { if (revoked) throw new ActionError("actions.forbidden", "original grant revoked"); } };
      const client = bindActionClient(host.actionClient(reference), () => caller);
      let pending: Promise<unknown> | undefined;
      try {
        const owner = await host.sessionResources();
        const { goal } = await client.invoke(goalsActions.create, { title: "Handoff source", outcome: "Keep the original Session target", why: "Exercise real project ownership", idempotency_key: "source-goal" });
        const source = owner.registry.explicitlyLinkSession({ runtime_id: "codex", native_runtime_session_id: "source-thread",
          project_id: reference.project_id, current_goal_id: goal.goal_id, actor_id: "owner", user_confirmed: true });
        const prepared = operation === "send" ? await client.invoke(workActions.handoffPrepare, { session_id: source.session_id, target_runtime_id: "codex" }) : null;
        const observe = <Args extends unknown[], Result>(run: (...args: Args) => Promise<Result>) => async (...args: Args) => {
          try { return await run(...args); } finally { finished.resolve(); }
        };
        if (operation === "discover") owner.directory.discover = observe(owner.directory.discover.bind(owner.directory));
        else if (operation === "create") owner.directory.create = observe(owner.directory.create.bind(owner.directory));
        else if (operation === "prepare") owner.handoff.prepare = observe(owner.handoff.prepare.bind(owner.handoff));
        else owner.handoff.send = observe(owner.handoff.send.bind(owner.handoff));
        blocked = true;
        pending = operation === "discover" ? client.invoke(workActions.discover, { runtime_id: "codex" })
          : operation === "create" ? client.invoke(workActions.create, { action: "create", runtime_id: "codex" })
          : operation === "prepare" ? client.invoke(workActions.handoffPrepare, { session_id: source.session_id, target_runtime_id: "codex" })
          : client.invoke(workActions.handoffSend, { package_id: prepared!.handoff.package_id, target_runtime_id: "codex", content: "The original handoff" });
        const rejected = assert.rejects(pending);
        await entered.promise;
        if (refusal === "cancel") abort.abort();
        else if (refusal === "revoke") revoked = true;
        else await withCatalog({ homeDirectory: home }, catalog => catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" }));
        response.resolve(); await rejected; await finished.promise;
        assert.deepEqual(owner.registry.list().map(row => row.session_id), [source.session_id], "no late discovered/linked target facts");
        assert.equal(methods.includes("turn/start"), false, "a created external target never authorizes the next dispatch");
        if (prepared) {
          const retained = owner.registry.getHandoff(prepared.handoff.package_id);
          assert.equal(retained.state, "sending");
          assert.equal(retained.destination_session_id, null);
          revoked = false;
          if (refusal === "disable") await withCatalog({ homeDirectory: home }, catalog => catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" }));
          const retry = bindActionClient(host.actionClient(reference), () => ({ ...caller, signal: undefined }));
          await assert.rejects(retry.invoke(workActions.handoffSend, { package_id: retained.package_id, target_runtime_id: "codex", content: "The original handoff" }));
          assert.equal(methods.filter(method => method === "thread/start").length, 1, "unknown creation is not automatically repeated");
        } else assert.equal(owner.registry.latestPendingHandoff(source.session_id), null, "no late handoff draft");
      } finally {
        response.resolve(); await pending?.catch(() => undefined);
        await host.close(); await rm(home, { recursive: true, force: true });
      }
    });
  }
}

test("Work actions use original session facts, enforce project scope and revalidate authority after native work", async () => {
  const home = await mkdtemp(join(tmpdir(), "work-session-actions-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  let denied = false, externalRevoked = false;
  let nativeEffect: (() => void) | undefined;
  const requests: string[] = [];
  const host = new MolisWorkLocalHost({ homeDirectory: home, runtimeSessionTransport: {
    async request(method, params) { requests.push(`${method}:${params.threadId}`); nativeEffect?.();
      if (method === "thread/turns/list") return { data: [{ id: "turn", startedAt: 1788000000, status: "completed", itemsView: "summary", items: [{ id: "answer", type: "agentMessage", text: "native answer" }] }], nextCursor: null };
      return { thread: { id: params.threadId } };
    }, subscribe() { return () => undefined; },
  }, actionAvailability: (_caller, action) => denied && action.capability_id.startsWith("sessions.")
    ? { available: false, code: "actions.forbidden", reason: "revoked" } : { available: true } });
  const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const, permissions: WORK_ACTION_PERMISSIONS,
    validate_authority: async () => { if (externalRevoked) throw new ActionError("actions.forbidden", "grant revoked"); } };
  const client = bindActionClient(host.actionClient(reference), () => caller);
  try {
    const owner = await host.sessionResources();
    assert.equal(owner, await host.sessionResources());
    const session = owner.registry.createSession({ runtime_id: "codex", native_runtime_session_id: "native-a", project_id: reference.project_id,
      current_goal_id: "old-goal", actor_id: "owner", user_confirmed: true, metadata: { private_marker: "not-public" } });
    const foreign = owner.registry.explicitlyLinkSession({ runtime_id: "codex", native_runtime_session_id: "native-b", project_id: "other-project", actor_id: "owner", user_confirmed: true });
    owner.registry.updateAssociations({ session_id: session.session_id, current_goal_id: "current-goal", actor_id: "owner", user_confirmed: true });
    owner.registry.appendEvent({ session_id: session.session_id, source: "molis_work", source_id: "note", kind: "user_message", content: "persisted user question" });
    const listed = await client.invoke(workActions.list, {});
    assert.deepEqual(listed.sessions.map(row => row.session_id), [session.session_id]);
    assert.ok(!JSON.stringify(listed).includes("private_marker"));
    assert.ok(!("correlation_token" in listed.sessions[0]!));
    assert.ok(!("metadata" in listed.sessions[0]!));
    const directory = await client.invoke(workActions.directory, {});
    assert.equal(directory.records.length, 1); assert.equal(directory.records[0]!.event_count, 1);
    assert.equal(directory.records[0]!.session.current_goal_id, "current-goal");
    assert.ok(directory.records[0]!.goal_history.some(link => link.goal_id === "old-goal" && link.relation === "history"));
    assert.equal(directory.runtimes.find(row => row.runtime_id === "codex")!.capabilities.read, "native");
    assert.equal(directory.runtimes.find(row => row.runtime_id === "opencode")!.capabilities.read, "unsupported");
    const noPermission = bindActionClient(host.actionClient(reference), () => ({ ...caller, permissions: [] }));
    await assert.rejects(noPermission.invoke(workActions.content, { session_id: session.session_id }), { code: "actions.forbidden" });
    await assert.rejects(client.invoke(workActions.content, { session_id: foreign.session_id }), { code: "sessions.not_found" });
    assert.equal(requests.length, 0);
    const content = await client.invoke(workActions.content, { session_id: session.session_id });
    assert.deepEqual(content.events.map(event => event.content).sort(), ["native answer", "persisted user question"].sort());
    assert.equal(content.content_mode, "native");
    assert.equal((await client.invoke(workActions.resume, { session_id: session.session_id })).status, "ok");
    assert.deepEqual(requests, ["thread/read:native-a", "thread/turns/list:native-a", "thread/resume:native-a"]);
    nativeEffect = () => { denied = true; };
    await assert.rejects(client.invoke(workActions.content, { session_id: session.session_id }), { code: "actions.forbidden" });
    denied = false; nativeEffect = () => { externalRevoked = true; };
    await assert.rejects(client.invoke(workActions.content, { session_id: session.session_id }), { code: "actions.forbidden" });
    externalRevoked = false;
    nativeEffect = () => owner.registry.updateAssociations({ session_id: session.session_id, current_goal_id: "changed-goal", actor_id: "owner", user_confirmed: true });
    await assert.rejects(client.invoke(workActions.content, { session_id: session.session_id }), { code: "actions.subject_changed" });
    nativeEffect = () => owner.registry.updateAssociations({ session_id: session.session_id, project_id: "other-project", actor_id: "owner", user_confirmed: true });
    await assert.rejects(client.invoke(workActions.content, { session_id: session.session_id }), { code: "sessions.not_found" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Session resources are shared, configure after project startup, reject cross-Home replacement, and persist across restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "work-session-lifetime-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const host = new MolisWorkLocalHost();
  const caller = { actor_id: "owner", project_id: reference.project_id, audience: "user" as const, permissions: WORK_ACTION_PERMISSIONS };
  try {
    const actions = bindActionClient(host.actionClient(reference), () => caller);
    await assert.rejects(actions.invoke(workActions.list, {}), { code: "actions.service_unavailable" });
    host.configureSessionRuntime(home);
    const [first, second] = await Promise.all([host.sessionResources(), host.sessionResources()]);
    assert.equal(first, second);
    const session = first.registry.createSession({ runtime_id: "opencode", project_id: reference.project_id, actor_id: "owner", user_confirmed: true });
    assert.equal((await actions.invoke(workActions.list, {})).sessions[0]!.session_id, session.session_id);
    assert.throws(() => host.configureSessionRuntime(join(home, "foreign")), { code: "actions.scope_mismatch" });
    await host.close(); await assert.rejects(host.sessionResources(), { code: "actions.service_unavailable" });
    const restarted = new SessionRuntimeService({ homeDirectory: home });
    try { assert.equal((await restarted.resources()).registry.get(session.session_id).project_id, reference.project_id); }
    finally { await restarted.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
