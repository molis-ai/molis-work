import type { DatabaseSync } from "node:sqlite";
import type { ConnectorCheckObservation, ConnectorCallObservation, ConnectorObservations } from "@molis-ai/molis-work-contracts/services/connector-host";
export type { ConnectorCheckObservation, ConnectorCallObservation, ConnectorObservations } from "@molis-ai/molis-work-contracts/services/connector-host";

/** Latest technical facts, not configuration, grants, request bodies or business results. */
export const CONNECTOR_OBSERVATIONS_SCHEMA = `
  CREATE TABLE connector_observations (
    connection_id TEXT PRIMARY KEY,
    check_json TEXT,
    call_json TEXT
  );
`;

export class ConnectorObservationStore {
  constructor(private readonly db: Pick<DatabaseSync, "prepare">) {}
  read(id: string): ConnectorObservations {
    const row = this.db.prepare("SELECT check_json,call_json FROM connector_observations WHERE connection_id=?").get(id) as { check_json: string | null; call_json: string | null } | undefined;
    return { ...(row?.check_json ? { check: JSON.parse(row.check_json) as ConnectorCheckObservation } : {}),
      ...(row?.call_json ? { call: JSON.parse(row.call_json) as ConnectorCallObservation } : {}) };
  }
  check(id: string, value: ConnectorCheckObservation): void {
    this.db.prepare("INSERT INTO connector_observations(connection_id,check_json) VALUES (?,?) ON CONFLICT(connection_id) DO UPDATE SET check_json=excluded.check_json").run(id, JSON.stringify(value));
  }
  call(id: string, value: ConnectorCallObservation): void {
    this.db.prepare("INSERT INTO connector_observations(connection_id,call_json) VALUES (?,?) ON CONFLICT(connection_id) DO UPDATE SET call_json=excluded.call_json").run(id, JSON.stringify(value));
  }
}
