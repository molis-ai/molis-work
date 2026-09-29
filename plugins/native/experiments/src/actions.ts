import { ActionError, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema, bindSearchEntriesHandler, defineSearchEntriesAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ExperimentsService } from "./service.js";
import type { Experiment, ExperimentInput, Participant, TaskDefinition } from "./types.js";
import { summarize } from "./metrics.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1, maxLength: 200 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const listRow = object({ id, name: text, status: { enum: ["ready", "running", "completed", "cancelled", "interrupted"] }, created_at: text, hash: text });
const experiment = { type: "object", required: ["id", "name", "status", "task", "cases", "participants", "cells", "reviews"] };
const summary = { type: "array", items: { type: "object", required: ["participant_id", "total", "valid", "failed"] } };
const read = ["experiments:read"], write = ["experiments:write"];
/** Participants name local executables and weights, so configuring and running experiments stays with the person at this computer. */
const LOCAL: readonly ActionAudience[] = ["user"];
const SHARED: readonly ActionAudience[] = ["user", "workflow", "agent", "mcp"];

function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[] = LOCAL): ActionDefinition<I, O> {
  return { capability_id: `experiments.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "home", audiences, permissions, subject_kinds: ["experiment"], input_schema: input, output_schema: output } };
}

export type ExperimentSummary = ReturnType<typeof summarize>;
export interface ExperimentModelsView {
  participants: Participant[]; saved_ids: string[]; status: { id: string; configured: boolean; note: string }[];
  connections: unknown[]; selected_connection_id?: string;
}
export interface ExperimentFunctionChoice { id: string; name: string; function_key: string; version: number | null; model: string; instructions: string; criteria: unknown; config_hash: string }
export const experimentsActions = {
  list: define<Record<string, never>, { experiments: ReturnType<ExperimentsService["list"]> }>("list", "实验列表", "列出个人的模型对比实验及状态", "query", object({}),
    object({ experiments: { type: "array", items: listRow } }), read, SHARED),
  results: define<{ id: string }, { id: string; name: string; status: Experiment["status"]; summary: ExperimentSummary }>("results", "实验结果汇总",
    "读取一场实验按参试组汇总的准确率、失败、耗时与成本；不含材料原文与本机路径", "query", object({ id }),
    object({ id, name: text, status: text, summary }), read, SHARED),
  get: define<{ id: string }, { experiment: Experiment; summary: ExperimentSummary }>("get", "读取实验", "读取实验快照、每格答案与复核记录", "query", object({ id }),
    object({ experiment, summary }), read),
  create: define<ExperimentInput & { function_id?: string }, { experiment: Experiment }>("create", "新建实验",
    "冻结任务、材料与参试组为一次性快照；引用判断函数时由系统读取其当前定义", "command",
    { type: "object", properties: { name: text, task: { type: "object" }, cases: { type: "array" }, participants: { type: "array" }, function_id: id }, required: ["name", "cases", "participants"] },
    object({ experiment }), write),
  delete: define<{ id: string }, { deleted: true }>("delete", "删除实验", "删除已停止的实验快照", "command", object({ id }), object({ deleted: { const: true } }), write),
  run: define<{ id: string }, { experiment: Experiment }>("run", "运行实验", "按快照调用各参试模型一次；运行中可取消，不自动重试", "command", object({ id }),
    object({ experiment }), [...write, "model:invoke"]),
  cancel: define<{ id: string }, { experiment: Experiment }>("cancel", "取消实验", "取消正在运行的实验，已完成的格子保留", "command", object({ id }), object({ experiment }), write),
  review: define<{ id: string; case_id: string; reference: string; note: string }, { experiment: Experiment }>("review", "人工复核", "为一条材料记录人工参考答案及依据",
    "command", object({ id, case_id: id, reference: id, note: text }), object({ experiment }), write),
  models: define<Record<string, never>, ExperimentModelsView>("participants.list", "参试配置", "读取已保存与默认的参试配置、本机可用状态与 TypeSafe 连接选择",
    "query", object({}), { type: "object", required: ["participants", "saved_ids", "status", "connections"] }, read),
  saveModel: define<Participant, { participant: Participant }>("participants.save", "保存参试配置", "保存一份参试模型配置，含本机运行程序与权重路径",
    "command", { type: "object", required: ["id", "name", "kind", "model"] }, object({ participant: { type: "object" } }), write),
  deleteModel: define<{ id: string }, { deleted: true }>("participants.delete", "删除参试配置", "删除一份已保存的参试配置", "command", object({ id }), object({ deleted: { const: true } }), write),
  selectConnection: define<{ connection_id: string }, { saved: true }>("connection.select", "选择 TypeSafe 连接", "选择 Jev 参试组使用的 TypeSafe 连接", "command",
    object({ connection_id: id }), object({ saved: { const: true } }), write),
  functions: define<Record<string, never>, { functions: ExperimentFunctionChoice[] }>("functions.list", "可对比的判断函数", "列出可冻结为实验任务的 Choice 判断函数（含草稿）",
    "query", object({}), object({ functions: { type: "array", items: { type: "object", required: ["id", "name"] } } }), [...read, "functions:manage"]),
  /** System search: experiments by name and state. Materials and answers stay in the experiment (they can be sensitive test data). */
  searchEntries: defineSearchEntriesAction("experiments.search.entries", [{ kind: "experiment", title: "实验", surface: "experiments" }], "实验", read, "home"),
};
export const EXPERIMENTS_ACTIONS: readonly ActionDefinition[] = Object.values(experimentsActions);
export const EXPERIMENTS_ACTION_PERMISSIONS = [...new Set(EXPERIMENTS_ACTIONS.flatMap(definition => definition.action.permissions))];

/** The Host binds the Home's experiment store, executor status and the system judgment service. */
export interface ExperimentsActionPorts {
  service(): ExperimentsService;
  models(): ExperimentModelsView;
  selectConnection(connectionId: string): void;
  /** Reads through the system judgment actions with this caller's own authority. */
  choiceFunctions(caller: ActionCallContext): Promise<ExperimentFunctionChoice[]>;
}

export function createExperimentsActionHandlers(ports: ExperimentsActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller),
  });
  const service = () => ports.service();
  return [
    bind(experimentsActions.list, () => ({ experiments: service().list() })),
    bind(experimentsActions.results, input => { const e = service().get(input.id); return { id: e.id, name: e.name, status: e.status, summary: summarize(e) }; }),
    bind(experimentsActions.get, input => { const e = service().get(input.id); return { experiment: e, summary: summarize(e) }; }),
    bind(experimentsActions.create, async (input, caller) => {
      const { function_id, ...rest } = input;
      let frozen: ExperimentInput = rest;
      if (function_id) {
        const chosen = (await ports.choiceFunctions(caller)).find(item => item.id === function_id);
        if (!chosen) throw new ActionError("experiments.invalid", "首版仅支持 Choice 函数快照");
        frozen = { ...rest, task: { instructions: chosen.instructions, criteria: chosen.criteria as TaskDefinition["criteria"],
          function_snapshot: { id: chosen.id, version: chosen.version, config_hash: chosen.config_hash, model: chosen.model } } };
      } else if (rest.task?.function_snapshot) throw new ActionError("experiments.invalid", "请通过函数选择器引用宿主中的配置快照");
      return { experiment: service().create(frozen) };
    }),
    bind(experimentsActions.delete, input => { service().deleteExperiment(input.id); return { deleted: true as const }; }),
    bind(experimentsActions.run, input => ({ experiment: service().start(input.id) })),
    bind(experimentsActions.cancel, input => ({ experiment: service().cancel(input.id) })),
    bind(experimentsActions.review, input => ({ experiment: service().review(input.id, input.case_id, input.reference, input.note) })),
    bind(experimentsActions.models, () => ports.models()),
    bind(experimentsActions.saveModel, input => ({ participant: service().saveParticipant(input) })),
    bind(experimentsActions.deleteModel, input => { service().deleteParticipant(input.id); return { deleted: true as const }; }),
    bind(experimentsActions.selectConnection, input => { ports.selectConnection(input.connection_id); return { saved: true as const }; }),
    bind(experimentsActions.functions, async (_input, caller) => ({ functions: await ports.choiceFunctions(caller) })),
    bindSearchEntriesHandler(experimentsActions.searchEntries, () => service().list().map(row => ({ subject: { kind: "experiment", id: row.id },
      revision: `${row.hash}:${row.status}`, title: row.name, summary: ({ ready: "待运行", running: "运行中", completed: "已完成", cancelled: "已取消", interrupted: "已中断" } as Record<string, string>)[row.status] ?? row.status,
      updated_at: row.created_at, content: "summary" as const, open: { surface: "experiments", id: row.id } }))),
  ];
}
