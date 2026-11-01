import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { randomUUID } from "node:crypto";

import type {
  ConnectorDriver,
  ConnectorHealth,
  ConnectorHostApi,
  ConnectorReceipt,
  ConnectorCallControl,
} from "@molis-ai/molis-work-contracts/services/connector-host";



/** Provider-neutral registry and invocation boundary. Drivers stay in Integration Plugins. */
export class ConnectorHost implements ConnectorHostApi {
  private readonly drivers = new Map<string, ConnectorDriver>();
  private readonly connections = new Map<string, { driver_id: string }>();

  constructor(
    private readonly options: {
      timeoutMs?: number;
      now?: () => Date;
    } = {},
  ) {}

  registerDriver(driver: ConnectorDriver): void {
    assertIdentity(driver.driver_id, "connector.driver_missing");
    const current = this.drivers.get(driver.driver_id);
    if (current && current !== driver) {
      throw connectorErrors["connector.driver_duplicate"]("同一个 Connector Driver 不能重复注册");
    }
    this.drivers.set(driver.driver_id, driver);
  }

  connect(input: { connection_id: string; driver_id: string }): void {
    assertIdentity(input.connection_id, "connector.connection_missing");
    if (!this.drivers.has(input.driver_id)) {
      throw connectorErrors["connector.driver_missing"]("找不到 Connector Driver");
    }
    this.connections.set(input.connection_id, { driver_id: input.driver_id });
  }

  async test(connectionId: string, control: ConnectorCallControl): Promise<ConnectorHealth> {
    const driver = this.driverFor(connectionId);
    try {
      const result = await withTimeout(
        call => driver.health(call), control,
        this.options.timeoutMs ?? 15_000,
        () => connectorErrors["connector.timeout"]("Connector 健康检查超时"),
      );
      await control.beforeEffect(); control.current();
      return result;
    } catch (error) {
      control.current();
      if ((error instanceof ActionError && ["connector.driver_missing","connector.driver_duplicate","connector.connection_missing","connector.timeout","connector.invocation_failed"].includes(error.code))) throw error;
      throw connectorErrors["connector.invocation_failed"]("Connector 健康检查没有取得可信结果");
    }
  }

  async invoke(input: {
    connection_id: string;
    cursor: unknown;
    intent?: Record<string, unknown>;
  }, control: ConnectorCallControl): Promise<ConnectorReceipt> {
    const connection = this.connections.get(input.connection_id);
    if (!connection) {
      throw connectorErrors["connector.connection_missing"]("Connector Connection 不存在或已撤销");
    }
    const driver = this.driverFor(input.connection_id);
    const startedAt = this.now().toISOString();
    try {
      const result = await withTimeout(
        call => driver.poll({ cursor: structuredClone(input.cursor), intent: structuredClone(input.intent ?? {}) }, call), control,
        this.options.timeoutMs ?? 15_000,
        () => connectorErrors["connector.timeout"]("Connector 调用超时"),
      );
      await control.beforeEffect(); control.current();
      if (result.ok) {
        for (const event of result.events) assertRawEvent(event);
      }
      return {
        receipt_id: `connector-receipt-${randomUUID()}`,
        connection_id: input.connection_id,
        driver_id: connection.driver_id,
        started_at: startedAt,
        completed_at: this.now().toISOString(),
        result: structuredClone(result),
      };
    } catch (error) {
      control.current();
      if ((error instanceof ActionError && ["connector.driver_missing","connector.driver_duplicate","connector.connection_missing","connector.timeout","connector.invocation_failed"].includes(error.code))) throw error;
      throw connectorErrors["connector.invocation_failed"]("Connector 调用没有取得可信结果");
    }
  }

  revoke(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  private driverFor(connectionId: string): ConnectorDriver {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw connectorErrors["connector.connection_missing"]("Connector Connection 不存在或已撤销");
    }
    const driver = this.drivers.get(connection.driver_id);
    if (!driver) throw connectorErrors["connector.driver_missing"]("找不到 Connector Driver");
    return driver;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function assertIdentity(
  value: string,
  code: "connector.driver_missing" | "connector.connection_missing",
): void {
  if (!value.trim() || value.length > 200) throw connectorErrors[code]("Connector 身份不合法");
}

function assertRawEvent(event: {
  raw_event_id: string;
  provider_dedupe_id: string;
  occurred_at: string;
  observed_at: string;
  payload: Record<string, unknown>;
}): void {
  if (
    !event.raw_event_id.trim()
    || !event.provider_dedupe_id.trim()
    || !Number.isFinite(Date.parse(event.occurred_at))
    || !Number.isFinite(Date.parse(event.observed_at))
    || !event.payload
    || typeof event.payload !== "object"
    || Array.isArray(event.payload)
  ) {
    throw connectorErrors["connector.invocation_failed"]("Connector 返回的 Raw Event 不符合公开 Contract");
  }
}

async function withTimeout<T>(
  operation: (control: ConnectorCallControl) => Promise<T>,
  parent: ConnectorCallControl,
  timeoutMs: number,
  timeoutError: () => Error,
): Promise<T> {
  const ended = new AbortController(), signal = AbortSignal.any([parent.signal, ended.signal]);
  const current = () => { signal.throwIfAborted(); parent.current(); signal.throwIfAborted(); };
  const control = { signal, current, beforeEffect: async () => { current(); await parent.beforeEffect(); current(); } };
  current();
  const task = Promise.resolve().then(async () => { await control.beforeEffect(); current(); return operation(control); });
  let abort!: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => { abort = () => reject(signal.reason); signal.addEventListener("abort", abort, { once: true }); });
  const timer = setTimeout(() => ended.abort(timeoutError()), timeoutMs);
  try {
    return await Promise.race([task, cancelled]);
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", abort); ended.abort();
  }
}

export { ConnectorConnectionStore, CONNECTOR_CONNECTIONS_SCHEMA, forgetPluginBindings, normalizeConnectorTokenInput } from "./connection-store.js";
export type { ConnectorBindingKey, ConnectorConnectionSecrets, ConnectorTokenInput } from "./connection-store.js";
export type { ConnectorConnectionDeclarer } from "./connection-declarers.js";
export { parsePluginBindingScope, pluginBindingErrors, pluginBindingScope, type PluginBindingTarget } from "./plugin-binding-scopes.js";

export * from "./protocol-store.js";
export * from "./connection-observations.js";
