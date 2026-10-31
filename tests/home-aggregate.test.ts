import assert from "node:assert/strict";
import test from "node:test";
import { collectHomeAggregate } from "@molis-ai/molis-work-app-local-host";
import type { HomeAggregatePorts } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

// T-319 (R-63, RAC-2437): a source that is not in the project's plugin manifest is not installed here and stays out of the Home;
// one that IS listed but unavailable (turned off, or refused by policy) is shown as an issue rather than silently skipped.
const TYPE = "io.molis.work.example.homeagg.v1";
const PLUGIN = "io.example.homeagg.plugin";
const reference = (projectId: string): LocalHostProjectReference => ({ project_id: projectId, storage_key: `/tmp/${projectId}` });
const context = (projectId: string): ActionCallContext => ({ actor_id: "owner", project_id: projectId, audience: "user", permissions: ["home:read", "homeagg:read"] });
const unavailableView = (projectId: string): ActionView => ({
  capability_id: "homeagg.running.read", version: 1, operation: "query",
  provider: { provider_id: "example.plugin", title: "Example", kind: "plugin", plugin_id: PLUGIN, project_id: projectId },
  availability: { available: false, code: "actions.plugin_disabled", reason: "策略拒绝了这个项目的读取" },
  action: { title: "运行中的工作", description: "首页聚合的只读查询", kind: "query", scope: "project", audiences: ["user"], permissions: ["homeagg:read"], subject_kinds: [],
    input_schema: { type: "object" }, output_schema: { type: "object" }, output_type: TYPE, home_aggregate: true },
});

test("RAC-2437 the Home reports a source listed in the project's plugin manifest as an issue, and skips one the manifest does not list", async () => {
  const a = reference("project-a"), b = reference("project-b");
  const ports: HomeAggregatePorts = {
    openProjects: () => [a, b],
    whileOpen: async (_reference, work) => work(),
    client: projectReference => ({ discover: async () => [unavailableView(projectReference.project_id)],
      invoke: async () => assert.fail("an unavailable source is never invoked") }),
    context: async projectReference => context(projectReference.project_id),
    // The manifest fact: A does not list the plugin, B does. Same provider, same refusal in both projects.
    projectPlugins: async projectReference => projectReference.project_id === b.project_id ? [PLUGIN] : [],
  };
  const result = await collectHomeAggregate(ports, TYPE, {});
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.issues.map(issue => ({ project_id: issue.project_id, code: issue.code })), [{ project_id: b.project_id, code: "actions.plugin_disabled" }],
    "only the project that lists the plugin shows that its source is unavailable");
});
