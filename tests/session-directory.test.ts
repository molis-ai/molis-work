import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { RegistryFallbackSessionAdapter } from "@molis-ai/molis-work-plugin-work";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { CodexRuntimeSessionAdapter, RuntimeHostRouter } from "@molis-ai/molis-work-service-runtime-host";
import { SessionDirectoryService } from "@molis-ai/molis-work-plugin-work";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import type { RuntimeSessionTransport } from "@molis-ai/molis-work-contracts/services/runtime-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

const TOKEN = "molis-work-session-directory-token-0123456789";

test("Session directory discovers metadata without content or silent associations and persists after restart", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-directory-"));
  const home = path.join(directory, ".molis-work");
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const transport: RuntimeSessionTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "thread/list") {
        return {
          data: [{
            id: "thread-discovered-directory",
            preview: "发现的 Session",
            cwd: "/tmp/runtime-cwd",
            createdAt: 1_777_000_000,
            updatedAt: 1_777_000_100,
            status: "active",
          }],
          nextCursor: null,
        };
      }
      if (method === "thread/start") return { thread: { id: "thread-created-directory" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };

  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    router.register(new CodexRuntimeSessionAdapter(transport));
    const service = new SessionDirectoryService(registry, router);

    const discovery = await service.discover("codex");
    assert.equal(discovery.status, "ok");
    assert.equal(discovery.records.length, 1);
    assert.equal(discovery.records[0]?.project_id, null);
    assert.equal(discovery.records[0]?.current_goal_id, null);
    assert.equal(discovery.records[0]?.workspace_path, null);
    assert.equal(discovery.records[0]?.metadata.runtime_cwd, "/tmp/runtime-cwd");
    assert.equal(discovery.records[0]?.metadata.native_status, "active");
    assert.deepEqual(calls.map((item) => item.method), ["thread/list"]);
    assert.equal(registry.eventCount(discovery.records[0]!.session_id), 0);

    const created = await service.create({
      runtime_id: "codex",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      current_goal_id: "goal-a",
      workspace_path: "/tmp/project-a",
      title: "新 Codex Session",
    });
    assert.equal(created.native_runtime_session_id, "thread-created-directory");
    assert.equal(created.project_id, "project-a");
    assert.deepEqual(calls.map((item) => item.method), ["thread/list", "thread/start"]);

    const linkedDiscovery = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-discovered-directory",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    registry.setStatus({
      session_id: linkedDiscovery.session_id,
      actor_id: "user",
      user_confirmed: true,
      status: "closed",
    });
    const rediscovered = await service.discover("codex");
    assert.equal(rediscovered.records[0]?.status, "closed");
    assert.equal(rediscovered.records[0]?.metadata.native_status, "active");

    const fallbackDiscovery = await service.discover("claude-code");
    assert.equal(fallbackDiscovery.status, "unsupported");
    assert.equal(fallbackDiscovery.records.length, 0);
    const fallback = await service.create({
      runtime_id: "claude-code",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      title: "Molis Work 托管 Session",
    });
    assert.equal(fallback.native_runtime_session_id, null);
    assert.equal(fallback.provenance, "molis_work_created");
  } finally {
    registry.close();
  }

  const reopened = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    assert.equal(reopened.list().length, 3);
    assert.equal(reopened.list({ project_id: "project-a" }).length, 3);
    assert.equal(reopened.list().find((item) => item.title === "发现的 Session")?.status, "closed");
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("project Session directory APIs discover, link, create, transfer, archive and restore real records", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-directory-web-"));
  const home = path.join(directory, ".molis-work");
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "Project A", actor_id: "user" });
  const second = await catalog.createProject({ display_name: "Project B", actor_id: "user" });
  catalog.addProjectPlugin({ project_id: first.project_id, plugin_id: "sessions", actor_id: "user" });
  catalog.close();

  const methods: string[] = [];
  const transport: RuntimeSessionTransport = {
    async request(method) {
      methods.push(method);
      if (method === "thread/list") {
        return { data: [{ id: "thread-web-discovery", title: "Discovered Web Session", cwd: directory }] };
      }
      if (method === "thread/start") return { thread: { id: "thread-web-created" } };
      if (method === "thread/read") return { thread: { turns: [] } };
      if (method === "thread/resume") return { thread: { id: "thread-web-discovery" } };
      throw new Error(`unexpected ${method}`);
    },
    subscribe() { return () => undefined; },
  };
  const server = createMolisWorkWebServer({
    homeDirectory: home,
    controlToken: TOKEN,
    runtimeSessionTransport: transport,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const prefixA = `/projects/${encodeURIComponent(first.project_id)}`;
    const prefixB = `/projects/${encodeURIComponent(second.project_id)}`;
    let requestNumber = 0;
    const mutation = (pathname: string, method: string, body: Record<string, unknown>) => fetch(`${origin}${pathname}`, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        "x-molis-work-control-token": TOKEN,
        "x-molis-work-idempotency-key": `session-directory-web-${++requestNumber}`,
      },
      body: JSON.stringify(body),
    });

    const globalRoute = await fetch(`${origin}/sessions`, { redirect: "manual" });
    assert.equal(globalRoute.status, 302);
    assert.equal(globalRoute.headers.get("location"), "/");

    const discover = await mutation(`${prefixA}/api/sessions/discover`, "POST", { runtime_id: "codex" });
    assert.equal(discover.status, 200, await discover.clone().text());
    const discoverPayload = await discover.json() as { records: Array<{ native_runtime_session_id: string; project_id: string | null }> };
    assert.deepEqual(discoverPayload.records.map((item) => [item.native_runtime_session_id, item.project_id]), [
      ["thread-web-discovery", null],
    ]);
    assert.deepEqual(methods, ["thread/list"]);

    const linked = await mutation(`${prefixA}/api/sessions`, "POST", {
      action: "link",
      runtime_id: "codex",
      native_runtime_session_id: "thread-web-discovery",
      title: "Linked Web Session",
      workspace_path: directory,
      user_confirmed: true,
    });
    assert.equal(linked.status, 201, await linked.clone().text());
    const linkedPayload = await linked.json() as { session: { session_id: string } };
    const sessionId = linkedPayload.session.session_id;

    const created = await mutation(`${prefixA}/api/sessions`, "POST", {
      action: "create",
      runtime_id: "codex",
      title: "Created Web Session",
      workspace_path: directory,
      user_confirmed: true,
    });
    assert.equal(created.status, 201, await created.clone().text());
    assert.deepEqual(methods, ["thread/list", "thread/start"]);

    const page = await (await fetch(`${origin}${prefixA}/`)).text();
    assert.match(page, /Linked Web Session/);
    assert.match(page, /data-open-session-add/);
    assert.match(page, /data-open-session-relations/);
    assert.match(page, /data-session-archive="true"/);

    const archived = await mutation(`${prefixA}/api/sessions/${encodeURIComponent(sessionId)}/archive`, "POST", {
      archived: true,
      user_confirmed: true,
    });
    assert.equal(archived.status, 200, await archived.clone().text());
    let listed = await (await fetch(`${origin}${prefixA}/api/sessions`)).json() as { sessions: Array<{ session_id: string; status: string }> };
    assert.equal(listed.sessions.find((item) => item.session_id === sessionId)?.status, "closed");

    const restored = await mutation(`${prefixA}/api/sessions/${encodeURIComponent(sessionId)}/archive`, "POST", {
      archived: false,
      user_confirmed: true,
    });
    assert.equal(restored.status, 200, await restored.clone().text());

    const transferred = await mutation(`${prefixA}/api/sessions/${encodeURIComponent(sessionId)}/associations`, "PATCH", {
      project_id: second.project_id,
      current_goal_id: null,
      workspace_path: directory,
      user_confirmed: true,
    });
    assert.equal(transferred.status, 200, await transferred.clone().text());
    listed = await (await fetch(`${origin}${prefixA}/api/sessions`)).json() as { sessions: Array<{ session_id: string; status: string }> };
    assert.equal(listed.sessions.some((item) => item.session_id === sessionId), false);
    const disabled = await fetch(`${origin}${prefixB}/api/sessions`);
    assert.equal(disabled.status, 404);
    assert.equal((await disabled.json() as { code: string }).code, "actions.plugin_disabled");
    const enabledCatalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try { enabledCatalog.addProjectPlugin({ project_id: second.project_id, plugin_id: "sessions", actor_id: "user" }); }
    finally { enabledCatalog.close(); }
    const secondListed = await (await fetch(`${origin}${prefixB}/api/sessions`)).json() as { sessions: Array<{ session_id: string }> };
    assert.equal(secondListed.sessions.some((item) => item.session_id === sessionId), true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
