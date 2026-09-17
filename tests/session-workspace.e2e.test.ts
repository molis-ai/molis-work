import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-session-workspace-e2e-token-0123456789";

function addAcceptedGoal(databasePath: string, boardId: string, goalId: string, title: string): void {
  const store = new LocalProjectDatabase(databasePath);
  try {
    new GoalProjectApplication(store).goals.commands.createGoal(
      boardId,
      {
        goal_id: goalId,
        title,
        outcome: "Session 与工作目录主链可在真实项目范围内继续",
        why: "端到端验收需要一条可引用的当前 Goal",
        business_logic: "用户确认关系后，内容、恢复和 Handoff 都从同一条 Session 继续。",
        in_scope: ["Session", "工作目录", "Handoff"],
        out_of_scope: ["公开发布"],
        constraints: ["任何关联和发送都必须明确确认"],
        required_inputs: ["当前项目"],
        promised_outputs: ["可恢复的 Session 主链"],
        definition_state: "accepted",
        decomposition_state: "closed_leaf",
        acceptance_criteria: [{
          criterion_id: `${goalId}-criterion`,
          statement: "主链可恢复",
          decision_method: "test",
          pass_condition: "内容、Handoff 与关系在重启后仍可查询",
          required_evidence: ["test"],
        }],
      },
      { actor_id: "e2e-user", idempotency_key: `${goalId}-create` },
    );
  } finally {
    store.close();
  }
}

async function listen(server: ReturnType<typeof createMolisWorkWebServer>): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createMolisWorkWebServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function mutator(origin: string) {
  let requestNumber = 0;
  return (pathname: string, method: string, body: Record<string, unknown>) => fetch(`${origin}${pathname}`, {
    method,
    headers: {
      origin,
      "content-type": "application/json",
      "x-molis-work-control-token": TOKEN,
      "x-molis-work-idempotency-key": `session-workspace-e2e-${++requestNumber}`,
    },
    body: JSON.stringify(body),
  });
}

