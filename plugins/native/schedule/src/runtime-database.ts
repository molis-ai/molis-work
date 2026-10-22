import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDatabaseTransaction, PluginNotificationClient, PluginNotificationInput, PluginNotificationReceipt, PluginScheduleClient, PluginScheduleWriter, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleTaskDatabase } from "./tasks.js";
import type { ScheduleJobPort } from "./wakeup.js";
import { scheduleWakeupActions } from "./background-actions.js";

/** Synchronous domain stores borrow the public transaction for exactly one write body. */
export function scheduleRuntimeDatabase(database: PluginDatabase, scheduler: PluginScheduleClient, notifications: PluginNotificationClient) {
  let active: { transaction: PluginDatabaseTransaction; schedule: PluginScheduleWriter; receipts: PluginNotificationReceipt[] } | undefined;
  const current = () => {
    if (!active) throw new ActionError("actions.forbidden", "定时任务写入需要当前插件事务");
    return active;
  };
  const values = (parameters: readonly unknown[]): PluginSqlValue[] => parameters.map(value => {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || value instanceof Uint8Array) return value;
    throw new ActionError("actions.input_invalid", "定时任务 SQL 参数无效");
  });
  const db: ScheduleTaskDatabase = {
    exec: () => { throw new ActionError("actions.forbidden", "定时任务结构只由 Manifest 声明"); },
    prepare: sql => ({
      get: (...parameters) => (active?.transaction ?? database).get(sql, values(parameters)),
      all: (...parameters) => (active?.transaction ?? database).all(sql, values(parameters)),
      run: (...parameters) => current().transaction.run(sql, values(parameters)),
    }),
    transaction: operation => {
      const execute = () => { current(); const result = operation(); requireSynchronous(result); return result; };
      return Object.assign(execute, { immediate: execute });
    },
  };
  const schedule: ScheduleJobPort & { isExecuting(jobId: string): boolean } = {
    get: id => scheduler.get(id), list: () => scheduler.list(), isExecuting: id => scheduler.isExecuting(id),
    cancel: id => current().schedule.cancel(id), setEnabled: (id, enabled) => current().schedule.setEnabled(id, enabled),
    register: input => {
      const action = Object.values(scheduleWakeupActions).find(item => item.capability_id === input.capability_id);
      if (!action) throw new ActionError("actions.forbidden", "定时任务未声明此唤醒");
      const { plugin_id: _owner, capability_id: _capability, ...fields } = input;
      return current().schedule.register({ ...fields, action: { capability_id: action.capability_id, version: action.version } });
    },
  };
  return { db, schedule, notify: (input: PluginNotificationInput) => {
    const write = current(); write.receipts.push(notifications.deliver(write.transaction, input));
  }, async write<T>(beforeEffect: () => Promise<void>, operation: () => T): Promise<T> {
    const committed = await database.transaction(beforeEffect, transaction => scheduler.join(transaction, writer => {
      if (active) throw new ActionError("actions.forbidden", "定时任务事务不能重入");
      const state = { transaction, schedule: writer, receipts: [] as PluginNotificationReceipt[] }; active = state;
      try { const value = operation(); requireSynchronous(value); return { value, receipts: state.receipts }; }
      finally { active = undefined; }
    }));
    for (const receipt of committed.receipts) await receipt.settle();
    return committed.value;
  } };
}
