import { defineWorkExecutorActions } from "@molis-ai/molis-work-plugin-sdk";
import type { ActionDefinition, WorkExecutorActionOptions } from "@molis-ai/molis-work-contracts/platform/actions";

const role = (name: string, title: string, description: string, permissions: readonly string[], more: Pick<WorkExecutorActionOptions, "version"> & Partial<WorkExecutorActionOptions>): WorkExecutorActionOptions =>
  ({ capability_id: `coding.executor.${name}`, title, description, permissions, subject_kinds: ["coding_session"], ...more });

function localized<I, O>(definition: ActionDefinition<I, O>, titleKey: string, descriptionKey: string): ActionDefinition<I, O> {
  return { ...definition, action: { ...definition.action, title_text: { key: titleKey }, description_text: { key: descriptionKey } } };
}

/**
 * Coding as an executor the Assistant may hand a work to (PG-036): the six roles of the work-executor protocol, open to the local person
 * only. They answer from the code Coding's page runs (`executor.ts`), so a session opened here is one the page shows, with the same settings.
 */
const rawExecutorActions = defineWorkExecutorActions({
  state: role("state", "Coding 执行方概况", "Coding 接手一项工作时可选的方式、当前工作目录与可用的 MCP 服务", ["artifact:read"], { version: /* @version action.coding.executor.state */ 1 }),
  "session.open": role("session.open", "为工作新建编码会话", "新建一个编码会话，可同时选定下一轮的方式；第一轮开始前不调用模型", ["storage:private"], { version: /* @version action.coding.executor.session.open */ 1 }),
  "session.read": role("session.read", "读取工作的编码会话", "读取会话、下一轮的方式、最近几轮执行，以及要先在 Coding 页面核对的中断", ["artifact:read"], { version: /* @version action.coding.executor.session.read */ 1 }),
  "session.update": role("session.update", "改编码会话的方式", "改会话下一轮的方式；Coding 页面显示同一个选择", ["storage:private"], { version: /* @version action.coding.executor.session.update */ 1 }),
  // A long session may first have the round's own model write a digest of its earlier rounds: that wait runs beside the project's queue.
  "run.start": role("run.start", "为工作开始一轮编码", "按会话自己的设置（没有就用 Coding 的默认）在已授权的工作目录开始一轮；写操作仍经审查",
    ["artifact:read", "storage:private"], { version: /* @version action.coding.executor.run.start */ 1, scheduling: "concurrent", execution: { cost: "metered" } }),
  "run.control": role("run.control", "控制工作的编码轮次", "回答提问、补充或撤回补充、暂停、继续或停止正在进行的一轮", [], { version: /* @version action.coding.executor.run.control */ 1 }),
});

export const codingExecutorActions = {
  state: localized(rawExecutorActions.state, "coding.action.executor-state.title", "coding.action.executor-state.description"),
  "session.open": localized(rawExecutorActions["session.open"], "coding.action.executor-session-open.title", "coding.action.executor-session-open.description"),
  "session.read": localized(rawExecutorActions["session.read"], "coding.action.executor-session-read.title", "coding.action.executor-session-read.description"),
  "session.update": localized(rawExecutorActions["session.update"], "coding.action.executor-session-update.title", "coding.action.executor-session-update.description"),
  "run.start": localized(rawExecutorActions["run.start"], "coding.action.executor-run-start.title", "coding.action.executor-run-start.description"),
  "run.control": localized(rawExecutorActions["run.control"], "coding.action.executor-run-control.title", "coding.action.executor-run-control.description"),
} as const;
