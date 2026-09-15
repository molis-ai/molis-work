import { RegistryFallbackSessionAdapter } from "@molis-ai/molis-work-plugin-work";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CodexRuntimeSessionAdapter, RuntimeHostRouter } from "@molis-ai/molis-work-service-runtime-host";
import { SessionContentService } from "@molis-ai/molis-work-plugin-work";
import { MolisWorkSessionRegistry } from "@molis-ai/molis-work-module-private-work-context";

test("resume loads the same native Session through its owning Runtime only", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-resume-"));
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    const session = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-resume-a",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
      current_goal_id: "goal-a",
    });
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    router.register(new CodexRuntimeSessionAdapter({
      async request(method, params) {
        calls.push({ method, params });
        return { thread: { id: params.threadId } };
      },
      subscribe() { return () => undefined; },
    }));
    const resumed = await new SessionContentService(registry, router).resume(session.session_id);
    assert.equal(resumed.status, "ok");
    assert.deepEqual(calls, [{ method: "thread/resume", params: { threadId: "thread-resume-a", excludeTurns: true } }]);
    if (resumed.status === "ok") {
      assert.equal(resumed.runtime_id, "codex");
      assert.equal(resumed.native_runtime_session_id, "thread-resume-a");
    }
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Runtime without native resume returns an explicit Handoff next action", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-resume-fallback-"));
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    const session = registry.explicitlyLinkSession({
      runtime_id: "future-runtime",
      native_runtime_session_id: "future-session-a",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    const result = await new SessionContentService(registry, new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry))).resume(session.session_id);
    assert.equal(result.status, "unsupported");
    if (result.status !== "ok") assert.equal(result.next_action, "create_handoff");
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("an already-open Codex Session reports its active writer instead of a generic retry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-session-resume-active-"));
  const registry = await openWorkSessionRegistry({ homeDirectory: path.join(directory, ".molis-work") });
  try {
    const session = registry.explicitlyLinkSession({
      runtime_id: "codex",
      native_runtime_session_id: "thread-active-a",
      actor_id: "user",
      user_confirmed: true,
      project_id: "project-a",
    });
    const router = new RuntimeHostRouter((runtimeId) => new RegistryFallbackSessionAdapter(runtimeId, registry));
    router.register(new CodexRuntimeSessionAdapter({
      async request() { throw new Error("Codex Session 已经在另一个 Runtime 实例中运行。"); },
      subscribe() { return () => undefined; },
    }));
    const result = await new SessionContentService(registry, router).resume(session.session_id);
    assert.equal(result.status, "failed");
    if (result.status !== "ok") {
      assert.equal(result.message, "这条 Session 已经在另一个 Codex 窗口运行，无需重复加载。");
      assert.equal(result.next_action, "retry");
    }
  } finally {
    registry.close();
    await rm(directory, { recursive: true, force: true });
  }
});
import { openWorkSessionRegistry } from "@molis-ai/molis-work-app-local-host";
