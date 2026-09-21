import assert from "node:assert/strict";
import test from "node:test";

import { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import { createHostScheduledTaskRunner } from "@molis-ai/molis-work-app-local-host";

test("没有 Runtime 时到点执行说明原因", async () => {
  const runner = createHostScheduledTaskRunner({
    agentHost: new AgentHost(),
    boardId: "board-1",
    projectId: "project-1",
    workspaceFor: async () => null,
  });
  await assert.rejects(
    () => runner.run({ title: "汇总", instructions: "看一眼", history: [] }),
    /还没有可用的 Agent Runtime/,
  );
});