test("Codex native journey stays project-scoped from discovery through Handoff and restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-native-e2e-"));
  const home = path.join(directory, ".molis-work");
  const workspace = path.join(directory, "native-workspace");
  await mkdir(workspace, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Native Session Project", actor_id: "e2e-user" });
  const otherProject = await catalog.createProject({ display_name: "Other Project", actor_id: "e2e-user" });
  const workspaceRecord = catalog.addWorkspaceProject({
    canonical_path: workspace,
    project_id: project.project_id,
    actor_id: "e2e-user",
    user_confirmed: true,
  });
  catalog.close();
  const goalId = "goal-native-e2e";
  addAcceptedGoal(project.database_path, project.board_id, goalId, "完成原生 Session 主链");

  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/list") {
        return { data: [{ id: "shared-native-id", title: "外部手动创建的 Codex Session", cwd: workspace }] };
      }
      if (method === "thread/read") {
        return {
          thread: {
            turns: [{
              id: "turn-native-e2e",
              startedAt: 1_777_000_000,
              status: "completed",
              items: [{ id: "agent-native-e2e", type: "agentMessage", text: "NATIVE-E2E-CONTENT" }],
            }],
          },
        };
      }
      if (method === "thread/resume") return { thread: { id: String(params.threadId) } };
      if (method === "thread/start") return { thread: { id: "native-handoff-destination" } };
      if (method === "turn/start") return { turn: { id: "native-handoff-turn" }, threadId: params.threadId };
      throw new Error(`unexpected Runtime method ${method}`);
    },
    subscribe() { return () => undefined; },
  };

  let server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN, runtimeSessionTransport: transport });
  let origin = await listen(server);
  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const otherPrefix = `/projects/${encodeURIComponent(otherProject.project_id)}`;
  let mutate = mutator(origin);
  try {
    const projectPicker = await (await fetch(`${origin}/`)).text();
    assert.match(projectPicker, /工作目录在新建或关联 Session 时选择/);
    const globalSessions = await fetch(`${origin}/sessions`, { redirect: "manual" });
    assert.equal(globalSessions.headers.get("location"), "/");
    const projectSessions = await fetch(`${origin}${prefix}/sessions`, { redirect: "manual" });
    assert.equal(projectSessions.headers.get("location"), `${prefix}/#sessions`);
    const projectWorkspaces = await fetch(`${origin}${prefix}/workspaces`, { redirect: "manual" });
    assert.equal(projectWorkspaces.headers.get("location"), `${prefix}/#sessions`);

    const discoveredResponse = await mutate(`${prefix}/api/sessions/discover`, "POST", { runtime_id: "codex" });
    assert.equal(discoveredResponse.status, 200, await discoveredResponse.clone().text());
    const discovered = await discoveredResponse.json() as {
      records: Array<{ native_runtime_session_id: string; project_id: string | null; workspace_path: string | null }>;
    };
    assert.deepEqual(discovered.records.map((record) => [record.native_runtime_session_id, record.project_id, record.workspace_path]), [
      ["shared-native-id", null, null],
    ]);

    const deniedLink = await mutate(`${prefix}/api/sessions`, "POST", {
      action: "link",
      runtime_id: "codex",
      native_runtime_session_id: "shared-native-id",
      current_goal_id: goalId,
      workspace_path: workspace,
    });
    assert.equal(deniedLink.status, 400);
    const mismatchedWorkspace = await mutate(`${prefix}/api/sessions`, "POST", {
      action: "create",
      runtime_id: "opencode",
      workspace_id: workspaceRecord.workspace_id,
      workspace_path: directory,
      user_confirmed: true,
    });
    assert.equal(mismatchedWorkspace.status, 409);
    const launchedResponse = await mutate(`${prefix}/api/sessions`, "POST", {
      action: "create",
      runtime_id: "opencode",
      current_goal_id: goalId,
      workspace_id: workspaceRecord.workspace_id,
      workspace_path: workspaceRecord.canonical_path,
      title: "从 Sessions 启动",
      user_confirmed: true,
    });
    assert.equal(launchedResponse.status, 201, await launchedResponse.clone().text());
    const launched = await launchedResponse.json() as { session: { workspace_id: string | null; workspace_path: string | null } };
    assert.equal(launched.session.workspace_id, workspaceRecord.workspace_id);
    assert.equal(launched.session.workspace_path, workspaceRecord.canonical_path);
    const linkedResponse = await mutate(`${prefix}/api/sessions`, "POST", {
      action: "link",
      runtime_id: "codex",
      native_runtime_session_id: "shared-native-id",
      current_goal_id: goalId,
      workspace_path: workspace,
      user_confirmed: true,
    });
    assert.equal(linkedResponse.status, 201, await linkedResponse.clone().text());
    const linked = await linkedResponse.json() as { session: { session_id: string } };

    const page = await (await fetch(`${origin}${prefix}/`)).text();
    assert.match(page, new RegExp(linked.session.session_id));
    assert.match(page, /data-session-resume-mode="native"/);
    assert.match(page, /OpenCode/);
    assert.match(page, /Pi Agent/);
    assert.doesNotMatch(page, /NATIVE-E2E-CONTENT/);
    assert.equal((page.match(/data-work-surface="sessions"/g) ?? []).length, 1);
    assert.equal((page.match(/data-work-surface="workspaces"/g) ?? []).length, 0);
    assert.doesNotMatch(page, /data-directory-open="workspaces"|data-directory-panel="workspaces"/);
    assert.match(page, /data-session-workspace-option/);

    const contentResponse = await fetch(`${origin}${prefix}/api/sessions/${encodeURIComponent(linked.session.session_id)}/content`);
    const content = await contentResponse.json() as { content_mode: string; events: Array<{ content: string }> };
    assert.equal(content.content_mode, "native");
    assert.match(content.events.map((event) => event.content).join("\n"), /NATIVE-E2E-CONTENT/);
    const crossProject = await fetch(`${origin}${otherPrefix}/api/sessions/${encodeURIComponent(linked.session.session_id)}/content`);
    assert.equal(crossProject.status, 404);

    const resumeResponse = await mutate(
      `${prefix}/api/sessions/${encodeURIComponent(linked.session.session_id)}/resume`,
      "POST",
      {},
    );
    assert.equal(resumeResponse.status, 200, await resumeResponse.clone().text());

    const prepareResponse = await mutate(
      `${prefix}/api/sessions/${encodeURIComponent(linked.session.session_id)}/handoffs`,
      "POST",
      { target_runtime_id: "codex", target_workspace_id: workspaceRecord.workspace_id, target_workspace_path: workspace },
    );
    assert.equal(prepareResponse.status, 201, await prepareResponse.clone().text());
    const prepared = await prepareResponse.json() as { handoff: { package_id: string; content: string } };
    assert.match(prepared.handoff.content, /完成原生 Session 主链/);
    const deniedSend = await mutate(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      { target_runtime_id: "codex", target_workspace_path: workspace, content: prepared.handoff.content, user_confirmed: false },
    );
    assert.equal(deniedSend.status, 400);
    const sentResponse = await mutate(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      { target_runtime_id: "codex", target_workspace_path: workspace, content: prepared.handoff.content, user_confirmed: true },
    );
    assert.equal(sentResponse.status, 201, await sentResponse.clone().text());
    const sent = await sentResponse.json() as {
      handoff: { state: string; delivery_mode: string };
      destination_session: { session_id: string; native_runtime_session_id: string };
    };
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.handoff.delivery_mode, "native");
    assert.notEqual(sent.destination_session.session_id, linked.session.session_id);
    assert.equal(sent.destination_session.native_runtime_session_id, "native-handoff-destination");

    const archived = await mutate(`${prefix}/api/sessions/${encodeURIComponent(linked.session.session_id)}/archive`, "POST", {
      archived: true,
      user_confirmed: true,
    });
    assert.equal(archived.status, 200);
    const restored = await mutate(`${prefix}/api/sessions/${encodeURIComponent(linked.session.session_id)}/archive`, "POST", {
      archived: false,
      user_confirmed: true,
    });
    assert.equal(restored.status, 200);

    await close(server);
    server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN, runtimeSessionTransport: transport });
    origin = await listen(server);
    mutate = mutator(origin);
    const afterRestart = await (await fetch(`${origin}${prefix}/api/sessions`)).json() as {
      sessions: Array<{ session_id: string; native_runtime_session_id: string | null; status: string }>;
    };
    assert.equal(afterRestart.sessions.find((session) => session.session_id === linked.session.session_id)?.status, "active");
    assert.equal(afterRestart.sessions.find((session) => session.session_id === sent.destination_session.session_id)?.native_runtime_session_id, "native-handoff-destination");
    assert.ok(calls.some((call) => call.method === "thread/list"));
    assert.ok(calls.some((call) => call.method === "thread/read" && call.params.threadId === "shared-native-id"));
    assert.ok(calls.some((call) => call.method === "thread/resume" && call.params.threadId === "shared-native-id"));
    assert.ok(calls.some((call) => call.method === "turn/start" && call.params.threadId === "native-handoff-destination"));
  } finally {
    await close(server).catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});

