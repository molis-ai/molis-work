import { existsSync } from "node:fs";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCallObservation } from "@molis-ai/molis-work-contracts/services/connector-host";
import { homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { hostLog } from "../host-log.js";
import { ASSISTANT_STORE_NAME, AssistantStore } from "./assistant-store.js";
import { assistantWords } from "./assistant-saved-text.js";

/**
 * The Assistant's side of a connection's notices (ASC-53, ASC-58): the connection code says when one of the person's connections needs
 * them and when that is over; the notices are the Assistant's own rows, written only here. One problem of one connection version is one
 * notice: its dedupe key is `connection:<id>:<revision>:<class>:<failing_since>`, so the same run never raises twice, whatever the person
 * did with it ("知道了" included), and a new run after the problem was over raises again.
 */

export type ConnectionFailureClass = NonNullable<ConnectorCallObservation["failure_class"]>;

/**
 * A settings address a connection notice may carry: a path on this origin under `/settings/`, plain characters only (no scheme or host,
 * no `//`, `\`, `..`, fragment or control or space character). Anything else is not written; the notice is raised without a way to open it.
 */
export function connectionSettingsPathAllowed(path: string): boolean {
  return /^\/settings\/[a-z][a-z-]{0,40}(\?[A-Za-z0-9_.~%&=-]{0,400})?$/.test(path);
}

const dedupePrefix = (connectionId: string) => `connection:${connectionId}:`;

function withAssistantNotices<T>(home: string, create: boolean, run: (store: AssistantStore) => T): T | undefined {
  // Settling needs no Assistant library; one is made only to raise a notice.
  if (!create && !existsSync(homeSqlitePath(home, ASSISTANT_STORE_NAME))) return undefined;
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  try { return run(new AssistantStore(db)); } finally { db.close(); }
}

export interface ConnectionNoticeInput {
  connection_id: string;
  revision: string;
  failure_class: ConnectionFailureClass;
  failing_since: string;
  /** The connection's name as the person gave it. */
  name: string;
  settings_path: string;
}

/**
 * Raise the notice for one run of failures, once. A notice of an older version of the same connection is settled first: the version
 * changed, so that problem is no longer the one shown. Never throws: a notice the Assistant cannot write leaves the connection's own work as it was.
 */
export function raiseConnectionNotice(home: string, input: ConnectionNoticeInput): boolean {
  try {
    const path = connectionSettingsPathAllowed(input.settings_path) ? input.settings_path : undefined;
    if (!path) hostLog.warn("connections", "notice_settings_path_refused", undefined, { connection_id: input.connection_id });
    const version = `${dedupePrefix(input.connection_id)}${input.revision}:`;
    return withAssistantNotices(home, true, store => {
      store.settleNoticesByDedupe(LOCAL_PERSON_ACTOR_ID, dedupePrefix(input.connection_id), "resolved", version);
      return store.raiseNotice(LOCAL_PERSON_ACTOR_ID, { kind: "connection", work_id: "", work_title: input.name,
        text: assistantWords(`workbench.assistant-connection.${input.failure_class}`, { name: input.name }), ...(path ? { settings_path: path } : {}) },
      `${version}${input.failure_class}:${input.failing_since}`) !== null;
    }) ?? false;
  } catch (error) {
    hostLog.warn("connections", "notice_unwritten", error, { connection_id: input.connection_id });
    return false;
  }
}

/**
 * The problem is over (a use or a check went through, the connection was reconnected, its key replaced, disabled, disconnected or
 * removed): its open notices are settled. `keepRevision` leaves those of that version, for a run that is still going.
 */
export function settleConnectionNotices(home: string, connectionId: string, keepRevision?: string): void {
  try {
    withAssistantNotices(home, false, store => store.settleNoticesByDedupe(LOCAL_PERSON_ACTOR_ID, dedupePrefix(connectionId), "resolved",
      keepRevision === undefined ? undefined : `${dedupePrefix(connectionId)}${keepRevision}:`));
  } catch (error) { hostLog.warn("connections", "notice_unsettled", error, { connection_id: connectionId }); }
}
