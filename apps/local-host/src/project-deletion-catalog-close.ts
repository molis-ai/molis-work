import type { LocalSqliteStorage } from "@molis-ai/molis-work-storage";

/** A failed initializer retains only cleanup of its original connection, never business access or replay. */
export function closeCatalogInitialization(storage: LocalSqliteStorage, failure?: { error: unknown }): void {
  const close = () => { if (storage.db.open) storage.close(); };
  try { close(); }
  catch (error) {
    const reason = failure ? failure.error : error;
    const retained = new AggregateError(failure ? [failure.error, error] : [error], "Catalog 初始化收尾失败；可明确重试关闭原连接", { cause: reason });
    const code = reason instanceof Error ? Object.getOwnPropertyDescriptor(reason, "code") : undefined;
    if (typeof code?.value === "string") Object.defineProperty(retained, "code", { value: code.value });
    Object.defineProperty(retained, "close", { value: async () => { close(); } });
    throw retained;
  }
}
