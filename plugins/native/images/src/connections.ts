import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PersonSettingDeclaration, PluginPersonSettingsClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ImageConnection } from "./contract.js";
import { imagesErrors } from "./error.js";

/** One image service as the person set it up: no key (that is the Host's connection), and a binding change still under way. */
export type StoredConnection = Pick<ImageConnection, "id" | "name" | "model" | "api_format" | "base_url" | "created_at" | "updated_at"> & {
  change?: { authId: string | null };
};

/**
 * The person's image services follow the person, not the partition (specs/unified-partition-plugins §4.2 第 4 条, batch 108): one
 * `person_settings` key, kept in the Home for this installation and never synced (it names a connection of this machine). Every partition
 * Images is enabled in sees the same services; the jobs and pictures stay in each partition's own library.
 */
export const IMAGES_CONNECTIONS_SETTING = "connections";
export const IMAGES_PERSON_SETTINGS: readonly PersonSettingDeclaration[] = [{ key: IMAGES_CONNECTIONS_SETTING, kind: "connection_ref" }];
const LIMIT = 20;

/**
 * Reads and writes the services through `services.personSettings`, which answers only the person and this installation's own background
 * (S-person-settings-private). A generation an Agent or a workflow starts still needs its service's address and model: those come from the
 * last list this instance read for the person or itself (`known`), so such a caller is given none of the settings, only the job they start.
 */
export class ImagesConnections {
  private known: StoredConnection[] = [];

  constructor(private readonly settings: PluginPersonSettingsClient) {}

  /** The services, read again for the person or this instance; refused for anyone else. */
  list(): StoredConnection[] {
    const record = this.settings.get(IMAGES_CONNECTIONS_SETTING);
    this.known = record === null ? [] : parse(record.value);
    return this.known.map(connection => ({ ...connection }));
  }

  /** The services this instance last read, for a caller that may not read them (an Agent's generation). */
  remembered(): StoredConnection[] { return this.known.map(connection => ({ ...connection })); }

  /** The service by id: read again when the caller may, otherwise as last read. */
  get(id: string, fresh: boolean): StoredConnection | null {
    return (fresh ? this.list() : this.remembered()).find(connection => connection.id === id) ?? null;
  }

  /** Read whether the caller may, as `get` does: a refusal only means the remembered list is used. */
  tryList(): StoredConnection[] {
    try { return this.list(); } catch (error) {
      if (error instanceof ActionError && error.code === "actions.forbidden") return this.remembered();
      throw error;
    }
  }

  /**
   * Several changes to the list as one write of the setting, refused when another wrote it in between (`actions.conflict`): a service and the
   * account change planned with it are kept together or not at all, as one transaction kept them when they were rows.
   */
  batch<T>(apply: (changes: ImagesConnectionChanges) => T): T {
    const record = this.settings.get(IMAGES_CONNECTIONS_SETTING);
    let next = record === null ? [] : parse(record.value), changed = false;
    const edit = (change: (list: StoredConnection[]) => StoredConnection[]) => {
      next = change(next);
      changed = true;
    };
    const result = apply({
      save: connection => edit(list => {
        const kept = list.find(item => item.id === connection.id);
        return kept ? list.map(item => item.id === connection.id ? { ...connection, ...(item.change ? { change: item.change } : {}) } : item) : [...list, connection];
      }),
      planChange: (id, authId) => edit(list => list.map(item => item.id === id ? { ...item, change: { authId } } : item)),
      finishChange: id => edit(list => list.map(item => item.id === id ? withoutChange(item) : item)),
      delete: id => edit(list => {
        if (!list.some(item => item.id === id)) throw imagesErrors.not_found("找不到要删除的生图服务。");
        return list.filter(item => item.id !== id);
      }),
    });
    if (!changed) return result;
    if (next.length > LIMIT) throw imagesErrors.invalid(`最多保存 ${LIMIT} 个生图服务。`);
    this.settings.set(IMAGES_CONNECTIONS_SETTING, { services: next }, { expected_revision: record?.revision ?? null });
    this.known = next.map(connection => ({ ...connection }));
    return result;
  }
}

/** The changes one `batch` makes to the person's services before its one write. */
export interface ImagesConnectionChanges {
  save(connection: StoredConnection): void;
  planChange(id: string, authId: string | null): void;
  finishChange(id: string): void;
  delete(id: string): void;
}

function withoutChange(connection: StoredConnection): StoredConnection {
  const { change: _change, ...rest } = connection;
  return rest;
}

/** What the setting holds, checked as Images checks its own input: anything else reads as no services. */
function parse(value: unknown): StoredConnection[] {
  const services = value && typeof value === "object" && Array.isArray((value as { services?: unknown }).services) ? (value as { services: unknown[] }).services : [];
  return services.flatMap(item => {
    const row = item as Record<string, unknown>;
    if (!row || typeof row !== "object" || [row.id, row.name, row.base_url, row.model, row.created_at, row.updated_at].some(field => typeof field !== "string")
      || (row.api_format !== "openai-images" && row.api_format !== "gemini")) return [];
    const change = row.change as { authId?: unknown } | undefined;
    return [{ id: String(row.id), name: String(row.name), api_format: row.api_format, base_url: String(row.base_url), model: String(row.model),
      created_at: String(row.created_at), updated_at: String(row.updated_at),
      ...(change && typeof change === "object" && (change.authId === null || typeof change.authId === "string") ? { change: { authId: change.authId as string | null } } : {}) }];
  });
}
