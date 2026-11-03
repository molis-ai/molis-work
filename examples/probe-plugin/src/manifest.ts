import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PROBE_ACTIONS, PROBE_KEEP_JOB, PROBE_READ, PROBE_WRITE } from "./actions.js";
import { probeMethods } from "./methods.js";

export const PROBE_PLUGIN_ID = "io.molis.work.probe";
/** The plugin's key inside a project. */
export const PROBE_PROJECT_PLUGIN_ID = "probe";
/** Its tests raise this to walk an upgrade; the Host follows the build's version for a built-in. */
export const PROBE_VERSION = "1.0.0";

/**
 * The probe's whole surface is declarations the platform reads (W4-01): one route, an undoable command, a search source, a file
 * source, a kept background job and one method. It has no page of its own and names no other plugin.
 */
export const probeManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: PROBE_PLUGIN_ID,
  version: PROBE_VERSION,
  name: "Probe",
  summary: "只为测试平台的生命周期：记下几条笔记，可搜索、可在侧栏文件里看到、可撤销。",
  kind: "app",
  publisher: { publisher_id: "molis", signature: "official-probe-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "保存探针的笔记" },
    { permission: PROBE_READ, required: true, reason: "读取探针的笔记" },
    { permission: PROBE_WRITE, required: true, reason: "记下或删掉探针的笔记" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: PROBE_ACTIONS,
  artifacts: { produces: [], consumes: [] },
  routes: [
    { route_id: "probe.notes.list", method: "GET", path: "/notes" },
    { route_id: "probe.notes.create", method: "POST", path: "/notes", max_body_bytes: 16_384 },
  ],
  background: { jobs: [{ job_id: PROBE_KEEP_JOB, reason: "启动时留一个后台作业，停用时由平台收走", permissions: ["storage:private", PROBE_READ] }] },
  methods: probeMethods.map(({ body: _body, ...method }) => ({ ...method, tools: [...method.tools] })),
  ui: { contributions: [] },
};
