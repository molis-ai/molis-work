import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";
import { SessionTuiRecorder } from "@molis-ai/molis-work-plugin-work";
import { attachMolisWorkPtySocket } from "@molis-ai/molis-work-app-local-host";

test("Goal TUI output survives Registry restart and remains linked to Session, project and Goal", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-tui-"));
  const home = path.join(directory, ".molis-work");
  let sessionId = "";
  const first = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const session = first.createSession({
      runtime_id: "codex",
      actor_id: "desktop-user",
      user_confirmed: true,
      surface_id: "panel-tui-a",
      project_id: "project-a",
      current_goal_id: "goal-a",
      workspace_path: "/tmp/project-a",
    });
    sessionId = session.session_id;
    const recorder = new SessionTuiRecorder(first);
    recorder.recordOutput("panel-tui-a", sessionId, "\u001b[32mRuntime answer\u001b[0m\r\n");
    recorder.recordExit("panel-tui-a", sessionId, { exitCode: 0, signal: 0 });
    recorder.close();
  } finally {
    first.close();
  }

  const reopened = await openWorkSessionRegistry({ homeDirectory: home });
  try {
    const session = reopened.get(sessionId);
    assert.equal(session.project_id, "project-a");
    assert.equal(session.current_goal_id, "goal-a");
    assert.equal(session.workspace_path, "/tmp/project-a");
    const events = reopened.events(sessionId);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.content, "Runtime answer\r\n");
    assert.doesNotMatch(events[0]?.content ?? "", /\u001b/);
    assert.match(events[1]?.content ?? "", /退出码 0/);
  } finally {
    reopened.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("PTY socket carries session_id into the persistent TUI recorder", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-tui-socket-"));
  const home = path.join(directory, ".molis-work");
  const registry = await openWorkSessionRegistry({ homeDirectory: home });
  const session = registry.createSession({
    runtime_id: "generic",
    actor_id: "desktop-user",
    user_confirmed: true,
    surface_id: "panel-socket-a",
    project_id: "project-a",
    current_goal_id: "goal-a",
    workspace_path: directory,
  });
  const recorder = new SessionTuiRecorder(registry);
  const server = http.createServer((_request, response) => response.end("ok"));
  attachMolisWorkPtySocket(server, "session-tui-socket-token", {
    onData: (panelId, sessionId, data) => recorder.recordOutput(panelId, sessionId, data),
    onExit: (panelId, sessionId, exit) => recorder.recordExit(panelId, sessionId, exit),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/pty`);
  const messages: Array<Record<string, unknown>> = [];
  const waitFor = (type: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`PTY ${type} timeout`)), 8_000);
    const inspect = (value: Record<string, unknown>) => {
      if (value.type !== type) return;
      clearTimeout(timer);
      socket.off("message", listener);
      resolve(value);
    };
    const listener = (raw: WebSocket.RawData) => {
      const value = JSON.parse(raw.toString()) as Record<string, unknown>;
      messages.push(value);
      inspect(value);
    };
    socket.on("message", listener);
    messages.forEach(inspect);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    const ready = waitFor("ready");
    socket.send(JSON.stringify({ type: "auth", token: "session-tui-socket-token" }));
    await ready;
    const exited = waitFor("exit");
    socket.send(JSON.stringify({
      type: "spawn",
      panelId: "panel-socket-a",
      sessionId: session.session_id,
      command: "/bin/sh",
      args: ["-c", "printf SOCKET-TUI-MARKER"],
      cwd: directory,
    }));
    await exited;
    recorder.flush();
    const events = registry.events(session.session_id);
    assert.match(events.map((event) => event.content).join("\n"), /SOCKET-TUI-MARKER/);
    assert.ok(events.some((event) => event.kind === "status"));
  } finally {
    socket.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    recorder.close();
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