test("fallback journey preserves TUI content, honest capability limits, workspace repair and ID isolation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-fallback-e2e-"));
  const home = path.join(directory, ".molis-work");
  const firstPath = path.join(directory, "workspace-before");
  const repairedPath = path.join(directory, "workspace-after");
  await mkdir(firstPath, { recursive: true });
  await mkdir(repairedPath, { recursive: true });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Fallback Session Project", actor_id: "e2e-user" });
  const otherProject = await catalog.createProject({ display_name: "Fallback Other Project", actor_id: "e2e-user" });
  const workspace = catalog.addWorkspaceProject({
    canonical_path: firstPath,
    project_id: project.project_id,
    actor_id: "e2e-user",
    user_confirmed: true,
  });
  catalog.close();
  const goalId = "goal-fallback-e2e";
  addAcceptedGoal(project.database_path, project.board_id, goalId, "完成 fallback Session 主链");

  const server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
  const origin = await listen(server);
  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const otherPrefix = `/projects/${encodeURIComponent(otherProject.project_id)}`;
  const mutate = mutator(origin);
  try {
    const denied = await mutate(`${prefix}/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/sessions`, "POST", {
      runtime_id: "claude-code",
      current_goal_id: goalId,
    });
    assert.equal(denied.status, 400);
    const createdResponse = await mutate(
      `${prefix}/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/sessions`,
      "POST",
      { runtime_id: "claude-code", current_goal_id: goalId, title: "Fallback Source", user_confirmed: true },
    );
    assert.equal(createdResponse.status, 201, await createdResponse.clone().text());
    const created = await createdResponse.json() as {
      session: { session_id: string; native_runtime_session_id: string | null; workspace_path: string };
    };
    assert.equal(created.session.native_runtime_session_id, null);
    assert.equal(created.session.workspace_path, workspace.canonical_path);

    const marker = "FALLBACK-TUI-PRIVATE-MARKER";
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      registry.appendEvent({
        session_id: created.session.session_id,
        source: "molis_work_tui",
        kind: "terminal_output",
        source_id: "fallback-e2e-tui",
        content: marker,
      });
      const codexSameNative = registry.explicitlyLinkSession({
        runtime_id: "codex",
        native_runtime_session_id: "same-native-value",
        actor_id: "e2e-user",
        user_confirmed: true,
        project_id: project.project_id,
        current_goal_id: goalId,
        workspace_id: workspace.workspace_id,
        workspace_path: firstPath,
      });
      const claudeSameNative = registry.explicitlyLinkSession({
        runtime_id: "claude-code",
        native_runtime_session_id: "same-native-value",
        actor_id: "e2e-user",
        user_confirmed: true,
        project_id: project.project_id,
        current_goal_id: goalId,
        workspace_id: workspace.workspace_id,
        workspace_path: firstPath,
      });
      assert.notEqual(codexSameNative.session_id, claudeSameNative.session_id);
      assert.notEqual(codexSameNative.session_id, created.session.session_id);
    } finally {
      registry.close();
    }

    const page = await (await fetch(`${origin}${prefix}/`)).text();
    assert.match(page, /Fallback Source/);
    assert.match(page, /data-session-resume-mode="unsupported"/);
    assert.doesNotMatch(page, new RegExp(marker));
    const listing = await (await fetch(`${origin}${prefix}/api/sessions`)).text();
    assert.doesNotMatch(listing, new RegExp(marker));

    const contentResponse = await fetch(`${origin}${prefix}/api/sessions/${encodeURIComponent(created.session.session_id)}/content`);
    const content = await contentResponse.json() as { content_mode: string; events: Array<{ content: string; source: string }> };
    assert.equal(content.content_mode, "fallback");
    assert.deepEqual(content.events.map((event) => event.source), ["molis_work_tui"]);
    assert.match(content.events[0]?.content ?? "", new RegExp(marker));
    const crossProject = await fetch(`${origin}${otherPrefix}/api/sessions/${encodeURIComponent(created.session.session_id)}/content`);
    assert.equal(crossProject.status, 404);

    const resumeResponse = await mutate(
      `${prefix}/api/sessions/${encodeURIComponent(created.session.session_id)}/resume`,
      "POST",
      {},
    );
    assert.equal(resumeResponse.status, 409);
    const resume = await resumeResponse.json() as { status: string; next_action: string };
    assert.equal(resume.status, "unsupported");
    assert.equal(resume.next_action, "create_handoff");

    const prepareResponse = await mutate(
      `${prefix}/api/sessions/${encodeURIComponent(created.session.session_id)}/handoffs`,
      "POST",
      { target_runtime_id: "grok-build", target_workspace_id: workspace.workspace_id, target_workspace_path: firstPath },
    );
    assert.equal(prepareResponse.status, 201, await prepareResponse.clone().text());
    const prepared = await prepareResponse.json() as { handoff: { package_id: string; content: string } };
    const sentResponse = await mutate(
      `${prefix}/api/session-handoffs/${encodeURIComponent(prepared.handoff.package_id)}/send`,
      "POST",
      { target_runtime_id: "grok-build", target_workspace_path: firstPath, content: prepared.handoff.content, user_confirmed: true },
    );
    assert.equal(sentResponse.status, 201, await sentResponse.clone().text());
    const sent = await sentResponse.json() as {
      handoff: { delivery_mode: string; state: string };
      destination_session: { session_id: string; native_runtime_session_id: string | null; workspace_id: string | null };
    };
    assert.equal(sent.handoff.delivery_mode, "molis_work_fallback");
    assert.equal(sent.handoff.state, "sent");
    assert.equal(sent.destination_session.native_runtime_session_id, null);
    assert.equal(sent.destination_session.workspace_id, workspace.workspace_id);

    const repairResponse = await mutate(
      `${prefix}/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/path`,
      "PATCH",
      { workspace_path: repairedPath, user_confirmed: true },
    );
    assert.equal(repairResponse.status, 200, await repairResponse.clone().text());
    const repaired = await repairResponse.json() as {
      workspace: { workspace_id: string; canonical_path: string };
      updated_session_count: number;
    };
    assert.ok(repaired.updated_session_count >= 4);
    await access(firstPath);
    await access(repairedPath);

    const reopened = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      assert.equal(reopened.get(created.session.session_id).workspace_path, repaired.workspace.canonical_path);
      assert.equal(reopened.get(sent.destination_session.session_id).workspace_path, repaired.workspace.canonical_path);
      assert.equal(reopened.events(created.session.session_id)[0]?.content, marker);
      assert.equal(new Set(reopened.list({ workspace_id: repaired.workspace.workspace_id }).map((item) => item.session_id)).size, repaired.updated_session_count);
    } finally {
      reopened.close();
    }
  } finally {
    await close(server);
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
