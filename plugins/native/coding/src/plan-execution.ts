import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginCapabilityClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingFixedPlan } from "./plans.js";
import type { CodingSessionRecord } from "./store.js";

const errors = defineErrorCodes("coding", { plan_origin_unavailable: "unavailable", plan_workspace_changed: "conflict" });

/** Portable plan provenance is not execution authority. Only this device's original planning Run binds its directory. */
export async function requireLocalPlanningRun(api: PluginCapabilityClient, record: CodingSessionRecord, plan: CodingFixedPlan, path: string): Promise<void> {
  const unavailable = () => errors.plan_origin_unavailable("此设备没有原规划执行，请在已授权工作区重新规划");
  if (!record.runtime_session_id) throw unavailable();
  const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
  const snapshot = await api.invoke(agent.readSession, [session]);
  const origin = snapshot.runs.find(ref => ref.run_id === plan.source.run_id);
  if (!origin) throw unavailable();
  const planning = await api.invoke(agent.readRun, [session, origin]);
  if (planning.ref.session_id !== session.session_id || planning.ref.run_id !== origin.run_id
    || planning.phase !== "completed" || planning.frozen.role_id !== "planner") throw unavailable();
  if (!planning.frozen.directory?.realpath_verified || path !== planning.frozen.directory.canonical_path)
    throw errors.plan_workspace_changed("计划属于原工作区，请选择原工作区或重新规划，不能在另一目录执行");
}
